// Ekspor Excel CSMS. Setiap berkas memuat lembar "Info": template & versi, site, periode, tanggal cetak, status.
import * as XLSX from 'xlsx';
import { actorName, audit } from '../audit.js';
import { iso, todayIso } from '../dates.js';
import { labelOf } from '../labels.js';
import { FREQUENCY_LABELS } from '../domain/csms.js';
import { choice } from '../validation.js';
import { checklist, masterDocuments, overview } from './csms.js';
import { getAssessment } from './csms-assessment.js';
import { listFindings } from './csms-findings.js';
import { administrationRows } from './csms-profile.js';

const STATUS = { BELUM: 'Belum diisi', DRAFT: 'Draft', SUBMITTED: 'Diajukan', REVIEWED: 'Diperiksa PJO/PM', REVISION: 'Perlu revisi', VERIFIED: 'Terverifikasi', NA: 'N/A', NA_PENDING: 'Usulan N/A' };
const FLAG = { OVERDUE: 'Tenggat terlewati', EVIDENCE_EXPIRED: 'Bukti kedaluwarsa', EVIDENCE_EXPIRING: 'Mendekati kedaluwarsa' };

function book(info, sheets) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(Object.entries(info).map(([k, v]) => [k, v ?? '-'])), 'Info');
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Keterangan: 'Tidak ada data' }]), name.slice(0, 31));
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

const baseInfo = (user, title, extra) => ({
  Dokumen: title, ...extra, 'Tanggal cetak': todayIso(), 'Dicetak oleh': actorName(user),
  Catatan: 'Verifikasi HO = verifikasi internal PJM, bukan persetujuan owner. Kelengkapan bukan nilai assessment.',
});

function checklistRows(c) {
  return c.rows.flatMap((r) => (r.periods.length ? r.periods : [null]).map((p) => ({
    Kode: r.code, 'ID internal': r.internalCode, Unsur: `${r.element.number}. ${r.element.name}`, Persyaratan: r.text,
    Asal: r.origin === 'SITE_ADDITION' ? 'Tambahan site' : 'Template', Berlaku: STATUS[r.applicability] ?? 'Berlaku',
    'Penanggung jawab': { HO: 'HO', SITE: 'Site', BERSAMA: 'Bersama' }[r.responsibility], PIC: [r.picRole ? labelOf(r.picRole) : null, r.picName].filter(Boolean).join(' · '),
    Frekuensi: FREQUENCY_LABELS[r.frequency], Periode: p?.periodKey ?? '-', [`Tenggat (${c.tz})`]: p?.dueDate ? iso(p.dueDate) : '-',
    Status: STATUS[p?.status ?? r.status] ?? '-', 'Status turunan': (p?.flags ?? []).map((f) => FLAG[f]).join(', '), 'Jumlah bukti': p?.evidenceCount ?? 0,
    'Catatan pemeriksaan': p?.reviewNote ?? '', 'Tindakan berikutnya': r.nextAction,
  })));
}

export async function exportCsms(user, q) {
  const kind = choice(q.kind, ['checklist', 'recap', 'documents', 'findings', 'assessment', 'admin'], 'Jenis ekspor');
  let buffer, name;
  if (kind === 'checklist' || kind === 'documents') {
    const c = await checklist(user, { applicationId: q.applicationId, period: q.period, take: 10000 });
    const info = baseInfo(user, kind === 'checklist' ? 'Checklist CSMS beserta status & bukti' : 'Daftar dokumen/bukti kurang & kedaluwarsa', {
      Site: c.app ? `${c.app.site.code} — ${c.app.site.name}` : '-', Template: c.app ? `${c.app.template.code} v${c.app.template.version}` : '-',
      Owner: c.app?.project?.owner ?? c.app?.template.ownerName, Periode: c.month, 'Zona waktu': c.tz, Status: 'Data berjalan (bukan dokumen final)',
      'Kelengkapan terverifikasi': c.summary.percent === null ? 'Belum ada persyaratan' : `${c.summary.percent}% (${c.summary.verified}/${c.summary.applicable})`,
    });
    if (kind === 'checklist') buffer = book(info, [['Checklist', checklistRows(c)]]);
    else {
      const lacking = checklistRows(c).filter((r) => ['Belum diisi', 'Draft', 'Perlu revisi'].includes(r.Status) || r['Status turunan']);
      const docs = (await masterDocuments(user, { linked: 'all' })).rows.filter((d) => d.expiry && d.expiry !== 'VALID').map((d) => ({ Nomor: d.number, Judul: d.title, Revisi: d.revision, 'Berlaku sampai': iso(d.validUntil), Status: d.expiry === 'EXPIRED' ? 'Kedaluwarsa' : 'Mendekati kedaluwarsa' }));
      buffer = book(info, [['Butir kurang', lacking], ['Dokumen induk kedaluwarsa', docs]]);
    }
    name = `CSMS_${kind === 'checklist' ? 'Checklist' : 'Kekurangan'}_${c.app?.site.code ?? 'site'}_${c.month}`;
  } else if (kind === 'recap') {
    const o = await overview(user, { period: q.period, siteId: q.siteId });
    buffer = book(baseInfo(user, 'Rekap CSMS per site', { Periode: o.month, Status: 'Data berjalan (bukan dokumen final)' }), [
      ['Rekap per site', o.perApp.map((p) => ({
        Site: p.app.site.code, Template: `${p.app.template.code} v${p.app.template.version}`, 'Butir berlaku': p.cards.applicable, Terverifikasi: p.cards.verified,
        'Kelengkapan (%)': p.summary.percent ?? '—', 'Belum diisi': p.cards.notFilled, Menunggu: p.cards.waiting, 'Perlu revisi': p.cards.revision,
        'Tenggat terlewati': p.cards.overdue, 'Bukti kedaluwarsa': p.cards.expired, 'Usulan N/A': p.cards.naPending,
      }))],
      ['Per unsur', o.perApp.flatMap((p) => p.byElement.map((e) => ({ Site: p.app.site.code, Unsur: `${e.number}. ${e.name}`, 'Butir berlaku': e.applicable, Terverifikasi: e.verified, 'Kelengkapan (%)': e.percent ?? '—' })))],
    ]);
    name = `CSMS_Rekap_${o.month}`;
  } else if (kind === 'findings') {
    const f = await listFindings(user, q, { skip: 0, take: 5000 });
    buffer = book(baseInfo(user, 'Daftar temuan & tindak lanjut CSMS', { Filter: [q.siteId ? 'site terpilih' : 'semua site', q.fstatus ? labelOf(q.fstatus) : 'semua status'].join(', ') }), [
      ['Temuan', f.rows.map((r) => ({
        Nomor: r.number, Sumber: labelOf(r.source), Site: r.site.code, 'Butir CSMS': r.requirement ? (r.requirement.item?.sourceCode ?? r.requirement.code ?? r.requirement.item?.internalCode) : '', Uraian: r.description,
        PIC: [r.picRole ? labelOf(r.picRole) : null, r.picName].filter(Boolean).join(' · '), Tenggat: iso(r.dueDate) ?? '', 'Tindakan perbaikan': r.correctiveAction ?? '',
        Status: labelOf(r.status), Terlambat: r.late ? 'Ya' : '', Verifikator: r.verifierName ?? '', Ditutup: iso(r.closedAt) ?? '',
      }))],
    ]);
    name = `CSMS_Temuan_${todayIso()}`;
  } else if (kind === 'assessment') {
    const a = await getAssessment(user, String(q.id ?? ''));
    const elementName = Object.fromEntries(a.elements.map((e) => [e.number, e.name]));
    buffer = book(baseInfo(user, 'Hasil assessment internal K3LH', {
      Nomor: a.number, Status: a.status === 'FINAL' ? `FINAL (${iso(a.finalizedAt)} oleh ${a.finalizedByName})` : 'DRAFT — belum final', Revisi: a.revisionNo ? `Revisi ${a.revisionNo}: ${a.revisionReason}` : 'Asli',
      Digantikan: a.supersededAt ? `Ya, oleh revisi berikutnya (${iso(a.supersededAt)})` : 'Tidak', Site: `${a.site.code} — ${a.site.name}`,
      Template: `${a.template.code} v${a.template.version} (${a.template.sourceDocCode})`, Owner: a.template.ownerName, Periode: a.periodLabel, 'Tanggal assessment': iso(a.assessmentDate), Penilai: a.assessors,
      'Nilai aktual': a.totals.total, 'Nilai maksimum berlaku': a.totals.max, 'Persentase (%)': a.totals.percent ?? '—', 'Butir belum dinilai': a.totals.unscored,
      'Perlakuan N/A': a.template.naPolicy === 'EXCLUDE_FROM_MAX' ? 'Dikeluarkan dari nilai maksimum' : 'Dihitung nilai 0',
      'Tingkat risiko pekerjaan (data terpisah)': a.riskLevel ? labelOf(a.riskLevel) : '-', Kelulusan: 'Tidak ditetapkan aplikasi (menunggu aturan owner yang disetujui HO)',
    }), [
      ['Nilai per butir', a.scores.map((s) => ({
        Unsur: `${s.elementNo}. ${elementName[s.elementNo] ?? ''}`, Kode: s.itemCode, Parameter: s.itemText, 'Nilai maksimum': s.maxScore,
        'Nilai aktual': s.applicable ? s.score ?? '' : 'N/A', 'Ket. (temuan)': s.note ?? '', 'Bukti yang dinilai': (s.evidence?.items ?? []).map((e) => e.title).join('; '),
      }))],
      ['Temuan', a.findings.map((f) => ({ Nomor: f.number, Status: labelOf(f.status), Uraian: f.description }))],
    ]);
    name = `CSMS_Assessment_${a.number}_${a.status}`;
  } else {
    const ad = await administrationRows(user);
    buffer = book(baseInfo(user, 'Daftar Perusahaan Jasa Pertambangan (format AMM-VIB1-F-SHE-008B)', { Manpower: ad.definition }), [
      ['008B', ad.rows.map((r, i) => ({
        No: i + 1, 'Nomor Register CMS': r.registerNo ?? '', 'Nama Perusahaan Jasa Pertambangan': r.companyName ?? '', 'Departemen User': r.userDepartment ?? '', 'Nama PJO PJP': r.pjoName ?? '',
        'Kompetensi PJO (POP/POM/POU)': r.pjoCompetency ?? '', 'Nomor Surat Pengesahan PJO': r.pjoApprovalNo ?? '', 'Tanggal Surat Pengesahan PJO': iso(r.pjoApprovalDate) ?? '',
        'Kategori Usaha Jasa Pertambangan': r.businessCategory ? labelOf(r.businessCategory) : '', 'Nomor IUJP': r.iujpNumber ?? '', 'Expired IUJP': iso(r.iujpExpiry) ?? '',
        'Email PJO': r.pjoEmail ?? '', 'No. Kontak PJO': r.pjoPhone ?? '', 'Nama Safety Officer': r.safetyOfficer ?? '', 'No. Kontak Safety Officer': r.safetyOfficerPhone ?? '', 'Email Safety Officer': r.safetyOfficerEmail ?? '',
        'Alamat Kantor Pusat': r.hoAddress ?? '', 'Alamat Site': r.siteAddress ?? '', Provinsi: r.province ?? '', Kabupaten: r.regency ?? '', 'Lokal / Nasional': r.businessScale ? labelOf(r.businessScale) : '',
        'Level Risiko Pekerjaan': r.riskLevel ? labelOf(r.riskLevel) : '', 'Scope Pekerjaan': r.workScope ?? '', 'Jumlah Manpower': r.manpower, Site: r.siteCode,
      }))],
    ]);
    name = `CSMS_008B_${todayIso()}`;
  }
  await audit(null, user, { action: 'EXPORT', module: 'csms', note: `Ekspor ${kind}${q.id ? ' ' + q.id : ''}` });
  return { buffer, fileName: `${name.replace(/[^\w.-]+/g, '_')}.xlsx` };
}
