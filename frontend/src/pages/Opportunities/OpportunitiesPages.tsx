import { JobCard } from "@/components/opportunities/JobCard";
import { OpportunityCard } from "@/components/opportunities/OpportunityCard";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { OpportunitySkeleton } from "@/components/ui/Skeleton";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as opportunityApi from "@/services/api/opportunityApi";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function OpportunitiesPage() {
  const [tab, setTab] = useState("jobs");
  const jobs = useAsyncData(() => opportunityApi.getJobs());
  const gov = useAsyncData(() => opportunityApi.getGovernmentOpportunities());
  const navigate = useNavigate();

  if (jobs.loading || gov.loading) return <OpportunitySkeleton />;
  if (jobs.error) return <ErrorState onRetry={() => void jobs.reload()} onDashboard={() => navigate("/dashboard")} />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Opportunities</h1>
      <Tabs
        tabs={[
          { id: "jobs", label: "Jobs" },
          { id: "gov", label: "Government Opportunities" },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "jobs" && <JobList jobs={jobs.data ?? []} />}
      {tab === "gov" && <GovList items={gov.data ?? []} />}
    </div>
  );
}

export function JobsPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(() => opportunityApi.getJobs());
  if (loading) return <OpportunitySkeleton />;
  if (error) return <ErrorState onRetry={() => void reload()} onDashboard={() => navigate("/dashboard")} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Jobs</h1>
        <p className="text-sm text-slate-500">Mock listings only. Match % is a platform estimate.</p>
      </div>
      <JobList jobs={data ?? []} />
    </div>
  );
}

export function GovernmentOpportunitiesPage() {
  const navigate = useNavigate();
  const { data, loading, error, reload } = useAsyncData(() => opportunityApi.getGovernmentOpportunities());
  if (loading) return <OpportunitySkeleton />;
  if (error) return <ErrorState onRetry={() => void reload()} onDashboard={() => navigate("/dashboard")} />;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Government opportunities</h1>
        <p className="text-sm text-slate-500">
          Eligibility is based on your saved profile and should be verified against the official notification.
        </p>
      </div>
      <GovList items={data ?? []} />
    </div>
  );
}

function JobList({ jobs }: { jobs: Awaited<ReturnType<typeof opportunityApi.getJobs>> }) {
  if (!jobs.length) {
    return <EmptyState title="No opportunities" description="We haven't found matching opportunities yet." />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {jobs.map((j) => (
        <JobCard key={j.id} job={j} />
      ))}
    </div>
  );
}

function GovList({ items }: { items: Awaited<ReturnType<typeof opportunityApi.getGovernmentOpportunities>> }) {
  if (!items.length) {
    return <EmptyState title="No government matches" description="We haven't found matching opportunities yet." />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((i) => (
        <OpportunityCard key={i.id} item={i} />
      ))}
    </div>
  );
}
