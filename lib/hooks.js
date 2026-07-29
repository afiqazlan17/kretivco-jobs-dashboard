'use client'
import { useState, useEffect, useCallback, useContext, createContext } from 'react'
import { getCurrentUser, onAuthStateChange } from './auth'
import { isMockMode } from './supabase'
import { MOCK_JOBS, MOCK_CUSTOMERS, MOCK_USERS, MOCK_ACTIVITY, MOCK_PROFILE, enrichJobs } from './mock-data'
import { daysUntil } from './constants'

// ── Auth Context ──
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(isMockMode ? MOCK_PROFILE : null)
  const [loading, setLoading] = useState(!isMockMode)

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

// ── Data Store (mock mode uses React state, live mode uses Supabase) ──
const DataContext = createContext(null)
export function DataProvider({ children }) {
  const [jobs, setJobs] = useState(MOCK_JOBS)
  const [customers, setCustomers] = useState(MOCK_CUSTOMERS)
  const [users, setUsers] = useState(MOCK_USERS)

  const enrichedJobs = enrichJobs(jobs, customers)

  const addJob = (job) => setJobs(p => [...p, job])
  const updateJob = (id, updates) => setJobs(p => p.map(j => j.id === id ? { ...j, ...updates } : j))
  const addCustomer = (c) => setCustomers(p => [...p, c])
  const updateCustomer = (id, updates) => setCustomers(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
  const addUser = (u) => setUsers(p => [...p, u])
  const updateUser = (id, updates) => setUsers(p => p.map(u => u.id === id ? { ...u, ...updates } : u))

  const getActivity = (jobId) => MOCK_ACTIVITY[jobId] || []

  const genJobId = (dept) => {
    const codes = { print: 'KP', work: 'KW', tech: 'KT', machine: 'KM' }
    const code = codes[dept] || 'XX'
    const count = jobs.filter(j => j.department === dept && j.job_id?.includes('-2026-')).length + 1
    return `${code}-2026-${String(count).padStart(3, '0')}`
  }

  const genCustId = () => `KCO-${String(customers.length + 1).padStart(3, '0')}`

  return (
    <DataContext.Provider value={{
      jobs: enrichedJobs, rawJobs: jobs, customers, users,
      addJob, updateJob, addCustomer, updateCustomer, addUser, updateUser,
      getActivity, genJobId, genCustId,
    }}>
      {children}
    </DataContext.Provider>
  )
}
export function useData() { return useContext(DataContext) }

// ── Dashboard Hook ──
export function useDashboard() {
  const { jobs } = useData()
  const active = jobs.filter(j => !j.archived && !['completed','cancelled'].includes(j.status))
  const nc = jobs.filter(j => !j.archived && j.status !== 'cancelled')
  const comp = jobs.filter(j => !j.archived && j.status === 'completed')

  const stats = {
    total_jobs: nc.length,
    active_jobs: jobs.filter(j => !j.archived && j.status === 'active').length,
    ongoing_jobs: jobs.filter(j => !j.archived && j.status === 'ongoing').length,
    potential_jobs: jobs.filter(j => !j.archived && j.status === 'potential').length,
    completed_jobs: comp.length,
    pipeline_value: jobs.filter(j => !j.archived && ['active','ongoing'].includes(j.status)).reduce((s,j) => s + (j.estimation_value||0), 0),
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

  return { stats, deptBreakdown, alerts, loading: false }
}
