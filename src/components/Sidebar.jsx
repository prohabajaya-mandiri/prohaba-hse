'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Bell, CheckSquare, Users, ArrowLeftRight, CalendarDays, Plane,
  HeartPulse, BadgeCheck, GraduationCap, Activity, FileText, Siren, FolderLock,
  Wallet, MapPin, UserCog, SlidersHorizontal, History, LogOut, X, ChevronDown,
} from 'lucide-react';
import { useDialog } from './DialogProvider';
import { canAccess, ROLE_LABELS } from '@/lib/access';
import { MODULE_TABS, currentTab, tabsFor } from '@/lib/module-tabs';

const NAV_ITEMS = [
  {
    section: 'Utama',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/notifications', label: 'Notifikasi', icon: Bell },
      { href: '/approvals', label: 'Persetujuan', icon: CheckSquare },
    ],
  },
  {
    section: 'Personel',
    items: [
      { href: '/personnel', label: 'Master Data Karyawan', icon: Users },
      { href: '/placements', label: 'Penempatan & Mutasi', icon: ArrowLeftRight },
      { href: '/roster', label: 'Roster & Cuti', icon: CalendarDays },
      { href: '/mobilization', label: 'Mobilisasi', icon: Plane },
    ],
  },
  {
    section: 'Kesehatan & Izin',
    items: [
      { href: '/mcu', label: 'Medical Check Up', icon: HeartPulse },
      { href: '/permits', label: 'Permit & SKS', icon: BadgeCheck },
      { href: '/training', label: 'Training & Kompetensi', icon: GraduationCap },
    ],
  },
  {
    section: 'HSE',
    items: [
      { href: '/performance', label: 'HSE Performance', icon: Activity },
      { href: '/reports', label: 'Laporan HSE Site', icon: FileText },
      { href: '/incidents', label: 'Insiden', icon: Siren },
      { href: '/documents', label: 'Dokumen HSE', icon: FolderLock },
    ],
  },
  {
    section: 'Manajemen',
    items: [{ href: '/hrd', label: 'Monitoring HRD', icon: Wallet }],
  },
  {
    section: 'Sistem',
    items: [
      { href: '/sites', label: 'Site & Proyek', icon: MapPin },
      { href: '/users', label: 'Pengguna', icon: UserCog },
      { href: '/settings', label: 'Parameter', icon: SlidersHorizontal },
      { href: '/audit-log', label: 'Audit Log', icon: History },
    ],
  },
];

const initials = (name) => (name || 'U').trim().split(/\s+/).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

export default function Sidebar({ user, isOpen, setIsOpen }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showConfirm } = useDialog();
  // Modul yang dibuka manual lewat panah; modul yang sedang aktif selalu terbuka.
  const [expanded, setExpanded] = useState({});
  if (!user) return null;
  const role = user.role;

  const handleLogout = async () => {
    if (await showConfirm('Apakah Anda yakin ingin keluar dari aplikasi?', 'Keluar')) signOut({ callbackUrl: '/login' });
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`} aria-label="Navigasi utama">
      <div className="sidebar-logo">
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, color: 'inherit' }}>
          <Image src="/brand/prohaba-hse-logo.png" alt="Logo Prohaba Jaya Mandiri dan K3" width={88} height={41} priority />
          <span className="sidebar-logo-text">
            <span className="sidebar-logo-name" style={{ display: 'block' }}>E-HSE</span>
            <span className="sidebar-logo-sub" style={{ display: 'block' }}>Prohaba Jaya Mandiri</span>
          </span>
        </Link>
        <button type="button" className="sidebar-close" onClick={() => setIsOpen?.(false)} aria-label="Tutup navigasi">
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((section) => {
          const visible = section.items.filter((item) => canAccess(role, item.href));
          if (!visible.length) return null;
          return (
            <div key={section.section} className="nav-section">
              <div className="nav-section-label">{section.section}</div>
              {visible.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                const subs = tabsFor(item.href);
                const config = MODULE_TABS[item.href];
                const open = subs.length > 0 && (expanded[item.href] ?? active);
                const activeSub = active && config ? currentTab(item.href, searchParams.get(config.param)) : null;
                return (
                  <div key={item.href} className={`nav-group ${open ? 'open' : ''}`}>
                    <div className="nav-row">
                      <Link
                        href={item.href}
                        className={`nav-item ${active ? 'active' : ''} ${subs.length ? 'has-sub' : ''}`}
                        aria-current={active && !subs.length ? 'page' : undefined}
                        onClick={() => {
                          if (subs.length) setExpanded((e) => ({ ...e, [item.href]: true }));
                          else setIsOpen?.(false);
                        }}
                      >
                        <Icon className="nav-icon" aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                      {subs.length > 0 && (
                        <button
                          type="button"
                          className="nav-toggle"
                          aria-expanded={open}
                          aria-label={`${open ? 'Tutup' : 'Buka'} sub-menu ${item.label}`}
                          onClick={() => setExpanded((e) => ({ ...e, [item.href]: !open }))}
                        >
                          <ChevronDown aria-hidden />
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="nav-sub" role="list">
                        {subs.map(([key, label]) => (
                          <Link
                            key={key}
                            role="listitem"
                            href={`${item.href}?${config.param}=${key}`}
                            className={`nav-subitem ${activeSub === key ? 'active' : ''}`}
                            aria-current={activeSub === key ? 'page' : undefined}
                            onClick={() => setIsOpen?.(false)}
                          >
                            {label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">
          <Link href="/account" className="sidebar-user-link" title="Akun & kata sandi">
            <div className="user-avatar" aria-hidden>{initials(user.operatorName || user.name)}</div>
            <div className="user-info">
              <div className="user-name">{user.operatorName || user.name}</div>
              <div className="user-role">
                {ROLE_LABELS[role] || role}{user.operatorName ? ' · ' + user.name : ''}
              </div>
            </div>
          </Link>
          <button type="button" onClick={handleLogout} className="icon-btn danger" title="Keluar" aria-label="Keluar">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
