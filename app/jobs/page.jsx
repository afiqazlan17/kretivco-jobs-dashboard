"use client"
import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { DEPT, STATUS, HOLD_STATUS, CANCEL_REASONS, SOURCE_OPTIONS, PIC_OPTIONS, PIC_BY_DEPT, JOB_TYPE, BANK, customerDisplayName, formatRM, formatDateTime, productLinesFor, segmentsFor, packageTierOptions, findPackageTier, packageItemsFor } from '@/lib/constants';
import { StatusBadge, DTag, JID, DLBadge, Modal, Toast, GlobalJobStyles } from './_shared';

// The active view comes from ?view= — isolated behind its own Suspense
// boundary (see AppShell's FinanceSubmenu/JobSubmenu for the same pattern)
// so only the jobs route needs to opt into dynamic rendering.
const VIEW_META = {
  queue: { title: 'Job Queue', sub: 'All jobs, sorted by most recently changed' },
  aging: { title: 'Aging Job', sub: 'Jobs untouched for the longest' },
  mine: { title: 'My Jobs', sub: 'Jobs under your responsibility' },
};

export default function JobMonitor() {
  return (
    <Suspense fallback={null}>
      <JobMonitorContent />
    </Suspense>
  );
}

// ─── Main ─────────────────────────────────────────────────────
function JobMonitorContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = VIEW_META[searchParams.get('view')] ? searchParams.get('view') : 'queue';
  // Auth - role based filtering
  const { profile } = useAuth() || {};
  const isBod = profile?.role === 'bod';
  const userDept = profile?.department || null;
  const visDepts = useVisibleDepts();

  // Shared data store
  const { jobs, customers, addJob, updateCustomer, genJobId, genCustId, genProjectId, addCustomer, getActivity } = useData();

  const DEPT_LIST = Object.entries(DEPT).map(([k,v])=>({key:k,...v}));

  const [fDept, setFDept] = useState("all");
  const [fStatus, setFStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState("touched");
  const [sortDir, setSortDir] = useState("desc");

  // Each view has its own natural default sort (queue = most recently
  // touched first, aging = least recently touched first) — re-applied
  // whenever the sidebar switches views, but a manual header-click still
  // overrides it until the next view switch.
  useEffect(() => {
    if (view === 'aging') { setSortCol('touched'); setSortDir('asc'); }
    else { setSortCol('touched'); setSortDir('desc'); }
  }, [view]);
  const [toast, setToast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const emptyDeptFields = () => ({ type:'', jobType:'client_project', bank:'', pic:'', start:'', deadline:'', notes:'', productLine:'', segment:'', pkg:'' });
  const [newJob, setNewJob] = useState({depts:[],cid:'',perDept:{}});
  const [createAttempted, setCreateAttempted] = useState(false);

  // Inline customer creation state
  const [showInlineCust, setShowInlineCust] = useState(false);
  const [newCust, setNewCust] = useState({name:'',company:'',phone:'',email:'',source:'referral'});

  // Auto-open create form from sidebar or URL param
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    if(params.get('new') === '1') {
      const cid = params.get('cid');
      if (cid) setNewJob(p=>({...p, cid}));
      setShowCreate(true);
      window.history.replaceState(null,'','/jobs');
    }
    const handler = ()=> setShowCreate(true);
    window.addEventListener('open-create-job', handler);
    return ()=> window.removeEventListener('open-create-job', handler);
  }, []);

  const nj = (k,v) => setNewJob(p=>({...p,[k]:v}));
  const toggleDept = (key) => setNewJob(p => {
    const has = p.depts.includes(key);
    const depts = has ? p.depts.filter(d=>d!==key) : [...p.depts, key];
    const perDept = { ...p.perDept };
    if (has) delete perDept[key]; else perDept[key] = emptyDeptFields();
    return { ...p, depts, perDept };
  });
  const setDeptField = (dept, key, val) => setNewJob(p => ({ ...p, perDept: { ...p.perDept, [dept]: { ...p.perDept[dept], [key]: val } } }));

  // Deadline defaults to 3 working days after Start Date (skips Sat/Sun) —
  // staff can still override it manually afterward.
  const addWorkingDays = (dateStr, days) => {
    const d = new Date(dateStr + 'T00:00:00');
    let added = 0;
    while (added < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) added++;
    }
    return d.toISOString().slice(0, 10);
  };

  const resetCreateForm = () => {
    setNewJob({depts:[],cid:'',perDept:{}});
    setShowInlineCust(false);
    setNewCust({name:'',company:'',phone:'',email:'',source:'referral'});
    setCreateAttempted(false);
  };
  const isCreateFormDirty = () =>
    JSON.stringify(newJob) !== JSON.stringify({depts:[],cid:'',perDept:{}}) ||
    showInlineCust ||
    JSON.stringify(newCust) !== JSON.stringify({name:'',company:'',phone:'',email:'',source:'referral'});
  const closeCreate = () => {
    if (isCreateFormDirty() && !window.confirm('Unsaved changes will be lost. Close this form?')) return;
    setShowCreate(false);
    resetCreateForm();
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
    setToast(`Customer ${custId} added successfully.`);
  };

  // Each selected department gets its own full set of job fields — a print
  // job and a tech job created together can have completely different job
  // types, names, PICs, and deadlines. Only Customer is shared across them.
  // PIC is deliberately optional — a job sits unclaimed in its department's
  // queue until a staff member picks it up ("Take In Job"), rather than the
  // creator having to assign someone up front.
  const canSaveJob = !!newJob.cid && newJob.depts.length > 0 && newJob.depts.every(d => {
    const f = newJob.perDept[d] || {};
    return !!f.type?.trim() && !!f.jobType && !!f.bank && !!f.start && !!f.deadline;
  });

  // Field-level validation for inline error display (fix: all fields mandatory except Notes)
  const fieldErr = (name) => {
    if (!createAttempted) return false;
    switch (name) {
      case 'cid': return !newJob.cid;
      case 'depts': return newJob.depts.length === 0;
      default: return false;
    }
  };
  const deptFieldErr = (dept, name) => {
    if (!createAttempted) return false;
    const f = newJob.perDept[dept] || {};
    switch (name) {
      case 'jobType': return !f.jobType;
      case 'bank': return !f.bank;
      case 'type': return !f.type?.trim();
      case 'start': return !f.start;
      case 'deadline': return !f.deadline;
      default: return false;
    }
  };

  const handleCreateSave = () => {
    setCreateAttempted(true);
    if (!canSaveJob) return;
    const cid = newJob.cid;
    const isMulti = newJob.depts.length > 1;
    const projectId = isMulti ? genProjectId() : null;

    const createdIds = newJob.depts.map(dept => {
      const f = newJob.perDept[dept];
      const jobId = genJobId(dept);
      // Package pre-fills the job's line_items with the bundle's contents,
      // priced as one line at the tier price — staff don't retype items
      // that came straight off a fixed price sheet. Only Product Sale jobs
      // can carry a package; Client Project is always custom work.
      const tier = f.jobType === 'product_sale' ? findPackageTier(dept, f.productLine, f.segment, f.pkg) : null;
      const jobObj = {
        id: crypto.randomUUID(),
        job_id: jobId,
        customer_id: cid || null,
        department: dept,
        project_id: projectId,
        job_type: f.type,
        job_type_category: f.jobType || 'client_project',
        bank: f.bank || null,
        status: 'potential', // Fix: new jobs always start as Potential — not user-selectable at creation
        estimation_value: tier ? tier.tier.price : null,
        line_items: tier ? [{ id: crypto.randomUUID(), item: `${tier.pkg.label} (${tier.tier.pcs}pcs)`, desc: packageItemsFor(tier.pkg, tier.tier).join('\n'), size: '', qty: 1, price: tier.tier.price, noSize: true }] : [],
        final_value: null,
        pic: f.pic,
        start_date: f.start || null,
        deadline: f.deadline || null,
        notes: f.notes || null,
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
        ? `${createdIds.length} jobs created under Project ${projectId} (${createdIds.join(', ')}).`
        : `Job ${createdIds[0]} created successfully.`,
      action: cid ? {
        label: '+ Add Another Department',
        onClick: () => { setNewJob(p=>({...p, cid})); setShowCreate(true); setToast(null); },
      } : null,
    });
    if(typeof window!=='undefined') window.history.replaceState(null,'','/jobs');
  };

  // "Last touched" = the most recent of the job's own timestamps and every
  // activity-log entry against it (notes/comments included — addLog() never
  // bumps job.updated_at, so that field alone would miss them). Recomputed
  // every render rather than memoized since it reads the activity-log store
  // through a plain function, not a stable dependency.
  const lastTouched = {};
  jobs.forEach(j => {
    let max = j.created_at || '';
    if (j.updated_at && j.updated_at > max) max = j.updated_at;
    getActivity(j.job_id).forEach(l => { if (l.time && l.time > max) max = l.time; });
    lastTouched[j.job_id] = max;
  });

  const filtered = useMemo(() => {
    let list = jobs.filter(j => !j.archived);
    // Filter by visible departments
    if (visDepts) list = list.filter(j => visDepts.includes(j.department));
    // View-based slice (from the sidebar's Job submenu)
    if (view === 'mine') list = list.filter(j => j.pic === profile?.name);
    else if (view === 'aging') list = list.filter(j => !['completed','cancelled'].includes(j.status));
    if (fDept !== "all") list = list.filter(j => j.department === fDept);
    // Pending/Suspended are a separate hold flag, not a pipeline status —
    // filtering on them checks job.hold_status instead of job.status.
    if (fStatus === 'pending' || fStatus === 'suspended') list = list.filter(j => j.hold_status === fStatus);
    else if (fStatus !== "all") list = list.filter(j => j.status === fStatus);
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(j => (j.job_id||'').toLowerCase().includes(q) || (j.customer_name||'').toLowerCase().includes(q) || (j.job_type||'').toLowerCase().includes(q) || (j.pic||'').toLowerCase().includes(q) || (j.project_id||'').toLowerCase().includes(q)); }
    list.sort((a, b) => { let va, vb; switch (sortCol) { case "id": va=a.job_id||''; vb=b.job_id||''; break; case "customer": va=a.customer_name||""; vb=b.customer_name||""; break; case "dept": va=a.department||''; vb=b.department||''; break; case "status": va=a.status||''; vb=b.status||''; break; case "value": va=a.estimation_value||0; vb=b.estimation_value||0; break; case "deadline": va=a.deadline||"9999"; vb=b.deadline||"9999"; break; case "touched": va=lastTouched[a.job_id]||''; vb=lastTouched[b.job_id]||''; break; default: va=a.job_id||''; vb=b.job_id||''; } if (va<vb) return sortDir==="asc"?-1:1; if (va>vb) return sortDir==="asc"?1:-1; return 0; });
    return list;
  }, [jobs, fDept, fStatus, search, sortCol, sortDir, visDepts, view, profile, getActivity]);

  const toggleSort = c => { if (sortCol===c) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortCol(c); setSortDir("asc"); } };
  const sortInd = c => sortCol!==c ? <span className="sort-idle">⇅</span> : <span className="sort-active">{sortDir==="asc"?"↑":"↓"}</span>;

  // Job-level actions (status, rollback, cancel, archive, notes, documents)
  // now live entirely on the job's own detail page — this list just
  // navigates there.
  const handleJumpToJob = useCallback((jobId) => {
    router.push(`/jobs/${jobId}`);
  }, [router]);

  const cols = [{ k:"id", l:"Job ID", w:"135px" },{ k:"customer", l:"Customer", w:"1fr" },{ k:"dept", l:"Dept", w:"75px" },{ k:null, l:"Job Name", w:"1fr" },{ k:"status", l:"Status", w:"105px" },{ k:"value", l:"Est. Value", w:"105px" },{ k:null, l:"PIC", w:"85px" },{ k:"deadline", l:"Deadline", w:"135px" },{ k:"touched", l:"Last Changed", w:"150px" }];
  const grid = cols.map(c=>c.w).join(" ");

  return (
    <>
      <GlobalJobStyles />

      <div className="page">
        <div className="header"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:12}}><div><div className="h-title">{VIEW_META[view].title}</div><div className="h-sub">{filtered.length} jobs shown · {VIEW_META[view].sub}</div></div><button onClick={()=>setShowCreate(true)} style={{fontFamily:"'Poppins',sans-serif",fontSize:13,fontWeight:600,padding:"9px 20px",borderRadius:8,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>+</span> New Job</button></div></div>
        <div className="content">
          {/* Filters */}
          <div className="card filter-bar">
            <div className="search-wrap">
              <span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
              <input className="field-input" style={{ paddingLeft: 36 }} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search job, customer, PIC..." />
            </div>
            {(!visDepts || visDepts.length > 1) ? (
              <select className="field-select" style={{ width: 160 }} value={fDept} onChange={e=>setFDept(e.target.value)}>
                <option value="all">All Departments</option>
                {Object.entries(DEPT).filter(([k])=>!visDepts||visDepts.includes(k)).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            ) : visDepts?.length === 1 ? (
              <div style={{padding:'0 14px',height:40,display:'flex',alignItems:'center',fontSize:13,fontWeight:600,color:DEPT[visDepts[0]]?.color||'#1A1025',background:(DEPT[visDepts[0]]?.color||'#6B7280')+'12',borderRadius:8}}>{DEPT[visDepts[0]]?.label||visDepts[0]}</div>
            ) : null}
            <select className="field-select" style={{ width: 160 }} value={fStatus} onChange={e=>setFStatus(e.target.value)}>
              <option value="all">All Statuses</option>
              {Object.entries(STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              {Object.entries(HOLD_STATUS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            {(fDept!=="all"||fStatus!=="all"||search) && <button className="btn-reset" onClick={()=>{setFDept("all");setFStatus("all");setSearch("")}}>Reset</button>}
          </div>

          {/* Table */}
          <div className="card" style={{ overflow: "hidden" }}>
            <div className="tbl-header" style={{ gridTemplateColumns: grid }}>
              {cols.map((c,i)=><div key={i} className="tbl-col" onClick={c.k?()=>toggleSort(c.k):undefined} style={{ cursor: c.k?"pointer":"default" }}>{c.l}{c.k && sortInd(c.k)}</div>)}
            </div>
            {filtered.length===0 ? <div className="empty">No jobs found.</div> : filtered.map(job=>{
              const sibling = job.project_id ? jobs.find(j => j.project_id === job.project_id && j.id !== job.id) : null;
              return (
                <div key={job.id} className="tbl-row" style={{ gridTemplateColumns: grid }} onClick={()=>router.push(`/jobs/${job.job_id}`)}>
                  <div className="tbl-cell">
                    <JID>{job.job_id}</JID>
                    {sibling && <span className="link-badge" title={`Part of Project ${job.project_id} — together with ${sibling.job_id}`} onClick={(e)=>{e.stopPropagation(); handleJumpToJob(sibling.job_id);}}>🔗</span>}
                  </div>
                  <div className="tbl-cell text-body">{job.customer_name}</div>
                  <div className="tbl-cell"><DTag d={job.department} /></div>
                  <div className="tbl-cell text-body text-secondary">{job.job_type}</div>
                  <div className="tbl-cell"><StatusBadge s={job.status} /></div>
                  <div className="tbl-cell text-body font-semibold">{formatRM(job.estimation_value)}</div>
                  <div className="tbl-cell text-body text-secondary">{job.pic || '—'}</div>
                  <div className="tbl-cell"><DLBadge deadline={job.deadline} status={job.status} /></div>
                  <div className="tbl-cell text-body text-secondary" style={{fontSize:11.5}}>{lastTouched[job.job_id] ? formatDateTime(lastTouched[job.job_id]) : '—'}</div>
                </div>
              );
            })}
          </div>
          <div className="summary-footer">
            <span>{filtered.length} jobs</span>
            <span>Pipeline: {formatRM(filtered.filter(j=>["new","assigned","active"].includes(j.status)).reduce((s,j)=>s+(j.estimation_value||0),0))}</span>
          </div>
        </div>

        {showCreate && <Modal width={640} onClose={closeCreate}>
          <div className="modal-header">
            <div>
              <div className="modal-title">New Job</div>
              <div className="text-sm text-muted" style={{marginTop:4}}>
                {newJob.depts.length===0 && <>Job ID: <span className="jid" style={{color:'#9B93A8'}}>—</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></>}
                {newJob.depts.length===1 && <>Job ID: <span className="jid" style={{color:'#1A1025'}}>{genJobId(newJob.depts[0])}</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></>}
                {newJob.depts.length>1 && <>Job ID: <span className="jid" style={{color:'#1A1025'}}>{newJob.depts.map(d=>genJobId(d)).join(' + ')}</span> <span className="text-xs" style={{color:'#B0A8BC'}}>(auto)</span></>}
              </div>
            </div>
            <button className="modal-close" onClick={closeCreate}>×</button>
          </div>
          <div className="modal-body" style={{padding:24,overflowY:'auto',maxHeight:'60vh'}}>
            {/* Customer dropdown + inline create */}
            <div style={{marginBottom:16}}>
              <label className="field-label">Customer *</label>
              <select className={`field-select${fieldErr('cid')?' field-select-err':''}`} style={{width:'100%'}} value={newJob.cid} onChange={e=>nj('cid',e.target.value)}>
                <option value="">— Select Customer —</option>
                {customers.map(c=><option key={c.id} value={c.id}>{c.customer_id || c.id} · {customerDisplayName(c)}</option>)}
              </select>
              {fieldErr('cid') && <div className="field-error">Customer is required.</div>}
              {!showInlineCust && (
                <button
                  onClick={() => setShowInlineCust(true)}
                  style={{ fontFamily: "'Poppins',sans-serif", fontSize: 12, fontWeight: 600, color: '#E91E63', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0 0 0' }}
                >+ New Customer</button>
              )}
              {showInlineCust && (
                <div style={{ marginTop: 10, padding: 14, background: '#F9F8FB', borderRadius: 10, border: '1px solid #F0ECF4' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="field-label" style={{ margin: 0, fontWeight: 600 }}>New Customer</span>
                    <button onClick={() => { setShowInlineCust(false); setNewCust({name:'',company:'',phone:'',email:'',source:'referral'}); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9B93A8', fontSize: 16 }}>×</button>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label className="field-label">Name *</label>
                    <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.name} onChange={e => setNewCust(p => ({...p, name: e.target.value}))} placeholder="Customer name" />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                    <div>
                      <label className="field-label">Company</label>
                      <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.company} onChange={e => setNewCust(p => ({...p, company: e.target.value}))} placeholder="Company name" />
                    </div>
                    <div>
                      <label className="field-label">Phone</label>
                      <input className="field-input" style={{ height: 36, fontSize: 12 }} value={newCust.phone} onChange={e => setNewCust(p => ({...p, phone: e.target.value}))} placeholder="Phone number" />
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
                  >Save Customer</button>
                </div>
              )}
            </div>

            {/* Department — multi-select: pick more than one when the same customer request spans departments */}
            <div style={{marginBottom:16}}>
              <label className="field-label">Department * <span style={{fontWeight:400,color:'#9B93A8'}}>— you can select more than one</span></label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8}}>
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
                  {newJob.depts.length} departments selected — one <strong>Project ID: <span className="jid">{genProjectId()}</span></strong> will be generated to group these jobs together. Each department still gets its own Job ID &amp; status.
                </div>
              )}
              {fieldErr('depts') && <div className="field-error">Select at least one department.</div>}
            </div>

            {/* Each department gets its own full section — a job's Job Type,
                Bank, Job Name, PIC, dates, and notes can differ entirely per
                department even when created together under one customer. */}
            {newJob.depts.map(d=>{
              const meta = DEPT[d];
              const f = newJob.perDept[d] || emptyDeptFields();
              const set = (k,v) => setDeptField(d,k,v);
              return (
                <div key={d} style={{border:`1.5px solid ${meta.color}30`,borderRadius:10,padding:14,background:meta.color+'08',marginBottom:14}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                    <span style={{fontSize:10.5,fontWeight:700,padding:'4px 9px',borderRadius:6,color:meta.color,background:meta.color+'18'}}>{meta.code}</span>
                    <span style={{fontSize:13,fontWeight:700,color:'#1A1025'}}>{meta.label}</span>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:14}}>
                    <div><label className="field-label">Job Type *</label><div style={{display:'flex',gap:0}}>{Object.entries(JOB_TYPE).map(([k,v])=><button key={k} type="button" style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,padding:"8px 14px",cursor:"pointer",border:`1px solid ${f.jobType===k?v.color:(deptFieldErr(d,'jobType')?'#EF4444':'#E8E4ED')}`,borderRadius:k==='client_project'?'8px 0 0 8px':'0 8px 8px 0',background:f.jobType===k?v.color+'15':'#fff',color:f.jobType===k?v.color:'#6B6080'}} onClick={()=>setNewJob(p => ({ ...p, perDept: { ...p.perDept, [d]: { ...p.perDept[d], jobType: k, productLine:'', segment:'', pkg:'' } } }))}>{v.label}</button>)}</div>{deptFieldErr(d,'jobType')&&<div className="field-error">Job type is required.</div>}</div>
                    <div><label className="field-label">Bank *</label><div style={{display:'flex',gap:0}}>{Object.entries(BANK).map(([k,v],i)=><button key={k} type="button" style={{fontFamily:"'Poppins',sans-serif",fontSize:11,fontWeight:600,padding:"8px 14px",cursor:"pointer",border:`1px solid ${f.bank===k?v.color:(deptFieldErr(d,'bank')?'#EF4444':'#E8E4ED')}`,borderRadius:i===0?'8px 0 0 8px':'0 8px 8px 0',background:f.bank===k?v.color+'15':'#fff',color:f.bank===k?v.color:'#6B6080'}} onClick={()=>set('bank',k)}>{v.label}</button>)}</div>{deptFieldErr(d,'bank')&&<div className="field-error">Bank is required.</div>}</div>
                  </div>

                  {f.jobType === 'product_sale' && productLinesFor(d).length > 0 && (
                    <div style={{marginBottom:14,padding:12,borderRadius:8,background:'#F7F5FA',border:'1px dashed #D8D2E0'}}>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                        <div>
                          <label className="field-label">Product</label>
                          <select className="field-select" style={{width:'100%'}} value={f.productLine} onChange={e=>{
                            const val = e.target.value;
                            setNewJob(p => ({ ...p, perDept: { ...p.perDept, [d]: { ...p.perDept[d], productLine: val, segment:'', pkg:'' } } }));
                          }}>
                            <option value="">— Custom job (not a package) —</option>
                            {productLinesFor(d).map(l=><option key={l.key} value={l.key}>{l.label}</option>)}
                          </select>
                        </div>
                        {f.productLine && (
                          <div>
                            <label className="field-label">Customer Type</label>
                            <select className="field-select" style={{width:'100%'}} value={f.segment} onChange={e=>{
                              const val = e.target.value;
                              setNewJob(p => ({ ...p, perDept: { ...p.perDept, [d]: { ...p.perDept[d], segment: val, pkg:'' } } }));
                            }}>
                              <option value="">— Select —</option>
                              {segmentsFor(d, f.productLine).map(s=><option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      {f.segment && (
                        <div style={{marginTop:12}}>
                          <label className="field-label">Package</label>
                          <select className="field-select" style={{width:'100%'}} value={f.pkg} onChange={e=>{
                            const val = e.target.value;
                            const tier = findPackageTier(d, f.productLine, f.segment, val);
                            setNewJob(p => ({ ...p, perDept: { ...p.perDept, [d]: { ...p.perDept[d], pkg: val, type: tier ? `${tier.pkg.label} (${tier.tier.pcs}pcs)` : p.perDept[d].type } } }));
                          }}>
                            <option value="">— Select package —</option>
                            {packageTierOptions(d, f.productLine, f.segment).map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          {f.pkg && (()=>{ const t = findPackageTier(d, f.productLine, f.segment, f.pkg); return t ? (
                            <div style={{marginTop:8,padding:'9px 12px',borderRadius:8,background:'#fff',fontSize:11.5,color:'#6B6080',lineHeight:1.6}}>
                              {packageItemsFor(t.pkg, t.tier).map((it,i)=><div key={i}>• {it}</div>)}
                            </div>
                          ) : null; })()}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{marginBottom:14}}>
                    <label className="field-label">Job Name *</label>
                    <input className={`field-input${deptFieldErr(d,'type')?' field-input-err':''}`} value={f.type} onChange={e=>set('type',e.target.value)} placeholder="e.g: Design & Print Roti Bakar" />
                    {deptFieldErr(d,'type') && <div className="field-error">Required.</div>}
                  </div>

                  <div style={{marginBottom:14}}>
                    <label className="field-label">PIC <span style={{fontWeight:400,color:'#9B93A8'}}>— optional, leave blank for department staff to self-assign</span></label>
                    <select className="field-select" style={{width:'100%'}} value={f.pic} onChange={e=>set('pic',e.target.value)}>
                      <option value="">— Not assigned (in queue) —</option>
                      {PIC_OPTIONS.map(p=><option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>

                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:14}}>
                    <div><label className="field-label">Start Date *</label><input type="date" className={`field-input${deptFieldErr(d,'start')?' field-input-err':''}`} value={f.start} onChange={e=>{ const v=e.target.value; set('start',v); if(v && !f.deadline) set('deadline', addWorkingDays(v,3)); }} />{deptFieldErr(d,'start')&&<div className="field-error">Required.</div>}</div>
                    <div><label className="field-label">Deadline *</label><input type="date" className={`field-input${deptFieldErr(d,'deadline')?' field-input-err':''}`} value={f.deadline} onChange={e=>set('deadline',e.target.value)} />{deptFieldErr(d,'deadline')&&<div className="field-error">Required.</div>}</div>
                  </div>

                  <div>
                    <label className="field-label">Notes</label>
                    <textarea style={{fontFamily:"'Poppins',sans-serif",fontSize:13,border:"1px solid #E8E4ED",borderRadius:8,padding:"10px 12px",width:"100%",minHeight:60,resize:"vertical",outline:"none",boxSizing:"border-box"}} value={f.notes} onChange={e=>set('notes',e.target.value)} placeholder="Additional information..." />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="modal-footer" style={{padding:"16px 24px",borderTop:"1px solid #F0ECF4",display:"flex",justifyContent:"flex-end",gap:8}}><button className="btn-secondary" onClick={closeCreate}>Cancel</button><button className="btn-primary" style={{background:canSaveJob?"#E91E63":"#E8E4ED",color:canSaveJob?"#fff":"#9B93A8",cursor:canSaveJob?"pointer":"not-allowed"}} onClick={handleCreateSave}>Save Job</button></div>
        </Modal>}
        {toast && <Toast msg={typeof toast==='string'?toast:toast.msg} action={typeof toast==='object'?toast.action:null} onDone={()=>setToast(null)} />}
      </div>
    </>
  );
}
