'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { useAuth } from '@/lib/hooks'
import { isMockMode } from '@/lib/supabase'
import { ROLE } from '@/lib/constants'
import { MOCK_USERS } from '@/lib/mock-data'

// Live mode still needs a real Supabase Auth password under the hood so a
// name-card click can sign in without typing one — kept in sync with the
// password actually set on these 5 seeded accounts in Supabase.
const LIVE_QUICK_PASSWORD = 'KretivLive#2026'

export default function Login() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { refresh } = useAuth() || {}

  const handleQuickLogin = async (loginEmail) => {
    setError(''); setLoading(true)
    try {
      await signIn(loginEmail, isMockMode ? 'demo' : LIVE_QUICK_PASSWORD)
      if (refresh) await refresh()
      setTimeout(() => router.push('/'), 300)
    }
    catch { setError('Could not log in. Please try again.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F5F3F7', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Poppins',sans-serif" }}>
      <div style={{ width:420, maxWidth:'92vw' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/kretivco-logo.png" alt="Kretivco" style={{ width:64, height:64, objectFit:'contain', marginBottom:12 }} />
          <div style={{ fontSize:28, fontWeight:800, color:'#1A1025', letterSpacing:'-0.02em' }}>Kretivco</div>
          <div style={{ marginTop:6, fontSize:12, fontWeight:500, color:'#E91E63', background:'#E91E6312', borderRadius:20, padding:'4px 14px', display:'inline-block' }}>Job Dashboard</div>
        </div>
        <div style={{ background:'#fff', borderRadius:16, padding:32, boxShadow:'0 4px 20px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Log In</div>
          <div style={{ fontSize:13, color:'#6B6080', marginBottom:24 }}>
            Select your name to continue
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {MOCK_USERS.map(u => {
              const meta = ROLE[u.role]
              return (
                <button type="button" key={u.email} disabled={loading} onClick={() => handleQuickLogin(u.email)}
                  style={{ fontFamily:'inherit', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:10,
                    border:`1.5px solid ${meta.color}30`, background:`${meta.color}08`, cursor:loading?'not-allowed':'pointer', textAlign:'left' }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:`${meta.color}18`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:meta.color, flexShrink:0 }}>{u.name.charAt(0)}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700, color:'#1A1025' }}>{u.name}</div>
                    <div style={{ fontSize:11, color:'#9B93A8', marginTop:1 }}>{u.email}</div>
                    <div style={{ fontSize:11, fontWeight:600, color:meta.color, marginTop:2 }}>{meta.label}{u.title ? ` | ${u.title}` : ''}</div>
                  </div>
                  <span style={{ color:meta.color, fontSize:18 }}>→</span>
                </button>
              )
            })}
          </div>
          {error && <div style={{ fontSize:12, color:'#EF4444', background:'#EF444410', padding:'10px 14px', borderRadius:8, marginTop:12 }}>{error}</div>}
        </div>
        <div style={{ textAlign:'center', marginTop:24, fontSize:11, color:'#9B93A8' }}>Kretivco Mediaworks © 2026 · Internal Use Only</div>
      </div>
    </div>
  )
}
