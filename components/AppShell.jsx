'use client'
import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks'
import { signOut } from '@/lib/auth'
import { isMockMode } from '@/lib/supabase'

const NAV = [
  { key:'dashboard', label:'Dashboard', path:'/', icon:'📊' },
  { key:'jobs', label:'Job Monitor', path:'/jobs', icon:'📋' },
  { key:'customers', label:'Customers', path:'/customers', icon:'👥' },
  { key:'reports', label:'Reports', path:'/reports', icon:'📈', roles:['bod','dept_head'] },
  { key:'settings', label:'Settings', path:'/settings', icon:'⚙️', roles:['bod'] },
]

export default function AppShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, loading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  // Skip shell on login page
  if (pathname === '/login') return children

  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    if (!loading && !profile && pathname !== '/login') {
      router.push('/login')
    }
  }, [loading, profile, pathname, router])

  // Show nothing while checking auth or redirecting
  if (loading || !profile) return null

  const nav = NAV.filter(n => !n.roles || (profile && n.roles.includes(profile.role)))
  const sw = collapsed ? 64 : 240

  const handleNewJob = () => {
    if (pathname === '/jobs') {
      // Already on jobs page — dispatch custom event to open modal
      window.dispatchEvent(new CustomEvent('open-create-job'))
    } else {
      // Navigate to jobs with flag
      router.push('/jobs?new=1')
    }
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{ width:sw, background:'#1A1025', color:'#fff', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, bottom:0, zIndex:50, transition:'width .2s', overflowX:'hidden' }}>

        {/* ── Logo ── */}
        <div style={{ padding:collapsed?'20px 12px':'20px 20px', borderBottom:'1px solid rgba(255,255,255,.06)' }}>
          <div style={{ fontSize:collapsed?16:22, fontWeight:800, letterSpacing:'-0.02em' }}>{collapsed?'K':'Kretivco'}</div>
          {!collapsed && <div style={{ marginTop:4, fontSize:11, fontWeight:500, color:'#E91E63', background:'#E91E6318', borderRadius:20, padding:'3px 10px', display:'inline-block' }}>Job Dashboard{isMockMode?' (Demo)':''}</div>}
        </div>

        {/* ── Quick Action: New Job ── */}
        <div style={{ padding:collapsed?'12px 8px':'12px 16px' }}>
          <button onClick={handleNewJob}
            style={{
              width:'100%', display:'flex', alignItems:'center', justifyContent:collapsed?'center':'center',
              gap:8, height:42, borderRadius:8, border:'none', cursor:'pointer',
              background:'linear-gradient(135deg,#E91E63,#AD1457)', color:'#fff',
              fontSize:13, fontWeight:600, fontFamily:'inherit',
              boxShadow:'0 2px 8px rgba(233,30,99,.3)',
              transition:'opacity .15s',
            }}
            onMouseEnter={e=>e.currentTarget.style.opacity='0.9'}
            onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
            <span style={{ fontSize:18, lineHeight:1 }}>+</span>
            {!collapsed && <span>Job Baru</span>}
          </button>
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex:1, padding:'4px 0' }}>
          {nav.map(item => {
            const active = pathname===item.path || (item.path!=='/' && pathname.startsWith(item.path))
            return (
              <div key={item.key} onClick={()=>router.push(item.path)}
                style={{ display:'flex', alignItems:'center', gap:12, height:42, padding:'0 20px', cursor:'pointer', position:'relative',
                  background:active?'rgba(255,255,255,.06)':'transparent', color:active?'#fff':'rgba(255,255,255,.5)',
                  fontSize:13, fontWeight:active?600:400, transition:'all .15s', whiteSpace:'nowrap' }}
                onMouseEnter={e=>{if(!active)e.currentTarget.style.background='rgba(255,255,255,.03)'}}
                onMouseLeave={e=>{if(!active)e.currentTarget.style.background='transparent'}}>
                {active && <div style={{ position:'absolute', left:0, top:7, bottom:7, width:3, background:'#E91E63', borderRadius:'0 2px 2px 0' }} />}
                <span style={{ fontSize:15, width:24, textAlign:'center' }}>{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </div>
            )
          })}
        </nav>

        {/* ── Collapse Toggle ── */}
        <div onClick={()=>setCollapsed(!collapsed)}
          style={{ padding:'10px 20px', cursor:'pointer', color:'rgba(255,255,255,.25)', fontSize:11, borderTop:'1px solid rgba(255,255,255,.06)', textAlign:collapsed?'center':'left' }}
          onMouseEnter={e=>e.currentTarget.style.color='rgba(255,255,255,.5)'}
          onMouseLeave={e=>e.currentTarget.style.color='rgba(255,255,255,.25)'}>
          {collapsed?'→':'← Kecilkan'}
        </div>

        {/* ── User Profile ── */}
        {profile && (
          <div style={{ padding:collapsed?'14px 8px':'14px 20px', borderTop:'1px solid rgba(255,255,255,.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:'#E91E6330', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#E91E63', flexShrink:0 }}>{profile.name?.charAt(0)}</div>
              {!collapsed && <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile.name}</div>
                <div style={{ fontSize:10, fontWeight:500, color:profile.role==='bod'?'#E91E63':'#3A86FF', letterSpacing:'.02em', marginTop:1 }}>
                  {profile.role==='bod'?'BOD':'Dept Head'}{profile.title ? ` | ${profile.title}` : ''}
                </div>
              </div>}
            </div>
            {!collapsed && <button onClick={async()=>{await signOut();router.push('/login')}}
              style={{ marginTop:10, width:'100%', padding:'6px 0', fontSize:11, fontWeight:500, color:'rgba(255,255,255,.4)', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}
              onMouseEnter={e=>{e.currentTarget.style.background='rgba(255,255,255,.06)';e.currentTarget.style.color='#fff'}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='rgba(255,255,255,.4)'}}>
              Log Keluar
            </button>}
          </div>
        )}
      </aside>
      <main style={{ flex:1, marginLeft:sw, minHeight:'100vh', transition:'margin-left .2s' }}>{children}</main>
    </div>
  )
}
