import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as adminApi from "@/services/api/adminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

function text(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value == null ? "" : String(value);
}

export function AdminJobsPage() {
  const { push } = useToast();
  const { data, loading, error, errorCode, reload } = useAsyncData(() => adminApi.listJobs());
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");

  async function create() {
    try {
      await adminApi.createJob({ company: company.trim(), role: role.trim() });
      setCompany("");
      setRole("");
      push("Job added");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not add job");
    }
  }

  async function remove(id: string) {
    try {
      await adminApi.deleteJob(id);
      push("Job deleted");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete job");
    }
  }

  if (error) return <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />;
  return (
    <Card>
      <CardHeader title="Jobs" />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Company" name="company" value={company} onChange={(e) => setCompany(e.target.value)} />
          <Input label="Role" name="role" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <Button disabled={!company.trim() || !role.trim()} onClick={() => void create()}>
          Add job
        </Button>
        {loading && <p className="text-sm text-slate-500">Loading…</p>}
        <ul className="space-y-2 text-sm">
          {(data ?? []).map((row) => (
            <li key={text(row, "id")} className="flex items-center justify-between gap-3">
              <span>
                {text(row, "role")} · {text(row, "company")}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void remove(text(row, "id"))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function AdminExamsPage() {
  const { push } = useToast();
  const { data, error, errorCode, reload } = useAsyncData(() => adminApi.listExams());
  async function remove(id: string) {
    try {
      await adminApi.deleteExam(id);
      push("Exam deleted");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete exam");
    }
  }
  if (error) return <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />;
  return (
    <Card>
      <CardHeader title="Government exams" />
      <CardBody>
        <ul className="space-y-2 text-sm">
          {(data ?? []).map((row) => (
            <li key={text(row, "id")} className="flex items-center justify-between gap-3">
              <span>
                {text(row, "name") || text(row, "shortName")} · {text(row, "slug")}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void remove(text(row, "id"))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

export function AdminOpportunitiesPage() {
  const { push } = useToast();
  const { data, error, errorCode, reload } = useAsyncData(() => adminApi.listOpportunities());
  const [organization, setOrganization] = useState("");
  const [opportunity, setOpportunity] = useState("");
  const [eligibility, setEligibility] = useState("");

  async function create() {
    try {
      await adminApi.createOpportunity({
        organization: organization.trim(),
        opportunity: opportunity.trim(),
        eligibility: eligibility.trim(),
      });
      setOrganization("");
      setOpportunity("");
      setEligibility("");
      push("Vacancy added");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not add vacancy");
    }
  }

  async function remove(id: string) {
    try {
      await adminApi.deleteOpportunity(id);
      push("Vacancy deleted");
      void reload();
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not delete vacancy");
    }
  }

  if (error) return <ErrorState message={error} code={errorCode} onRetry={() => void reload()} />;
  return (
    <Card>
      <CardHeader title="Vacancies" />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Organization" name="organization" value={organization} onChange={(e) => setOrganization(e.target.value)} />
          <Input label="Opportunity" name="opportunity" value={opportunity} onChange={(e) => setOpportunity(e.target.value)} />
          <Input label="Eligibility" name="eligibility" value={eligibility} onChange={(e) => setEligibility(e.target.value)} />
        </div>
        <Button disabled={!organization.trim() || !opportunity.trim() || !eligibility.trim()} onClick={() => void create()}>
          Add vacancy
        </Button>
        <ul className="space-y-2 text-sm">
          {(data ?? []).map((row) => (
            <li key={text(row, "id")} className="flex items-center justify-between gap-3">
              <span>
                {text(row, "opportunity")} · {text(row, "organization")}
              </span>
              <Button size="sm" variant="ghost" onClick={() => void remove(text(row, "id"))}>
                Delete
              </Button>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
