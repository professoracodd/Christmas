import { admin, supabase } from './supabase'

export type Preview = { image: string | null; title: string | null; site: string | null }

// Loads a picture in the browser to confirm it is a real image (Amazon answers missing ones with a 1x1 dot)
function realImage(src: string, timeout = 6000) {
  return new Promise<boolean>((resolve) => {
    const img = new Image()
    const t = window.setTimeout(() => resolve(false), timeout)
    img.referrerPolicy = 'no-referrer'
    img.onload = () => { window.clearTimeout(t); resolve(img.naturalWidth > 20 && img.naturalHeight > 20) }
    img.onerror = () => { window.clearTimeout(t); resolve(false) }
    img.src = src
  })
}

// Amazon product code (ASIN) from a product address
function asinOf(url: string) {
  return url.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/|\/product\/)([A-Z0-9]{10})(?:[/?#]|$)/i)?.[1]?.toUpperCase() ?? null
}

// Microlink reads pages that block simple lookups. Free with no key: a few lookups per day for each phone.
async function microlink(url: string): Promise<Preview | null> {
  try {
    const r = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) return null
    const j = await r.json()
    const d = j?.data
    if (!d) return null
    return { image: d.image?.url ?? null, title: d.title ?? null, site: d.publisher ?? null }
  } catch { return null }
}

// Tries, in order: our own lookup, Amazon's picture by product code, then Microlink
export async function findPicture(url: string): Promise<Preview> {
  let best: Preview = { image: null, title: null, site: null }
  let finalUrl = url
  try {
    const r = await admin({ action: 'link_preview', url })
    best = { image: r.image || null, title: r.title || null, site: r.site || null }
    if (r.final_url) finalUrl = r.final_url
  } catch { /* fall through */ }
  if (best.image && await realImage(best.image)) return best
  best.image = null

  const asin = asinOf(finalUrl) || asinOf(url)
  if (asin) {
    const img = `https://m.media-amazon.com/images/P/${asin}.01._SCLZZZZZZZ_.jpg`
    if (await realImage(img)) return { ...best, image: img, site: best.site || 'Amazon' }
  }

  const m = await microlink(finalUrl)
  if (m?.image && await realImage(m.image)) return { image: m.image, title: best.title || (m.title && !/gallery|robot|captcha/i.test(m.title) ? m.title : null), site: best.site || m.site }
  return best // Microlink's title is only trusted when its picture was real
}

// Kid takes or picks a photo: shrink it in the browser, then store it in the wish-photos bucket
export async function uploadPhoto(file: File, userId: string): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) throw new Error('That file is not a picture we can use.')
  const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
  if (!blob) throw new Error('Could not read that picture.')
  const path = `${userId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('wish-photos').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw new Error('Could not upload the picture. Please try again.')
  return supabase.storage.from('wish-photos').getPublicUrl(path).data.publicUrl
}

export const isUploadedPhoto = (url: string | null) => !!url && url.includes('/storage/v1/object/public/wish-photos/')
