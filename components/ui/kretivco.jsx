'use client'
import { useEffect } from 'react'
import { DEPT, STATUS, SOURCE, ROLE, formatDate, daysUntil } from '@/lib/constants'

export function StatusBadge({ status }) {
  const s = STATUS[status]; if (!s) return null
  return <span style={{ display:'inline-block', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:600, color:s.color, background:s.color+'15', whiteSpace:'nowrap' }}>{s.label}</span>
}
export function DeptTag({ dept, showLabel }) {
  const d = DEPT[dept]; if (!d) return null
  return <span style={{ display:'inline-block', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, color:d.color, background:d.color+'15', whiteSpace:'nowrap' }}>{showLabel ? d.label : d.code}</span>
}
export function SourceBadge({ source }) {
  const s = SOURCE[source]; if (!s) return <span style={{fontSize:11,color:'#9B93A8'}}>—</span>
  return <span style={{ display:'inline-block', borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600, color:s.color, background:s.color+'12' }}>{s.label}</span>
}
export function RoleBadge({ role }) {
  const r = ROLE[role]; if (!r) return null
  return <span style={{ display:'inline-block', borderRadius:20, padding:'4px 12px', fontSize:12, fontWeight:600, color:r.color, background:r.color+'15' }}>{r.label}</span>
}
export function JobId({ children, className='' }) { return <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:600 }} className={className}>{children}</span> }
export function Avatar({ name, size=36 }) {
  const colors=['#E91E63','#7209B7','#3A86FF','#E85D04','#10B981','#F59E0B','#6366F1']
  const i=(name?.charCodeAt(0)||0)%colors.length
  return <div style={{ width:size, height:size, borderRadius:'50%', background:colors[i]+'18', color:colors[i], display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.38, fontWeight:700, flexShrink:0 }}>{name?.charAt(0)||'?'}</div>
}
export function DeadlineBadge({ deadline, status }) {
  if (['completed','cancelled'].includes(status)) return <span style={{fontSize:12,color:'#9B93A8'}}>{formatDate(deadline)}</span>
  const d = daysUntil(deadline); if (d===null) return <span style={{fontSize:12,color:'#9B93A8'}}>—</span>
  const ds = formatDate(deadline)
  if (d<0) return <span style={{fontSize:12,fontWeight:600,color:'#EF4444'}}>{ds} <span style={{fontSize:10,background:'#EF444418',borderRadius:10,padding:'2px 6px',marginLeft:4}}>Overdue</span></span>
  if (d<=3) return <span style={{fontSize:12,fontWeight:600,color:'#F59E0B'}}>{ds} <span style={{fontSize:10,background:'#F59E0B18',borderRadius:10,padding:'2px 6px',marginLeft:4}}>{d}d</span></span>
  return <span style={{fontSize:12,color:'#1A1025'}}>{ds}</span>
}
export function Toast({ message, type='success', onDone }) {
  useEffect(() => { const t=setTimeout(onDone,3000); return()=>clearTimeout(t) }, [onDone])
  const c = { success:'#10B981', warning:'#F59E0B', danger:'#EF4444' }
  return <div style={{ position:'fixed', bottom:24, right:24, zIndex:200, background:'#1A1025', color:'#fff', borderRadius:10, padding:'12px 20px', fontSize:13, fontWeight:500, boxShadow:'0 8px 32px rgba(0,0,0,.2)', borderLeft:`4px solid ${c[type]||c.success}`, display:'flex', alignItems:'center', gap:10, animation:'slideUp .3s ease' }}><span style={{color:c[type]||c.success}}>{type==='success'?'✓':type==='danger'?'✕':'⚠'}</span>{message}</div>
}
export function Modal({ width=560, children, onClose }) {
  return <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)', animation:'fadeIn .2s ease' }}><div onClick={e=>e.stopPropagation()} style={{ position:'relative', background:'#fff', borderRadius:16, width, maxWidth:'94vw', maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,.18)', animation:'slideUp .25s ease' }}>{children}</div></div>
}
export function ModalHeader({ title, subtitle, children, onClose }) {
  return <div style={{ padding:'20px 24px', borderBottom:'1px solid #F0ECF4', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}><div>{typeof title==='string'?<div style={{fontSize:16,fontWeight:700}}>{title}</div>:title}{subtitle&&<div style={{fontSize:12,color:'#9B93A8',marginTop:2}}>{subtitle}</div>}</div><div style={{display:'flex',alignItems:'center',gap:8}}>{children}<button onClick={onClose} style={{background:'none',border:'none',fontSize:22,cursor:'pointer',color:'#9B93A8',padding:'0 4px'}}>×</button></div></div>
}
export function ModalBody({ children }) { return <div style={{ padding:24, overflowY:'auto', flex:1 }}>{children}</div> }
export function ModalFooter({ children }) { return <div style={{ padding:'16px 24px', borderTop:'1px solid #F0ECF4', display:'flex', justifyContent:'flex-end', gap:8, flexShrink:0 }}>{children}</div> }
export function PageHeader({ title, subtitle, children }) {
  return <div style={{ background:'linear-gradient(135deg,#E91E63,#AD1457)', padding:'24px 32px', color:'#fff' }}><div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}><div><h1 style={{fontSize:20,fontWeight:700,letterSpacing:'-0.01em',margin:0}}>{title}</h1>{subtitle&&<p style={{fontSize:12,color:'rgba(255,255,255,.6)',marginTop:2,margin:0}}>{subtitle}</p>}</div>{children}</div></div>
}
export function Card({ children, style={}, className='' }) { return <div className={className} style={{ background:'#fff', borderRadius:12, boxShadow:'0 1px 3px rgba(0,0,0,.06)', ...style }}>{children}</div> }
// Form elements
const inputBase = { fontFamily:"'Poppins',sans-serif", fontSize:13, border:'1px solid #E8E4ED', borderRadius:8, outline:'none', background:'#fff', color:'#1A1025', width:'100%', boxSizing:'border-box' }
export function Input(props) { return <input {...props} style={{ ...inputBase, padding:'0 12px', height:40, ...props.style }} onFocus={e=>{e.target.style.borderColor='#E91E63';e.target.style.boxShadow='0 0 0 3px rgba(233,30,99,.08)'}} onBlur={e=>{e.target.style.borderColor='#E8E4ED';e.target.style.boxShadow='none'}} /> }
export function Select(props) { return <select {...props} style={{ ...inputBase, padding:'0 10px', height:40, cursor:'pointer', appearance:'auto', ...props.style }} /> }
export function Textarea(props) { return <textarea {...props} style={{ ...inputBase, padding:'10px 12px', minHeight:72, resize:'vertical', ...props.style }} /> }
export function Label({ children, required }) { return <label style={{ fontSize:12, fontWeight:500, color:'#6B6080', display:'block', marginBottom:6 }}>{children}{required&&<span style={{color:'#EF4444',marginLeft:2}}>*</span>}</label> }
export function FieldError({ children }) { return children ? <div style={{fontSize:11,color:'#EF4444',marginTop:4}}>{children}</div> : null }
export function BtnPrimary({ children, disabled, ...props }) { return <button {...props} disabled={disabled} style={{ fontFamily:"'Poppins',sans-serif", fontSize:13, fontWeight:600, padding:'9px 24px', borderRadius:8, border:'none', background:disabled?'#E8E4ED':'#E91E63', color:disabled?'#9B93A8':'#fff', cursor:disabled?'not-allowed':'pointer', ...props.style }}>{children}</button> }
export function BtnSecondary({ children, ...props }) { return <button {...props} style={{ fontFamily:"'Poppins',sans-serif", fontSize:13, fontWeight:500, padding:'9px 20px', borderRadius:8, border:'1px solid #E8E4ED', background:'#F5F3F7', color:'#1A1025', cursor:'pointer', ...props.style }}>{children}</button> }
