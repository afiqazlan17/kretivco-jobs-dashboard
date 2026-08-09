// ============================================================
// lib/pdf-generator.js — Kretivco PDF Document Generator
// Generates Quotation, Proforma Invoice, Invoice, and Receipt PDFs
// matching the official Kretivco Mediaworks template. Uses dynamic
// import to avoid SSR issues.
// ============================================================
import { DEPT } from './constants'

// ── Kretivco Brand Constants ──
export const BRAND = {
  name: 'Kretivco Mediaworks',
  ssm: '(SA0463354-A)',
  addressLine1: 'No.15A, Jalan USJ1/19',
  addressLine2: '47600, Subang Jaya, Selangor',
  email: 'kretivco@gmail.com',
  phone: '+6011-21149204',
  phone2: '+6019-3663805',
}

// ── Layout constants (points, matching the approved template exactly) ──
// Pulled from the reference PDFs via PyMuPDF text/drawing extraction, not
// eyeballed — every x/y below is a real coordinate from that file.
const PAGE_H = 841.9
const LEFT = 45
const RIGHT = 513 // content right edge (table/header-value right edge)
const LOGO_X = 50, LOGO_Y = 45, LOGO_W = 72
const TEXT_X = 135.5 // company block left, after logo
const LOGO_URL = '/kretivco-logo.png'

// Fetches the logo and converts it to a data URL — jsPDF's addImage needs
// the actual image data, not a URL, when running client-side.
let logoDataUrlPromise = null
function loadLogoDataUrl() {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(LOGO_URL)
      .then(res => res.ok ? res.blob() : null)
      .then(blob => blob ? new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      }) : null)
      .catch(() => null)
  }
  return logoDataUrlPromise
}

export const BANK_DETAILS = {
  mbb:  { label: 'MAYBANK', acct: '5621-0668-8317', name: 'KRETIVCO MEDIAWORKS' },
  cimb: { label: 'CIMB', acct: 'XXXX-XXXX-XXXX', name: 'KRETIVCO MEDIAWORKS' },
}

export const DOC_TYPES = {
  quotation: { title: 'QUOTATION', prefix: 'QT', noLabel: 'QNo#' },
  invoice:   { title: 'INVOICE', prefix: 'INV', noLabel: 'Invoice No#' },
  proforma:  { title: 'PROFORMA INVOICE', prefix: 'PI', noLabel: 'Invoice No#' },
  receipt:   { title: 'RECEIPT', prefix: 'RC', noLabel: 'Receipt No#' },
}

// Fixed terms per document type — not staff-editable, matches the approved
// Kretivco template wording. Bank details are interpolated from the job's
// own bank (set at job creation), never chosen at document time.
export function notesFor(type, bank) {
  const payBank = `Please make payment to ${bank.label} ${bank.acct} ${bank.name}.`
  const emailLine = `Email us at ${BRAND.email}`
  const waLine = `Whatsapp us at ${BRAND.phone} / ${BRAND.phone2}`
  if (type === 'quotation') {
    return [
      payBank,
      'Please indicate quotation number when making payment to us.',
      'Full payment needed for invoice below RM2000 and 80% deposit must be paid before making the first draft for invoice price RM2000 and above.',
      'Progress will be done in 14 days after final draft has been confirmed by customer.',
      'Deposit is not refundable after the booking confirmed and first draft has been made.',
      emailLine, waLine,
    ]
  }
  if (type === 'receipt') {
    return [
      'This receipt confirms payment received for the above job/invoice.',
      'Please retain this receipt for your reference.',
      'For any discrepancy, please contact us within 7 days of receipt date.',
      emailLine, waLine,
    ]
  }
  // invoice + proforma
  return [
    payBank,
    'Please indicate invoice number when making payment to us.',
    'Payment due within 7 days from the invoice date.',
    'Late payment may be subject to a surcharge as agreed in the service agreement.',
    emailLine, waLine,
  ]
}

// ── Helpers ──
const fmtRM = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => {
  const dt = d ? new Date(d) : new Date()
  const dd = String(dt.getDate()).padStart(2, '0')
  const mm = String(dt.getMonth() + 1).padStart(2, '0')
  const yy = String(dt.getFullYear()).slice(-2)
  return `${dd}/${mm}/${yy}`
}

// ── Generate Doc Number ──
export function genDocNumber(type, jobId) {
  const cfg = DOC_TYPES[type]
  const now = new Date()
  const yr = now.getFullYear()
  const seq = jobId?.replace(/\D/g, '').slice(-3) || '001'
  return `${cfg.prefix}-${yr}-${seq}`
}

// Draws "label" (bold) immediately followed by "value" (normal), with the
// combined text's right edge landing at xRight — used for the header's
// doc-no/date/by lines and the totals block.
function labelValueRight(doc, label, value, xRight, y, size = 10) {
  doc.setFontSize(size)
  doc.setFont('helvetica', 'normal')
  const valueW = doc.getTextWidth(value)
  doc.setFont('helvetica', 'bold')
  const labelW = doc.getTextWidth(label)
  const startX = xRight - labelW - valueW
  doc.text(label, startX, y)
  doc.setFont('helvetica', 'normal')
  doc.text(value, startX + labelW, y)
}

function labelValueLeft(doc, label, value, x, y, size = 10) {
  doc.setFontSize(size)
  doc.setFont('helvetica', 'bold')
  doc.text(label, x, y)
  const labelW = doc.getTextWidth(label)
  doc.setFont('helvetica', 'normal')
  doc.text(value, x + labelW, y)
}

// ── Core Renderer — shared by single-job and combined documents ──
// meta: { docNumber, jobRefs, items, subtotal, delivery, discount, total,
//   finalValue, balanceDue, bank, staffName, customerName, customerCompany,
//   addressLine1, addressLine2, jobTitle, showSize, filenamePart }
// items: plain line items ({item,desc,size,qty,price}), or for combined docs a
// flattened list that may include { isSectionHeader, label } and
// { isSubtotal, label, value } markers.
async function renderDoc(type, meta, customer) {
  const cfg = DOC_TYPES[type]
  if (!cfg) throw new Error(`Unknown document type: ${type}`)

  const { default: jsPDF } = await import('jspdf')
  await import('jspdf-autotable')

  const doc = new jsPDF('p', 'pt', 'a4')
  const contentW = RIGHT - LEFT

  const {
    docNumber, jobRefs, items, subtotal, delivery, discount, total, finalValue, balanceDue,
    bank: bankKey, staffName, customerName, customerCompany, addressLine1, addressLine2,
    jobTitle, showSize,
  } = meta
  const isMulti = jobRefs.length > 1
  const bank = BANK_DETAILS[bankKey] || BANK_DETAILS.mbb

  // ── Header: logo + company block ──
  const logoDataUrl = await loadLogoDataUrl()
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'PNG', LOGO_X, LOGO_Y, LOGO_W, LOGO_W) } catch { /* ignore malformed image */ }
  }
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(BRAND.name, TEXT_X, 65.6)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(BRAND.ssm, TEXT_X, 78.2)
  doc.text(BRAND.addressLine1, TEXT_X, 90.0)
  doc.text(BRAND.addressLine2, TEXT_X, 101.8)

  // ── Header: doc title + meta (right) ──
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text(cfg.title, RIGHT, 61.2, { align: 'right' })
  labelValueRight(doc, `${cfg.noLabel}: `, docNumber, RIGHT, 79.8)
  labelValueRight(doc, 'Date: ', fmtDate(), RIGHT, 94.8)
  labelValueRight(doc, 'By: ', staffName || '—', RIGHT, 109.8)

  doc.setDrawColor(153, 153, 153)
  doc.setLineWidth(0.75)
  doc.line(LEFT, 128.2, RIGHT, 128.2)

  // ── Customer — fixed slots (matches the template even when a line is
  // blank) so Title/table below always land at the same position ──
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Customer:', LEFT, 159.4)
  doc.setFont('helvetica', 'normal')
  doc.text(customerName || '—', LEFT, 173.4)
  if (customerCompany) doc.text(customerCompany, LEFT, 186.4)
  if (addressLine1) doc.text(addressLine1, LEFT, 199.4)
  if (addressLine2) doc.text(addressLine2, LEFT, 212.4)

  labelValueLeft(doc, 'Title: ', jobTitle || '—', LEFT, 234.4)
  let y = 247.1

  if (isMulti) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Job Ref:', LEFT, y - 4)
    doc.setFont('helvetica', 'normal')
    doc.text(jobRefs.join(', '), LEFT + 40, y - 4, { maxWidth: contentW - 40 })
    y += 10
  }

  // ── Line Items Table ──
  const cols = type === 'receipt'
    ? ['No', 'Description', 'Payment Method', 'Amount']
    : (showSize ? ['No', 'Description', 'Size', 'Unit', 'Price', 'Amount'] : ['No', 'Description', 'Unit', 'Price', 'Amount'])

  let itemCounter = 0
  const tableBody = items.map((it) => {
    if (it.isSectionHeader) {
      return [{ content: it.label, colSpan: cols.length, styles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 10, halign: 'left' } }]
    }
    if (it.isSubtotal) {
      const pad = cols.length - 2
      return [
        { content: '', colSpan: pad, styles: { fillColor: [250, 250, 250] } },
        { content: it.label, styles: { fontStyle: 'bold', fillColor: [250, 250, 250] } },
        { content: fmtRM(it.value), styles: { fontStyle: 'bold', fillColor: [250, 250, 250], halign: 'right' } },
      ]
    }
    itemCounter++
    const desc = it.desc ? `${it.item || '—'}\n${it.desc}` : (it.item || '—')
    if (type === 'receipt') {
      return [itemCounter, desc, it.paymentMethod || 'Bank Transfer', fmtRM((Number(it.qty) || 1) * (Number(it.price) || 0))]
    }
    const row = [itemCounter, desc]
    if (showSize) row.push(it.size || '—')
    row.push(it.qty || 1, fmtRM(it.price), fmtRM((Number(it.qty) || 1) * (Number(it.price) || 0)))
    return row
  })

  const receiptCols = { 0: { cellWidth: 35, halign: 'center' }, 1: { cellWidth: 208 }, 2: { cellWidth: 145 }, 3: { cellWidth: 80, halign: 'right' } }
  const stdCols = showSize
    ? { 0: { cellWidth: 35, halign: 'center' }, 1: { cellWidth: 178 }, 2: { cellWidth: 50 }, 3: { cellWidth: 60, halign: 'center' }, 4: { cellWidth: 70, halign: 'right' }, 5: { cellWidth: 75, halign: 'right' } }
    : { 0: { cellWidth: 35, halign: 'center' }, 1: { cellWidth: 228 }, 2: { cellWidth: 60, halign: 'center' }, 3: { cellWidth: 70, halign: 'right' }, 4: { cellWidth: 75, halign: 'right' } }

  doc.autoTable({
    startY: y,
    margin: { left: LEFT, right: 595.3 - RIGHT },
    head: [cols],
    body: tableBody,
    styles: { font: 'helvetica', fontSize: 10, cellPadding: { top: 5.5, bottom: 5.5, left: 5, right: 5 }, lineColor: [0, 0, 0], lineWidth: 0.5, textColor: [20, 20, 20] },
    headStyles: { fillColor: [242, 242, 242], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 10, halign: 'left' },
    columnStyles: type === 'receipt' ? receiptCols : stdCols,
  })

  y = doc.lastAutoTable.finalY + 33.15

  // ── Totals ──
  let lastTotalsY = y
  if (type === 'receipt') {
    labelValueRight(doc, 'Amount Paid (MYR): ', fmtRM(finalValue), RIGHT, y)
    y += 16
    labelValueRight(doc, 'Balance Due (MYR): ', fmtRM(balanceDue), RIGHT, y)
    lastTotalsY = y
  } else {
    labelValueRight(doc, 'Subtotal: ', fmtRM(subtotal), RIGHT, y)
    y += 16
    labelValueRight(doc, 'Delivery: ', fmtRM(delivery), RIGHT, y)
    y += 16
    labelValueRight(doc, 'Discount: ', `(${fmtRM(discount)})`, RIGHT, y)
    y += 16
    labelValueRight(doc, 'Total (MYR): ', fmtRM(total), RIGHT, y)
    lastTotalsY = y
  }

  // The notes/thank-you/signature block below is a fixed ~200pt unit —
  // combined docs (extra department header/subtotal rows) can push y far
  // enough that it no longer fits on the page.
  if (lastTotalsY + 210 > PAGE_H - 40) {
    doc.addPage()
    lastTotalsY = 60
  }

  // ── Note ── every printed line (a new numbered point or a wrapped
  // continuation) advances by the same 14pt step, matching the template.
  let ny = lastTotalsY + 35.5
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  doc.text('Note:', LEFT, ny)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(60, 60, 60)
  let lineY = ny + 15
  let firstLine = true
  notesFor(type, bank).forEach((line, i) => {
    const wrapped = doc.splitTextToSize(`${i + 1}. ${line}`, contentW)
    wrapped.forEach(l => {
      if (!firstLine) lineY += 14
      doc.text(l, LEFT, lineY)
      firstLine = false
    })
  })
  ny = lineY + 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(20, 20, 20)
  doc.text('Thank you for your business!', LEFT, ny)

  // ── Signatures ──
  ny += 27
  doc.setFont('helvetica', 'bold')
  doc.text('Issued by:', 50.5, ny)
  doc.text('Accepted by:', 284.5, ny)
  doc.setDrawColor(20, 20, 20)
  doc.setLineWidth(0.5)
  doc.line(50.5, ny + 37, 217.2, ny + 37)
  doc.line(284.5, ny + 37, 451.2, ny + 37)

  // ── Save ──
  const filename = `${cfg.prefix}_${meta.filenamePart || 'document'}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)

  // Also hand back the raw PDF bytes so the caller can archive a copy on
  // the job itself, not just leave the download on whichever PC generated it.
  const blob = doc.output('blob')
  return { filename, docNumber, total: type === 'receipt' ? finalValue : total, blob }
}

// ── Single-job document ──
// overrides (from the live preview editor): customerName, customerCompany,
// addressLine1, addressLine2, jobTitle, staffName, items, delivery, discount,
// paymentMethod, amountPaid, balanceDue — all optional, fall back to the
// job/customer's own data when omitted.
export async function generateDocument(type, job, customer, overrides = {}) {
  const items = overrides.items || job.line_items || []
  const subtotal = items.reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0)
  const delivery = Number(overrides.delivery) || 0
  const discount = Number(overrides.discount) || 0
  const total = subtotal + delivery - discount
  const amountPaid = overrides.amountPaid != null ? Number(overrides.amountPaid) : (job.final_value || total)
  const balanceDue = overrides.balanceDue != null ? Number(overrides.balanceDue) : 0

  return renderDoc(type, {
    docNumber: overrides.docNumber || genDocNumber(type, job.job_id),
    jobRefs: [job.job_id || '—'],
    items: type === 'receipt' ? items.map(it => ({ ...it, paymentMethod: overrides.paymentMethod })) : items,
    subtotal, delivery, discount, total,
    finalValue: amountPaid, balanceDue,
    bank: job.bank,
    staffName: overrides.staffName || '',
    customerName: overrides.customerName ?? customer?.name ?? job.customer_name,
    customerCompany: overrides.customerCompany ?? customer?.company ?? job.customer_company,
    addressLine1: overrides.addressLine1 || '',
    addressLine2: overrides.addressLine2 || '',
    jobTitle: overrides.jobTitle || job.job_type,
    // Package bundles (e.g. Undangan.my) are tagged noSize on every item —
    // hide the Size column unless a non-package item is present.
    showSize: !!DEPT[job.department]?.usesSize && items.some(li => !li.noSize),
    filenamePart: job.job_id || 'document',
  }, customer)
}

// ── Combined document across multiple jobs for the same customer ──
// Used when one payment (e.g. a single cheque) covers several jobs across
// different departments — the customer gets one document, but each job's
// own value/line items stay attributed to its department underneath.
export async function generateCombinedDocument(type, jobs, customer, overrides = {}) {
  if (!jobs || jobs.length < 2) throw new Error('Combined document requires at least 2 jobs')

  const items = []
  let grandSubtotal = 0
  let grandFinal = 0
  const anySize = jobs.some(j => DEPT[j.department]?.usesSize && (j.line_items || []).some(li => !li.noSize))

  jobs.forEach(job => {
    const deptLabel = DEPT[job.department]?.label || job.department || '—'
    const jobItems = job.line_items || []
    const subtotal = jobItems.reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0)
    items.push({ isSectionHeader: true, label: `${deptLabel} — ${job.job_id}` })
    jobItems.forEach(li => items.push({ ...li, paymentMethod: overrides.paymentMethod }))
    items.push({ isSubtotal: true, label: `Subtotal ${deptLabel}`, value: subtotal })
    grandSubtotal += subtotal
    grandFinal += (job.final_value || subtotal)
  })

  const delivery = Number(overrides.delivery) || 0
  const discount = Number(overrides.discount) || 0
  const total = grandSubtotal + delivery - discount
  const amountPaid = overrides.amountPaid != null ? Number(overrides.amountPaid) : (grandFinal || total)
  const balanceDue = overrides.balanceDue != null ? Number(overrides.balanceDue) : 0
  const jobRefs = jobs.map(j => j.job_id || '—')

  return renderDoc(type, {
    docNumber: overrides.docNumber || `${genDocNumber(type, jobs[0].job_id)}-C`,
    jobRefs,
    items,
    subtotal: grandSubtotal, delivery, discount, total,
    finalValue: amountPaid, balanceDue,
    bank: jobs[0].bank,
    staffName: overrides.staffName || '',
    customerName: overrides.customerName ?? customer?.name ?? jobs[0].customer_name,
    customerCompany: overrides.customerCompany ?? customer?.company ?? jobs[0].customer_company,
    addressLine1: overrides.addressLine1 || '',
    addressLine2: overrides.addressLine2 || '',
    jobTitle: overrides.jobTitle || 'Multiple Jobs',
    showSize: anySize,
    filenamePart: `MULTI_${customer?.customer_id || jobRefs.join('_')}`,
  }, customer)
}
