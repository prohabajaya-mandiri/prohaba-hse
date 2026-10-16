'use client';

import { useState } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { LogIn, ShieldAlert, Eye, EyeOff } from 'lucide-react';

export default function LoginClient() {
  const router = useRouter();
  const [form, setForm] = useState({ email: '', password: '', operator: '', pin: '' });
  const [shared, setShared] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      setError(shared ? 'Email, kata sandi, nama operator, atau PIN salah.' : 'Email atau kata sandi salah. Jika ini akun bersama site, centang "Akun bersama site" lalu isi nama operator dan PIN.');
      setLoading(false);
    } else {
      router.push('/dashboard');
      router.refresh();
    }
  };

  return (
    <main className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Image src="/brand/prohaba-hse-logo.png" alt="Prohaba Jaya Mandiri — Utamakan Keselamatan dan Kesehatan Kerja" width={206} height={96} priority />
        </div>
        <h1 className="login-title">E-HSE Prohaba</h1>
        <p className="login-desc">Masuk untuk melanjutkan</p>

        {error && (
          <div role="alert" className="alert alert-danger" style={{ marginBottom: 18 }}>
            <ShieldAlert aria-hidden />
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="login-form">
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email</label>
            <input id="login-email" type="email" className="form-input" placeholder="nama@prohaba.co.id" value={form.email} onChange={set('email')} required disabled={loading} autoComplete="username" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Kata sandi</label>
            <div style={{ position: 'relative' }}>
              <input id="login-password" type={showPassword ? 'text' : 'password'} className="form-input" value={form.password} onChange={set('password')} required disabled={loading} autoComplete="current-password" style={{ paddingRight: 48 }} />
              <button
                type="button"
                className="icon-btn"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                style={{ position: 'absolute', right: 3, top: 3 }}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <label className="check-row">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} disabled={loading} />
            Akun bersama site (wajib isi identitas operator)
          </label>

          {shared && (
            <div className="form-grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
              <div className="form-group">
                <label className="form-label required" htmlFor="login-operator">Nama operator</label>
                <input id="login-operator" className="form-input" value={form.operator} onChange={set('operator')} required disabled={loading} />
              </div>
              <div className="form-group">
                <label className="form-label required" htmlFor="login-pin">PIN</label>
                <input id="login-pin" type="password" inputMode="numeric" className="form-input" value={form.pin} onChange={set('pin')} required disabled={loading} maxLength={12} />
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <><span className="spinner" aria-hidden /> Memeriksa…</> : <><LogIn aria-hidden /> Masuk</>}
          </button>
        </form>

        <p className="login-foot">© {new Date().getFullYear()} PT. Prohaba Jaya Mandiri</p>
      </div>
    </main>
  );
}
