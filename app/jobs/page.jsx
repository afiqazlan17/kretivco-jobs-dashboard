"use client"
import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { DEPT, STATUS, STATUS_FLOW, STATUS_ROLLBACK, CANCEL_REASONS, SOURCE, SOURCE_OPTIONS, PIC_OPTIONS, PIC_BY_DEPT, JOB_TYPE, BANK, availableDocTypes, formatRM, formatDate, formatDateTime, daysUntil } from '@/lib/constants';
import { generateDocument, generateCombinedDocument } from '@/lib/pdf-generator';

// ─── Micro Components ─────────────────────────────────────────
function StatusBadge({ s }) { const m = STATUS[s]; return m ? <span className="badge-status" style={{ color: m.color, background: m.color + "15" }}>{m.label}</span> : null; }
function DTag({ d }) { const m = DEPT[d]; return m ? <span className="badge-dept" style={{ color: m.color, background: m.color + "15" }}>{m.code}</span> : null; }
function JID({ children }) { return <span className="jid">{children}</span>; }

function DLBadge({ deadline, status }) {
  if (["completed","cancelled"].includes(status)) return <span className="text-sm text-muted">{formatDate(deadline)}</span>;
  const d = daysUntil(deadline);
  if (d === null) return <span className="text-sm text-muted">—</span>;
  const ds = formatDate(deadline);
  if (d < 0) return <span className="dl-overdue">{ds} <span className="dl-pill dl-pill-red">Overdue</span></span>;
  if (d <= 3) return <span className="dl-warn">{ds} <span className="dl-pill dl-pill-amber">{d}d</span></span>;
  return <span className="text-sm">{ds}</span>;
}

function Modal({ width, children, onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ width }} onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}

function Toast({ msg, action, onDone }) {
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

// ─── Complete Job Modal ───────────────────────────────────────
function CompleteModal({ job, onConfirm, onClose }) {
  const [fv, setFv] = useState(job.estimation_value || "");
  return (
    <Modal width={480} onClose={onClose}>
      <div className="modal-header"><span className="modal-title">Tandakan Job Selesai</span><button className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body">
        <div className="summary-box"><JID>{job.job_id}</JID> · {job.customer_name}<br /><span className="text-muted">Est: {formatRM(job.estimation_value)}</span></div>
        <label className="field-label">Final Value (RM) *</label>
        <input type="number" className="field-input" style={{ fontSize: 16, fontWeight: 600, height: 48 }} value={fv} onChange={e => setFv(e.target.value)} placeholder="Masukkan final value" />
        {!fv && <div className="field-error">Wajib diisi.</div>}
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose}>Batal</button>
        <button className="btn-success" disabled={!fv} onClick={() => onConfirm(Number(fv))}>Sahkan Selesai</button>
      </div>
    </Modal>
  );
}

function ConfirmModal({ title, msg, label, color, onConfirm, onClose, showReasonField }) {
  const [reasonText, setReasonText] = useState("");
  return (
    <Modal width={400} onClose={onClose}>
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
        <button className="btn-secondary" onClick={onClose}>Batal</button>
        <button className="btn-primary" style={{ background: color }} onClick={() => onConfirm(reasonText)}>{label}</button>
      </div>
    </Modal>
  );
}

// ─── Cancel Modal ────────────────────────────────────────────
function CancelModal({ job, onConfirm, onClose }) {
  const [reason, setReason] = useState(CANCEL_REASONS[0].value);
  const [customText, setCustomText] = useState("");
  return (
    <Modal width={440} onClose={onClose}>
      <div className="modal-header"><span className="modal-title">Batalkan Job</span><button className="modal-close" onClick={onClose}>×</button></div>
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
        <button className="btn-secondary" onClick={onClose}>Batal</button>
        <button className="btn-primary" style={{ background: '#EF4444' }} onClick={() => onConfirm(reason, customText)}>Ya, Batalkan</button>
      </div>
    </Modal>
  );
}

// ─── Activity Timeline ────────────────────────────────────────
function Timeline({ jobId, getActivity }) {
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
      case 'edited': return <><span>update {l.field}: {l.old} → <strong>{l.val}</strong></span></>;
      case 'note': return 'menulis catatan';
      case 'document_generated': return <span>menjana {l.detail}</span>;
      default: return l.action;
    }
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
          {l.reason && <div className="text-sm text-secondary">Sebab: "{l.reason}"</div>}
          {l.note && <div className="text-sm text-secondary">"{l.note}"</div>}
          <div className="text-xs text-muted">{formatDateTime(l.time)}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Customer Mini Profile ────────────────────────────────────
function CustMini({ job, customers }) {
  const cust = customers.find(c => c.id === job.customer_id);
  const name = job.customer_name || job.customer_id || "—";
  return (
    <div className="cust-mini">
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
function FinancialBreakdown({ job, onToggleInstallment }) {
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
function DocButtons({ job, jobs, customers, visDepts, onDocGenerated }) {
  const [generating, setGenerating] = useState(null);
  const [showCombine, setShowCombine] = useState(false);
  const [combineIds, setCombineIds] = useState(new Set());
  const cust = customers.find(c => c.id === job.customer_id) || null;

  const handleGen = async (type, label) => {
    setGenerating(type);
    try {
      const result = await generateDocument(type, job, cust);
      onDocGenerated && onDocGenerated([job.job_id], label, result.docNumber);
    } catch (err) {
      console.error('PDF generation error:', err);
    }
    setGenerating(null);
  };

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
      onDocGenerated && onDocGenerated(combineJobs.map(j => j.job_id), `${label} gabungan`, result.docNumber);
    } catch (err) {
      console.error('Combined PDF generation error:', err);
    }
    setGenerating(null);
  };

  if (docs.length === 0) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div className="section-label" style={{ marginBottom: 6 }}>Dokumen</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {docs.map(d => (
          <button key={d.type} onClick={() => handleGen(d.type, d.label)} disabled={generating === d.type} style={btnStyle(d.color)}>
            <span>{d.icon}</span>
            {generating === d.type ? 'Menjana...' : d.label}
          </button>
        ))}
      </div>
      {(!job.line_items || job.line_items.length === 0) && (
        <div style={{ fontSize: 11, color: '#E85D04', marginTop: 6, fontStyle: 'italic' }}>⚠ Tiada item — sila tambah item sebelum menjana dokumen.</div>
      )}

      {siblings.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {!showCombine ? (
            <button onClick={() => setShowCombine(true)} style={{ fontFamily: "'Poppins',sans-serif", fontSize: 11, fontWeight: 600, color: '#E91E63', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>+ Gabung dengan Job Lain (Customer Sama)</button>
          ) : (
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
    </div>
  );
}

// ─── Progress Stepper — full-width pipeline view at top of job detail ──
// Doubles as the status control: click an upcoming stage to advance, click
// a past stage to roll back to it. Cancel/Archive stay as small secondary
// actions here since they're not part of the forward/back flow itself.
const PIPELINE_STAGES = ['potential', 'active', 'in_progress', 'completed'];
function ProgressStepper({ job, onStatus, onRollback, onCancel, onArchive }) {
  const { status } = job;
  if (status === 'cancelled') {
    return <div className="stepper-cancelled">✕ Job Dibatalkan</div>;
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

function DetailPanel({ job, jobs, customers, visDepts, getActivity, onStatus, onRollback, onCancel, onArchive, onToggleInstallment, onUpdateJob, onAddNote, onDocGenerated, onJumpToJob, userName }) {
  const [noteText, setNoteText] = useState('');
  const submitNote = () => {
    if (!noteText.trim()) return;
    onAddNote(job.job_id, noteText.trim());
    setNoteText('');
  };
  const [editingItems, setEditingItems] = useState(false);
  const [editItems, setEditItems] = useState([]);
  const eiUpdate = (i,k,v) => setEditItems(p=>p.map((li,idx)=>idx===i?{...li,[k]:v}:li));
  const eiAdd = () => setEditItems(p=>[...p,{item:'',desc:'',size:'',qty:1,price:0}]);
  const eiRemove = (i) => setEditItems(p=>p.length>1?p.filter((_,idx)=>idx!==i):[{item:'',desc:'',size:'',qty:1,price:0}]);
  const eiTotal = editItems.reduce((s,li)=>s+((Number(li.qty)||0)*(Number(li.price)||0)),0);
  const startEdit = () => { setEditItems(job.line_items?.length ? job.line_items.map(li=>({...li})) : [{item:'',desc:'',size:'',qty:1,price:0}]); setEditingItems(true); };
  const saveItems = () => {
    const valid = editItems.filter(li=>li.item.trim()).map(li=>({item:li.item.trim(),desc:li.desc?.trim()||'',size:li.size?.trim()||'',qty:Number(li.qty)||1,price:Number(li.price)||0,total:(Number(li.qty)||1)*(Number(li.price)||0)}));
    const total = valid.reduce((s,li)=>s+li.total,0);
    onUpdateJob(job.id, { line_items: valid, estimation_value: total || job.estimation_value }, userName, { action:'edited', field:'line_items', detail:'Item dikemaskini' });
    setEditingItems(false);
  };

  const projectSiblings = job.project_id ? (jobs || []).filter(j => j.project_id === job.project_id && j.id !== job.id) : [];

  return (
    <div className="detail-panel">
      <ProgressStepper job={job} onStatus={onStatus} onRollback={onRollback} onCancel={onCancel} onArchive={onArchive} />
      <div className="detail-grid">
        <div>
          <div className="card-title mb-4">Maklumat Job</div>
          <div className="info-grid">
            <span className="info-label">Job ID</span><JID>{job.job_id}</JID>
            <span className="info-label">Department</span><span><DTag d={job.department} /> <span className="text-secondary ml-1">{DEPT[job.department]?.label}</span></span>
            <span className="info-label">Nama Job</span><span>{job.job_type}</span>
            <span className="info-label">Job Type</span><span style={{fontSize:12}}>{JOB_TYPE[job.job_type_category]?.label || '—'}</span>
            <span className="info-label">Bank</span><span style={{fontSize:12}}>{BANK[job.bank]?.label || '—'}</span>
            <span className="info-label">Status</span><StatusBadge s={job.status} />
            <span className="info-label">PIC</span><span>{job.pic}</span>
            <span className="info-label">Est. Value</span><span className="font-semibold">{formatRM(job.estimation_value)}</span>
            {job.final_value && <><span className="info-label">Final Value</span><span className="font-semibold text-green">{formatRM(job.final_value)}</span></>}
            <span className="info-label">Mula</span><span>{formatDate(job.start_date)}</span>
            <span className="info-label">Deadline</span><DLBadge deadline={job.deadline} status={job.status} />
            {job.cancel_reason && <><span className="info-label">Sebab Batal</span><span className="text-body">{CANCEL_REASONS.find(r => r.value === job.cancel_reason)?.label || job.cancel_reason}{job.cancel_reason_text ? ` — ${job.cancel_reason_text}` : ''}</span></>}
          </div>
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
          {job.notes && <div className="notes-box"><div className="section-label">Nota</div><div className="text-body">{job.notes}</div></div>}

          {/* Line Items */}
          <div style={{marginTop:16}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div className="section-label" style={{margin:0}}>Item</div>
              {!editingItems ? <button onClick={startEdit} style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,color:'#E91E63',background:'none',border:'none',cursor:'pointer'}}>{job.line_items?.length?'✎ Edit':'+ Tambah Item'}</button>
              : <div style={{display:'flex',gap:6}}><button onClick={saveItems} style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,color:'#fff',background:'#E91E63',border:'none',borderRadius:6,padding:'4px 12px',cursor:'pointer'}}>Simpan</button><button onClick={()=>setEditingItems(false)} style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,color:'#6B6080',background:'#F0ECF4',border:'none',borderRadius:6,padding:'4px 12px',cursor:'pointer'}}>Batal</button></div>}
            </div>
            {!editingItems && job.line_items?.length > 0 && (
              <div style={{border:'1px solid #E8E4ED',borderRadius:8,overflow:'hidden',fontSize:12}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 0.6fr 1fr 1fr',gap:0,padding:'6px 10px',background:'#F9F8FB',fontSize:10,fontWeight:600,color:'#6B6080',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                  <span>Item</span><span>Keterangan</span><span>Size</span><span>Qty</span><span>Harga</span><span style={{textAlign:'right'}}>Jumlah</span>
                </div>
                {job.line_items.map((li,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 0.6fr 1fr 1fr',gap:0,padding:'7px 10px',borderTop:'1px solid #F0ECF4'}}>
                    <span style={{fontWeight:600,color:'#1A1025'}}>{li.item}</span>
                    <span style={{color:'#6B6080'}}>{li.desc||'—'}</span>
                    <span style={{color:'#6B6080'}}>{li.size||'—'}</span>
                    <span>{li.qty}</span>
                    <span>{formatRM(li.price)}</span>
                    <span style={{textAlign:'right',fontWeight:600}}>{formatRM(li.total||(li.qty*li.price))}</span>
                  </div>
                ))}
                <div style={{padding:'7px 10px',borderTop:'1px solid #E8E4ED',background:'#F9F8FB',display:'flex',justifyContent:'flex-end',fontWeight:700,fontSize:13}}>
                  Jumlah: {formatRM(job.line_items.reduce((s,li)=>s+(li.total||(li.qty*li.price)||0),0))}
                </div>
              </div>
            )}
            {editingItems && (
              <div style={{border:'1px solid #E91E6330',borderRadius:8,overflow:'hidden',fontSize:12}}>
                <div style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 0.6fr 1fr 0.8fr 28px',gap:0,padding:'6px 10px',background:'#FFF5F8',fontSize:10,fontWeight:600,color:'#6B6080',textTransform:'uppercase',letterSpacing:'0.05em'}}>
                  <span>Item *</span><span>Keterangan</span><span>Size</span><span>Qty</span><span>Harga</span><span>Jumlah</span><span></span>
                </div>
                {editItems.map((li,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 2fr 1fr 0.6fr 1fr 0.8fr 28px',gap:4,padding:'5px 10px',borderTop:'1px solid #F0ECF4',alignItems:'center'}}>
                    <input className="field-input" style={{height:30,fontSize:11,margin:0}} value={li.item} onChange={e=>eiUpdate(i,'item',e.target.value)} />
                    <input className="field-input" style={{height:30,fontSize:11,margin:0}} value={li.desc||''} onChange={e=>eiUpdate(i,'desc',e.target.value)} />
                    <input className="field-input" style={{height:30,fontSize:11,margin:0}} value={li.size||''} onChange={e=>eiUpdate(i,'size',e.target.value)} />
                    <input type="number" className="field-input" style={{height:30,fontSize:11,margin:0}} value={li.qty} onChange={e=>eiUpdate(i,'qty',e.target.value)} min="1" />
                    <input type="number" className="field-input" style={{height:30,fontSize:11,margin:0}} value={li.price} onChange={e=>eiUpdate(i,'price',e.target.value)} />
                    <span style={{fontSize:11,fontWeight:600,textAlign:'right'}}>{((Number(li.qty)||0)*(Number(li.price)||0)).toLocaleString('ms-MY',{minimumFractionDigits:2})}</span>
                    <button onClick={()=>eiRemove(i)} style={{background:'none',border:'none',cursor:'pointer',color:'#EF4444',fontSize:13,padding:0}}>×</button>
                  </div>
                ))}
                <div style={{padding:'6px 10px',borderTop:'1px solid #F0ECF4',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <button onClick={eiAdd} style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,color:'#E91E63',background:'none',border:'none',cursor:'pointer'}}>+ Tambah</button>
                  <span style={{fontSize:12,fontWeight:700}}>Jumlah: RM {eiTotal.toLocaleString('ms-MY',{minimumFractionDigits:2})}</span>
                </div>
              </div>
            )}
            {!editingItems && (!job.line_items || job.line_items.length===0) && <div style={{fontSize:12,color:'#9B93A8',fontStyle:'italic'}}>Tiada item</div>}
          </div>

          {/* Financial Breakdown */}
          <div style={{ marginTop: 16 }}>
            <FinancialBreakdown job={job} onToggleInstallment={onToggleInstallment} />
          </div>
        </div>
        <div>
          <div className="card-title mb-3">Customer</div>
          <CustMini job={job} customers={customers} />
          <div className="card-title mt-6 mb-3">Activity Log</div>
          <Timeline jobId={job.job_id} getActivity={getActivity} />

          {/* Document Generation */}
          <div style={{ marginTop: 12 }}>
            <DocButtons job={job} jobs={jobs} customers={customers} visDepts={visDepts} onDocGenerated={onDocGenerated} />
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <textarea
              className="field-input"
              style={{ height: 60, paddingTop: 8, resize: 'vertical', flex: 1 }}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Tulis catatan untuk job ini..."
            />
            <button
              onClick={submitNote}
              disabled={!noteText.trim()}
              style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: noteText.trim() ? 'pointer' : 'not-allowed', background: noteText.trim() ? '#E91E63' : '#E8E4ED', color: noteText.trim() ? '#fff' : '#9B93A8', whiteSpace: 'nowrap' }}
            >Tambah Catatan</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Special Arrangement Section in Create Modal ──────────────
function SpecialArrangementSection({ specialArr, setSpecialArr, costBreakdown, setCostBreakdown, hasInstallment, setHasInstallment, installments, setInstallments, estValue }) {
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

// ─── Main ─────────────────────────────────────────────────────
export default function JobMonitor() {
  // Auth - role based filtering
  const { profile } = useAuth() || {};
  const isBod = profile?.role === 'bod';
  const userDept = profile?.department || null;
  const visDepts = useVisibleDepts();

  // Shared data store
  const { jobs, customers, addJob, updateJob, addCustomer, getActivity, addLog, genJobId, genCustId, genProjectId } = useData();

  const DEPT_LIST = Object.entries(DEPT).map(([k,v])=>({key:k,...v}));

  const [expandedId, setExpandedId] = useState(null);
  const [fDept, setFDept] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("deadline");
  const [sortDir, setSortDir] = useState("asc");
  const [completeJob, setCompleteJob] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [cancelJob, setCancelJob] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({depts:[],cid:'',type:'',jobType:'client_project',bank:'',status:'potential',pic:'',picByDept:{},start:'',deadline:'',notes:''});

  // Inline customer creation state
  const [showInlineCust, setShowInlineCust] = useState(false);
  const [newCust, setNewCust] = useState({name:'',company:'',phone:'',email:'',source:'referral'});

  // Auto-open from sidebar or URL param
  useEffect(()=>{
    const checkAndOpen = () => {
      const params = new URLSearchParams(window.location.search);
      if(params.get('new') === '1') {
        const cid = params.get('cid');
        if (cid) setNewJob(p=>({...p, cid}));
        setShowCreate(true);
        window.history.replaceState(null,'','/jobs');
      }
    };
    checkAndOpen();
    const timer = setTimeout(checkAndOpen, 200);

    const handler = ()=> setShowCreate(true);
    window.addEventListener('open-create-job', handler);
    return ()=> { clearTimeout(timer); window.removeEventListener('open-create-job', handler); };
  }, []);

  const nj = (k,v) => setNewJob(p=>({...p,[k]:v}));
  const toggleDept = (key) => setNewJob(p => {
    const has = p.depts.includes(key);
    const depts = has ? p.depts.filter(d=>d!==key) : [...p.depts, key];
    const picByDept = { ...p.picByDept };
    if (has) delete picByDept[key];
    return { ...p, depts, picByDept };
  });
  const setPicForDept = (key, pic) => setNewJob(p => ({ ...p, picByDept: { ...p.picByDept, [key]: pic } }));

  const resetCreateForm = () => {
    setNewJob({depts:[],cid:'',type:'',jobType:'client_project',bank:'',status:'potential',pic:'',picByDept:{},start:'',deadline:'',notes:''});
    setShowInlineCust(false);
    setNewCust({name:'',company:'',phone:'',email:'',source:'referral'});
  };

  const handleSaveInlineCustomer = () => {
    if (!newCust.name.trim()) return;
    const custId = genCustId();
    const custObj = {
      id: crypto.randomUUID(),
      customer_id: custId,
      name: newCust.name.trim(),
      company: newCust.company.trim() || null,
      phone: newCust.phone.trim() || null,
      email: newCust.email.trim() || null,
      source: newCust.source || 'referral',
      created_at: new Date().toISOString(),
    };
    addCustomer(custObj, profile?.name);
    nj('cid', custObj.id);
    setShowInlineCust(false);
    setNewCust({name:'',company:'',phone:'',email:'',source:'referral'});
    setToast(`Customer ${custId} berjaya ditambah.`);
  };

  const canSaveJob = newJob.depts.length > 0 && newJob.type.trim() && (
    newJob.depts.length === 1 ? !!newJob.pic : newJob.depts.every(d => newJob.picByDept[d])
  );

  const handleCreateSave = () => {
    if (!canSaveJob) return;
    const cid = newJob.cid;
    const isMulti = newJob.depts.length > 1;
    const projectId = isMulti ? genProjectId() : null;

    const createdIds = newJob.depts.map(dept => {
      const jobId = genJobId(dept);
      const jobObj = {
        id: crypto.randomUUID(),
        job_id: jobId,
        customer_id: cid || null,
        department: dept,
        project_id: projectId,
        job_type: newJob.type,
        job_type_category: newJob.jobType || 'client_project',
        bank: newJob.bank || null,
        status: newJob.status,
        estimation_value: null,
        line_items: [],
        final_value: null,
        pic: isMulti ? newJob.picByDept[dept] : newJob.pic,
        start_date: newJob.start || null,
        deadline: newJob.deadline || null,
        notes: newJob.notes || null,
        created_at: new Date().toISOString(),
        archived: false,
      };
      addJob(jobObj, profile?.name);
      return jobId;
    });

    setShowCreate(false);
    resetCreateForm();
    setToast({
      msg: isMulti
        ? `${createdIds.length} job dicipta dalam Project ${projectId} (${createdIds.join(', ')}).`
        : `Job ${createdIds[0]} berjaya dicipta.`,
      action: cid ? {
        label: '+ Tambah Department Lain',
        onClick: () => { setNewJob(p=>({...p, cid})); setShowCreate(true); setToast(null); },
      } : null,
    });
    if(typeof window!=='undefined') window.history.replaceState(null,'','/jobs');
  };

  const filtered = useMemo(() => {
    let list = jobs.filter(j => !j.archived);
    // Filter by visible departments
    if (visDepts) list = list.filter(j => visDepts.includes(j.department));
    if (fDept !== "all") list = list.filter(j => j.department === fDept);
    if (fStatus !== "all") list = list.filter(j => j.status === fStatus);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(j => (j.job_id||'').toLowerCase().includes(q) || (j.customer_name||'').toLowerCase().includes(q) || (j.job_type||'').toLowerCase().includes(q) || (j.pic||'').toLowerCase().includes(q) || (j.project_id||'').toLowerCase().includes(q)); }
    list.sort((a, b) => { let va, vb; switch (sortCol) { case "id": va=a.job_id||''; vb=b.job_id||''; break; case "customer": va=a.customer_name||""; vb=b.customer_name||""; break; case "dept": va=a.department||''; vb=b.department||''; break; case "status": va=a.status||''; vb=b.status||''; break; case "value": va=a.estimation_value||0; vb=b.estimation_value||0; break; case "deadline": va=a.deadline||"9999"; vb=b.deadline||"9999"; break; default: va=a.job_id||''; vb=b.job_id||''; } if (va<vb) return sortDir==="asc"?-1:1; if (va>vb) return sortDir==="asc"?1:-1; return 0; });
    return list;
  }, [jobs, fDept, fStatus, search, sortCol, sortDir, visDepts]);

  const toggleSort = c => { if (sortCol===c) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortCol(c); setSortDir("asc"); } };
  const sortInd = c => sortCol!==c ? <span className="sort-idle">⇅</span> : <span className="sort-active">{sortDir==="asc"?"↑":"↓"}</span>;

  const handleStatus = useCallback((job, s) => {
    if (s==="completed") { setCompleteJob(job); return; }
    updateJob(job.id, { status: s }, profile?.name, { action: 'status_change', from: job.status, to: s });
    setToast(`${job.job_id}: → ${STATUS[s].label}`);
  },[updateJob, profile]);

  const handleRollback = useCallback((job, s) => {
    setConfirm({
      title: "Rollback Status?",
      msg: `Adakah anda pasti mahu rollback ${job.job_id} dari ${STATUS[job.status]?.label} ke ${STATUS[s]?.label}?`,
      label: `← ${STATUS[s]?.label}`,
      color: "#F59E0B",
      showReasonField: true,
      onConfirm: (reasonText) => {
        updateJob(job.id, { status: s }, profile?.name, { action: 'rollback', from: job.status, to: s, reason: reasonText || undefined });
        setConfirm(null);
        setToast(`${job.job_id}: ← ${STATUS[s].label}`);
      }
    });
  }, [updateJob, profile]);

  const handleCancel = useCallback((job) => {
    setCancelJob(job);
  }, []);

  const handleAddNote = useCallback((jobId, text) => {
    addLog(jobId, { action: 'note', user: profile?.name || 'System', note: text });
  }, [addLog, profile]);

  const handleDocGenerated = useCallback((jobIds, label, docNumber) => {
    jobIds.forEach(jobId => {
      addLog(jobId, { action: 'document_generated', user: profile?.name || 'System', detail: `${label} (${docNumber})` });
    });
  }, [addLog, profile]);

  const handleJumpToJob = useCallback((jobId) => {
    const target = jobs.find(j => j.job_id === jobId);
    if (!target) return;
    setSearch('');
    setFDept('all');
    setFStatus('all');
    setExpandedId(target.id);
  }, [jobs]);

  const handleCancelConfirm = useCallback((reason, customText) => {
    if (!cancelJob) return;
    const reasonLabel = CANCEL_REASONS.find(r => r.value === reason)?.label || reason;
    const detail = reason === 'other' && customText ? customText : reasonLabel;
    updateJob(cancelJob.id, { status: 'cancelled', cancel_reason: reason, cancel_reason_text: reason === 'other' ? customText : '' }, profile?.name, { action: 'cancelled', detail });
    setCancelJob(null);
    setExpandedId(null);
    setToast(`${cancelJob.job_id} dibatalkan.`);
  }, [cancelJob, updateJob, profile]);

  const handleArchive = useCallback((job)=>{ setConfirm({ title:"Arkib Job?", msg:`${job.job_id} akan diarkibkan.`, label:"Arkib", color:"#6B7280", onConfirm:(reasonText)=>{ updateJob(job.id, { archived: true }, profile?.name, { action: 'edited', field: 'archived', old: 'false', val: 'true' }); setConfirm(null); setExpandedId(null); setToast(`${job.job_id} diarkibkan.`); } }); },[updateJob, profile]);

  const handleToggleInstallment = useCallback((job, installmentIndex) => {
    const updated = [...(job.installments || [])];
    updated[installmentIndex] = { ...updated[installmentIndex], status: updated[installmentIndex].status === 'paid' ? 'pending' : 'paid' };
    updateJob(job.id, { installments: updated }, profile?.name);
  }, [updateJob, profile]);

  const cols = [{ k:"id", l:"Job ID", w:"135px" },{ k:"customer", l:"Customer", w:"1fr" },{ k:"dept", l:"Dept", w:"75px" },{ k:null, l:"Nama Job", w:"1fr" },{ k:"status", l:"Status", w:"105px" },{ k:"value", l:"Est. Value", w:"105px" },{ k:null, l:"PIC", w:"85px" },{ k:"deadline", l:"Deadline", w:"135px" }];
  const grid = cols.map(c=>c.w).join(" ");

  return (
    <>
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
      `}</style>

      <div className="page">
        <div className="header"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}><div><div className="h-title">Job Monitor</div><div className="h-sub">{filtered.length} job ditunjukkan · Kretivco Job Management</div></div><button onClick={()=>setShowCreate(true)} style={{fontFamily:"'Poppins',sans-serif",fontSize:13,fontWeight:600,padding:"9px 20px",borderRadius:8,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>+</span> Job Baru</button></div></div>
        <div className="content">
          {/* Filters */}
          <div className="card filter-bar">
            <div className="search-wrap">
              <span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input className="field-input" style={{ paddingLeft: 36 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari job, customer, PIC..." />
            </div>
            {(!visDepts || visDepts.length > 1) ? (
              <select className="field-select" style={{ width: 160 }} value={fDept} onChange={e=>setFDept(e.target.value)}>
                <option value="all">Semua Department</option>
                {Object.entries(DEPT).filter(([k])=>!visDepts||visDepts.includes(k)).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            ) : visDepts?.length === 1 ? (
              <div style={{padding:'0 14px',height:40,display:'flex',alignItems:'center',fontSize:13,fontWeight:600,color:DEPT[visDepts[0]]?.color||'#1A1025',background:(DEPT[visDepts[0]]?.color||'#6B7280')+'12',borderRadius:8}}>{DEPT[visDepts[0]]?.label||visDepts[0]}</div>
            ) : null}
            <select className="field-select" style={{ width: 140 }} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
              <option value="all">Semua Status</option>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            {(fDept!=="all"||fStatus!=="all"||search) && <button className="btn-reset" onClick={()=>{setFDept("all");setFStatus("all");setSearch("")}}>Reset</button>}
          </div>

          {/* Table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="tbl-header" style={{ gridTemplateColumns: grid }}>
              {cols.map((c,i)=><div key={i} className="tbl-col" onClick={c.k?()=>toggleSort(c.k):undefined} style={{ cursor: c.k?"pointer":"default" }}>{c.l}{c.k && sortInd(c.k)}</div>)}
            </div>
            {filtered.length===0 ? <div className="empty">Tiada job dijumpai.</div> : filtered.map(job=>{
              const isExp = expandedId===job.id;
              const sibling = job.project_id ? jobs.find(j => j.project_id === job.project_id && j.id !== job.id) : null;
              return (
                <div key={job.id}>
                  <div className={`tbl-row ${isExp?"expanded":""}`} style={{ gridTemplateColumns: grid }} onClick={()=>setExpandedId(isExp?null:job.id)}>
                    <div className="tbl-cell">
                      <JID>{job.job_id}</JID>
                      {sibling && <span className="link-badge" title={`Sebahagian dari Project ${job.project_id} — bersama ${sibling.job_id}`} onClick={(e)=>{e.stopPropagation(); handleJumpToJob(sibling.job_id);}}>🔗</span>}
                    </div>
                    <div className="tbl-cell text-body">{job.customer_name}</div>
                    <div className="tbl-cell"><DTag d={job.department} /></div>
                    <div className="tbl-cell text-body text-secondary">{job.job_type}</div>
                    <div className="tbl-cell"><StatusBadge s={job.status} /></div>
                    <div className="tbl-cell text-body font-semibold">{formatRM(job.estimation_value)}</div>
                    <div className="tbl-cell text-body text-secondary">{job.pic}</div>
                    <div className="tbl-cell"><DLBadge deadline={job.deadline} status={job.status} /></div>
                  </div>
                  {isExp && <DetailPanel job={job} jobs={jobs} customers={customers} visDepts={visDepts} getActivity={getActivity} onStatus={handleStatus} onRollback={handleRollback} onCancel={handleCancel} onArchive={handleArchive} onToggleInstallment={handleToggleInstallment} onUpdateJob={updateJob} onAddNote={handleAddNote} onDocGenerated={handleDocGenerated} onJumpToJob={handleJumpToJob} userName={profile?.name} />}
                </div>
              );
            })}
          </div>
          <div className="summary-footer">
            <span>{filtered.length} job</span>
            <span>Pipeline: {formatRM(filtered.filter(j=>["active","in_progress"].includes(j.status)).reduce((s,j)=>s+(j.estimation_value||0),0))}</span>
          </div>
        </div>

        {showCreate && <Modal width={640} onClose={()=>{setShowCreate(false);resetCreateForm();}}>
          <div className="modal-header">
            <div>
              <div className="modal-title">Job Baru</div>
              <div className="text-sm text-muted" style={{marginTop:4}}>
                {newJob.depts.length===0 && <>Job ID: <span className="jid" style={{color:'#9B93A8'}}>—</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></>}
                {newJob.depts.length===1 && <>Job ID: <span className="jid" style={{color:'#1A1025'}}>{genJobId(newJob.depts[0])}</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></>}
                {newJob.depts.length>1 && <>Job ID: <span className="jid" style={{color:'#1A1025'}}>{newJob.depts.map(d=>genJobId(d)).join(' + ')}</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></>}
              </div>
            </div>
            <button className="modal-close" onClick={()=>{setShowCreate(false);resetCreateForm();}}>×</button>
          </div>
          <div className="modal-body" style={{padding:24,overflowY:'auto',maxHeight:'60vh'}}>
            {/* Customer dropdown + inline create */}
            <div style={{marginBottom:16}}>
              <label className="field-label">Customer</label>
              <select className="field-select" style={{width:'100%'}} value={newJob.cid} onChange={e=>nj('cid',e.target.value)}>
                <option value="">— Pilih Customer —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.customer_id || c.id} · {c.name}</option>)}
              </select>
              {!showInlineCust && (
                <button
                  onClick={() => setShowInlineCust(true)}
                  style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: '#E91E63', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0 0' }}
                >+ Customer Baru</button>
              )}
              {showInlineCust && (
                <div style={{ marginTop: 10, padding: 14, background: '#F9F8FB', borderRadius: 10, border: '1px solid #F0ECF4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="field-label" style={{ margin: 0, fontWeight: 600 }}>Customer Baru</span>
                    <button onClick={() => { setShowInlineCust(false); setNewCust({name:'',company:'',phone:'',email:'',source:'referral'}); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B93A8', fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label className="field-label">Nama *</label>
                    <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.name} onChange={e => setNewCust(p => ({...p, name: e.target.value}))} placeholder="Nama customer" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label className="field-label">Company</label>
                      <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.company} onChange={e => setNewCust(p => ({...p, company: e.target.value}))} placeholder="Nama syarikat" />
                    </div>
                    <div>
                      <label className="field-label">Phone</label>
                      <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.phone} onChange={e => setNewCust(p => ({...p, phone: e.target.value}))} placeholder="No. telefon" />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                    <div>
                      <label className="field-label">Email</label>
                      <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.email} onChange={e => setNewCust(p => ({...p, email: e.target.value}))} placeholder="Email" />
                    </div>
                    <div>
                      <label className="field-label">Source</label>
                      <select className="field-select" style={{ width: '100%', height: 36, fontSize: 12 }} value={newCust.source} onChange={e => setNewCust(p => ({...p, source: e.target.value}))}>
                        {SOURCE_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleSaveInlineCustomer}
                    style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 8, border: 'none', cursor: newCust.name.trim() ? 'pointer' : 'not-allowed', background: newCust.name.trim() ? '#E91E63' : '#E8E4ED', color: newCust.name.trim() ? '#fff' : '#9B93A8' }}
                  >Simpan Customer</button>
                </div>
              )}
            </div>

            {/* Department — multi-select: pick more than one when the same customer request spans departments */}
            <div style={{marginBottom:16}}>
              <label className="field-label">Department * <span style={{fontWeight:400,color:'#9B93A8'}}>— boleh pilih lebih dari satu</span></label>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {DEPT_LIST.map(d=>{
                  const on = newJob.depts.includes(d.key);
                  return (
                    <button key={d.key} type="button" onClick={()=>toggleDept(d.key)} style={{fontFamily:"'Poppins',sans-serif",fontSize:12,fontWeight:600,padding:"8px 14px",borderRadius:8,cursor:"pointer",border:on?`1.5px solid ${d.color}`:"1.5px solid #E8E4ED",background:on?d.color+"12":"#fff",color:on?d.color:"#6B6080",display:"flex",alignItems:"center",gap:7}}>
                      <span style={{width:14,height:14,borderRadius:4,border:on?'none':'1.5px solid #B0A8BC',background:on?d.color:'transparent',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,color:'#fff'}}>{on?'✓':''}</span>
                      {d.label}
                    </button>
                  );
                })}
              </div>
              {newJob.depts.length>1 && (
                <div style={{marginTop:10,padding:'9px 12px',borderRadius:8,background:'rgba(233,30,99,.08)',border:'1px dashed #E91E63',fontSize:11.5,color:'#1A1025',lineHeight:1.5}}>
                  {newJob.depts.length} department dipilih — satu <strong>Project ID</strong> akan dijana untuk kumpulkan job-job ni. Setiap department tetap dapat Job ID &amp; status sendiri.
                </div>
              )}
            </div>

            {/* Job Type & Bank */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
              <div><label className="field-label">Job Type *</label><div style={{display:'flex',gap:0}}>{Object.entries(JOB_TYPE).map(([k,v])=><button key={k} style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,padding:"8px 14px",cursor:"pointer",border:`1px solid ${newJob.jobType===k?v.color:'#E8E4ED'}`,borderRadius:k==='client_project'?'8px 0 0 8px':'0 8px 8px 0',background:newJob.jobType===k?v.color+'15':'#fff',color:newJob.jobType===k?v.color:'#6B6080'}} onClick={()=>nj('jobType',k)}>{v.label}</button>)}</div></div>
              <div><label className="field-label">Bank</label><div style={{display:'flex',gap:0}}>{Object.entries(BANK).map(([k,v],i,arr)=><button key={k} style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,padding:"8px 14px",cursor:"pointer",border:`1px solid ${newJob.bank===k?v.color:'#E8E4ED'}`,borderRadius:i===0?'8px 0 0 8px':'0 8px 8px 0',background:newJob.bank===k?v.color+'15':'#fff',color:newJob.bank===k?v.color:'#6B6080'}} onClick={()=>nj('bank',k)}>{v.label}</button>)}</div></div>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
              <div><label className="field-label">Nama Job *</label><input className="field-input" value={newJob.type} onChange={e=>nj('type',e.target.value)} placeholder="cth: Design & Print Roti Bakar" /></div>
              <div><label className="field-label">Status</label><select className="field-select" style={{width:'100%'}} value={newJob.status} onChange={e=>nj('status',e.target.value)}><option value="potential">Potential</option><option value="active">Active</option><option value="in_progress">In Progress</option></select></div>
            </div>
            {newJob.depts.length <= 1 ? (
              <div style={{marginBottom:16}}>
                <label className="field-label">PIC *</label>
                <select className="field-select" style={{width:'100%'}} value={newJob.pic} onChange={e=>nj('pic',e.target.value)}><option value="">— Pilih —</option>{(newJob.depts[0] && PIC_BY_DEPT[newJob.depts[0]] ? PIC_BY_DEPT[newJob.depts[0]] : PIC_OPTIONS).map(p=><option key={p} value={p}>{p}</option>)}</select>
              </div>
            ) : (
              <div style={{marginBottom:16}}>
                <label className="field-label">PIC setiap department *</label>
                <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  {newJob.depts.map(d=>{
                    const meta = DEPT[d];
                    return (
                      <div key={d} style={{display:'grid',gridTemplateColumns:'110px 1fr',gap:10,alignItems:'center'}}>
                        <span style={{fontSize:10.5,fontWeight:700,padding:'4px 9px',borderRadius:6,textAlign:'center',color:meta.color,background:meta.color+'15'}}>{meta.code}</span>
                        <select className="field-select" style={{width:'100%'}} value={newJob.picByDept[d]||''} onChange={e=>setPicForDept(d,e.target.value)}>
                          <option value="">— Pilih PIC {meta.label} —</option>
                          {(PIC_BY_DEPT[d]||PIC_OPTIONS).map(p=><option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}><div><label className="field-label">Tarikh Mula</label><input type="date" className="field-input" value={newJob.start} onChange={e=>nj('start',e.target.value)} /></div><div><label className="field-label">Deadline</label><input type="date" className="field-input" value={newJob.deadline} onChange={e=>nj('deadline',e.target.value)} /></div></div>
            <div style={{marginBottom:16}}><label className="field-label">Nota</label><textarea style={{fontFamily:"'Poppins',sans-serif",fontSize:13,border:"1px solid #E8E4ED",borderRadius:8,padding:"10px 12px",width:"100%",minHeight:72,resize:"vertical",outline:"none",boxSizing:"border-box"}} value={newJob.notes} onChange={e=>nj('notes',e.target.value)} placeholder="Maklumat tambahan..." /></div>
          </div>
          <div className="modal-footer" style={{padding:"16px 24px",borderTop:"1px solid #F0ECF4",display:"flex",justifyContent:"flex-end",gap:8}}><button className="btn-secondary" onClick={()=>{setShowCreate(false);resetCreateForm();}}>Batal</button><button className="btn-primary" style={{background:canSaveJob?"#E91E63":"#E8E4ED",color:canSaveJob?"#fff":"#9B93A8",cursor:canSaveJob?"pointer":"not-allowed"}} onClick={handleCreateSave}>Simpan Job</button></div>
        </Modal>}
        {completeJob && <CompleteModal job={completeJob} onConfirm={fv=>{updateJob(completeJob.id, { status:"completed", final_value:fv }, profile?.name, { action: 'completed', detail: `Final value: ${formatRM(fv)}` });setCompleteJob(null);setExpandedId(null);setToast(`${completeJob.job_id} selesai. Final: ${formatRM(fv)}`);}} onClose={()=>setCompleteJob(null)} />}
        {cancelJob && <CancelModal job={cancelJob} onConfirm={handleCancelConfirm} onClose={()=>setCancelJob(null)} />}
        {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
        {toast && <Toast msg={typeof toast==='string'?toast:toast.msg} action={typeof toast==='object'?toast.action:null} onDone={()=>setToast(null)} />}
      </div>
    </>
  );
}
