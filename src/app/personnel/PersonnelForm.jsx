'use client';

import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { FormFields, useSubmit } from '@/components/ui';
import KtpCapture from '@/components/KtpCapture';
import { BLOOD_TYPES, CATEGORIES, CATEGORY_LABELS, EMPLOYMENT_LABELS, EMPLOYMENT_TYPES, MARITAL, MARITAL_LABELS, tenure } from '@/lib/domain/personnel';
import { KTP_FIELD_LABELS, scanKtp } from '@/lib/domain/ktp-ocr';

export const EMPTY_PERSONNEL = {
  nik: '', nip: '', name: '', birthPlace: '', birthDate: '', gender: '', maritalStatus: '', education: '', major: '', phoneWa: '',
  emergencyName: '', emergencyPhone: '', emergencyRelation: '', ktpAddress: '', domicileAddress: '', originRegion: '',
  category: 'MANPOWER', position: '', siteId: '', startDate: '', employmentType: '', contractEndDate: '', npwp: '', bpjsKesehatan: '', bpjsKetenagakerjaan: '', bloodType: '',
  medicalHistory: '', shirtSize: '', shoeSize: '', bankName: '', bankAccount: '', bankAccountName: '', foremanId: '', ocrVerified: false,
};

export default function PersonnelForm({ initial, sites, editing, canMedical, canBank, canEmployment, onDone }) {
  const { submit, busy } = useSubmit();
  const [values, setValues] = useState(initial);
  const [ktp, setKtp] = useState(null);
  // File asli (belum dikompres) dipakai OCR agar huruf tetap tajam; yang diunggah tetap versi terkompres.
  const [ktpOriginal, setKtpOriginal] = useState(null);
  const [ocr, setOcr] = useState({ running: false, progress: 0, note: '', warnings: [] });

  const runOcr = async () => {
    if (!ktp) return;
    setOcr({ running: true, progress: 0, note: 'Memuat mesin OCR…', warnings: [] });
    try {
      const { fields, warnings } = await scanKtp(ktpOriginal ?? ktp, ({ attempt, progress }) =>
        setOcr((o) => ({ ...o, progress, note: attempt > 1 ? `Membaca ulang KTP (percobaan ${attempt})…` : 'Membaca KTP…' })));
      const filled = Object.entries(fields).filter(([, v]) => v);
      setValues((v) => ({ ...v, ...Object.fromEntries(filled), ocrVerified: false }));
      setOcr({
        running: false, progress: 100, warnings,
        note: filled.length
          ? `Terisi dari OCR: ${filled.map(([k]) => KTP_FIELD_LABELS[k]).join(', ')}. Periksa dan koreksi manual sebelum menyimpan.`
          : 'Tidak ada data yang terbaca. Foto ulang KTP: mendatar, memenuhi bingkai, fokus, tanpa pantulan cahaya.',
      });
    } catch {
      setOcr({ running: false, progress: 0, note: 'OCR gagal. Isi data secara manual.', warnings: [] });
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
    { name: 'nip', label: 'NIP', hint: 'Nomor Induk Pegawai dari HRD. Boleh dikosongkan bila belum terbit; tidak boleh sama dengan karyawan lain.' },
    { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]]), required: true, noEmpty: true },
    { name: 'position', label: 'Jabatan', required: true },
    ...(editing ? [] : [{ name: 'siteId', label: 'Site awal', type: 'select', options: sites.map((s) => [s.id, `${s.code} — ${s.name}`]), required: true }]),
    { name: 'startDate', label: 'Tanggal mulai', type: 'date', hint: values.startDate ? `Masa kerja: ${tenure(values.startDate)?.label ?? 'belum mulai'}` : 'Dasar perhitungan masa kerja.' },
    { name: 'employmentType', label: 'Status kepegawaian', type: 'select', options: EMPLOYMENT_TYPES.map((t) => [t, EMPLOYMENT_LABELS[t]]), disabled: !canEmployment,
      hint: canEmployment ? 'PKWT = kontrak waktu tertentu, PKWTT = karyawan tetap.' : 'Hanya dapat diisi/diubah oleh HRD / HO HSE.' },
    { name: 'contractEndDate', label: 'Akhir kontrak (PKWT)', type: 'date', disabled: !canEmployment, min: values.startDate || undefined, hidden: (v) => v.employmentType !== 'PKWT' },
    { name: 'foremanId', label: 'Mandor', type: 'personnel', hidden: (v) => v.category !== 'MANPOWER', hint: 'Opsional; harian mandor dapat ditautkan ke mandornya.' },
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
    for (const k of Object.keys(data)) if (data[k] === '' && editing && k !== 'nip') delete data[k];
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
          <KtpCapture label="Foto / scan KTP" accept="image/*,.pdf" file={ktp} onChange={(f, raw) => { setKtp(f); setKtpOriginal(raw ?? null); }} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline btn-sm" disabled={!ktp || ocr.running || ktp.type === 'application/pdf'} onClick={runOcr}>
            <ScanLine size={15} /> {ocr.running ? `OCR ${ocr.progress}%` : 'Isi otomatis dari KTP (OCR)'}
          </button>
          {ocr.note && <span className="muted">{ocr.note}</span>}
        </div>
        <div className="form-hint">Agar terbaca akurat: foto KTP mendatar, memenuhi bingkai, fokus, tanpa pantulan cahaya.</div>
        {ocr.warnings.length > 0 && (
          <ul className="notice" style={{ margin: '10px 0 0', paddingLeft: 32 }}>
            {ocr.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
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
