'use client'
import { useState, useEffect, useCallback, useContext, createContext } from 'react'
import { getCurrentUser, onAuthStateChange } from './auth'
import { isMockMode } from './supabase'
import { MOCK_JOBS, MOCK_CUSTOMERS, MOCK_USERS, MOCK_ACTIVITY, MOCK_PROFILE, enrichJobs } from './mock-data'
import { daysUntil } from './constants'

// ── Auth Context ──
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(() => {
    if (!isMockMode) return null
    // Restore mock user from sessionStorage
    if (typeof window !== 'undefined') {
      const email = sessionStorage.getItem('mock_user_email')
      if (email) {
        const stored = loadStore()
        const users = stored?.users || MOCK_USERS
        return users.find(u => u.email === email) || MOCK_PROFILE
      }
    }
    return null // No auto-login, show login page
  })
  const [loading, setLoading] = useState(isMockMode ? false : true)

  const loadProfile = useCallback(async () => {
    try {
      const result = await getCurrentUser()
      setProfile(result?.profile || null)
    } catch (err) {
      console.error('Load profile error:', err)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isMockMode) return
    loadProfile()
    const { data: { subscription } } = onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        loadProfile()
      } else if (event === 'SIGNED_OUT') {
        setProfile(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [loadProfile])

  return <AuthContext.Provider value={{ profile, loading, refresh: loadProfile }}>{children}</AuthContext.Provider>
}
export function useAuth() { return useContext(AuthContext) || { profile: null, loading: true } }

// ── LocalStorage helpers (mock mode persistence) ──
const STORE_KEY = 'kretivco_data'
function loadStore() {
  if (typeof window === 'undefined') return null
  try { const d = localStorage.getItem(STORE_KEY); return d ? JSON.parse(d) : null } catch { return null }
}
function saveStore(data) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)) } catch {}
}

// ── Data Store ──
const DataContext = createContext(null)
export function DataProvider({ children }) {
  const stored = loadStore()
  const [jobs, setJobs] = useState(stored?.jobs ?? MOCK_JOBS)
  const [customers, setCustomers] = useState(stored?.customers ?? MOCK_CUSTOMERS)
  const [users, setUsers] = useState(stored?.users ?? MOCK_USERS)
  const [activityLogs, setActivityLogs] = useState(stored?.activityLogs ?? {}) // { jobId: [log entries] }

  // Persist to localStorage on every change
  useEffect(() => { saveStore({ jobs, customers, users, activityLogs }) }, [jobs, customers, users, activityLogs])

  const enrichedJobs = enrichJobs(jobs, customers)

  // ── Activity Logging ──
  const addLog = (jobId, entry) => {
    setActivityLogs(prev => ({
      ...prev,
      [jobId]: [...(prev[jobId] || []), { ...entry, time: new Date().toISOString() }]
    }))
  }

  const addJob = (job, userName) => {
    setJobs(p => [...p, job])
    addLog(job.job_id, { action: 'created', user: userName || 'System', detail: `Job ${job.job_id} dicipta` })
  }

  const updateJob = (id, updates, userName, logEntry) => {
    setJobs(p => p.map(j => j.id === id ? { ...j, ...updates } : j))
    if (logEntry) {
      const job = enrichedJobs.find(j => j.id === id) || jobs.find(j => j.id === id)
      if (job) addLog(job.job_id, { ...logEntry, user: userName || 'System' })
    }
  }

  const addCustomer = (c, userName) => {
    setCustomers(p => [...p, c])
    // Log customer creation (no job-specific log, but we track it)
  }

  const updateCustomer = (id, updates) => setCustomers(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
  const addUser = (u) => setUsers(p => [...p, u])
  const updateUser = (id, updates) => setUsers(p => p.map(u => u.id === id ? { ...u, ...updates } : u))

  const getActivity = (jobId) => activityLogs[jobId] || []

  const genJobId = (dept) => {
    const codes = { print: 'KP', work: 'KW', tech: 'KT', machine: 'KM' }
    const code = codes[dept] || 'XX'
    const count = jobs.filter(j => j.department === dept && j.job_id?.includes('-2026-')).length + 1
    return `${code}-2026-${String(count).padStart(3, '0')}`
  }

  const genCustId = () => `KCO-${String(customers.length + 1).padStart(3, '0')}`

  // ── Reset All Data ──
  const resetAll = () => {
    setJobs([])
    setCustomers([])
    setActivityLogs({})
    // Keep users — they are system config, not operational data
    if (typeof window !== 'undefined') try { localStorage.removeItem(STORE_KEY) } catch {}
  }

  return (
    <DataContext.Provider value={{
      jobs: enrichedJobs, rawJobs: jobs, customers, users,
      addJob, updateJob, addCustomer, updateCustomer, addUser, updateUser,
      getActivity, genJobId, genCustId, resetAll, addLog,
    }}>
      {children}
    </DataContext.Provider>
  )
}
export function useData() { return useContext(DataContext) }

// ── Visible Departments Hook ──
// Returns null (= see all) or array of dept keys the current user can view
export function useVisibleDepts() {
  const { profile } = useAuth()
  const { users } = useData()
  if (!profile) return []
  if (profile.role === 'bod') return null // BOD sees everything
  const user = users.find(u => u.id === profile.id)
  if (user?.visible_departments?.length) return user.visible_departments
  return profile.department ? [profile.department] : null
}

// ── Dashboard Hook ──
export function useDashboard() {
  const { jobs: allJobs } = useData()
  const visDepts = useVisibleDepts()
  const jobs = visDepts ? allJobs.filter(j => visDepts.includes(j.department)) : allJobs
  const active = jobs.filter(j => !j.archived && !['completed','cancelled'].includes(j.status))
  const nc = jobs.filter(j => !j.archived && j.status !== 'cancelled')
  const comp = jobs.filter(j => !j.archived && j.status === 'completed')

  const stats = {
    total_jobs: nc.length,
    active_jobs: jobs.filter(j => !j.archived && j.status === 'active').length,
    in_progress_jobs: jobs.filter(j => !j.archived && j.status === 'in_progress').length,
    potential_jobs: jobs.filter(j => !j.archived && j.status === 'potential').length,
    completed_jobs: comp.length,
    pipeline_value: jobs.filter(j => !j.archived && ['active','in_progress'].includes(j.status)).reduce((s,j) => s + (j.estimation_value||0), 0),
    potential_value: jobs.filter(j => !j.archived && j.status === 'potential').reduce((s,j) => s + (j.estimation_value||0), 0),
    actual_revenue: comp.reduce((s,j) => s + (j.final_value||0), 0),
  }

  const deptBreakdown = {}
  active.forEach(j => {
    if (!deptBreakdown[j.department]) deptBreakdown[j.department] = { active: 0, est: 0 }
    deptBreakdown[j.department].active++
    deptBreakdown[j.department].est += j.estimation_value || 0
  })

  const alerts = active.filter(j => j.deadline).map(j => ({ ...j, _days: daysUntil(j.deadline) })).filter(j => j._days !== null && j._days <= 3).sort((a,b) => a._days - b._days)

  // Recent jobs — last 5 created
  const recent = [...nc].sort((a,b) => (b.created_at||'').localeCompare(a.created_at||'')).slice(0, 5)

  return { stats, deptBreakdown, alerts, recent, loading: false }
}
