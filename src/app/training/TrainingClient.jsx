'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Edit, ClipboardCheck, X } from 'lucide-react';
import { Badge, Card, DataTable, FileInput, FileLinks, FilterBar, FormFields, Modal, Pager, PersonnelPicker, useSubmit } from '@/components/ui';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';


export default function TrainingClient({ tab, sites, competencies, certificates, sessions, gaps, page, canEdit, canMaster, preselect }) {
  const { submit, busy } = useSubmit();
  const [cert, setCert] = useState(preselect && canEdit && tab === 'certificates' ? { personnelId: preselect, competencyId: '', certNumber: '', issuer: '', issueDate: '', expiryDate: '', notes: '' } : null);
  const [files, setFiles] = useState([]);
  const [session, setSession] = useState(null);
  const [people, setPeople] = useState([]);
  const [results, setResults] = useState(null);
  const [comp, setComp] = useState(null);
  const compOpts = competencies.filter((c) => c.isActive).map((c) => [c.id, c.name]);

  const saveCert = async (e) => {
    e.preventDefault();
    const { id, personName, ...body } = cert;
    void personName;
    if (id) delete body.personnelId;
    const fd = new FormData();
    fd.set('data', JSON.stringify(body));
    files.forEach((f) => fd.append('files', f));
    if (await submit(id ? `/api/training/certificates/${id}` : '/api/training/certificates', { method: id ? 'PUT' : 'POST', form: fd })) setCert(null);
  };

  return (
    <div className="stack">
      {tab === 'certificates' && certificates && (
        <>
          <FilterBar filters={[
            { type: 'search', label: 'Cari personel' },
            { name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) },
            { name: 'competencyId', label: 'Kompetensi', type: 'select', options: compOpts },
            { name: 'status', label: 'Masa berlaku', type: 'select', options: [['EXPIRING', `Habis ≤ ${certificates.threshold} hari`], ['EXPIRED', 'Kedaluwarsa']] },
          ]}>
            {canEdit && <button className="btn btn-primary" onClick={() => { setFiles([]); setCert({ personnelId: '', competencyId: '', certNumber: '', issuer: '', issueDate: '', expiryDate: '', notes: '' }); }}><Plus size={16} /> Sertifikat</button>}
          </FilterBar>
          <div className="card">
            <DataTable rows={certificates.rows} empty="Belum ada sertifikat. Kompetensi pada data awal bersifat opsional."
              columns={[
                { key: 'p', label: 'Personel', render: (c) => (<div><Link href={'/personnel/' + c.personnel.id}>{c.personnel.name}</Link><div className="muted">{c.personnel.code} · {c.personnel.currentSite?.code ?? '-'} · {c.personnel.position}</div></div>) },
                { key: 'comp', label: 'Kompetensi', render: (c) => c.competency.name },
                { key: 'no', label: 'No sertifikat', render: (c) => c.certNumber ?? '-' },
                { key: 'issuer', label: 'Penerbit', render: (c) => c.issuer ?? '-' },
                { key: 'issue', label: 'Terbit', render: (c) => formatDate(c.issueDate) },
                { key: 'exp', label: 'Berlaku s/d', render: (c) => formatDate(c.expiryDate) },
                { key: 'status', label: 'Status', render: (c) => <Badge value={c.status} /> },
                { key: 'f', label: 'File', render: (c) => (c.files.length ? <FileLinks files={c.files} /> : '-') },
                ...(canEdit ? [{ key: 'e', label: '', render: (c) => <button className="btn btn-ghost btn-sm" onClick={() => { setFiles([]); setCert({ id: c.id, personName: c.personnel.name, personnelId: c.personnelId, competencyId: c.competencyId, certNumber: c.certNumber ?? '', issuer: c.issuer ?? '', issueDate: iso(c.issueDate) ?? '', expiryDate: iso(c.expiryDate) ?? '', notes: c.notes ?? '' }); }}><Edit size={14} /></button> }] : []),
              ]} />
          </div>
          <Pager page={page} total={certificates.total} />
        </>
      )}

      {tab === 'sessions' && sessions && (
        <>
          <FilterBar filters={[{ name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) }]}>
            {canEdit && <button className="btn btn-primary" onClick={() => { setPeople([]); setSession({ title: '', competencyId: '', siteId: sites.length === 1 ? sites[0].id : '', startDate: todayIso(), endDate: '', trainer: '', location: '', status: 'RENCANA', notes: '' }); }}><Plus size={16} /> Jadwal training</button>}
          </FilterBar>
          {sessions.rows.map((s) => (
            <Card key={s.id} title={<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{s.title} <Badge value={s.status} /></span>}
              actions={canEdit && (<>
                <button className="btn btn-outline btn-sm" onClick={() => setResults({ session: s, issueCertificates: Boolean(s.competency), rows: s.participants.map((p) => ({ participantId: p.id, name: p.personnel.name, attended: p.attended, result: p.result ?? '', score: p.score ?? '' })) })}><ClipboardCheck size={15} /> Absensi & hasil</button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setPeople([]); setSession({ id: s.id, title: s.title, competencyId: s.competencyId ?? '', siteId: s.siteId, startDate: iso(s.startDate), endDate: iso(s.endDate) ?? '', trainer: s.trainer ?? '', location: s.location ?? '', status: s.status, notes: s.notes ?? '' }); }}><Edit size={15} /></button>
              </>)}>
              <dl className="detail-grid" style={{ marginBottom: 12 }}>
                <div><dt>Site</dt><dd>{s.site.code}</dd></div>
                <div><dt>Tanggal</dt><dd>{formatDate(s.startDate)}{s.endDate ? ' – ' + formatDate(s.endDate) : ''}</dd></div>
                <div><dt>Kompetensi</dt><dd>{s.competency?.name ?? '-'}</dd></div>
                <div><dt>Trainer</dt><dd>{s.trainer ?? '-'}</dd></div>
                <div><dt>Lokasi</dt><dd>{s.location ?? '-'}</dd></div>
                <div><dt>Peserta</dt><dd>{s.participants.length} ({s.participants.filter((p) => p.attended).length} hadir, {s.participants.filter((p) => p.result === 'LULUS').length} lulus)</dd></div>
              </dl>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {s.participants.map((p) => <span key={p.id} className="chip">{p.personnel.name}{p.result ? ' · ' + labelOf(p.result) : ''}</span>)}
              </div>
            </Card>
          ))}
          {sessions.rows.length === 0 && <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--gray-500)' }}>Belum ada jadwal training.</div>}
          <Pager page={page} total={sessions.total} limit={30} />
        </>
      )}

      {tab === 'gaps' && gaps && (
        <>
          <FilterBar filters={[{ name: 'siteId', label: 'Site', type: 'select', options: sites.map((s) => [s.id, s.code]) }]} />
          <div className="notice info">Daftar personel aktif yang belum memiliki, atau sertifikatnya habis/akan habis (≤ {gaps.threshold} hari), untuk kompetensi wajib jabatannya. Atur kompetensi wajib di tab Master.</div>
          <div className="card">
            <DataTable rows={gaps.rows} rowKey={(r) => r.key} empty="Tidak ada kekurangan kompetensi (atau kebutuhan per jabatan belum diatur)."
              columns={[
                { key: 'p', label: 'Personel', render: (r) => (<div><Link href={'/personnel/' + r.personnel.id}>{r.personnel.name}</Link><div className="muted">{r.personnel.code} · {r.personnel.currentSite?.code ?? '-'}</div></div>) },
                { key: 'pos', label: 'Jabatan', render: (r) => r.personnel.position },
                { key: 'comp', label: 'Kompetensi wajib', render: (r) => r.competency },
                { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
                { key: 'exp', label: 'Berlaku s/d', render: (r) => formatDate(r.expiryDate) },
              ]} />
          </div>
        </>
      )}

      {tab === 'master' && (
        <>
          <div className="toolbar"><div className="spacer" />{canMaster && <button className="btn btn-primary" onClick={() => setComp({ code: '', name: '', category: '', validityMonths: '', isActive: true, positionsText: '' })}><Plus size={16} /> Kompetensi</button>}</div>
          <div className="card">
            <DataTable rows={competencies}
              columns={[
                { key: 'code', label: 'Kode', render: (c) => <code>{c.code}</code> },
                { key: 'name', label: 'Nama' },
                { key: 'category', label: 'Kategori', render: (c) => c.category ?? '-' },
                { key: 'valid', label: 'Masa berlaku', render: (c) => (c.validityMonths ? `${c.validityMonths} bulan` : 'Tidak kedaluwarsa') },
                { key: 'req', label: 'Wajib untuk jabatan', render: (c) => c.requirements.map((r) => r.position).join(', ') || '-' },
                { key: 'n', label: 'Sertifikat', num: true, render: (c) => c._count.certificates },
                { key: 'a', label: 'Status', render: (c) => <Badge value={c.isActive ? 'AKTIF' : 'NONAKTIF'} /> },
                ...(canMaster ? [{ key: 'e', label: '', render: (c) => <button className="btn btn-ghost btn-sm" onClick={() => setComp({ id: c.id, code: c.code, name: c.name, category: c.category ?? '', validityMonths: c.validityMonths ?? '', isActive: c.isActive, positionsText: c.requirements.map((r) => r.position).join('\n') })}><Edit size={14} /></button> }] : []),
              ]} />
          </div>
        </>
      )}

      <Modal open={Boolean(cert)} onClose={() => setCert(null)} title={cert?.id ? `Sertifikat — ${cert.personName}` : 'Tambah sertifikat'}>
        {cert && (
          <form onSubmit={saveCert} className="stack">
            <FormFields values={cert} setValues={setCert} fields={[
              ...(cert.id ? [] : [{ name: 'personnelId', label: 'Personel', type: 'personnel', required: true, span: true }]),
              { name: 'competencyId', label: 'Kompetensi', type: 'select', options: compOpts, required: true, span: true },
              { name: 'certNumber', label: 'No sertifikat' },
              { name: 'issuer', label: 'Penerbit' },
              { name: 'issueDate', label: 'Tanggal terbit', type: 'date' },
              { name: 'expiryDate', label: 'Berlaku sampai', type: 'date', hint: 'Kosongkan: dihitung dari masa berlaku kompetensi.' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <div className="form-grid"><FileInput label="File sertifikat" onChange={setFiles} /></div>
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(session)} onClose={() => setSession(null)} title={session?.id ? 'Edit training' : 'Jadwal training'} size="modal-lg">
        {session && (
          <form onSubmit={async (e) => { e.preventDefault(); const { id, ...body } = session; if (await submit(id ? `/api/training/sessions/${id}` : '/api/training/sessions', { method: id ? 'PUT' : 'POST', body: { ...body, personnelIds: people.map((p) => p.id) } })) setSession(null); }} className="stack">
            <FormFields values={session} setValues={setSession} fields={[
              { name: 'title', label: 'Judul', required: true, span: true },
              { name: 'competencyId', label: 'Kompetensi terkait', type: 'select', options: compOpts },
              ...(session.id ? [] : [{ name: 'siteId', label: 'Site', type: 'select', options: sites.filter((s) => s.isActive).map((s) => [s.id, s.code]), required: true }]),
              { name: 'startDate', label: 'Mulai', type: 'date', required: true },
              { name: 'endDate', label: 'Selesai', type: 'date' },
              { name: 'trainer', label: 'Trainer / lembaga' },
              { name: 'location', label: 'Lokasi' },
              { name: 'status', label: 'Status', type: 'select', options: ['RENCANA', 'SELESAI', 'BATAL'], noEmpty: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <div>
              <label className="form-label">Tambah peserta ({people.length})</label>
              <PersonnelPicker value="" onChange={(pid, p) => p && !people.some((x) => x.id === pid) && setPeople([...people, p])} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {people.map((p) => <span key={p.id} className="chip">{p.name} <button type="button" style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setPeople(people.filter((x) => x.id !== p.id))}><X size={12} /></button></span>)}
              </div>
            </div>
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(results)} onClose={() => setResults(null)} title={`Absensi & hasil — ${results?.session.title ?? ''}`} size="modal-lg">
        {results && (
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            const r = await submit(`/api/training/sessions/${results.session.id}/results`, { body: { issueCertificates: results.issueCertificates, results: results.rows.map(({ name, ...x }) => { void name; return { ...x, result: x.result || null, score: x.score === '' ? null : x.score }; }) } });
            if (r) setResults(null);
          }}>
            <DataTable rows={results.rows} rowKey={(r) => r.participantId} empty="Belum ada peserta." columns={[
              { key: 'name', label: 'Peserta' },
              { key: 'att', label: 'Hadir', render: (r) => <input type="checkbox" checked={Boolean(r.attended)} onChange={(e) => setResults({ ...results, rows: results.rows.map((x) => (x.participantId === r.participantId ? { ...x, attended: e.target.checked } : x)) })} /> },
              { key: 'res', label: 'Hasil', render: (r) => (
                <select className="form-select" value={r.result} onChange={(e) => setResults({ ...results, rows: results.rows.map((x) => (x.participantId === r.participantId ? { ...x, result: e.target.value } : x)) })}>
                  <option value="">-</option><option value="LULUS">Lulus</option><option value="TIDAK_LULUS">Tidak lulus</option>
                </select>) },
              { key: 'score', label: 'Nilai', render: (r) => <input className="form-input" style={{ width: 90 }} type="number" value={r.score} onChange={(e) => setResults({ ...results, rows: results.rows.map((x) => (x.participantId === r.participantId ? { ...x, score: e.target.value } : x)) })} /> },
            ]} />
            {results.session.competency && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={results.issueCertificates} onChange={(e) => setResults({ ...results, issueCertificates: e.target.checked })} />
                Buat sertifikat {results.session.competency.name} untuk peserta yang lulus
              </label>
            )}
            <button className="btn btn-primary" disabled={busy || !results.rows.length}>Simpan hasil</button>
          </form>
        )}
      </Modal>

      <Modal open={Boolean(comp)} onClose={() => setComp(null)} title={comp?.id ? 'Edit kompetensi' : 'Kompetensi baru'}>
        {comp && (
          <form onSubmit={async (e) => {
            e.preventDefault();
            const { id, positionsText, ...body } = comp;
            const positions = positionsText.split('\n').map((s) => s.trim()).filter(Boolean);
            if (await submit(id ? `/api/training/competencies/${id}` : '/api/training/competencies', { method: id ? 'PUT' : 'POST', body: { ...body, positions } })) setComp(null);
          }}>
            <FormFields values={comp} setValues={setComp} fields={[
              { name: 'code', label: 'Kode', required: true },
              { name: 'name', label: 'Nama', required: true },
              { name: 'category', label: 'Kategori' },
              { name: 'validityMonths', label: 'Masa berlaku (bulan)', type: 'number', min: 1, hint: 'Kosong = tidak kedaluwarsa.' },
              { name: 'positionsText', label: 'Wajib untuk jabatan (satu per baris)', type: 'textarea', span: true, rows: 4 },
              { name: 'isActive', label: 'Aktif', type: 'checkbox' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
