import { supabase, isMockMode } from './supabase'
import { MOCK_PROFILE } from './mock-data'

export async function signIn(email, password) {
  if (isMockMode) return { user: MOCK_PROFILE }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  if (isMockMode) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  if (isMockMode) return { profile: MOCK_PROFILE }
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return null

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.warn('Profile fetch error:', profileError.message)
      // Fallback: return basic profile from auth user
      return {
        profile: {
          id: user.id,
          name: user.email.split('@')[0],
          title: null,
          email: user.email,
          role: 'staff',
          department: null,
          active: true,
        }
      }
    }

    return { profile }
  } catch (err) {
    console.error('getCurrentUser error:', err)
    return null
  }
}

export function onAuthStateChange(callback) {
  if (isMockMode) return { data: { subscription: { unsubscribe: () => {} } } }
  return supabase.auth.onAuthStateChange(callback)
}
