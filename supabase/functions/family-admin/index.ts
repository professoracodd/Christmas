// family-admin (personal-link edition): each person opens their own private link; no passwords or PINs.
// Links hold a long random token (hashed for sign-in lookups, encrypted so the owner can re-send them).
//
// Public:  bootstrap (needs SETUP_CODE; also creates Eli and Jazz; only works once), owner_login (needs SETUP_CODE), link_login
// Owner-only (the first parent, i.e. mom): add_person, reset_link, list_people (includes each person's link), delete_person
// Any signed-in person: link_preview (reads a store page's title and picture for a wish card)
//
// Deploy with JWT verification OFF (supabase/config.toml, or the toggle in the dashboard): this code checks sign-in itself.

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

// Links are stored encrypted (AES-GCM) so the owner can re-send them. The key lives only in this function.
const aesKey = async () => crypto.subtle.importKey("raw", await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SERVICE_KEY + ":links")), "AES-GCM", false, ["encrypt", "decrypt"]);
async function encrypt(text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await aesKey(), new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...iv, ...ct));
}
async function decrypt(s: string) {
  const raw = Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await aesKey(), raw.slice(12)));
}

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
  const { error } = await admin.from("access_links").upsert({ user_id: userId, token_hash: await sha256(token), token_enc: await encrypt(token) }, { onConflict: "user_id" });
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
  const { count } = await admin.from("families").select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) throw new HttpError(409, "Setup is already done. Use Owner sign-in instead.");
  const { data: fam, error } = await admin.from("families").insert({ name: "Eli & Jazz Christmas" }).select("id").single();
  if (error || !fam) { console.error("family insert failed", error); throw new HttpError(500, "Could not create the list"); }
  const made: string[] = [];
  try {
    const owner = await createPerson(fam.id, name, "parent");
    made.push(owner.id);
    for (const kid of ["Eli", "Jazz"]) made.push((await createPerson(fam.id, kid, "child")).id);
    return await mintSession(owner.id);
  } catch (e) {
    for (const id of made) await admin.auth.admin.deleteUser(id);
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

// Removes someone completely: their sign-in, profile, link and (for a kid) their wishes and uploaded photos
async function deletePerson(req: Request, body: Record<string, unknown>) {
  const owner = await requireOwner(req);
  const personId = str(body.person_id, 36, 36, "person_id");
  if (personId === owner.id) throw new HttpError(400, "You can't remove the owner account");
  const { data: person } = await admin.from("profiles").select("id, display_name").eq("id", personId).eq("family_id", owner.family_id).maybeSingle();
  if (!person) throw new HttpError(404, "Person not found");
  const { data: files } = await admin.storage.from("wish-photos").list(personId, { limit: 1000 });
  if (files?.length) await admin.storage.from("wish-photos").remove(files.map((f) => `${personId}/${f.name}`));
  const { error } = await admin.auth.admin.deleteUser(personId); // profile, link and wishes go with it (on delete cascade)
  if (error) { console.error("deleteUser failed", error); throw new HttpError(500, "Could not remove that person"); }
  return { id: personId, name: person.display_name };
}

async function listPeople(req: Request) {
  const owner = await requireOwner(req);
  const { data } = await admin.from("profiles").select("id, display_name, role").eq("family_id", owner.family_id).order("created_at");
  const people = data ?? [];
  const { data: links } = await admin.from("access_links").select("user_id, token_enc").in("user_id", people.map((p) => p.id));
  const tokens = new Map<string, string>();
  for (const l of links ?? []) {
    try { if (l.token_enc) tokens.set(l.user_id, await decrypt(l.token_enc)); } catch { /* unreadable: owner can make a new link */ }
  }
  return { people: people.map((p) => ({ id: p.id, name: p.display_name, role: p.role, token: tokens.get(p.id) ?? null })) };
}

// ---------- link preview ----------

async function requireUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data, error } = token ? await admin.auth.getUser(token) : { data: null, error: true };
  if (error || !data?.user) throw new HttpError(401, "Not signed in");
  return data.user.id;
}

// Refuse addresses inside private networks (only real public websites are fetched)
function publicUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new HttpError(400, "That doesn't look like a web link"); }
  if (!/^https?:$/.test(u.protocol)) throw new HttpError(400, "Links must start with http:// or https://");
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".") ||
      /^(\d+\.){3}\d+$/.test(h) || h.includes(":")) throw new HttpError(400, "That link can't be previewed");
  return u;
}

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).trim();

function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const tags = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, "i"));
    const c = tags?.[0].match(/content=["']([^"']*)["']/i)?.[1];
    if (c) return decodeEntities(c);
  }
  return null;
}

// Pictures hide in different places: social tags, product data (JSON-LD), and Amazon's own image attributes
function findImage(html: string): string | null {
  const og = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
  if (og) return og;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack: unknown[] = [JSON.parse(m[1])];
      while (stack.length) {
        const n = stack.pop() as any;
        if (!n || typeof n !== "object") continue;
        if (Array.isArray(n)) { stack.push(...n); continue; }
        const img = n.image;
        if (img) {
          const first = Array.isArray(img) ? img[0] : img;
          const url = typeof first === "string" ? first : first?.url ?? first?.contentUrl;
          if (typeof url === "string") return url;
        }
        if (n["@graph"]) stack.push(n["@graph"]);
      }
    } catch { /* bad JSON on the page */ }
  }
  const amazon = html.match(/data-old-hires=["'](https:[^"']+)["']/i)?.[1]
    ?? html.match(/"hiRes"\s*:\s*"(https:[^"]+)"/)?.[1]
    ?? html.match(/"large"\s*:\s*"(https:\/\/[^"]*media-amazon[^"]+)"/)?.[1]
    ?? html.match(/id=["']landingImage["'][^>]*src=["'](https:[^"']+)["']/i)?.[1];
  if (amazon) return amazon;
  return html.match(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null;
}

async function linkPreview(req: Request, body: Record<string, unknown>) {
  await requireUser(req);
  let url = publicUrl(str(body.url, 8, 2000, "url"));
  let res: Response | null = null;
  for (let hop = 0; hop < 5; hop++) {
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    }).catch(() => null);
    const next = res && res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    url = publicUrl(new URL(next, url).href);
  }
  const site0 = url.hostname.replace(/^www\./, "");
  const empty = { title: null, image: null, site: site0, final_url: url.href };
  if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return empty;
  const html = (await res.text()).slice(0, 1_500_000);
  const rawImg = findImage(html);
  let image: string | null = null;
  try { if (rawImg) { const i = new URL(decodeEntities(rawImg), url); if (/^https?:$/.test(i.protocol)) image = i.href.slice(0, 2000); } } catch { /* ignore */ }
  let title = (meta(html, ["og:title", "twitter:title"]) ?? decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "")) || null;
  // Robot-check pages are not product names
  if (title && /robot|captcha|access denied|page not found|sorry/i.test(title)) title = null;
  const site = meta(html, ["og:site_name"]) ?? site0;
  return { title: title?.slice(0, 300) ?? null, image, site: site.slice(0, 100), final_url: url.href };
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
      case "link_preview": return json(await linkPreview(req, body));
      case "delete_person": return json(await deletePerson(req, body));
      default: return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
});
