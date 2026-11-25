/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)

// Calls the family-admin Edge Function (setup, link sign-in, adding people)
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

export const personalLink = (token: string) => `${window.location.origin}${window.location.pathname}#k=${token}`

export type Profile = { id: string; family_id: string; display_name: string; role: 'parent' | 'child' | 'gift_buyer' }
export const TITLE = 'Eli & Jazz Christmas'
