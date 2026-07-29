'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { useAuth } from '@/lib/hooks'
import { isMockMode } from '@/lib/supabase'
import { MOCK_USERS } from '@/lib/mock-data'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState(isMockMode ? 'demo' : '')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { refresh } = useAuth() || {}

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true)
    try {
      await signIn(email, password)
      // Refresh profile before navigating
      if (refresh) await refresh()
      // Small delay to ensure auth state is established
      setTimeout(() => router.push('/'), 300)
    }
    catch { setError('Email atau password salah.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F5F3F7', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Poppins',sans-serif" }}>
      <div style={{ width:400, maxWidth:'92vw' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:800, color:'#1A1025', letterSpacing:'-0.02em' }}>Kretivco</div>
          <div style={{ marginTop:6, fontSize:12, fontWeight:500, color:'#E91E63', background:'#E91E6312', borderRadius:20, padding:'4px 14px', display:'inline-block' }}>Job Dashboard</div>
        </div>
        <div style={{ background:'#fff', borderRadius:16, padding:32, boxShadow:'0 4px 20px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Log Masuk</div>
          <div style={{ fontSize:13, color:'#6B6080', marginBottom:24 }}>
            {isMockMode ? '🟢 Demo Mode — pilih akaun untuk log masuk' : 'Masukkan email dan password anda'}
          </div>
          <form onSubmit={handleSubmit}>
            {isMockMode ? (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#6B6080', display:'block', marginBottom:8 }}>Log masuk sebagai</label>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {MOCK_USERS.filter(u=>u.active).map(u=>(
                    <button type="button" key={u.id} onClick={()=>setEmail(u.email)}
                      style={{ fontFamily:'inherit', display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderRadius:10,
                        border: email===u.email ? '2px solid #E91E63' : '1px solid #E8E4ED',
                        background: email===u.email ? '#E91E6308' : '#fff', cursor:'pointer', textAlign:'left' }}>
                      <div style={{ width:36, height:36, borderRadius:'50%', background: email===u.email ? '#E91E6320' : '#F5F3F7',
                        display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:700,
                        color: email===u.email ? '#E91E63' : '#6B6080' }}>{u.name.charAt(0)}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'#1A1025' }}>{u.name}</div>
                        <div style={{ fontSize:11, color:'#9B93A8' }}>{u.role==='bod'?'BOD':'Dept Head'} · {u.email}</div>
                      </div>
                      {email===u.email && <span style={{ color:'#E91E63', fontSize:16 }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:12, fontWeight:500, color:'#6B6080', display:'block', marginBottom:6 }}>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email@kretiv.co" required
                  style={{ fontFamily:'inherit', fontSize:13, width:'100%', height:44, padding:'0 14px', border:'1px solid #E8E4ED', borderRadius:8, outline:'none', boxSizing:'border-box' }} />
              </div>
            )}
            {!isMockMode && <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:500, color:'#6B6080', display:'block', marginBottom:6 }}>Password</label>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" required
                style={{ fontFamily:'inherit', fontSize:13, width:'100%', height:44, padding:'0 14px', border:'1px solid #E8E4ED', borderRadius:8, outline:'none', boxSizing:'border-box' }} />
            </div>}
            {error && <div style={{ fontSize:12, color:'#EF4444', background:'#EF444410', padding:'10px 14px', borderRadius:8, marginBottom:16 }}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{ fontFamily:'inherit', fontSize:14, fontWeight:600, width:'100%', height:46, border:'none', borderRadius:8, background:loading?'#E8E4ED':'linear-gradient(135deg,#E91E63,#AD1457)', color:'#fff', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Sedang log masuk...' : 'Log Masuk'}
            </button>
          </form>
        </div>
        <div style={{ textAlign:'center', marginTop:24, fontSize:11, color:'#9B93A8' }}>Kretivco Mediaworks © 2026 · Internal Use Only</div>
      </div>
    </div>
  )
}
