// ============================================================
// lib/mock-data.js — Data Store
// ============================================================
// Fresh start. Add customers and jobs via the UI.
// ============================================================
import { customerDisplayName } from './constants'

export const MOCK_CUSTOMERS = []

export const MOCK_VENDORS = []

export const MOCK_JOBS = []

export const MOCK_USERS = [
  { id:'u1', staff_id:'KCM001', name:'Amirul Hafiz', title:'CEO', email:'amirul@kretiv.co', role:'bod', department:null, active:true, created_at:'2026-01-01' },
  { id:'u2', staff_id:'KCM002', name:'Nurfadilah Rahmat', title:'CMO', email:'nurfadilah@kretiv.co', role:'bod', department:null, active:true, created_at:'2026-01-01' },
  { id:'u3', staff_id:'KCM003', name:'Afiq Azlan', title:'COO', email:'afiq@kretiv.co', role:'bod', department:null, active:true, created_at:'2026-01-01' },
  { id:'u4', staff_id:'KCM004', name:'Amnan Syahmi', title:'CTO', email:'amnan@kretiv.co', role:'dept_head', department:'tech', visible_departments:['tech'], active:true, created_at:'2026-03-01' },
  { id:'u5', staff_id:'KCM005', name:'Syahren', title:null, email:'syahren@kretiv.co', role:'staff', department:'print', visible_departments:['print','work','tech','event','wisb'], active:true, created_at:'2026-03-01' },
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

// Seed users (MOCK_USERS) are dev-controlled demo personas — if one gets
// renamed/re-emailed/re-roled during development, a browser that already
// cached the OLD list in localStorage would otherwise stay stuck on stale
// data (wrong name, wrong department scope) until storage was cleared.
// Reconciling on every load keeps the seed ids in sync with the current
// MOCK_USERS while preserving any additional users added via Settings.
export function reconcileMockUsers(stored) {
  if (!stored?.length) return MOCK_USERS
  const seedIds = new Set(MOCK_USERS.map(u => u.id))
  const extra = stored.filter(u => !seedIds.has(u.id))
  return [...MOCK_USERS, ...extra]
}

export function enrichJobs(jobs, customers) {
  return jobs.map(j => {
    const c = customers.find(c => c.id === j.customer_id)
    return { ...j, customer_name: customerDisplayName(c), customer_company: c?.company || '', customer_code: c?.customer_id || '' }
  })
}
