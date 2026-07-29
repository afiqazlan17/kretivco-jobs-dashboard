// ============================================================
// lib/mock-data.js — Data Store
// ============================================================
// Fresh start. Add customers and jobs via the UI.
// ============================================================

export const MOCK_CUSTOMERS = []

export const MOCK_JOBS = []

export const MOCK_USERS = [
  { id:'u1', name:'Amirul Hafiz', title:'CEO', email:'amirul@kretiv.co', role:'bod', department:null, active:true, created_at:'2026-01-01' },
  { id:'u2', name:'Nurfadilah Rahmat', title:'CMO', email:'nurfadilah@kretiv.co', role:'bod', department:null, active:true, created_at:'2026-01-01' },
  { id:'u3', name:'Afiq Azlan', title:'COO', email:'afiq@kretiv.co', role:'bod', department:null, active:true, created_at:'2026-01-01' },
  { id:'u4', name:'Amnan Syahmi', title:'CTO', email:'amnan@kretiv.co', role:'dept_head', department:'tech', visible_departments:['tech'], active:true, created_at:'2026-03-01' },
]

export const MOCK_ACTIVITY = {}

export const MOCK_PROFILE = {
  id: 'u3',
  name: 'Afiq Azlan',
  title: 'COO',
  email: 'afiq@kretiv.co',
  role: 'bod',
  department: null,
  active: true,
}

export function enrichJobs(jobs, customers) {
  return jobs.map(j => {
    const c = customers.find(c => c.id === j.customer_id)
    return { ...j, customer_name: c?.name || '', customer_company: c?.company || '', customer_code: c?.customer_id || '' }
  })
}
