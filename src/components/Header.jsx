'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { Bell } from 'lucide-react';

export default function Header({ title, subtitle, user, onMenuClick }) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    fetch('/api/notifications?count=1')
      .then((r) => (r.ok ? r.json() : { unread: 0 }))
      .then((d) => alive && setUnread(d.unread ?? 0))
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname]);

  const display = user?.operatorName || user?.name;

  return (
    <header className="header glass-nav">
      <div className="header-breadcrumb" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <button
          className="mobile-menu-btn"
          onClick={onMenuClick}
          aria-label="Buka menu"
          style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--navy-600)' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="header-title truncate">{title}</div>
          {subtitle && <div className="header-subtitle truncate">{subtitle}</div>}
        </div>
      </div>

      <div className="header-actions">
        <Link href="/notifications" className="header-btn" title="Notifikasi" aria-label={`Notifikasi, ${unread} belum dibaca`}>
          <Bell size={18} />
          {unread > 0 && <span className="notif-count">{unread > 99 ? '99+' : unread}</span>}
        </Link>

        <div className="hide-mobile" style={{ fontSize: 12, color: 'var(--gray-500)', padding: '0 8px', borderLeft: '1px solid var(--gray-200)', borderRight: '1px solid var(--gray-200)', lineHeight: 1.4, textAlign: 'right' }}>
          <div style={{ fontWeight: 600, color: 'var(--gray-700)' }}>
            {new Date().toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
          <div>{new Date().getFullYear()}</div>
        </div>

        <div style={{ position: 'relative' }}>
          <button
            className="header-btn"
            style={{ width: 'auto', padding: '6px 10px', gap: 8, display: 'flex', alignItems: 'center' }}
            onClick={() => setShowUserMenu(!showUserMenu)}
          >
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--navy-600), var(--orange-500))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'white', flexShrink: 0,
            }}>
              {display?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showUserMenu && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowUserMenu(false)} />
              <div style={{
                position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                background: 'white', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--gray-200)', boxShadow: 'var(--shadow-lg)',
                minWidth: 220, zIndex: 100, overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--gray-100)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-900)' }}>{display}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--gray-500)' }}>{user?.operatorName ? 'Akun bersama: ' + user.name : user?.email}</div>
                </div>
                <Link href="/account" onClick={() => setShowUserMenu(false)} style={{ display: 'block', padding: '10px 16px', fontSize: 13.5, color: 'var(--gray-700)', textDecoration: 'none' }}>
                  Akun & kata sandi
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  style={{
                    width: '100%', padding: '10px 16px', textAlign: 'left',
                    fontSize: 13.5, color: 'var(--red-600)', fontWeight: 500,
                    background: 'none', border: 'none', borderTop: '1px solid var(--gray-100)', cursor: 'pointer', fontFamily: 'var(--font-sans)',
                  }}
                >
                  Keluar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
