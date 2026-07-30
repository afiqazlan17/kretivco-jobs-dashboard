// ============================================================
// lib/pdf-generator.js — Kretivco PDF Document Generator
// Generates Quotation, Invoice, and Receipt PDFs
// Uses dynamic import to avoid SSR issues
// ============================================================

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

// ── Main Generator ──
export async function generateDocument(type, job, customer) {
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

  const docNumber = genDocNumber(type, job.job_id)
  const items = job.line_items || []
  const total = items.reduce((s, li) => s + ((Number(li.qty) || 0) * (Number(li.price) || 0)), 0)

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
  doc.setFillColor(249, 248, 251) // #F9F8FB
  doc.rect(margin, y, contentW, 22, 'F')
  doc.setDrawColor(232, 228, 237)
  doc.rect(margin, y, contentW, 22, 'S')

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

  doc.setFont('helvetica', 'bold')
  doc.text('Rujukan Job:', margin + 125, infoY)
  doc.setFont('helvetica', 'normal')
  doc.text(job.job_id || '—', margin + 150, infoY)

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

  y += 30

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
  doc.text(customer?.name || job.customer_name || '—', cx, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(107, 96, 128)
  if (customer?.company || job.customer_company) {
    doc.text(customer?.company || job.customer_company, cx, y + 5)
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

  const tableBody = items.map((li, i) => [
    i + 1,
    li.item || '—',
    li.desc || '—',
    li.size || '—',
    li.qty || 1,
    fmtRM(li.price),
    fmtRM((Number(li.qty) || 1) * (Number(li.price) || 0)),
  ])

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
    didParseCell: function (data) {
      // Bold last column
      if (data.section === 'body' && data.column.index === 6) {
        data.cell.styles.fontStyle = 'bold'
      }
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
  doc.text(fmtRM(job.final_value || total), totalsX + totalsW - 3, y + 8, { align: 'right' })
  y += 18

  // ── Notes ──
  if (job.notes) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(200, 25, 74)
    doc.text('NOTA:', margin, y)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(107, 96, 128)
    doc.text(job.notes, margin, y + 5, { maxWidth: contentW / 2 })
    y += 14
  }

  // ── Notes / Terms Section ──
  const bank = BANK_DETAILS[job.bank] || BANK_DETAILS.mbb
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(200, 25, 74)
  doc.text('Note:', margin, y)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(107, 96, 128)
  const notes = [
    `1. Please make a payment to ${bank.label} ${bank.acct} ${bank.name}.`,
    `2. Please indicate ${DOC_TYPES[type]?.title?.toLowerCase() || 'document'} number when making payment to us.`,
    '3. Full payment needed for invoice below RM2000 and 80% deposit must be paid before making',
    '   the first draft for invoice price RM2000 and above.',
    '4. Progress will be done in 14 days after final draft has been confirmed by customer.',
    '5. Deposit is not refundable after the booking confirmed and first draft has been made.',
    `6. Email us at ${BRAND.email}`,
    `7. Whatsapp us at ${BRAND.phone}/${BRAND.phone2}`,
  ]
  notes.forEach((t, i) => {
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
  const sigY = Math.max(y, pageH - 55)
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
  const filename = `${cfg.prefix}_${job.job_id || 'document'}_${new Date().toISOString().slice(0, 10)}.pdf`
  doc.save(filename)

  return { filename, docNumber }
}
