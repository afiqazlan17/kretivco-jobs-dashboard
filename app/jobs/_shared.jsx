"use client"
// ============================================================
// app/jobs/_shared.jsx — Components shared between the Job Monitor
// list page (app/jobs/page.jsx) and the job detail page
// (app/jobs/[jobId]/page.jsx). Split out so a single job's page
// doesn't need to load/define the whole list page's code, and vice
// versa. The underscore prefix keeps Next.js from treating this
// directory as a route.
// ============================================================
import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { DEPT, STATUS, STATUS_FLOW, STATUS_ROLLBACK, HOLD_STATUS, CANCEL_REASONS, SOURCE, SOURCE_OPTIONS, PIC_OPTIONS, PIC_BY_DEPT, JOB_TYPE, BANK, DOC_TYPE_META, availableDocTypes, customerDisplayName, formatRM, formatDate, formatDateTime, daysUntil, productLinesFor, segmentsFor, packageTierOptions, findPackageTier, packageItemsFor } from '@/lib/constants';
import { generateDocument, generateCombinedDocument, DOC_TYPES, BANK_DETAILS, notesFor, genDocNumber } from '@/lib/pdf-generator';
import { supabase, isMockMode } from '@/lib/supabase';
import { RichNoteComposer } from './_richEditor';

// ─── Micro Components ─────────────────────────────────────────
export function StatusBadge({ s }) { const m = STATUS[s]; return m ? <span className="badge-status" style={{ color: m.color, background: m.color + "15" }}>{m.label}</span> : null; }
export function DTag({ d }) { const m = DEPT[d]; return m ? <span className="badge-dept" style={{ color: m.color, background: m.color + "15" }}>{m.code}</span> : null; }
export function JID({ children }) { return <span className="jid">{children}</span>; }

export function DLBadge({ deadline, status }) {
  if (["completed","cancelled"].includes(status)) return <span className="text-sm text-muted">{formatDate(deadline)}</span>;
  const d = daysUntil(deadline);
  if (d === null) return <span className="text-sm text-muted">—</span>;
  const ds = formatDate(deadline);
  if (d < 0) return <span className="dl-overdue">{ds} <span className="dl-pill dl-pill-red">Overdue</span></span>;
  if (d <= 3) return <span className="dl-warn">{ds} <span className="dl-pill dl-pill-amber">{d}d</span></span>;
  return <span className="text-sm">{ds}</span>;
}

export function Modal({ width, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width }} onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Toast({ msg, action, onDone }) {
  useState(() => { const t = setTimeout(onDone, action ? 6000 : 2500); return () => clearTimeout(t); });
  return (
    <div className="toast" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <span>✓ {msg}</span>
      {action && (
        <button
          onClick={action.onClick}
          style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: '#fff', background: 'rgba(255,255,255,.15)', border: '1px solid rgba(255,255,255,.3)', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >{action.label}</button>
      )}
    </div>
  );
}

export function ConfirmModal({ title, msg, label, color, onConfirm, onClose, showReasonField }) {
  const [reasonText, setReasonText] = useState("");
  const guardedClose = () => { if (reasonText.trim() && !window.confirm('Perubahan belum disimpan akan hilang. Tutup borang ini?')) return; onClose(); };
  return (
    <Modal width={400} onClose={guardedClose}>
      <div style={{ padding: "24px 24px 16px" }}>
        <div className="modal-title">{title}</div>
        <p className="text-body text-secondary" style={{ marginTop: 8, lineHeight: 1.6 }}>{msg}</p>
        {showReasonField && (
          <div style={{ marginTop: 12 }}>
            <label className="field-label">Sebab (optional)</label>
            <input className="field-input" value={reasonText} onChange={e => setReasonText(e.target.value)} placeholder="Nyatakan sebab..." />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={guardedClose}>Batal</button>
        <button className="btn-primary" style={{ background: color }} onClick={() => onConfirm(reasonText)}>{label}</button>
      </div>
    </Modal>
  );
}

// ─── Cancel Modal ────────────────────────────────────────────
export function CancelModal({ job, onConfirm, onClose }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0].value);
  const [customText, setCustomText] = useState("");
  const guardedClose = () => { if ((reason !== CANCEL_REASONS[0].value || customText.trim()) && !window.confirm('Perubahan belum disimpan akan hilang. Tutup borang ini?')) return; onClose(); };
  return (
    <Modal width={440} onClose={guardedClose}>
      <div className="modal-header"><span className="modal-title">Batalkan Job</span><button className="modal-close" onClick={guardedClose}>×</button></div>
      <div className="modal-body">
        <div className="summary-box"><JID>{job.job_id}</JID> · {job.customer_name}</div>
        <label className="field-label">Sebab Pembatalan *</label>
        <select className="field-select" style={{ width: '100%', marginBottom: 12 }} value={reason} onChange={e => setReason(e.target.value)}>
          {CANCEL_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        {reason === 'other' && (
          <div>
            <label className="field-label">Nyatakan sebab</label>
            <input className="field-input" value={customText} onChange={e => setCustomText(e.target.value)} placeholder="Sebab pembatalan..." />
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={guardedClose}>Batal</button>
        <button className="btn-primary" style={{ background: '#EF4444' }} onClick={() => onConfirm(reason, customText)}>Ya, Batalkan</button>
      </div>
    </Modal>
  );
}

// ─── Activity Timeline ────────────────────────────────────────
// The "created" entry's own persisted detail text is whatever the DB
// trigger wrote (opaque, not something the client controls) — so the full
// creation snapshot shown here is synthesized straight from the job's own
// fields instead of trusting that log row's text. Since those fields
// (department, job type, bank, dates) are no longer editable after
// creation, this stays accurate for the job's whole lifetime, not just a
// one-time snapshot.
function creationSnapshot(job) {
  const lines = [
    `Customer: ${job.customer_name || job.customer_id || '—'}`,
    `Department: ${DEPT[job.department]?.label || job.department || '—'}`,
    `Job Type: ${JOB_TYPE[job.job_type_category]?.label || '—'}`,
    `Bank: ${BANK[job.bank]?.label || '—'}`,
    `PIC: ${job.pic || 'Belum assign'}`,
    `Est. Value: ${formatRM(job.estimation_value)}`,
    `Mula: ${formatDate(job.start_date)}`,
    `Deadline: ${formatDate(job.deadline)}`,
  ];
  if (job.notes) lines.push(`Nota: ${job.notes}`);
  return lines.join('\n');
}

export function Timeline({ jobId, getActivity, job }) {
  const logs = getActivity(jobId);
  if (!logs.length) return <div className="text-sm text-muted" style={{ padding: "12px 0" }}>Tiada activity log.</div>;

  const sorted = [...logs].sort((a, b) => new Date(a.time) - new Date(b.time));

  const actionIcon = (action) => {
    switch (action) {
      case 'created': return '📝';
      case 'status_change': return '🔄';
      case 'rollback': return '⏪';
      case 'cancelled': return '✕';
      case 'edited': return '✏️';
      case 'completed': return '✅';
      case 'note': return '💬';
      case 'document_generated': return '🧾';
      default: return '🔄';
    }
  };

  const actionText = (l) => {
    switch (l.action) {
      case 'created': return 'cipta job ini';
      case 'status_change': return <><span>tukar status: </span><StatusBadge s={l.from || l.old?.toLowerCase()} /> → <StatusBadge s={l.to || l.val?.toLowerCase()} /></>;
      case 'rollback': return <><span>rollback status: </span><StatusBadge s={l.from} /> → <StatusBadge s={l.to} /></>;
      case 'cancelled': return <span>batalkan job{l.detail ? ` — ${l.detail}` : ''}</span>;
      case 'completed': return <span>tandakan selesai{l.detail ? ` — ${l.detail}` : ''}</span>;
      case 'edited': return l.field === 'pic'
        ? <span>ambil alih ticket (PIC): {l.old || 'Belum assign'} → <strong>{l.val}</strong></span>
        : l.field === 'hold_status'
        ? <span>{l.val ? `letak job "${HOLD_STATUS[l.val]?.label || l.val}"` : 'sambung semula job (Resume)'}{l.detail ? ` — ${l.detail}` : ''}</span>
        : <><span>update {l.field}: {l.old} → <strong>{l.val}</strong></span></>;
      case 'note': return 'menulis catatan';
      case 'document_generated': return <span>menjana {l.detail}</span>;
      default: return l.action;
    }
  };

  const viewLogAttachment = async (att) => {
    if (att.url) { window.open(att.url, '_blank'); return; }
    const { data, error } = await supabase.storage.from('job-attachments').createSignedUrl(att.path, 3600);
    if (error) { alert('Gagal buka fail: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  return (
    <div className="timeline">
      <div className="timeline-line" />
      {sorted.map((l, i) => (
        <div key={i} className="timeline-entry">
          <div className="timeline-dot" style={{ background: l.action === "created" ? "#E91E63" : l.action === "completed" ? "#10B981" : l.action === "cancelled" ? "#EF4444" : l.action === "rollback" ? "#F59E0B" : "#E8E4ED" }} />
          <div className="text-body">
            <span style={{ marginRight: 4 }}>{actionIcon(l.action)}</span>
            <strong>{l.user}</strong>{" "}
            {actionText(l)}
          </div>
          {l.action === 'created' && job && (
            <pre className="text-sm text-secondary" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: '4px 0 0', background: '#F9F8FB', border: '1px solid #F0ECF4', borderRadius: 6, padding: '8px 10px' }}>{creationSnapshot(job)}</pre>
          )}
          {l.reason && <div className="text-sm text-secondary">Sebab: "{l.reason}"</div>}
          {l.note && (l.action === 'note'
            ? <div className="text-sm text-secondary rich-note-content" style={{ marginTop: 2 }} dangerouslySetInnerHTML={{ __html: l.note }} />
            : <div className="text-sm text-secondary">"{l.note}"</div>)}
          {(l.attachments || []).length > 0 && (
            <div className="text-sm" style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {l.attachments.map((att, ai) => (
                <a key={ai} onClick={() => viewLogAttachment(att)} style={{ color: '#3A86FF', cursor: 'pointer' }}>📎 {att.name}</a>
              ))}
            </div>
          )}
          {(l.attachmentPath || l.attachmentUrl) && (
            <div className="text-sm" style={{marginTop:2}}>
              <a onClick={()=>viewLogAttachment({ path: l.attachmentPath, url: l.attachmentUrl })} style={{color:'#3A86FF',cursor:'pointer'}}>📎 {l.attachmentName || 'Lihat screenshot'}</a>
            </div>
          )}
          <div className="text-xs text-muted">{formatDateTime(l.time)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Customer Mini Profile ────────────────────────────────────
export function CustMini({ job, customers }) {
  const router = useRouter();
  const cust = customers.find(c => c.id === job.customer_id);
  const name = job.customer_name || job.customer_id || "—";
  const goToCustomer = () => { if (cust) router.push(`/customers?customer=${cust.id}`); };
  return (
    <div className="cust-mini" onClick={goToCustomer} style={cust ? { cursor: 'pointer' } : undefined} title={cust ? 'Lihat profil customer' : undefined}>
      <div className="cust-mini-head"><div className="avatar-sm">{name.charAt(0)}</div><div><div className="text-body font-semibold">{name}</div><div className="jid text-muted">{cust?.customer_id || job.customer_id}</div></div></div>
      <div className="cust-mini-grid">
        <div><span className="text-muted">Company:</span> {cust?.company || "—"}</div>
        <div><span className="text-muted">Phone:</span> {cust?.phone || "—"}</div>
        <div><span className="text-muted">Email:</span> {cust?.email || "—"}</div>
        <div><span className="text-muted">Source:</span> {cust?.source || "—"}</div>
      </div>
    </div>
  );
}

// ─── Financial Breakdown Panel ────────────────────────────────
export function FinancialBreakdown({ job, onToggleInstallment }) {
  const estVal = job.estimation_value || job.final_value || 0;
  const displayVal = job.final_value || job.estimation_value;

  if (!job.special_arrangement) {
    return (
      <div className="finance-box">
        <div className="section-label">Kewangan</div>
        <div className="info-grid" style={{ gridTemplateColumns: "140px 1fr" }}>
          <span className="info-label">Total Value</span><span className="font-semibold">{formatRM(displayVal)}</span>
          <span className="info-label">Baki Kretivco</span><span className="font-semibold text-green">{formatRM(displayVal)} (100%)</span>
        </div>
      </div>
    );
  }

  const breakdownTotal = (job.cost_breakdown || []).reduce((s, item) => s + (item.amount || 0), 0);
  const baki = (displayVal || 0) - breakdownTotal;

  return (
    <div className="finance-box">
      <div className="section-label">Kewangan — Special Arrangement</div>
      <div className="info-grid" style={{ gridTemplateColumns: "140px 1fr" }}>
        <span className="info-label">Total Value</span><span className="font-semibold">{formatRM(displayVal)}</span>
      </div>
      {(job.cost_breakdown || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="text-xs text-muted" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: ".02em", fontWeight: 500 }}>Cost Breakdown</div>
          <div style={{ background: "#F9F8FB", borderRadius: 8, border: "1px solid #F0ECF4", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", padding: "8px 12px", fontSize: 11, fontWeight: 500, color: "#9B93A8", borderBottom: "1px solid #F0ECF4" }}>
              <span>Jenis</span><span>Penerima</span><span style={{ textAlign: "right" }}>Amount</span>
            </div>
            {job.cost_breakdown.map((item, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", padding: "8px 12px", fontSize: 12, borderBottom: i < job.cost_breakdown.length - 1 ? "1px solid #F0ECF4" : "none" }}>
                <span>{item.type}</span><span>{item.recipient}</span><span style={{ textAlign: "right", fontWeight: 600 }}>{formatRM(item.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="info-grid" style={{ gridTemplateColumns: "140px 1fr", marginTop: 12 }}>
        <span className="info-label">Baki Kretivco</span><span className="font-semibold text-green">{formatRM(baki)}</span>
      </div>

      {(job.installments || []).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="text-xs text-muted" style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: ".02em", fontWeight: 500 }}>Installments</div>
          <div style={{ background: "#F9F8FB", borderRadius: 8, border: "1px solid #F0ECF4", overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", padding: "8px 12px", fontSize: 11, fontWeight: 500, color: "#9B93A8", borderBottom: "1px solid #F0ECF4" }}>
              <span>Amount</span><span>Due Date</span><span style={{ textAlign: "center" }}>Status</span>
            </div>
            {job.installments.map((inst, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 90px", padding: "8px 12px", fontSize: 12, alignItems: "center", borderBottom: i < job.installments.length - 1 ? "1px solid #F0ECF4" : "none" }}>
                <span style={{ fontWeight: 600 }}>{formatRM(inst.amount)}</span>
                <span>{inst.due_date ? new Date(inst.due_date + "-01").toLocaleDateString("ms-MY", { month: "short", year: "numeric" }) : "—"}</span>
                <span style={{ textAlign: "center" }}>
                  <button
                    onClick={() => onToggleInstallment && onToggleInstallment(job, i)}
                    style={{
                      fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 12, border: "none", cursor: "pointer",
                      background: inst.status === "paid" ? "#10B98118" : "#F59E0B18",
                      color: inst.status === "paid" ? "#10B981" : "#F59E0B",
                    }}
                  >
                    {inst.status === "paid" ? "Paid" : "Pending"}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Job Detail Panel ─────────────────────────────────────────
// ─── Document Generation Buttons ─────────────────────────────
// ─── Document Preview — live edit + live preview before generating ──
// Staff can adjust customer info, items, delivery/discount (or payment
// method/amounts for a receipt) and see the layout update instantly. Terms
// and bank are fixed — bank always follows whatever was set on the job.
export function DocPreviewModal({ type, label, job, cust, userName, ledgerEntries, onClose, onGenerated, onUpdateJob, onUpdateCustomer }) {
  const isReceipt = type === 'receipt';
  const cfg = DOC_TYPES[type];
  const bank = BANK_DETAILS[job.bank] || BANK_DETAILS.mbb;
  const notes = notesFor(type, bank);
  const docNumber = genDocNumber(type, job.job_id);

  // A receipt is proof of payment against a specific invoice, not a fresh
  // re-derivation from whatever the line items currently say — those may
  // have moved on to cover a later quotation/invoice. Default to the most
  // recent un-reversed invoice's amount so Resit always matches what was
  // actually billed; falls back to the job total only if no invoice exists
  // yet. Still fully editable for partial/installment payments.
  const latestInvoice = isReceipt
    ? (ledgerEntries || []).filter(e => e.job_id === job.job_id && e.type === 'invoice' && !e.reversed).sort((a, b) => new Date(b.date) - new Date(a.date))[0]
    : null;

  const [form, setForm] = useState(() => {
    const initItems = (job.line_items || []).map(li => ({ ...li }));
    return {
      staffName: userName || '',
      customerName: cust?.name || job.customer_name || '',
      customerCompany: cust?.company || job.customer_company || '',
      addressLine1: cust?.address_line_1 || '',
      addressLine2: [cust?.address_line_2, [cust?.postcode, cust?.city].filter(Boolean).join(' '), cust?.state].filter(Boolean).join(', '),
      jobTitle: job.job_type || '',
      items: initItems.length ? initItems : [{ item: '', desc: '', size: '', qty: 1, price: 0 }],
      delivery: 0, discount: 0,
      paymentMethod: 'Bank Transfer',
      amountPaid: latestInvoice ? latestInvoice.amount : (job.final_value || job.estimation_value || 0),
      balanceDue: 0,
    };
  });
  const [initial, setInitial] = useState(form);
  const [generating, setGenerating] = useState(false);
  // Package bundles (e.g. Undangan.my) are tagged noSize on every item since
  // they're never size-based — hide the column unless a non-package item is
  // present, so staff can still enter a size on genuine custom print jobs.
  const showSize = !!DEPT[job.department]?.usesSize && form.items.some(it => !it.noSize);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => setForm(p => ({ ...p, items: p.items.map((it, idx) => idx === i ? { ...it, [k]: v } : it) }));
  const addItem = () => setForm(p => ({ ...p, items: [...p.items, { id: crypto.randomUUID(), item: '', desc: '', size: '', qty: 1, price: 0 }] }));
  const removeItem = (i) => setForm(p => ({ ...p, items: p.items.length > 1 ? p.items.filter((_, idx) => idx !== i) : p.items }));
  const guardedClose = () => { if (JSON.stringify(form) !== JSON.stringify(initial) && !window.confirm('Perubahan belum disimpan akan hilang. Tutup borang ini?')) return; onClose(); };

  const subtotal = form.items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.price) || 0)), 0);
  const total = subtotal + (Number(form.delivery) || 0) - (Number(form.discount) || 0);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const overrides = {
        staffName: form.staffName, customerName: form.customerName, customerCompany: form.customerCompany,
        addressLine1: form.addressLine1, addressLine2: form.addressLine2, jobTitle: form.jobTitle,
        items: form.items.filter(it => it.item?.trim()),
        delivery: form.delivery, discount: form.discount,
        paymentMethod: form.paymentMethod,
        amountPaid: isReceipt ? form.amountPaid : undefined,
        balanceDue: isReceipt ? form.balanceDue : undefined,
      };
      const result = await generateDocument(type, job, cust, overrides);
      onGenerated({ jobs: [job], type, label, docNumber: result.docNumber, total: result.total, blob: result.blob, filename: result.filename });
      onClose();
    } catch (err) {
      console.error('PDF generation error:', err);
    }
    setGenerating(false);
  };

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const handleSave = () => {
    setSaving(true);
    const validItems = form.items.filter(it => it.item?.trim()).map(it => ({
      item: it.item.trim(), desc: it.desc?.trim() || '', size: it.size?.trim() || '',
      qty: Number(it.qty) || 1, price: Number(it.price) || 0,
      total: (Number(it.qty) || 1) * (Number(it.price) || 0),
    }));
    const itemsTotal = validItems.reduce((s, li) => s + li.total, 0);
    if (onUpdateJob) {
      onUpdateJob(job.id, {
        line_items: validItems,
        estimation_value: itemsTotal || job.estimation_value,
        job_type: form.jobTitle || job.job_type,
      }, userName, { action: 'edited', field: `${label}`, detail: `${label} dikemaskini (Simpan)` });
    }
    // Capture the customer's address for next time, if it wasn't already saved
    if (onUpdateCustomer && cust?.id && (form.addressLine1 || form.addressLine2) &&
        (form.addressLine1 !== (cust.address_line_1 || '') || form.addressLine2 !== (cust.address_line_2 || ''))) {
      onUpdateCustomer(cust.id, { address_line_1: form.addressLine1 || null, address_line_2: form.addressLine2 || null });
    }
    setSaving(false);
    setSaved(true);
    setInitial(form);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputSt = { fontFamily: "'Poppins',sans-serif", fontSize: 12, border: '1px solid #E8E4ED', borderRadius: 6, padding: '6px 8px', width: '100%', boxSizing: 'border-box' };
  const labelSt = { fontSize: 11, fontWeight: 600, color: '#6B6080', display: 'block', marginBottom: 4, marginTop: 10 };

  return (
    <Modal width={1040} onClose={guardedClose}>
      <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '88vh' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #F0ECF4', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>Preview {label} — {job.job_id}</div>
          <button onClick={guardedClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#9B93A8' }}>×</button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Edit form */}
          <div style={{ width: 340, padding: '4px 20px 20px', overflowY: 'auto', borderRight: '1px solid #F0ECF4', flexShrink: 0 }}>
            <label style={{ ...labelSt, marginTop: 12 }}>Nama Customer</label>
            <input style={inputSt} value={form.customerName} onChange={e => set('customerName', e.target.value)} />
            <label style={labelSt}>Syarikat</label>
            <input style={inputSt} value={form.customerCompany} onChange={e => set('customerCompany', e.target.value)} />
            <label style={labelSt}>Alamat Baris 1</label>
            <input style={inputSt} value={form.addressLine1} onChange={e => set('addressLine1', e.target.value)} />
            <label style={labelSt}>Alamat Baris 2</label>
            <input style={inputSt} value={form.addressLine2} onChange={e => set('addressLine2', e.target.value)} />
            <label style={labelSt}>Tajuk Job/Project</label>
            <input style={inputSt} value={form.jobTitle} onChange={e => set('jobTitle', e.target.value)} />
            <label style={labelSt}>By (Staff)</label>
            <input style={inputSt} value={form.staffName} onChange={e => set('staffName', e.target.value)} />

            <div style={{ ...labelSt, marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Item</span>
              <button onClick={addItem} style={{ fontSize: 11, fontWeight: 600, color: '#E91E63', background: 'none', border: 'none', cursor: 'pointer' }}>+ Tambah</button>
            </div>
            {form.items.map((it, i) => (
              <div key={i} style={{ border: '1px solid #F0ECF4', borderRadius: 8, padding: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9B93A8', marginBottom: 2 }}>Nama Item</div>
                <textarea rows={2} style={{ ...inputSt, marginBottom: 4, resize: 'vertical', fontFamily: "'Poppins',sans-serif" }} placeholder="Nama item" value={it.item} onChange={e => setItem(i, 'item', e.target.value)} />
                <div style={{ fontSize: 10, fontWeight: 600, color: '#9B93A8', marginBottom: 2 }}>Keterangan</div>
                <textarea rows={2} style={{ ...inputSt, marginBottom: 4, resize: 'vertical', fontFamily: "'Poppins',sans-serif" }} placeholder="Keterangan (optional)" value={it.desc || ''} onChange={e => setItem(i, 'desc', e.target.value)} />
                {showSize && <input style={{ ...inputSt, marginBottom: 4 }} placeholder="Saiz (cth: A3, 3ft x 6ft)" value={it.size || ''} onChange={e => setItem(i, 'size', e.target.value)} />}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 24px', gap: 4 }}>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#9B93A8', marginBottom: 2 }}>Kuantiti (Qty)</div>
                    <input type="number" style={inputSt} placeholder="Qty" value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} min="1" />
                  </div>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: '#9B93A8', marginBottom: 2 }}>Harga (RM)</div>
                    <input type="number" style={inputSt} placeholder="Harga (RM)" value={it.price} onChange={e => setItem(i, 'price', e.target.value)} />
                  </div>
                  <button onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14, alignSelf: 'end', height: 34 }}>×</button>
                </div>
              </div>
            ))}

            {!isReceipt && <>
              <label style={labelSt}>Delivery (RM)</label>
              <input type="number" style={inputSt} value={form.delivery} onChange={e => set('delivery', e.target.value)} />
              <label style={labelSt}>Discount (RM)</label>
              <input type="number" style={inputSt} value={form.discount} onChange={e => set('discount', e.target.value)} />
            </>}
            {isReceipt && <>
              <label style={labelSt}>Payment Method</label>
              <select style={inputSt} value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                <option>Bank Transfer</option><option>Cash</option><option>Online Banking</option>
              </select>
              <label style={labelSt}>Amount Paid (RM)</label>
              <input type="number" style={inputSt} value={form.amountPaid} onChange={e => set('amountPaid', e.target.value)} />
              {latestInvoice && <div style={{ fontSize: 10, color: '#9B93A8', marginTop: 3 }}>Auto dari Invoice {latestInvoice.doc_number}</div>}
              <label style={labelSt}>Balance Due (RM)</label>
              <input type="number" style={inputSt} value={form.balanceDue} onChange={e => set('balanceDue', e.target.value)} />
            </>}
          </div>

          {/* Live preview — font/spacing sizes mirror the actual PDF's point
              sizes 1:1 (px≈pt on screen) so this isn't a miniaturized mockup */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto', background: '#F5F3F7' }}>
            <div style={{ background: '#fff', borderRadius: 4, padding: '32px 40px', fontSize: 10, lineHeight: 1.5, color: '#141414', boxShadow: '0 1px 4px rgba(0,0,0,.08)', minHeight: '100%', width: 595, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 13, alignItems: 'flex-start' }}>
                  <img src="/kretivco-logo.png" alt="Kretivco" style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 12 }}>Kretivco Mediaworks</div>
                    <div style={{ color: '#555', marginTop: 4 }}>(SA0463354-A)</div>
                    <div style={{ color: '#555' }}>No.15A, Jalan USJ1/19</div>
                    <div style={{ color: '#555' }}>47600, Subang Jaya, Selangor</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{cfg.title}</div>
                  <div style={{ marginTop: 8 }}><b>{cfg.noLabel}:</b> {docNumber}</div>
                  <div><b>Date:</b> {new Date().toLocaleDateString('en-GB')}</div>
                  <div><b>By:</b> {form.staffName || '—'}</div>
                </div>
              </div>
              <div style={{ borderTop: '0.75px solid #999', margin: '14px 0' }} />
              <div style={{ fontWeight: 700 }}>Customer:</div>
              <div>{form.customerCompany ? `${form.customerName} (${form.customerCompany})` : (form.customerName || '—')}</div>
              {form.addressLine1 && <div>{form.addressLine1}</div>}
              {form.addressLine2 && <div>{form.addressLine2}</div>}
              <div style={{ marginTop: 15 }}><b>Title:</b> {form.jobTitle || '—'}</div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 10 }}>
                <thead>
                  <tr style={{ background: '#F2F2F2' }}>
                    <th style={{ padding: 8, textAlign: 'left', border: '0.5px solid #000' }}>No</th>
                    <th style={{ padding: 8, textAlign: 'left', border: '0.5px solid #000' }}>Description</th>
                    {isReceipt ? <th style={{ padding: 8, textAlign: 'left', border: '0.5px solid #000' }}>Payment Method</th> : <>
                      {showSize && <th style={{ padding: 8, textAlign: 'left', border: '0.5px solid #000' }}>Size</th>}
                      <th style={{ padding: 8, textAlign: 'left', border: '0.5px solid #000' }}>Unit</th>
                      <th style={{ padding: 8, textAlign: 'right', border: '0.5px solid #000' }}>Price</th>
                    </>}
                    <th style={{ padding: 8, textAlign: 'right', border: '0.5px solid #000' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((it, i) => (
                    <tr key={i}>
                      <td style={{ padding: 8, border: '0.5px solid #000' }}>{i + 1}</td>
                      <td style={{ padding: 8, border: '0.5px solid #000', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word', maxWidth: 220 }}>
                        <div style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word' }}>{it.item || '—'}</div>
                        {it.desc ? <div style={{ color: '#777', fontSize: 9, whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflowWrap: 'break-word', marginTop: 2 }}>{it.desc}</div> : null}
                      </td>
                      {isReceipt ? <td style={{ padding: 8, border: '0.5px solid #000' }}>{form.paymentMethod}</td> : <>
                        {showSize && <td style={{ padding: 8, border: '0.5px solid #000' }}>{it.size || '—'}</td>}
                        <td style={{ padding: 8, border: '0.5px solid #000' }}>{it.qty || 1}</td>
                        <td style={{ padding: 8, border: '0.5px solid #000', textAlign: 'right' }}>{formatRM(it.price)}</td>
                      </>}
                      <td style={{ padding: 8, border: '0.5px solid #000', textAlign: 'right' }}>{formatRM((Number(it.qty) || 1) * (Number(it.price) || 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: 24, textAlign: 'right' }}>
                {isReceipt ? <>
                  <div><b>Amount Paid (MYR):</b> {formatRM(form.amountPaid)}</div>
                  <div style={{ marginTop: 6 }}><b>Balance Due (MYR):</b> {formatRM(form.balanceDue)}</div>
                </> : <>
                  <div><b>Subtotal:</b> {formatRM(subtotal)}</div>
                  <div style={{ marginTop: 6 }}><b>Delivery:</b> {formatRM(form.delivery)}</div>
                  <div style={{ marginTop: 6 }}><b>Discount:</b> ({formatRM(form.discount)})</div>
                  <div style={{ marginTop: 6 }}><b>Total (MYR):</b> {formatRM(total)}</div>
                </>}
              </div>

              <div style={{ marginTop: 25, fontWeight: 700 }}>Note:</div>
              <div style={{ color: '#3c3c3c', marginTop: 4 }}>
                {notes.map((n, i) => <div key={i} style={{ marginTop: i ? 4 : 0 }}>{i + 1}. {n}</div>)}
              </div>
              <div style={{ marginTop: 14 }}>Thank you for your business!</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 19 }}>
                <div style={{ fontWeight: 700 }}>Issued by:<div style={{ borderTop: '0.5px solid #141414', width: 150, marginTop: 26 }} /></div>
                <div style={{ fontWeight: 700 }}>Accepted by:<div style={{ borderTop: '0.5px solid #141414', width: 150, marginTop: 26 }} /></div>
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid #F0ECF4', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          {saved && <span style={{ fontSize: 12, color: '#10B981', fontWeight: 600, marginRight: 'auto' }}>✓ Disimpan</span>}
          <button onClick={guardedClose} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, border: '1px solid #E8E4ED', background: '#fff', cursor: 'pointer' }}>Batal</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, border: '1px solid #10B981', background: '#fff', color: '#10B981', cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Menyimpan...' : 'Simpan'}</button>
          <button onClick={handleGenerate} disabled={generating} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 13, fontWeight: 600, padding: '9px 20px', borderRadius: 8, border: 'none', background: '#E91E63', color: '#fff', cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.7 : 1 }}>{generating ? 'Menjana...' : 'Muat Turun PDF'}</button>
        </div>
      </div>
    </Modal>
  );
}

export function DocButtons({ job, jobs, customers, visDepts, ledgerEntries, onDocGenerated, userName, onUpdateJob, onUpdateCustomer }) {
  const [generating, setGenerating] = useState(null);
  const [showCombine, setShowCombine] = useState(false);
  const [combineIds, setCombineIds] = useState(new Set());
  const [previewDoc, setPreviewDoc] = useState(null);
  const cust = customers.find(c => c.id === job.customer_id) || null;

  const btnStyle = (color) => ({
    fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600,
    padding: '7px 14px', borderRadius: 8, border: `1px solid ${color}20`,
    background: `${color}10`, color, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 5,
  });

  const docs = availableDocTypes(job.status);

  // Other jobs for the same customer, across departments — e.g. one cheque
  // covering both a KretivWork job and a KretivTech job needs one combined doc.
  const siblings = job.customer_id ? (jobs || []).filter(j => j.customer_id === job.customer_id && j.id !== job.id && !j.archived) : [];
  const toggleCombine = (id) => setCombineIds(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const selectedSiblings = siblings.filter(s => combineIds.has(s.id));
  const statusMismatch = selectedSiblings.some(s => s.status !== job.status);
  const combineJobs = [job, ...selectedSiblings];
  const combineDocs = availableDocTypes(job.status);

  const handleGenCombined = async (type, label) => {
    setGenerating(`combined-${type}`);
    try {
      const result = await generateCombinedDocument(type, combineJobs, cust);
      onDocGenerated && onDocGenerated({ jobs: combineJobs, type, label: `${label} gabungan`, docNumber: result.docNumber, blob: result.blob, filename: result.filename });
    } catch (err) {
      console.error('Combined PDF generation error:', err);
    }
    setGenerating(null);
  };

  // Every previously generated PDF for this job — a real copy archived at
  // generation time, not just a claim that it was generated.
  const documentAttachments = (job.attachments || []).filter(a => a.kind === 'document').sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));
  const handleViewDoc = async (att) => {
    if (att.url) { window.open(att.url, '_blank'); return; }
    const { data, error } = await supabase.storage.from('job-attachments').createSignedUrl(att.path, 3600);
    if (error) { alert('Gagal buka fail: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  if (docs.length === 0 && documentAttachments.length === 0) return null;

  return (
    <div style={{ marginTop: 0 }}>
      {docs.length > 0 && siblings.length > 0 && !showCombine && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setShowCombine(true)}
            style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11.5, fontWeight: 700, color: '#E91E63', background: '#E91E6312', border: '1px solid #E91E6330', borderRadius: 8, cursor: 'pointer', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: 5 }}
          >🔗 Gabung dengan Job Lain (Customer Sama)</button>
        </div>
      )}
      {docs.length > 0 && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {docs.map(d => (
              <button key={d.type} onClick={() => setPreviewDoc({ type: d.type, label: d.label })} style={btnStyle(d.color)}>
                <span>{d.icon}</span>
                {d.label}
              </button>
            ))}
          </div>
          {(!job.line_items || job.line_items.length === 0) && (
            <div style={{ fontSize: 11, color: '#9B93A8', marginTop: 6, fontStyle: 'italic' }}>Klik mana-mana butang untuk isi item &amp; jana dokumen.</div>
          )}
        </>
      )}
      {documentAttachments.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {documentAttachments.map(att => {
            const meta = DOC_TYPE_META[att.doc_type];
            return (
              <div key={att.id} onClick={() => handleViewDoc(att)} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '6px 10px', borderRadius: 6, background: '#F9F8FB', cursor: 'pointer' }}>
                <span>{meta?.icon || '📄'}</span>
                <span style={{ fontWeight: 600, color: meta?.color || '#1A1025' }}>{meta?.label || att.doc_type}</span>
                <span className="text-secondary">{att.doc_number}</span>
                <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{formatDateTime(att.uploaded_at)} · {att.uploaded_by}</span>
              </div>
            );
          })}
        </div>
      )}

      {siblings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {showCombine && (
            <div style={{ padding: 12, background: '#F9F8FB', borderRadius: 8, border: '1px solid #F0ECF4' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6B6080', marginBottom: 8 }}>Pilih job lain untuk digabung dalam satu dokumen (cth: 1 cek bayar untuk beberapa department):</div>
              {siblings.map(s => {
                const canSeeFull = !visDepts || visDepts.includes(s.department);
                return (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={combineIds.has(s.id)} onChange={() => toggleCombine(s.id)} />
                    <JID>{s.job_id}</JID> <DTag d={s.department} />
                    {canSeeFull ? <span className="text-secondary">{s.job_type}</span> : <span className="text-muted" style={{ fontStyle: 'italic' }}>(department lain)</span>}
                    <StatusBadge s={s.status} /> <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{formatRM(s.estimation_value)}</span>
                  </label>
                );
              })}
              {statusMismatch && (
                <div style={{ fontSize: 11, color: '#EF4444', marginTop: 8, fontStyle: 'italic' }}>⚠ Status job tak sepadan — selaraskan status dahulu sebelum digabung.</div>
              )}
              {selectedSiblings.length > 0 && !statusMismatch && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #F0ECF4' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6B6080', marginBottom: 6 }}>Jana Dokumen Gabungan ({combineJobs.length} job · {formatRM(combineJobs.reduce((sum,j)=>sum+(j.estimation_value||0),0))}):</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {combineDocs.map(d => (
                      <button key={d.type} onClick={() => handleGenCombined(d.type, d.label)} disabled={generating === `combined-${d.type}`} style={btnStyle(d.color)}>
                        <span>{d.icon}</span>
                        {generating === `combined-${d.type}` ? 'Menjana...' : d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => { setShowCombine(false); setCombineIds(new Set()); }} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 500, color: '#9B93A8', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 10 }}>Batal</button>
            </div>
          )}
        </div>
      )}
      {previewDoc && (
        <DocPreviewModal
          type={previewDoc.type} label={previewDoc.label} job={job} cust={cust} userName={userName} ledgerEntries={ledgerEntries}
          onClose={() => setPreviewDoc(null)}
          onGenerated={(payload) => { onDocGenerated && onDocGenerated(payload); }}
          onUpdateJob={onUpdateJob}
          onUpdateCustomer={onUpdateCustomer}
        />
      )}
    </div>
  );
}

// ─── Progress Stepper — full-width pipeline view at top of job detail ──
// Doubles as the status control: click an upcoming stage to advance, click
// a past stage to roll back to it. Cancel/Archive stay as small secondary
// actions here since they're not part of the forward/back flow itself.
const PIPELINE_STAGES = ['potential', 'new', 'assigned', 'active', 'completed'];
export function ProgressStepper({ job, onStatus, onRollback, onCancel, onArchive }) {
  const { status } = job;
  if (status === 'cancelled') {
    return <div className="stepper-cancelled">✕ Job Dibatalkan{job.cancel_reason ? ` — ${CANCEL_REASONS.find(r => r.value === job.cancel_reason)?.label || job.cancel_reason}${job.cancel_reason_text ? `: ${job.cancel_reason_text}` : ''}` : ''}</div>;
  }
  const idx = PIPELINE_STAGES.indexOf(status);
  const forwardSet = new Set(STATUS_FLOW[status] || []);
  const rollbackSet = new Set(STATUS_ROLLBACK[status] || []);
  const canCancel = !["completed", "cancelled"].includes(status);
  const canArchive = !job.archived && status !== "cancelled";

  return (
    <div className="stepper-wrap">
      <div className="stepper-top">
        <span className="stepper-label">Progress Job</span>
        <span className="stepper-current" style={{ color: STATUS[status]?.color }}>Peringkat semasa: {STATUS[status]?.label}</span>
      </div>
      <div className="stepper">
        {PIPELINE_STAGES.map((s, i) => {
          const state = i < idx ? 'done' : i === idx ? 'current' : '';
          const canForward = i > idx && forwardSet.has(s);
          const canBack = i < idx && rollbackSet.has(s);
          const clickable = canForward || canBack;
          const dotStyle = state === 'done' ? { background: '#10B981', borderColor: '#10B981', color: '#fff' }
            : state === 'current' ? { borderColor: STATUS[s].color, color: STATUS[s].color, background: STATUS[s].color + '15' }
            : {};
          const lblStyle = state === 'done' ? { color: '#10B981' } : state === 'current' ? { color: STATUS[s].color } : {};
          return (
            <div
              key={s}
              className={`step ${state} ${clickable ? 'clickable' : ''}`}
              onClick={clickable ? () => (canForward ? onStatus(job, s) : onRollback(job, s)) : undefined}
              title={canForward ? `Gerak ke ${STATUS[s].label}` : canBack ? `Rollback ke ${STATUS[s].label}` : undefined}
            >
              <div className="line" />
              <div className="dot" style={dotStyle}>{state === 'done' ? '✓' : i + 1}</div>
              <div className="lbl" style={lblStyle}>{STATUS[s].label}</div>
            </div>
          );
        })}
      </div>
      {(canCancel || canArchive) && (
        <div className="stepper-actions">
          {canCancel && <button className="stepper-mini-btn cancel" onClick={() => onCancel(job)}>✕ Cancel</button>}
          {canArchive && <button className="stepper-mini-btn" onClick={() => onArchive(job)}>Arkib</button>}
        </div>
      )}
    </div>
  );
}

// ─── Ticket Action Menu — header dropdown ──────────────────────
// Consolidates ticket-lifecycle actions that used to be scattered (the old
// stepper claim banner, the Complete modal) into one control. Take In
// Ticket works regardless of who currently holds the ticket — a "new"
// unclaimed ticket gets claimed AND advanced to "assigned" in one step;
// an already-assigned/active ticket just hands the PIC over to whoever
// clicks, no status change (e.g. covering for a staff member on leave).
export function ActionMenu({ job, onTakeIn, onCloseTicket, onHold, onResume }) {
  const [open, setOpen] = useState(false);
  const canClose = !["completed", "cancelled"].includes(job.status);
  const isHeld = !!job.hold_status;

  const item = (label, icon, onClick, color) => (
    <button
      onClick={() => { setOpen(false); onClick(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px 12px', fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 600, color: color || '#1A1025', background: 'none', border: 'none', cursor: 'pointer' }}
    >{icon} {label}</button>
  );

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,.5)', background: 'rgba(255,255,255,.15)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      >Action ▾</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
          <div style={{ position: 'absolute', top: '110%', right: 0, zIndex: 31, background: '#fff', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.18)', minWidth: 200, overflow: 'hidden', padding: '4px 0' }}>
            {item('Take In Ticket', '🙋', onTakeIn)}
            {canClose && item('Close Ticket', '✅', onCloseTicket, '#10B981')}
            {!isHeld && item('Pending Ticket', '⏸', () => onHold('pending'), '#F59E0B')}
            {!isHeld && item('Suspend Ticket', '⛔', () => onHold('suspended'), '#EF4444')}
            {isHeld && item('Resume Ticket', '▶️', onResume, '#10B981')}
          </div>
        </>
      )}
    </div>
  );
}

export function DetailPanel({ job, jobs, customers, visDepts, ledgerEntries, getActivity, onStatus, onRollback, onCancel, onArchive, onTakeIn, onCloseTicket, onHold, onResume, onToggleInstallment, onUpdateJob, onUpdateCustomer, onAddNote, onDocGenerated, onJumpToJob, userName }) {
  const submitRichNote = async ({ note, attachments }) => {
    onAddNote(job.job_id, note, job.id, { attachments });
  };
  // Final, print-ready artwork — the deliverable staff attach once every
  // individual item's design has been made and approved, right before
  // sending the job to the printer/kilang. Reuses the same job-attachments
  // bucket as per-item artwork, tagged with its own kind so it doesn't mix
  // with those. Supports multiple files (e.g. separate print-ready files
  // per material).
  const attachments = job.attachments || [];
  const finalArtworkAtts = attachments.filter(a => a.kind === 'final_artwork');
  const [finalArtBusy, setFinalArtBusy] = useState(false);
  const handleFinalArtworkUpload = async (file) => {
    if (!file) return;
    setFinalArtBusy(true);
    try {
      let path = null, url = null;
      if (isMockMode) {
        url = URL.createObjectURL(file);
      } else {
        path = `${job.job_id}/final_artwork/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('job-attachments').upload(path, file);
        if (error) throw error;
      }
      const entry = { id: crypto.randomUUID(), kind: 'final_artwork', line_item_id: null, path, url, name: file.name, uploaded_by: userName || 'System', uploaded_at: new Date().toISOString() };
      onUpdateJob(job.id, { attachments: [...attachments, entry] }, userName, { action: 'edited', field: 'attachments', detail: `Final artwork dimuat naik: ${file.name}` });
    } catch (err) {
      alert('Gagal muat naik: ' + (err?.message || err));
    } finally {
      setFinalArtBusy(false);
    }
  };
  const handleFinalArtworkView = async (att) => {
    if (att.url) { window.open(att.url, '_blank'); return; }
    const { data, error } = await supabase.storage.from('job-attachments').createSignedUrl(att.path, 3600);
    if (error) { alert('Gagal buka fail: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };
  const handleFinalArtworkDelete = async (att) => {
    if (!window.confirm(`Padam "${att.name}"?`)) return;
    if (att.path && !isMockMode) await supabase.storage.from('job-attachments').remove([att.path]);
    onUpdateJob(job.id, { attachments: attachments.filter(a => a.id !== att.id) }, userName, { action: 'edited', field: 'attachments', detail: `Final artwork dipadam: ${att.name}` });
  };
  const projectSiblings = job.project_id ? (jobs || []).filter(j => j.project_id === job.project_id && j.id !== job.id) : [];

  return (
    <div className="detail-panel">
      <ProgressStepper job={job} onStatus={onStatus} onRollback={onRollback} onCancel={onCancel} onArchive={onArchive} />
      {job.project_id && (
        <div className="project-line">
          🔗 Project <span className="jid">{job.project_id}</span>
          {projectSiblings.length > 0 && <>
            {' '}— bersama {projectSiblings.map((s, i) => (
              <span key={s.id}>{i > 0 && ', '}<a onClick={() => onJumpToJob(s.job_id)}>{s.job_id} · {DEPT[s.department]?.label}</a></span>
            ))}
          </>}
        </div>
      )}
      <div className="detail-grid">
        <div>
          <div className="card-title mb-3">Catatan Baru</div>
          <RichNoteComposer jobId={job.job_id} onSubmit={submitRichNote} />

          <div className="card-title mt-6 mb-3">Activity Log</div>
          <Timeline jobId={job.job_id} getActivity={getActivity} job={job} />
        </div>
        <div>
          <div className="card-title mb-3">Customer</div>
          <CustMini job={job} customers={customers} />

          {/* Document Generation — item editing now happens inside whichever
              doc's preview modal is opened, so there's no separate item
              table here anymore; Simpan there writes straight to
              job.line_items, shared by every doc type. */}
          <div className="card-title mt-6 mb-3">Dokumen</div>
          <DocButtons job={job} jobs={jobs} customers={customers} visDepts={visDepts} ledgerEntries={ledgerEntries} onDocGenerated={onDocGenerated} userName={userName} onUpdateJob={onUpdateJob} onUpdateCustomer={onUpdateCustomer} />

          {/* Financial Breakdown */}
          <div style={{ marginTop: 16 }}>
            <FinancialBreakdown job={job} onToggleInstallment={onToggleInstallment} />
          </div>

          {/* Final artwork — the print-ready file(s), attached once every
              item's design is done and approved, right before sending to
              the printer/kilang. */}
          <div style={{marginTop:16,border:'1px solid #10B98130',borderRadius:8,padding:'8px 10px',background:'#F0FDF9'}}>
            <div style={{fontSize:12,fontWeight:600,color:'#10B981',marginBottom:6}}>🖨️ Final Artwork</div>
            <UploadCol title="" atts={finalArtworkAtts} busy={finalArtBusy} onUpload={handleFinalArtworkUpload} onView={handleFinalArtworkView} onDelete={handleFinalArtworkDelete} />
          </div>

          {/* Artwork per item + Customer Approval */}
          <div style={{marginTop:16}}>
            <AttachmentSlots job={job} onUpdateJob={onUpdateJob} userName={userName} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Artwork & Customer Approval Attachments ──────────────────
// Artwork is one slot per item type — each item is genuinely a separate
// design file. Doesn't auto-split by quantity ("4x Arrow" stays one slot):
// multiple units of the same item usually share one design in practice.
// Staff can add more design slots manually under an item for the real edge
// case (e.g. each arrow pointing somewhere different). Approval is NOT
// paired 1:1 with artwork — a customer typically approves the whole batch
// in one reply/screenshot after seeing every design together, so it's one
// shared section for the job (supports multiple uploads for revision
// rounds). Files are actual uploads (screenshot, PDF, forwarded email), not
// just a link, so the proof lives on the job itself — in a private Supabase
// Storage bucket, viewed via a short-lived signed URL. Mock mode has no
// real storage, so it falls back to an in-browser blob URL for the session.
export function baseSlotsFor(job) {
  return (job.line_items || []).flatMap((li, i) => {
    const lineItemId = li.id || `idx-${i}`;
    if (li.noSize && li.desc) {
      return li.desc.split('\n').filter(Boolean).map((line, di) => ({ key: `${lineItemId}::${di}`, label: line.replace(/^1x\s+/, '') }));
    }
    return [{ key: lineItemId, label: li.item || `Item ${i + 1}` }];
  });
}

export function AttachmentSlots({ job, onUpdateJob, userName }) {
  const [busyKey, setBusyKey] = useState(null);
  const [extraDesigns, setExtraDesigns] = useState({});
  const attachments = job.attachments || [];
  const baseSlots = baseSlotsFor(job);

  // How many design instances to render for a base item: at least 1, more if
  // attachments already exist for a later instance, more still if staff just
  // clicked "+ Tambah design lain" this session.
  const instanceCount = (baseKey) => {
    const usedMax = attachments.reduce((max, a) => {
      if (typeof a.line_item_id === 'string' && a.line_item_id.startsWith(baseKey + '#')) {
        const idx = parseInt(a.line_item_id.slice(baseKey.length + 1), 10);
        if (!isNaN(idx)) return Math.max(max, idx + 1);
      }
      return max;
    }, 0);
    return Math.max(1, usedMax, 1 + (extraDesigns[baseKey] || 0));
  };

  const attsFor = (slotKey, kind) => attachments.filter(a => a.kind === kind && a.line_item_id === slotKey);

  const handleUpload = async (slotKey, label, kind, file) => {
    if (!file) return;
    setBusyKey(`${slotKey}:${kind}`);
    try {
      let path = null, url = null;
      if (isMockMode) {
        url = URL.createObjectURL(file);
      } else {
        path = `${job.job_id}/${kind}/${slotKey}/${Date.now()}_${file.name}`;
        const { error } = await supabase.storage.from('job-attachments').upload(path, file);
        if (error) throw error;
      }
      const entry = { id: crypto.randomUUID(), kind, line_item_id: slotKey, path, url, name: file.name, uploaded_by: userName || 'System', uploaded_at: new Date().toISOString() };
      onUpdateJob(job.id, { attachments: [...attachments, entry] }, userName, { action: 'edited', field: 'attachments', detail: `${kind === 'approval' ? 'Approval customer' : 'Artwork'} (${label}) dimuat naik: ${file.name}` });
    } catch (err) {
      alert('Gagal muat naik: ' + (err?.message || err));
    } finally {
      setBusyKey(null);
    }
  };

  const handleView = async (att) => {
    if (att.url) { window.open(att.url, '_blank'); return; }
    const { data, error } = await supabase.storage.from('job-attachments').createSignedUrl(att.path, 3600);
    if (error) { alert('Gagal buka fail: ' + error.message); return; }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (att) => {
    if (!window.confirm(`Padam "${att.name}"?`)) return;
    if (att.path && !isMockMode) await supabase.storage.from('job-attachments').remove([att.path]);
    onUpdateJob(job.id, { attachments: attachments.filter(a => a.id !== att.id) }, userName, { action: 'edited', field: 'attachments', detail: `Attachment dipadam: ${att.name}` });
  };

  if (!baseSlots.length) return null;

  return (
    <div>
      <div className="section-label" style={{marginBottom:6}}>Artwork</div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {baseSlots.map(base => {
          const count = instanceCount(base.key);
          return (
            <div key={base.key} style={{border:'1px solid #E8E4ED',borderRadius:8,padding:'8px 10px'}}>
              <div style={{fontSize:12,fontWeight:600,color:'#1A1025',marginBottom:6}}>📎 {base.label}</div>
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {Array.from({length: count}, (_, idx) => {
                  const slotKey = `${base.key}#${idx}`;
                  const label = count > 1 ? `${base.label} — Design ${idx + 1}` : base.label;
                  return (
                    <div key={slotKey} style={idx > 0 ? {paddingTop:8,borderTop:'1px dashed #F0ECF4'} : undefined}>
                      {count > 1 && <div style={{fontSize:10.5,fontWeight:600,color:'#E91E63',marginBottom:4}}>Design {idx + 1}</div>}
                      <UploadCol title="" atts={attsFor(slotKey,'artwork')} busy={busyKey===`${slotKey}:artwork`} onUpload={f=>handleUpload(slotKey,label,'artwork',f)} onView={handleView} onDelete={handleDelete} />
                    </div>
                  );
                })}
              </div>
              <button onClick={()=>setExtraDesigns(p=>({...p,[base.key]:(p[base.key]||0)+1}))} style={{fontFamily:"'Poppins',sans-serif",fontSize:10.5,fontWeight:600,color:'#3A86FF',background:'none',border:'none',cursor:'pointer',padding:0,marginTop:8}}>+ Tambah design lain</button>
            </div>
          );
        })}
      </div>

      {/* One shared approval slot for the whole job — a customer typically
          approves everything together in a single reply, not item by item.
          Supports multiple uploads for revision rounds (reject -> revise
          -> re-approve). */}
      <div style={{marginTop:12,border:'1px solid #E91E6330',borderRadius:8,padding:'8px 10px',background:'#FFF5F8'}}>
        <div style={{fontSize:12,fontWeight:600,color:'#E91E63',marginBottom:6}}>✅ Approval Customer</div>
        <UploadCol title="" atts={attsFor('job','approval')} busy={busyKey==='job:approval'} onUpload={f=>handleUpload('job','Approval customer','approval',f)} onView={handleView} onDelete={handleDelete} />
      </div>
    </div>
  );
}

// Defined outside AttachmentSlots so it keeps a stable component identity
// across renders — nesting it inside would recreate the type on every
// upload/delete and force React to fully remount every slot's file inputs.
export function UploadCol({ title, atts, busy, onUpload, onView, onDelete }) {
  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:6}}>
        <span style={{fontSize:10.5,fontWeight:600,color:'#9B93A8',textTransform:'uppercase',letterSpacing:'0.03em'}}>{title}</span>
        <label style={{fontSize:11,fontWeight:600,color:'#3A86FF',cursor: busy ? 'default' : 'pointer',whiteSpace:'nowrap'}}>
          {busy ? '...' : '+ Upload'}
          <input type="file" accept="image/*,.pdf,.eml,.msg" style={{display:'none'}} disabled={busy} onChange={e=>{ const f=e.target.files?.[0]; onUpload(f); e.target.value=''; }} />
        </label>
      </div>
      {atts.length > 0 ? (
        <div style={{marginTop:4,display:'flex',flexDirection:'column',gap:3}}>
          {atts.map(a => (
            <div key={a.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11}}>
              <a onClick={()=>onView(a)} style={{color:'#3A86FF',cursor:'pointer',wordBreak:'break-all'}}>{a.name}</a>
              <button onClick={()=>onDelete(a)} style={{background:'none',border:'none',cursor:'pointer',color:'#EF4444',fontSize:13,padding:0,marginLeft:6}}>×</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{marginTop:3,fontSize:10.5,color:'#B0A8BC',fontStyle:'italic'}}>Tiada fail</div>
      )}
    </div>
  );
}

// ─── Special Arrangement Section in Create Modal ──────────────
export function SpecialArrangementSection({ specialArr, setSpecialArr, costBreakdown, setCostBreakdown, hasInstallment, setHasInstallment, installments, setInstallments, estValue }) {
  const breakdownTotal = costBreakdown.reduce((s, item) => s + (Number(item.amount) || 0), 0);
  const baki = (Number(estValue) || 0) - breakdownTotal;

  const addBreakdownRow = () => setCostBreakdown(p => [...p, { type: "Consignment Offset", recipient: "", amount: "" }]);
  const removeBreakdownRow = (i) => setCostBreakdown(p => p.filter((_, idx) => idx !== i));
  const updateBreakdown = (i, field, val) => setCostBreakdown(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const addInstallmentRow = () => setInstallments(p => [...p, { amount: "", due_date: "", status: "pending" }]);
  const removeInstallmentRow = (i) => setInstallments(p => p.filter((_, idx) => idx !== i));
  const updateInstallment = (i, field, val) => setInstallments(p => p.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Special Arrangement Toggle */}
      <label className="field-label">Ada special arrangement?</label>
      <div style={{ display: "flex", gap: 0, marginBottom: specialArr ? 16 : 0 }}>
        <button
          style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: "8px 0 0 8px", cursor: "pointer", border: "1px solid #E8E4ED", borderRight: "none", background: !specialArr ? "#1A1025" : "#fff", color: !specialArr ? "#fff" : "#6B6080" }}
          onClick={() => { setSpecialArr(false); setCostBreakdown([]); setHasInstallment(false); setInstallments([]); }}
        >Tidak</button>
        <button
          style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: "0 8px 8px 0", cursor: "pointer", border: "1px solid #E8E4ED", background: specialArr ? "#E91E63" : "#fff", color: specialArr ? "#fff" : "#6B6080" }}
          onClick={() => setSpecialArr(true)}
        >Ya</button>
      </div>

      {specialArr && (
        <>
          {/* Cost Breakdown */}
          <div style={{ background: "#F9F8FB", borderRadius: 10, padding: 16, border: "1px solid #F0ECF4", marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <label className="field-label" style={{ margin: 0 }}>Cost Breakdown</label>
              <button
                onClick={addBreakdownRow}
                style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "1px solid #E8E4ED", background: "#fff", color: "#E91E63", cursor: "pointer" }}
              >+ Tambah Item</button>
            </div>
            {costBreakdown.map((item, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px 28px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                <select className="field-select" style={{ width: "100%", height: 36, fontSize: 12 }} value={item.type} onChange={e => updateBreakdown(i, "type", e.target.value)}>
                  <option value="Consignment Offset">Consignment Offset</option>
                  <option value="Vendor">Vendor</option>
                  <option value="Komisyen">Komisyen</option>
                  <option value="Lain-lain">Lain-lain</option>
                </select>
                <input className="field-input" style={{ height: 36, fontSize: 12 }} value={item.recipient} onChange={e => updateBreakdown(i, "recipient", e.target.value)} placeholder="Penerima" />
                <input type="number" className="field-input" style={{ height: 36, fontSize: 12 }} value={item.amount} onChange={e => updateBreakdown(i, "amount", e.target.value)} placeholder="RM" />
                <button onClick={() => removeBreakdownRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            ))}
            {costBreakdown.length === 0 && <div className="text-sm text-muted" style={{ padding: "8px 0" }}>Tiada item. Klik "+ Tambah Item" untuk mula.</div>}

            {/* Baki calculation */}
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E8E4ED", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="text-sm text-secondary">Baki Kretivco = {formatRM(Number(estValue) || 0)} - {formatRM(breakdownTotal)}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: baki >= 0 ? "#10B981" : "#EF4444" }}>{formatRM(baki)}</span>
            </div>
          </div>

          {/* Installment Toggle */}
          <label className="field-label">Ada installment?</label>
          <div style={{ display: "flex", gap: 0, marginBottom: hasInstallment ? 16 : 0 }}>
            <button
              style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: "8px 0 0 8px", cursor: "pointer", border: "1px solid #E8E4ED", borderRight: "none", background: !hasInstallment ? "#1A1025" : "#fff", color: !hasInstallment ? "#fff" : "#6B6080" }}
              onClick={() => { setHasInstallment(false); setInstallments([]); }}
            >Tidak</button>
            <button
              style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: "8px 20px", borderRadius: "0 8px 8px 0", cursor: "pointer", border: "1px solid #E8E4ED", background: hasInstallment ? "#E91E63" : "#fff", color: hasInstallment ? "#fff" : "#6B6080" }}
              onClick={() => setHasInstallment(true)}
            >Ya</button>
          </div>

          {hasInstallment && (
            <div style={{ background: "#F9F8FB", borderRadius: 10, padding: 16, border: "1px solid #F0ECF4" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <label className="field-label" style={{ margin: 0 }}>Installments</label>
                <button
                  onClick={addInstallmentRow}
                  style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "1px solid #E8E4ED", background: "#fff", color: "#E91E63", cursor: "pointer" }}
                >+ Tambah Installment</button>
              </div>
              {installments.map((inst, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 28px", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <input type="number" className="field-input" style={{ height: 36, fontSize: 12 }} value={inst.amount} onChange={e => updateInstallment(i, "amount", e.target.value)} placeholder="Amount (RM)" />
                  <input type="month" className="field-input" style={{ height: 36, fontSize: 12 }} value={inst.due_date} onChange={e => updateInstallment(i, "due_date", e.target.value)} />
                  <button onClick={() => removeInstallmentRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "#EF4444", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
              {installments.length === 0 && <div className="text-sm text-muted" style={{ padding: "8px 0" }}>Tiada installment. Klik "+ Tambah Installment" untuk mula.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}


// ─── Shared page styles (list + detail both need these classes) ──
export function GlobalJobStyles() {
  return (
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0} :root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}
        .header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .h-title{font-size:20px;font-weight:700} .h-sub{font-size:12px;color:rgba(255,255,255,.6);margin-top:2px}
        .content{padding:24px;max-width:1400px;margin:0 auto}
        .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .filter-bar{padding:16px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
        .field-input{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 12px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;box-sizing:border-box}
        .field-input:focus{border-color:#E91E63!important;box-shadow:0 0 0 3px rgba(233,30,99,.08)}
        .field-select{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 10px;height:40px;outline:none;background:#fff;color:#1A1025;cursor:pointer;appearance:auto}
        .field-select:focus{border-color:#E91E63!important}
        .field-label{font-size:12px;font-weight:500;color:#6B6080;display:block;margin-bottom:6px}
        .field-error{font-size:11px;color:#EF4444;margin-top:4px}
        .field-input-err, .field-input-err.field-input{border-color:#EF4444!important;background:#FEF2F2}
        .field-select-err{border-color:#EF4444!important;background:#FEF2F2}
        .search-wrap{position:relative;flex:1 1 220px;min-width:180px}
        .search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#B0A8BC;display:flex}
        .tbl-header{display:grid;background:#F9F8FB;padding:0 20px;border-bottom:1px solid #F3F1F6;align-items:center}
        .tbl-col{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;padding:12px 4px;cursor:pointer;user-select:none;display:flex;align-items:center}
        .tbl-row{display:grid;padding:0 20px;align-items:center;height:48px;cursor:pointer;border-bottom:1px solid #F3F1F6;transition:background .15s}
        .tbl-row:hover{background:#F9F8FB} .tbl-row.expanded{background:#FFF8E1;border-bottom:none}
        .tbl-cell{padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .badge-status{display:inline-block;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600;white-space:nowrap}
        .badge-dept{display:inline-block;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;white-space:nowrap}
        .jid{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600}
        .dl-overdue{font-size:12px;font-weight:600;color:#EF4444} .dl-warn{font-size:12px;font-weight:600;color:#F59E0B}
        .dl-pill{font-size:10px;border-radius:10px;padding:2px 6px;margin-left:4px} .dl-pill-red{background:#EF444418} .dl-pill-amber{background:#F59E0B18}
        .sort-idle{color:#D4CDE0;font-size:10px;margin-left:2px} .sort-active{color:#E91E63;font-size:10px;margin-left:2px}
        .detail-panel{background:#FAFAFA;border-top:2px solid rgba(233,30,99,.2);padding:24px 28px}
        .detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px}
        .stepper-wrap{padding-bottom:20px;margin-bottom:20px;border-bottom:1px solid #F0ECF4}
        .stepper-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:6px}
        .stepper-label{font-size:11px;font-weight:700;color:#9B93A8;text-transform:uppercase;letter-spacing:.05em}
        .stepper-current{font-size:12.5px;font-weight:600}
        .stepper{display:flex;align-items:center}
        .step{flex:1;display:flex;flex-direction:column;align-items:center;position:relative}
        .step .dot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;z-index:2;border:2px solid #E8E4ED;background:#fff;color:#9B93A8;transition:transform .12s}
        .step .lbl{font-size:11.5px;font-weight:600;color:#9B93A8;margin-top:7px}
        .step .line{position:absolute;top:13px;right:50%;width:100%;height:2px;background:#E8E4ED;z-index:1}
        .step:first-child .line{display:none}
        .step.done .line,.step.current .line{background:#10B981}
        .step.clickable{cursor:pointer}
        .step.clickable .dot{border-style:dashed;border-color:#B0A8BC}
        .step.clickable:hover .dot{transform:scale(1.12);border-color:#E91E63;color:#E91E63;background:#E91E6312}
        .step.clickable:hover .lbl{color:#E91E63}
        .stepper-cancelled{padding:12px 16px;border-radius:10px;background:#EF444412;border:1px solid #EF444430;color:#EF4444;font-weight:700;font-size:13px;margin-bottom:20px;display:flex;align-items:center;gap:8px}
        .stepper-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
        .stepper-mini-btn{font-family:'Poppins',sans-serif;font-size:11px;font-weight:600;padding:5px 12px;border-radius:20px;border:1px solid #E8E4ED;background:#fff;color:#9B93A8;cursor:pointer}
        .stepper-mini-btn.cancel{color:#EF4444;border-color:#EF444440;background:#EF444410}
        .project-line{margin-top:10px;padding:9px 12px;border-radius:8px;background:rgba(233,30,99,.08);font-size:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
        .project-line a{color:#E91E63;font-weight:600;text-decoration:none;cursor:pointer}
        .project-line a:hover{text-decoration:underline}
        .link-badge{display:inline-flex;align-items:center;gap:2px;font-size:10px;font-weight:700;color:#E91E63;background:rgba(233,30,99,.1);padding:1px 6px;border-radius:20px;margin-left:6px;cursor:pointer;vertical-align:middle}
        .link-badge:hover{background:rgba(233,30,99,.18)}
        .info-grid{display:grid;grid-template-columns:120px 1fr;gap:10px 12px;font-size:13px}
        .info-label{color:#9B93A8;font-weight:500}
        .card-title{font-size:14px;font-weight:700;color:#1A1025}
        .section-label{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;margin-bottom:4px}
        .notes-box{margin-top:16px;padding:12px 14px;background:#fff;border-radius:8px;border:1px solid #F0ECF4}
        .finance-box{margin-top:0;padding:14px 16px;background:#fff;border-radius:8px;border:1px solid #F0ECF4}
        .action-row{margin-top:16px;display:flex;gap:8px;flex-wrap:wrap}
        .btn-status{font-family:'Poppins',sans-serif;font-size:12px;font-weight:600;padding:7px 16px;border-radius:8px;border:none;cursor:pointer}
        .btn-archive{font-family:'Poppins',sans-serif;font-size:12px;font-weight:500;padding:7px 16px;border-radius:8px;border:1px solid #E8E4ED;background:#fff;color:#9B93A8;cursor:pointer}
        .btn-reset{font-family:'Poppins',sans-serif;font-size:12px;font-weight:500;padding:8px 16px;border-radius:8px;border:1px solid #E8E4ED;background:#F5F3F7;color:#6B6080;cursor:pointer}
        .cust-mini{background:#F9F8FB;border-radius:10px;padding:14px 16px;border:1px solid #F0ECF4}
        .cust-mini-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}
        .cust-mini-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:12px}
        .avatar-sm{width:32px;height:32px;border-radius:50%;background:rgba(233,30,99,.15);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#E91E63}
        .timeline{position:relative;padding-left:20px} .timeline-line{position:absolute;left:5px;top:8px;bottom:8px;width:2px;background:#E8E4ED;border-radius:1px}
        .timeline-entry{position:relative;padding-bottom:16px} .timeline-entry:last-child{padding-bottom:0}
        .timeline-dot{position:absolute;left:-17px;top:4px;width:12px;height:12px;border-radius:50%;border:2px solid #fff}
        .text-sm{font-size:12px} .text-xs{font-size:11px} .text-body{font-size:13px} .text-muted{color:#9B93A8} .text-secondary{color:#6B6080} .text-green{color:#10B981}
        .font-semibold{font-weight:600} .ml-1{margin-left:4px} .mb-3{margin-bottom:12px} .mb-4{margin-bottom:16px} .mt-6{margin-top:24px}
        .empty{padding:48px 20px;text-align:center;color:#9B93A8;font-size:13px}
        .summary-footer{margin-top:12px;padding:10px 20px;font-size:12px;color:#9B93A8;display:flex;justify-content:space-between}
        .modal-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;animation:fadeIn .2s}
        .modal-overlay::before{content:'';position:absolute;inset:0;background:rgba(0,0,0,.5)}
        .modal-box{position:relative;background:#fff;border-radius:16px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.18);animation:slideUp .25s}
        .modal-header{padding:20px 24px;border-bottom:1px solid #F0ECF4;display:flex;justify-content:space-between;align-items:center}
        .modal-title{font-size:16px;font-weight:700} .modal-close{background:none;border:none;font-size:22px;cursor:pointer;color:#9B93A8;padding:0 4px}
        .modal-body{padding:24px;overflow-y:auto;flex:1} .modal-footer{padding:16px 24px;border-top:1px solid #F0ECF4;display:flex;justify-content:flex-end;gap:8px}
        .summary-box{background:#F9F8FB;border-radius:8px;padding:12px;font-size:12px;margin-bottom:16px;border:1px solid #F0ECF4}
        .btn-primary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E91E63;color:#fff;cursor:pointer}
        .btn-secondary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:500;padding:9px 20px;border-radius:8px;border:1px solid #E8E4ED;background:#F5F3F7;color:#1A1025;cursor:pointer}
        .btn-success{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#10B981;color:#fff;cursor:pointer}
        .btn-success:disabled{background:#E8E4ED;color:#9B93A8;cursor:not-allowed}
        .toast{position:fixed;bottom:24px;right:24px;z-index:200;background:#1A1025;color:#fff;border-radius:10px;padding:12px 20px;font-size:13px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.2);border-left:4px solid #10B981;animation:slideUp .3s}
        button:hover{filter:brightness(.97)}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}} @keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .rich-note-content{outline:none;line-height:1.5}
        .rich-note-content p{margin:0 0 6px} .rich-note-content p:last-child{margin-bottom:0}
        .rich-note-content ul,.rich-note-content ol{padding-left:20px;margin:0 0 6px}
        .rich-note-content img{max-width:100%;border-radius:6px;margin:4px 0;display:block}
        .rich-note-content a{color:#3A86FF}
        .job-header-row{display:flex;flex-wrap:wrap;justify-content:space-between;gap:16px}
        .job-header-line{font-size:12.5px;color:rgba(255,255,255,.85);margin-top:3px}
        .hold-badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;margin-top:6px}
      `}</style>
  );
}
