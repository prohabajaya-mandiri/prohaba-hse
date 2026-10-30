'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit, Eye, RefreshCw, ArrowLeftRight, FileText } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { apiFetch } from '@/lib/client-api';
import { formatDate, iso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { CONTRACT_WARNING_DAYS, WORK_STATUSES } from '@/lib/domain/personnel';
import { permitStatus } from '@/lib/domain/permit';
import PersonnelForm from '../PersonnelForm';

const TABS = [['profil', 'Profil'], ['placement', 'Penempatan'], ['mcu', 'MCU'], ['permit', 'Permit & SKS'], ['roster', 'Cuti & Kehadiran'], ['kompetensi', 'Kompetensi'], ['mobilisasi', 'Mobilisasi']];

export default function PersonnelDetail({ person: p, sites, canEdit, canEmployment, canRequestMutation, canCorrectPlacement }) {
  const [tab, setTab] = useState('profil');
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [fix, setFix] = useState(null);
  const [status, setStatus] = useState({ workStatus: p.workStatus, note: '' });
  const [revealed, setRevealed] = useState({});
  const { submit, busy } = useSubmit();
  const { showAlert } = useDialog();

  const reveal = async (kind) => {
    try {
      const r = await apiFetch(`/api/personnel/${p.id}/sensitive?kind=${kind}`);
      setRevealed({ ...revealed, ...(await r.json()) });
    } catch (e) {
      showAlert(e.message, 'Gagal');
    }
  };

  const saveStatus = async (e) => {
    e.preventDefault();
    if (await submit(`/api/personnel/${p.id}/status`, { body: status })) setStatusOpen(false);
  };

  const openFix = (r) => setFix({ id: r.id, ended: r.status === 'ENDED', label: `${r.site.code} · ${r.position}`, startDate: iso(r.startDate), endDate: iso(r.endDate) ?? '', notes: r.notes ?? '', reason: '' });
  const saveFix = async (e) => {
    e.preventDefault();
    const { id, ended, label, ...body } = fix;
    if (!ended) delete body.endDate;
    if (await submit(`/api/placements/${id}`, { method: 'PATCH', body })) setFix(null);
  };
  const fixFields = [
    { name: 'startDate', label: 'Tanggal mulai', type: 'date', required: true },
    { name: 'endDate', label: 'Tanggal akhir', type: 'date', required: true, hidden: (v) => !v.ended },
    { name: 'notes', label: 'Catatan', span: true },
    { name: 'reason', label: 'Alasan koreksi', type: 'textarea', required: true, span: true, rows: 2, placeholder: 'Mis. tanggal mulai dulu terisi tanggal input data' },
  ];

  const item = (label, value) => (<div><dt>{label}</dt><dd>{value || '-'}</dd></div>);
  const now = new Date();

  return (
    <div className="stack">
      <div className="toolbar">
        <Badge value={p.workStatus} />
        {p.employmentType && <Badge value={p.employmentType} />}
        <Badge value={p.fitness} />
        <span className="chip">{labelOf(p.category)}</span>
        {p.isFormer && <span className="chip">Mantan personel</span>}
        {p.contractDaysLeft !== null && p.contractDaysLeft <= CONTRACT_WARNING_DAYS && !p.isFormer && (
          <span className="chip" style={{ background: p.contractDaysLeft < 0 ? 'var(--red-100)' : 'var(--yellow-100)' }}>
            {p.contractDaysLeft < 0 ? `Kontrak PKWT berakhir ${-p.contractDaysLeft} hari lalu` : `Kontrak PKWT berakhir ${p.contractDaysLeft} hari lagi`}
          </span>
        )}
        {!p.ocrVerified && p.ktpFileId && <span className="chip" style={{ background: 'var(--yellow-100)' }}>Data KTP belum diverifikasi</span>}
        <div className="spacer" />
        {canEdit && <button className="btn btn-outline btn-sm" onClick={() => setStatusOpen(true)}><RefreshCw size={15} /> Status kerja</button>}
        {canRequestMutation && <Link className="btn btn-outline btn-sm" href={`/placements?personnelId=${p.id}`}><ArrowLeftRight size={15} /> Mutasi</Link>}
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setEditing(true)}><Edit size={15} /> Edit</button>}
      </div>

      <div className="tabs-bar">
        {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{l}</button>)}
      </div>

      {tab === 'profil' && (
        <div className="grid-2">
          <Card title="Identitas">
            <dl className="detail-grid">
              <div>
                <dt>NIK</dt>
                <dd>{revealed.nik ?? p.nik} {p.access.ktp && !revealed.nik && <button className="btn btn-ghost btn-sm" onClick={() => reveal('KTP')} title="Tampilkan (tercatat di audit log)"><Eye size={14} /></button>}</dd>
              </div>
              {item('Nama', p.name)}
              {item('Tempat, tanggal lahir', [p.birthPlace, formatDate(p.birthDate)].filter((x) => x && x !== '-').join(', '))}
              {item('Jenis kelamin', p.gender === 'L' ? 'Laki-laki' : p.gender === 'P' ? 'Perempuan' : null)}
              {item('Status nikah', labelOf(p.maritalStatus))}
              {item('Pendidikan', [p.education, p.major].filter(Boolean).join(' — '))}
              {item('Alamat KTP', revealed.ktpAddress ?? (p.access.ktp ? '•••• (klik ikon mata pada NIK)' : '[dibatasi]'))}
              {item('Domisili', p.domicileAddress)}
              {item('Asal daerah', p.originRegion)}
              {item('NPWP', revealed.npwp ?? p.npwp)}
              <div>
                <dt>File KTP</dt>
                <dd>{p.ktpFileId ? <a href={`/api/files/${p.ktpFileId}?inline=1`} target="_blank" rel="noreferrer"><FileText size={14} /> Lihat KTP</a> : p.access.ktp ? 'Belum diunggah' : '[dibatasi]'}</dd>
              </div>
            </dl>
          </Card>
          <Card title="Pekerjaan & kontak">
            <dl className="detail-grid">
              {item('NIP', p.nip ?? 'Belum diisi')}
              {item('Jabatan', p.position)}
              {item('Site saat ini', p.currentSite ? `${p.currentSite.code} — ${p.currentSite.name}` : null)}
              {item('Site awal', p.initialSite?.code)}
              {item('Tanggal mulai', formatDate(p.startDate))}
              {item('Masa kerja', p.tenure ? p.tenure.label + (p.isFormer ? ' (sampai penempatan terakhir)' : '') : null)}
              {item('Status kepegawaian', p.employmentType ? labelOf(p.employmentType) + (p.employmentType === 'PKWT' && p.contractEndDate ? ` · s/d ${formatDate(p.contractEndDate)}` : '') : 'Belum diisi')}
              {item('Mandor', p.foreman ? p.foreman.name + (p.foreman.nip ? ` (NIP ${p.foreman.nip})` : '') : null)}
              {item('No WA', p.phoneWa)}
              {item('Kontak darurat', [p.emergencyName, p.emergencyRelation, p.emergencyPhone].filter(Boolean).join(' · '))}
              {item('BPJS Kesehatan', p.bpjsKesehatan)}
              {item('BPJS TK', p.bpjsKetenagakerjaan)}
              {item('Gol. darah', p.bloodType)}
              {item('Baju / sepatu', [p.shirtSize, p.shoeSize].filter(Boolean).join(' / '))}
              {item('Riwayat penyakit', p.medicalHistory)}
              <div>
                <dt>Rekening</dt>
                <dd>{p.bankName ? `${p.bankName} · ` : ''}{revealed.bankAccount ?? p.bankAccount ?? (p.access.bank ? <span className="badge badge-warning">Rekening belum diisi</span> : '-')} {p.access.bank && p.bankAccount && !revealed.bankAccount && <button className="btn btn-ghost btn-sm" onClick={() => reveal('BANK')}><Eye size={14} /></button>}</dd>
              </div>
            </dl>
          </Card>
          {p.crew.length > 0 && (
            <Card title={`Anggota regu (${p.crew.length})`} padding={0}>
              <DataTable rows={p.crew} columns={[{ key: 'name', label: 'Nama', render: (c) => <Link href={'/personnel/' + c.id}>{c.name}</Link> }, { key: 'nip', label: 'NIP', render: (c) => c.nip ?? '-' }, { key: 'position', label: 'Jabatan' }]} />
            </Card>
          )}
        </div>
      )}

      {tab === 'placement' && (
        <div className="stack">
          <Card title="Riwayat penempatan" padding={0}>
            <DataTable rows={p.placements} columns={[
              { key: 'site', label: 'Site', render: (r) => `${r.site.code} — ${r.site.name}` },
              { key: 'position', label: 'Jabatan' },
              { key: 'start', label: 'Mulai', render: (r) => formatDate(r.startDate) },
              { key: 'end', label: 'Akhir', render: (r) => formatDate(r.endDate) },
              { key: 'status', label: 'Status', render: (r) => <Badge value={r.status} /> },
              { key: 'reason', label: 'Keterangan', render: (r) => [labelOf(r.endReason), r.notes].filter(Boolean).join(' · ') || '-' },
              ...(canCorrectPlacement ? [{ key: 'fix', label: '', render: (r) => <button className="btn btn-ghost btn-sm" onClick={() => openFix(r)} title="Koreksi tanggal penempatan"><Edit size={14} /></button> }] : []),
            ]} />
          </Card>
          <Card title="Pengajuan mutasi" padding={0}>
            <DataTable rows={p.mutations} empty="Belum ada mutasi." columns={[
              { key: 'number', label: 'Nomor' },
              { key: 'to', label: 'Tujuan', render: (m) => `${m.toSite.code} · ${m.toPosition}` },
              { key: 'eff', label: 'Efektif', render: (m) => formatDate(m.effectiveDate) },
              { key: 'status', label: 'Status', render: (m) => <Badge value={m.status} /> },
              { key: 'dec', label: 'Keputusan HO', render: (m) => (m.decidedName ? `${m.decidedName}: ${m.decisionNote ?? ''}` : '-') },
            ]} />
          </Card>
        </div>
      )}

      {tab === 'mcu' && (
        <Card title="Riwayat MCU" padding={0} actions={<Link className="btn btn-outline btn-sm" href={`/mcu?personnelId=${p.id}`}>Kelola MCU</Link>}>
          <DataTable rows={p.mcus} empty="Belum ada MCU." columns={[
            { key: 'type', label: 'Jenis', render: (m) => labelOf(m.type) },
            { key: 'clinic', label: 'Klinik' },
            { key: 'date', label: 'Tgl MCU', render: (m) => formatDate(m.mcuDate) },
            { key: 'stage', label: 'Tahap', render: (m) => <Badge value={m.stage} /> },
            { key: 'result', label: 'Hasil', render: (m) => <Badge value={m.result} /> },
            { key: 'valid', label: 'Berlaku s/d', render: (m) => formatDate(m.validUntil) },
            { key: 'notes', label: 'Catatan medis', render: (m) => m.notes ?? '-' },
          ]} />
        </Card>
      )}

      {tab === 'permit' && (
        <Card title="Riwayat permit & SKS" padding={0} actions={<Link className="btn btn-outline btn-sm" href={`/permits?personnelId=${p.id}`}>Kelola permit</Link>}>
          <DataTable rows={p.permits} empty="Belum ada permit." columns={[
            { key: 'kind', label: 'Jenis', render: (r) => `${labelOf(r.kind)} · ${r.permitType}` },
            { key: 'number', label: 'Nomor' },
            { key: 'site', label: 'Site', render: (r) => r.site.code },
            { key: 'period', label: 'Masa berlaku', render: (r) => `${formatDate(r.startDate)} – ${formatDate(r.endDate)}` },
            { key: 'status', label: 'Status', render: (r) => <Badge value={permitStatus(r, now)} /> },
          ]} />
        </Card>
      )}

      {tab === 'roster' && (
        <Card title="Cuti, izin & sakit (20 terakhir)" padding={0} actions={<Link className="btn btn-outline btn-sm" href={`/roster?personnelId=${p.id}`}>Kelola roster</Link>}>
          <DataTable rows={p.leaves} empty="Belum ada catatan." columns={[
            { key: 'type', label: 'Jenis', render: (l) => <Badge value={l.type} /> },
            { key: 'period', label: 'Periode', render: (l) => `${formatDate(l.startDate)} – ${formatDate(l.endDate)}` },
            { key: 'ret', label: 'Kembali', render: (l) => formatDate(l.returnDate) },
            { key: 'status', label: 'Status', render: (l) => <Badge value={l.status} /> },
            { key: 'reason', label: 'Keterangan' },
          ]} />
        </Card>
      )}

      {tab === 'kompetensi' && (
        <Card title="Sertifikat & kompetensi" padding={0} actions={<Link className="btn btn-outline btn-sm" href={`/training?tab=certificates&personnelId=${p.id}`}>Kelola</Link>}>
          <DataTable rows={p.certificates} empty="Belum ada sertifikat (opsional pada data awal)." columns={[
            { key: 'c', label: 'Kompetensi', render: (c) => c.competency.name },
            { key: 'certNumber', label: 'No sertifikat' },
            { key: 'issuer', label: 'Penerbit' },
            { key: 'exp', label: 'Berlaku s/d', render: (c) => formatDate(c.expiryDate) },
          ]} />
        </Card>
      )}

      {tab === 'mobilisasi' && (
        <Card title="Riwayat mobilisasi & demobilisasi" padding={0}>
          <DataTable rows={p.mobilizations} empty="Belum ada mobilisasi." columns={[
            { key: 'code', label: 'Kloter', render: (m) => m.mobilization.code },
            { key: 'type', label: 'Jenis', render: (m) => labelOf(m.mobilization.type) },
            { key: 'date', label: 'Berangkat', render: (m) => formatDate(m.mobilization.departDate) },
            { key: 'dest', label: 'Tujuan', render: (m) => m.mobilization.destination },
            { key: 'status', label: 'Status', render: (m) => <Badge value={m.mobilization.status} /> },
            { key: 'arr', label: 'Tiba', render: (m) => (m.arrived ? formatDate(m.arrivedAt) : '-') },
          ]} />
        </Card>
      )}

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit personel" subtitle="Field sensitif (NIK, alamat KTP, rekening) diisi hanya bila diubah." size="modal-xl">
        {editing && (
          <PersonnelForm editing={p.id} sites={sites} canMedical={p.access.medical} canBank={p.access.bank} canEmployment={canEmployment}
            initial={{
              nik: '', nikMasked: p.nik, nip: p.nip ?? '', name: p.name, birthPlace: p.birthPlace ?? '', birthDate: iso(p.birthDate) ?? '', gender: p.gender ?? '',
              maritalStatus: p.maritalStatus ?? '', education: p.education ?? '', major: p.major ?? '', phoneWa: p.phoneWa ?? '',
              emergencyName: p.emergencyName ?? '', emergencyPhone: p.emergencyPhone ?? '', emergencyRelation: p.emergencyRelation ?? '',
              ktpAddress: '', domicileAddress: p.domicileAddress ?? '', originRegion: p.originRegion ?? '', category: p.category, position: p.position,
              startDate: iso(p.startDate) ?? '', employmentType: p.employmentType ?? '', contractEndDate: iso(p.contractEndDate) ?? '',
              npwp: '', npwpMasked: p.npwp && p.npwp !== '[dibatasi]' ? p.npwp : '', bpjsKesehatan: p.bpjsKesehatan ?? '', bpjsKetenagakerjaan: p.bpjsKetenagakerjaan ?? '',
              bloodType: p.bloodType ?? '', medicalHistory: '', shirtSize: p.shirtSize ?? '', shoeSize: p.shoeSize ?? '', bankName: p.bankName ?? '',
              bankAccount: '', bankAccountName: p.bankAccountName ?? '', foremanId: p.foremanId ?? '', ocrVerified: p.ocrVerified,
            }}
            onDone={() => setEditing(false)} />
        )}
      </Modal>

      <Modal open={Boolean(fix)} onClose={() => setFix(null)} title="Koreksi riwayat penempatan" subtitle={fix ? `${fix.label} — perubahan tercatat di audit log. Koreksi pada penempatan pertama juga memperbarui tanggal mulai personel.` : ''}>
        {fix && (
          <form onSubmit={saveFix} className="stack">
            <FormFields fields={fixFields} values={fix} setValues={setFix} />
            {!fix.ended && <div className="notice">Penempatan masih aktif: tanggal akhir diisi saat penempatan diakhiri atau dimutasi.</div>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan koreksi'}</button>
          </form>
        )}
      </Modal>

      <Modal open={statusOpen} onClose={() => setStatusOpen(false)} title="Ubah status kerja" subtitle="Perubahan tercatat di audit log dan memperbarui dashboard & monitoring HRD.">
        <form onSubmit={saveStatus} className="stack">
          <select className="form-select" value={status.workStatus} onChange={(e) => setStatus({ ...status, workStatus: e.target.value })}>
            {WORK_STATUSES.map((s) => <option key={s} value={s}>{labelOf(s)}</option>)}
          </select>
          <textarea className="form-input" rows={3} placeholder="Catatan / alasan" value={status.note} onChange={(e) => setStatus({ ...status, note: e.target.value })} />
          <div className="notice">Mutasi antar-site tetap melalui pengajuan mutasi dan disahkan HO. Demobilisasi melalui modul Mobilisasi.</div>
          <button className="btn btn-primary" disabled={busy}>Simpan</button>
        </form>
      </Modal>
    </div>
  );
}
