import { supabase, isMockMode } from './supabase'
import { MOCK_USERS, MOCK_PROFILE } from './mock-data'

// Mock mode: store current mock user email in sessionStorage
export async function signIn(email, password) {
  if (isMockMode) {
    const user = MOCK_USERS.find(u => u.email === email) || MOCK_PROFILE
    if (typeof window !== 'undefined') sessionStorage.setItem('mock_user_email', user.email)
    return { user }
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  if (isMockMode) { if (typeof window !== 'undefined') sessionStorage.removeItem('mock_user_email'); return }
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  if (isMockMode) {
    const email = typeof window !== 'undefined' ? sessionStorage.getItem('mock_user_email') : null
    // Match against localStorage users (persisted by DataProvider) or fallback to MOCK_USERS
    let users = MOCK_USERS
    try { const d = typeof window !== 'undefined' && localStorage.getItem('kretivco_data'); if (d) users = JSON.parse(d).users || MOCK_USERS } catch {}
    const profile = (email ? users.find(u => u.email === email) : null) || MOCK_PROFILE
    return { profile }
  }
  
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
