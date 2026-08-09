// ============================================================
// lib/constants.js — Kretivco Design System Constants
// ============================================================

// Finance's Report sub-menu — shared between AppShell's sidebar (which
// renders the picker) and the Finance page (which renders whichever one is
// selected). Scoped to only the report types relevant to a services/print
// agency — no Stock/Warranty/Agent Commission/e-Filing.
export const REPORT_MENU = [
  { key: 'overview', label: 'Ringkasan', icon: '📊', built: true },
  { key: 'gl', label: 'General Ledger Report', icon: '📒', built: true },
  { key: 'trial_balance', label: 'Trial Balance', icon: '⚖️', built: true },
  { key: 'balance_sheet', label: 'Balance Sheet', icon: '🧾', built: true },
  { key: 'cash_book', label: 'Cash Book Statement', icon: '💵', built: true },
  { key: 'aging', label: 'Aging Report', icon: '⏳', built: true },
  { key: 'bank_recon', label: 'Bank Reconciliation Report', icon: '🏦', built: true },
  { key: 'sales', label: 'Sales Report', icon: '📈', built: true },
  { key: 'installment', label: 'Installment Outstanding', icon: '📅', built: true },
]

// Job's sub-menu — same pattern as REPORT_MENU above. "new" is an action
// (opens the create-job modal) rather than a view, so it's flagged
// separately; everything else is a filtered/sorted slice of the same job
// list, switched via /jobs?view=<key>.
export const JOB_MENU = [
  { key: 'new', label: 'Job Baru', icon: '➕', action: true },
  { key: 'queue', label: 'Ticket Queue', icon: '📋' },
  { key: 'aging', label: 'Aging Ticket', icon: '⏳' },
  { key: 'hold', label: 'Pending/Suspended', icon: '⏸' },
  { key: 'mine', label: 'My Tickets', icon: '🙋' },
]

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

// Pre-packaged products staff can pick directly instead of typing a job's
// items by hand — only relevant for Product Sale jobs (Client Project is
// custom work with no fixed bundle). A product line (e.g. Undangan.my)
// prices differently depending on who's buying: an end user paying Kretivco
// directly gets the full bundle (card + banner + signage); a vendor like a
// wedding planner reselling Kretivco as their printer gets a cheaper,
// card-only rate. The chosen tier's price and item list get baked into the
// job's line_items at creation.
export const PACKAGE_CATALOG = {
  print: [
    {
      key: 'undangan_my',
      label: 'Undangan.my',
      segments: [
        {
          key: 'end_user',
          label: 'End User — Customer Terus',
          packages: [
            {
              key: 'vip',
              label: 'Undangan.my : Pakej Kad Kahwin VIP',
              items: [
                '1x Kad Kahwin Digital Undangan.my',
                'Kad Kahwin 4x8in Poskad Beserta Envelope',
                '1x Banner 3x6ft',
                '4x Arrow 2x2ft',
                '2x Bunting 2x5ft',
              ],
              tiers: [
                { pcs: 100, price: 380 },
                { pcs: 200, price: 410 },
                { pcs: 300, price: 448 },
                { pcs: 400, price: 468 },
                { pcs: 500, price: 485 },
              ],
            },
          ],
        },
        {
          key: 'vendor',
          label: 'Vendor — Wedding Planner',
          packages: [
            {
              key: 'dloveweddingplanner',
              label: 'Undangan.my : Pakej DLoveWeddingPlanner',
              items: [
                'Kad Digital',
                'Kad Fizikal {pcs}pcs',
                'Welcome Board',
              ],
              tiers: [
                { pcs: 100, price: 197 },
                { pcs: 200, price: 274 },
              ],
            },
          ],
        },
      ],
    },
  ],
}

// Product lines with a package catalog for a department (only meaningful
// for Product Sale jobs).
export function productLinesFor(dept) {
  return PACKAGE_CATALOG[dept] || []
}

export function segmentsFor(dept, lineKey) {
  return productLinesFor(dept).find(l => l.key === lineKey)?.segments || []
}

// Flatten a product line + segment's packages into single-dropdown options —
// value encodes "pkgKey:pcs" so a selection round-trips via findPackageTier.
export function packageTierOptions(dept, lineKey, segmentKey) {
  const seg = segmentsFor(dept, lineKey).find(s => s.key === segmentKey)
  if (!seg) return []
  return seg.packages.flatMap(pkg => pkg.tiers.map(tier => ({
    value: `${pkg.key}:${tier.pcs}`,
    label: `${pkg.label} — ${tier.pcs}pcs (${formatCurrency(tier.price)})`,
    pkg, tier,
  })))
}

export function findPackageTier(dept, lineKey, segmentKey, value) {
  if (!value) return null
  return packageTierOptions(dept, lineKey, segmentKey).find(o => o.value === value) || null
}

// A package's item list for a specific tier, with "{pcs}" tokens filled in.
export function packageItemsFor(pkg, tier) {
  return pkg.items.map(i => i.replace('{pcs}', tier.pcs))
}

export const JOB_TYPE = {
  client_project: { label: 'Client Project', color: '#3A86FF', desc: 'Kretivco buat kerja custom untuk customer' },
  product_sale:   { label: 'Product Sale',   color: '#10B981', desc: 'Customer beli product sedia ada Kretivco' },
}

export const BANK = {
  mbb:  { label: 'Maybank', code: 'MBB',  color: '#FFC107', acct: '5621-0668-8317', name: 'KRETIVCO MEDIAWORKS' },
  cimb: { label: 'CIMB',    code: 'CIMB', color: '#E53935', acct: 'XXXX-XXXX-XXXX', name: 'KRETIVCO MEDIAWORKS' },
}

// ITIL-style ticket lifecycle from "new" onward: a job stays "potential"
// while it's still a quotation (nothing confirmed yet); once the customer
// confirms, it becomes "new" — sitting in its department's queue, unclaimed
// (no PIC). Staff claim it ("Ambil Ticket"), which sets PIC and moves it to
// "assigned"; they move it to "active" themselves once work actually starts.
export const STATUS = {
  potential: { label: 'Potential', color: '#6366F1' },
  new:       { label: 'New',       color: '#F59E0B' },
  assigned:  { label: 'Assigned',  color: '#3A86FF' },
  active:    { label: 'Active',    color: '#10B981' },
  completed: { label: 'Completed', color: '#6B7280' },
  cancelled: { label: 'Cancelled', color: '#EF4444' },
}

// Forward flow
export const STATUS_FLOW = {
  potential: ['new'],
  new:       ['assigned'],
  assigned:  ['active'],
  active:    ['completed'],
  completed: [],
  cancelled: [],
}

// Rollback flow — which statuses can go back to
export const STATUS_ROLLBACK = {
  potential: [],
  new:       ['potential'],
  assigned:  ['new'],
  active:    ['assigned'],
  completed: ['active'],
  cancelled: [],
}

// Ticket hold state — orthogonal to the pipeline stage above (a job can be
// "Active" and "Pending" at the same time, e.g. waiting on customer
// confirmation while work is technically in progress). No automatic SLA
// timer is wired to this yet — it's a visible flag + reason only.
export const HOLD_STATUS = {
  pending:   { label: 'Pending',   color: '#F59E0B', icon: '⏸' },
  suspended: { label: 'Suspended', color: '#EF4444', icon: '⛔' },
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

// Document generation is a manual staff action, not gated by ticket status —
// staff decide when a quotation, invoice, or receipt actually needs to go
// out (e.g. invoicing on deposit, not waiting for a specific ticket stage).
// A cancelled job is the one case nothing should still be generated for.
export function availableDocTypes(status) {
  if (status === 'cancelled') return []
  return ['quotation', 'proforma', 'invoice', 'receipt'].map(t => ({ type: t, ...DOC_TYPE_META[t] }))
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

// A minimal chart-of-accounts view over the same account keys already used
// for posting — short code + accounting type (Asset/Liability/Income/
// Expense/Equity), for reports (General Ledger, Trial Balance) that need to
// group/label accounts like a real COA instead of raw internal keys.
export function ledgerAccountMeta(key) {
  if (key === 'ar') return { code: 'CA-AR', label: ledgerAccountLabel(key), type: 'Current Asset' }
  if (key === 'equity_opening') return { code: 'EQ-OPEN', label: ledgerAccountLabel(key), type: 'Equity' }
  if (key?.startsWith('bank_')) return { code: `CA-BANK-${key.slice(5).toUpperCase()}`, label: ledgerAccountLabel(key), type: 'Current Asset' }
  if (key?.startsWith('revenue_')) return { code: `IN-${key.slice(8).toUpperCase()}`, label: ledgerAccountLabel(key), type: 'Income' }
  if (key?.startsWith('cogs_')) return { code: `CE-${key.slice(5).toUpperCase()}`, label: ledgerAccountLabel(key), type: 'Direct Expense' }
  if (key?.startsWith('opex_')) return { code: `OE-${key.slice(5).toUpperCase()}`, label: ledgerAccountLabel(key), type: 'Operating Expense' }
  return { code: key || '—', label: ledgerAccountLabel(key), type: '—' }
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
export const formatDate = (d) => d ? new Date(d).toLocaleDateString('ms-MY', { day:'numeric', month:'long', year:'numeric', timeZone:'Asia/Kuala_Lumpur' }) : '—'
export const formatDateTime = (d) => { if(!d) return ''; const t=new Date(d); return t.toLocaleDateString('ms-MY',{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Kuala_Lumpur'})+', '+t.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:true,timeZone:'Asia/Kuala_Lumpur'}) }
export const daysUntil = (deadline) => { if(!deadline) return null; const today=new Date(); today.setHours(0,0,0,0); return Math.ceil((new Date(deadline)-today)/(864e5)) }
