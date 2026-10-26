import { supabase } from '../lib/supabase'

export function signIn(email, password) {
  return supabase.auth.signInWithPassword({ email, password })
}

export function signOut() {
  return supabase.auth.signOut()
}

export async function isCurrentUserAdmin(userId) {
  if (!userId) return false

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}
