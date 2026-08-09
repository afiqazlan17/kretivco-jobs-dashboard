'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { useAuth } from '@/lib/hooks'
import { isMockMode } from '@/lib/supabase'
import { ROLE } from '@/lib/constants'

// One representative account per access level — clicking logs in
// immediately, no separate submit step. Same 3 accounts exist in both
// Demo Mode (mock-data.js) and live Supabase (seeded via SQL), so this
// list works unchanged in either mode.
const QUICK_LOGIN = [
  { role: 'bod', email: 'afiq@kretiv.co', name: 'Afiq Azlan' },
  { role: 'dept_head', email: 'amnan@kretiv.co', name: 'Amnan Syahmi' },
  { role: 'staff', email: 'staff@kretiv.co', name: 'Staff Demo' },
]

// Live mode still needs a real Supabase Auth password under the hood —
// this fixed one is baked in so users never have to type it. That trades
// away per-account security (anyone reading the client bundle can extract
// it and sign in as BOD) for zero-friction access on this internal tool.
const LIVE_DEMO_PASSWORD = 'Kretivco2026!'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showManual, setShowManual] = useState(false)
  const router = useRouter()
  const { refresh } = useAuth() || {}

  const doSignIn = async (loginEmail, loginPassword) => {
    setError(''); setLoading(true)
    try {
      await signIn(loginEmail, loginPassword)
      if (refresh) await refresh()
      setTimeout(() => router.push('/'), 300)
    }
    catch { setError('Incorrect email or password.') }
    finally { setLoading(false) }
  }

  const handleQuickLogin = (loginEmail) => doSignIn(loginEmail, isMockMode ? 'demo' : LIVE_DEMO_PASSWORD)
  const handleSubmit = async (e) => { e.preventDefault(); doSignIn(email, password) }

  return (
    <div style={{ minHeight:'100vh', background:'#F5F3F7', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Poppins',sans-serif" }}>
      <div style={{ width:400, maxWidth:'92vw' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#1A1025', letterSpacing:'-0.02em' }}>Kretivco</div>
          <div style={{ marginTop:6, fontSize:12, fontWeight:500, color:'#E91E63', background:'#E91E6312', borderRadius:20, padding:'4px 14px', display:'inline-block' }}>Job Dashboard</div>
        </div>
        <div style={{ background:'#fff', borderRadius:16, padding:32, boxShadow:'0 4px 20px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Log In</div>
          <div style={{ fontSize:13, color:'#6B6080', marginBottom:24 }}>
            🟢 Click to log in directly by access level
          </div>
          {!showManual ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {QUICK_LOGIN.map(({ role, email: loginEmail, name }) => {
                const meta = ROLE[role]
                return (
                  <button type="button" key={role} disabled={loading} onClick={() => handleQuickLogin(loginEmail)}
                    style={{ fontFamily:'inherit', display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderRadius:10,
                      border:`1.5px solid ${meta.color}30`, background:`${meta.color}08`, cursor:loading?'not-allowed':'pointer', textAlign:'left' }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:`${meta.color}18`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:700, color:meta.color }}>{name.charAt(0)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:meta.color }}>{meta.label}</div>
                      <div style={{ fontSize:11, color:'#6B6080', marginTop:1 }}>{meta.desc}</div>
                    </div>
                    <span style={{ color:meta.color, fontSize:18 }}>→</span>
                  </button>
                )
              })}
              {error && <div style={{ fontSize:12, color:'#EF4444', background:'#EF444410', padding:'10px 14px', borderRadius:8 }}>{error}</div>}
              {!isMockMode && (
                <button type="button" onClick={() => setShowManual(true)}
                  style={{ fontFamily:'inherit', fontSize:11, color:'#9B93A8', background:'none', border:'none', cursor:'pointer', textAlign:'center', marginTop:4 }}>
                  Use another account
                </button>
              )}
            </div>
          ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#6B6080', display:'block', marginBottom:6 }}>Email</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@kretiv.co" required
                style={{ fontFamily:'inherit', fontSize:13, width:'100%', height:44, padding:'0 14px', border:'1px solid #E8E4ED', borderRadius:8, outline:'none', boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#6B6080', display:'block', marginBottom:6 }}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required
                style={{ fontFamily:'inherit', fontSize:13, width:'100%', height:44, padding:'0 14px', border:'1px solid #E8E4ED', borderRadius:8, outline:'none', boxSizing:'border-box' }} />
            </div>
            {error && <div style={{ fontSize:12, color:'#EF4444', background:'#EF444410', padding:'10px 14px', borderRadius:8, marginBottom:16 }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ fontFamily:'inherit', fontSize:14, fontWeight:600, width:'100%', height:46, border:'none', borderRadius:8, background:loading?'#E8E4ED':'linear-gradient(135deg,#E91E63,#AD1457)', color:'#fff', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Logging in...' : 'Log In'}
            </button>
            <button type="button" onClick={() => setShowManual(false)}
              style={{ fontFamily:'inherit', fontSize:11, color:'#9B93A8', background:'none', border:'none', cursor:'pointer', textAlign:'center', width:'100%', marginTop:12 }}>
              ← Back to quick login
            </button>
          </form>
          )}
        </div>
        <div style={{ textAlign:'center', marginTop:24, fontSize:11, color:'#9B93A8' }}>Kretivco Mediaworks © 2026 · Internal Use Only</div>
      </div>
    </div>
  )
}
