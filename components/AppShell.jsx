'use client'
import { useState, useEffect, Suspense } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth, SYNC_ERROR_EVENT } from '@/lib/hooks'
import { signOut } from '@/lib/auth'
import { isMockMode } from '@/lib/supabase'
import { REPORT_MENU, JOB_MENU, ROLE } from '@/lib/constants'

const NAV = [
  { key:'dashboard', label:'Dashboard', path:'/', icon:'📊' },
  { key:'jobs', label:'Job', path:'/jobs', icon:'📋' },
  { key:'customers', label:'Customers', path:'/customers', icon:'👥' },
  { key:'vendors', label:'Vendors', path:'/vendors', icon:'🏭' },
  { key:'finance', label:'Finance', path:'/finance', icon:'💰', roles:['bod','dept_head'] },
  { key:'reports', label:'Reports', path:'/reports', icon:'📈', roles:['bod','dept_head'] },
  { key:'departments', label:'Departments', path:'/departments', icon:'🏢' },
  { key:'settings', label:'Settings', path:'/settings', icon:'⚙️', roles:['bod'] },
]

// The active report key comes from the URL (?report=gl) — isolated in its
// own component so only this small part of the sidebar needs a Suspense
// boundary for useSearchParams, instead of forcing every page in the app
// (which all render through AppShell) to opt into dynamic rendering.
function FinanceSubmenu({ isMobile, collapsed, onNav }) {
  const searchParams = useSearchParams()
  const activeReport = searchParams.get('report') || 'overview'
  return (
    <div style={{ padding: '2px 0 6px' }}>
      {REPORT_MENU.map(r => (
        <div key={r.key} onClick={(e) => { e.stopPropagation(); onNav(`/finance?report=${r.key}`) }}
          style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 40, padding: (isMobile || !collapsed) ? '10px 18px 10px 44px' : '10px 12px', cursor: 'pointer',
            background: activeReport === r.key ? 'rgba(255,255,255,.08)' : 'transparent',
            color: activeReport === r.key ? '#fff' : 'rgba(255,255,255,.45)',
            fontSize: 12, fontWeight: activeReport === r.key ? 600 : 400, lineHeight: 1.3 }}>
          <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{r.icon}</span>
          {(isMobile || !collapsed) && <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.label}</span>}
          {(isMobile || !collapsed) && !r.built && <span style={{ marginLeft: 'auto', fontSize: 8, opacity: .6, flexShrink: 0, marginTop: 3 }}>●</span>}
        </div>
      ))}
    </div>
  )
}

// Same pattern as FinanceSubmenu — the active view comes from ?view=, and the
// "New Job" entry is an action (opens the create-job modal) rather than a link.
function JobSubmenu({ isMobile, collapsed, onNav, onNewJob }) {
  const searchParams = useSearchParams()
  const activeView = searchParams.get('view') || 'queue'
  return (
    <div style={{ padding: '2px 0 6px' }}>
      {JOB_MENU.map(j => {
        const isActive = !j.action && activeView === j.key
        return (
          <div key={j.key} onClick={(e) => { e.stopPropagation(); j.action ? onNewJob() : onNav(`/jobs?view=${j.key}`) }}
            style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minHeight: 40, padding: (isMobile || !collapsed) ? '10px 18px 10px 44px' : '10px 12px', cursor: 'pointer',
              background: isActive ? 'rgba(255,255,255,.08)' : 'transparent',
              color: isActive ? '#fff' : (j.action ? '#E91E63' : 'rgba(255,255,255,.45)'),
              fontSize: 12, fontWeight: isActive ? 600 : 400, lineHeight: 1.3 }}>
            <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{j.icon}</span>
            {(isMobile || !collapsed) && <span style={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{j.label}</span>}
          </div>
        )
      })}
    </div>
  )
}

export default function AppShell({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const { profile, loading } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close mobile sidebar on nav
  useEffect(() => { setMobileOpen(false) }, [pathname])

  // Live-mode writes are fire-and-forget against Supabase — a failed one
  // (RLS denial, network blip) used to only reach console.error, so a
  // change could look saved and then silently vanish on the next reload.
  // Surface it as a dismissible banner instead, visible on every page.
  const [syncError, setSyncError] = useState(null)
  useEffect(() => {
    const handler = (e) => setSyncError(e.detail)
    window.addEventListener(SYNC_ERROR_EVENT, handler)
    return () => window.removeEventListener(SYNC_ERROR_EVENT, handler)
  }, [])
  useEffect(() => { setSyncError(null) }, [pathname])

  // Auth guard
  useEffect(() => {
    if (!loading && !profile && pathname !== '/login') {
      router.push('/login')
    }
  }, [loading, profile, pathname, router])

  if (pathname === '/login') return children
  if (loading || !profile) return null

  const nav = NAV.filter(n => !n.roles || (profile && n.roles.includes(profile.role)))
  const sw = isMobile ? 240 : (collapsed ? 64 : 240)
  const showSidebar = isMobile ? mobileOpen : true

  const handleNewJob = () => {
    setMobileOpen(false)
    if (pathname === '/jobs') {
      window.dispatchEvent(new CustomEvent('open-create-job'))
    } else {
      router.push('/jobs?new=1')
    }
  }

  const handleNav = (path) => {
    setMobileOpen(false)
    router.push(path)
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      {/* Mobile hamburger */}
      {isMobile && (
        <button onClick={()=>setMobileOpen(true)}
          style={{ position:'fixed', top:12, left:12, zIndex:60, width:40, height:40, borderRadius:8,
            background:'#1A1025', color:'#fff', border:'none', cursor:'pointer', fontSize:20, display:'flex',
            alignItems:'center', justifyContent:'center', boxShadow:'0 2px 8px rgba(0,0,0,.2)' }}>
          ☰
        </button>
      )}

      {/* Overlay */}
      {isMobile && mobileOpen && (
        <div onClick={()=>setMobileOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:49, animation:'fadeIn .2s' }} />
      )}

      {/* Sidebar */}
      {showSidebar && (
        <aside style={{ width:sw, background:'#1A1025', color:'#fff', display:'flex', flexDirection:'column',
          position:'fixed', top:0, left:0, bottom:0, zIndex:50, transition:'transform .2s', overflowX:'hidden',
          ...(isMobile ? { animation:'slideIn .2s' } : {}) }}>

          {/* Logo */}
          <div style={{ padding:isMobile||!collapsed?'20px 20px':'20px 12px', borderBottom:'1px solid rgba(255,255,255,.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontSize:isMobile||!collapsed?22:16, fontWeight:800, letterSpacing:'-0.02em' }}>{isMobile||!collapsed?'Kretivco':'K'}</div>
              {(isMobile||!collapsed) && <div style={{ marginTop:4, fontSize:11, fontWeight:500, color:'#E91E63', background:'#E91E6318', borderRadius:20, padding:'3px 10px', display:'inline-block' }}>Job Dashboard{isMockMode?' (Demo)':''}</div>}
            </div>
            {isMobile && <button onClick={()=>setMobileOpen(false)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.5)', fontSize:22, cursor:'pointer' }}>×</button>}
          </div>

          {/* Navigation */}
          <nav style={{ flex:1, padding:'4px 0' }}>
            {nav.map(item => {
              const active = pathname===item.path || (item.path!=='/' && pathname.startsWith(item.path))
              const isFinance = item.key === 'finance'
              const isJob = item.key === 'jobs'
              return (
                <div key={item.key}>
                  <div onClick={()=>handleNav(item.path)}
                    style={{ display:'flex', alignItems:'center', gap:12, height:48, padding:'0 20px', cursor:'pointer', position:'relative',
                      background:active?'rgba(255,255,255,.06)':'transparent', color:active?'#fff':'rgba(255,255,255,.5)',
                      fontSize:13, fontWeight:active?600:400, transition:'all .15s', whiteSpace:'nowrap' }}>
                    {active && <div style={{ position:'absolute', left:0, top:7, bottom:7, width:3, background:'#E91E63', borderRadius:'0 2px 2px 0' }} />}
                    <span style={{ fontSize:15, width:24, textAlign:'center' }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                  {isFinance && active && (
                    <Suspense fallback={null}>
                      <FinanceSubmenu isMobile={isMobile} collapsed={collapsed} onNav={handleNav} />
                    </Suspense>
                  )}
                  {isJob && active && (
                    <Suspense fallback={null}>
                      <JobSubmenu isMobile={isMobile} collapsed={collapsed} onNav={handleNav} onNewJob={handleNewJob} />
                    </Suspense>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Collapse (desktop only) */}
          {!isMobile && (
            <div onClick={()=>setCollapsed(!collapsed)}
              style={{ padding:'10px 20px', cursor:'pointer', color:'rgba(255,255,255,.25)', fontSize:11, borderTop:'1px solid rgba(255,255,255,.06)', textAlign:collapsed?'center':'left' }}>
              {collapsed?'→':'← Collapse'}
            </div>
          )}

          {/* User Profile */}
          {profile && (
            <div style={{ padding:'14px 20px', borderTop:'1px solid rgba(255,255,255,.06)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:'#E91E6330', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#E91E63', flexShrink:0 }}>{profile.name?.charAt(0)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{profile.name}</div>
                  <div style={{ fontSize:10, fontWeight:500, color:ROLE[profile.role]?.color || '#3A86FF', letterSpacing:'.02em', marginTop:1 }}>
                    {ROLE[profile.role]?.label || profile.role}{profile.title ? ` | ${profile.title}` : ''}
                  </div>
                </div>
              </div>
              <button onClick={async()=>{await signOut();router.push('/login')}}
                style={{ marginTop:10, width:'100%', padding:'6px 0', fontSize:11, fontWeight:500, color:'rgba(255,255,255,.4)', background:'transparent', border:'1px solid rgba(255,255,255,.1)', borderRadius:6, cursor:'pointer', fontFamily:'inherit' }}>
                Log Out
              </button>
            </div>
          )}
        </aside>
      )}
      <main style={{ flex:1, marginLeft:isMobile?0:sw, minHeight:'100vh', transition:'margin-left .2s', paddingTop:isMobile?56:0 }}>{children}</main>
      {syncError && (
        <div style={{ position:'fixed', top:0, left:0, right:0, zIndex:200, background:'#EF4444', color:'#fff', padding:'10px 20px', display:'flex', alignItems:'center', gap:12, fontFamily:"'Poppins',sans-serif", fontSize:13, boxShadow:'0 2px 8px rgba(0,0,0,.2)' }}>
          <span style={{ fontSize:16 }}>⚠</span>
          <span style={{ flex:1 }}><strong>Failed to save your last change</strong> — {syncError.message || 'please try again.'} If this keeps happening, refresh the page to check whether your change actually went through.</span>
          <button onClick={() => setSyncError(null)} style={{ background:'rgba(255,255,255,.2)', border:'none', color:'#fff', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontSize:12, fontWeight:600, flexShrink:0 }}>Dismiss</button>
        </div>
      )}
    </div>
  )
}
