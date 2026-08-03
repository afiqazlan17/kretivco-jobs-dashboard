// ============================================================
// lib/pdf-generator.js — Kretivco PDF Document Generator
// Generates Quotation, Invoice, and Receipt PDFs
// Uses dynamic import to avoid SSR issues
// ============================================================
import { DEPT } from './constants'

// ── Kretivco Brand Constants ──
const BRAND = {
  name: 'KRETIVCO MEDIAWORKS',
  ssm: '201803023252 (SA0463354-A)',
  address: 'No.15A, Jalan USJ1/19, 47600 Subang Jaya, Selangor, Malaysia',
  phone: '+6011-2114 9204',
  email: 'kretivco@gmail.com',
  website: 'www.kretiv.co',
  tagline: 'Ideas. Innovation. Impact.',
  phone2: '+6019-3663805',
  primary: '#C8194A',    // magenta
  dark: '#1A1025',
  muted: '#6B6080',
  light: '#F9F8FB',
  border: '#E8E4ED',
}

const BANK_DETAILS = {
  mbb:  { label: 'MAYBANK', acct: '5621-0668-8317', name: 'KRETIVCO MEDIAWORKS' },
  cimb: { label: 'CIMB', acct: 'XXXX-XXXX-XXXX', name: 'KRETIVCO MEDIAWORKS' },
}

const DOC_TYPES = {
  quotation: { title: 'SEBUT HARGA', prefix: 'QT', color: '#6366F1' },
  invoice:   { title: 'INVOIS', prefix: 'INV', color: '#10B981' },
  proforma:  { title: 'INVOIS PROFORMA', prefix: 'PI', color: '#3A86FF' },
  receipt:   { title: 'RESIT', prefix: 'RC', color: '#E85D04' },
}

// ── Helpers ──
const fmtRM = (v) => `RM ${Number(v || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => {
  if (!d) return new Date().toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })
  return new Date(d).toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Generate Doc Number ──
function genDocNumber(type, jobId) {
  const cfg = DOC_TYPES[type]
  const now = new Date()
  const yr = now.getFullYear()
  const seq = jobId?.replace(/\D/g, '').slice(-3) || '001'
  return `${cfg.prefix}-${yr}-${seq}`
}

// ── Core Renderer — shared by single-job and combined documents ──
// meta: { docNumber, jobRefs: string[], items, total, finalValue, notes, bank, customerNameFallback, customerCompanyFallback, filenamePart }
// items: either plain line items ({item,desc,size,qty,price}), or for combined docs, a
// flattened list that may include { isSectionHeader, label } and { isSubtotal, label, value } markers.
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

  const { docNumber, jobRefs, items, total, finalValue, notes, bank: bankKey, customerNameFallback, customerCompanyFallback } = meta
  const isMulti = jobRefs.length > 1

  // ── Header Bar ──
  doc.setFillColor(26, 16, 37) // #1A1025 dark
  doc.rect(0, 0, pageW, 38, 'F')

  // Brand accent line
  doc.setFillColor(200, 25, 74) // #C8194A magenta
  doc.rect(0, 38, pageW, 2, 'F')

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(255, 255, 255)
  doc.text(BRAND.name, margin, 17)

  // Tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(200, 200, 200)
  doc.text(BRAND.tagline, margin, 24)

  // SSM
  doc.setFontSize(7)
  doc.text(`SSM: ${BRAND.ssm}`, margin, 30)

  // Doc type on right
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text(cfg.title, pageW - margin, 20, { align: 'right' })

  y = 48

  // ── Document Info Row ──
  const infoBoxH = isMulti ? 30 : 22
  doc.setFillColor(249, 248, 251) // #F9F8FB
  doc.rect(margin, y, contentW, infoBoxH, 'F')
  doc.setDrawColor(232, 228, 237)
  doc.rect(margin, y, contentW, infoBoxH, 'S')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(26, 16, 37)

  const infoY = y + 8
  doc.text('No. Dokumen:', margin + 4, infoY)
  doc.setFont('helvetica', 'normal')
  doc.text(docNumber, margin + 32, infoY)

  doc.setFont('helvetica', 'bold')
  doc.text('Tarikh:', margin + 70, infoY)
  doc.setFont('helvetica', 'normal')
  doc.text(fmtDate(), margin + 85, infoY)

  if (!isMulti) {
    doc.setFont('helvetica', 'bold')
    doc.text('Rujukan Job:', margin + 125, infoY)
    doc.setFont('helvetica', 'normal')
    doc.text(jobRefs[0] || '—', margin + 150, infoY)
  }

  const infoY2 = y + 16
  doc.setFont('helvetica', 'bold')
  doc.text('Sah Sehingga:', margin + 4, infoY2)
  doc.setFont('helvetica', 'normal')
  if (type === 'quotation') {
    const validDate = new Date()
    validDate.setDate(validDate.getDate() + 30)
    doc.text(fmtDate(validDate), margin + 32, infoY2)
  } else {
    doc.text('—', margin + 32, infoY2)
  }

  if (type === 'receipt') {
    doc.setFont('helvetica', 'bold')
    doc.text('Status:', margin + 70, infoY2)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(16, 185, 129) // green
    doc.text('TELAH DIBAYAR', margin + 85, infoY2)
    doc.setTextColor(26, 16, 37)
  }

  if (isMulti) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(26, 16, 37)
    doc.text('Rujukan Job:', margin + 4, y + 24)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(jobRefs.join(', '), margin + 32, y + 24, { maxWidth: contentW - 40 })
    doc.setFontSize(8)
  }

  y += infoBoxH + 8

  // ── Two Column: Company Info | Customer Info ──
  const colW = contentW / 2 - 4

  // Company column
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(200, 25, 74)
  doc.text('DARIPADA', margin, y)
  y += 5
  doc.setTextColor(26, 16, 37)
  doc.setFontSize(9)
  doc.text(BRAND.name, margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 96, 128)
  doc.text(BRAND.address, margin, y + 5, { maxWidth: colW })
  doc.text(`Tel: ${BRAND.phone}`, margin, y + 13)
  doc.text(`Email: ${BRAND.email}`, margin, y + 18)

  // Customer column
  const cx = margin + colW + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(200, 25, 74)
  doc.text('KEPADA', cx, y - 5)
  doc.setTextColor(26, 16, 37)
  doc.setFontSize(9)
  doc.text(customer?.name || customerNameFallback || '—', cx, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 96, 128)
  if (customer?.company || customerCompanyFallback) {
    doc.text(customer?.company || customerCompanyFallback, cx, y + 5)
  }
  if (customer?.phone) {
    doc.text(`Tel: ${customer.phone}`, cx, y + 10)
  }
  if (customer?.email) {
    doc.text(`Email: ${customer.email}`, cx, y + 15)
  }

  y += 28

  // ── Line Items Table ──
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(26, 16, 37)
  doc.text('BUTIRAN ITEM', margin, y)
  y += 3

  let itemCounter = 0
  const tableBody = items.map((it) => {
    if (it.isSectionHeader) {
      return [{
        content: it.label, colSpan: 7,
        styles: { fillColor: [26, 16, 37], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8, halign: 'left' },
      }]
    }
    if (it.isSubtotal) {
      return [
        { content: '', colSpan: 5, styles: { fillColor: [249, 248, 251] } },
        { content: it.label, styles: { fontStyle: 'bold', fillColor: [249, 248, 251] } },
        { content: fmtRM(it.value), styles: { fontStyle: 'bold', fillColor: [249, 248, 251], halign: 'right' } },
      ]
    }
    itemCounter++
    return [
      itemCounter,
      it.item || '—',
      it.desc || '—',
      it.size || '—',
      it.qty || 1,
      fmtRM(it.price),
      { content: fmtRM((Number(it.qty) || 1) * (Number(it.price) || 0)), styles: { fontStyle: 'bold' } },
    ]
  })

  doc.autoTable({
    startY: y,
    margin: { left: margin, right: margin },
    head: [['#', 'Item', 'Keterangan', 'Saiz', 'Qty', 'Harga (RM)', 'Jumlah (RM)']],
    body: tableBody,
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 4,
      lineColor: [232, 228, 237],
      lineWidth: 0.3,
    },
    headStyles: {
      fillColor: [26, 16, 37],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 35 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 22 },
      4: { cellWidth: 14, halign: 'center' },
      5: { cellWidth: 28, halign: 'right' },
      6: { cellWidth: 30, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [249, 248, 251],
    },
  })

  y = doc.lastAutoTable.finalY + 4

  // ── Totals Section ──
  const totalsX = pageW - margin - 70
  const totalsW = 70

  // Subtotal
  doc.setFillColor(249, 248, 251)
  doc.rect(totalsX, y, totalsW, 9, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 96, 128)
  doc.text('Jumlah Kecil:', totalsX + 3, y + 6)
  doc.setTextColor(26, 16, 37)
  doc.text(fmtRM(total), totalsX + totalsW - 3, y + 6, { align: 'right' })
  y += 10

  // No SST for now
  doc.setFillColor(249, 248, 251)
  doc.rect(totalsX, y, totalsW, 9, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 96, 128)
  doc.text('SST (0%):', totalsX + 3, y + 6)
  doc.setTextColor(26, 16, 37)
  doc.text(fmtRM(0), totalsX + totalsW - 3, y + 6, { align: 'right' })
  y += 10

  // Grand Total
  doc.setFillColor(200, 25, 74)
  doc.rect(totalsX, y, totalsW, 12, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text('JUMLAH:', totalsX + 3, y + 8)
  doc.text(fmtRM(finalValue || total), totalsX + totalsW - 3, y + 8, { align: 'right' })
  y += 18

  // ── Notes ──
  if (notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(200, 25, 74)
    doc.text('NOTA:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 96, 128)
    doc.text(notes, margin, y + 5, { maxWidth: contentW / 2 })
    y += 14
  }

  // The bank/terms block, thank-you line, and signatures below are a fixed
  // ~110mm unit that must stay together — combined docs (extra department
  // header/subtotal rows) can push y far enough that it no longer fits.
  if (y + 110 > pageH - 22) {
    doc.addPage()
    y = margin
  }

  // ── Notes / Terms Section ──
  const bank = BANK_DETAILS[bankKey] || BANK_DETAILS.mbb
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(200, 25, 74)
  doc.text('Note:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(107, 96, 128)
  const notesList = [
    `1. Please make a payment to ${bank.label} ${bank.acct} ${bank.name}.`,
    `2. Please indicate ${DOC_TYPES[type]?.title?.toLowerCase() || 'document'} number when making payment to us.`,
    '3. Full payment needed for invoice below RM2000 and 80% deposit must be paid before making',
    '   the first draft for invoice price RM2000 and above.',
    '4. Progress will be done in 14 days after final draft has been confirmed by customer.',
    '5. Deposit is not refundable after the booking confirmed and first draft has been made.',
    `6. Email us at ${BRAND.email}`,
    `7. Whatsapp us at ${BRAND.phone}/${BRAND.phone2}`,
  ]
  notesList.forEach((t, i) => {
    doc.text(t, margin, y + 5 + (i * 4), { maxWidth: contentW })
  })
  y += 40

  // Thank you
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(26, 16, 37)
  doc.text('Thank you for your business!', margin, y)
  y += 12

  // ── Signature Lines ──
  const sigY = Math.max(y, pageH - 68)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(26, 16, 37)

  // Issued by
  doc.text('Issued by:', margin, sigY)
  doc.setDrawColor(26, 16, 37)
  doc.line(margin, sigY + 20, margin + 60, sigY + 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.text(BRAND.name, margin, sigY + 25)
  doc.setFont('helvetica', 'normal')
  doc.text(`15A, Jalan USJ 1/19`, margin, sigY + 29)
  doc.text(`47600 Subang Jaya, Selangor`, margin, sigY + 33)
  doc.text(`${BRAND.phone}`, margin, sigY + 37)
  doc.text(BRAND.email, margin, sigY + 41)

  // Accepted by
  doc.setFontSize(8)
  doc.text('Accepted by:', pageW - margin - 60, sigY)
  doc.line(pageW - margin - 60, sigY + 20, pageW - margin, sigY + 20)

  // ── Footer ──
  const footerY = pageH - 20

  // Footer accent line
  doc.setFillColor(200, 25, 74)
  doc.rect(0, footerY - 2, pageW, 1, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(107, 96, 128)
  doc.text(BRAND.address, pageW / 2, footerY + 3, { align: 'center' })
  doc.text(`${BRAND.phone}  |  ${BRAND.email}  |  ${BRAND.website}`, pageW / 2, footerY + 7, { align: 'center' })

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6)
  doc.setTextColor(155, 147, 168)
  doc.text('Dokumen ini dijana secara automatik oleh Kretivco Job Dashboard.', pageW / 2, footerY + 12, { align: 'center' })

  // ── Save ──
  const filename = `${cfg.prefix}_${meta.filenamePart || 'document'}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)

  return { filename, docNumber }
}

// ── Single-job document (existing behaviour) ──
export async function generateDocument(type, job, customer) {
  const items = job.line_items || []
  const total = items.reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0)

  return renderDoc(type, {
    docNumber: genDocNumber(type, job.job_id),
    jobRefs: [job.job_id || '—'],
    items,
    total,
    finalValue: job.final_value || total,
    notes: job.notes,
    bank: job.bank,
    customerNameFallback: job.customer_name,
    customerCompanyFallback: job.customer_company,
    filenamePart: job.job_id || 'document',
  }, customer)
}

// ── Combined document across multiple jobs for the same customer ──
// Used when one payment (e.g. a single cheque) covers several jobs across
// different departments — the customer gets one document, but each job's
// own value/line items stay attributed to its department underneath.
export async function generateCombinedDocument(type, jobs, customer) {
  if (!jobs || jobs.length < 2) throw new Error('Combined document requires at least 2 jobs')

  const items = []
  let grandTotal = 0
  let grandFinal = 0

  jobs.forEach(job => {
    const deptLabel = DEPT[job.department]?.label || job.department || '—'
    const jobItems = job.line_items || []
    const subtotal = jobItems.reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0)
    items.push({ isSectionHeader: true, label: `${deptLabel} — ${job.job_id}` })
    jobItems.forEach(li => items.push({ ...li }))
    items.push({ isSubtotal: true, label: `Subtotal ${deptLabel}`, value: subtotal })
    grandTotal += subtotal
    grandFinal += (job.final_value || subtotal)
  })

  const notes = jobs.map(j => j.notes).filter(Boolean).join(' | ')
  const jobRefs = jobs.map(j => j.job_id || '—')

  return renderDoc(type, {
    docNumber: `${genDocNumber(type, jobs[0].job_id)}-C`,
    jobRefs,
    items,
    total: grandTotal,
    finalValue: grandFinal,
    notes,
    bank: jobs[0].bank,
    customerNameFallback: jobs[0].customer_name,
    customerCompanyFallback: jobs[0].customer_company,
    filenamePart: `MULTI_${customer?.customer_id || jobRefs.join('_')}`,
  }, customer)
}
