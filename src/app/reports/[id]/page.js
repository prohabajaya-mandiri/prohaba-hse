import { redirect } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { requirePage } from '@/lib/page';
import { getReport } from '@/lib/services/reports';
import ReportDetail from './ReportDetail';

export const metadata = { title: 'Detail Laporan' };

export default async function ReportPage({ params }) {
  const user = await requirePage('/reports');
  const { id } = await params;
  let report;
  try {
    report = await getReport(user, id);
  } catch {
    redirect('/reports');
  }
  return (
    <AppLayout title={`Laporan ${report.type.toLowerCase()} ${report.site.code}`} subtitle={`Periode ${report.periodKey} · versi ${report.version}`} user={user}>
      <ReportDetail report={report} user={user} />
    </AppLayout>
  );
}
