'use client'
import { useDashboard, useData } from '@/lib/hooks'
import { DEPT, STATUS, formatRM, daysUntil } from '@/lib/constants'
import { PageHeader, Card, StatusBadge, DeptTag, JobId, DeadlineBadge } from '@/components/ui/kretivco'

function StatCard({ icon, label, value, sub, color }) {
  return <div style={{ background:'#fff', borderRadius:12, padding:'20px 24px', boxShadow:'0 1px 3px rgba(0,0,0,.06)', borderLeft:`4px solid ${color}` }}>
    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}><span style={{fontSize:16}}>{icon}</span><span style={{ fontSize:11, fontWeight:500, color:'#9B93A8', textTransform:'uppercase', letterSpacing:'.02em' }}>{label}</span></div>
    <div style={{ fontSize:28, fontWeight:700, lineHeight:1.1 }}>{value}</div>
    {sub && <div style={{ fontSize:12, color:'#6B6080', marginTop:4 }}>{sub}</div>}
  </div>
}

export default function Dashboard() {
  const { stats, deptBreakdown, alerts } = useDashboard()
  const { jobs } = useData()
  const today = new Date().toLocaleDateString('ms-MY', { weekday:'long', year:'numeric', month:'long', day:'numeric' })
  const funnelTotal = (stats.potential_jobs||0)+(stats.active_jobs||0)+(stats.ongoing_jobs||0)+(stats.completed_jobs||0)
  const convPct = funnelTotal>0 ? Math.round((stats.completed_jobs||0)/funnelTotal*100) : 0

  return <>
    <PageHeader title="Dashboard" subtitle={`Kretivco Job Management · ${today}`}>
      <span style={{ fontSize:12, fontWeight:500, background:'rgba(255,255,255,.2)', borderRadius:20, padding:'6px 16px' }}>BOD View</span>
    </PageHeader>
    <div style={{ padding:24, maxWidth:1200, margin:'0 auto' }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:16, marginBottom:24 }}>
        <StatCard icon="💼" label="Jumlah Job" value={stats.total_jobs||0} sub={`${stats.completed_jobs||0} selesai`} color="#E91E63" />
        <StatCard icon="⚡" label="Active" value={stats.active_jobs||0} sub="Sedang dijalankan" color="#10B981" />
        <StatCard icon="🔄" label="Ongoing" value={stats.ongoing_jobs||0} sub="Dalam proses" color="#F59E0B" />
        <StatCard icon="🎯" label="Potential" value={stats.potential_jobs||0} sub={formatRM(stats.potential_value)} color="#6366F1" />
      </div>
      <div style={{ display:'flex', gap:16, marginBottom:24, flexWrap:'wrap' }}>
        {[{l:'Pipeline Value',v:formatRM(stats.pipeline_value),s:'Active + Ongoing',c:'#E91E63'},{l:'Potential Value',v:formatRM(stats.potential_value),s:'Belum confirm',c:'#6366F1'},{l:'Actual Revenue',v:formatRM(stats.actual_revenue),s:`${stats.completed_jobs||0} job selesai`,c:'#10B981'}].map((c,i)=>
          <Card key={i} style={{ flex:'1 1 0', minWidth:180, padding:'20px 24px' }}>
            <div style={{ fontSize:11, fontWeight:500, color:'#9B93A8', textTransform:'uppercase', letterSpacing:'.02em', marginBottom:8 }}>{c.l}</div>
            <div style={{ fontSize:24, fontWeight:700, color:c.c }}>{c.v}</div>
            <div style={{ fontSize:12, color:'#6B6080', marginTop:4 }}>{c.s}</div>
          </Card>
        )}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:24 }}>
        <Card style={{ padding:'20px 24px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <span style={{color:'#EF4444'}}>⚠</span><span style={{fontSize:16,fontWeight:700}}>Perlu Perhatian</span>
            {alerts.length>0 && <span style={{ fontSize:11, fontWeight:600, color:'#fff', background:'#EF4444', borderRadius:20, padding:'2px 10px' }}>{alerts.length}</span>}
          </div>
          {alerts.length===0 ? <div style={{padding:'32px 16px',textAlign:'center',color:'#9B93A8',fontSize:13}}>Tiada job hampir deadline. Syabas!</div> :
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {alerts.slice(0,5).map(j => { const d=daysUntil(j.deadline); const over=d<0; return (
                <div key={j.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderLeft:`4px solid ${over?'#EF4444':'#F59E0B'}`, background:over?'#EF444408':'#F59E0B08', borderRadius:8 }}>
                  <div style={{ flex:1 }}><div style={{display:'flex',alignItems:'center',gap:8}}><JobId>{j.job_id}</JobId><DeptTag dept={j.department}/></div><div style={{fontSize:13,marginTop:2}}>{j.customer_name}</div></div>
                  <div style={{ textAlign:'right', fontSize:13, fontWeight:600, color:over?'#EF4444':'#F59E0B' }}>{over?`${Math.abs(d)} hari overdue`:`${d} hari lagi`}</div>
                </div>
              )})}
            </div>
          }
        </Card>
        <Card style={{ padding:'20px 24px' }}>
          <div style={{fontSize:16,fontWeight:700,marginBottom:16}}>Job by Department</div>
          {(() => {
            const deptCounts = Object.keys(DEPT).map(k => {
              const count = jobs.filter(j => j.department === k && !j.archived && j.status !== 'cancelled').length
              return { key: k, ...DEPT[k], count }
            })
            const total = deptCounts.reduce((s, d) => s + d.count, 0)
            if (total === 0) return <div style={{padding:'32px 16px',textAlign:'center',color:'#9B93A8',fontSize:13}}>Tiada job untuk dipaparkan.</div>
            const r = 80, cx = 100, cy = 100, stroke = 32
            const circumference = 2 * Math.PI * r
            let accumulated = 0
            return (
              <div style={{ display:'flex', alignItems:'center', gap:24, justifyContent:'center' }}>
                <svg width={200} height={200} viewBox="0 0 200 200" style={{ flexShrink:0 }}>
                  {deptCounts.map(d => {
                    if (d.count === 0) return null
                    const pct = d.count / total
                    const dashLen = pct * circumference
                    const dashOff = -accumulated * circumference
                    accumulated += pct
                    return <circle key={d.key} cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={stroke}
                      strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeDashoffset={dashOff}
                      style={{ transform:'rotate(-90deg)', transformOrigin:'center', transition:'stroke-dasharray .5s, stroke-dashoffset .5s' }} />
                  })}
                  <text x={cx} y={cy-6} textAnchor="middle" style={{fontSize:24,fontWeight:700,fill:'#1A1025'}}>{total}</text>
                  <text x={cx} y={cy+12} textAnchor="middle" style={{fontSize:11,fill:'#9B93A8'}}>Jobs</text>
                </svg>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {deptCounts.map(d => (
                    <div key={d.key} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:d.color, flexShrink:0 }} />
                      <span style={{ fontSize:13, fontWeight:600, color:d.color, minWidth:100 }}>{d.label}</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'#1A1025' }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}
        </Card>
      </div>
      <Card style={{ padding:'20px 24px' }}>
        <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>Conversion Funnel</div>
        <p style={{fontSize:12,color:'#6B6080',marginBottom:20}}>Potential → Active → Ongoing → Completed</p>
        <div style={{ display:'flex', alignItems:'center' }}>
          {[{l:'Potential',n:stats.potential_jobs||0,v:formatRM(stats.potential_value),c:'#6366F1'},{l:'Active',n:stats.active_jobs||0,v:formatRM(stats.pipeline_value),c:'#10B981'},{l:'Ongoing',n:stats.ongoing_jobs||0,v:'',c:'#F59E0B'},{l:'Selesai',n:stats.completed_jobs||0,v:formatRM(stats.actual_revenue),c:'#6B7280',last:true}].map((s,i) =>
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6, flex:1 }}>
              <div style={{ textAlign:'center', flex:1, padding:'14px 8px', background:s.c+'10', borderRadius:10, border:`1px solid ${s.c}25` }}>
                <div style={{ fontSize:11, fontWeight:500, color:s.c, textTransform:'uppercase', letterSpacing:'.02em' }}>{s.l}</div>
                <div style={{ fontSize:22, fontWeight:700, color:'#1A1025', marginTop:4 }}>{s.n}</div>
                <div style={{ fontSize:11, color:'#6B6080', marginTop:2 }}>{s.v}</div>
                {s.last && <div style={{fontSize:10,color:'#9B93A8',marginTop:4}}>{convPct}% conversion</div>}
              </div>
              {!s.last && <div style={{color:'#D4CDE0',fontSize:16,flexShrink:0}}>›</div>}
            </div>
          )}
        </div>
      </Card>
    </div>
  </>
}
