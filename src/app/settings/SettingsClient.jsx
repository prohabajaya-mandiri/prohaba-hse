'use client';

import { useState } from 'react';
import { CheckCircle2, RotateCcw } from 'lucide-react';
import { Badge, Card, useSubmit } from '@/components/ui';
import { useDialog } from '@/components/DialogProvider';
import { formatDate } from '@/lib/dates';

function SettingCard({ s, canEdit }) {
  const { submit, busy } = useSubmit();
  const { showAlert, showPrompt } = useDialog();
  const [text, setText] = useState(JSON.stringify(s.value, null, 2));
  const dirty = text !== JSON.stringify(s.value, null, 2);

  const save = async (approve) => {
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      return showAlert('Format JSON tidak valid.', 'Gagal');
    }
    const note = approve ? await showPrompt('Catatan persetujuan (mis. nomor memo / rapat PJM)', 'Setujui parameter') : null;
    if (approve && note === null) return;
    await submit(`/api/settings/${s.key}`, { method: 'PUT', body: { value, approve, ...(note ? { note } : {}) } });
  };

  return (
    <Card title={<span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>{s.label} <Badge value={s.status} label={s.status === 'APPROVED' ? 'Disetujui' : 'Draft'} /></span>}
      actions={<code className="muted">{s.key}</code>}>
      <textarea className="form-input" rows={Math.min(14, text.split('\n').length + 1)} style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5 }} value={text} readOnly={!canEdit} onChange={(e) => setText(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
        <span className="muted">{s.approvedBy ? `Disetujui ${s.approvedBy}, ${formatDate(s.approvedAt)}${s.note ? ' · ' + s.note : ''}` : 'Belum disetujui — nilai usulan developer.'}</span>
        {canEdit && (
          <div className="row-actions">
            <button className="btn btn-ghost btn-sm" onClick={() => setText(JSON.stringify(s.defaultValue, null, 2))}><RotateCcw size={14} /> Nilai awal</button>
            <button className="btn btn-outline btn-sm" disabled={busy || !dirty} onClick={() => save(false)}>Simpan draft</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => save(true)}><CheckCircle2 size={14} /> Simpan & setujui</button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default function SettingsClient({ settings, canEdit }) {
  const approved = settings.filter((s) => s.status === 'APPROVED').length;
  return (
    <div className="stack">
      <div className="notice">
        Bagian ini sengaja tidak ditetapkan sepihak: formula KPI/manhours, template laporan, ambang pengingat, matriks akses gaji, pola roster khusus, dan tenggat pelaporan insiden.
        Nilai awal adalah usulan untuk ditinjau PJM. {approved}/{settings.length} parameter sudah disetujui. Perubahan nilai mengembalikan status ke Draft.
      </div>
      <div className="grid-2">{settings.map((s) => <SettingCard key={s.key} s={s} canEdit={canEdit} />)}</div>
    </div>
  );
}
