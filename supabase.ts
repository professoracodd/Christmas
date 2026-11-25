/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
export const CHILD_DOMAIN = import.meta.env.VITE_CHILD_EMAIL_DOMAIN || 'children.giftlist.test'

// Calls the family-admin Edge Function (account creation, invites, children)
export async function admin(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('family-admin', { body })
  if (error) {
    let msg = 'Something went wrong. Please try again.'
    try { msg = (await (error as any).context.json()).error || msg } catch { /* keep default */ }
    throw new Error(msg)
  }
  return data
}

export type Profile = { id: string; family_id: string; display_name: string; role: 'parent' | 'child' | 'gift_buyer' }
