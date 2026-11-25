// family-admin: the only place accounts, roles and family membership are created.
// Uses the service-role key server-side (never shipped to the browser).
//
// Public actions (no login; protected by a secret code):
//   bootstrap       - create a new family + its first parent (needs SETUP_CODE)
//   accept_invite   - join an existing family as a parent or gift buyer (needs a single-use invite code)
// Parent-only actions (must be signed in as a parent):
//   create_invite, create_child, reset_child_pin, list_children

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SETUP_CODE = Deno.env.get("SETUP_CODE") ?? "";
const CHILD_EMAIL_DOMAIN = Deno.env.get("CHILD_EMAIL_DOMAIN") ?? "children.giftlist.test";

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Invite codes: 12 characters from an alphabet without look-alike characters (about 59 bits)
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 31 characters
function randomInviteCode(): string {
  const out: string[] = [];
  while (out.length < 12) {
    const bytes = crypto.getRandomValues(new Uint8Array(24));
    for (const b of bytes) {
      if (b < 248 && out.length < 12) out.push(CODE_ALPHABET[b % 31]); // 248 = 31 * 8, avoids modulo bias
    }
  }
  const s = out.join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}
const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, "");

function randomDigits(len: number): string {
  const bytes = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(bytes, (n) => String(n % 10)).join("");
}

function str(v: unknown, min: number, max: number, field: string): string {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required`);
  const t = v.trim();
  if (t.length < min || t.length > max) {
    throw new HttpError(400, `${field} must be between ${min} and ${max} characters`);
  }
  return t;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function email(v: unknown): string {
  const e = str(v, 3, 254, "email").toLowerCase();
  if (!EMAIL_RE.test(e)) throw new HttpError(400, "Please enter a valid email address");
  return e;
}
function password(v: unknown): string {
  if (typeof v !== "string" || v.length < 8 || v.length > 72) {
    throw new HttpError(400, "Password must be between 8 and 72 characters");
  }
  return v;
}
function pinOrGenerate(v: unknown): string {
  if (v === undefined || v === null || v === "") return randomDigits(6);
  if (typeof v !== "string" || !/^\d{6}$/.test(v)) throw new HttpError(400, "PIN must be exactly 6 digits");
  return v;
}

type Profile = { id: string; family_id: string; role: string; display_name: string };

async function requireParent(req: Request): Promise<Profile> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  const { data: profile } = await admin
    .from("profiles")
    .select("id, family_id, role, display_name")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile || profile.role !== "parent") throw new HttpError(403, "Only parents can do this");
  return profile as Profile;
}

// Creates the auth user, then its profile. If the profile fails, the auth user is removed again.
async function createMember(opts: {
  email: string;
  password: string;
  familyId: string;
  displayName: string;
  role: "parent" | "child" | "gift_buyer";
}): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    const exists = error?.code === "email_exists" || error?.status === 422;
    if (exists) throw new HttpError(409, "An account with that login already exists");
    console.error("createUser failed", error);
    throw new HttpError(400, error?.message ?? "Could not create account");
  }
  const userId = data.user.id;
  const { error: pErr } = await admin.from("profiles").insert({
    id: userId,
    family_id: opts.familyId,
    display_name: opts.displayName,
    role: opts.role,
  });
  if (pErr) {
    console.error("profile insert failed", pErr);
    await admin.auth.admin.deleteUser(userId);
    throw new HttpError(500, "Could not create profile");
  }
  return userId;
}

async function usernameOf(userId: string): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(userId);
  return (data.user?.email ?? "").split("@")[0];
}

// ---------- actions ----------

async function bootstrap(body: Record<string, unknown>) {
  if (!SETUP_CODE) throw new HttpError(500, "Setup is not configured yet");
  const provided = typeof body.setup_code === "string" ? body.setup_code : "";
  const [a, b] = await Promise.all([sha256(provided), sha256(SETUP_CODE)]);
  if (a !== b) {
    await sleep(600);
    throw new HttpError(403, "Invalid setup code");
  }
  const familyName = str(body.family_name, 1, 100, "family_name");
  const displayName = str(body.display_name, 1, 60, "display_name");
  const em = email(body.email);
  const pw = password(body.password);

  const { data: fam, error } = await admin.from("families").insert({ name: familyName }).select("id").single();
  if (error || !fam) {
    console.error("family insert failed", error);
    throw new HttpError(500, "Could not create family");
  }
  try {
    await createMember({ email: em, password: pw, familyId: fam.id, displayName, role: "parent" });
  } catch (e) {
    await admin.from("families").delete().eq("id", fam.id);
    throw e;
  }
  return { ok: true };
}

async function acceptInvite(body: Record<string, unknown>) {
  const code = normalizeCode(str(body.code, 4, 40, "code"));
  const displayName = str(body.display_name, 1, 60, "display_name");
  const em = email(body.email);
  const pw = password(body.password);
  const codeHash = await sha256(code);
  const now = new Date().toISOString();

  // Claim the invite atomically so a code can only ever be used once
  const { data: claimed } = await admin
    .from("invites")
    .update({ used_at: now })
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .gt("expires_at", now)
    .select("id, family_id, role")
    .maybeSingle();
  if (!claimed) {
    await sleep(600);
    throw new HttpError(400, "That invite code is invalid, expired, or already used");
  }
  try {
    await createMember({
      email: em,
      password: pw,
      familyId: claimed.family_id,
      displayName,
      role: claimed.role,
    });
  } catch (e) {
    await admin.from("invites").update({ used_at: null }).eq("id", claimed.id); // let them retry
    throw e;
  }
  return { ok: true };
}

async function createInvite(req: Request, body: Record<string, unknown>) {
  const parent = await requireParent(req);
  const role = body.role;
  if (role !== "parent" && role !== "gift_buyer") {
    throw new HttpError(400, "role must be 'parent' or 'gift_buyer'");
  }
  const code = randomInviteCode();
  const { data, error } = await admin
    .from("invites")
    .insert({
      family_id: parent.family_id,
      role,
      code_hash: await sha256(normalizeCode(code)),
      created_by: parent.id,
    })
    .select("expires_at")
    .single();
  if (error || !data) {
    console.error("invite insert failed", error);
    throw new HttpError(500, "Could not create invite");
  }
  return { code, role, expires_at: data.expires_at };
}

async function createChild(req: Request, body: Record<string, unknown>) {
  const parent = await requireParent(req);
  const displayName = str(body.display_name, 1, 60, "display_name");
  const pin = pinOrGenerate(body.pin);
  const base = displayName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "kid";

  for (let attempt = 0; attempt < 6; attempt++) {
    const username = `${base}${randomDigits(4)}`;
    try {
      const id = await createMember({
        email: `${username}@${CHILD_EMAIL_DOMAIN}`,
        password: pin,
        familyId: parent.family_id,
        displayName,
        role: "child",
      });
      return { id, display_name: displayName, username, pin };
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) continue; // username taken, try another
      throw e;
    }
  }
  throw new HttpError(500, "Could not generate a unique username, please try again");
}

async function resetChildPin(req: Request, body: Record<string, unknown>) {
  const parent = await requireParent(req);
  const childId = str(body.child_id, 36, 36, "child_id");
  const pin = pinOrGenerate(body.pin);
  const { data: child } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("id", childId)
    .eq("family_id", parent.family_id)
    .eq("role", "child")
    .maybeSingle();
  if (!child) throw new HttpError(404, "Child not found in your family");
  const { error } = await admin.auth.admin.updateUserById(childId, { password: pin });
  if (error) {
    console.error("pin reset failed", error);
    throw new HttpError(500, "Could not reset PIN");
  }
  return { id: child.id, display_name: child.display_name, username: await usernameOf(childId), pin };
}

async function listChildren(req: Request) {
  const parent = await requireParent(req);
  const { data: kids } = await admin
    .from("profiles")
    .select("id, display_name")
    .eq("family_id", parent.family_id)
    .eq("role", "child")
    .order("display_name");
  const children = await Promise.all(
    (kids ?? []).map(async (k) => ({ id: k.id, display_name: k.display_name, username: await usernameOf(k.id) })),
  );
  return { children };
}

// ---------- router ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const raw = await req.json().catch(() => null);
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    switch (body.action) {
      case "bootstrap":
        return json(await bootstrap(body));
      case "accept_invite":
        return json(await acceptInvite(body));
      case "create_invite":
        return json(await createInvite(req, body));
      case "create_child":
        return json(await createChild(req, body));
      case "reset_child_pin":
        return json(await resetChildPin(req, body));
      case "list_children":
        return json(await listChildren(req));
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
});
