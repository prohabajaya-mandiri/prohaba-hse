// Label tampilan & warna badge untuk seluruh kode status (dipakai client & server).
export const LABELS = {
  // status kerja
  ACTIVE: 'Active', CUTI: 'Cuti', SAKIT: 'Sakit', MCU: 'MCU', RESIGN: 'Resign', PHK: 'PHK', DIRUMAHKAN: 'Dirumahkan', MUTASI: 'Mutasi',
  ENDED: 'Berakhir',
  // pendaftaran pegawai baru
  MENUNGGU: 'Menunggu verifikasi', DISETUJUI: 'Disetujui', DITOLAK: 'Ditolak',
  // status kepegawaian
  PKWT: 'PKWT (Kontrak)', PKWTT: 'PKWTT (Tetap)',
  // kategori
  STAFF: 'Staff', HARIAN_KANTOR: 'Harian Kantor', MANPOWER: 'Harian Mandor',
  // MCU
  PENDING: 'Menunggu', FIT: 'FIT', FOLLOW_UP: 'FOLLOW UP', UNFIT: 'UNFIT',
  PRE_EMPLOYMENT: 'Pre-Employment', ANNUAL: 'Annual', KHUSUS: 'Khusus',
  BELUM_MCU: 'Belum MCU', PROSES: 'Proses MCU', FU_TERLAMBAT: 'FU terlambat', MCU_KEDALUWARSA: 'MCU kedaluwarsa',
  SCREENING: 'Screening', MENUNGGU_HASIL: 'Menunggu hasil', SUBMIT: 'Submit', FEEDBACK: 'Feedback', SUBMIT_FU: 'Submit FU', MOBILISASI: 'Mobilisasi', SELESAI: 'Selesai',
  // permit
  PERMIT: 'Permit', SKS: 'SKS', AKTIF: 'Aktif', AKAN_HABIS: 'Akan habis', KEDALUWARSA: 'Kedaluwarsa', DICABUT: 'Dicabut', BELUM_BERLAKU: 'Belum berlaku',
  // mutasi / approval
  APPROVED: 'Disetujui', REJECTED: 'Ditolak', CANCELLED: 'Dibatalkan',
  // mobilisasi
  DEMOBILISASI: 'Demobilisasi', DIRENCANAKAN: 'Direncanakan', MENUNGGU_PERSYARATAN: 'Menunggu persyaratan', SIAP: 'Siap',
  PERJALANAN: 'Perjalanan', TIBA: 'Tiba', BATAL: 'Batal',
  // roster
  IZIN: 'Izin', OFF_ROSTER: 'Off roster', RENCANA: 'Rencana', BERJALAN: 'Berjalan',
  ONSITE: 'Onsite', MENDEKATI_CUTI: 'Mendekati cuti', LEWAT_JADWAL: 'Lewat jadwal', TANPA_POLA: 'Pola belum diatur', SEDANG_CUTI: 'Sedang cuti/off',
  MENIKAH: 'Menikah', BELUM_MENIKAH: 'Belum menikah', CERAI: 'Cerai',
  // laporan
  HARIAN: 'Harian', MINGGUAN: 'Mingguan', BULANAN: 'Bulanan',
  DRAFT: 'Draft', SUBMITTED: 'Dikirim', REVIEWED: 'Diperiksa PJO/PM', REVISION: 'Perlu revisi',
  // insiden
  NEAR_MISS: 'Near Miss', FAC: 'FAC', MTC: 'MTC', LTI: 'LTI', FATALITY: 'Fatality', PROPERTY_DAMAGE: 'Property Damage',
  ENVIRONMENT: 'Lingkungan', LAINNYA: 'Lainnya', OPEN: 'Open', INVESTIGASI: 'Investigasi', TINDAK_LANJUT: 'Tindak lanjut', CLOSED: 'Closed',
  KOREKTIF: 'Korektif', PENCEGAHAN: 'Pencegahan', DONE: 'Selesai',
  // training
  LULUS: 'Lulus', TIDAK_LULUS: 'Tidak lulus', VALID: 'Berlaku', MISSING: 'Belum ada', EXPIRING: 'Akan habis', EXPIRED: 'Kedaluwarsa',
  // HRD
  HIJAU: 'Hijau — Lanjut', KUNING: 'Kuning — Dipertimbangkan', MERAH: 'Merah — Diberhentikan',
  LANJUT: 'Lanjut', DIBERHENTIKAN: 'Diberhentikan', TOTAL: 'Gaji total', POKOK: 'Gaji pokok',
  // dokumen
  HSE_PLAN: 'HSE Plan', KPLH: 'KPLH', SOP: 'SOP', IBPR: 'IBPR', SMKP: 'SMKP', AUDIT: 'Audit',
  STANDARISASI_MITRA: 'Standarisasi Mitra', PRAKUALIFIKASI: 'Prakualifikasi', SERTIFIKASI: 'Sertifikasi',
  COMPLIANCE_OWNER: 'Compliance Owner', BERLAKU: 'Berlaku', ARSIP: 'Arsip',
  // site
  TIMUR: 'Timur', BARAT: 'Barat', HO: 'Head Office', NONAKTIF: 'Nonaktif',
  // role
  HO_HSE: 'HO HSE', HSE_SITE: 'HSE Site', HRD: 'HRD HO', PJO: 'PJO', PM: 'Project Manager', DIREKSI: 'Direksi',
  // CSMS
  BELUM: 'Belum diisi', VERIFIED: 'Terverifikasi', RETIRED: 'Pensiun', APPLICABLE: 'Berlaku', NA: 'N/A', NA_PENDING: 'Usulan N/A',
  OVERDUE: 'Tenggat terlewati', EVIDENCE_EXPIRED: 'Bukti kedaluwarsa', EVIDENCE_EXPIRING: 'Mendekati kedaluwarsa',
  BERSAMA: 'Bersama', SITE: 'Site', TEMPLATE: 'Template', SITE_ADDITION: 'Tambahan site',
  RETURNED: 'Dikembalikan', SUPERSEDED: 'Digantikan',
  LOGISTIK: 'Logistik', OPERASIONAL: 'Operasional', MEKANIK: 'Mekanik', ADMIN_LEGAL: 'Administrasi/Legal', MANAJEMEN_PROYEK: 'Manajemen proyek',
  DEFAULT: 'HO: semua site', LISTED: 'Site terpilih', HO_ONLY: 'Terbatas (HO)',
  TERBUKA: 'Terbuka', DALAM_PROSES: 'Dalam proses', DIAJUKAN_TUTUP: 'Diajukan untuk penutupan', DITUTUP: 'Ditutup',
  ASSESSMENT: 'Assessment', INSPEKSI: 'Inspeksi', INSIDEN: 'Insiden', PEMERIKSAAN_DOKUMEN: 'Pemeriksaan dokumen',
  RENDAH: 'Rendah', SEDANG: 'Sedang', TINGGI: 'Tinggi', INTI: 'Inti', NON_INTI: 'Non inti', LOKAL: 'Lokal', NASIONAL: 'Nasional',
  SAFETY_OFFICER: 'Safety Officer',
  TERCATAT: 'Tercatat', BERAKHIR: 'Berakhir', DIBATALKAN: 'Dibatalkan', FINAL: 'Final',
  // indikator
  ACTIVITY: 'Aktivitas', OBSERVATION: 'Observasi', INCIDENT: 'Kejadian',
};

export const labelOf = (v) => LABELS[v] ?? v;

const green = 'badge-success', yellow = 'badge-warning', red = 'badge-danger', blue = 'badge-info', navy = 'badge-navy', orange = 'badge-orange', gray = 'badge-gray';
export const STATUS_STYLES = {
  PKWT: blue, PKWTT: green, MENUNGGU: yellow, DISETUJUI: green, DITOLAK: red,
  ACTIVE: green, CUTI: blue, SAKIT: orange, MCU: navy, RESIGN: gray, PHK: red, DIRUMAHKAN: yellow, MUTASI: navy, ENDED: gray,
  FIT: green, FOLLOW_UP: yellow, UNFIT: red, PENDING: gray, PROSES: blue, BELUM_MCU: gray, FU_TERLAMBAT: red, MCU_KEDALUWARSA: red,
  AKTIF: green, AKAN_HABIS: yellow, KEDALUWARSA: red, DICABUT: gray, BELUM_BERLAKU: blue,
  APPROVED: green, REJECTED: red, CANCELLED: gray,
  DIRENCANAKAN: gray, MENUNGGU_PERSYARATAN: yellow, SIAP: blue, PERJALANAN: navy, TIBA: green, SELESAI: green, BATAL: gray,
  RENCANA: gray, BERJALAN: blue, ONSITE: green, MENDEKATI_CUTI: yellow, LEWAT_JADWAL: red, TANPA_POLA: gray, SEDANG_CUTI: blue,
  DRAFT: gray, SUBMITTED: blue, REVIEWED: navy, REVISION: orange,
  NEAR_MISS: yellow, FAC: blue, MTC: orange, LTI: red, FATALITY: red, PROPERTY_DAMAGE: orange, ENVIRONMENT: green,
  OPEN: red, INVESTIGASI: orange, TINDAK_LANJUT: yellow, CLOSED: green, DONE: green,
  LULUS: green, TIDAK_LULUS: red, VALID: green, MISSING: gray, EXPIRING: yellow, EXPIRED: red,
  HIJAU: green, KUNING: yellow, MERAH: red, LANJUT: green, DIBERHENTIKAN: red,
  BERLAKU: green, ARSIP: gray, NONAKTIF: gray,
  BELUM: gray, VERIFIED: green, RETIRED: gray, APPLICABLE: green, NA: gray, NA_PENDING: yellow,
  OVERDUE: red, EVIDENCE_EXPIRED: red, EVIDENCE_EXPIRING: yellow, RETURNED: orange, SUPERSEDED: gray, SITE_ADDITION: blue,
  DEFAULT: gray, LISTED: blue, HO_ONLY: orange,
  TERCATAT: gray, BERAKHIR: orange, DIBATALKAN: gray, FINAL: green,
  TERBUKA: red, DALAM_PROSES: yellow, DIAJUKAN_TUTUP: blue, DITUTUP: green, RENDAH: green, SEDANG: yellow, TINGGI: red,
  SCREENING: gray, MENUNGGU_HASIL: blue, SUBMIT: blue, FEEDBACK: navy, SUBMIT_FU: yellow, MOBILISASI: navy,
};

export const idr = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v ?? 0));
export const fmtNum = (v, d = 0) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d }).format(Number(v ?? 0));
