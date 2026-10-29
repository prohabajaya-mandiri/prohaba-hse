'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Badge, Card, DataTable, FormFields, Modal, useSubmit } from '@/components/ui';
import { formatDate, todayIso } from '@/lib/dates';

/** Daftar assessment internal (terpisah dari checklist). */
export function AssessmentList({ data, canCreate }) {
  const router = useRouter();
  const { submit, busy } = useSubmit();
  const [form, setForm] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    const res = await submit('/api/csms/assessments', { body: form });
    if (res?.id) { setForm(null); router.push(`/csms/assessments/${res.id}`); }
  };
  return (
    <div className="stack">
      <div className="notice info">Assessment internal PJM bernilai 0 (belum ada), 1 (ada tetapi tidak konsisten), 2 (konsisten). Penilai menentukan nilai berdasarkan bukti — tidak ada nilai otomatis. Hasil final dikunci; koreksi dibuat sebagai revisi. Persentase bukan keputusan kelulusan owner.</div>
      <Card title="Assessment internal" padding={0} actions={canCreate && <button className="btn btn-primary btn-sm" disabled={!data.apps.length} onClick={() => setForm({ applicationId: data.apps[0]?.id ?? '', periodLabel: '', assessmentDate: todayIso(), assessors: '', notes: '' })}><Plus size={15} /> Assessment baru</button>}>
        <DataTable rows={data.rows} empty="Belum ada assessment." onRowClick={(a) => router.push(`/csms/assessments/${a.id}`)} columns={[
          { key: 'n', label: 'Nomor', render: (a) => (<div><strong>{a.number}</strong>{a.revisionNo > 0 && <div className="muted">Revisi {a.revisionNo}</div>}</div>) },
          { key: 's', label: 'Site', render: (a) => a.site.code },
          { key: 't', label: 'Template', render: (a) => `${a.template.code} v${a.template.version}` },
          { key: 'p', label: 'Periode / tanggal', render: (a) => (<div>{a.periodLabel}<div className="muted">{formatDate(a.assessmentDate)}</div></div>) },
          { key: 'as', label: 'Penilai', render: (a) => a.assessors },
          { key: 'v', label: 'Nilai', render: (a) => (a.status === 'FINAL' ? <div><strong>{Number(a.percent).toLocaleString('id-ID')}%</strong><div className="muted">{a.totalScore}/{a.maxScore}</div></div> : <span className="muted">—</span>) },
          { key: 'st', label: 'Status', render: (a) => (<div><Badge value={a.status} label={a.status === 'FINAL' ? 'Final' : 'Draft'} />{a.supersededAt && <div><Badge value="SUPERSEDED" label="Digantikan revisi" /></div>}</div>) },
        ]} />
      </Card>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title="Assessment baru" subtitle="Butir diambil dari template & penerapan site; butir N/A site ikut perlakuan N/A template.">
        {form && (
          <form onSubmit={save} className="stack">
            <FormFields values={form} setValues={setForm} fields={[
              { name: 'applicationId', label: 'Site / template', type: 'select', required: true, noEmpty: true, options: data.apps.map((a) => [a.id, a.label]) },
              { name: 'periodLabel', label: 'Periode', required: true, placeholder: 'mis. Semester II 2026' },
              { name: 'assessmentDate', label: 'Tanggal assessment', type: 'date', required: true },
              { name: 'assessors', label: 'Penilai / verifikator', required: true, placeholder: 'Nama verifikator 1, verifikator 2' },
              { name: 'notes', label: 'Catatan', type: 'textarea', span: true },
            ]} />
            <button className="btn btn-primary" disabled={busy}>Buat draft</button>
          </form>
        )}
      </Modal>
    </div>
  );
}
