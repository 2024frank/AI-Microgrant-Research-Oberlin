'use client';
import { useState } from 'react';
import { signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const provider = new GoogleAuthProvider();

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const router = useRouter();

  async function handleGoogleLogin() {
    setLoading(true); setError('');
    try {
      const cred  = await signInWithPopup(auth, provider);
      const token = await cred.user.getIdToken();

      // Check if this Google account is approved in our system
      const res  = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // Not in our users table — sign them out immediately
        await signOut(auth);
        setError(`${cred.user.email} is not authorized. Contact your admin to request access.`);
        setLoading(false);
        return;
      }

      const user = await res.json();
      localStorage.setItem('token', token);

      if (user.role === 'admin')    router.push('/admin/stats');
      else                          router.push('/reviewer/queue');

    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Sign-in failed. Please try again.');
      }
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f0f7f0 0%, #e8f5e9 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white', borderRadius: 16, padding: '2.75rem 2.5rem',
        width: '100%', maxWidth: 400,
        boxShadow: '0 4px 32px rgba(58,140,63,0.12)',
        border: '1px solid #e8f5e9',
      }}>
        {/* Logo + wordmark */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <svg width="56" height="56" viewBox="0 0 100 100" fill="none" style={{ marginBottom: 12 }}>
            <circle cx="50" cy="50" r="46" stroke="#3a8c3f" strokeWidth="5"/>
            {/* Hands */}
            <path d="M22 68 Q20 58 28 54 L38 50 Q44 48 46 54 L48 62" stroke="#3a8c3f" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <path d="M78 68 Q80 58 72 54 L62 50 Q56 48 54 54 L52 62" stroke="#3a8c3f" strokeWidth="4" fill="none" strokeLinecap="round"/>
            <path d="M48 62 Q50 66 52 62" stroke="#3a8c3f" strokeWidth="3" fill="none" strokeLinecap="round"/>
            {/* City */}
            <rect x="38" y="30" width="8" height="22" rx="1" fill="#3a8c3f"/>
            <rect x="46" y="24" width="8" height="28" rx="1" fill="#3a8c3f"/>
            <rect x="54" y="34" width="8" height="18" rx="1" fill="#3a8c3f"/>
            <rect x="30" y="38" width="8" height="14" rx="1" fill="#3a8c3f" opacity="0.7"/>
            <rect x="62" y="40" width="8" height="12" rx="1" fill="#3a8c3f" opacity="0.7"/>
            {/* Ground */}
            <rect x="24" y="52" width="52" height="3" rx="1.5" fill="#3a8c3f" opacity="0.4"/>
          </svg>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#3a8c3f', letterSpacing: 0.5, marginBottom: 2 }}>
            AI CALENDAR
          </div>
          <div style={{ fontSize: 12, color: '#999' }}>Oberlin Environmental Dashboard</div>
        </div>

        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, textAlign: 'center' }}>
          Sign in
        </h1>
        <p style={{ fontSize: 13, color: '#888', textAlign: 'center', marginBottom: '1.75rem', lineHeight: 1.5 }}>
          Access is restricted to approved users.<br/>Sign in with your Google account.
        </p>

        {error && (
          <div style={{
            background: '#fdecea', color: '#c0392b', border: '1px solid #f5c6cb',
            padding: '0.75rem 0.875rem', borderRadius: 8, fontSize: 13,
            marginBottom: '1.25rem', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '0.8rem',
            border: '1.5px solid #ddd', borderRadius: 8,
            background: 'white', cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 14, fontWeight: 600, color: '#333',
            transition: 'border-color 0.15s, box-shadow 0.15s',
            opacity: loading ? 0.7 : 1,
          }}
          onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = '#3a8c3f'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#ddd'; }}
        >
          {/* Google icon */}
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.8 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8.9 20-20 0-1.2-.1-2.3-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19.1 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.8 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8l-6.6 5.1C9.7 39.8 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4-4.1 5.2l6.2 5.2C43 34.7 44 29.7 44 24c0-1.2-.1-2.3-.4-3.5z"/>
          </svg>
          {loading ? 'Signing in…' : 'Continue with Google'}
        </button>

        <p style={{ fontSize: 11, color: '#bbb', textAlign: 'center', marginTop: '1.5rem', lineHeight: 1.5 }}>
          Don't have access? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
