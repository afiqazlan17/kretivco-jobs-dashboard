"use client"
import { DEPT } from '@/lib/constants'
import { useData } from '@/lib/hooks'

const DEPT_INFO = {
  work: {
    lead: 'Afiq Azlan (Interim)',
    services: ['Sooco — Social Media Management', 'Graphic Design', 'Brand Identity', 'Copywriting & Content Strategy'],
    products: [],
    rule: null,
  },
  tech: {
    lead: 'Amnan Syahmi',
    services: ['Website Creation', 'Application Development', 'Sales Page / Landing Page'],
    products: ['Undangan.my — Digital Wedding Invitation', 'Restu.ai — Digital Wedding Planner', 'Wedding Planner by Ila — Notion-based'],
    rule: null,
  },
  print: {
    lead: 'Nurfadilah (Interim)',
    services: ['Large Format — banner, bunting, backdrop', 'Small Format — business card, flyer, brochure, menu card', 'Corporate Gifts & Souvenirs', 'Packaging & Label', 'Digital & Offset Printing'],
    products: [],
    rule: 'Minor edit = KretivPrint handle. Custom design = loop KretivWork.',
  },
  event: {
    lead: 'Afiq Azlan (Interim)',
    services: ['Event Planning & Coordination', 'Vendor Management', 'Event Decoration & Setup', 'Emcee & Stage Performance', 'Corporate Events, Official Functions, Product Launch'],
    products: [],
    rule: null,
  },
  wisb: {
    lead: 'Amirul Hafiz',
    services: ['Supply & Sales of Industrial Machines'],
    products: [],
    rule: 'Strategic Partner — collaboration with Kretivco, not a department.',
  },
}

export default function DepartmentsPage() {
  const { jobs } = useData()
  const depts = Object.entries(DEPT)

  return (
    <>
      <div style={{marginBottom:24}}>
        <h1 style={{fontFamily:"'Poppins',sans-serif",fontSize:22,fontWeight:700,color:'#1A1025',margin:0}}>Departments</h1>
        <p style={{fontSize:13,color:'#6B6080',marginTop:4}}>Overview of services, products, and PIC for each department.</p>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
        {depts.map(([key, dept]) => {
          const info = DEPT_INFO[key] || {}
          const deptJobs = jobs.filter(j => j.department === key && !j.archived)
          const activeJobs = deptJobs.filter(j => !['completed','cancelled'].includes(j.status))
          const completedJobs = deptJobs.filter(j => j.status === 'completed')
          const pipeline = activeJobs.reduce((s, j) => s + (j.estimation_value || 0), 0)

          return (
            <div key={key} style={{background:'#fff',borderRadius:12,border:'1px solid #E8E4ED',overflow:'hidden'}}>
              {/* Header */}
              <div style={{padding:'16px 20px',background:dept.color+'08',borderBottom:`2px solid ${dept.color}`}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <div>
                    <span style={{fontSize:11,fontWeight:700,color:dept.color,letterSpacing:'0.05em'}}>{dept.code}</span>
                    <h2 style={{fontFamily:"'Poppins',sans-serif",fontSize:16,fontWeight:700,color:'#1A1025',margin:'2px 0 0'}}>{dept.label}</h2>
                  </div>
                  <div style={{textAlign:'right',fontSize:11,color:'#6B6080'}}>
                    <div><strong style={{color:'#1A1025'}}>{activeJobs.length}</strong> active</div>
                    <div><strong style={{color:'#1A1025'}}>{completedJobs.length}</strong> completed</div>
                  </div>
                </div>
                <div style={{fontSize:11,color:'#6B6080',marginTop:6}}>Lead: <strong style={{color:'#1A1025'}}>{info.lead || '—'}</strong></div>
              </div>

              {/* Body */}
              <div style={{padding:'14px 20px'}}>
                {/* Services */}
                <div style={{marginBottom:info.products?.length ? 12 : 0}}>
                  <div style={{fontSize:10,fontWeight:700,color:dept.color,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Services</div>
                  {info.services?.map((s, i) => (
                    <div key={i} style={{fontSize:12,color:'#1A1025',padding:'3px 0',borderBottom:'1px solid #F9F8FB'}}>
                      {s}
                    </div>
                  ))}
                </div>

                {/* Products */}
                {info.products?.length > 0 && (
                  <div style={{marginBottom:info.rule ? 12 : 0}}>
                    <div style={{fontSize:10,fontWeight:700,color:'#10B981',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:6}}>Kretivco Products</div>
                    {info.products.map((p, i) => (
                      <div key={i} style={{fontSize:12,color:'#1A1025',padding:'3px 0',borderBottom:'1px solid #F9F8FB'}}>
                        {p}
                      </div>
                    ))}
                  </div>
                )}

                {/* Rule */}
                {info.rule && (
                  <div style={{fontSize:11,color:'#E85D04',background:'#E85D0408',padding:'8px 10px',borderRadius:6,marginTop:8,fontStyle:'italic'}}>
                    {info.rule}
                  </div>
                )}

                {/* Pipeline */}
                {pipeline > 0 && (
                  <div style={{marginTop:10,padding:'8px 10px',background:'#F9F8FB',borderRadius:6,fontSize:12,display:'flex',justifyContent:'space-between'}}>
                    <span style={{color:'#6B6080'}}>Pipeline Value</span>
                    <strong style={{color:'#1A1025'}}>RM {pipeline.toLocaleString('en-MY')}</strong>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
