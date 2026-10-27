import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import { createResource, learningResources } from "@/services/api/learnerApi";
import { useState } from "react";

export function AdminLearningResourcesPage() {
  const view = useAsyncData(() => learningResources());
  const [form, setForm] = useState({ skillId: "", title: "", url: "", kind: "DOC" });
  const [busy, setBusy] = useState(false);
  if (view.error) return <ErrorState message={view.error} onRetry={() => void view.reload()} />;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Learning resources" description="Curated links only. Nothing is scraped from the web." />
        <CardBody className="grid gap-2 md:grid-cols-4">
          <Input placeholder="Skill id" value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value })} />
          <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <Input placeholder="https://..." value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
          <select
            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm"
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
          >
            <option value="DOC">DOC</option>
            <option value="TUTORIAL">TUTORIAL</option>
            <option value="PRACTICE">PRACTICE</option>
          </select>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void createResource(form)
                .then(() => view.reload())
                .finally(() => setBusy(false));
            }}
          >
            Add
          </Button>
        </CardBody>
      </Card>
      <Card>
        <CardBody>
          <ul className="space-y-1 text-sm">
            {(view.data ?? []).map((row) => (
              <li key={row.id}>
                {row.skill.name}: {row.title} ({row.kind})
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
