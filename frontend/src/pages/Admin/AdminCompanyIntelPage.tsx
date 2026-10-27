import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import { companyIntel } from "@/services/api/learnerApi";

export function AdminCompanyIntelPage() {
  const view = useAsyncData(() => companyIntel());
  if (view.error) return <ErrorState message={view.error} onRetry={() => void view.reload()} />;
  const data = view.data;
  return (
    <Card>
      <CardHeader title="Company intelligence" description={data?.disclaimer ?? "Observed public postings only."} />
      <CardBody>
        {data?.periods && (
          <p className="mb-3 text-sm text-slate-600">
            Current complete period {new Date(data.periods.current.start).toLocaleDateString()}
            {data.periods.previous
              ? ` versus previous complete period ${new Date(data.periods.previous.start).toLocaleDateString()}`
              : ". No previous complete period."}
          </p>
        )}
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1">Company</th>
              <th>Jobs</th>
              <th>Careers</th>
              <th>Skills</th>
              <th>Previous jobs</th>
              <th>Change</th>
            </tr>
          </thead>
          <tbody>
            {(data?.companies ?? []).map((row) => (
              <tr key={row.companyId} className="border-t border-stone-200 dark:border-stone-700">
                <td className="py-1">{row.name}</td>
                <td>{row.jobs}</td>
                <td>{row.careers}</td>
                <td>{row.skills}</td>
                <td>{row.previousJobs ?? "—"}</td>
                <td>{row.jobDelta ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.companies.length === 0 && <p className="text-sm text-slate-500">No complete monthly snapshot yet.</p>}
      </CardBody>
    </Card>
  );
}
