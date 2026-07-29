"use client"
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useAuth } from '@/lib/hooks';

const CUSTOMERS={"KCO-001":"CIDB Malaysia","KCO-002":"PETRONAS","KCO-004":"FinasXperts","KCO-007":"Undangan.my","KCO-009":"Tuflong","KCO-010":"PLANMalaysia","KCO-011":"GlamBooth.my","KCO-012":"SPRM","KCO-013":"Borneo","KCO-014":"MBI Selangor"};
const ALL_JOBS=[
  {id:"KP-2026-001",cid:"KCO-010",dept:"print",type:"Banner Printing",status:"completed",est:4500,final:4800,pic:"Amirul",cat:"2026-01-10"},
  {id:"KW-2026-001",cid:"KCO-011",dept:"work",type:"Logo Design",status:"completed",est:3000,final:3000,pic:"Multazam",cat:"2026-01-15"},
  {id:"KP-2026-002",cid:"KCO-002",dept:"print",type:"ID Card",status:"completed",est:3500,final:3800,pic:"Amirul",cat:"2026-02-05"},
  {id:"KT-2026-001",cid:"KCO-013",dept:"tech",type:"Mobile App",status:"cancelled",est:28000,final:null,pic:"Amnan",cat:"2026-02-15"},
  {id:"KW-2026-002",cid:"KCO-007",dept:"work",type:"Social Media Kit",status:"completed",est:4000,final:4000,pic:"Multazam",cat:"2026-03-01"},
  {id:"KP-2026-003",cid:"KCO-001",dept:"print",type:"Poster A1",status:"completed",est:2200,final:2200,pic:"Amirul",cat:"2026-03-10"},
  {id:"KP-2026-004",cid:"KCO-010",dept:"print",type:"Booklet",status:"completed",est:6800,final:7200,pic:"Amirul",cat:"2026-04-20"},
  {id:"KW-2026-003",cid:"KCO-011",dept:"work",type:"Logo & Branding",status:"completed",est:5000,final:5000,pic:"Multazam",cat:"2026-04-01"},
  {id:"KT-2026-002",cid:"KCO-007",dept:"tech",type:"Platform Enhancement",status:"ongoing",est:20000,final:null,pic:"Amnan",cat:"2026-05-20"},
  {id:"KW-2026-004",cid:"KCO-004",dept:"work",type:"Brand Identity",status:"active",est:15000,final:null,pic:"Multazam",cat:"2026-06-10"},
  {id:"KP-2026-005",cid:"KCO-001",dept:"print",type:"Large Format",status:"active",est:12500,final:null,pic:"Amirul",cat:"2026-06-28"},
  {id:"KP-2026-006",cid:"KCO-002",dept:"print",type:"Corporate Gift",status:"ongoing",est:8700,final:null,pic:"Amirul",cat:"2026-07-05"},
  {id:"KT-2026-003",cid:"KCO-007",dept:"tech",type:"Booking System",status:"active",est:35000,final:null,pic:"Amnan",cat:"2026-07-10"},
  {id:"KM-2026-001",cid:"KCO-009",dept:"machine",type:"Mesin Industri",status:"potential",est:45000,final:null,pic:"Tarzan",cat:"2026-07-15"},
  {id:"KW-2026-005",cid:"KCO-014",dept:"work",type:"Annual Report",status:"active",est:12000,final:null,pic:"Afiq",cat:"2026-07-15"},
  {id:"KP-2026-007",cid:"KCO-012",dept:"print",type:"Bunting",status:"active",est:9200,final:null,pic:"Amirul",cat:"2026-07-18"},
];
const DEPT={print:{code:"KP",label:"KretivPrint",color:"#E85D04"},work:{code:"KW",label:"KretivWork",color:"#7209B7"},tech:{code:"KT",label:"KretivTech",color:"#3A86FF"},machine:{code:"KM",label:"KretivMachine",color:"#6B7280"}};
const STATUS={potential:{l:"Potential",c:"#6366F1"},active:{l:"Active",c:"#10B981"},ongoing:{l:"Ongoing",c:"#F59E0B"},completed:{l:"Completed",c:"#6B7280"},cancelled:{l:"Cancelled",c:"#EF4444"}};
const MONTHS=["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ogo","Sep","Okt","Nov","Dis"];
const formatRM=v=>v!=null?`RM ${Number(v).toLocaleString("en-MY")}`:"—";
const formatRMs=v=>{if(v==null)return"—";return v>=1000?`RM ${(v/1000).toFixed(v%1000===0?0:1)}k`:`RM ${v}`};

export default function Reports(){
  const { profile } = useAuth() || {};
  const isBod = profile?.role === 'bod';
  const userDept = profile?.department || null;

  const[df,setDf]=useState("2026-01-01");const[dt,setDt]=useState("2026-07-31");const[fD,setFD]=useState(isBod ? "all" : (userDept || "all"));

  const filtered=useMemo(()=>ALL_JOBS.filter(j=>{
    // Non-BOD: force filter to user's department
    const deptFilter = isBod ? fD : (userDept || fD);
    if(deptFilter!=="all"&&j.dept!==deptFilter)return false;if(df&&j.cat<df)return false;if(dt&&j.cat>dt)return false;return true}),[df,dt,fD,isBod,userDept]);
  const nc=filtered.filter(j=>j.status!=="cancelled");
  const comp=filtered.filter(j=>j.status==="completed");
  const totalJobs=nc.length;
  const totalEst=nc.reduce((s,j)=>s+(j.est||0),0);
  const totalFinal=comp.reduce((s,j)=>s+(j.final||0),0);
  const variance=totalFinal-comp.reduce((s,j)=>s+(j.est||0),0);

  const monthly=useMemo(()=>{const m={};for(let i=0;i<12;i++){const k=String(i).padStart(2,"0");m[k]={label:MONTHS[i],total:0,est:0,final:0,byD:{}};Object.keys(DEPT).forEach(d=>m[k].byD[d]={count:0});}nc.forEach(j=>{const k=String(parseInt(j.cat.substring(5,7))-1).padStart(2,"0");if(!m[k])return;m[k].total++;m[k].est+=j.est||0;m[k].final+=j.final||0;if(m[k].byD[j.dept])m[k].byD[j.dept].count++;});const from=df?parseInt(df.substring(5,7))-1:0;const to=dt?parseInt(dt.substring(5,7))-1:11;return Object.entries(m).filter(([k])=>{const i=parseInt(k);return i>=from&&i<=to}).map(([,v])=>v)},[nc,df,dt]);

  const deptBr=useMemo(()=>{const m={};Object.keys(DEPT).forEach(d=>m[d]={count:0,est:0});nc.forEach(j=>{if(m[j.dept]){m[j.dept].count++;m[j.dept].est+=j.est||0}});return m},[nc]);
  const maxDE=Math.max(...Object.values(deptBr).map(d=>d.est),1);

  const topCust=useMemo(()=>{const m={};nc.forEach(j=>{if(!m[j.cid])m[j.cid]={name:CUSTOMERS[j.cid]||j.cid,count:0,est:0,final:0};m[j.cid].count++;m[j.cid].est+=j.est||0;m[j.cid].final+=j.final||0});return Object.entries(m).sort((a,b)=>b[1].est-a[1].est).slice(0,5)},[nc]);
  const picBr=useMemo(()=>{const m={};nc.forEach(j=>{if(!m[j.pic])m[j.pic]={count:0,est:0,comp:0,final:0};m[j.pic].count++;m[j.pic].est+=j.est||0;if(j.status==="completed"){m[j.pic].comp++;m[j.pic].final+=j.final||0}});return Object.entries(m).sort((a,b)=>b[1].count-a[1].count)},[nc]);

  const funnel={pot:filtered.filter(j=>j.status==="potential").length,act:filtered.filter(j=>j.status==="active").length,ong:filtered.filter(j=>j.status==="ongoing").length,comp:comp.length};
  const fTotal=funnel.pot+funnel.act+funnel.ong+funnel.comp;
  const convPct=fTotal>0?Math.round(funnel.comp/fTotal*100):0;

  const handleExport=()=>{const wb=XLSX.utils.book_new();const s1=XLSX.utils.aoa_to_sheet([["Kretivco Report"],[],[`${df} — ${dt}`],[],["Metrik","Nilai"],["Jumlah Job",totalJobs],["Anggaran",totalEst],["Final",totalFinal],["Varian",variance]]);XLSX.utils.book_append_sheet(wb,s1,"Summary");const s2=XLSX.utils.aoa_to_sheet([["Bulan","Jobs","Est","Final",...Object.values(DEPT).map(d=>d.code)],...monthly.map(m=>[m.label,m.total,m.est,m.final,...Object.keys(DEPT).map(d=>m.byD[d].count)])]);XLSX.utils.book_append_sheet(wb,s2,"Monthly");const s3=XLSX.utils.aoa_to_sheet([["Job ID","Customer","Dept","Type","Status","Est","Final","PIC"],...filtered.map(j=>[j.id,CUSTOMERS[j.cid]||j.cid,DEPT[j.dept]?.label,j.type,STATUS[j.status]?.l,j.est,j.final,j.pic])]);XLSX.utils.book_append_sheet(wb,s3,"Jobs");XLSX.writeFile(wb,`Kretivco_Report_${df}_${dt}.xlsx`)};

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px;max-width:1200px;margin:0 auto}
        .card{background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.06);padding:20px 24px;margin-bottom:24px}
        .filter-bar{padding:16px 20px;display:flex;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:20px}
        .fi{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 12px;height:40px;outline:none;background:#fff;color:#1A1025;box-sizing:border-box}
        .fi:focus{border-color:#E91E63!important}.fs{font-family:'Poppins',sans-serif;font-size:13px;border:1px solid #E8E4ED;border-radius:8px;padding:0 10px;height:40px;outline:none;background:#fff;cursor:pointer;appearance:auto}
        .sum-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:24px}
        .sum-card{background:#fff;border-radius:12px;padding:18px 22px;box-shadow:0 1px 3px rgba(0,0,0,.06);border-left:4px solid}
        .g2{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
        .section-label{font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em}
        .card-title{font-size:14px;font-weight:700;margin-bottom:4px}
        .bar-row{display:flex;align-items:center;gap:12px;margin-bottom:10px}
        .bar-label{width:36px;font-size:12px;font-weight:600;text-align:right;flex-shrink:0}
        .bar-track{flex:1;height:28px;background:#F5F3F7;border-radius:6px;overflow:hidden}
        .bar-fill{height:100%;border-radius:6px;transition:width .5s;display:flex;align-items:center;justify-content:flex-end;padding-right:10px}
        .bar-count{font-size:11px;font-weight:600;color:#fff}
        .funnel-row{display:flex;align-items:center;gap:0}
        .funnel-step{display:flex;align-items:center;gap:6px;flex:1}
        .funnel-box{text-align:center;flex:1;padding:14px 8px;border-radius:10px;border:1px solid}
        .funnel-lbl{font-size:11px;font-weight:500;text-transform:uppercase;letter-spacing:.02em}
        .funnel-val{font-size:22px;font-weight:700;color:#1A1025;margin-top:4px}
        .funnel-sub{font-size:11px;color:#6B6080;margin-top:2px}
        .funnel-pct{font-size:10px;color:#9B93A8;margin-top:4px}
        .funnel-arrow{color:#D4CDE0;font-size:16px;flex-shrink:0}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th{text-align:left;padding:10px 12px;font-size:11px;font-weight:500;color:#9B93A8;text-transform:uppercase;letter-spacing:.02em;border-bottom:1px solid #F3F1F6;background:#F9F8FB}
        td{padding:10px 12px;border-bottom:1px solid #F3F1F6}
        tr:hover td{background:#F9F8FB}
        .tr-total td{background:#F9F8FB;font-weight:700}
        .rank-list{display:flex;flex-direction:column}
        .rank-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #F3F1F6}
        .rank-row:last-child{border-bottom:none}
        .rank-num{width:24px;height:24px;border-radius:50%;background:rgba(233,30,99,.12);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#E91E63;flex-shrink:0}
        .btn-export{font-family:'Poppins',sans-serif;font-size:13px;font-weight:600;padding:9px 20px;border-radius:8px;border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.15);color:#fff;cursor:pointer;display:flex;align-items:center;gap:8px}
        .text-body{font-size:13px}.text-sm{font-size:12px}.text-xs{font-size:11px}.text-muted{color:#9B93A8}.text-secondary{color:#6B6080}.fw500{font-weight:500}.fw600{font-weight:600}.fw700{font-weight:700}
        button:hover{filter:brightness(.97)}
        @media(max-width:768px){.g2{grid-template-columns:1fr}}
      `}</style>

      <div className="page">
        <div className="header"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><div><div style={{fontSize:20,fontWeight:700}}>Reports</div><div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>Analisis & Eksport</div></div><button className="btn-export" onClick={handleExport}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export Excel</button></div></div>
        <div className="content">
          <div className="card filter-bar" style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><label className="text-sm fw500 text-secondary">Dari</label><input type="date" className="fi" style={{width:150}} value={df} onChange={e=>setDf(e.target.value)}/></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}><label className="text-sm fw500 text-secondary">Hingga</label><input type="date" className="fi" style={{width:150}} value={dt} onChange={e=>setDt(e.target.value)}/></div>
            {isBod ? (
              <select className="fs" style={{width:160}} value={fD} onChange={e=>setFD(e.target.value)}><option value="all">Semua Dept</option>{Object.entries(DEPT).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
            ) : (
              <div style={{padding:'0 14px',height:40,display:'flex',alignItems:'center',fontSize:13,fontWeight:600,color:DEPT[userDept]?.color||'#1A1025',background:DEPT[userDept]?.color+'12'||'#F5F3F7',borderRadius:8}}>{DEPT[userDept]?.label||userDept}</div>
            )}
            <div style={{flex:1}}/><span className="text-sm text-muted">{filtered.length} job</span>
          </div>

          <div className="sum-grid">
            {[{l:"Jumlah Job",v:totalJobs,s:`${comp.length} selesai`,c:"#E91E63"},{l:"Anggaran",v:formatRM(totalEst),s:"estimation",c:"#3A86FF"},{l:"Final (Selesai)",v:formatRM(totalFinal),s:`${comp.length} job`,c:"#10B981"},{l:"Varian",v:(variance>=0?"+":"")+formatRM(variance),s:variance>=0?"Lebih":"Kurang",c:variance>=0?"#10B981":"#EF4444"}].map((c,i)=>(
              <div key={i} className="sum-card" style={{borderLeftColor:c.c}}><div className="section-label">{c.l}</div><div style={{fontSize:24,fontWeight:700,color:i===3?c.c:"#1A1025",marginTop:6}}>{c.v}</div><div className="text-sm text-secondary" style={{marginTop:2}}>{c.s}</div></div>
            ))}
          </div>

          <div className="g2">
            <div className="card"><div className="card-title">Pecahan Department</div><div className="section-label" style={{marginBottom:16}}>By estimation value</div>
              {Object.entries(deptBr).map(([d,data])=><div key={d} className="bar-row"><div className="bar-label" style={{color:DEPT[d].color}}>{DEPT[d].code}</div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(data.est/maxDE*100,data.est>0?5:0)}%`,backgroundColor:DEPT[d].color}}>{data.est/maxDE*100>15&&<span className="bar-count">{formatRMs(data.est)}</span>}</div></div></div>)}
            </div>
            <div className="card"><div className="card-title">Conversion Funnel</div><div className="section-label" style={{marginBottom:16}}>Potential → Completed</div>
              <div className="funnel-row">
                {[{l:"Potential",n:funnel.pot,v:formatRMs(filtered.filter(j=>j.status==="potential").reduce((s,j)=>s+(j.est||0),0)),c:"#6366F1"},{l:"Active",n:funnel.act,v:formatRMs(filtered.filter(j=>j.status==="active").reduce((s,j)=>s+(j.est||0),0)),c:"#10B981"},{l:"Ongoing",n:funnel.ong,v:formatRMs(filtered.filter(j=>j.status==="ongoing").reduce((s,j)=>s+(j.est||0),0)),c:"#F59E0B"},{l:"Selesai",n:funnel.comp,v:formatRM(totalFinal),c:"#6B7280",last:true}].map((s,i)=>(
                  <div key={i} className="funnel-step"><div className="funnel-box" style={{backgroundColor:s.c+"10",borderColor:s.c+"25"}}><div className="funnel-lbl" style={{color:s.c}}>{s.l}</div><div className="funnel-val">{s.n}</div><div className="funnel-sub">{s.v}</div>{s.last&&<div className="funnel-pct">{convPct}% conversion</div>}</div>{!s.last&&<div className="funnel-arrow">›</div>}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="card"><div className="card-title" style={{marginBottom:16}}>Pecahan Bulanan</div>
            <div style={{overflowX:"auto"}}><table><thead><tr><th style={{textAlign:"left"}}>Bulan</th><th style={{textAlign:"center"}}>Jobs</th><th style={{textAlign:"right"}}>Anggaran</th><th style={{textAlign:"right"}}>Final</th>{Object.entries(DEPT).map(([k,v])=><th key={k} style={{textAlign:"center",color:v.color,fontWeight:600}}>{v.code}</th>)}</tr></thead><tbody>
              {monthly.map((m,i)=><tr key={i}><td className="fw600">{m.label}</td><td style={{textAlign:"center"}}>{m.total||<span className="text-muted">—</span>}</td><td style={{textAlign:"right"}} className="fw500">{m.est?formatRM(m.est):<span className="text-muted">—</span>}</td><td style={{textAlign:"right",color:m.final?"#10B981":"#D4CDE0"}} className="fw500">{m.final?formatRM(m.final):"—"}</td>{Object.keys(DEPT).map(d=><td key={d} style={{textAlign:"center"}}>{m.byD[d].count>0?<span style={{color:DEPT[d].color,fontWeight:600}}>{m.byD[d].count}</span>:<span style={{color:"#E8E4ED"}}>—</span>}</td>)}</tr>)}
              <tr className="tr-total"><td>Jumlah</td><td style={{textAlign:"center"}}>{totalJobs}</td><td style={{textAlign:"right"}}>{formatRM(totalEst)}</td><td style={{textAlign:"right",color:"#10B981"}}>{formatRM(totalFinal)}</td>{Object.keys(DEPT).map(d=><td key={d} style={{textAlign:"center",color:DEPT[d].color}}>{deptBr[d].count}</td>)}</tr>
            </tbody></table></div>
          </div>

          <div className="g2">
            <div className="card"><div className="card-title" style={{marginBottom:16}}>Top 5 Customer</div><div className="rank-list">{topCust.map(([id,d],i)=><div key={id} className="rank-row"><div className="rank-num">{i+1}</div><div style={{flex:1,minWidth:0}}><div className="text-body fw500" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div><div className="text-xs text-muted">{d.count} job</div></div><div style={{textAlign:"right"}}><div className="text-body fw600">{formatRM(d.est)}</div>{d.final>0&&<div className="text-xs" style={{color:"#10B981"}}>{formatRM(d.final)} selesai</div>}</div></div>)}</div></div>
            <div className="card"><div className="card-title" style={{marginBottom:16}}>Prestasi PIC</div><div className="rank-list">{picBr.map(([name,d],i)=><div key={name} className="rank-row"><div className="rank-num" style={{background:"rgba(58,134,255,.12)",color:"#3A86FF"}}>{name.charAt(0)}</div><div style={{flex:1}}><div className="text-body fw600">{name}</div><div className="text-xs text-muted">{d.count} job · {d.comp} selesai</div></div><div style={{textAlign:"right"}}><div className="text-body fw600">{formatRM(d.est)}</div>{d.final>0&&<div className="text-xs" style={{color:"#10B981"}}>{formatRM(d.final)}</div>}</div></div>)}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
