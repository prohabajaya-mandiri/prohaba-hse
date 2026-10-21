// OCR KTP di browser (tesseract.js) sehingga foto KTP tidak dikirim ke layanan pihak ketiga.
// Gambar dibersihkan dulu, lalu dibaca beberapa kali dengan pengaturan berbeda sampai data inti
// lengkap dan NIK cocok dengan tanggal lahir. Hasil tetap hanya saran dan wajib diverifikasi manual.
import { parseKtp } from './personnel.js';

export const KTP_FIELD_LABELS = {
  nik: 'NIK', name: 'Nama', birthPlace: 'Tempat lahir', birthDate: 'Tanggal lahir', gender: 'Jenis kelamin',
  maritalStatus: 'Status nikah', bloodType: 'Golongan darah', ktpAddress: 'Alamat KTP',
};

const WIDTH = 2000; // lebar kerja: huruf KTP ±40 px, ukuran yang paling stabil untuk tesseract
const BLOCK = 40;

/**
 * Ratakan gambar RGBA menjadi skala abu-abu siap OCR. Murni (tanpa DOM) agar dapat diuji di Node.
 * 1. Kanal paling terang per piksel: pola pengaman biru/hijau dan foto berlatar merah menjadi terang,
 *    sedangkan teks hitam tetap gelap.
 * 2. Pencahayaan diratakan: tiap piksel dibagi kecerahan latar setempat (maksimum per blok), sehingga
 *    bayangan, pantulan, dan foto yang gelap di satu sisi tidak mengacaukan ambang hitam-putih tesseract.
 * 3. Kontras diregangkan agar teks hampir hitam.
 */
export function flattenKtp(px, w, h, channels = 4) {
  const n = w * h;
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) gray[i] = Math.max(px[i * channels], px[i * channels + 1], px[i * channels + 2]);
  const bw = Math.ceil(w / BLOCK), bh = Math.ceil(h / BLOCK);
  const peak = new Float32Array(bw * bh);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const k = ((y / BLOCK) | 0) * bw + ((x / BLOCK) | 0);
    if (gray[y * w + x] > peak[k]) peak[k] = gray[y * w + x];
  }
  // Haluskan 3x3 agar batas blok tidak tampak sebagai garis.
  const bg = new Float32Array(bw * bh);
  for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
    let sum = 0, count = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const yy = by + dy, xx = bx + dx;
      if (yy >= 0 && yy < bh && xx >= 0 && xx < bw) {
        sum += peak[yy * bw + xx];
        count++;
      }
    }
    bg[by * bw + bx] = sum / count;
  }
  const out = new Uint8ClampedArray(n);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(bh - 1, Math.max(0, y / BLOCK - 0.5)), y0 = fy | 0, y1 = Math.min(bh - 1, y0 + 1), ay = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(bw - 1, Math.max(0, x / BLOCK - 0.5)), x0 = fx | 0, x1 = Math.min(bw - 1, x0 + 1), ax = fx - x0;
      const b = (bg[y0 * bw + x0] * (1 - ax) + bg[y0 * bw + x1] * ax) * (1 - ay) + (bg[y1 * bw + x0] * (1 - ax) + bg[y1 * bw + x1] * ax) * ay;
      out[y * w + x] = (gray[y * w + x] / Math.max(1, b)) * 255;
    }
  }
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) hist[out[i]]++;
  let lo = 0, acc = hist[0];
  while (acc < n * 0.005 && lo < 254) acc += hist[++lo];
  for (let i = 0; i < n; i++) out[i] = ((out[i] - lo) * 255) / (255 - lo);
  return out;
}

/** Gambar → canvas lebar WIDTH yang sudah diputar (derajat) dan diratakan. */
function prepare(bitmap, rotation) {
  const turned = rotation % 180 !== 0;
  const srcW = turned ? bitmap.height : bitmap.width, srcH = turned ? bitmap.width : bitmap.height;
  const scale = WIDTH / srcW;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = Math.round(srcH * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(bitmap, (-bitmap.width * scale) / 2, (-bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const gray = flattenKtp(img.data, canvas.width, canvas.height);
  for (let i = 0; i < gray.length; i++) {
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = gray[i];
    img.data[i * 4 + 3] = 255;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/**
 * Baca foto KTP. onProgress({ attempt, progress }) dipanggil selama membaca (progress 0–100).
 * Mengembalikan hasil parseKtp: { fields, warnings, complete, labels }.
 */
export async function scanKtp(file, onProgress = () => {}) {
  const { createWorker, PSM } = await import('tesseract.js');
  const bitmap = await createImageBitmap(file);
  let attempt = 0;
  const worker = await createWorker('ind', 1, {
    logger: (m) => m.status === 'recognizing text' && onProgress({ attempt, progress: Math.round(m.progress * 100) }),
  });
  try {
    const texts = [];
    const read = async (rotation, psm) => {
      attempt++;
      await worker.setParameters({ tessedit_pageseg_mode: psm, preserve_interword_spaces: '1', user_defined_dpi: '300' });
      const { data } = await worker.recognize(prepare(bitmap, rotation));
      texts.push(data.text);
      return parseKtp(texts);
    };
    // Blok tunggal membaca KTP baris per baris (label : nilai); mode otomatis sebagai pembanding bila ada yang kurang.
    let result = await read(0, PSM.SINGLE_BLOCK);
    if (!result.complete) result = await read(0, PSM.AUTO);
    // Hampir tidak ada label terbaca: kemungkinan foto diambil tegak/terbalik.
    for (const rotation of [90, 270, 180]) {
      if (result.labels >= 4) break;
      result = await read(rotation, PSM.SINGLE_BLOCK);
    }
    return result;
  } finally {
    bitmap.close?.();
    await worker.terminate();
  }
}
