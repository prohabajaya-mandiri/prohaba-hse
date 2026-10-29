'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Edit, Plus, Trash2, Copy, CheckCheck } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { iso } from '@/lib/dates';
import { RESPONSIBILITIES } from '@/lib/domain/csms';
import { FREQ_OPTIONS, RESP_LABELS, freqLabel } from '../../shared';

const STATUS = { DRAFT: 'Draft', ACTIVE: 'Aktif', RETIRED: 'Pensiun' };

export default function TemplateClient({ template: t }) {
  const { submit, busy } = useSubmit();
  const { showConfirm, showPrompt } = useDialog();
  const draft = t.status === 'DRAFT';
  const [meta, setMeta] = useState(null);
  const [el, setEl] = useState(null);
  const [item, setItem] = useState(null);

  const saveMeta = async (e) => {
    e.preventDefault();
    if (await submit(`/api/csms/templates/${t.id}`, { method: 'PUT', body: meta })) setMeta(null);
  };
  const saveEl = async (e) => {
    e.preventDefault();
    const { id, ...body } = el;
    if (await submit(`/api/csms/templates/${t.id}/elements`, { body: { ...body, elementId: id ?? null } })) setEl(null);
  };
  const saveItem = async (e) => {
    e.preventDefault();
    const { id, ...body } = item;
    if (await submit(id ? `/api/csms/templates/${t.id}/items/${id}` : `/api/csms/templates/${t.id}/items`, { method: id ? 'PUT' : 'POST', body })) setItem(null);
  };
  const removeItem = async (i) => {
    if (await showConfirm(`Hapus butir ${i.internalCode}?`, 'Hapus butir')) await submit(`/api/csms/templates/${t.id}/items/${i.id}`, { method: 'DELETE' });
  };
  const copy = async () => {
    const code = await showPrompt(`Kode template baru. Biarkan ${t.code} untuk versi baru.`, 'Salin template', t.code);
    if (code === null) return;
    const res = await submit(`/api/csms/templates/${t.id}`, { body: { action: 'COPY', code: code.trim() || t.code } });
    if (res?.id) window.location.href = `/csms/templates/${res.id}`;
  };
  const activate = async () => {
    const msg = t.check.diff ? `Selisih nilai maksimum ${t.check.diff} dari sumber (${t.sourceMaxScore}). ` : '';
    if (await showConfirm(`${msg}Template aktif dikunci; perubahan berikutnya lewat salinan versi baru. Lanjutkan?`, 'Aktifkan template')) {
      await submit(`/api/csms/templates/${t.id}`, { body: { action: 'ACTIVATE' } });
    }
  };

  return (
    <div className="stack">
      <div className="toolbar">
        <Link className="btn btn-ghost btn-sm" href="/csms?tab=setup">← Template & Penerapan</Link>
        <Badge value={t.status} label={STATUS[t.status]} />
        <div className="spacer" />
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={copy}><Copy size={15} /> Salin</button>
        {draft && <button className="btn btn-primary btn-sm" disabled={busy} onClick={activate}><CheckCheck size={15} /> Aktifkan</button>}
      </div>
      {!draft && <div className="notice info">Template {STATUS[t.status].toLowerCase()} tidak dapat diubah agar penerapan dan assessment historis tetap merujuk butir yang sama. Gunakan “Salin” untuk versi baru.</div>}
      <Card title="Identitas & dokumen sumber" actions={draft && <button className="btn btn-outline btn-sm" onClick={() => setMeta({ name: t.name, ownerName: t.ownerName, sourceDocCode: t.sourceDocCode, sourceDocName: t.sourceDocName, sourceRevision: t.sourceRevision ?? '', sourceEffective: iso(t.sourceEffective) ?? '', sourceMaxScore: t.sourceMaxScore ?? '', scoringGuide: t.scoringGuide ?? '', naPolicy: t.naPolicy, notes: t.notes ?? '' })}><Edit size={15} /> Ubah</button>}>
        <dl className="detail-grid">
          <div><dt>Kode / versi aplikasi</dt><dd>{t.code} v{t.version}</dd></div>
          <div><dt>Owner</dt><dd>{t.ownerName}</dd></div>
          <div><dt>Dokumen sumber</dt><dd>{t.sourceDocCode}<div className="muted">{t.sourceDocName}</div></dd></div>
          <div><dt>Revisi / berlaku</dt><dd>{t.sourceRevision ?? '-'}{t.sourceEffective && <div className="muted">{iso(t.sourceEffective)}</div>}</dd></div>
          <div><dt>Butir / nilai maksimum</dt><dd>{t.check.items} butir · {t.check.total}{t.sourceMaxScore !== null && <div className={t.check.diff ? 'text-red' : 'text-green'}>{t.check.diff ? `Selisih ${t.check.diff} dari sumber ${t.sourceMaxScore}` : `Cocok dengan sumber (${t.sourceMaxScore})`}</div>}</dd></div>
          <div><dt>Perlakuan N/A pada nilai</dt><dd>{t.naPolicy === 'EXCLUDE_FROM_MAX' ? 'Dikeluarkan dari nilai maksimum' : 'Dihitung nilai 0'}<div className="muted">Perlu konfirmasi owner</div></dd></div>
          <div><dt>Diterapkan</dt><dd>{t._count.applications} site</dd></div>
        </dl>
        {t.scoringGuide && <p className="muted" style={{ marginTop: 12 }}><strong>Pedoman nilai:</strong> {t.scoringGuide}</p>}
        {t.notes && <p className="muted" style={{ marginTop: 8 }}><strong>Catatan:</strong> {t.notes}</p>}
      </Card>

      {t.elements.map((e) => (
        <Card key={e.id} title={`${e.number}. ${e.name}`} padding={0} actions={draft && <>
          <button className="btn btn-ghost btn-sm" onClick={() => setEl({ id: e.id, number: e.number, name: e.name, hoScope: e.hoScope ?? '', siteScope: e.siteScope ?? '' })}><Edit size={14} /> Unsur</button>
          <button className="btn btn-outline btn-sm" onClick={() => setItem({ elementId: e.id, internalCode: `U${String(e.number).padStart(2, '0')}.${String(e.items.length + 1).padStart(2, '0')}`, sourceCode: '', refCode: '', subHeader: '', sourceText: '', displayText: '', maxScore: 2, responsibility: 'BERSAMA', defaultFrequency: 'ONCE', evidenceGuide: '' })}><Plus size={14} /> Butir</button>
        </>}>
          {(e.hoScope || e.siteScope) && (
            <div style={{ padding: '12px 20px', display: 'grid', gap: 4, fontSize: 13.5 }}>
              {e.hoScope && <div><strong>HO:</strong> {e.hoScope}</div>}
              {e.siteScope && <div><strong>Site:</strong> {e.siteScope}</div>}
            </div>
          )}
          <DataTable rows={e.items} empty="Belum ada butir." columns={[
            { key: 'c', label: 'Kode sumber', render: (i) => (<div><strong>{i.sourceCode ?? '—'}</strong><div className="muted">{i.internalCode}{!i.sourceCode && i.refCode ? ` · acuan ${i.refCode}` : ''}</div></div>) },
            { key: 't', label: 'Persyaratan (kutipan sumber)', render: (i) => (<div style={{ maxWidth: 520 }}>{i.subHeader && <div className="muted">{i.subHeader}</div>}{i.sourceText}{i.displayText && i.displayText !== i.sourceText && <div className="muted">Tampilan: {i.displayText}</div>}</div>) },
            { key: 'm', label: 'Maks', num: true, render: (i) => i.maxScore },
            { key: 'r', label: 'Tanggung jawab', render: (i) => RESP_LABELS[i.responsibility] },
            { key: 'f', label: 'Frekuensi bawaan', render: (i) => freqLabel(i.defaultFrequency) },
            { key: 'row', label: 'Baris', num: true, render: (i) => i.sourceRow ?? '-' },
            { key: 'a', label: '', render: (i) => (draft ? (
              <div className="row-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => setItem({ id: i.id, elementId: e.id, internalCode: i.internalCode, sourceCode: i.sourceCode ?? '', refCode: i.refCode ?? '', subHeader: i.subHeader ?? '', sourceText: i.sourceText, displayText: i.displayText ?? '', maxScore: i.maxScore, responsibility: i.responsibility, defaultFrequency: i.defaultFrequency, evidenceGuide: i.evidenceGuide ?? '' })}><Edit size={14} /></button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => removeItem(i)}><Trash2 size={14} /></button>
              </div>
            ) : null) },
          ]} />
        </Card>
      ))}
      {draft && <button className="btn btn-outline" style={{ width: 'fit-content' }} onClick={() => setEl({ number: (t.elements.at(-1)?.number ?? 0) + 1, name: '', hoScope: '', siteScope: '' })}><Plus size={15} /> Unsur</button>}

      <Modal open={Boolean(meta)} onClose={() => setMeta(null)} title="Identitas template" size="modal-lg">
        {meta && (
          <form onSubmit={saveMeta} className="stack">
            <FormFields values={meta} setValues={setMeta} fields={[
              { name: 'name', label: 'Nama template', required: true, span: true },
              { name: 'ownerName', label: 'Owner', required: true },
              { name: 'sourceDocCode', label: 'Kode dokumen sumber', required: true },
              { name: 'sourceDocName', label: 'Nama dokumen sumber', required: true, span: true },
              { name: 'sourceRevision', label: 'Revisi sumber' },
              { name: 'sourceEffective', label: 'Tanggal berlaku sumber', type: 'date' },
              { name: 'sourceMaxScore', label: 'Nilai maksimum tertulis di sumber', type: 'number', min: 0 },
              { name: 'naPolicy', label: 'Perlakuan N/A pada nilai', type: 'select', noEmpty: true, options: [['EXCLUDE_FROM_MAX', 'Dikeluarkan dari nilai maksimum'], ['SCORE_ZERO', 'Dihitung nilai 0']] },
              { name: 'scoringGuide', label: 'Pedoman nilai', type: 'textarea', span: true },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
      <Modal open={Boolean(el)} onClose={() => setEl(null)} title={el?.id ? 'Ubah unsur' : 'Unsur baru'}>
        {el && (
          <form onSubmit={saveEl} className="stack">
            <FormFields values={el} setValues={setEl} fields={[
              { name: 'number', label: 'Nomor', type: 'number', required: true, min: 1 },
              { name: 'name', label: 'Nama unsur', required: true },
              { name: 'hoScope', label: 'Tanggung jawab HO', type: 'textarea', span: true },
              { name: 'siteScope', label: 'Tanggung jawab Site', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
      <Modal open={Boolean(item)} onClose={() => setItem(null)} title={item?.id ? `Ubah butir ${item.internalCode}` : 'Butir baru'} subtitle="Teks persyaratan dikutip persis dari sumber. Teks tampilan hanya untuk perapian yang disetujui HO." size="modal-lg">
        {item && (
          <form onSubmit={saveItem} className="stack">
            <FormFields values={item} setValues={setItem} fields={[
              { name: 'elementId', label: 'Unsur', type: 'select', noEmpty: true, options: t.elements.map((x) => [x.id, `${x.number}. ${x.name}`]) },
              { name: 'internalCode', label: 'ID internal (unik)', required: true },
              { name: 'sourceCode', label: 'Kode di sumber', hint: 'Kosongkan bila baris sumber tidak berkode.' },
              { name: 'refCode', label: 'Kode acuan (baris lanjutan)' },
              { name: 'subHeader', label: 'Subjudul sumber', span: true },
              { name: 'sourceText', label: 'Persyaratan (kutipan sumber)', type: 'textarea', required: true, span: true },
              { name: 'displayText', label: 'Teks tampilan (opsional)', type: 'textarea', span: true },
              { name: 'maxScore', label: 'Nilai maksimum', type: 'number', min: 0, required: true },
              { name: 'responsibility', label: 'Tanggung jawab bawaan', type: 'select', noEmpty: true, options: RESPONSIBILITIES.map((r) => [r, RESP_LABELS[r]]) },
              { name: 'defaultFrequency', label: 'Frekuensi bawaan', type: 'select', noEmpty: true, options: FREQ_OPTIONS },
              { name: 'evidenceGuide', label: 'Petunjuk bukti', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Simpan</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
