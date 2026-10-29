// Nilai awal parameter Bab 7. Semua berstatus DRAFT sampai disetujui HO PJM;
// angka di sini adalah usulan developer, bukan aturan produksi.
export const SETTING_DEFAULTS = {
  'mcu.durations': {
    label: 'Estimasi durasi alur MCU (hari)',
    value: { screening: 1, mcu: 1, waitResult: 3, feedbackMin: 3, feedbackMax: 5, followUp: 2, mobilization: 2 },
  },
  'mcu.annualMonths': { label: 'Masa berlaku MCU annual (bulan)', value: 12 },
  'permit.defaults': {
    label: 'Acuan masa berlaku permit',
    value: { fitMonths: 12, followUpMonths: 3 },
  },
  'reminder.thresholds': {
    label: 'Ambang pengingat (hari sebelum jatuh tempo)',
    value: { mcuAnnual: 30, permit: 30, followUp: 7, certificate: 30, roster: 14, document: 30 },
  },
  'report.monthlyDeadlineDay': { label: 'Batas laporan bulanan (tanggal bulan berikutnya)', value: 10 },
  'performance.manhours': {
    label: 'Formula manhours',
    value: {
      formula: 'manpower × jam kerja normal + jam lembur − jam pengecualian',
      safeResetCategories: ['LTI', 'FATALITY'],
      weekStart: 1,
      inputLockDays: 7,
    },
  },
  'access.salary': {
    label: 'Matriks akses data gaji',
    value: { view: ['HRD', 'DIREKSI'], edit: ['HRD'] },
  },
  'incident.categories': {
    label: 'Kategori insiden (standar owner)',
    value: ['NEAR_MISS', 'FAC', 'MTC', 'LTI', 'FATALITY', 'PROPERTY_DAMAGE', 'ENVIRONMENT', 'LAINNYA'],
  },
  'incident.reportingDeadlines': {
    label: 'Tenggat pelaporan insiden ke owner (jam)',
    value: { FATALITY: 1, LTI: 24, MTC: 24, FAC: 48, NEAR_MISS: 72 },
  },
  'workPermit.types': {
    label: 'Jenis izin kerja khusus (umum & per owner)',
    value: {
      default: ['Bekerja di Ketinggian', 'Pekerjaan Panas (Hot Work)', 'Ruang Terbatas', 'Isolasi Energi / LOTO', 'Penggalian', 'Pengangkatan Kritis'],
      byOwner: {},
    },
  },
  'csms.reminders': {
    label: 'Ambang pengingat CSMS (hari)',
    value: { dueSoonDays: 7, evidenceExpiringDays: 30, findingDueSoonDays: 7, lateWindowDays: 60 },
  },
  'permit.types': {
    label: 'Jenis permit / SKS',
    // Izin kerja aktivitas (ketinggian, panas, dll.) dicatat di Izin Kerja Khusus, bukan permit personel.
    value: ['ID Card / Mine Permit', 'SIMPER', 'KIMPER', 'SKS'],
  },
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS);
