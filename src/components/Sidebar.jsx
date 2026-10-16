'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  LayoutDashboard, Bell, CheckSquare, Users, ArrowLeftRight, CalendarDays, Plane,
  HeartPulse, BadgeCheck, GraduationCap, Activity, FileText, Siren, FolderLock,
  Wallet, MapPin, UserCog, SlidersHorizontal, History, LogOut,
} from 'lucide-react';
import { useDialog } from './DialogProvider';
import { canAccess, ROLE_LABELS } from '@/lib/access';

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
      { href: '/personnel', label: 'Database Personel', icon: Users },
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

export default function Sidebar({ user, isOpen, setIsOpen }) {
  const pathname = usePathname();
  const { showConfirm } = useDialog();
  if (!user) return null;
  const role = user.role;
  const initials = (user.operatorName || user.name || 'U').split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();

  const handleLogout = async () => {
    if (await showConfirm('Apakah Anda yakin ingin keluar dari aplikasi?')) signOut({ callbackUrl: '/login' });
  };

  return (
    <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
      <div className="sidebar-logo">
        <div className="sidebar-logo-inner">
          <div className="sidebar-logo-icon">P</div>
          <div className="sidebar-logo-text">
            <div className="sidebar-logo-name">Prohaba Jaya Mandiri</div>
            <div className="sidebar-logo-sub">E-HSE</div>
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((section) => {
          const visible = section.items.filter((item) => canAccess(role, item.href));
          if (!visible.length) return null;
          return (
            <div key={section.section} className="nav-section">
              <div className="nav-section-label">{section.section}</div>
              {visible.map((item) => {
                const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'));
                const Icon = item.icon;
                return (
                  <Link key={item.href} href={item.href} className={`nav-item ${active || pathname === item.href ? 'active' : ''}`} onClick={() => setIsOpen?.(false)}>
                    <Icon size={18} className="nav-icon" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/account" style={{ display: 'flex', gap: 12, alignItems: 'center', textDecoration: 'none', minWidth: 0 }}>
            <div className="user-avatar">{initials}</div>
            <div className="user-info" style={{ minWidth: 0 }}>
              <div className="user-name truncate" style={{ fontSize: 13 }}>{user.operatorName || user.name}</div>
              <div className="user-role truncate" style={{ fontSize: 11 }}>
                {ROLE_LABELS[role] || role}{user.operatorName ? ' · ' + user.name : ''}
              </div>
            </div>
          </Link>
          <button
            onClick={handleLogout}
            style={{ background: 'transparent', border: 'none', color: 'var(--red-500)', cursor: 'pointer', padding: 4, display: 'flex', borderRadius: 4 }}
            title="Keluar"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
