import { supabase, isMockMode } from './supabase'
import { MOCK_PROFILE, reconcileMockUsers } from './mock-data'

// Resolves a mock user by email against the reconciled user list (current
// MOCK_USERS seed data, plus anyone added later via Settings > Add User —
// see reconcileMockUsers for why seed accounts always take the fresh seed
// version rather than whatever a browser may have cached in localStorage).
function resolveMockUser(email) {
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return null
  let stored = null
  try {
    const d = typeof window !== 'undefined' && localStorage.getItem('kretivco_data')
    stored = d ? JSON.parse(d).users : null
  } catch {}
  const users = reconcileMockUsers(stored)
  return users.find(u => u.email?.trim().toLowerCase() === normalized) || null
}

// Mock mode: store current mock user email in localStorage (persists across tabs/reloads, cleared on explicit sign-out)
export async function signIn(email, password) {
  if (isMockMode) {
    const user = resolveMockUser(email)
    if (!user) throw new Error('Incorrect email or password.')
    if (typeof window !== 'undefined') localStorage.setItem('mock_user_email', user.email)
    return { user }
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  if (isMockMode) { if (typeof window !== 'undefined') localStorage.removeItem('mock_user_email'); return }
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getCurrentUser() {
  if (isMockMode) {
    const email = typeof window !== 'undefined' ? localStorage.getItem('mock_user_email') : null
    const profile = (email ? resolveMockUser(email) : null) || MOCK_PROFILE
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
