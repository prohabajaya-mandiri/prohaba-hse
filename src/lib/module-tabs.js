// Sub-menu modul yang tampil di sidebar. Setiap sub-menu adalah tampilan pada
// halaman modulnya, dipilih lewat ?tab= sehingga bisa dibuka langsung dan
// tetap terpilih saat halaman dimuat ulang. Aman dipakai di client.

// Item sub-menu: [kunci, label, peran?]; peran (opsional) membatasi sub-menu yang tampil di sidebar.
export const MODULE_TABS = {
  '/csms': {
    param: 'tab',
    items: [
      ['summary', 'Ringkasan CSMS'],
      ['checklist', 'Checklist & Bukti Pemenuhan'],
      ['documents', 'Dokumen Induk HO'],
      ['verify', 'Verifikasi & Tindak Lanjut'],
      ['setup', 'Template & Penerapan', ['HO_HSE']],
    ],
  },
  '/roster': {
    param: 'tab',
    items: [
      ['board', 'Papan roster'],
      ['leaves', 'Cuti, izin & sakit'],
      ['policies', 'Pola roster'],
    ],
  },
  '/training': {
    param: 'tab',
    items: [
      ['certificates', 'Sertifikat personel'],
      ['sessions', 'Jadwal & hasil training'],
      ['gaps', 'Kebutuhan kompetensi'],
      ['master', 'Master kompetensi'],
    ],
  },
  '/performance': {
    param: 'tab',
    items: [
      ['recap', 'Rekap & tren'],
      ['input', 'Input harian'],
      ['activities', 'Aktivitas HSE'],
      ['indicators', 'Indikator & target'],
    ],
  },
};

export function tabsFor(path, role) {
  const items = MODULE_TABS[path]?.items ?? [];
  return role ? items.filter(([, , roles]) => !roles || roles.includes(role)) : items;
}

/** Kunci sub-menu yang valid dari nilai query; jatuh ke sub-menu pertama. */
export function currentTab(path, value, role) {
  const items = tabsFor(path, role);
  return items.some(([key]) => key === value) ? value : items[0]?.[0];
}

export function tabLabel(path, key) {
  return tabsFor(path).find(([k]) => k === key)?.[1] ?? '';
}
