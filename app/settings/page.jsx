"use client"
import { useState, useMemo, useEffect } from "react";
import { useAuth, useData } from '@/lib/hooks';
const DEPT={print:{code:"KP",label:"KretivPrint",color:"#E85D04"},work:{code:"KW",label:"KretivWork",color:"#7209B7"},tech:{code:"KT",label:"KretivTech",color:"#3A86FF"},event:{code:"KE",label:"KretivEvent",color:"#E91E63"},wisb:{code:"WISB",label:"Wafiy Industries",color:"#6B7280"}};
const ROLE={bod:{l:"BOD",c:"#E91E63",d:"Full access — semua department, reports, settings"},dept_head:{l:"Dept Head",c:"#3A86FF",d:"Department sendiri — jobs, reports"},staff:{l:"Staff",c:"#6B7280",d:"Department sendiri — limited actions"}};
const formatDate=d=>d?new Date(d).toLocaleDateString("ms-MY",{day:"numeric",month:"short",year:"numeric"}):"—";

function RBadge({r}){const m=ROLE[r];return m?<span className="badge-r" style={{color:m.c,background:m.c+"15"}}>{m.l}</span>:null}
function DTag({d}){if(!d)return<span className="text-sm text-muted">Semua</span>;const m=DEPT[d];return m?<span className="badge-d" style={{color:m.c,background:m.c+"15"}}>{m.label}</span>:null}
function Av({name,sz=32}){const colors=["#E91E63","#7209B7","#3A86FF","#E85D04","#10B981","#F59E0B","#6366F1"];const i=(name?.charCodeAt(0)||0)%colors.length;return<div className="avatar" style={{width:sz,height:sz,fontSize:sz*.38,background:colors[i]+"18",color:colors[i]}}>{name?.charAt(0)||"?"}</div>}
function Modal({w,children,onClose}){return<div className="overlay" onClick={onClose}><div className="mbox" style={{width:w}} onClick={e=>e.stopPropagation()}>{children}</div></div>}
function Toast({msg,type,onDone}){useEffect(()=>{const t=setTimeout(onDone,2500);return()=>clearTimeout(t)},[onDone]);const c=type==="danger"?"#EF4444":"#10B981";return<div className="toast" style={{borderLeftColor:c}}>{type==="danger"?"✕":"✓"} {msg}</div>}

function UserModal({user,onSave,onClose}){
  const isEdit=!!user;
  const[f,setF]=useState({name:user?.name||"",email:user?.email||"",role:user?.role||"staff",department:user?.department||"",visible_departments:user?.visible_departments||[]});
  const[err,setErr]=useState({});
  const s=(k,v)=>{setF(p=>{const n={...p,[k]:v};if(k==="role"&&v==="bod"){n.department="";n.visible_departments=[]}return n})};
  const toggleVisDept=(dept)=>{setF(p=>{const vd=[...(p.visible_departments||[])];const i=vd.indexOf(dept);if(i>=0)vd.splice(i,1);else vd.push(dept);return{...p,visible_departments:vd}})};
  const needsDept=f.role!=="bod";
  const changed=isEdit?(f.name!==user.name||f.email!==user.email||f.role!==user.role||(f.department||null)!==(user.department||null)||JSON.stringify(f.visible_departments||[])!==JSON.stringify(user.visible_departments||[])):true;
  const validate=()=>{const e={};if(!f.name.trim())e.name="Wajib.";if(!f.email.trim())e.email="Wajib.";if(needsDept&&!f.department)e.department="Pilih department.";setErr(e);return!Object.keys(e).length};

  return(
    <Modal w={500} onClose={onClose}>
      <div className="mheader"><div className="mtitle">{isEdit?"Edit User":"Tambah User"}</div><button className="mclose" onClick={onClose}>×</button></div>
      <div className="mbody">
        <div className="fg"><label className="fl">Nama Penuh *</label><input className="fi" value={f.name} onChange={e=>s("name",e.target.value)} style={{borderColor:err.name?"#EF4444":"#E8E4ED"}}/>{err.name&&<div className="ferr">{err.name}</div>}</div>
        <div className="fg"><label className="fl">Email *</label><input className="fi" value={f.email} onChange={e=>s("email",e.target.value)} placeholder="email@kretiv.co"/></div>
        <div className="fg"><label className="fl">Role *</label>
          <div className="role-cards">{Object.entries(ROLE).map(([k,v])=>(
            <label key={k} className="role-card" style={{border:f.role===k?`2px solid ${v.c}`:"1px solid #E8E4ED",background:f.role===k?v.c+"06":"#fff"}}>
              <input type="radio" name="role" value={k} checked={f.role===k} onChange={()=>s("role",k)} style={{accentColor:v.c,width:16,height:16}}/>
              <div style={{flex:1}}><div className="text-body fw600" style={{color:f.role===k?v.c:"#1A1025"}}>{v.l}</div><div className="text-xs text-muted">{v.d}</div></div>
            </label>
          ))}</div>
        </div>
        {needsDept&&<div className="fg"><label className="fl">Department *</label><div className="dept-btns">{Object.entries(DEPT).map(([k,v])=><button key={k} className="dept-btn" style={{border:f.department===k?`2px solid ${v.color}`:"1px solid #E8E4ED",background:f.department===k?v.color+"12":"#fff",color:f.department===k?v.color:"#6B6080"}} onClick={()=>s("department",k)}>{v.label}</button>)}</div>{err.department&&<div className="ferr">{err.department}</div>}</div>}
        {needsDept&&<div className="fg"><label className="fl">Visible Departments</label><div className="text-xs text-muted" style={{marginBottom:8}}>Pilih department yang user ini boleh lihat. Kosong = department sendiri sahaja.</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{Object.entries(DEPT).map(([k,v])=>{const checked=(f.visible_departments||[]).includes(k);return<label key={k} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:8,cursor:'pointer',border:checked?`2px solid ${v.color}`:'1px solid #E8E4ED',background:checked?v.color+'08':'#fff',fontSize:12,fontWeight:checked?600:400,color:checked?v.color:'#6B6080'}}><input type="checkbox" checked={checked} onChange={()=>toggleVisDept(k)} style={{accentColor:v.color,width:14,height:14}}/>{v.label}</label>})}</div></div>}
        <div className="access-preview"><div className="section-label" style={{marginBottom:8}}>Preview Akses</div><div className="text-sm" style={{lineHeight:1.8}}>
          {f.role==="bod"?<><span className="text-green">✓</span> Semua department<br/><span className="text-green">✓</span> Full reports & export<br/><span className="text-green">✓</span> Settings & user management</>:
          f.role==="dept_head"?<><span className="text-green">✓</span> {(f.visible_departments||[]).length>0?`Boleh lihat: ${f.visible_departments.map(d=>DEPT[d]?.label).filter(Boolean).join(', ')}`:`Job ${f.department?DEPT[f.department]?.label:"dept"} sahaja`}<br/><span className="text-green">✓</span> Reports dept yang visible<br/><span className="text-red">✕</span> Tidak boleh akses Settings</>:
          <><span className="text-green">✓</span> {(f.visible_departments||[]).length>0?`Boleh lihat: ${f.visible_departments.map(d=>DEPT[d]?.label).filter(Boolean).join(', ')}`:`Job ${f.department?DEPT[f.department]?.label:"dept"} sahaja`}<br/><span className="text-amber">~</span> Edit terhad<br/><span className="text-red">✕</span> Tidak boleh Reports & Settings</>}
        </div></div>
      </div>
      <div className="mfooter"><button className="btn-secondary" onClick={onClose}>Batal</button><button className={changed?"btn-primary":"btn-disabled"} onClick={()=>{if(validate())onSave({...user,...f,department:needsDept?f.department:null,visible_departments:needsDept?(f.visible_departments||[]):[]})}}>{isEdit?"Simpan":"Tambah"}</button></div>
    </Modal>
  );
}

function ConfirmModal({title,msg,label,color,onConfirm,onClose}){
  return(<Modal w={400} onClose={onClose}><div style={{padding:"24px 24px 16px"}}><div className="mtitle">{title}</div><p className="text-body text-secondary" style={{marginTop:8,lineHeight:1.6}}>{msg}</p></div><div className="mfooter"><button className="btn-secondary" onClick={onClose}>Batal</button><button className="btn-primary" style={{background:color}} onClick={onConfirm}>{label}</button></div></Modal>);
}

export default function Settings(){
  const { users, addUser, updateUser, resetAll } = useData();
  const[toast,setToast]=useState(null);
  const[search,setSearch]=useState("");const[fRole,setFRole]=useState("all");const[showInactive,setShowInactive]=useState(false);
  const[addModal,setAddModal]=useState(false);const[editUser,setEditUser]=useState(null);const[confirm,setConfirm]=useState(null);
  const[resetModal,setResetModal]=useState(false);const[resetInput,setResetInput]=useState('');

  const filtered=useMemo(()=>{let l=[...users];if(!showInactive)l=l.filter(u=>u.active);if(fRole!=="all")l=l.filter(u=>u.role===fRole);if(search.trim()){const q=search.toLowerCase();l=l.filter(u=>u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q))}return l},[users,fRole,search,showInactive]);

  const ac=users.filter(u=>u.active).length;const bc=users.filter(u=>u.role==="bod"&&u.active).length;const dc=users.filter(u=>u.role==="dept_head"&&u.active).length;const sc=users.filter(u=>u.role==="staff"&&u.active).length;

  const handleToggle=u=>{if(u.active){setConfirm({title:"Nyahaktifkan?",msg:`${u.name} tidak akan boleh log masuk. Boleh aktifkan semula kemudian.`,label:"Nyahaktifkan",color:"#EF4444",onConfirm:()=>{updateUser(u.id,{active:false});setConfirm(null);setToast({msg:`${u.name} dinyahaktifkan.`,type:"danger"})}});}else{updateUser(u.id,{active:true});setToast({msg:`${u.name} diaktifkan.`,type:"success"});}};

  const caps=[["Lihat semua dept",1,0,0],["Lihat dept sendiri",1,1,1],["Cipta job",1,1,1],["Edit job",1,1,0],["Tukar status",1,1,0],["Arkib/Batal",1,0,0],["Reports",1,1,0],["Export",1,0,0],["User Management",1,0,0],["Settings",1,0,0]];

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px;max-width:1100px;margin:0 auto}
        .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06)}
        .sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:20px}
        .sum-card{background:#fff;border-radius:12px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid}
        .filter-bar{padding:14px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:16px}
        .badge-r{display:inline-block;border-radius:20px;padding:4px 12px;font-size:12px;font-weight:600}.badge-d{display:inline-block;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600}
        .avatar{border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;flex-shrink:0}
        .tbl-h{display:grid;grid-template-columns:44px 1fr 1fr 100px 140px 80px 140px;background:#F9F8FB;padding:0 20px;border-bottom:1px solid #F3F1F6;align-items:center}
        .tbl-hc{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;padding:12px 4px}
        .tbl-r{display:grid;grid-template-columns:44px 1fr 1fr 100px 140px 80px 140px;padding:0 20px;align-items:center;height:56px;border-bottom:1px solid #F3F1F6}
        .tbl-r:hover{background:#F9F8FB}.tbl-c{padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
        .overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.5);animation:fadeIn .2s}
        .mbox{position:relative;background:#fff;border-radius:16px;max-width:94vw;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.18);animation:slideUp .25s}
        .mheader{padding:20px 24px;border-bottom:1px solid #F0ECF4;display:flex;justify-content:space-between;align-items:center}
        .mtitle{font-size:16px;font-weight:700}.mclose{background:none;border:none;font-size:22px;cursor:pointer;color:#9B93A8}
        .mbody{padding:24px;overflow-y:auto;flex:1}.mfooter{padding:16px 24px;border-top:1px solid #F0ECF4;display:flex;justify-content:flex-end;gap:8px}
        .fg{margin-bottom:16px}.fl{font-size:12px;font-weight:500;color:#6B6080;display:block;margin-bottom:6px}.ferr{font-size:11px;color:#EF4444;margin-top:4px}
        .fi{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 12px;height:40px;outline:none;background:#fff;color:#1A1025;width:100%;box-sizing:border-box}
        .fi:focus{border-color:#E91E63!important;box-shadow:0 0 0 3px rgba(233,30,99,.08)}
        .fs{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 10px;height:40px;outline:none;background:#fff;cursor:pointer;appearance:auto}
        .role-cards{display:flex;flex-direction:column;gap:8px}
        .role-card{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;cursor:pointer;transition:all .15s}
        .dept-btns{display:flex;gap:8px;flex-wrap:wrap}.dept-btn{font-family:'Poppins',sans-serif;font-size:12px;font-weight:600;padding:8px 16px;border-radius:8px;cursor:pointer}
        .access-preview{background:#F9F8FB;border-radius:10px;padding:14px 16px;border:1px solid #F0ECF4}
        .section-label{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em}
        .search-wrap{position:relative;flex:1 1 200px;min-width:160px}.search-icon{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#B0A8BC;display:flex}
        .btn-primary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E91E63;color:#fff;cursor:pointer}
        .btn-secondary{font-family:'Poppins',sans-serif;font-size:13px;font-weight:500;padding:9px 20px;border-radius:8px;border:1px solid #E8E4ED;background:#F5F3F7;color:#1A1025;cursor:pointer}
        .btn-disabled{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 24px;border-radius:8px;border:none;background:#E8E4ED;color:#9B93A8;cursor:not-allowed}
        .btn-header{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 20px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;gap:6px}
        .btn-sm{font-size:11px;font-weight:500;padding:5px 12px;border-radius:6px;border:1px solid #E8E4ED;background:#fff;color:#6B6080;cursor:pointer;font-family:'Poppins',sans-serif}
        .btn-danger-sm{font-size:12px;font-weight:500;padding:6px 14px;border-radius:8px;border:1px solid rgba(239,68,68,.25);background:rgba(239,68,68,.04);color:#EF4444;cursor:pointer;font-family:'Poppins',sans-serif}
        .btn-success-sm{font-size:12px;font-weight:500;padding:6px 14px;border-radius:8px;border:1px solid rgba(16,185,129,.25);background:rgba(16,185,129,.04);color:#10B981;cursor:pointer;font-family:'Poppins',sans-serif}
        table.ref{width:100%;border-collapse:collapse;font-size:13px}
        table.ref th{text-align:left;padding:10px 14px;font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;border-bottom:1px solid #F3F1F6;background:#F9F8FB}
        table.ref td{padding:10px 14px;border-bottom:1px solid #F3F1F6}
        .text-body{font-size:13px}.text-sm{font-size:12px}.text-xs{font-size:11px}.text-muted{color:#9B93A8}.text-secondary{color:#6B6080}.text-green{color:#10B981}.text-red{color:#EF4444}.text-amber{color:#F59E0B}.fw500{font-weight:500}.fw600{font-weight:600}
        .toast{position:fixed;bottom:24px;right:24px;z-index:200;background:#1A1025;color:#fff;border-radius:10px;padding:12px 20px;font-size:13px;font-weight:500;box-shadow:0 8px 32px rgba(0,0,0,.2);border-left:4px solid;animation:slideUp .3s;display:flex;align-items:center;gap:8px}
        button:hover{filter:brightness(.97)}
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes slideUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      `}</style>

      <div className="page">
        <div className="header"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><div><div style={{fontSize:20,fontWeight:700}}>Settings</div><div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>User Management</div></div><button className="btn-header" onClick={()=>setAddModal(true)}><span style={{fontSize:16}}>+</span> Tambah User</button></div></div>
        <div className="content">
          <div className="sum-grid">
            {[{l:"Jumlah Aktif",v:ac,s:`${users.length} total`,c:"#E91E63"},{l:"BOD",v:bc,s:"Full access",c:ROLE.bod.c},{l:"Dept Head",v:dc,s:"Dept access",c:ROLE.dept_head.c},{l:"Staff",v:sc,s:"Limited",c:ROLE.staff.c}].map((card,i)=>(<div key={i} className="sum-card" style={{borderLeftColor:card.c}}><div className="section-label">{card.l}</div><div style={{fontSize:24,fontWeight:700,marginTop:4}}>{card.v}</div><div className="text-xs text-secondary" style={{marginTop:2}}>{card.s}</div></div>))}
          </div>
          <div className="card filter-bar">
            <div className="search-wrap"><span className="search-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span><input className="fi" style={{paddingLeft:36}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau email..."/></div>
            <select className="fs" style={{width:140}} value={fRole} onChange={e=>setFRole(e.target.value)}><option value="all">Semua Role</option>{Object.entries(ROLE).map(([k,v])=><option key={k} value={k}>{v.l}</option>)}</select>
            <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#6B6080",cursor:"pointer"}}><input type="checkbox" checked={showInactive} onChange={e=>setShowInactive(e.target.checked)} style={{accentColor:"#E91E63"}}/>Tunjuk tidak aktif</label>
          </div>
          <div className="card" style={{overflow:"hidden"}}>
            <div className="tbl-h">{["","Nama","Email","Role","Department","Status",""].map((h,i)=><div key={i} className="tbl-hc">{h}</div>)}</div>
            {filtered.length===0?<div style={{padding:"48px 20px",textAlign:"center",color:"#9B93A8",fontSize:13}}>Tiada user.</div>:filtered.map(u=>(
              <div key={u.id} className="tbl-r" style={{opacity:u.active?1:.55}}>
                <div className="tbl-c"><Av name={u.name}/></div>
                <div className="tbl-c"><div className="text-body fw600">{u.name}</div><div className="text-xs text-muted">Sejak {formatDate(u.created_at)}</div></div>
                <div className="tbl-c text-body text-secondary">{u.email}</div>
                <div className="tbl-c"><RBadge r={u.role}/></div>
                <div className="tbl-c">{u.visible_departments?.length>0?u.visible_departments.map(d=><DTag key={d} d={d}/>):<DTag d={u.department}/>}</div>
                <div className="tbl-c text-sm" style={{color:u.active?"#10B981":"#EF4444"}}><span className="dot" style={{background:u.active?"#10B981":"#EF4444"}}/>{u.active?"Aktif":"Tidak aktif"}</div>
                <div className="tbl-c" style={{display:"flex",gap:6}}>
                  <button className="btn-sm" onClick={()=>setEditUser(u)}>Edit</button>
                  {u.active?<button className="btn-danger-sm" onClick={()=>handleToggle(u)}>Nyahaktif</button>:<button className="btn-success-sm" onClick={()=>handleToggle(u)}>Aktifkan</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="text-sm text-muted" style={{marginTop:12}}>{filtered.length} user</div>

          <div className="card" style={{marginTop:24,padding:"20px 24px"}}><div style={{fontSize:14,fontWeight:700,marginBottom:16}}>Rujukan Akses</div>
            <table className="ref"><thead><tr><th>Keupayaan</th>{Object.entries(ROLE).map(([k,v])=><th key={k} style={{textAlign:"center",color:v.c,fontWeight:600}}>{v.l}</th>)}</tr></thead><tbody>
              {caps.map(([cap,b,d,s],i)=><tr key={i}><td>{cap}</td><td style={{textAlign:"center"}}>{b?<span className="text-green">✓</span>:<span style={{color:"#E8E4ED"}}>—</span>}</td><td style={{textAlign:"center"}}>{d?<span className="text-green">✓</span>:<span style={{color:"#E8E4ED"}}>—</span>}</td><td style={{textAlign:"center"}}>{s?<span className="text-green">✓</span>:<span style={{color:"#E8E4ED"}}>—</span>}</td></tr>)}
            </tbody></table>
          </div>

          {/* Reset All Data — Dev Phase */}
          <div className="card" style={{marginTop:24,padding:"20px 24px",borderLeft:"4px solid #EF4444"}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'#EF4444'}}>Reset Semua Data</div>
                <div className="text-sm text-secondary" style={{marginTop:4}}>Padam semua jobs, customers & activity logs. Users kekal. Dev phase sahaja.</div>
              </div>
              <button className="btn-danger-sm" style={{padding:'9px 20px',fontSize:13}} onClick={()=>setResetModal(true)}>Reset Data</button>
            </div>
          </div>
        </div>

        {addModal&&<UserModal onSave={d=>{addUser({...d,id:crypto.randomUUID(),active:true,created_at:new Date().toISOString()});setAddModal(false);setToast({msg:`${d.name} ditambah sebagai ${ROLE[d.role]?.l}.`,type:"success"})}} onClose={()=>setAddModal(false)}/>}
        {editUser&&<UserModal user={editUser} onSave={d=>{updateUser(d.id,d);setEditUser(null);setToast({msg:`${d.name} dikemaskini.`,type:"success"})}} onClose={()=>setEditUser(null)}/>}
        {confirm&&<ConfirmModal {...confirm} onClose={()=>setConfirm(null)}/>}
        {resetModal&&<Modal w={420} onClose={()=>{setResetModal(false);setResetInput('')}}>
          <div style={{padding:"24px"}}>
            <div className="mtitle" style={{color:'#EF4444'}}>⚠️ Reset Semua Data</div>
            <p className="text-body text-secondary" style={{marginTop:8,lineHeight:1.6}}>Ini akan padam semua jobs, customers, dan activity logs. Users akan kekal. Tindakan ini tidak boleh diundo.</p>
            <div style={{marginTop:16}}>
              <label className="fl">Taip &quot;RESET&quot; untuk sahkan</label>
              <input className="fi" value={resetInput} onChange={e=>setResetInput(e.target.value)} placeholder="RESET" style={{borderColor:resetInput==='RESET'?'#EF4444':'#E8E4ED'}}/>
            </div>
          </div>
          <div className="mfooter">
            <button className="btn-secondary" onClick={()=>{setResetModal(false);setResetInput('')}}>Batal</button>
            <button className="btn-primary" style={{background:resetInput==='RESET'?'#EF4444':'#E8E4ED',color:resetInput==='RESET'?'#fff':'#9B93A8',cursor:resetInput==='RESET'?'pointer':'not-allowed'}} onClick={()=>{if(resetInput==='RESET'){resetAll();setResetModal(false);setResetInput('');setToast({msg:'Semua data telah direset.',type:'danger'})}}}>Reset Semua</button>
          </div>
        </Modal>}
        {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
      </div>
    </>
  );
}
