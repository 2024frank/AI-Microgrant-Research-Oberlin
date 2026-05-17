'use client';
import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const cred  = await signInWithEmailAndPassword(auth, email, password);
      const token = await cred.user.getIdToken();
      const res   = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      const user  = await res.json();
      localStorage.setItem('token', token);
      if (user.role === 'admin') router.push('/admin/stats');
      else router.push('/reviewer/queue');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', borderRadius: 12, padding: '2.5rem', width: '100%', maxWidth: 380, boxShadow: '0 2px 20px rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '2rem' }}>
          <svg width="42" height="42" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="46" stroke="#3a8c3f" strokeWidth="5"/>
            <path d="M50 78 C38 78 30 70 26 60 L50 18 L74 60 C70 70 62 78 50 78Z" fill="#3a8c3f"/>
            <path d="M36 60 Q50 85 64 60" stroke="#3a8c3f" strokeWidth="3" fill="none" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#3a8c3f', letterSpacing: 0.5 }}>AI CALENDAR</div>
            <div style={{ fontSize: 11, color: '#999' }}>Oberlin Environmental Dashboard</div>
          </div>
        </div>

        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Sign in</h1>
        <p style={{ fontSize: 13, color: '#888', marginBottom: '1.5rem' }}>AI Community Calendar Aggregator</p>

        {error && (
          <div style={{ background: '#fdecea', color: '#c0392b', padding: '0.6rem 0.875rem', borderRadius: 6, fontSize: 13, marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="you@oberlin.edu"
            style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }} />

          <label style={{ fontSize: 12, fontWeight: 600, color: '#555', display: 'block', marginBottom: 4 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
            placeholder="••••••••"
            style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 14, outline: 'none', boxSizing: 'border-box', marginBottom: '1.5rem' }} />

          <button type="submit" disabled={loading} className="btn-primary"
            style={{ width: '100%', padding: '0.7rem', fontSize: 14 }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
