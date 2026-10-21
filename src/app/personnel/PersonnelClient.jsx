'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserPlus, Upload, Download, FileSpreadsheet } from 'lucide-react';
import { Badge, DataTable, FilterBar, Modal, Pager, useSubmit } from '@/components/ui';
import { CATEGORIES, EMPLOYMENT_TYPES, WORK_STATUSES } from '@/lib/domain/personnel';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import PersonnelForm, { EMPTY_PERSONNEL } from './PersonnelForm';

export default function PersonnelClient({ sites, rows, total, page, canEdit, canEmployment }) {
  const router = useRouter();
  const params = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);

  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Nama, NIP, jabatan, NIK' },
        { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
        { name: 'category', label: 'Kategori', type: 'select', options: CATEGORIES },
        { name: 'workStatus', label: 'Status kerja', type: 'select', options: WORK_STATUSES },
        { name: 'employmentType', label: 'Kepegawaian', type: 'select', options: [...EMPLOYMENT_TYPES, ['NONE', 'Belum diisi']] },
        { name: 'nip', label: 'NIP', type: 'select', options: [['NONE', 'Belum diisi'], ['SET', 'Sudah diisi']] },
        { name: 'former', label: 'Data', type: 'select', allLabel: 'Personel aktif', options: [['1', 'Mantan personel'], ['all', 'Semua']] },
      ]}>
        <a className="btn btn-outline" href={'/api/personnel/export?' + params.toString()}><Download size={16} /> Export</a>
        {canEdit && <button className="btn btn-outline" onClick={() => setImporting(true)}><Upload size={16} /> Import Excel</button>}
        {canEdit && <button className="btn btn-primary" onClick={() => setAdding(true)}><UserPlus size={16} /> Tambah</button>}
      </FilterBar>

      <div className="card">
        <DataTable
          rows={rows}
          empty="Belum ada personel sesuai filter."
          onRowClick={(p) => router.push('/personnel/' + p.id)}
          columns={[
            { key: 'name', label: 'Nama', render: (p) => (<div><strong>{p.name}</strong><div className="muted">{p.nip ? `NIP ${p.nip}` : 'NIP belum diisi'} · NIK {p.nik}</div></div>) },
            { key: 'category', label: 'Kategori', render: (p) => labelOf(p.category) },
            { key: 'position', label: 'Jabatan', render: (p) => (<div>{p.position}{p.foreman && <div className="muted">Mandor: {p.foreman.name}</div>}</div>) },
            { key: 'siteName', label: 'Site' },
            { key: 'employmentType', label: 'Kepegawaian', render: (p) => (<div><Badge value={p.employmentType} />{p.employmentType === 'PKWT' && p.contractEndDate && <div className="muted">s/d {formatDate(p.contractEndDate)}</div>}</div>) },
            { key: 'tenure', label: 'Masa kerja', render: (p) => p.tenure ?? '-' },
            { key: 'workStatus', label: 'Status kerja', render: (p) => <Badge value={p.workStatus} /> },
            { key: 'fitness', label: 'Kesehatan', render: (p) => <Badge value={p.fitness} /> },
            { key: 'permitEnd', label: 'Permit s/d', render: (p) => formatDate(p.permitEnd) },
          ]}
        />
      </div>
      <Pager page={page} total={total} />

      <Modal open={adding} onClose={() => setAdding(false)} title="Tambah personel" subtitle="Satu NIK hanya untuk satu profil. Penempatan awal dibuat otomatis." size="modal-xl">
        {adding && <PersonnelForm initial={{ ...EMPTY_PERSONNEL, siteId: sites.length === 1 ? sites[0].id : '' }} sites={sites.filter((s) => s.isActive)} canMedical canBank canEmployment={canEmployment}
          onDone={(r) => { setAdding(false); router.push('/personnel/' + r.id); }} />}
      </Modal>
      <Modal open={importing} onClose={() => setImporting(false)} title="Import personel dari Excel" subtitle="File divalidasi dan ditinjau sebelum disimpan." size="modal-xl">
        {importing && <ImportPanel onDone={() => setImporting(false)} />}
      </Modal>
    </div>
  );
}

function ImportPanel({ onDone }) {
  const { submit, busy } = useSubmit();
  const [rows, setRows] = useState(null);
  const [preview, setPreview] = useState(null);
  const [fileName, setFileName] = useState('');

  const readFile = async (file) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = wb.Sheets[wb.SheetNames[0]];
    // Nilai mentah: tanggal Excel tetap berupa nomor seri (dikonversi di server tanpa geser zona waktu),
    // angka tidak diformat ulang. Tanda * pada header wajib dihilangkan agar cocok dengan template.
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true })
      .map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/\s*\*\s*$/, ''), v])))
      .filter((r) => Object.values(r).some((v) => String(v).trim() !== ''));
    setFileName(file.name);
    setRows(raw);
    const r = await submit('/api/personnel/import', { body: { mode: 'preview', rows: raw }, refresh: false });
    setPreview(r);
  };

  const commit = async () => {
    const r = await submit('/api/personnel/import', { body: { mode: 'commit', rows }, success: null });
    if (r) {
      alert(`${r.created} personel tersimpan, ${r.skipped} baris dilewati.`);
      onDone();
    }
  };

  return (
    <div className="stack">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a className="btn btn-outline btn-sm" href="/api/personnel/template"><FileSpreadsheet size={15} /> Unduh template standar</a>
        <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
          <Upload size={15} /> Pilih file .xlsx
          <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
        </label>
        {fileName && <span className="muted" style={{ alignSelf: 'center' }}>{fileName}</span>}
      </div>
      {busy && !preview && <div className="muted">Memvalidasi…</div>}
      {preview && (
        <>
          <div className="kpi-grid">
            <div className="kpi-card navy"><div className="kpi-label">Total baris</div><div className="kpi-value">{preview.summary.total}</div></div>
            <div className="kpi-card green"><div className="kpi-label">Siap disimpan</div><div className="kpi-value">{preview.summary.valid}</div></div>
            <div className="kpi-card yellow"><div className="kpi-label">NIK sudah ada</div><div className="kpi-value">{preview.summary.duplicate}</div></div>
            <div className="kpi-card red"><div className="kpi-label">Tidak valid</div><div className="kpi-value">{preview.summary.invalid}</div></div>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <DataTable rows={preview.rows} rowKey={(r) => r.row}
              columns={[
                { key: 'row', label: 'Baris' },
                { key: 'name', label: 'Nama' },
                { key: 'nik', label: 'NIK' },
                { key: 'siteCode', label: 'Site' },
                { key: 'category', label: 'Kategori' },
                { key: 'status', label: 'Hasil', render: (r) => r.errors.length ? <ul className="text-red" style={{ margin: 0, paddingLeft: 16 }}>{r.errors.map((e) => <li key={e}>{e}</li>)}</ul> : r.duplicate ? <span className="text-orange">Sudah terdaftar ({r.duplicate}) — dilewati</span> : <span className="text-green">OK{r.warnings?.length ? <span className="text-orange"> — {r.warnings.join(' ')}</span> : null}</span> },
              ]} />
          </div>
          <div className="modal-footer" style={{ padding: 0 }}>
            <button className="btn btn-ghost" onClick={() => { setPreview(null); setRows(null); setFileName(''); }}>Ulangi</button>
            <button className="btn btn-primary" disabled={busy || !preview.summary.valid} onClick={commit}>Simpan {preview.summary.valid} baris valid</button>
          </div>
        </>
      )}
    </div>
  );
}
