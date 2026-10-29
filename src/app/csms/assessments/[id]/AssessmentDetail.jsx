'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Save, Lock, GitBranch, Trash2, Download, Printer, Flag } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate } from '@/lib/dates';
import { labelOf } from '@/lib/labels';
import { assessmentTotals, PIC_ROLES } from '@/lib/domain/csms';

export default function AssessmentDetail({ a }) {
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const initial = useMemo(() => Object.fromEntries(a.scores.map((s) => [s.itemId, { score: s.score, applicable: s.applicable, note: s.note ?? '' }])), [a.scores]);
  const [vals, setVals] = useState(initial);
  const [finding, setFinding] = useState(null);
  const dirty = a.scores.filter((s) => JSON.stringify(vals[s.itemId]) !== JSON.stringify(initial[s.itemId]));
  const live = a.scores.map((s) => ({ ...s, ...vals[s.itemId] }));
  const totals = assessmentTotals(live, a.template.naPolicy);
  const set = (itemId, patch) => setVals((v) => ({ ...v, [itemId]: { ...v[itemId], ...patch } }));

  const save = () => submit(`/api/csms/assessments/${a.id}`, { method: 'PUT', body: { scores: dirty.map((s) => ({ itemId: s.itemId, ...vals[s.itemId] })) } });
  const finalize = async () => {
    if (totals.unscored) return showConfirm(`${totals.unscored} butir berlaku belum dinilai.`, 'Belum lengkap');
    if (!(await showConfirm(`Kunci assessment dengan nilai ${totals.total}/${totals.max} (${totals.percent}%)? Setelah final, nilai tidak dapat diubah; koreksi lewat revisi.`, 'Finalisasi assessment'))) return;
    if (dirty.length && !(await save())) return;
    await submit(`/api/csms/assessments/${a.id}`, { body: { action: 'FINALIZE' } });
  };
  const revise = async () => {
    const reason = await showPrompt('Alasan koreksi (wajib). Versi final ini tetap tersimpan.', 'Buat revisi');
    if (!reason?.trim()) return;
    const res = await submit(`/api/csms/assessments/${a.id}`, { body: { action: 'REVISE', reason } });
    if (res?.id) router.push(`/csms/assessments/${res.id}`);
  };
  const remove = async () => {
    if (await showConfirm(`Hapus draft ${a.number}?`, 'Hapus draft') && (await submit(`/api/csms/assessments/${a.id}`, { method: 'DELETE' }))) router.push('/csms?tab=assessment');
  };
  const saveFinding = async (e) => {
    e.preventDefault();
    const res = await submit('/api/csms/findings', { body: finding });
    if (res?.id) setFinding(null);
  };

  const byElement = a.elements.map((e) => ({ ...e, rows: a.scores.filter((s) => s.elementNo === e.number) })).filter((e) => e.rows.length);
  return (
    <div className="stack">
      <div className="print-only">
        <h2 style={{ margin: 0 }}>Hasil Assessment Internal K3LH — {a.number}</h2>
        <div>{a.site.code} — {a.site.name} · {a.template.sourceDocCode} ({a.template.code} v{a.template.version}) · {a.periodLabel} · {formatDate(a.assessmentDate)}</div>
        <div><strong>Status: {a.status === 'FINAL' ? `FINAL (${formatDate(a.finalizedAt)}, ${a.finalizedByName})` : 'DRAFT — belum final'}</strong>{a.revisionNo ? ` · Revisi ${a.revisionNo}` : ''}</div>
      </div>
      <div className="toolbar">
        <Link className="btn btn-ghost btn-sm" href="/csms?tab=assessment">← Assessment</Link>
        <Badge value={a.status} label={a.status === 'FINAL' ? 'Final' : 'Draft'} />
        {a.supersededAt && <Badge value="SUPERSEDED" label="Digantikan revisi" />}
        <div className="spacer" />
        <a className="btn btn-outline btn-sm" href={`/api/csms/export?kind=assessment&id=${a.id}`}><Download size={15} /> Excel</a>
        <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={15} /> PDF</button>
        {a.canEdit && <button className="btn btn-outline btn-sm" disabled={busy || !dirty.length} onClick={save}><Save size={15} /> Simpan nilai{dirty.length ? ` (${dirty.length})` : ''}</button>}
        {a.canEdit && <button className="btn btn-primary btn-sm" disabled={busy} onClick={finalize}><Lock size={15} /> Finalisasi</button>}
        {a.canEdit && !a.findings.length && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={remove}><Trash2 size={15} /></button>}
        {a.canRevise && <button className="btn btn-outline btn-sm" disabled={busy} onClick={revise}><GitBranch size={15} /> Buat revisi</button>}
      </div>

      <div className="grid-2">
        <Card title="Hasil">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'baseline' }}>
            <div><div className="muted">Nilai aktual / maksimum berlaku</div><div style={{ fontSize: 26, fontWeight: 600 }}>{totals.total} / {totals.max}</div></div>
            <div><div className="muted">Persentase</div><div style={{ fontSize: 26, fontWeight: 600 }}>{totals.percent === null ? '—' : `${totals.percent.toLocaleString('id-ID')}%`}</div></div>
            <div><div className="muted">Belum dinilai</div><div style={{ fontSize: 26, fontWeight: 600 }} className={totals.unscored ? 'text-orange' : ''}>{totals.unscored}</div></div>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            Maksimum sumber {a.template.sourceMaxScore ?? '-'}; N/A {a.template.naPolicy === 'EXCLUDE_FROM_MAX' ? 'dikeluarkan dari maksimum' : 'dihitung 0'}.
            Kelulusan/kategori risiko tidak ditetapkan aplikasi sampai aturan owner disetujui HO.
          </p>
        </Card>
        <Card title="Identitas">
          <dl className="detail-grid">
            <div><dt>Site</dt><dd>{a.site.code} — {a.site.name}</dd></div>
            <div><dt>Template</dt><dd>{a.template.code} v{a.template.version}<div className="muted">{a.template.sourceDocCode} · {a.template.ownerName}</div></dd></div>
            <div><dt>Periode / tanggal</dt><dd>{a.periodLabel}<div className="muted">{formatDate(a.assessmentDate)}</div></dd></div>
            <div><dt>Penilai</dt><dd>{a.assessors}</dd></div>
            <div><dt>Tingkat risiko pekerjaan</dt><dd>{a.riskLevel ? labelOf(a.riskLevel) : '-'}<div className="muted">Data terpisah dari hasil</div></dd></div>
            {a.revisionOf && <div><dt>Revisi dari</dt><dd><Link href={`/csms/assessments/${a.revisionOf.id}`}>{a.revisionOf.number}</Link><div className="muted">{a.revisionReason}</div></dd></div>}
            {a.revisions.length > 0 && <div><dt>Revisi berikutnya</dt><dd>{a.revisions.map((r) => <div key={r.id}><Link href={`/csms/assessments/${r.id}`}>{r.number}</Link> ({r.status === 'FINAL' ? 'Final' : 'Draft'})</div>)}</dd></div>}
          </dl>
        </Card>
      </div>
      {a.template.scoringGuide && <div className="notice info no-print"><strong>Pedoman nilai:</strong> {a.template.scoringGuide}</div>}

      {byElement.map((e) => (
        <Card key={e.number} title={`${e.number}. ${e.name}`} padding={0}>
          <DataTable rows={e.rows} rowKey={(s) => s.itemId} columns={[
            { key: 'c', label: 'Kode', width: 110, render: (s) => <span className="muted">{s.itemCode}</span> },
            { key: 't', label: 'Parameter', render: (s) => <div style={{ maxWidth: 420 }}>{s.itemText}</div> },
            { key: 'm', label: 'Maks', num: true, render: (s) => s.maxScore },
            {
              key: 'v', label: 'Nilai', render: (s) => (a.canEdit ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select className="form-select" style={{ width: 92 }} aria-label={`Nilai ${s.itemCode}`} disabled={!vals[s.itemId].applicable} value={vals[s.itemId].score ?? ''} onChange={(ev) => set(s.itemId, { score: ev.target.value === '' ? null : Number(ev.target.value) })}>
                    <option value="">—</option>
                    {Array.from({ length: s.maxScore + 1 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                  </select>
                  <label style={{ fontSize: 12.5, display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!vals[s.itemId].applicable} onChange={(ev) => set(s.itemId, { applicable: !ev.target.checked, score: ev.target.checked ? null : vals[s.itemId].score })} /> N/A</label>
                </div>
              ) : s.applicable ? <strong>{s.score ?? '—'}</strong> : <Badge value="NA" label="N/A" />),
            },
            { key: 'n', label: 'Ket. (finding/temuan)', render: (s) => (a.canEdit ? <input className="form-input" value={vals[s.itemId].note} onChange={(ev) => set(s.itemId, { note: ev.target.value })} /> : s.note ?? '') },
            {
              key: 'e', label: 'Bukti yang dinilai', render: (s) => (s.evidence?.items?.length ? (
                <div style={{ fontSize: 12.5 }}>
                  {s.evidence.items.slice(0, 3).map((x, i) => <div key={i}>• {x.title}</div>)}
                  {s.evidence.items.length > 3 && <div className="muted">+{s.evidence.items.length - 3} lainnya</div>}
                  {s.requirementId && <Link className="no-print" href={`/csms/requirements/${s.requirementId}?period=${encodeURIComponent(s.evidence.periodKey)}`}>Periode {s.evidence.periodKey}</Link>}
                </div>
              ) : <span className="muted">Belum ada bukti</span>),
            },
            {
              key: 'f', label: '', render: (s) => a.canFinding && s.requirementId ? (
                <button className="btn btn-ghost btn-sm no-print" title="Catat temuan" onClick={() => setFinding({ siteId: a.site.id, source: 'ASSESSMENT', assessmentId: a.id, requirementId: s.requirementId, description: vals[s.itemId].note || '', picRole: 'HSE_SITE', picName: '', dueDate: '' })}><Flag size={14} /></button>
              ) : null,
            },
          ]} />
        </Card>
      ))}

      {a.findings.length > 0 && (
        <Card title="Temuan dari assessment ini" padding={0}>
          <DataTable rows={a.findings} onRowClick={(f) => router.push(`/csms/findings/${f.id}`)} columns={[
            { key: 'n', label: 'Nomor', render: (f) => f.number },
            { key: 'd', label: 'Uraian', render: (f) => f.description },
            { key: 's', label: 'Status', render: (f) => <Badge value={f.status} /> },
          ]} />
        </Card>
      )}

      <Modal open={Boolean(finding)} onClose={() => setFinding(null)} title="Catat temuan assessment" subtitle="Temuan masuk register Verifikasi & Tindak Lanjut; ditutup setelah diverifikasi HO.">
        {finding && (
          <form onSubmit={saveFinding} className="stack">
            <FormFields values={finding} setValues={setFinding} fields={[
              { name: 'description', label: 'Uraian temuan', type: 'textarea', required: true, span: true },
              { name: 'picRole', label: 'PIC (bagian)', type: 'select', options: PIC_ROLES.map((r) => [r, labelOf(r)]) },
              { name: 'picName', label: 'Nama PIC' },
              { name: 'dueDate', label: 'Tenggat', type: 'date' },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan temuan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
