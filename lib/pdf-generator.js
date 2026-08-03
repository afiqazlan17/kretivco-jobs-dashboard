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

// Space reserved for the company logo, top-left — currently blank pending
// the logo image asset; company text starts after this gap either way, so
// dropping in an image later needs no layout changes.
const LOGO_W = 22

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
function labelValueRight(doc, label, value, xRight, y, size = 9) {
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

function labelValueLeft(doc, label, value, x, y, size = 9) {
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

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const contentW = pageW - margin * 2
  let y = margin

  const {
    docNumber, jobRefs, items, subtotal, delivery, discount, total, finalValue, balanceDue,
    bank: bankKey, staffName, customerName, customerCompany, addressLine1, addressLine2,
    jobTitle, showSize,
  } = meta
  const isMulti = jobRefs.length > 1
  const bank = BANK_DETAILS[bankKey] || BANK_DETAILS.mbb

  // ── Header: company block (left, after reserved logo gap) ──
  const textX = margin + LOGO_W + 4
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(BRAND.name, textX, y + 5)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(80, 80, 80)
  doc.text(BRAND.ssm, textX, y + 10)
  doc.text(BRAND.addressLine1, textX, y + 15)
  doc.text(BRAND.addressLine2, textX, y + 20)

  // ── Header: doc title + meta (right) ──
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(cfg.title, pageW - margin, y + 6, { align: 'right' })
  labelValueRight(doc, `${cfg.noLabel}: `, docNumber, pageW - margin, y + 13)
  labelValueRight(doc, 'Date: ', fmtDate(), pageW - margin, y + 18)
  labelValueRight(doc, 'By: ', staffName || '—', pageW - margin, y + 23)

  y += 27
  doc.setDrawColor(200, 200, 200)
  doc.line(margin, y, pageW - margin, y)
  y += 8

  // ── Customer ──
  doc.setTextColor(20, 20, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Customer:', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(customerCompany ? `${customerName} (${customerCompany})` : (customerName || '—'), margin, y)
  y += 5
  if (addressLine1) { doc.text(addressLine1, margin, y); y += 5 }
  if (addressLine2) { doc.text(addressLine2, margin, y); y += 5 }
  y += 2

  labelValueLeft(doc, 'Title: ', jobTitle || '—', margin, y, 9)
  y += 4

  if (isMulti) {
    y += 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Job Ref:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(jobRefs.join(', '), margin + 15, y, { maxWidth: contentW - 20 })
  }
  y += 6

  // ── Line Items Table ──
  const cols = type === 'receipt'
    ? ['No', 'Description', 'Payment Method', 'Amount']
    : (showSize ? ['No', 'Description', 'Size', 'Unit', 'Price', 'Amount'] : ['No', 'Description', 'Unit', 'Price', 'Amount'])

  let itemCounter = 0
  const tableBody = items.map((it) => {
    if (it.isSectionHeader) {
      return [{ content: it.label, colSpan: cols.length, styles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 8, halign: 'left' } }]
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

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [cols],
    body: tableBody,
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3.5, lineColor: [220, 220, 220], lineWidth: 0.3, textColor: [20, 20, 20] },
    headStyles: { fillColor: [240, 240, 240], textColor: [20, 20, 20], fontStyle: 'bold', fontSize: 8, halign: 'left' },
    columnStyles: type === 'receipt'
      ? { 0: { cellWidth: 14, halign: 'center' }, 2: { cellWidth: 40 }, 3: { cellWidth: 30, halign: 'right' } }
      : { 0: { cellWidth: 14, halign: 'center' }, [cols.length - 3]: { cellWidth: 16, halign: 'center' }, [cols.length - 2]: { cellWidth: 28, halign: 'right' }, [cols.length - 1]: { cellWidth: 30, halign: 'right' } },
  })

  y = doc.lastAutoTable.finalY + 6

  // ── Totals ──
  const xRight = pageW - margin
  if (type === 'receipt') {
    labelValueRight(doc, 'Amount Paid (MYR): ', fmtRM(finalValue), xRight, y, 10)
    y += 6
    labelValueRight(doc, 'Balance Due (MYR): ', fmtRM(balanceDue), xRight, y, 9)
    y += 8
  } else {
    labelValueRight(doc, 'Subtotal: ', fmtRM(subtotal), xRight, y, 9)
    y += 5.5
    labelValueRight(doc, 'Delivery: ', fmtRM(delivery), xRight, y, 9)
    y += 5.5
    labelValueRight(doc, 'Discount: ', `(${fmtRM(discount)})`, xRight, y, 9)
    y += 5.5
    labelValueRight(doc, 'Total (MYR): ', fmtRM(total), xRight, y, 10)
    y += 8
  }

  // The notes/thank-you/signature block below is a fixed unit — combined
  // docs (extra department header/subtotal rows) can push y far enough
  // that it no longer fits on the page.
  if (y + 75 > pageH - 15) {
    doc.addPage()
    y = margin
  }

  // ── Note ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)
  doc.text('Note:', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(60, 60, 60)
  notesFor(type, bank).forEach((line, i) => {
    doc.text(`${i + 1}. ${line}`, margin, y, { maxWidth: contentW })
    y += 4.2
  })
  y += 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(20, 20, 20)
  doc.text('Thank you for your business!', margin, y)
  y += 14

  // ── Signatures ──
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Issued by:', margin, y)
  doc.text('Accepted by:', pageW - margin - 60, y)
  doc.setDrawColor(20, 20, 20)
  doc.line(margin, y + 16, margin + 60, y + 16)
  doc.line(pageW - margin - 60, y + 16, pageW - margin, y + 16)

  // ── Save ──
  const filename = `${cfg.prefix}_${meta.filenamePart || 'document'}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)

  return { filename, docNumber, total: type === 'receipt' ? finalValue : total }
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
    showSize: !!DEPT[job.department]?.usesSize,
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
  const anySize = jobs.some(j => DEPT[j.department]?.usesSize)

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
