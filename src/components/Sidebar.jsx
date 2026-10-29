'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Bell, CheckSquare, Users, ArrowLeftRight, CalendarDays, Plane,
  HeartPulse, BadgeCheck, GraduationCap, Activity, FileText, Siren, FolderLock,
  Wallet, MapPin, UserCog, SlidersHorizontal, History, LogOut, X, ChevronDown, UserPlus, ClipboardCheck, FileCheck2,
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
      { href: '/registrations', label: 'Pendaftaran Baru', icon: UserPlus },
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
      { href: '/csms', label: 'CSMS', icon: ClipboardCheck },
      { href: '/work-permits', label: 'Izin Kerja Khusus', icon: FileCheck2 },
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

const isActiveHref = (pathname, href) => pathname === href || pathname.startsWith(href + '/');

// Setiap halaman merender AppLayout-nya sendiri, jadi Sidebar dipasang ulang
// tiap kali halaman berganti. Posisi gulir dan modul yang dibuka/ditutup
// disimpan di sini agar tidak kembali ke awal. Hanya diubah di browser.
const navMemory = { scrollTop: 0, expanded: {}, activeHref: null, anchor: null };

export default function Sidebar({ user, isOpen, setIsOpen }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showConfirm } = useDialog();
  const navRef = useRef(null);
  const activeHref = NAV_ITEMS.flatMap((s) => s.items).find((i) => isActiveHref(pathname, i.href))?.href ?? null;
  // Pilihan buka/tutup manual per modul. Modul aktif terbuka secara bawaan;
  // saat berpindah ke modul lain, modul tujuannya dibuka kembali.
  const [expanded, setExpanded] = useState(() => {
    if (activeHref === navMemory.activeHref) return navMemory.expanded;
    const next = { ...navMemory.expanded };
    delete next[activeHref];
    return next;
  });

  useEffect(() => {
    navMemory.expanded = expanded;
    navMemory.activeHref = activeHref;
  }, [expanded, activeHref]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    nav.scrollTop = navMemory.scrollTop;
    const anchor = navMemory.anchor;
    navMemory.anchor = null;
    const current = nav.querySelector('[aria-current="page"]');
    if (current) {
      const box = nav.getBoundingClientRect();
      if (anchor && current.getAttribute('href') === anchor.href) {
        // Menu yang baru diklik tetap di posisi yang sama di layar, walau
        // sub-menu modul sebelumnya ikut tertutup dan isi sidebar bergeser.
        nav.scrollTop += current.getBoundingClientRect().top - box.top - anchor.top;
      }
      // Pastikan menu aktif terlihat, mis. saat halaman dibuka dari luar sidebar.
      const item = current.getBoundingClientRect();
      if (item.top < box.top) nav.scrollTop -= box.top - item.top + 8;
      else if (item.bottom > box.bottom) nav.scrollTop += item.bottom - box.bottom + 8;
    }
    // Simpan juga saat dilepas: event scroll bisa belum terkirim.
    return () => { navMemory.scrollTop = nav.scrollTop; };
  }, [pathname]);

  const rememberClick = (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const top = link.getBoundingClientRect().top - e.currentTarget.getBoundingClientRect().top;
    navMemory.anchor = { href: link.getAttribute('href'), top };
  };

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

      <nav
        ref={navRef}
        className="sidebar-nav"
        onScroll={(e) => { navMemory.scrollTop = e.currentTarget.scrollTop; }}
        onClickCapture={rememberClick}
      >
        {NAV_ITEMS.map((section) => {
          const visible = section.items.filter((item) => canAccess(role, item.href));
          if (!visible.length) return null;
          return (
            <div key={section.section} className="nav-section">
              <div className="nav-section-label">{section.section}</div>
              {visible.map((item) => {
                const active = item.href === activeHref;
                const Icon = item.icon;
                const subs = tabsFor(item.href, role);
                const config = MODULE_TABS[item.href];
                const open = subs.length > 0 && (expanded[item.href] ?? active);
                const activeSub = active && config ? currentTab(item.href, searchParams.get(config.param), role) : null;
                const subId = `nav-sub${item.href.replace(/\//g, '-')}`;
                return (
                  <div key={item.href} className={`nav-group ${open ? 'open' : ''}`}>
                    {subs.length > 0 ? (
                      // Seluruh baris modul menjadi tombol buka/tutup; navigasi
                      // ke halaman modul lewat sub-menunya.
                      <button
                        type="button"
                        className={`nav-item has-sub ${active ? 'active' : ''}`}
                        aria-expanded={open}
                        aria-controls={subId}
                        onClick={() => setExpanded((e) => ({ ...e, [item.href]: !open }))}
                      >
                        <Icon className="nav-icon" aria-hidden />
                        <span className="nav-label">{item.label}</span>
                        <ChevronDown className="nav-caret" aria-hidden />
                      </button>
                    ) : (
                      <Link
                        href={item.href}
                        className={`nav-item ${active ? 'active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setIsOpen?.(false)}
                      >
                        <Icon className="nav-icon" aria-hidden />
                        <span className="nav-label">{item.label}</span>
                      </Link>
                    )}
                    {open && (
                      <div className="nav-sub" id={subId}>
                        {subs.map(([key, label]) => (
                          <Link
                            key={key}
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
