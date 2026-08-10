'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '@/lib/auth'
import { useAuth } from '@/lib/hooks'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { refresh } = useAuth() || {}

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      await signIn(email, password)
      if (refresh) await refresh()
      setTimeout(() => router.push('/'), 300)
    }
    catch { setError('Incorrect email or password.') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#F5F3F7', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Poppins',sans-serif" }}>
      <div style={{ width:400, maxWidth:'92vw' }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <img src="/kretivco-logo.png" alt="Kretivco" style={{ width:64, height:64, objectFit:'contain', marginBottom:12 }} />
          <div style={{ fontSize:28, fontWeight:800, color:'#1A1025', letterSpacing:'-0.02em' }}>Kretivco</div>
          <div style={{ marginTop:6, fontSize:12, fontWeight:500, color:'#E91E63', background:'#E91E6312', borderRadius:20, padding:'4px 14px', display:'inline-block' }}>Job Dashboard</div>
        </div>
        <div style={{ background:'#fff', borderRadius:16, padding:32, boxShadow:'0 4px 20px rgba(0,0,0,.06)' }}>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Log In</div>
          <div style={{ fontSize:13, color:'#6B6080', marginBottom:24 }}>
            Enter your email and password to continue
          </div>
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
          </form>
        </div>
        <div style={{ textAlign:'center', marginTop:24, fontSize:11, color:'#9B93A8' }}>Kretivco Mediaworks © 2026 · Internal Use Only</div>
      </div>
    </div>
  )
}
