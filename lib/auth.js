import { supabase, isMockMode } from './supabase'
import { MOCK_USERS, MOCK_PROFILE } from './mock-data'

// Mock mode: store current mock user email in localStorage (persists across tabs/reloads, cleared on explicit sign-out)
export async function signIn(email, password) {
  if (isMockMode) {
    // Match against the full persisted user list (seeded MOCK_USERS plus
    // anyone added later via Settings > Add User), not just the static
    // seed list — otherwise a newly added staff member's email would fall
    // through to MOCK_PROFILE and silently log them in as someone else.
    let users = MOCK_USERS
    try {
      const d = typeof window !== 'undefined' && localStorage.getItem('kretivco_data')
      const stored = d ? JSON.parse(d).users : null
      if (stored?.length) users = stored
    } catch {}
    const normalized = email?.trim().toLowerCase()
    const user = users.find(u => u.email?.trim().toLowerCase() === normalized)
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
    // Match against localStorage users (persisted by DataProvider) or fallback to MOCK_USERS
    let users = MOCK_USERS
    try {
      const d = typeof window !== 'undefined' && localStorage.getItem('kretivco_data')
      const stored = d ? JSON.parse(d).users : null
      if (stored?.length) users = stored
    } catch {}
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
