'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Bell, ChevronDown, KeyRound, LogOut, Menu, Moon, Sun } from 'lucide-react';
import { ROLE_LABELS } from '@/lib/access';

// Tema awal dipasang skrip di layout.js; atribut data-theme pada <html> jadi sumber kebenaran.
const subscribeTheme = (cb) => {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
};

const initials =(name) => (name || 'U').trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export default function Header({ title, subtitle, user, onMenuClick }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.dataset.theme === 'dark', () => false);
  const pathname = usePathname();

  const toggleTheme = () => {
    const next = !dark;
    if (next) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('theme', next ? 'dark' : 'light'); } catch {}
  };

  useEffect(() => {
    let alive = true;
    fetch('/api/notifications?count=1')
      .then((r) => (r.ok ? r.json() : { unread: 0 }))
      .then((d) => alive && setUnread(d.unread ?? 0))
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  useEffect(() => {
    if (!showUserMenu) return;
    const onKey = (e) => e.key === 'Escape' && setShowUserMenu(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showUserMenu]);

  const display = user?.operatorName || user?.name;
  const today = new Date();

  return (
    <header className="header">
      <button type="button" className="icon-btn mobile-menu-btn" onClick={onMenuClick} aria-label="Buka navigasi">
        <Menu size={22} />
      </button>

      <div className="header-breadcrumb">
        <h1 className="header-title">{title}</h1>
        {subtitle && <div className="header-subtitle">{subtitle}</div>}
      </div>

      <div className="header-actions">
        <div className="header-date" suppressHydrationWarning>
          <strong>{today.toLocaleDateString('id-ID', { weekday: 'long' })}</strong>
          {today.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>

        <button type="button" className="header-btn" onClick={toggleTheme} title={dark ? 'Mode terang' : 'Mode gelap'} aria-label={dark ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'} aria-pressed={dark}>
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        <Link href="/notifications" className="header-btn" title="Notifikasi" aria-label={unread ? `Notifikasi, ${unread} belum dibaca` : 'Notifikasi'}>
          <Bell size={20} />
          {unread > 0 && <span className="notif-count">{unread > 99 ? '99+' : unread}</span>}
        </Link>

        <div className="user-menu">
          <button
            type="button"
            className="user-menu-trigger"
            onClick={() => setShowUserMenu((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={showUserMenu}
          >
            <span className="user-avatar" aria-hidden>{initials(display)}</span>
            <span className="user-menu-text">
              <span className="user-menu-name">{display || 'Pengguna'}</span>
              <span className="user-menu-role">{ROLE_LABELS[user?.role] || user?.role}</span>
            </span>
            <ChevronDown size={16} style={{ color: 'var(--gray-400)' }} aria-hidden />
          </button>

          {showUserMenu && (
            <>
              <div className="menu-backdrop" onClick={() => setShowUserMenu(false)} />
              <div className="menu-panel" role="menu">
                <div className="menu-head">
                  <strong>{display}</strong>
                  <span>{user?.operatorName ? 'Akun bersama: ' + user.name : user?.email}</span>
                </div>
                <Link href="/account" role="menuitem" className="menu-item" onClick={() => setShowUserMenu(false)}>
                  <KeyRound size={17} /> Akun & kata sandi
                </Link>
                <button type="button" role="menuitem" className="menu-item danger" onClick={() => signOut({ callbackUrl: '/login' })}>
                  <LogOut size={17} /> Keluar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
