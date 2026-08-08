// ============================================================
// lib/constants.js — Kretivco Design System Constants
// ============================================================

// usesSize: true departments deal in physical items with a print/production
// size (posters, banners) — their generated documents show a Size column.
// Departments doing non-physical work (websites, apps, events) don't.
export const DEPT = {
  print:   { code: 'KP', label: 'KretivPrint',  color: '#E85D04', usesSize: true },
  work:    { code: 'KW', label: 'KretivWork',    color: '#7209B7' },
  tech:    { code: 'KT', label: 'KretivTech',    color: '#3A86FF' },
  event:   { code: 'KE', label: 'KretivEvent',   color: '#E91E63' },
  wisb:    { code: 'WISB', label: 'Waffiy Industries', color: '#6B7280' },
}

export const JOB_TYPE = {
  client_project: { label: 'Client Project', color: '#3A86FF', desc: 'Kretivco buat kerja custom untuk customer' },
  product_sale:   { label: 'Product Sale',   color: '#10B981', desc: 'Customer beli product sedia ada Kretivco' },
}

export const BANK = {
  mbb:  { label: 'Maybank', code: 'MBB',  color: '#FFC107', acct: '5621-0668-8317', name: 'KRETIVCO MEDIAWORKS' },
  cimb: { label: 'CIMB',    code: 'CIMB', color: '#E53935', acct: 'XXXX-XXXX-XXXX', name: 'KRETIVCO MEDIAWORKS' },
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

// A sole-proprietor still registers an SSM number, so "has SSM" is what
// actually distinguishes a company from a walk-in/personal customer here —
// not company size.
export const CUSTOMER_TYPE = {
  individual: { label: 'Individual', color: '#6366F1', desc: 'Tiada SSM — customer persendirian' },
  company:    { label: 'Company',    color: '#E85D04', desc: 'Ada SSM (termasuk sole-proprietor)' },
}

export const PIC_OPTIONS = ['Amirul Hafiz', 'Afiq Azlan', 'Nurfadilah Rahmat', 'Amnan Syahmi']

// PIC filtered by department
export const PIC_BY_DEPT = {
  work:  ['Afiq Azlan', 'Amirul Hafiz'],
  tech:  ['Amnan Syahmi'],
  print: ['Nurfadilah Rahmat', 'Amirul Hafiz'],
  event: ['Afiq Azlan', 'Amirul Hafiz'],
  wisb:  ['Amirul Hafiz'],
}

export const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ogo','Sep','Okt','Nov','Dis']

// Which documents can be generated for a job, based on its current status
export const DOC_TYPE_META = {
  quotation: { label: 'Quotation', icon: '📄', color: '#6366F1' },
  proforma:  { label: 'Proforma Invoice', icon: '📋', color: '#3A86FF' },
  invoice:   { label: 'Invoice', icon: '📑', color: '#10B981' },
  receipt:   { label: 'Receipt', icon: '🧾', color: '#E85D04' },
}

export function availableDocTypes(status) {
  const types = []
  if (['potential','active','in_progress','completed'].includes(status)) types.push('quotation')
  if (['active','in_progress','completed'].includes(status)) types.push('proforma','invoice')
  if (status === 'completed') types.push('receipt')
  return types.map(t => ({ type: t, ...DOC_TYPE_META[t] }))
}

// ── Finance / Ledger ──
// Expense categories for the plain-language expense form. Picking a
// department attributes the cost to that department (cost of service);
// leaving it blank posts as a company-wide operating expense.
export const EXPENSE_CATEGORIES = [
  { value: 'subcontractor', label: 'Subcontractor / Consignment' },
  { value: 'rent', label: 'Sewa' },
  { value: 'utilities', label: 'Utiliti' },
  { value: 'salary', label: 'Gaji' },
  { value: 'commission', label: 'Komisen' },
  { value: 'other', label: 'Lain-lain' },
]

export const LEDGER_ACCOUNT_LABELS = {
  bank_mbb: 'Bank Maybank',
  bank_cimb: 'Bank CIMB',
  ar: 'Belum Diterima (Outstanding)',
  equity_opening: 'Baki Permulaan',
}
export const revenueAccount = (dept) => `revenue_${dept}`
export const cogsAccount = (dept) => `cogs_${dept}`
export const opexAccount = (cat) => `opex_${cat}`
export const bankAccount = (bank) => `bank_${bank}`

export function ledgerAccountLabel(key) {
  if (LEDGER_ACCOUNT_LABELS[key]) return LEDGER_ACCOUNT_LABELS[key]
  if (key?.startsWith('revenue_')) return `Revenue — ${DEPT[key.slice(8)]?.label || key.slice(8)}`
  if (key?.startsWith('cogs_')) return `Kos Perkhidmatan — ${DEPT[key.slice(5)]?.label || key.slice(5)}`
  if (key?.startsWith('opex_')) return `Expense — ${EXPENSE_CATEGORIES.find(c => c.value === key.slice(5))?.label || key.slice(5)}`
  if (key?.startsWith('bank_')) return LEDGER_ACCOUNT_LABELS[key] || key
  return key || '—'
}

// A company customer's "name" field holds the PIC, not the company — so
// anywhere a customer needs a single identifying label (dropdowns, lists),
// the company name should lead for company accounts.
export const customerDisplayName = (c) => c ? (c.customer_type === 'company' ? (c.company || c.name) : c.name) : ''

// ── Helpers ──
export const formatCurrency = (v) => v != null ? `RM ${Number(v).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
// Back-compat alias — formatRM now always renders 2 decimals via formatCurrency
export const formatRM = formatCurrency
export const formatRMShort = (v) => { if (v==null) return '—'; return v>=1000 ? `RM ${(v/1000).toFixed(v%1000===0?0:1)}k` : `RM ${v}` }
export const formatDate = (d) => d ? new Date(d).toLocaleDateString('ms-MY', { day:'numeric', month:'short', year:'numeric', timeZone:'Asia/Kuala_Lumpur' }) : '—'
export const formatDateTime = (d) => { if(!d) return ''; const t=new Date(d); return t.toLocaleDateString('ms-MY',{day:'numeric',month:'short',timeZone:'Asia/Kuala_Lumpur'})+', '+t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kuala_Lumpur'}) }
export const daysUntil = (deadline) => { if(!deadline) return null; const today=new Date(); today.setHours(0,0,0,0); return Math.ceil((new Date(deadline)-today)/(864e5)) }
