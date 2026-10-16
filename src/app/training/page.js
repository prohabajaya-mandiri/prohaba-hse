import AppLayout from '@/components/AppLayout';
import { canWrite } from '@/lib/access';
import { query, requirePage, scopedSites } from '@/lib/page';
import { competencyGaps, listCertificates, listCompetencies, listSessions } from '@/lib/services/training';
import TrainingClient from './TrainingClient';

export default async function TrainingPage({ searchParams }) {
  const user = await requirePage('/training');
  const q = await query(searchParams);
  const tab = ['sessions', 'gaps', 'master'].includes(q.tab) ? q.tab : 'certificates';
  const [sites, competencies, certificates, sessions, gaps] = await Promise.all([
    scopedSites(user),
    listCompetencies(),
    tab === 'certificates' ? listCertificates(user, q, q) : null,
    tab === 'sessions' ? listSessions(user, q, { skip: (q.page - 1) * 30, take: 30 }) : null,
    tab === 'gaps' ? competencyGaps(user, q) : null,
  ]);
  return (
    <AppLayout title="Training & Kompetensi" subtitle="Sertifikat, jadwal training, kebutuhan kompetensi per jabatan" user={user}>
      <TrainingClient tab={tab} sites={sites} competencies={competencies} certificates={certificates} sessions={sessions} gaps={gaps} page={q.page}
        canEdit={canWrite(user.role, 'training')} canMaster={['HO_HSE', 'HRD'].includes(user.role)} preselect={q.personnelId ?? null} />
    </AppLayout>
  );
}
