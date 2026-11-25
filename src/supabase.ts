/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// False when the site was built without the two VITE_ values (shows a setup message instead of a blank page)
export const configured = Boolean(URL_ && KEY)

export const supabase = createClient(URL_ || 'https://not-configured.supabase.co', KEY || 'missing')

// Calls the family-admin Edge Function (setup, link sign-in, adding people, link previews)
export async function admin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('family-admin', { body })
  if (error) {
    let msg = 'Something went wrong. Please try again.'
    try { msg = (await (error as any).context.json()).error || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  return data
}

// Every sign-in path ends here: the backend hands back a one-time token, the browser trades it for a session
export async function startSession(r: { token_hash: string }) {
  const { error } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' })
  if (error) throw new Error('Could not sign in. Please try again.')
}

// The app's home address ("/Christmas/" on GitHub Pages), never a stray sub-page
export const BASE = import.meta.env.BASE_URL
export const asset = (file: string) => `${BASE}${file}`
export const personalLink = (token: string) => `${window.location.origin}${BASE}#k=${token}`

export type Role = 'parent' | 'child' | 'gift_buyer'
export type Profile = { id: string; family_id: string; display_name: string; role: Role }
export type Item = {
  id: string; child_id: string; name: string; description: string | null; estimated_price: number | null
  product_url: string | null; image_url: string | null; link_title: string | null; link_site: string | null
}
export const ITEM_COLS = 'id, child_id, name, description, estimated_price, product_url, image_url, link_title, link_site'
export const TITLE = 'Eli & Jazz Christmas'

export const money = (n: number | null) => (n === null || n === undefined ? '' : `$${Number(n).toFixed(2)}`)

export function daysToChristmas() {
  const now = new Date()
  let xmas = new Date(now.getFullYear(), 11, 25)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (today > xmas) xmas = new Date(now.getFullYear() + 1, 11, 25)
  return Math.round((xmas.getTime() - today.getTime()) / 86400000)
}

export const siteName = (url: string | null) => {
  if (!url) return ''
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
