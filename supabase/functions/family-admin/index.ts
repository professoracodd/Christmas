// link-preview: given a web address, returns its title, preview image and site name (like Padlet thumbnails).
// Signed-in users only. Fetches the page server-side (browsers can't, because of CORS) and refuses private addresses.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

class Blocked extends Error {}

function privateV4(ip: string) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => isNaN(n))) return false;
  const [a, b] = p;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL) {
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Blocked("protocol");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal") || h.includes(":")) throw new Blocked("host");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) { if (privateV4(h)) throw new Blocked("ip"); return; }
  try {
    const ips = await Deno.resolveDns(h, "A");
    if (ips.some(privateV4)) throw new Blocked("resolves to private address");
  } catch (e) { if (e instanceof Blocked) throw e; /* lookup unsupported or failed: the fetch below will fail on its own */ }
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function meta(html: string, keys: string[]) {
  for (const k of keys) {
    const a = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*content=["']([^"']*)["']`, "i"));
    const b = html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${k}["']`, "i"));
    const v = (a ?? b)?.[1];
    if (v) return decode(v);
  }
  return null;
}

async function readText(res: Response, max = 400_000) {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < max) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value); n += value.length;
  }
  reader.cancel().catch(() => {});
  return await new Blob(chunks).text();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: auth } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  if (!auth.user) return json({ error: "Not signed in" }, 401);

  const body = await req.json().catch(() => ({}));
  let url: URL;
  try { url = new URL(String(body.url ?? "").trim()); } catch { return json({ error: "Not a valid web address" }, 400); }

  const site = url.hostname.replace(/^www\./, "");
  const empty = { title: null, image: null, site };
  try {
    let res: Response | null = null;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublic(url);
      res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(6000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LinkPreview/1.0)", Accept: "text/html,application/xhtml+xml" },
      });
      const loc = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && loc) { url = new URL(loc, url); continue; }
      break;
    }
    if (!res || !res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return json(empty);

    const html = await readText(res);
    const title = meta(html, ["og:title", "twitter:title"]) ?? decode((html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ""));
    let image = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
    if (image) {
      try {
        const abs = new URL(image, url);
        abs.protocol = "https:"; // page is served over https, so http images would be blocked anyway
        image = abs.toString().slice(0, 2000);
      } catch { image = null; }
    }
    return json({
      title: title ? title.slice(0, 200) : null,
      image,
      site: (meta(html, ["og:site_name"]) ?? site).slice(0, 100),
    });
  } catch (e) {
    if (!(e instanceof Blocked)) console.error("preview failed", e);
    return json(empty);
  }
});
