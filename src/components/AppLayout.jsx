'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout({ children, title, subtitle, user }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);

  // Laci navigasi di layar kecil ditutup setiap kali halaman berganti,
  // termasuk lewat tombol maju/mundur peramban.
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    if (isSidebarOpen) setIsSidebarOpen(false);
  }

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKey = (e) => e.key === 'Escape' && setIsSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSidebarOpen]);

  return (
    <div className="app-layout">
      <Sidebar user={user} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />
      {isSidebarOpen && <div className="sidebar-mobile-overlay" onClick={() => setIsSidebarOpen(false)} aria-hidden />}

      <div className="main-content">
        <Header title={title} subtitle={subtitle} user={user} onMenuClick={() => setIsSidebarOpen(true)} />
        {/* Hanya memudar, tanpa geser/skala: transform pada pembungkus akan
            membuat modal berposisi fixed ikut bergeser. */}
        <main id="main-content" className="page-container page-enter">
          {children}
        </main>
        <footer className="app-footer no-print">
          <span>© {new Date().getFullYear()} PT. Prohaba Jaya Mandiri</span>
          <span>E-HSE Prohaba · Health, Safety & Environment</span>
        </footer>
      </div>
    </div>
  );
}
