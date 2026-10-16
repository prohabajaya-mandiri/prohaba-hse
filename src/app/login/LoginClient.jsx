'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogIn, ShieldCheck, ShieldAlert, Users } from 'lucide-react';

export default function LoginClient() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', operator: '', pin: '' });
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn('credentials', {
      redirect: false,
      email: form.email,
      password: form.password,
      ...(shared ? { operator: form.operator, pin: form.pin } : {}),
    });
    if (res?.error) {
      setError(shared ? 'Email, password, nama operator atau PIN salah.' : 'Email atau password salah. Jika ini akun bersama site, isi nama operator & PIN.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, var(--navy-900) 0%, var(--navy-800) 100%)', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-10%', right: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.15) 0%, rgba(255,255,255,0) 70%)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(249,115,22,0.1) 0%, rgba(255,255,255,0) 70%)' }} />
      </div>

      <div className="card" style={{ maxWidth: 440, width: '100%', padding: 40, position: 'relative', zIndex: 10, boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, var(--orange-500), var(--orange-600))', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 10px 15px -3px rgba(249, 115, 22, 0.3)' }}>
            <ShieldCheck style={{ width: 32, height: 32, color: 'white' }} />
          </div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--gray-900)' }}>E-HSE Prohaba</h1>
          <p style={{ color: 'var(--gray-500)', fontSize: 14, marginTop: 8 }}>Health, Safety & Environment — HO dan seluruh site</p>
        </div>

        {error && (
          <div style={{ background: 'var(--red-50)', border: '1px solid var(--red-100)', color: 'var(--red-600)', padding: '12px 16px', borderRadius: 12, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, fontSize: 14, fontWeight: 500 }}>
            <ShieldAlert style={{ width: 20, height: 20, flexShrink: 0 }} />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="form-group">
            <label className="form-label">Email</label>
            <input type="email" className="form-input" placeholder="nama@prohaba.co.id" value={form.email} onChange={set('email')} required disabled={loading} autoComplete="username" style={{ padding: '12px 16px', fontSize: 15 }} />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input type="password" className="form-input" placeholder="••••••••" value={form.password} onChange={set('password')} required disabled={loading} autoComplete="current-password" style={{ padding: '12px 16px', fontSize: 15 }} />
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--gray-600)', cursor: 'pointer' }}>
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            <Users size={15} /> Akun bersama site (wajib identitas operator)
          </label>

          {shared && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label required">Nama operator</label>
                <input className="form-input" value={form.operator} onChange={set('operator')} required disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label required">PIN</label>
                <input type="password" inputMode="numeric" className="form-input" value={form.pin} onChange={set('pin')} required disabled={loading} maxLength={12} />
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: 14, fontSize: 15, marginTop: 8, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }} disabled={loading}>
            {loading ? <span className="spinner" /> : (<><LogIn style={{ width: 20, height: 20 }} /> Masuk ke Sistem</>)}
          </button>
        </form>

        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--gray-400)' }}>&copy; {new Date().getFullYear()} PT. Prohaba Jaya Mandiri. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
