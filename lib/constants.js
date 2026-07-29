// ============================================================
// lib/constants.js — Kretivco Design System Constants
// ============================================================

export const DEPT = {
  print:   { code: 'KP', label: 'KretivPrint',  color: '#E85D04' },
  work:    { code: 'KW', label: 'KretivWork',    color: '#7209B7' },
  tech:    { code: 'KT', label: 'KretivTech',    color: '#3A86FF' },
  machine: { code: 'KM', label: 'KretivMachine',  color: '#6B7280' },
}

export const STATUS = {
  potential:    { label: 'Potential',    color: '#6366F1' },
  active:       { label: 'Active',      color: '#10B981' },
  in_progress:  { label: 'In Progress', color: '#F59E0B' },
  completed:    { label: 'Completed',   color: '#6B7280' },
  cancelled:    { label: 'Cancelled',   color: '#EF4444' },
}

// Forward flow
export const STATUS_FLOW = {
  potential:   ['active'],
  active:      ['in_progress'],
  in_progress: ['completed'],
  completed:   [],
  cancelled:   [],
}

// Rollback flow — which statuses can go back to
export const STATUS_ROLLBACK = {
  potential:   [],
  active:      ['potential'],
  in_progress: ['active', 'potential'],
  completed:   ['in_progress'],
  cancelled:   [],
}

// Cancel reasons
export const CANCEL_REASONS = [
  { value: 'customer_cancelled', label: 'Customer cancelled' },
  { value: 'budget_issue', label: 'Budget issue' },
  { value: 'scope_changed', label: 'Scope changed' },
  { value: 'no_response', label: 'Tidak respond' },
  { value: 'other', label: 'Lain-lain' },
]

export const SOURCE = {
  tender:       { label: 'Tender',       color: '#3A86FF' },
  referral:     { label: 'Referral',     color: '#10B981' },
  'walk-in':    { label: 'Walk-in',      color: '#F59E0B' },
  social_media: { label: 'Social Media', color: '#7209B7' },
  website:      { label: 'Website',      color: '#E85D04' },
  other:        { label: 'Other',        color: '#6B7280' },
}

export const ROLE = {
  bod:       { label: 'BOD',       color: '#E91E63', desc: 'Full access — semua department, reports, settings' },
  dept_head: { label: 'Dept Head', color: '#3A86FF', desc: 'Department sendiri — jobs, reports' },
  staff:     { label: 'Staff',     color: '#6B7280', desc: 'Department sendiri — limited actions' },
}

export const SOURCE_OPTIONS = [
  { value: 'tender', label: 'Tender' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk-in', label: 'Walk-in' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'website', label: 'Website' },
  { value: 'other', label: 'Other' },
]

export const PIC_OPTIONS = ['Amirul Hafiz', 'Afiq Azlan', 'Nurfadilah Rahmat', 'Amnan Syahmi']

export const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis']

// ── Helpers ──
export const formatRM = (v) => v != null ? `RM ${Number(v).toLocaleString('en-MY')}` : '—'
export const formatRMShort = (v) => { if (v==null) return '—'; return v>=1000 ? `RM ${(v/1000).toFixed(v%1000===0?0:1)}k` : `RM ${v}` }
export const formatDate = (d) => d ? new Date(d).toLocaleDateString('ms-MY', { day:'numeric', month:'short', year:'numeric' }) : '—'
export const formatDateTime = (d) => { if(!d) return ''; const t=new Date(d); return t.toLocaleDateString('ms-MY',{day:'numeric',month:'short'})+', '+t.toLocaleTimeString('ms-MY',{hour:'2-digit',minute:'2-digit'}) }
export const daysUntil = (deadline) => { if(!deadline) return null; const today=new Date(); today.setHours(0,0,0,0); return Math.ceil((new Date(deadline)-today)/(864e5)) }
