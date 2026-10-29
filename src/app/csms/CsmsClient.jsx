'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Clock, AlertTriangle, CheckCircle2, FileWarning, CalendarX, Undo2, Search as SearchIcon, Plus, Copy, CheckCheck, Trash2, Download, History, Settings2, ExternalLink, Printer } from 'lucide-react';
import { Badge, Card, DataTable, FilterBar, FormFields, Kpi, Modal, Pager, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate, iso, todayIso } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { PIC_ROLES } from '@/lib/domain/csms';
import { Flags, Percent, RESP_LABELS, STATUS_OPTIONS, StatusBadge, freqLabel, picLabel } from './shared';
import { FindingsRegister } from './Findings';
import { AdministrationCard, CompanyProfileCard } from './Administration';
import { AssessmentList } from './Assessments';

export default function CsmsClient({ tab, user, sites, data, page }) {
  if (tab === 'summary') return <Summary data={data} sites={sites} user={user} />;
  if (tab === 'checklist') return <Checklist data={data} page={page} />;
  if (tab === 'documents') return <MasterDocuments data={data} sites={sites} canManage={user.role === 'HO_HSE'} />;
  if (tab === 'assessment') return <AssessmentList data={data} canCreate={user.role === 'HO_HSE'} />;
  if (tab === 'verify') return <VerifyQueue data={data} sites={sites} canCreate={['HO_HSE', 'HSE_SITE'].includes(user.role)} />;
  return <Setup data={data} sites={sites} />;
}

const periodFilter = { name: 'period', label: 'Periode (bulan)', type: 'month', default: todayIso().slice(0, 7) };
const siteFilter = (sites) => ({ name: 'siteId', label: 'Site', type: 'select', allLabel: 'Semua site', options: sites.filter((s) => !s.isHo).map((s) => [s.id, s.code]) });

// ─── Ringkasan ──────────────────────────────────────────────────────────────
function Summary({ data, sites, user }) {
  const t = data.totals;
  const single = data.perApp.length === 1 ? data.perApp[0] : null;
  return (
    <div className="stack">
      <FilterBar filters={[siteFilter(sites), periodFilter]}>
        <a className="btn btn-outline" href={`/api/csms/export?kind=recap&period=${data.month}`}><Download size={16} /> Rekap Excel</a>
        <a className="btn btn-outline" href="/api/csms/export?kind=admin"><Download size={16} /> 008B Excel</a>
      </FilterBar>
      <div className="notice info">
        <strong>Kelengkapan terverifikasi</strong> = butir berlaku yang terverifikasi HO ÷ butir berlaku. Angka ini bukan nilai assessment dan bukan keputusan kelulusan owner.
        Verifikasi HO adalah verifikasi internal PJM.
      </div>
      {data.perApp.length === 0 ? (
        <div className="card"><div className="empty-state"><p>Belum ada template CSMS yang diterapkan ke site dalam cakupan Anda.</p><p className="muted">HO HSE menetapkan template di sub-menu Template &amp; Penerapan.</p></div></div>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi label="Persyaratan berlaku" value={t.applicable ?? 0} icon={ClipboardList} tone="navy" hint={`Periode ${data.month}`} href="/csms?tab=checklist" />
            <Kpi label="Belum diisi" value={t.notFilled ?? 0} icon={FileWarning} tone="orange" href="/csms?tab=checklist&status=BELUM" />
            <Kpi label="Menunggu pemeriksaan" value={t.waiting ?? 0} icon={Clock} tone="blue" href="/csms?tab=verify" />
            <Kpi label="Perlu revisi" value={t.revision ?? 0} icon={Undo2} tone="orange" href="/csms?tab=checklist&status=REVISION" />
            <Kpi label="Terverifikasi" value={t.verified ?? 0} icon={CheckCircle2} tone="green" href="/csms?tab=checklist&status=VERIFIED" />
            <Kpi label="Bukti kedaluwarsa" value={t.expired ?? 0} icon={AlertTriangle} tone="red" hint={`${t.expiring ?? 0} mendekati habis (≤ ${data.expiringDays} hari)`} href="/csms?tab=checklist&status=EXPIRED" />
            <Kpi label="Tenggat terlewati" value={t.overdue ?? 0} icon={CalendarX} tone="red" href="/csms?tab=checklist&status=OVERDUE" />
            <Kpi label="Temuan belum ditutup" value={data.findingsOpen ?? 0} icon={SearchIcon} tone={data.findingsOpen ? 'orange' : 'navy'} href="/csms?tab=verify&fstatus=OPEN" />
          </div>
          <div className="grid-2">
            <Card title="(A) Kelengkapan terverifikasi">
              <Percent summary={data.completeness} big />
            </Card>
            <Card title="(B) Nilai assessment internal (final terakhir)" padding={data.finals.length ? 0 : 20}>
              {data.finals.length ? (
                <DataTable rows={data.finals} columns={[
                  { key: 's', label: 'Site', render: (a) => a.site.code },
                  { key: 'n', label: 'Assessment', render: (a) => (<Link href={`/csms/assessments/${a.id}`}>{a.number}<div className="muted">{a.periodLabel} · {a.template.code} v{a.template.version}</div></Link>) },
                  { key: 'd', label: 'Tanggal', render: (a) => formatDate(a.assessmentDate) },
                  { key: 'v', label: 'Nilai', render: (a) => (<div><strong>{Number(a.percent).toLocaleString('id-ID')}%</strong><div className="muted">{a.totalScore}/{a.maxScore}</div></div>) },
                ]} />
              ) : <p className="muted">Belum ada assessment final. Assessment 0/1/2 dicatat di sub-menu Assessment Internal dan dinilai penilai berdasarkan bukti.</p>}
            </Card>
          </div>
          <Card title="Rekap per site" padding={0}>
            <DataTable rows={data.perApp} rowKey={(p) => p.app.id} columns={[
              { key: 'site', label: 'Site', render: (p) => (<div><strong>{p.app.site.code}</strong><div className="muted">{p.app.site.name}</div></div>) },
              { key: 'tpl', label: 'Template / owner', render: (p) => (<div>{p.app.template.code} v{p.app.template.version}<div className="muted">{p.app.project?.owner ?? p.app.template.ownerName}</div></div>) },
              { key: 'pct', label: 'Kelengkapan', render: (p) => <Percent summary={p.summary} /> },
              { key: 'wait', label: 'Menunggu', num: true, render: (p) => p.cards.waiting },
              { key: 'rev', label: 'Revisi', num: true, render: (p) => p.cards.revision },
              { key: 'due', label: 'Tenggat lewat', num: true, render: (p) => (p.cards.overdue ? <span className="text-red">{p.cards.overdue}</span> : 0) },
              { key: 'exp', label: 'Bukti kedaluwarsa', num: true, render: (p) => p.cards.expired },
              { key: 'na', label: 'Usulan N/A', num: true, render: (p) => p.cards.naPending },
              { key: 'a', label: '', render: (p) => <Link className="btn btn-outline btn-sm" href={`/csms?tab=checklist&applicationId=${p.app.id}&period=${data.month}`}>Checklist</Link> },
            ]} />
          </Card>
          {single && (
            <Card title={`Kelengkapan per unsur — ${single.app.site.code}`} padding={0}>
              <DataTable rows={single.byElement} rowKey={(e) => e.number} columns={[
                { key: 'n', label: 'Unsur', render: (e) => `${e.number}. ${e.name}` },
                { key: 'p', label: 'Kelengkapan', render: (e) => <Percent summary={e} /> },
                { key: 'a', label: '', render: (e) => <Link className="btn btn-ghost btn-sm" href={`/csms?tab=checklist&applicationId=${single.app.id}&element=${e.number}&period=${data.month}`}>Buka</Link> },
              ]} />
            </Card>
          )}
          <Card title="Perlu ditindaklanjuti" padding={0}>
            <DataTable rows={data.perApp.flatMap((p) => p.todo.map((r) => ({ ...r, site: p.app.site.code })))} empty="Tidak ada butir yang terlambat, perlu revisi, atau buktinya kedaluwarsa." columns={[
              { key: 'site', label: 'Site', render: (r) => r.site },
              { key: 'code', label: 'Butir', render: (r) => (<div><strong>{r.code}</strong> <span className="muted">{r.internalCode}</span><div className="cell-sub">{r.text}</div></div>) },
              { key: 'st', label: 'Status', render: (r) => (<><StatusBadge value={r.status} /><Flags flags={r.flags} /></>) },
              { key: 'due', label: 'Tenggat', render: (r) => formatDate(r.nextDue) },
              { key: 'a', label: '', render: (r) => <Link className="btn btn-outline btn-sm" href={detailHref(r)}>Buka</Link> },
            ]} />
          </Card>
        </>
      )}
      <AdministrationCard admin={data.admin} user={user} />
    </div>
  );
}

const detailHref = (r) => {
  const p = r.periods?.find((x) => x.status !== 'VERIFIED' && x.started) ?? r.periods?.find((x) => x.started) ?? r.periods?.[0];
  return `/csms/requirements/${r.id}${p ? `?period=${encodeURIComponent(p.periodKey)}` : ''}`;
};

// ─── Checklist & bukti ──────────────────────────────────────────────────────
function Checklist({ data, page }) {
  const router = useRouter();
  if (!data.app) {
    return (
      <div className="card"><div className="empty-state"><p>Belum ada template CSMS yang diterapkan ke site Anda.</p><p className="muted">HO HSE menetapkan template dan persyaratan per site di sub-menu Template &amp; Penerapan.</p></div></div>
    );
  }
  const a = data.app;
  return (
    <div className="stack">
      <FilterBar filters={[
        { name: 'applicationId', label: 'Site / template', type: 'select', noAll: true, default: a.id, options: data.apps.map((x) => [x.id, x.label]) },
        periodFilter,
        { name: 'element', label: 'Unsur', type: 'select', options: data.elements.map((e) => [String(e.number), `${e.number}. ${e.name}`]) },
        { name: 'status', label: 'Status', type: 'select', options: [...STATUS_OPTIONS, ['OVERDUE', 'Tenggat terlewati'], ['EXPIRED', 'Bukti kedaluwarsa']] },
        { name: 'pic', label: 'PIC', type: 'select', options: PIC_ROLES.map((r) => [r, labelOf(r)]) },
        { type: 'search', label: 'Cari', placeholder: 'Kode / persyaratan' },
      ]}>
        <a className="btn btn-outline" href={`/api/csms/export?kind=checklist&applicationId=${a.id}&period=${data.month}`}><Download size={16} /> Excel</a>
        <a className="btn btn-outline" href={`/api/csms/export?kind=documents&applicationId=${a.id}&period=${data.month}`}><Download size={16} /> Kekurangan</a>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> PDF</button>
      </FilterBar>
      <div className="card" style={{ padding: 16, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        <div><div className="muted">Site</div><strong>{a.site.code} — {a.site.name}</strong></div>
        <div><div className="muted">Template</div><strong>{a.template.code} v{a.template.version}</strong><div className="muted">{a.project?.owner ?? a.template.ownerName}</div></div>
        <div><div className="muted">Alur</div><strong>{a.requireReview ? 'Site → PJO/PM → HO' : 'Site → HO'}</strong></div>
        <div><div className="muted">Kelengkapan {data.month}</div><Percent summary={data.summary} /></div>
      </div>
      <div className="card">
        <DataTable rows={data.rows} empty="Tidak ada butir yang cocok dengan filter." onRowClick={(r) => router.push(detailHref(r))} columns={[
          { key: 'code', label: 'Kode', width: 90, render: (r) => (<div><strong>{r.code}</strong><div className="muted">{r.internalCode}</div></div>) },
          { key: 'el', label: 'Unsur', width: 60, render: (r) => r.element.number },
          { key: 'text', label: 'Persyaratan', render: (r) => (<div style={{ maxWidth: 420 }}>{r.text}{r.origin === 'SITE_ADDITION' && <div><Badge value="SITE_ADDITION" /></div>}</div>) },
          { key: 'resp', label: 'Penanggung jawab', render: (r) => RESP_LABELS[r.responsibility] },
          { key: 'pic', label: 'PIC utama', render: picLabel },
          { key: 'freq', label: 'Frekuensi', render: (r) => (<div>{freqLabel(r.frequency)}{r.periods.length > 1 && <div className="muted">{r.periods.filter((p) => p.status === 'VERIFIED').length}/{r.periods.length} periode</div>}</div>) },
          { key: 'due', label: `Tenggat (${data.tz})`, render: (r) => (r.nextDue ? formatDate(r.nextDue) : <span className="muted">Belum ditetapkan</span>) },
          { key: 'ev', label: 'Bukti', num: true, render: (r) => r.evidenceCount },
          { key: 'st', label: 'Status', render: (r) => (r.status ? <><StatusBadge value={r.status} /><Flags flags={r.flags} /></> : <span className="muted">Tidak ada periode wajib</span>) },
          { key: 'note', label: 'Catatan pemeriksaan', render: (r) => r.reviewNote ?? <span className="muted">-</span> },
          { key: 'next', label: 'Tindakan berikutnya', render: (r) => r.nextAction },
        ]} />
      </div>
      <Pager page={page} total={data.total} />
    </div>
  );
}

// ─── Dokumen induk HO ───────────────────────────────────────────────────────
function MasterDocuments({ data, sites, canManage }) {
  const { submit, busy } = useSubmit();
  const [versions, setVersions] = useState(null);
  const [form, setForm] = useState(null);
  const [itemFilter, setItemFilter] = useState('');
  const groups = useMemo(() => {
    const m = new Map();
    for (const i of data.items ?? []) {
      const key = `${i.template.code} v${i.template.version} · ${i.element.number}. ${i.element.name}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(i);
    }
    return [...m.entries()];
  }, [data.items]);
  const save = async (e) => {
    e.preventDefault();
    const { id, ...body } = form;
    if (await submit(`/api/csms/documents/${id}`, { method: 'PUT', body })) setForm(null);
  };
  const toggle = (key, value) => setForm((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] }));
  return (
    <div className="stack">
      <FilterBar filters={[
        { type: 'search', label: 'Cari', placeholder: 'Nomor / judul' },
        { name: 'linked', label: 'Tampilkan', type: 'select', allLabel: 'Tertaut ke CSMS', options: [['all', 'Semua dokumen HO']] },
        { name: 'status', label: 'Status', type: 'select', allLabel: 'Aktif', options: [['ARSIP', 'Arsip']] },
      ]}>
        <Link className="btn btn-outline" href="/documents"><ExternalLink size={16} /> Dokumen HSE</Link>
      </FilterBar>
      <div className="notice info">Sumber utama dokumen induk adalah menu <strong>Dokumen HSE</strong> (unggah & revisi di sana; versi lama tetap tersimpan). Di sini HO menautkan dokumen ke butir CSMS dan mengatur site yang boleh mengakses. Site menautkan dokumen sebagai bukti tanpa unggah ulang.</div>
      <div className="card">
        <DataTable rows={data.rows} empty="Belum ada dokumen HO yang ditautkan ke CSMS." columns={[
          { key: 'n', label: 'Nomor', render: (d) => (<div><strong>{d.number}</strong><div className="muted">Rev {d.revision}</div></div>) },
          { key: 't', label: 'Judul', render: (d) => (<div>{d.title}<div className="muted">{labelOf(d.category)} · {d.ownerName}</div></div>) },
          { key: 'ap', label: 'Pengesah', render: (d) => d.approverName ?? <span className="muted">-</span> },
          { key: 'dt', label: 'Terbit / berlaku', render: (d) => (<div>{formatDate(d.issueDate)}<div className="muted">Berlaku {d.effectiveDate ? formatDate(d.effectiveDate) : '-'}</div></div>) },
          { key: 'ex', label: 'Kedaluwarsa', render: (d) => (d.validUntil ? <div>{formatDate(d.validUntil)}{d.expiry !== 'VALID' && <div><Badge value={d.expiry} /></div>}</div> : <span className="muted">Tanpa masa berlaku</span>) },
          { key: 'acc', label: 'Akses site', render: (d) => (<div><Badge value={d.accessScope} />{d.accessScope === 'LISTED' && <div className="muted">{d.allowedSites.map((s) => s.site.code).join(', ')}</div>}</div>) },
          { key: 'el', label: 'Unsur terkait', render: (d) => (d.elements.length ? <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{d.elements.map((n) => <span key={n} className="chip">{n}</span>)}</div> : <span className="muted">-</span>) },
          { key: 's', label: 'Status', render: (d) => <Badge value={d.status} /> },
          {
            key: 'a', label: '', render: (d) => (
              <div className="row-actions">
                {d.versions[0] && <a className="btn btn-ghost btn-sm" title="Unduh versi aktif" href={`/api/files/${d.versions[0].fileId}`}><Download size={14} /></a>}
                <button className="btn btn-ghost btn-sm" title="Riwayat versi" onClick={() => setVersions(d)}><History size={14} /></button>
                {canManage && <button className="btn btn-ghost btn-sm" title="Atur tautan CSMS & akses site" onClick={() => setForm({ id: d.id, number: d.number, accessScope: d.accessScope, siteIds: d.allowedSites.map((s) => s.siteId), approverName: d.approverName ?? '', effectiveDate: iso(d.effectiveDate) ?? '', itemIds: d.csmsItems.map((l) => l.item.id) })}><Settings2 size={14} /></button>}
              </div>
            ),
          },
        ]} />
      </div>

      <Modal open={Boolean(versions)} onClose={() => setVersions(null)} title={`Riwayat versi — ${versions?.number ?? ''}`} subtitle="Versi teratas adalah versi aktif.">
        {versions && (
          <DataTable rows={versions.versions} columns={[
            { key: 'rev', label: 'Revisi', render: (v) => v.revision },
            { key: 'at', label: 'Diunggah', render: (v) => formatDate(v.createdAt) },
            { key: 'notes', label: 'Catatan', render: (v) => v.notes ?? '-' },
            { key: 'f', label: 'File', render: (v) => <a href={`/api/files/${v.fileId}`}>Unduh</a> },
          ]} />
        )}
      </Modal>

      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={`Dokumen induk CSMS — ${form?.number ?? ''}`} size="modal-lg" subtitle="Dokumen legalitas terbatas/data pribadi: pilih “Terbatas (HO)” agar tidak terbuka ke site.">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'accessScope', label: 'Akses site', type: 'select', noEmpty: true, options: [['DEFAULT', 'Semua site (perilaku Dokumen HSE)'], ['LISTED', 'Hanya site terpilih'], ['HO_ONLY', 'Terbatas: HO HSE & Direksi']] },
              { name: 'approverName', label: 'Pengesah' },
              { name: 'effectiveDate', label: 'Tanggal berlaku', type: 'date' },
            ]} />
            {form.accessScope === 'LISTED' && (
              <div className="form-group">
                <label className="form-label required">Site yang boleh mengakses</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {sites.filter((s) => !s.isHo).map((s) => (
                    <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={form.siteIds.includes(s.id)} onChange={() => toggle('siteIds', s.id)} /> {s.code}</label>
                  ))}
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Butir CSMS terkait ({form.itemIds.length} dipilih)</label>
              <input className="form-input" placeholder="Saring butir…" value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} />
              <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--gray-200)', borderRadius: 'var(--radius-md)', padding: 8, marginTop: 8 }}>
                {groups.map(([group, items]) => {
                  const shown = items.filter((i) => !itemFilter || `${i.internalCode} ${i.sourceCode ?? ''} ${i.displayText ?? i.sourceText}`.toLowerCase().includes(itemFilter.toLowerCase()));
                  if (!shown.length) return null;
                  return (
                    <div key={group} style={{ marginBottom: 10 }}>
                      <div className="section-title" style={{ margin: '4px 0' }}>{group}</div>
                      {shown.map((i) => (
                        <label key={i.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13.5, padding: '3px 0' }}>
                          <input type="checkbox" checked={form.itemIds.includes(i.id)} onChange={() => toggle('itemIds', i.id)} />
                          <span><strong>{i.sourceCode ?? i.refCode}</strong> <span className="muted">{i.internalCode}</span> — {i.displayText ?? i.sourceText}</span>
                        </label>
                      ))}
                    </div>
                  );
                })}
                {!groups.length && <p className="muted">Belum ada template CSMS.</p>}
              </div>
            </div>
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}

// ─── Verifikasi & tindak lanjut ─────────────────────────────────────────────
function VerifyQueue({ data, sites, canCreate }) {
  const router = useRouter();
  return (
    <div className="stack">
      <FilterBar filters={[siteFilter(sites), { name: 'mine', label: 'Antrean', type: 'select', allLabel: 'Perlu tindakan saya', options: [['0', 'Semua pengajuan menunggu']] }]}>
        <a className="btn btn-outline" href="/api/csms/export?kind=findings"><Download size={16} /> Temuan Excel</a>
      </FilterBar>
      <Card title={`Antrean pemeriksaan (${data.items.length}${data.all !== data.items.length ? ` dari ${data.all}` : ''})`} padding={0}>
        <DataTable rows={data.items} empty="Tidak ada pengajuan yang menunggu tindakan Anda." onRowClick={(r) => router.push(`/csms/requirements/${r.requirementId}?period=${encodeURIComponent(r.periodKey)}`)} columns={[
          { key: 'site', label: 'Site', render: (r) => r.site },
          { key: 'item', label: 'Butir', render: (r) => (<div style={{ maxWidth: 380 }}><strong>{r.code}</strong> <span className="muted">unsur {r.element.number}</span><div className="cell-sub">{r.text}</div></div>) },
          { key: 'p', label: 'Periode', render: (r) => r.periodKey },
          { key: 'by', label: 'Pengaju / operator', render: (r) => r.submittedByName ?? '-' },
          { key: 'at', label: 'Tanggal', render: (r) => formatDate(r.submittedAt) },
          { key: 'ev', label: 'Bukti', num: true, render: (r) => r.evidenceCount },
          { key: 'rv', label: 'Pemeriksa PJO/PM', render: (r) => (r.requireReview ? r.reviewer ?? <span className="muted">Belum</span> : <span className="muted">Tidak diwajibkan</span>) },
          { key: 'st', label: 'Status', render: (r) => (<div><StatusBadge value={r.status} /><div className="muted">Versi {r.version}</div></div>) },
          { key: 'a', label: '', render: (r) => (r.actions.length ? <span className="btn btn-primary btn-sm">{r.actions.includes('VERIFY') ? 'Verifikasi' : 'Periksa'}</span> : null) },
        ]} />
      </Card>
      <FindingsRegister findings={data.findings} sites={sites} canCreate={canCreate} />
      <Card title="Riwayat keputusan terbaru" padding={0}>
        <DataTable rows={data.history} empty="Belum ada keputusan." columns={[
          { key: 'at', label: 'Waktu', render: (h) => new Date(h.createdAt).toLocaleString('id-ID') },
          { key: 'step', label: 'Langkah', render: (h) => ({ SUBMIT: 'Diajukan', REVIEW: 'Diperiksa PJO/PM', RETURN: 'Dikembalikan', VERIFY: 'Diverifikasi HO', REOPEN: 'Dibuka ulang HO', REVISE: 'Diubah setelah verifikasi' }[h.step] ?? h.step) },
          { key: 'res', label: 'Hasil', render: (h) => <StatusBadge value={h.decision} /> },
          { key: 'by', label: 'Oleh', render: (h) => h.actorName },
          { key: 'note', label: 'Catatan', render: (h) => h.note ?? '-' },
        ]} />
      </Card>
    </div>
  );
}

// ─── Template & penerapan (HO) ──────────────────────────────────────────────
function Setup({ data, sites }) {
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const [appForm, setAppForm] = useState(null);
  const active = data.templates.filter((t) => t.status === 'ACTIVE');
  const projects = data.projects ?? [];

  const copy = async (t) => {
    const code = await showPrompt(`Kode template baru. Biarkan ${t.code} untuk membuat versi baru, atau isi kode lain untuk owner/site lain.`, 'Salin template', t.code);
    if (code === null) return;
    const res = await submit(`/api/csms/templates/${t.id}`, { body: { action: 'COPY', code: code.trim() || t.code } });
    if (res?.id) window.location.href = `/csms/templates/${res.id}`;
  };
  const activate = async (t) => {
    if (t.check.diff) {
      if (!(await showConfirm(`Jumlah nilai maksimum butir (${t.check.total}) berbeda ${t.check.diff > 0 ? '+' : ''}${t.check.diff} dari sumber (${t.sourceMaxScore}). Tetap aktifkan?`, 'Selisih nilai maksimum'))) return;
    }
    if (await showConfirm('Template aktif tidak dapat diubah lagi (perubahan berikutnya lewat salinan versi baru). Lanjutkan?', `Aktifkan ${t.code} v${t.version}`)) {
      await submit(`/api/csms/templates/${t.id}`, { body: { action: 'ACTIVATE' } });
    }
  };
  const remove = async (t) => {
    if (await showConfirm(`Hapus draft ${t.code} v${t.version}?`, 'Hapus draft')) await submit(`/api/csms/templates/${t.id}`, { method: 'DELETE' });
  };
  const saveApp = async (e) => {
    e.preventDefault();
    const res = await submit('/api/csms/applications', { body: appForm });
    if (res?.id) { setAppForm(null); window.location.href = `/csms/applications/${res.id}`; }
  };

  return (
    <div className="stack">
      <div className="notice info">Lapis 1: template owner (terkunci setelah aktif). Lapis 2: penerapan per site — butir berlaku/N/A, frekuensi, tenggat, PIC, dan butir tambahan site diatur tanpa mengubah teks owner. Lapis 3: status & bukti per periode di Checklist.</div>
      <CompanyProfileCard company={data.company} />
      <Card title="Template CSMS" actions={data.builtins.filter((b) => !b.loaded).map((b) => (
        <button key={b.code} className="btn btn-outline btn-sm" disabled={busy} onClick={() => submit('/api/csms/templates', { body: { builtin: b.code } })}><Plus size={15} /> Muat {b.code}</button>
      ))} padding={0}>
        <DataTable rows={data.templates} empty="Belum ada template. Muat transkripsi dokumen sumber dengan tombol di atas." columns={[
          { key: 'c', label: 'Kode', render: (t) => (<div><Link href={`/csms/templates/${t.id}`}><strong>{t.code}</strong></Link> v{t.version}</div>) },
          { key: 'n', label: 'Nama / owner', render: (t) => (<div>{t.name}<div className="muted">{t.ownerName}</div></div>) },
          { key: 's', label: 'Sumber', render: (t) => (<div>{t.sourceDocCode}<div className="muted">{t.sourceRevision ?? '-'}</div></div>) },
          { key: 'k', label: 'Butir / nilai maks.', render: (t) => (<div>{t.check.items} butir · {t.check.total}{t.sourceMaxScore !== null && <div className={t.check.diff ? 'text-red' : 'text-green'}>{t.check.diff ? `Selisih ${t.check.diff} dari sumber ${t.sourceMaxScore}` : `Cocok dengan sumber (${t.sourceMaxScore})`}</div>}</div>) },
          { key: 'st', label: 'Status', render: (t) => <Badge value={t.status} label={{ DRAFT: 'Draft', ACTIVE: 'Aktif', RETIRED: 'Pensiun' }[t.status]} /> },
          { key: 'ap', label: 'Diterapkan', num: true, render: (t) => t._count.applications },
          {
            key: 'a', label: '', render: (t) => (
              <div className="row-actions">
                <Link className="btn btn-ghost btn-sm" href={`/csms/templates/${t.id}`}>Buka</Link>
                <button className="btn btn-ghost btn-sm" title="Salin (versi baru / owner lain)" disabled={busy} onClick={() => copy(t)}><Copy size={14} /></button>
                {t.status === 'DRAFT' && <button className="btn btn-ghost btn-sm" title="Aktifkan" disabled={busy} onClick={() => activate(t)}><CheckCheck size={14} /></button>}
                {t.status === 'DRAFT' && !t._count.applications && <button className="btn btn-ghost btn-sm" title="Hapus draft" disabled={busy} onClick={() => remove(t)}><Trash2 size={14} /></button>}
              </div>
            ),
          },
        ]} />
      </Card>
      <Card title="Penerapan per site" padding={0} actions={<button className="btn btn-primary btn-sm" disabled={!active.length} title={active.length ? '' : 'Aktifkan template terlebih dahulu'} onClick={() => setAppForm({ siteId: '', templateId: active[0]?.id ?? '', projectId: '', ownerRegisterNo: '', startDate: todayIso(), endDate: '', requireReview: false, notes: '' })}><Plus size={15} /> Terapkan template</button>}>
        <DataTable rows={data.apps} empty="Belum ada penerapan." columns={[
          { key: 's', label: 'Site', render: (a) => (<div><strong>{a.site.code}</strong><div className="muted">{a.site.name}</div></div>) },
          { key: 't', label: 'Template', render: (a) => `${a.template.code} v${a.template.version}` },
          { key: 'p', label: 'Proyek / owner', render: (a) => (a.project ? <div>{a.project.name}<div className="muted">{a.project.owner}</div></div> : <span className="muted">{a.template.ownerName}</span>) },
          { key: 'r', label: 'No. register CMS', render: (a) => a.ownerRegisterNo ?? <span className="muted">Belum dari owner</span> },
          { key: 'd', label: 'Periode', render: (a) => `${formatDate(a.startDate)} – ${a.endDate ? formatDate(a.endDate) : 'berjalan'}` },
          { key: 'w', label: 'PJO/PM periksa', render: (a) => (a.requireReview ? 'Ya' : 'Tidak') },
          { key: 'st', label: 'Status', render: (a) => <Badge value={a.status} label={a.status === 'ACTIVE' ? 'Aktif' : 'Berakhir'} /> },
          { key: 'a', label: '', render: (a) => <Link className="btn btn-outline btn-sm" href={`/csms/applications/${a.id}`}>Atur persyaratan</Link> },
        ]} />
      </Card>

      <Modal open={Boolean(appForm)} onClose={() => setAppForm(null)} title="Terapkan template ke site" subtitle="Seluruh butir template disalin menjadi persyaratan site; atur frekuensi, tenggat, PIC dan N/A setelahnya.">
        {appForm && (
          <form onSubmit={saveApp} className="stack">
            <FormFields values={appForm} setValues={setAppForm} fields={[
              { name: 'siteId', label: 'Site', type: 'select', required: true, options: sites.filter((s) => !s.isHo).map((s) => [s.id, `${s.code} — ${s.name}`]) },
              { name: 'templateId', label: 'Template aktif', type: 'select', required: true, noEmpty: true, options: active.map((t) => [t.id, `${t.code} v${t.version} — ${t.ownerName}`]) },
              { name: 'projectId', label: 'Proyek / owner (Site & Proyek)', type: 'select', options: projects.filter((p) => p.siteId === appForm.siteId).map((p) => [p.id, `${p.name} — ${p.owner}`]) },
              { name: 'ownerRegisterNo', label: 'No. register CMS (dari owner)' },
              { name: 'startDate', label: 'Mulai berlaku', type: 'date', required: true },
              { name: 'endDate', label: 'Selesai', type: 'date' },
              { name: 'requireReview', label: 'Wajib diperiksa PJO/PM sebelum verifikasi HO', type: 'checkbox', span: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Terapkan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}

