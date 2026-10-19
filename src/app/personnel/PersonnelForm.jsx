'use client';

import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { FileInput, FormFields, compressImage, useSubmit } from '@/components/ui';
import { BLOOD_TYPES, CATEGORIES, CATEGORY_LABELS, EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, MARITAL, MARITAL_LABELS, parseKtpText, tenure } from '@/lib/domain/personnel';

export const EMPTY_PERSONNEL = {
  nik: '', name: '', birthPlace: '', birthDate: '', gender: '', maritalStatus: '', education: '', major: '', phoneWa: '',
  emergencyName: '', emergencyPhone: '', emergencyRelation: '', ktpAddress: '', domicileAddress: '', originRegion: '',
  category: 'MANPOWER', position: '', siteId: '', startDate: '', employmentType: '', contractEndDate: '', npwp: '', bpjsKesehatan: '', bpjsKetenagakerjaan: '', bloodType: '',
  medicalHistory: '', shirtSize: '', shoeSize: '', bankName: '', bankAccount: '', bankAccountName: '', foremanId: '', ocrVerified: false,
};

export default function PersonnelForm({ initial, sites, editing, canMedical, canBank, canEmployment, onDone }) {
  const { submit, busy } = useSubmit();
  const [values, setValues] = useState(initial);
  const [ktp, setKtp] = useState(null);
  const [ocr, setOcr] = useState({ running: false, progress: 0, note: '' });

  // OCR berjalan di browser (tesseract.js) sehingga foto KTP tidak dikirim ke layanan pihak ketiga.
  const runOcr = async () => {
    if (!ktp) return;
    setOcr({ running: true, progress: 0, note: 'Memuat mesin OCR…' });
    try {
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('ind', 1, { logger: (m) => m.status === 'recognizing text' && setOcr((o) => ({ ...o, progress: Math.round(m.progress * 100), note: 'Membaca KTP…' })) });
      const { data } = await worker.recognize(await compressImage(ktp, 2000, 0.9));
      await worker.terminate();
      const parsed = parseKtpText(data.text);
      const filled = Object.entries(parsed).filter(([, v]) => v);
      setValues((v) => ({ ...v, ...Object.fromEntries(filled), ocrVerified: false }));
      setOcr({ running: false, progress: 100, note: `${filled.length} kolom terisi dari OCR. Periksa dan koreksi manual sebelum menyimpan.` });
    } catch {
      setOcr({ running: false, progress: 0, note: 'OCR gagal. Isi data secara manual.' });
    }
  };

  const fields = [
    { section: 'Identitas' },
    { name: 'nik', label: editing ? 'NIK (isi hanya bila diubah)' : 'NIK', required: !editing, hint: '16 digit. Dipakai untuk deteksi duplikasi.', placeholder: editing ? initial.nikMasked : '' },
    { name: 'name', label: 'Nama lengkap', required: true },
    { name: 'birthPlace', label: 'Tempat lahir' },
    { name: 'birthDate', label: 'Tanggal lahir', type: 'date' },
    { name: 'gender', label: 'Jenis kelamin', type: 'select', options: [['L', 'Laki-laki'], ['P', 'Perempuan']] },
    { name: 'maritalStatus', label: 'Status nikah', type: 'select', options: MARITAL.map((m) => [m, MARITAL_LABELS[m]]), hint: 'Menentukan acuan pola roster staff.' },
    { name: 'education', label: 'Pendidikan terakhir' },
    { name: 'major', label: 'Jurusan' },
    { name: 'ktpAddress', label: editing ? 'Alamat KTP (isi hanya bila diubah)' : 'Alamat KTP', type: 'textarea', required: !editing, span: true },
    { name: 'domicileAddress', label: 'Alamat domisili', type: 'textarea', span: true },
    { name: 'originRegion', label: 'Asal daerah' },
    { section: 'Kontak' },
    { name: 'phoneWa', label: 'No WhatsApp', type: 'tel' },
    { name: 'emergencyName', label: 'Kontak darurat' },
    { name: 'emergencyPhone', label: 'No kontak darurat', type: 'tel' },
    { name: 'emergencyRelation', label: 'Hubungan' },
    { section: 'Pekerjaan' },
    { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]]), required: true, noEmpty: true },
    { name: 'position', label: 'Jabatan', required: true },
    ...(editing ? [] : [{ name: 'siteId', label: 'Site awal', type: 'select', options: sites.map((s) => [s.id, `${s.code} — ${s.name}`]), required: true }]),
    { name: 'startDate', label: 'Tanggal mulai', type: 'date', hint: values.startDate ? `Masa kerja: ${tenure(values.startDate)?.label ?? 'belum mulai'}` : 'Dasar perhitungan masa kerja.' },
    { name: 'employmentType', label: 'Status kepegawaian', type: 'select', options: EMPLOYMENT_TYPES.map((t) => [t, EMPLOYMENT_LABELS[t]]), disabled: !canEmployment,
      hint: canEmployment ? 'PKWT = kontrak waktu tertentu, PKWTT = karyawan tetap.' : 'Hanya dapat diisi/diubah oleh HRD / HO HSE.' },
    { name: 'contractEndDate', label: 'Akhir kontrak (PKWT)', type: 'date', disabled: !canEmployment, min: values.startDate || undefined, hidden: (v) => v.employmentType !== 'PKWT' },
    { name: 'foremanId', label: 'Mandor', type: 'personnel', hidden: (v) => v.category !== 'MANPOWER', hint: 'Opsional; manpower dapat ditautkan ke mandor.' },
    { section: 'Data pendukung' },
    { name: 'npwp', label: editing ? 'NPWP (isi hanya bila diubah)' : 'NPWP', inputMode: 'numeric', placeholder: editing ? initial.npwpMasked ?? '' : '', hint: '15 digit (format lama) atau 16 digit (NIK).' },
    { name: 'bpjsKesehatan', label: 'BPJS Kesehatan' },
    { name: 'bpjsKetenagakerjaan', label: 'BPJS Ketenagakerjaan' },
    { name: 'bloodType', label: 'Golongan darah', type: 'select', options: BLOOD_TYPES },
    { name: 'shirtSize', label: 'Ukuran baju' },
    { name: 'shoeSize', label: 'Ukuran sepatu' },
    ...(canMedical || !editing ? [{ name: 'medicalHistory', label: editing ? 'Riwayat penyakit (isi bila diubah)' : 'Riwayat penyakit', type: 'textarea', span: true, hint: 'Opsional, disimpan terenkripsi.' }] : []),
    ...(canBank || !editing ? [
      { section: 'Rekening (wajib untuk staff)' },
      { name: 'bankName', label: 'Nama bank', required: values.category === 'STAFF' && !editing },
      { name: 'bankAccount', label: editing ? 'No rekening (isi bila diubah)' : 'No rekening', inputMode: 'numeric', required: values.category === 'STAFF' && !editing },
      { name: 'bankAccountName', label: 'Nama pemilik rekening' },
    ] : []),
  ];

  const save = async (e) => {
    e.preventDefault();
    const data = { ...values };
    delete data.nikMasked;
    delete data.npwpMasked;
    // Status kepegawaian dikirim apa adanya (kosong = dihapus); hanya HRD/HO HSE yang dapat mengubahnya.
    const employment = { employmentType: data.employmentType || null, contractEndDate: data.employmentType === 'PKWT' ? data.contractEndDate || null : null };
    if (!canEmployment && !editing) { delete data.employmentType; delete data.contractEndDate; }
    for (const k of Object.keys(data)) if (data[k] === '' && editing) delete data[k];
    if (editing) Object.assign(data, employment);
    if (!editing) for (const k of Object.keys(data)) if (data[k] === '') delete data[k];
    if (editing) delete data.siteId;
    const form = new FormData();
    form.set('data', JSON.stringify(data));
    if (ktp) form.set('ktp', ktp);
    const r = await submit(editing ? `/api/personnel/${editing}` : '/api/personnel', { method: editing ? 'PUT' : 'POST', form, success: editing ? 'Data personel diperbarui.' : 'Personel ditambahkan.' });
    if (r) onDone?.(r);
  };

  return (
    <form onSubmit={save} className="stack">
      <div className="card" style={{ padding: 16, background: 'var(--gray-50)' }}>
        <div className="form-grid">
          <FileInput label="Foto / scan KTP" multiple={false} accept="image/*,.pdf" capture="environment" onChange={(f) => setKtp(f[0] ?? null)} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline btn-sm" disabled={!ktp || ocr.running || ktp.type === 'application/pdf'} onClick={runOcr}>
            <ScanLine size={15} /> {ocr.running ? `OCR ${ocr.progress}%` : 'Isi otomatis dari KTP (OCR)'}
          </button>
          {ocr.note && <span className="muted">{ocr.note}</span>}
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, fontSize: 13 }}>
          <input type="checkbox" checked={values.ocrVerified} onChange={(e) => setValues({ ...values, ocrVerified: e.target.checked })} />
          Data sudah diverifikasi manual terhadap KTP asli
        </label>
      </div>
      <FormFields fields={fields} values={values} setValues={setValues} />
      <div className="modal-footer" style={{ padding: '8px 0 0' }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  );
}
