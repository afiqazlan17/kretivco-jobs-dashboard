"use client"
import { useState, useMemo, useEffect } from "react";
import { useData, useVisibleDepts } from "@/lib/hooks";
import { DEPT, STATUS, SOURCE, SOURCE_OPTIONS, formatRM, formatDate } from "@/lib/constants";

function SrcBadge({s}){const m=SOURCE[s];return m?<span className="src-badge" style={{color:m.color,background:m.color+"12"}}>{m.label}</span>:<span className="text-xs text-muted">—</span>}
function StatusBadge({s}){const m=STATUS[s];return m?<span className="badge-s" style={{color:m.color,background:m.color+"15"}}>{m.label}</span>:null}
function DTag({d}){const m=DEPT[d];return m?<span className="badge-d" style={{color:m.color,background:m.color+"15"}}>{m.code}</span>:null}
function Av({name,sz=36}){const colors=["#E91E63","#7209B7","#3A86FF","#E85D04","#10B981"];const i=(name?.charCodeAt(0)||0)%colors.length;return<div className="avatar" style={{width:sz,height:sz,fontSize:sz*.38,background:colors[i]+"18",color:colors[i]}}>{name?.charAt(0)||"?"}</div>}
function Modal({w,children,onClose}){return<div className="overlay" onClick={onClose}><div className="mbox" style={{width:w}} onClick={e=>e.stopPropagation()}>{children}</div></div>}
function Toast({msg,onDone}){useEffect(()=>{const t=setTimeout(onDone,2500);return()=>clearTimeout(t)},[onDone]);return<div className="toast">✓ {msg}</div>}

// ─── Profile Modal (720px) ────────────────────────────────────
function ProfileModal({cust,jobs,onEdit,onClose}){
  const cj=jobs.filter(j=>j.customer_id===cust.id);
  const active=cj.filter(j=>!["completed","cancelled"].includes(j.status));
  const comp=cj.filter(j=>j.status==="completed");
  const totalEst=cj.filter(j=>j.status!=="cancelled").reduce((s,j)=>s+(j.estimation_value||0),0);
  const revenue=comp.reduce((s,j)=>s+(j.final_value||0),0);
  const pipeline=active.reduce((s,j)=>s+(j.estimation_value||0),0);
  const depts=useMemo(()=>{const m={};cj.filter(j=>j.status!=="cancelled").forEach(j=>{if(!m[j.department])m[j.department]={count:0,est:0};m[j.department].count++;m[j.department].est+=j.estimation_value||0});return m},[cj]);

  return(
    <Modal w={720} onClose={onClose}>
      <div className="mheader"><div className="flex-row gap-3"><Av name={cust.name} sz={44}/><div><div className="mtitle">{cust.name}</div><div className="flex-row gap-2 mt-1"><span className="jid text-muted">{cust.customer_id}</span><SrcBadge s={cust.source}/></div></div></div><div className="flex-row gap-2"><button className="btn-sm-outline" onClick={onEdit}>Edit</button><button className="mclose" onClick={onClose}>×</button></div></div>
      <div className="mbody">
        {/* Contact */}
        <div className="info-cards">{[{icon:"🏢",l:"Syarikat",v:cust.company||"—"},{icon:"📞",l:"Telefon",v:cust.phone||"—"},{icon:"✉️",l:"Email",v:cust.email||"—"}].map((c,i)=>(<div key={i} className="info-card"><div className="section-label">{c.icon} {c.l}</div><div className="text-body fw500">{c.v}</div></div>))}</div>
        {/* Financial */}
        <div className="fin-cards">
          <div className="fin-card" style={{borderLeftColor:"#E91E63"}}><div className="section-label">Total Value</div><div className="fin-val">{formatRM(totalEst)}</div><div className="text-xs text-secondary">{cj.filter(j=>j.status!=="cancelled").length} job</div></div>
          <div className="fin-card" style={{borderLeftColor:"#10B981"}}><div className="section-label">Revenue</div><div className="fin-val" style={{color:"#10B981"}}>{formatRM(revenue)}</div><div className="text-xs text-secondary">{comp.length} selesai</div></div>
          <div className="fin-card" style={{borderLeftColor:"#6366F1"}}><div className="section-label">Pipeline</div><div className="fin-val" style={{color:"#6366F1"}}>{formatRM(pipeline)}</div><div className="text-xs text-secondary">{active.length} aktif</div></div>
        </div>
        {/* Dept breakdown */}
        {Object.keys(depts).length>0&&<div className="mb-6"><div className="section-label mb-2">Department Breakdown</div><div className="dept-chips">{Object.entries(depts).map(([d,data])=><div key={d} className="dept-chip" style={{background:DEPT[d].color+"08",border:`1px solid ${DEPT[d].color}20`}}><DTag d={d}/><div><div className="text-body fw600">{data.count} job</div><div className="text-xs text-secondary">{formatRM(data.est)}</div></div></div>)}</div></div>}
        {/* Job history */}
        <div className="card-title mb-3">Sejarah Job ({cj.length})</div>
        {cj.length===0?<div className="empty-sm">Belum ada job.</div>:(
          <div className="mini-table">{cj.map((j,i)=>(<div key={j.id} className="mini-row"><span className="jid">{j.job_id}</span><DTag d={j.department}/><span className="text-body text-secondary flex-1 truncate">{j.job_type}</span><StatusBadge s={j.status}/><span className="text-body fw500" style={{color:j.status==="completed"?"#10B981":"#1A1025"}}>{formatRM(j.final_value||j.estimation_value)}</span></div>))}</div>
        )}
        <div className="text-xs text-placeholder mt-4">Customer sejak {formatDate(cust.created_at)}</div>
      </div>
    </Modal>
  );
}

// ─── Edit Customer Modal ──────────────────────────────────────
function EditModal({cust,onSave,onClose}){
  const [f,setF]=useState({name:cust.name,company:cust.company||"",phone:cust.phone||"",email:cust.email||"",source:cust.source||"other"});
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const changed=f.name!==cust.name||f.company!==(cust.company||"")||f.phone!==(cust.phone||"")||f.email!==(cust.email||"")||f.source!==(cust.source||"other");
  return(
    <Modal w={480} onClose={onClose}>
      <div className="mheader"><div><div className="mtitle">Edit Customer</div><div className="jid text-muted mt-1">{cust.customer_id}</div></div><button className="mclose" onClick={onClose}>×</button></div>
      <div className="mbody">
        <div className="fg"><label className="fl">Nama *</label><input className="fi" value={f.name} onChange={e=>s("name",e.target.value)}/></div>
        <div className="fg"><label className="fl">Syarikat</label><input className="fi" value={f.company} onChange={e=>s("company",e.target.value)}/></div>
        <div className="frow"><div><label className="fl">Telefon</label><input className="fi" value={f.phone} onChange={e=>s("phone",e.target.value)}/></div><div><label className="fl">Email</label><input className="fi" value={f.email} onChange={e=>s("email",e.target.value)}/></div></div>
        <div className="fg"><label className="fl">Sumber</label><select className="fs" value={f.source} onChange={e=>s("source",e.target.value)}>{SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
      </div>
      <div className="mfooter"><button className="btn-secondary" onClick={onClose}>Batal</button><button className={changed?"btn-primary":"btn-disabled"} onClick={()=>{if(changed&&f.name.trim())onSave(f)}}>Simpan</button></div>
    </Modal>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export default function CustomerDirectory(){
  const { customers, jobs, addCustomer, updateCustomer, genCustId } = useData();
  const visDepts = useVisibleDepts();
  const visJobs = visDepts ? jobs.filter(j => visDepts.includes(j.department)) : jobs;
  const [search,setSearch]=useState("");
  const [fSrc,setFSrc]=useState("all");
  const [profile,setProfile]=useState(null);
  const [editCust,setEditCust]=useState(null);
  const [toast,setToast]=useState(null);
  const [showNew,setShowNew]=useState(false);
  const [newForm,setNewForm]=useState({name:'',company:'',phone:'',email:'',source:'referral'});
  const handleNewSave=()=>{if(!newForm.name.trim())return;const custId=genCustId();addCustomer({id:crypto.randomUUID(),customer_id:custId,name:newForm.name,company:newForm.company,phone:newForm.phone,email:newForm.email,source:newForm.source,created_at:new Date().toISOString()});setShowNew(false);setNewForm({name:'',company:'',phone:'',email:'',source:'referral'});setToast(`${custId} (${newForm.name}) ditambah.`)};

  const stats=useMemo(()=>{const m={};customers.forEach(c=>{const cj=visJobs.filter(j=>j.customer_id===c.id&&j.status!=="cancelled");m[c.id]={jobs:cj.length,est:cj.reduce((s,j)=>s+(j.estimation_value||0),0),rev:cj.filter(j=>j.status==="completed").reduce((s,j)=>s+(j.final_value||0),0)};});return m},[customers,visJobs]);
  const visCustomerIds=useMemo(()=>visDepts?new Set(visJobs.map(j=>j.customer_id)):null,[visDepts,visJobs]);
  const filtered=useMemo(()=>{let l=[...customers];if(visCustomerIds)l=l.filter(c=>visCustomerIds.has(c.id));if(fSrc!=="all")l=l.filter(c=>c.source===fSrc);if(search.trim()){const q=search.toLowerCase();l=l.filter(c=>c.name.toLowerCase().includes(q)||(c.customer_id||"").toLowerCase().includes(q));}return l},[customers,fSrc,search,visCustomerIds]);
  const totalRev=Object.values(stats).reduce((s,c)=>s+c.rev,0);

  // Keep profile/editCust in sync with latest customer data
  const currentProfile = profile ? customers.find(c=>c.id===profile.id) || null : null;
  const currentEditCust = editCust ? customers.find(c=>c.id===editCust.id) || null : null;

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px;max-width:1200px;margin:0 auto}
        .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:20px}
        .sum-card{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid}
        .filter-bar{padding:14px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
        .badge-s{display:inline-block;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600}.badge-d{display:inline-block;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600}
        .src-badge{display:inline-block;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600}
        .jid{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600}
        .avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
        .tbl-h{display:grid;grid-template-columns:48px 88px 1fr 140px 70px 90px 90px 60px;background:#F9F8FB;padding:0 20px;border-bottom:1px solid #F3F1F6}
        .tbl-hc{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;padding:12px 4px}
        .tbl-r{display:grid;grid-template-columns:48px 88px 1fr 140px 70px 90px 90px 60px;padding:0 20px;align-items:center;height:52px;border-bottom:1px solid #F3F1F6;cursor:pointer}
        .tbl-r:hover{background:#F9F8FB}.tbl-c{padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);animation:fadeIn .2s}
        .mbox{position:relative;background:#fff;border-radius:16px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.18);animation:slideUp .25s}
        .mheader{padding:20px 24px;border-bottom:1px solid #F0ECF4;display:flex;justify-content:space-between;align-items:center}
        .mtitle{font-size:16px;font-weight:700}.mclose{background:none;border:none;font-size:22px;cursor:pointer;color:#9B93A8}
        .mbody{padding:24px;overflow-y:auto;flex:1}.mfooter{padding:16px 24px;border-top:1px solid #F0ECF4;display:flex;justify-content:flex-end;gap:8px}
        .fg{margin-bottom:16px}.fl{font-size:12px;font-weight:500;color:#6B6080;display:block;margin-bottom:6px}
        .fi{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 12px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;box-sizing:border-box}
        .fi:focus{border-color:#E91E63!important;box-shadow:0 0 0 3px rgba(233,30,99,.08)}
        .fs{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 10px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;cursor:pointer;appearance:auto}
        .frow{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
        .info-cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
        .info-card{background:#F9F8FB;border-radius:10px;padding:12px 14px;border:1px solid #F0ECF4}
        .fin-cards{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px}
        .fin-card{background:#fff;border-radius:10px;padding:14px 16px;border:1px solid #F0ECF4;border-left:4px solid}
        .fin-val{font-size:20px;font-weight:700;margin-top:4px}
        .dept-chips{display:flex;gap:8px;flex-wrap:wrap}
        .dept-chip{border-radius:8px;padding:8px 14px;display:flex;align-items:center;gap:10px}
        .mini-table{border:1px solid #F0ECF4;border-radius:10px;overflow:hidden}
        .mini-row{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid #F3F1F6;font-size:13px}
        .mini-row:last-child{border-bottom:none}.mini-row:hover{background:#F9F8FB}
        .section-label{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;margin-bottom:4px}
        .card-title{font-size:14px;font-weight:700}
        .empty-sm{padding:24px;text-align:center;color:#9B93A8;font-size:13px;background:#F9F8FB;border-radius:10px}
        .btn-primary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E91E63;color:#fff;cursor:pointer}
        .btn-secondary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:500;padding:9px 20px;border-radius:8px;border:1px solid #E8E4ED;background:#F5F3F7;color:#1A1025;cursor:pointer}
        .btn-disabled{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E8E4ED;color:#9B93A8;cursor:not-allowed}
        .btn-sm-outline{font-family:'Poppins',sans-serif;font-size:12px;font-weight:500;padding:6px 14px;border-radius:8px;border:1px solid #E8E4ED;background:#F5F3F7;color:#1A1025;cursor:pointer}
        .btn-header{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 20px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;gap:6px}
        .search-wrap{position:relative;flex:1 1 200px;min-width:160px}.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#B0A8BC;display:flex}
        .flex-row{display:flex;align-items:center}.flex-1{flex:1;min-width:0}.gap-2{gap:8px}.gap-3{gap:12px}.mt-1{margin-top:4px}.mt-4{margin-top:16px}.mb-2{margin-bottom:8px}.mb-3{margin-bottom:12px}.mb-6{margin-bottom:24px}.truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .text-body{font-size:13px}.text-sm{font-size:12px}.text-xs{font-size:11px}.text-muted{color:#9B93A8}.text-secondary{color:#6B6080}.text-placeholder{color:#B0A8BC}.fw500{font-weight:500}.fw600{font-weight:600}
        .toast{position:fixed;bottom:24px;right:24px;z-index:200;background:#1A1025;color:#fff;border-radius:10px;padding:12px 20px;font-size:13px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.2);border-left:4px solid #10B981;animation:slideUp .3s}
        button:hover{filter:brightness(.97)}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div className="page">
        <div className="header"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><div><div style={{fontSize:20,fontWeight:700}}>Customer Directory</div><div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>{customers.length} customers</div></div><button onClick={()=>setShowNew(true)} style={{fontFamily:"'Poppins',sans-serif",fontSize:13,fontWeight:600,padding:"9px 20px",borderRadius:8,border:"1px solid rgba(255,255,255,.4)",background:"rgba(255,255,255,.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",gap:6}}><span style={{fontSize:16}}>+</span> Customer Baru</button></div></div>
        <div className="content">
          <div className="sum-grid">
            <div className="sum-card" style={{borderLeftColor:"#E91E63"}}><div className="section-label">Jumlah Customer</div><div style={{fontSize:24,fontWeight:700,marginTop:4}}>{customers.length}</div></div>
            <div className="sum-card" style={{borderLeftColor:"#10B981"}}><div className="section-label">Revenue</div><div style={{fontSize:24,fontWeight:700,color:"#10B981",marginTop:4}}>{formatRM(totalRev)}</div></div>
          </div>
          <div className="card filter-bar">
            <div className="search-wrap"><span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><input className="fi" style={{paddingLeft:36}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari customer..."/></div>
            <select className="fs" style={{width:150}} value={fSrc} onChange={e=>setFSrc(e.target.value)}><option value="all">Semua Sumber</option>{SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>
          </div>
          <div className="card" style={{overflow:"hidden"}}>
            <div className="tbl-h">{["","ID","Nama","Syarikat","Jobs","Value","Sumber",""].map((h,i)=><div key={i} className="tbl-hc">{h}</div>)}</div>
            {filtered.map(c=>{const st=stats[c.id]||{jobs:0,est:0};return(
              <div key={c.id} className="tbl-r" onClick={()=>setProfile(c)}>
                <div className="tbl-c"><Av name={c.name} sz={30}/></div>
                <div className="tbl-c jid text-muted">{c.customer_id}</div>
                <div className="tbl-c text-body fw500">{c.name}</div>
                <div className="tbl-c text-sm text-secondary">{c.company||"—"}</div>
                <div className="tbl-c text-body fw600">{st.jobs}</div>
                <div className="tbl-c text-sm fw500">{formatRM(st.est)}</div>
                <div className="tbl-c"><SrcBadge s={c.source}/></div>
                <div className="tbl-c text-muted">›</div>
              </div>
            )})}
          </div>
          <div className="text-sm text-muted mt-4">{filtered.length} customer</div>
        </div>
        {currentProfile&&<ProfileModal cust={currentProfile} jobs={jobs} onEdit={()=>setEditCust(currentProfile)} onClose={()=>setProfile(null)}/>}
        {currentEditCust&&<EditModal cust={currentEditCust} onSave={u=>{updateCustomer(currentEditCust.id,u);setEditCust(null);if(profile?.id===currentEditCust.id)setProfile({...currentEditCust,...u});setToast(`${currentEditCust.customer_id} dikemaskini.`);}} onClose={()=>setEditCust(null)}/>}
        {showNew&&<Modal w={480} onClose={()=>setShowNew(false)}><div className="mheader"><div><div className="mtitle">Customer Baru</div><div className="jid text-muted" style={{marginTop:4}}>ID: {genCustId()}</div></div><button className="mclose" onClick={()=>setShowNew(false)}>×</button></div><div className="mbody"><div className="fg"><label className="fl">Nama Customer *</label><input className="fi" value={newForm.name} onChange={e=>setNewForm(p=>({...p,name:e.target.value}))} placeholder="Nama penuh"/></div><div className="fg"><label className="fl">Nama Syarikat</label><input className="fi" value={newForm.company} onChange={e=>setNewForm(p=>({...p,company:e.target.value}))} placeholder="Optional"/></div><div className="frow"><div><label className="fl">Telefon</label><input className="fi" value={newForm.phone} onChange={e=>setNewForm(p=>({...p,phone:e.target.value}))}/></div><div><label className="fl">Email</label><input className="fi" value={newForm.email} onChange={e=>setNewForm(p=>({...p,email:e.target.value}))}/></div></div><div className="fg"><label className="fl">Sumber</label><select className="fs" value={newForm.source} onChange={e=>setNewForm(p=>({...p,source:e.target.value}))}>{SOURCE_OPTIONS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div></div><div className="mfooter"><button className="btn-secondary" onClick={()=>setShowNew(false)}>Batal</button><button className={newForm.name.trim()?"btn-primary":"btn-disabled"} onClick={handleNewSave}>Simpan Customer</button></div></Modal>}
        {toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
      </div>
    </>
  );
}
