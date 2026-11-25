// family-admin (personal-link edition): each person opens their own private link; no passwords or PINs.
// Links hold a long random token (stored only as a hash). A valid link mints a normal session.
//
// Public:  bootstrap (needs SETUP_CODE), owner_login (needs SETUP_CODE), link_login
// Owner-only (the first parent, i.e. mom): add_person, reset_link, list_people

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SETUP_CODE = Deno.env.get("SETUP_CODE") ?? "";
const EMAIL_DOMAIN = Deno.env.get("CHILD_EMAIL_DOMAIN") ?? "children.giftlist.test";

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
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

const sha256 = async (text: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
const newToken = () => hex(crypto.getRandomValues(new Uint8Array(24)).buffer); // 192 bits

function str(v: unknown, min: number, max: number, field: string) {
  if (typeof v !== "string") throw new HttpError(400, `${field} is required`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw new HttpError(400, `${field} must be between ${min} and ${max} characters`);
  return t;
}
async function checkSetupCode(v: unknown) {
  if (!SETUP_CODE) throw new HttpError(500, "Setup is not configured yet");
  const given = typeof v === "string" ? v : "";
  if ((await sha256(given)) !== (await sha256(SETUP_CODE))) { await sleep(600); throw new HttpError(403, "Invalid setup code"); }
}

type Profile = { id: string; family_id: string; role: string; display_name: string };

async function requireOwner(req: Request): Promise<Profile> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "Not signed in");
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "Not signed in");
  const { data: me } = await admin.from("profiles").select("id, family_id, role, display_name").eq("id", data.user.id).maybeSingle();
  if (!me || me.role !== "parent") throw new HttpError(403, "Only the owner can do this");
  // The owner is the first parent created in this group
  const { data: first } = await admin.from("profiles").select("id").eq("family_id", me.family_id).eq("role", "parent")
    .order("created_at", { ascending: true }).limit(1).single();
  if (first?.id !== me.id) throw new HttpError(403, "Only the owner can do this");
  return me as Profile;
}

// Creates a session the browser can pick up with verifyOtp
async function mintSession(userId: string) {
  const { data: u } = await admin.auth.admin.getUserById(userId);
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user!.email! });
  if (error || !link?.properties?.hashed_token) { console.error("generateLink failed", error); throw new HttpError(500, "Could not sign in"); }
  return { token_hash: link.properties.hashed_token };
}

async function setLink(userId: string, token: string) {
  const { error } = await admin.from("access_links").upsert({ user_id: userId, token_hash: await sha256(token) }, { onConflict: "user_id" });
  if (error) { console.error("link store failed", error); throw new HttpError(500, "Could not save link"); }
}

async function createPerson(familyId: string, name: string, role: "parent" | "child" | "gift_buyer") {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${crypto.randomUUID()}@${EMAIL_DOMAIN}`,
    password: crypto.randomUUID() + crypto.randomUUID(), // never used
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error("createUser failed", error);
    throw new HttpError(400, error?.message ?? "Could not create account");
  }
  const id = data.user.id;
  try {
    const { error: pErr } = await admin.from("profiles").insert({ id, family_id: familyId, display_name: name, role });
    if (pErr) { console.error("profile insert failed", pErr); throw new HttpError(500, "Could not create profile"); }
    const token = newToken();
    await setLink(id, token);
    return { id, token };
  } catch (e) {
    await admin.auth.admin.deleteUser(id);
    throw e;
  }
}

// ---------- actions ----------

async function bootstrap(body: Record<string, unknown>) {
  await checkSetupCode(body.setup_code);
  const name = str(body.name, 1, 60, "name");
  const { data: fam, error } = await admin.from("families").insert({ name: "Eli & Jazz Christmas" }).select("id").single();
  if (error || !fam) { console.error("family insert failed", error); throw new HttpError(500, "Could not create the list"); }
  try {
    const { id } = await createPerson(fam.id, name, "parent");
    return await mintSession(id);
  } catch (e) {
    await admin.from("families").delete().eq("id", fam.id);
    throw e;
  }
}

// Lets the owner get back in (e.g. new phone) using the setup code
async function ownerLogin(body: Record<string, unknown>) {
  await checkSetupCode(body.setup_code);
  const { data: owner } = await admin.from("profiles").select("id").eq("role", "parent").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (!owner) throw new HttpError(404, "No owner yet. Use first-time setup.");
  return await mintSession(owner.id);
}

async function linkLogin(body: Record<string, unknown>) {
  const token = str(body.token, 20, 100, "token");
  const { data: row } = await admin.from("access_links").select("user_id").eq("token_hash", await sha256(token)).maybeSingle();
  if (!row) { await sleep(500); throw new HttpError(400, "This link doesn't work anymore. Ask for a new one."); }
  return await mintSession(row.user_id);
}

async function addPerson(req: Request, body: Record<string, unknown>) {
  const owner = await requireOwner(req);
  const name = str(body.name, 1, 60, "name");
  const role = body.role;
  if (role !== "parent" && role !== "gift_buyer" && role !== "child") throw new HttpError(400, "Invalid role");
  const { id, token } = await createPerson(owner.family_id, name, role);
  return { id, name, role, token };
}

async function resetLink(req: Request, body: Record<string, unknown>) {
  const owner = await requireOwner(req);
  const personId = str(body.person_id, 36, 36, "person_id");
  const { data: person } = await admin.from("profiles").select("id, display_name").eq("id", personId).eq("family_id", owner.family_id).maybeSingle();
  if (!person) throw new HttpError(404, "Person not found");
  const token = newToken();
  await setLink(personId, token);
  return { id: person.id, name: person.display_name, token };
}

async function listPeople(req: Request) {
  const owner = await requireOwner(req);
  const { data } = await admin.from("profiles").select("id, display_name, role").eq("family_id", owner.family_id).order("created_at");
  return { people: (data ?? []).map((p) => ({ id: p.id, name: p.display_name, role: p.role })) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const raw = await req.json().catch(() => null);
    const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    switch (body.action) {
      case "bootstrap": return json(await bootstrap(body));
      case "owner_login": return json(await ownerLogin(body));
      case "link_login": return json(await linkLogin(body));
      case "add_person": return json(await addPerson(req, body));
      case "reset_link": return json(await resetLink(req, body));
      case "list_people": return json(await listPeople(req));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
});
