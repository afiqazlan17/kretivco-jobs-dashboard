'use client'
import { useState, useEffect, useCallback, useContext, createContext } from 'react'
import { getCurrentUser, onAuthStateChange } from './auth'
import { supabase, isMockMode } from './supabase'
import { MOCK_JOBS, MOCK_CUSTOMERS, MOCK_USERS, MOCK_ACTIVITY, MOCK_PROFILE, enrichJobs } from './mock-data'
import { daysUntil, revenueAccount, cogsAccount, opexAccount, EXPENSE_CATEGORIES } from './constants'

// ── Auth Context ──
const AuthContext = createContext(null)
export function AuthProvider({ children }) {
  const [profile, setProfile] = useState(() => {
    if (!isMockMode) return null
    // Restore mock user from localStorage (persists across tabs/reloads)
    if (typeof window !== 'undefined') {
      const email = localStorage.getItem('mock_user_email')
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
  const { profile } = useAuth() || {}
  const [jobs, setJobs] = useState([])
  const [customers, setCustomers] = useState([])
  const [users, setUsers] = useState([])
  const [activityLogs, setActivityLogs] = useState({})
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [dataLoading, setDataLoading] = useState(true)

  // ── Fetch all data on mount ──
  const fetchAll = useCallback(async () => {
    if (isMockMode) {
      const stored = loadStore()
      setJobs(stored?.jobs ?? MOCK_JOBS)
      setCustomers(stored?.customers ?? MOCK_CUSTOMERS)
      setUsers(stored?.users ?? MOCK_USERS)
      setActivityLogs(stored?.activityLogs ?? {})
      setLedgerEntries(stored?.ledgerEntries ?? [])
      setDataLoading(false)
      return
    }
    const [jR, cR, uR, aR, lR] = await Promise.all([
      supabase.from('jobs').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*'),
      supabase.from('activity_log').select('*').order('created_at', { ascending: true }),
      supabase.from('ledger_entries').select('*').order('date', { ascending: true }),
    ])
    if (jR.error) console.error('jobs fetch error:', jR.error)
    if (cR.error) console.error('customers fetch error:', cR.error)
    if (uR.error) console.error('users fetch error:', uR.error)
    const jobsData = (jR.data || []).map(j => ({ ...j, estimation_value: j.estimation_value ? Number(j.estimation_value) : null, final_value: j.final_value ? Number(j.final_value) : null }))
    setJobs(jobsData)
    setCustomers(cR.data || [])
    setUsers(uR.data || [])
    const logs = {}
    ;(aR.data || []).forEach(l => {
      const job = jobsData.find(j => j.id === l.job_id)
      const key = job?.job_id || l.job_id
      if (!logs[key]) logs[key] = []
      logs[key].push({ action: l.action, user: l.user_name || 'System', detail: l.detail, note: l.note, field: l.field_changed, old: l.old_value, val: l.new_value, time: l.created_at, attachmentPath: l.attachment_path, attachmentName: l.attachment_name, attachments: l.attachments || [] })
    })
    setActivityLogs(logs)
    if (lR.error) console.error('ledger_entries fetch error (table may not exist yet):', lR.error)
    setLedgerEntries(lR.data || [])
    setDataLoading(false)
  }, [])

  // Live mode: the very first mount happens on /login before anyone is
  // authenticated, so a plain mount-only fetch would run once, find no
  // session, and never run again — leaving jobs/customers permanently
  // empty even after a successful login (which only updates AuthProvider's
  // profile, not this component). Re-running whenever profile changes
  // covers both the initial post-login fetch and switching accounts.
  useEffect(() => { if (isMockMode || profile) fetchAll() }, [isMockMode, profile, fetchAll])

  // Mock mode: persist to localStorage. Gated on dataLoading being false —
  // on mount this effect and the fetch effect above both fire, but this one
  // can run first with the untouched empty initial state, silently
  // overwriting localStorage with nothing before the fetch's setState calls
  // are even applied. Skipping saves until fetchAll has completed once
  // avoids that race entirely.
  useEffect(() => { if (isMockMode && !dataLoading) saveStore({ jobs, customers, users, activityLogs, ledgerEntries }) }, [jobs, customers, users, activityLogs, ledgerEntries, dataLoading])

  const enrichedJobs = enrichJobs(jobs, customers)

  // ── Activity Logging ──
  // Optimistic local entry for every action. Structured job-field changes
  // (status_change, edited, completed, ...) are also captured server-side by
  // a DB trigger on the jobs table, so those don't need a client insert here
  // — inserting them too would just duplicate what the trigger already
  // wrote. 'note' and 'document_generated' don't correspond to any job
  // column changing, so nothing triggers for them — those two need an
  // explicit insert or they'd only ever exist in memory and vanish on the
  // next reload (this is exactly what was happening before).
  const addLog = (jobId, entry, jobUuid) => {
    const now = new Date().toISOString()
    setActivityLogs(prev => ({ ...prev, [jobId]: [...(prev[jobId] || []), { ...entry, time: now }] }))
    if (!isMockMode && (entry.action === 'note' || entry.action === 'document_generated')) {
      const uuid = jobUuid || jobs.find(j => j.job_id === jobId)?.id
      if (!uuid) return
      supabase.from('activity_log').insert({
        job_id: uuid,
        action: entry.action,
        user_name: entry.user || 'System',
        note: entry.note || null,
        detail: entry.detail || null,
        attachment_path: entry.attachmentPath || null,
        attachment_name: entry.attachmentName || null,
        attachments: entry.attachments || [],
      }).then(({ error }) => { if (error) console.error('addLog insert error:', error) })
    }
  }

  const addJob = (job, userName) => {
    // Optimistic local update
    setJobs(p => [...p, job])
    addLog(job.job_id, { action: 'created', user: userName || 'System', detail: `Job ${job.job_id} created` })
    if (!isMockMode) {
      const { customer_name, customer_company, customer_code, ...dbJob } = job
      supabase.from('jobs').insert({ ...dbJob, id: dbJob.id, created_by: null }).then(({ error }) => { if (error) console.error('addJob error:', error) })
    }
  }

  const updateJob = (id, updates, userName, logEntry) => {
    setJobs(p => p.map(j => j.id === id ? { ...j, ...updates } : j))
    if (logEntry) {
      const job = enrichedJobs.find(j => j.id === id) || jobs.find(j => j.id === id)
      if (job) addLog(job.job_id, { ...logEntry, user: userName || 'System' })
    }
    if (!isMockMode) {
      const { customer_name, customer_company, customer_code, ...clean } = updates
      supabase.from('jobs').update({ ...clean, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => { if (error) console.error('updateJob error:', error) })
    }
  }

  const addCustomer = (c, userName) => {
    setCustomers(p => [...p, c])
    if (!isMockMode) {
      supabase.from('customers').insert({ ...c }).then(({ error }) => { if (error) console.error('addCustomer error:', error) })
    }
  }

  const updateCustomer = (id, updates) => {
    setCustomers(p => p.map(c => c.id === id ? { ...c, ...updates } : c))
    if (!isMockMode) supabase.from('customers').update(updates).eq('id', id).then()
  }

  const addUser = (u) => {
    setUsers(p => [...p, u])
    // Note: live mode user creation requires Supabase Auth admin — handled separately
  }

  const updateUser = (id, updates) => {
    setUsers(p => p.map(u => u.id === id ? { ...u, ...updates } : u))
    if (!isMockMode) {
      const { name, email, role, department, title, active, visible_departments } = updates
      const dbUpdates = {}
      if (name !== undefined) dbUpdates.name = name
      if (email !== undefined) dbUpdates.email = email
      if (role !== undefined) dbUpdates.role = role
      if (department !== undefined) dbUpdates.department = department
      if (title !== undefined) dbUpdates.title = title
      if (active !== undefined) dbUpdates.active = active
      if (visible_departments !== undefined) dbUpdates.visible_departments = visible_departments
      if (Object.keys(dbUpdates).length) supabase.from('users').update(dbUpdates).eq('id', id).then(({ error }) => { if (error) console.error('updateUser error:', error) })
    }
  }

  const getActivity = (jobId) => activityLogs[jobId] || []

  const genJobId = (dept) => {
    const codes = { print: 'KP', work: 'KW', tech: 'KT', event: 'KE', wisb: 'WISB' }
    const code = codes[dept] || 'XX'
    const year = new Date().getFullYear()
    const count = jobs.filter(j => j.department === dept && j.job_id?.includes(`-${year}-`)).length + 1
    return `${code}-${year}-${String(count).padStart(3, '0')}`
  }

  const genCustId = () => `KCO-${String(customers.length + 1).padStart(3, '0')}`

  // One Project ID groups jobs created together across multiple departments
  // for the same customer engagement (e.g. design + print in one request).
  const genProjectId = () => {
    const year = new Date().getFullYear()
    const ids = new Set(jobs.filter(j => j.project_id?.includes(`-${year}-`)).map(j => j.project_id))
    return `PRJ-${year}-${String(ids.size + 1).padStart(3, '0')}`
  }

  // ── Reset All Data ──
  const resetAll = async () => {
    setJobs([])
    setCustomers([])
    setActivityLogs({})
    setLedgerEntries([])
    if (isMockMode) { if (typeof window !== 'undefined') try { localStorage.removeItem(STORE_KEY) } catch {} }
    else {
      await supabase.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  // Reset only Job data (jobs, their activity logs, their ledger
  // entries) — customers and users are untouched, unlike resetAll above.
  const resetJobs = async () => {
    setJobs([])
    setActivityLogs({})
    setLedgerEntries([])
    if (!isMockMode) {
      await supabase.from('activity_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('jobs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('ledger_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    }
  }

  // ── Finance / Ledger ──
  // Every entry is a simple two-account transaction (debit_account,
  // credit_account, one amount) — always balanced by construction, so there's
  // no journal-line UI to build. Staff never pick an account directly; these
  // are only ever called from job/document actions or the expense form.
  const addLedgerEntry = (entry) => {
    const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), reversed: false, reverses_id: null, ...entry }
    setLedgerEntries(p => [...p, row])
    if (!isMockMode) supabase.from('ledger_entries').insert(row).then(({ error }) => { if (error) console.error('addLedgerEntry error:', error) })
    return row
  }

  // Reverse every not-yet-reversed entry matching a predicate, by posting the
  // mirrored (debit/credit swapped) counter-entry — never deletes the
  // original, so the audit trail stays intact.
  const reverseEntries = (predicate, userName) => {
    ledgerEntries.filter(e => predicate(e) && !e.reversed).forEach(orig => {
      addLedgerEntry({
        date: new Date().toISOString(), type: 'reversal',
        description: `Reversal — ${orig.description}`,
        department: orig.department, job_id: orig.job_id, doc_number: orig.doc_number,
        debit_account: orig.credit_account, credit_account: orig.debit_account,
        amount: orig.amount, bank: orig.bank, created_by: userName || 'System', reverses_id: orig.id,
      })
      setLedgerEntries(p => p.map(e => e.id === orig.id ? { ...e, reversed: true } : e))
      if (!isMockMode) supabase.from('ledger_entries').update({ reversed: true }).eq('id', orig.id).then(({ error }) => { if (error) console.error('reverseEntries update error:', error) })
    })
  }

  // Invoice issued: revenue recognized, amount owed by the customer. Doc may
  // be regenerated (e.g. customer added an item, or staff adjusted delivery/
  // discount in the doc preview) — supersede rather than double-count by
  // reversing any prior unreversed invoice for this job first. amountOverride
  // is the actual total shown on the generated PDF (may differ from the raw
  // line-item sum once delivery/discount are factored in).
  const postInvoiceEntry = (job, docNumber, userName, amountOverride) => {
    const amount = amountOverride != null ? Number(amountOverride) : ((job.line_items || []).reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0) || job.estimation_value || 0)
    if (!amount) return
    reverseEntries(e => e.job_id === job.job_id && e.type === 'invoice', userName)
    return addLedgerEntry({
      date: new Date().toISOString(), type: 'invoice',
      description: `Invois ${docNumber} — ${job.customer_name || 'Customer'}`,
      department: job.department, job_id: job.job_id, doc_number: docNumber,
      debit_account: 'ar', credit_account: revenueAccount(job.department),
      amount, bank: null, created_by: userName || 'System',
    })
  }

  // Receipt issued: payment received, clears what was owed. Same supersede
  // rule as invoices — regenerating replaces the prior receipt, not adds to it.
  const postReceiptEntry = (job, docNumber, userName, amountOverride) => {
    const amount = amountOverride != null ? Number(amountOverride) : (job.final_value || job.estimation_value || 0)
    if (!amount) return
    const bank = job.bank || 'mbb'
    reverseEntries(e => e.job_id === job.job_id && e.type === 'receipt', userName)
    return addLedgerEntry({
      date: new Date().toISOString(), type: 'receipt',
      description: `Resit ${docNumber} — ${job.customer_name || 'Customer'}`,
      department: job.department, job_id: job.job_id, doc_number: docNumber,
      debit_account: `bank_${bank}`, credit_account: 'ar',
      amount, bank, created_by: userName || 'System',
    })
  }

  // Plain-language expense entry — department set = cost of service for
  // that department, blank = company-wide operating expense.
  const postExpenseEntry = ({ category, department, jobId, amount, bank, date, notes }, userName) => {
    const amt = Number(amount) || 0
    if (!amt || !bank) return
    const debitAccount = department ? cogsAccount(department) : opexAccount(category)
    const categoryLabel = EXPENSE_CATEGORIES.find(c => c.value === category)?.label || category
    return addLedgerEntry({
      date: date || new Date().toISOString(), type: department ? 'job_expense' : 'operating_expense',
      description: notes?.trim() || categoryLabel,
      department: department || null, job_id: jobId || null, doc_number: null,
      debit_account: debitAccount, credit_account: `bank_${bank}`,
      amount: amt, bank, created_by: userName || 'System',
    })
  }

  // Adjust a bank account's starting balance (additive — call again to correct).
  const postOpeningBalanceAdjustment = (bank, amount, userName) => {
    const amt = Number(amount) || 0
    if (!amt) return
    return addLedgerEntry({
      date: new Date().toISOString(), type: 'opening_balance',
      description: `Selaraskan baki permulaan Bank ${bank.toUpperCase()}`,
      department: null, job_id: null, doc_number: null,
      debit_account: `bank_${bank}`, credit_account: 'equity_opening',
      amount: amt, bank, created_by: userName || 'System',
    })
  }

  // Void every not-yet-reversed entry tied to a job (e.g. on cancellation).
  const reverseJobLedgerEntries = (jobId, userName) => reverseEntries(e => e.job_id === jobId, userName)

  return (
    <DataContext.Provider value={{
      jobs: enrichedJobs, rawJobs: jobs, customers, users, dataLoading,
      addJob, updateJob, addCustomer, updateCustomer, addUser, updateUser,
      getActivity, genJobId, genCustId, genProjectId, resetAll, resetJobs, addLog, refetch: fetchAll,
      ledgerEntries, postInvoiceEntry, postReceiptEntry, postExpenseEntry, postOpeningBalanceAdjustment, reverseJobLedgerEntries,
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
    new_jobs: jobs.filter(j => !j.archived && j.status === 'new').length,
    assigned_jobs: jobs.filter(j => !j.archived && j.status === 'assigned').length,
    active_jobs: jobs.filter(j => !j.archived && j.status === 'active').length,
    potential_jobs: jobs.filter(j => !j.archived && j.status === 'potential').length,
    completed_jobs: comp.length,
    pipeline_value: jobs.filter(j => !j.archived && ['new','assigned','active'].includes(j.status)).reduce((s,j) => s + (j.estimation_value||0), 0),
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
