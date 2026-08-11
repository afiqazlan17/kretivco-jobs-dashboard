"use client"
import { useState, useMemo } from "react";
import * as XLSX from "xlsx";
import { useAuth, useData, useVisibleDepts } from '@/lib/hooks';
import { DEPT, STATUS, MONTHS, customerDisplayName, formatRM, formatRMShort, formatDate } from '@/lib/constants';

export default function Reports(){
  const { profile } = useAuth() || {};
  const { jobs = [], customers = [] } = useData() || {};
  const visDepts = useVisibleDepts();

  const today=new Date();
  const yearStart=`${today.getFullYear()}-01-01`;
  const todayStr=today.toISOString().slice(0,10);
  const[df,setDf]=useState(yearStart);const[dt,setDt]=useState(todayStr);const[fD,setFD]=useState("all");

  const filtered=useMemo(()=>(jobs || []).filter(j=>{
    if(visDepts && !visDepts.includes(j.department))return false;
    if(fD!=="all"&&j.department!==fD)return false;if(df&&j.created_at<df)return false;if(dt&&j.created_at>dt)return false;return true}),[jobs,df,dt,fD,visDepts]);
  const nc=filtered.filter(j=>j.status!=="cancelled");
  const comp=filtered.filter(j=>j.status==="completed");
  const totalJobs=nc.length;
  const totalEst=nc.reduce((s,j)=>s+(j.estimation_value||0),0);
  const totalFinal=comp.reduce((s,j)=>s+(j.final_value||0),0);
  const variance=totalFinal-comp.reduce((s,j)=>s+(j.estimation_value||0),0);

  const deptKeys=Object.keys(DEPT).filter(k=>!visDepts||visDepts.includes(k));
  const monthly=useMemo(()=>{const m={};for(let i=0;i<12;i++){const k=String(i).padStart(2,"0");m[k]={label:MONTHS[i],total:0,est:0,final:0,byD:{}};deptKeys.forEach(d=>m[k].byD[d]={count:0});}nc.forEach(j=>{const k=String(parseInt(j.created_at.substring(5,7))-1).padStart(2,"0");if(!m[k])return;m[k].total++;m[k].est+=j.estimation_value||0;m[k].final+=j.final_value||0;if(m[k].byD[j.department])m[k].byD[j.department].count++;});const from=df?parseInt(df.substring(5,7))-1:0;const to=dt?parseInt(dt.substring(5,7))-1:11;return Object.entries(m).filter(([k])=>{const i=parseInt(k);return i>=from&&i<=to}).map(([,v])=>v)},[nc,df,dt,deptKeys]);

  const deptBr=useMemo(()=>{const m={};deptKeys.forEach(d=>m[d]={count:0,est:0});nc.forEach(j=>{if(m[j.department]){m[j.department].count++;m[j.department].est+=j.estimation_value||0}});return m},[nc,deptKeys]);
  const maxDE=Math.max(...Object.values(deptBr).map(d=>d.est),1);

  const topCust=useMemo(()=>{const m={};nc.forEach(j=>{const custName=j.customer_name||customerDisplayName(customers.find(c=>c.id===j.customer_id))||j.customer_id;if(!m[j.customer_id])m[j.customer_id]={name:custName,count:0,est:0,final:0};m[j.customer_id].count++;m[j.customer_id].est+=j.estimation_value||0;m[j.customer_id].final+=j.final_value||0});return Object.entries(m).sort((a,b)=>b[1].est-a[1].est).slice(0,5)},[nc,customers]);
  const picBr=useMemo(()=>{const m={};nc.forEach(j=>{if(!m[j.pic])m[j.pic]={count:0,est:0,comp:0,final:0};m[j.pic].count++;m[j.pic].est+=j.estimation_value||0;if(j.status==="completed"){m[j.pic].comp++;m[j.pic].final+=j.final_value||0}});return Object.entries(m).sort((a,b)=>b[1].count-a[1].count)},[nc]);

  const funnel={pot:filtered.filter(j=>j.status==="potential").length,prog:filtered.filter(j=>j.status==="in_progress").length,comp:comp.length};
  const fTotal=funnel.pot+funnel.prog+funnel.comp;
  const convPct=fTotal>0?Math.round(funnel.comp/fTotal*100):0;

  const handleExport=()=>{const wb=XLSX.utils.book_new();const s1=XLSX.utils.aoa_to_sheet([["Kretivco Report"],[],[`${df} — ${dt}`],[],["Metric","Value"],["Total Jobs",totalJobs],["Estimate",totalEst],["Final",totalFinal],["Variance",variance]]);XLSX.utils.book_append_sheet(wb,s1,"Summary");const s2=XLSX.utils.aoa_to_sheet([["Month","Jobs","Est","Final",...deptKeys.map(d=>DEPT[d].code)],...monthly.map(m=>[m.label,m.total,m.est,m.final,...deptKeys.map(d=>m.byD[d]?.count||0)])]);XLSX.utils.book_append_sheet(wb,s2,"Monthly");const s3=XLSX.utils.aoa_to_sheet([["Job ID","Customer","Dept","Type","Status","Est","Final","PIC"],...filtered.map(j=>[j.job_id,j.customer_name||customerDisplayName(customers.find(c=>c.id===j.customer_id))||j.customer_id,DEPT[j.department]?.label,j.job_type,STATUS[j.status]?.label,j.estimation_value,j.final_value,j.pic])]);XLSX.utils.book_append_sheet(wb,s3,"Jobs");XLSX.writeFile(wb,`Kretivco_Report_${df}_${dt}.xlsx`)};

  return(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}:root{font-family:'Poppins',sans-serif}
        .page{background:#F5F3F7;min-height:100vh;color:#1A1025}.header{background:linear-gradient(135deg,#E91E63,#AD1457);padding:24px 32px;color:#fff}
        .content{padding:24px}
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
        <div className="header"><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><div><div style={{fontSize:20,fontWeight:700}}>Reports</div><div style={{fontSize:12,color:"rgba(255,255,255,.6)",marginTop:2}}>Analysis & Export</div></div><button className="btn-export" onClick={handleExport}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export Excel</button></div></div>
        <div className="content">
          <div className="card filter-bar" style={{marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}><label className="text-sm fw500 text-secondary">From</label><input type="date" className="fi" style={{width:150}} value={df} onChange={e=>setDf(e.target.value)}/></div>
            <div style={{display:"flex",alignItems:"center",gap:6}}><label className="text-sm fw500 text-secondary">To</label><input type="date" className="fi" style={{width:150}} value={dt} onChange={e=>setDt(e.target.value)}/></div>
            {(!visDepts || visDepts.length > 1) ? (
              <select className="fs" style={{width:160}} value={fD} onChange={e=>setFD(e.target.value)}><option value="all">All Departments</option>{Object.entries(DEPT).filter(([k])=>!visDepts||visDepts.includes(k)).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select>
            ) : visDepts?.length === 1 ? (
              <div style={{padding:'0 14px',height:40,display:'flex',alignItems:'center',fontSize:13,fontWeight:600,color:DEPT[visDepts[0]]?.color||'#1A1025',background:(DEPT[visDepts[0]]?.color||'#6B7280')+'12',borderRadius:8}}>{DEPT[visDepts[0]]?.label||visDepts[0]}</div>
            ) : null}
            <div style={{flex:1}}/><span className="text-sm text-muted">{filtered.length} jobs</span>
          </div>

          <div className="sum-grid">
            {[{l:"Total Jobs",v:totalJobs,s:`${comp.length} completed`,c:"#E91E63"},{l:"Estimate",v:formatRM(totalEst),s:"estimation",c:"#3A86FF"},{l:"Final (Completed)",v:formatRM(totalFinal),s:`${comp.length} jobs`,c:"#10B981"},{l:"Variance",v:(variance>=0?"+":"")+formatRM(variance),s:variance>=0?"Over":"Under",c:variance>=0?"#10B981":"#EF4444"}].map((c,i)=>(
              <div key={i} className="sum-card" style={{borderLeftColor:c.c}}><div className="section-label">{c.l}</div><div style={{fontSize:24,fontWeight:700,color:i===3?c.c:"#1A1025",marginTop:6}}>{c.v}</div><div className="text-sm text-secondary" style={{marginTop:2}}>{c.s}</div></div>
            ))}
          </div>

          <div className="g2">
            <div className="card"><div className="card-title">Department Breakdown</div><div className="section-label" style={{marginBottom:16}}>By estimation value</div>
              {Object.entries(deptBr).map(([d,data])=><div key={d} className="bar-row"><div className="bar-label" style={{color:DEPT[d].color}}>{DEPT[d].code}</div><div className="bar-track"><div className="bar-fill" style={{width:`${Math.max(data.est/maxDE*100,data.est>0?5:0)}%`,backgroundColor:DEPT[d].color}}>{data.est/maxDE*100>15&&<span className="bar-count">{formatRMShort(data.est)}</span>}</div></div></div>)}
            </div>
            <div className="card"><div className="card-title">Conversion Funnel</div><div className="section-label" style={{marginBottom:16}}>Potential → Completed</div>
              <div className="funnel-row">
                {[{l:"Potential",n:funnel.pot,v:formatRMShort(filtered.filter(j=>j.status==="potential").reduce((s,j)=>s+(j.estimation_value||0),0)),c:"#6366F1"},{l:"In Progress",n:funnel.prog,v:formatRMShort(filtered.filter(j=>j.status==="in_progress").reduce((s,j)=>s+(j.estimation_value||0),0)),c:"#3A86FF"},{l:"Completed",n:funnel.comp,v:formatRM(totalFinal),c:"#6B7280",last:true}].map((s,i)=>(
                  <div key={i} className="funnel-step"><div className="funnel-box" style={{backgroundColor:s.c+"10",borderColor:s.c+"25"}}><div className="funnel-lbl" style={{color:s.c}}>{s.l}</div><div className="funnel-val">{s.n}</div><div className="funnel-sub">{s.v}</div>{s.last&&<div className="funnel-pct">{convPct}% conversion</div>}</div>{!s.last&&<div className="funnel-arrow">›</div>}</div>
                ))}
              </div>
            </div>
          </div>

          <div className="card"><div className="card-title" style={{marginBottom:16}}>Monthly Breakdown</div>
            <div style={{overflowX:"auto"}}><table><thead><tr><th style={{textAlign:"left"}}>Month</th><th style={{textAlign:"center"}}>Jobs</th><th style={{textAlign:"right"}}>Estimate</th><th style={{textAlign:"right"}}>Final</th>{deptKeys.map(k=><th key={k} style={{textAlign:"center",color:DEPT[k].color,fontWeight:600}}>{DEPT[k].code}</th>)}</tr></thead><tbody>
              {monthly.map((m,i)=><tr key={i}><td className="fw600">{m.label}</td><td style={{textAlign:"center"}}>{m.total||<span className="text-muted">—</span>}</td><td style={{textAlign:"right"}} className="fw500">{m.est?formatRM(m.est):<span className="text-muted">—</span>}</td><td style={{textAlign:"right",color:m.final?"#10B981":"#D4CDE0"}} className="fw500">{m.final?formatRM(m.final):"—"}</td>{deptKeys.map(d=><td key={d} style={{textAlign:"center"}}>{m.byD[d]?.count>0?<span style={{color:DEPT[d].color,fontWeight:600}}>{m.byD[d].count}</span>:<span style={{color:"#E8E4ED"}}>—</span>}</td>)}</tr>)}
              <tr className="tr-total"><td>Total</td><td style={{textAlign:"center"}}>{totalJobs}</td><td style={{textAlign:"right"}}>{formatRM(totalEst)}</td><td style={{textAlign:"right",color:"#10B981"}}>{formatRM(totalFinal)}</td>{deptKeys.map(d=><td key={d} style={{textAlign:"center",color:DEPT[d].color}}>{deptBr[d]?.count||0}</td>)}</tr>
            </tbody></table></div>
          </div>

          <div className="g2">
            <div className="card"><div className="card-title" style={{marginBottom:16}}>Top 5 Customers</div><div className="rank-list">{topCust.map(([id,d],i)=><div key={id} className="rank-row"><div className="rank-num">{i+1}</div><div style={{flex:1,minWidth:0}}><div className="text-body fw500" style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{d.name}</div><div className="text-xs text-muted">{d.count} jobs</div></div><div style={{textAlign:"right"}}><div className="text-body fw600">{formatRM(d.est)}</div>{d.final>0&&<div className="text-xs" style={{color:"#10B981"}}>{formatRM(d.final)} completed</div>}</div></div>)}</div></div>
            <div className="card"><div className="card-title" style={{marginBottom:16}}>PIC Performance</div><div className="rank-list">{picBr.map(([name,d],i)=><div key={name} className="rank-row"><div className="rank-num" style={{background:"rgba(58,134,255,.12)",color:"#3A86FF"}}>{name.charAt(0)}</div><div style={{flex:1}}><div className="text-body fw600">{name}</div><div className="text-xs text-muted">{d.count} jobs · {d.comp} completed</div></div><div style={{textAlign:"right"}}><div className="text-body fw600">{formatRM(d.est)}</div>{d.final>0&&<div className="text-xs" style={{color:"#10B981"}}>{formatRM(d.final)}</div>}</div></div>)}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
