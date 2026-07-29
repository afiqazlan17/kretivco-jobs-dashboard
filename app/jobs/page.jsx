"use client"
import { useState, useMemo, useCallback, useEffect } from "react";
import { useAuth, useData } from '@/lib/hooks';
import { DEPT, STATUS, STATUS_FLOW, SOURCE, PIC_OPTIONS, formatRM, formatDate, formatDateTime, daysUntil } from '@/lib/constants';

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

function Toast({ msg, onDone }) {
  useState(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); });
  return <div className="toast">✓ {msg}</div>;
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

function ConfirmModal({ title, msg, label, color, onConfirm, onClose }) {
  return (
    <Modal width={400} onClose={onClose}>
      <div style={{ padding: "24px 24px 16px" }}><div className="modal-title">{title}</div><p className="text-body text-secondary" style={{ marginTop: 8, lineHeight: 1.6 }}>{msg}</p></div>
      <div className="modal-footer"><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" style={{ background: color }} onClick={onConfirm}>{label}</button></div>
    </Modal>
  );
}

// ─── Activity Timeline ────────────────────────────────────────
function Timeline({ jobId, getActivity }) {
  const logs = getActivity(jobId);
  if (!logs.length) return <div className="text-sm text-muted" style={{ padding: "12px 0" }}>Tiada activity log.</div>;
  return (
    <div className="timeline">
      <div className="timeline-line" />
      {logs.map((l, i) => (
        <div key={i} className="timeline-entry">
          <div className="timeline-dot" style={{ background: l.action === "created" ? "#E91E63" : l.action === "completed" ? "#10B981" : "#E8E4ED" }} />
          <div className="text-body">
            <strong>{l.user}</strong>{" "}
            {l.action === "created" ? "cipta job ini" : l.action === "status_change" ? <>tukar status: <StatusBadge s={l.old?.toLowerCase()} /> → <StatusBadge s={l.val?.toLowerCase()} /></> : l.action === "edited" ? <>update {l.field}: {l.old} → <strong>{l.val}</strong></> : l.action}
          </div>
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
function DetailPanel({ job, customers, getActivity, onStatus, onArchive, onToggleInstallment }) {
  const next = STATUS_FLOW[job.status] || [];
  return (
    <div className="detail-panel">
      <div className="detail-grid">
        <div>
          <div className="card-title mb-4">Maklumat Job</div>
          <div className="info-grid">
            <span className="info-label">Job ID</span><JID>{job.job_id}</JID>
            <span className="info-label">Department</span><span><DTag d={job.department} /> <span className="text-secondary ml-1">{DEPT[job.department]?.label}</span></span>
            <span className="info-label">Jenis</span><span>{job.job_type}</span>
            <span className="info-label">Status</span><StatusBadge s={job.status} />
            <span className="info-label">PIC</span><span>{job.pic}</span>
            <span className="info-label">Est. Value</span><span className="font-semibold">{formatRM(job.estimation_value)}</span>
            {job.final_value && <><span className="info-label">Final Value</span><span className="font-semibold text-green">{formatRM(job.final_value)}</span></>}
            <span className="info-label">Mula</span><span>{formatDate(job.start_date)}</span>
            <span className="info-label">Deadline</span><DLBadge deadline={job.deadline} status={job.status} />
          </div>
          {job.notes && <div className="notes-box"><div className="section-label">Nota</div><div className="text-body">{job.notes}</div></div>}

          {/* Financial Breakdown */}
          <div style={{ marginTop: 16 }}>
            <FinancialBreakdown job={job} onToggleInstallment={onToggleInstallment} />
          </div>

          {next.length > 0 && (
            <div className="action-row">
              {next.map(s => <button key={s} className="btn-status" style={{ color: STATUS[s].color, background: STATUS[s].color + "15" }} onClick={() => onStatus(job, s)}>→ {STATUS[s].label}</button>)}
              {!job.archived && job.status !== "cancelled" && <button className="btn-archive" onClick={() => onArchive(job)}>Arkib</button>}
            </div>
          )}
        </div>
        <div>
          <div className="card-title mb-3">Customer</div>
          <CustMini job={job} customers={customers} />
          <div className="card-title mt-6 mb-3">Activity Log</div>
          <Timeline jobId={job.job_id} getActivity={getActivity} />
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

  // Shared data store
  const { jobs, customers, addJob, updateJob, getActivity, genJobId } = useData();

  const DEPT_LIST = Object.entries(DEPT).map(([k,v])=>({key:k,...v}));

  const [expandedId, setExpandedId] = useState(null);
  const [fDept, setFDept] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("deadline");
  const [sortDir, setSortDir] = useState("asc");
  const [completeJob, setCompleteJob] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({dept:'',cid:'',type:'',status:'potential',est:'',pic:'',start:'',deadline:'',notes:''});

  // Special arrangement state for create modal
  const [specialArr, setSpecialArr] = useState(false);
  const [costBreakdown, setCostBreakdown] = useState([]);
  const [hasInstallment, setHasInstallment] = useState(false);
  const [installments, setInstallments] = useState([]);

  // Auto-open from sidebar or URL param
  useEffect(()=>{
    const checkAndOpen = () => {
      const params = new URLSearchParams(window.location.search);
      if(params.get('new') === '1') {
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

  const resetCreateForm = () => {
    setNewJob({dept:'',cid:'',type:'',status:'potential',est:'',pic:'',start:'',deadline:'',notes:''});
    setSpecialArr(false);
    setCostBreakdown([]);
    setHasInstallment(false);
    setInstallments([]);
  };

  const handleCreateSave = () => {
    if(!newJob.dept||!newJob.type.trim()||!newJob.pic) return;
    const jobId = genJobId(newJob.dept);
    const breakdownTotal = costBreakdown.reduce((s, item) => s + (Number(item.amount) || 0), 0);
    const estNum = newJob.est ? Number(newJob.est) : 0;

    const jobObj = {
      id: Date.now().toString(),
      job_id: jobId,
      customer_id: newJob.cid || '',
      department: newJob.dept,
      job_type: newJob.type,
      status: newJob.status,
      estimation_value: newJob.est ? Number(newJob.est) : null,
      final_value: null,
      pic: newJob.pic,
      start_date: newJob.start || null,
      deadline: newJob.deadline || null,
      notes: newJob.notes || null,
      created_at: new Date().toISOString(),
      archived: false,
      special_arrangement: specialArr,
      cost_breakdown: specialArr ? costBreakdown.map(item => ({ type: item.type, recipient: item.recipient, amount: Number(item.amount) || 0 })) : [],
      installments: specialArr && hasInstallment ? installments.map(inst => ({ amount: Number(inst.amount) || 0, due_date: inst.due_date, status: 'pending' })) : [],
      baki_kretivco: specialArr ? estNum - breakdownTotal : estNum,
    };

    addJob(jobObj);
    setShowCreate(false);
    resetCreateForm();
    setToast(`Job ${jobId} berjaya dicipta.`);
    if(typeof window!=='undefined') window.history.replaceState(null,'','/jobs');
  };

  const filtered = useMemo(() => {
    let list = jobs.filter(j => !j.archived);
    // Non-BOD: force filter to user's department
    if (!isBod && userDept) list = list.filter(j => j.department === userDept);
    else if (fDept !== "all") list = list.filter(j => j.department === fDept);
    if (fStatus !== "all") list = list.filter(j => j.status === fStatus);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(j => (j.job_id||'').toLowerCase().includes(q) || (j.customer_name||'').toLowerCase().includes(q) || (j.job_type||'').toLowerCase().includes(q) || (j.pic||'').toLowerCase().includes(q)); }
    list.sort((a, b) => { let va, vb; switch (sortCol) { case "id": va=a.job_id||''; vb=b.job_id||''; break; case "customer": va=a.customer_name||""; vb=b.customer_name||""; break; case "dept": va=a.department||''; vb=b.department||''; break; case "status": va=a.status||''; vb=b.status||''; break; case "value": va=a.estimation_value||0; vb=b.estimation_value||0; break; case "deadline": va=a.deadline||"9999"; vb=b.deadline||"9999"; break; default: va=a.job_id||''; vb=b.job_id||''; } if (va<vb) return sortDir==="asc"?-1:1; if (va>vb) return sortDir==="asc"?1:-1; return 0; });
    return list;
  }, [jobs, fDept, fStatus, search, sortCol, sortDir, isBod, userDept]);

  const toggleSort = c => { if (sortCol===c) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortCol(c); setSortDir("asc"); } };
  const sortInd = c => sortCol!==c ? <span className="sort-idle">⇅</span> : <span className="sort-active">{sortDir==="asc"?"↑":"↓"}</span>;

  const handleStatus = useCallback((job, s) => {
    if (s==="completed") { setCompleteJob(job); return; }
    if (s==="cancelled") { setConfirm({ title:"Batalkan Job?", msg:`Adakah anda pasti mahu batalkan ${job.job_id}?`, label:"Ya, Batalkan", color:"#EF4444", onConfirm:()=>{ updateJob(job.id, { status: "cancelled" }); setConfirm(null); setExpandedId(null); setToast(`${job.job_id} dibatalkan.`); } }); return; }
    updateJob(job.id, { status: s });
    setToast(`${job.job_id}: → ${STATUS[s].label}`);
  },[updateJob]);

  const handleArchive = useCallback((job)=>{ setConfirm({ title:"Arkib Job?", msg:`${job.job_id} akan diarkibkan.`, label:"Arkib", color:"#6B7280", onConfirm:()=>{ updateJob(job.id, { archived: true }); setConfirm(null); setExpandedId(null); setToast(`${job.job_id} diarkibkan.`); } }); },[updateJob]);

  const handleToggleInstallment = useCallback((job, installmentIndex) => {
    const updated = [...(job.installments || [])];
    updated[installmentIndex] = { ...updated[installmentIndex], status: updated[installmentIndex].status === 'paid' ? 'pending' : 'paid' };
    updateJob(job.id, { installments: updated });
  }, [updateJob]);

  const cols = [{ k:"id", l:"Job ID", w:"105px" },{ k:"customer", l:"Customer", w:"1fr" },{ k:"dept", l:"Dept", w:"75px" },{ k:null, l:"Jenis", w:"1fr" },{ k:"status", l:"Status", w:"105px" },{ k:"value", l:"Est. Value", w:"105px" },{ k:null, l:"PIC", w:"85px" },{ k:"deadline", l:"Deadline", w:"135px" }];
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
            {isBod ? (
              <select className="field-select" style={{ width: 160 }} value={fDept} onChange={e=>setFDept(e.target.value)}>
                <option value="all">Semua Department</option>
                {Object.entries(DEPT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            ) : (
              <div style={{padding:'0 14px',height:40,display:'flex',alignItems:'center',fontSize:13,fontWeight:600,color:DEPT[userDept]?.color||'#1A1025',background:(DEPT[userDept]?.color||'#6B7280')+'12',borderRadius:8}}>{DEPT[userDept]?.label||userDept}</div>
            )}
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
              return (
                <div key={job.id}>
                  <div className={`tbl-row ${isExp?"expanded":""}`} style={{ gridTemplateColumns: grid }} onClick={()=>setExpandedId(isExp?null:job.id)}>
                    <div className="tbl-cell"><JID>{job.job_id}</JID></div>
                    <div className="tbl-cell text-body">{job.customer_name}</div>
                    <div className="tbl-cell"><DTag d={job.department} /></div>
                    <div className="tbl-cell text-body text-secondary">{job.job_type}</div>
                    <div className="tbl-cell"><StatusBadge s={job.status} /></div>
                    <div className="tbl-cell text-body font-semibold">{formatRM(job.estimation_value)}</div>
                    <div className="tbl-cell text-body text-secondary">{job.pic}</div>
                    <div className="tbl-cell"><DLBadge deadline={job.deadline} status={job.status} /></div>
                  </div>
                  {isExp && <DetailPanel job={job} customers={customers} getActivity={getActivity} onStatus={handleStatus} onArchive={handleArchive} onToggleInstallment={handleToggleInstallment} />}
                </div>
              );
            })}
          </div>
          <div className="summary-footer">
            <span>{filtered.length} job</span>
            <span>Pipeline: {formatRM(filtered.filter(j=>["active","ongoing"].includes(j.status)).reduce((s,j)=>s+(j.estimation_value||0),0))}</span>
          </div>
        </div>

        {showCreate && <Modal width={640} onClose={()=>{setShowCreate(false);resetCreateForm();}}>
          <div className="modal-header"><div><div className="modal-title">Job Baru</div><div className="text-sm text-muted" style={{marginTop:4}}>Job ID: <span className="jid" style={{color:newJob.dept?'#1A1025':'#9B93A8'}}>{newJob.dept?genJobId(newJob.dept):'—'}</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></div></div><button className="modal-close" onClick={()=>{setShowCreate(false);resetCreateForm();}}>×</button></div>
          <div className="modal-body" style={{padding:24,overflowY:'auto',maxHeight:'60vh'}}>
            <div style={{marginBottom:16}}><label className="field-label">Department *</label><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{DEPT_LIST.map(d=><button key={d.key} style={{fontFamily:"'Poppins',sans-serif",fontSize:12,fontWeight:600,padding:"8px 16px",borderRadius:8,cursor:"pointer",border:newJob.dept===d.key?`2px solid ${d.color}`:"1px solid #E8E4ED",background:newJob.dept===d.key?d.color+"12":"#fff",color:newJob.dept===d.key?d.color:"#6B6080"}} onClick={()=>nj('dept',d.key)}>{d.label}</button>)}</div></div>
            <div style={{marginBottom:16}}><label className="field-label">Customer</label><select className="field-select" style={{width:'100%'}} value={newJob.cid} onChange={e=>nj('cid',e.target.value)}><option value="">— Pilih Customer —</option>{customers.map(c=><option key={c.id} value={c.id}>{c.customer_id || c.id} · {c.name}</option>)}</select></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}><div><label className="field-label">Jenis Job *</label><input className="field-input" value={newJob.type} onChange={e=>nj('type',e.target.value)} placeholder="cth: Banner, Website" /></div><div><label className="field-label">Status</label><select className="field-select" style={{width:'100%'}} value={newJob.status} onChange={e=>nj('status',e.target.value)}><option value="potential">Potential</option><option value="active">Active</option></select></div></div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}><div><label className="field-label">Anggaran (RM)</label><input type="number" className="field-input" value={newJob.est} onChange={e=>nj('est',e.target.value)} placeholder="0" /></div><div><label className="field-label">PIC *</label><select className="field-select" style={{width:'100%'}} value={newJob.pic} onChange={e=>nj('pic',e.target.value)}><option value="">— Pilih —</option>{PIC_OPTIONS.map(p=><option key={p} value={p}>{p}</option>)}</select></div></div>

            {/* Special Arrangement Section */}
            <SpecialArrangementSection
              specialArr={specialArr} setSpecialArr={setSpecialArr}
              costBreakdown={costBreakdown} setCostBreakdown={setCostBreakdown}
              hasInstallment={hasInstallment} setHasInstallment={setHasInstallment}
              installments={installments} setInstallments={setInstallments}
              estValue={newJob.est}
            />

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}><div><label className="field-label">Tarikh Mula</label><input type="date" className="field-input" value={newJob.start} onChange={e=>nj('start',e.target.value)} /></div><div><label className="field-label">Deadline</label><input type="date" className="field-input" value={newJob.deadline} onChange={e=>nj('deadline',e.target.value)} /></div></div>
            <div style={{marginBottom:16}}><label className="field-label">Nota</label><textarea style={{fontFamily:"'Poppins',sans-serif",fontSize:13,border:"1px solid #E8E4ED",borderRadius:8,padding:"10px 12px",width:"100%",minHeight:72,resize:"vertical",outline:"none",boxSizing:"border-box"}} value={newJob.notes} onChange={e=>nj('notes',e.target.value)} placeholder="Maklumat tambahan..." /></textarea></div>
          </div>
          <div className="modal-footer" style={{padding:"16px 24px",borderTop:"1px solid #F0ECF4",display:"flex",justifyContent:"flex-end",gap:8}}><button className="btn-secondary" onClick={()=>{setShowCreate(false);resetCreateForm();}}>Batal</button><button className="btn-primary" style={{background:newJob.dept&&newJob.type.trim()&&newJob.pic?"#E91E63":"#E8E4ED",color:newJob.dept&&newJob.type.trim()&&newJob.pic?"#fff":"#9B93A8",cursor:newJob.dept&&newJob.type.trim()&&newJob.pic?"pointer":"not-allowed"}} onClick={handleCreateSave}>Simpan Job</button></div>
        </Modal>}
        {completeJob && <CompleteModal job={completeJob} onConfirm={fv=>{updateJob(completeJob.id, { status:"completed", final_value:fv });setCompleteJob(null);setExpandedId(null);setToast(`${completeJob.job_id} selesai. Final: ${formatRM(fv)}`);}} onClose={()=>setCompleteJob(null)} />}
        {confirm && <ConfirmModal {...confirm} onClose={()=>setConfirm(null)} />}
        {toast && <Toast msg={toast} onDone={()=>setToast(null)} />}
      </div>
    </>
  );
}
