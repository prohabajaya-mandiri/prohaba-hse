// Sapaan & kata motivasi K3. Murni, agar sapaan mengikuti jam perangkat pengguna dan mudah diuji.
export function greetingFor(hour) {
  if (hour >= 4 && hour < 11) return 'Selamat pagi';
  if (hour >= 11 && hour < 15) return 'Selamat siang';
  if (hour >= 15 && hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const ZONES = { '-420': 'WIB', '-480': 'WITA', '-540': 'WIT' };
export const zoneLabel = (date) => ZONES[date.getTimezoneOffset()] ?? '';

export const QUOTES = [
  'Pulang dengan selamat adalah target utama setiap hari kerja.',
  'Keselamatan bukan pilihan saat sempat, melainkan cara kita bekerja.',
  'Lima menit untuk berhenti dan menilai bahaya lebih murah daripada satu kecelakaan.',
  'Keluarga menunggu Anda di rumah. Bekerjalah dengan aman hari ini.',
  'APD bukan beban, melainkan pelindung terakhir antara Anda dan bahaya.',
  'Setiap bahaya yang dilaporkan adalah kecelakaan yang berhasil dicegah.',
  'Tidak ada pekerjaan yang begitu mendesak sampai harus mengorbankan keselamatan.',
  'Berani menegur rekan yang berisiko adalah bentuk kepedulian tertinggi.',
  'Budaya keselamatan dibangun dari kebiasaan kecil yang dilakukan setiap hari.',
  'Stop Work Authority adalah hak Anda. Hentikan pekerjaan bila tidak aman.',
  'Tempat kerja yang rapi adalah langkah pertama menuju tempat kerja yang aman.',
  'Nol kecelakaan bukan keberuntungan, melainkan hasil disiplin bersama.',
  'Prosedur ditulis dari pengalaman. Patuhi agar kesalahan lama tidak terulang.',
  'Periksa alat sebelum dipakai, periksa diri sebelum bekerja.',
  'Tubuh yang cukup istirahat adalah alat keselamatan yang paling penting.',
  'Satu kelalaian bisa mengubah hidup banyak orang. Tetap waspada.',
  'Pemimpin yang baik memberi contoh keselamatan, bukan hanya memberi perintah.',
  'Near miss adalah peringatan gratis. Catat, pelajari, dan perbaiki.',
  'Kalau ragu, bertanya. Kalau tidak aman, berhenti.',
  'Kerja cepat itu baik, kerja selamat itu wajib.',
  'Lingkungan yang terjaga hari ini adalah warisan untuk generasi berikutnya.',
  'Kesehatan kerja dimulai dari kepedulian pada diri sendiri.',
  'Toolbox talk yang singkat bisa menyelamatkan nyawa di lapangan.',
  'Keselamatan adalah tanggung jawab semua orang, dari direksi hingga lapangan.',
  'Jangan terbiasa dengan bahaya hanya karena belum pernah terjadi apa-apa.',
  'Hari tanpa kecelakaan selalu dimulai dari niat bekerja dengan benar.',
  'Rambu dan barikade ada untuk dipatuhi, bukan untuk dilewati.',
  'Investasi terbaik perusahaan adalah pekerja yang pulang dengan sehat.',
  'Ketelitian Anda hari ini melindungi rekan kerja Anda.',
  'Bekerja aman bukan memperlambat pekerjaan, tetapi memastikan pekerjaan selesai.',
  'Mari jadikan hari ini satu hari lagi tanpa cedera.',
];

/** Satu kata motivasi per hari kalender; berganti setiap tengah malam waktu setempat. */
export function quoteOfDay(date) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  return QUOTES[day % QUOTES.length];
}
