'use client';

import { useState } from 'react';
import { Plus, Edit, Trash2, Users, ShieldCheck, Eye, Ban, FileWarning } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FilterBar, FormFields, Kpi, Modal, Pager, PersonnelPicker, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { ALCOHOL_RESULTS, fitStatus } from '@/lib/domain/fit-to-work';

const EMPTY_ROW = { personnelId: '', name: '', position: '', healthy: true, medication: false, restToday: '', restYesterday: '', mentalReady: true, allowedByGl: true, note: '' };
const hoursNow = () => (new Date().getHours() >= 15 || new Date().getHours() < 4 ? 'MALAM' : 'PAGI');

function RulesNote() {
  return (
    <div className="notice info" style={{ fontSize: 13.5 }}>
      <strong>Aturan jam istirahat (form P5M):</strong> hari ini ≥ 6 jam aman · 4–5 jam boleh dengan pengawasan lebih · ≤ 3 jam tidak boleh bekerja.
      Hari ini + kemarin: ≥ 12 jam aman · 9–11 jam dengan pengawasan · ≤ 8 jam tidak boleh. Kurang sehat, minum obat, atau mental belum siap = perlu pengawasan; GL &quot;tidak boleh&quot; = tidak boleh bekerja.
    </div>
  );
}

const Check = ({ checked, onChange, label }) => (
  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }} title={label}>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
  </label>
);

/** Tabel isian peserta P5M; status dihitung langsung saat diketik. */
function Attendees({ rows, setRows }) {
  const [bulk, setBulk] = useState('');
  const set = (i, patch) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addBulk = () => {
    const names = bulk.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (names.length) setRows([...rows, ...names.map((name) => ({ ...EMPTY_ROW, name }))]);
    setBulk('');
  };
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="section-title" style={{ margin: 0 }}>Peserta ({rows.length})</div>
      <div className="table-wrapper card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Nama</th><th>Jabatan</th><th className="num">Sehat</th><th className="num">Minum obat</th>
              <th>Istirahat hari ini (jam)</th><th>Kemarin (jam)</th><th className="num">Mental siap</th><th className="num">Boleh kerja (GL)</th><th>Status</th><th />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="muted">Tambahkan peserta dari master personel atau tempel daftar nama.</td></tr>}
            {rows.map((r, i) => {
              const s = r.restToday === '' ? null : fitStatus({ ...r, restToday: Number(r.restToday), restYesterday: r.restYesterday === '' ? null : Number(r.restYesterday) });
              return (
                <tr key={i}>
                  <td style={{ minWidth: 160 }}>{r.personnelId ? <strong>{r.name}</strong> : <input className="form-input" required value={r.name} onChange={(e) => set(i, { name: e.target.value })} placeholder="Nama" />}</td>
                  <td style={{ minWidth: 120 }}><input className="form-input" value={r.position} onChange={(e) => set(i, { position: e.target.value })} placeholder="Jabatan" /></td>
                  <td><Check checked={r.healthy} onChange={(v) => set(i, { healthy: v })} label="Sehat" /></td>
                  <td><Check checked={r.medication} onChange={(v) => set(i, { medication: v })} label="Minum obat" /></td>
                  <td style={{ width: 110 }}><input className="form-input" type="number" min={0} max={24} required value={r.restToday} onChange={(e) => set(i, { restToday: e.target.value })} /></td>
                  <td style={{ width: 110 }}><input className="form-input" type="number" min={0} max={24} value={r.restYesterday} onChange={(e) => set(i, { restYesterday: e.target.value })} placeholder="opsional" /></td>
                  <td><Check checked={r.mentalReady} onChange={(v) => set(i, { mentalReady: v })} label="Mental siap" /></td>
                  <td><Check checked={r.allowedByGl} onChange={(v) => set(i, { allowedByGl: v })} label="Boleh kerja" /></td>
                  <td style={{ minWidth: 150 }}>{s ? <div><Badge value={s.status} />{s.reasons.length > 0 && <div className="muted" style={{ fontSize: 12 }}>{s.reasons.join('; ')}</div>}</div> : <span className="muted">isi jam</span>}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" title="Hapus baris" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="form-grid" style={{ alignItems: 'end' }}>
        <div className="form-group">
          <label className="form-label">Tambah dari master personel</label>
          <PersonnelPicker value="" onChange={(pid, p) => p && !rows.some((r) => r.personnelId === pid) && setRows([...rows, { ...EMPTY_ROW, personnelId: pid, name: p.name, position: p.position ?? '' }])} />
        </div>
        <div className="form-group">
          <label className="form-label">Atau tempel nama (satu per baris, mis. pekerja subkon)</label>
          <textarea className="form-input" rows={2} value={bulk} onChange={(e) => setBulk(e.target.value)} />
          <button type="button" className="btn btn-outline btn-sm" style={{ width: 'fit-content', marginTop: 6 }} disabled={!bulk.trim()} onClick={addBulk}><Plus size={14} /> Tambah nama</button>
        </div>
      </div>
      {rows.length > 0 && <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'fit-content' }} onClick={() => setRows(rows.map((r) => (r.restToday === '' ? { ...r, restToday: '6' } : r)))}>Isi &quot;6 jam&quot; untuk baris yang masih kosong</button>}
    </div>
  );
}

export default function FitClient({ tab, user, sites, sessions, screen, alcohol, due, page, canEdit, canAlcohol }) {
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const [rows, setRows] = useState([]);
  const [files, setFiles] = useState([]);
  const [detailId, setDetailId] = useState(null);
  const [alc, setAlc] = useState(null);
  const detail = sessions?.rows.find((r) => r.id === detailId);
  const defaultSite = sites.filter((x) => !x.isHo).length === 1 ? sites.find((x) => !x.isHo).id : '';
  const siteOptions = sites.filter((x) => x.isActive).map((x) => [x.id, `${x.code} — ${x.name}`]);

  const openNew = () => {
    setFiles([]);
    setRows([]);
    setForm({ siteId: defaultSite, heldOn: todayIso(), shift: hoursNow(), topic: '', department: '', location: '', presenter: user.operatorName || user.name || '', notes: '' });
  };
  const openEdit = (s) => {
    setDetailId(null);
    setFiles([]);
    setRows(s.checks.map((c) => ({ personnelId: c.personnelId ?? '', name: c.name, position: c.position ?? '', healthy: c.healthy, medication: c.medication, restToday: String(c.restToday), restYesterday: c.restYesterday == null ? '' : String(c.restYesterday), mentalReady: c.mentalReady, allowedByGl: c.allowedByGl, note: c.note ?? '' })));
    setForm({ id: s.id, number: s.number, heldOn: iso(s.heldOn), shift: s.shift, topic: s.topic, department: s.department ?? '', location: s.location ?? '', presenter: s.presenter, notes: s.notes ?? '' });
  };
  const save = async (e) => {
    e.preventDefault();
    const { id, number, ...body } = form;
    void number;
    const fd = new FormData();
    fd.set('data', JSON.stringify({ ...body, checks: rows }));
    files.forEach((f) => fd.append('files', f));
    if (await submit(id ? `/api/fit-to-work/${id}` : '/api/fit-to-work', { method: id ? 'PUT' : 'POST', form: fd })) setForm(null);
  };
  const saveAlc = async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set('data', JSON.stringify(alc));
    files.forEach((f) => fd.append('files', f));
    if (await submit('/api/fit-to-work/alcohol', { form: fd })) setAlc(null);
  };
  const newBtn = canEdit && <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Input P5M</button>;

  return (
    <div className="stack">
      {tab === 'screening' && (
        <>
          <FilterBar filters={[
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((x) => [x.id, x.code]) },
            { name: 'from', label: 'Tanggal', type: 'date' },
            { name: 'to', label: 'Sampai', type: 'date' },
            { name: 'status', label: 'Status', type: 'select', options: [['TIDAK_BOLEH', 'Tidak boleh kerja'], ['PENGAWASAN', 'Dengan pengawasan']], allLabel: 'Perlu perhatian' },
          ]}>{newBtn}</FilterBar>
          <div className="kpi-grid">
            <Kpi label={`Sesi P5M ${screen.from === screen.to ? formatDate(screen.from) : `${formatDate(screen.from)} – ${formatDate(screen.to)}`}`} value={screen.summary.sessions ?? 0} icon={Users} tone="navy" href="/fit-to-work?tab=sessions" hint={`${screen.summary.total ?? 0} peserta`} />
            <Kpi label="Aman" value={screen.summary.okCount ?? 0} icon={ShieldCheck} tone="green" />
            <Kpi label="Dengan pengawasan" value={screen.summary.watchCount ?? 0} icon={Eye} tone="yellow" />
            <Kpi label="Tidak boleh bekerja" value={screen.summary.stopCount ?? 0} icon={Ban} tone={screen.summary.stopCount ? 'red' : 'green'} />
          </div>
          <RulesNote />
          <div className="card">
            <DataTable rows={screen.rows} empty="Tidak ada pekerja yang perlu perhatian pada periode ini."
              columns={[
                { key: 'n', label: 'Nama', render: (r) => (<div><strong>{r.name}</strong><div className="muted">{r.position ?? ''}</div></div>) },
                { key: 's', label: 'Status', render: (r) => <Badge value={r.status} /> },
                { key: 'why', label: 'Alasan', render: (r) => r.reasons ?? '-' },
                { key: 'rest', label: 'Istirahat', render: (r) => `${r.restToday} jam${r.restYesterday != null ? ` (+${r.restYesterday})` : ''}` },
                { key: 'p', label: 'P5M', render: (r) => (<div>{r.session.number}<div className="muted">{r.session.site.code} · {formatDate(r.session.heldOn)} · {labelOf(r.session.shift)}</div></div>) },
                { key: 'gl', label: 'GL / penyaji', render: (r) => r.session.presenter },
              ]} />
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <>
          <FilterBar filters={[
            { type: 'search', label: 'Cari', placeholder: 'Nomor / topik / GL / lokasi' },
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((x) => [x.id, x.code]) },
            { name: 'shift', label: 'Shift', type: 'select', options: [['PAGI', 'Pagi'], ['MALAM', 'Malam']] },
            { name: 'flag', label: 'Peserta', type: 'select', options: [['1', 'Ada yang perlu perhatian']], allLabel: 'Semua' },
            { name: 'from', label: 'Dari', type: 'date' },
            { name: 'to', label: 'Sampai', type: 'date' },
          ]}>{newBtn}</FilterBar>
          <div className="card">
            <DataTable rows={sessions.rows} onRowClick={(r) => setDetailId(r.id)} empty="Belum ada berkas P5M."
              columns={[
                { key: 'n', label: 'Nomor', render: (r) => (<div><strong>{r.number}</strong><div className="muted">{r.site.code}</div></div>) },
                { key: 'd', label: 'Tanggal', render: (r) => (<div>{formatDate(r.heldOn)}<div className="muted">{labelOf(r.shift)}</div></div>) },
                { key: 't', label: 'Topik', render: (r) => (<div>{r.topic}<div className="muted">{[r.department, r.location].filter(Boolean).join(' · ')}</div></div>) },
                { key: 'p', label: 'GL / penyaji', render: (r) => r.presenter },
                { key: 'c', label: 'Peserta', render: (r) => (<div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}><span className="chip">{r.total}</span>{r.watchCount > 0 && <Badge value="PENGAWASAN" label={`${r.watchCount} awasi`} />}{r.stopCount > 0 && <Badge value="TIDAK_BOLEH" label={`${r.stopCount} tidak boleh`} />}</div>) },
                { key: 'f', label: 'Berkas', render: (r) => (r.files.length ? `${r.files.length} file` : <span className="text-orange" title="Belum ada scan form / foto"><FileWarning size={15} /> belum</span>) },
              ]} />
          </div>
          <Pager page={page} total={sessions.total} />
        </>
      )}

      {tab === 'alcohol' && (
        <>
          <FilterBar filters={[
            { type: 'search', label: 'Cari nama' },
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((x) => [x.id, x.code]) },
            { name: 'result', label: 'Hasil', type: 'select', options: ALCOHOL_RESULTS.map((x) => [x, labelOf(x)]) },
            { name: 'from', label: 'Dari', type: 'date' },
            { name: 'to', label: 'Sampai', type: 'date' },
          ]}>
            {canAlcohol && <button className="btn btn-primary" onClick={() => { setFiles([]); setAlc({ siteId: defaultSite, personnelId: '', name: '', testedOn: todayIso(), result: 'NEGATIF', method: 'Breathalyzer', note: '' }); }}><Plus size={16} /> Catat tes alkohol</button>}
          </FilterBar>
          <div className="card">
            <DataTable rows={alcohol.rows} empty="Belum ada catatan tes alkohol."
              columns={[
                { key: 'n', label: 'Nama', render: (r) => (<div><strong>{r.name}</strong><div className="muted">{r.site.code}</div></div>) },
                { key: 'd', label: 'Tanggal', render: (r) => formatDate(r.testedOn) },
                { key: 'm', label: 'Metode', render: (r) => r.method ?? '-' },
                { key: 'r', label: 'Hasil', render: (r) => <Badge value={r.result} /> },
                { key: 'f', label: 'Lampiran', render: (r) => <FileLinks files={r.files} /> },
              ]} />
          </div>
          <Pager page={page} total={alcohol.total} />
          <Card title={`Belum tes alkohol dalam 12 bulan (${due.dueCount} dari ${due.total} personel aktif)`} padding={0}>
            <DataTable rows={due.rows} empty="Semua personel aktif sudah tes dalam 12 bulan terakhir."
              columns={[
                { key: 'n', label: 'Nama', render: (r) => (<div><strong>{r.name}</strong><div className="muted">{r.position}</div></div>) },
                { key: 's', label: 'Site', render: (r) => r.currentSite?.code ?? '-' },
                { key: 'l', label: 'Tes terakhir', render: (r) => (r.lastTest ? formatDate(r.lastTest) : <span className="muted">belum pernah</span>) },
              ]} />
          </Card>
        </>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `${detail.number} — ${detail.topic}` : ''} size="modal-xl">
        {detail && (
          <div className="stack">
            <dl className="detail-grid">
              <div><dt>Tanggal & shift</dt><dd>{formatDate(detail.heldOn)} · {labelOf(detail.shift)}</dd></div>
              <div><dt>Site / lokasi</dt><dd>{detail.site.code}{detail.location ? ' · ' + detail.location : ''}</dd></div>
              <div><dt>Departemen</dt><dd>{detail.department ?? '-'}</dd></div>
              <div><dt>GL / penyaji</dt><dd>{detail.presenter}</dd></div>
              <div><dt>Diinput</dt><dd>{detail.creatorName}</dd></div>
              <div><dt>Ringkasan</dt><dd>{detail.okCount} aman · {detail.watchCount} pengawasan · {detail.stopCount} tidak boleh</dd></div>
            </dl>
            <div><div className="section-title">Berkas (scan form & foto)</div>{detail.files.length ? <FileLinks files={detail.files} /> : <span className="text-orange">Belum ada berkas — unggah lewat Ubah.</span>}</div>
            <Card title="Peserta" padding={0}>
              <DataTable rows={[...detail.checks].sort((a, b) => ({ TIDAK_BOLEH: 0, PENGAWASAN: 1, AMAN: 2 })[a.status] - ({ TIDAK_BOLEH: 0, PENGAWASAN: 1, AMAN: 2 })[b.status])} columns={[
                { key: 'n', label: 'Nama', render: (c) => (<div><strong>{c.name}</strong><div className="muted">{c.position ?? ''}</div></div>) },
                { key: 'k', label: 'Kondisi', render: (c) => `${c.healthy ? 'Sehat' : 'Kurang sehat'}${c.medication ? ' · minum obat' : ''}${c.mentalReady ? '' : ' · mental belum siap'}` },
                { key: 'r', label: 'Istirahat', render: (c) => `${c.restToday} jam${c.restYesterday != null ? ` (+${c.restYesterday})` : ''}` },
                { key: 'g', label: 'GL', render: (c) => (c.allowedByGl ? 'Boleh' : 'Tidak boleh') },
                { key: 's', label: 'Status', render: (c) => (<div><Badge value={c.status} />{c.reasons && <div className="muted" style={{ fontSize: 12 }}>{c.reasons}</div>}</div>) },
              ]} />
            </Card>
            {canEdit && <div className="row-actions"><button className="btn btn-primary btn-sm" onClick={() => openEdit(detail)}><Edit size={15} /> Ubah / tambah berkas</button></div>}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.id ? `Ubah ${form.number}` : 'Input P5M / Safety Talk'} subtitle="Unggah scan form bertanda tangan & foto, lalu isi data ringkas tiap peserta agar yang tidak fit langsung tersaring." size="modal-xl">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields columns={3} values={form} setValues={setForm} fields={[
              ...(form.id ? [] : [{ name: 'siteId', label: 'Site', type: 'select', options: siteOptions, required: true }]),
              { name: 'heldOn', label: 'Tanggal', type: 'date', required: true, max: todayIso() },
              { name: 'shift', label: 'Shift', type: 'select', noEmpty: true, options: [['PAGI', 'Pagi'], ['MALAM', 'Malam']] },
              { name: 'topic', label: 'Judul topik K3', required: true, span: true },
              { name: 'department', label: 'Departemen', placeholder: 'mis. Engineering' },
              { name: 'location', label: 'Lokasi', placeholder: 'mis. KM 92' },
              { name: 'presenter', label: 'Penyaji / Group Leader', required: true },
            ]} />
            <RulesNote />
            <Attendees rows={rows} setRows={setRows} />
            <div className="form-grid"><FileInput label="Scan form P5M bertanda tangan & foto kegiatan" accept="image/*,.pdf" onChange={setFiles} /></div>
            <FormFields values={form} setValues={setForm} fields={[{ name: 'notes', label: 'Catatan', type: 'textarea', span: true }]} />
            <div className="modal-footer" style={{ padding: 0 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Batal</button>
              <button className="btn btn-primary" disabled={busy || rows.length === 0}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(alc)} onClose={() => setAlc(null)} title="Catat tes alkohol" subtitle="Hasil POSITIF langsung diberitahukan ke HO HSE, HSE Site dan PJO.">
        {alc && (
          <form onSubmit={saveAlc} className="stack">
            <FormFields values={alc} setValues={setAlc} fields={[
              { name: 'siteId', label: 'Site', type: 'select', options: siteOptions, required: true },
              { name: 'personnelId', label: 'Personel', type: 'personnel', span: true },
              { name: 'name', label: 'Nama (bila bukan personel master)', hidden: (v) => Boolean(v.personnelId), required: true },
              { name: 'testedOn', label: 'Tanggal tes', type: 'date', required: true, max: todayIso() },
              { name: 'result', label: 'Hasil', type: 'select', noEmpty: true, options: ALCOHOL_RESULTS.map((x) => [x, labelOf(x)]) },
              { name: 'method', label: 'Metode' },
              { name: 'note', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <div className="form-grid"><FileInput label="Lampiran hasil tes" accept="image/*,.pdf" onChange={setFiles} /></div>
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
