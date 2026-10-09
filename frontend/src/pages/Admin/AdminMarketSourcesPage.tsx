import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { ErrorState } from "@/components/ui/States";
import { useAsyncData } from "@/hooks/useAsyncData";
import * as marketApi from "@/services/api/marketAdminApi";
import type { MarketAllowedUse, MarketSourceRow, MarketSourceType, TestFetchResult } from "@/services/api/marketAdminApi";
import { useToast } from "@/store/hooks";
import { useState } from "react";

const SOURCE_TYPES: { value: MarketSourceType; label: string }[] = [
  { value: "GREENHOUSE", label: "Greenhouse" },
  { value: "LEVER", label: "Lever" },
  { value: "ASHBY", label: "Ashby" },
];

const USES: { value: MarketAllowedUse; label: string }[] = [
  { value: "ANALYTICS_AGGREGATE", label: "Aggregate analytics (required to fetch)" },
  { value: "DISPLAY_SNIPPET", label: "Show short snippets to users" },
  { value: "DISPLAY_LINK_ONLY", label: "Show title + link only" },
];

function fmt(date: string | null) {
  return date ? new Date(date).toLocaleString() : "—";
}

function defaultDueDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function AdminMarketSourcesPage() {
  const { push } = useToast();
  const companies = useAsyncData(() => marketApi.listCompanies());
  const sources = useAsyncData(() => marketApi.listSources());
  const [companyName, setCompanyName] = useState("");
  const [companyWebsite, setCompanyWebsite] = useState("");
  const [sourceCompanyId, setSourceCompanyId] = useState("");
  const [sourceType, setSourceType] = useState<MarketSourceType>("GREENHOUSE");
  const [boardToken, setBoardToken] = useState("");
  const [reviewing, setReviewing] = useState<MarketSourceRow | null>(null);
  const [testResult, setTestResult] = useState<{ source: MarketSourceRow; result: TestFetchResult } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function fail(err: unknown, fallback: string) {
    push(err instanceof Error ? err.message : fallback);
  }

  async function addCompany() {
    try {
      await marketApi.createCompany({
        name: companyName.trim(),
        slug: slugify(companyName),
        website: companyWebsite.trim() || undefined,
      });
      setCompanyName("");
      setCompanyWebsite("");
      push("Company added");
      void companies.reload();
    } catch (err) {
      fail(err, "Could not add company");
    }
  }

  async function addSource() {
    try {
      await marketApi.createSource({ companyId: sourceCompanyId, type: sourceType, boardToken: boardToken.trim() });
      setBoardToken("");
      push("Source added (disabled until its terms are reviewed)");
      void sources.reload();
      void companies.reload();
    } catch (err) {
      fail(err, "Could not add source");
    }
  }

  async function act(source: MarketSourceRow, action: "enable" | "disable" | "test") {
    setBusyId(source.id);
    try {
      if (action === "enable") {
        await marketApi.enableSource(source.id);
        push("Source enabled");
      } else if (action === "disable") {
        await marketApi.disableSource(source.id);
        push("Source disabled");
      } else {
        const result = await marketApi.testFetch(source.id);
        setTestResult({ source, result });
      }
      void sources.reload();
    } catch (err) {
      fail(err, "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  const error = companies.error ?? sources.error;
  if (error) {
    return (
      <ErrorState
        message={error}
        code={companies.errorCode ?? sources.errorCode}
        onRetry={() => {
          void companies.reload();
          void sources.reload();
        }}
      />
    );
  }

  const companyOptions = [
    { value: "", label: "Select company" },
    ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Market sources"
          description="Public ATS job boards for market analytics. A source can only be enabled after its terms are reviewed; robots.txt is a crawl-policy signal, not permission."
        />
        <CardBody className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Input label="Company name" name="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            <Input
              label="Website (optional)"
              name="companyWebsite"
              placeholder="https://"
              value={companyWebsite}
              onChange={(e) => setCompanyWebsite(e.target.value)}
            />
            <Button disabled={companyName.trim().length < 2} onClick={() => void addCompany()}>
              Add company
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
            <Select
              label="Company"
              name="sourceCompany"
              value={sourceCompanyId}
              onChange={(e) => setSourceCompanyId(e.target.value)}
              options={companyOptions}
            />
            <Select
              label="ATS"
              name="sourceType"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as MarketSourceType)}
              options={SOURCE_TYPES}
            />
            <Input
              label="Board token"
              name="boardToken"
              hint="From the public board URL, e.g. boards.greenhouse.io/<token>"
              value={boardToken}
              onChange={(e) => setBoardToken(e.target.value)}
            />
            <Button disabled={!sourceCompanyId || !boardToken.trim()} onClick={() => void addSource()}>
              Add source
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Registered sources" />
        <CardBody>
          {sources.loading && !sources.data && <p className="text-sm text-slate-500">Loading…</p>}
          {sources.data && sources.data.length === 0 && <p className="text-sm text-slate-500">No sources yet.</p>}
          <ul className="divide-y divide-stone-200 text-sm dark:divide-stone-800">
            {(sources.data ?? []).map((s) => (
              <li key={s.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">
                    {s.company.name} · {s.type} · <span className="font-mono">{s.boardToken}</span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone={s.enabled ? "success" : "neutral"}>{s.enabled ? "Enabled" : "Disabled"}</Badge>
                    <Badge tone={s.termsProblem ? "warning" : "success"}>
                      {s.termsProblem ? s.termsProblem : `Terms OK until ${fmt(s.termsReviewDueAt)}`}
                    </Badge>
                    <Badge tone={s.robotsStatus === "DISALLOWED" ? "danger" : s.robotsStatus === "ALLOWED" ? "brand" : "neutral"}>
                      robots: {s.robotsStatus}
                    </Badge>
                    {s.pausedReason && <Badge tone="danger">{s.pausedReason}</Badge>}
                    <Badge tone="info">display: {s.effectiveRetention.displayPolicy}</Badge>
                  </div>
                  <p className="text-xs text-slate-500">
                    Last success {fmt(s.lastSuccessAt)} · failures {s.consecutiveFailures} · descriptions kept{" "}
                    {s.effectiveRetention.descriptionRetentionDays}d
                    {s.lastError ? ` · last error: ${s.lastError}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setReviewing(s)}>
                    Terms review
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === s.id || !!s.termsProblem}
                    onClick={() => void act(s, "test")}
                  >
                    Test fetch
                  </Button>
                  {s.enabled ? (
                    <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => void act(s, "disable")}>
                      Disable
                    </Button>
                  ) : (
                    <Button size="sm" disabled={busyId === s.id || !!s.termsProblem} onClick={() => void act(s, "enable")}>
                      Enable
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {reviewing && (
        <TermsReviewModal
          source={reviewing}
          onClose={() => setReviewing(null)}
          onSaved={(narrowed) => {
            setReviewing(null);
            push(narrowed ? "Terms review saved. Analytics no longer allowed, so the source was disabled." : "Terms review saved");
            void sources.reload();
          }}
        />
      )}

      {testResult && (
        <Modal open title={`Test fetch · ${testResult.source.company.name}`} size="lg" onClose={() => setTestResult(null)}>
          {testResult.result.ok ? (
            <div className="space-y-3">
              <p>
                {testResult.result.jobCount} postings · robots {testResult.result.robots} · {testResult.result.durationMs} ms.
                Nothing was saved.
              </p>
              <ul className="space-y-3">
                {testResult.result.sample.map((job) => (
                  <li key={job.externalId} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <p className="font-medium text-ink dark:text-stone-100">{job.title}</p>
                    <p className="text-xs text-slate-500">
                      {job.location ?? "No location"} · {fmt(job.postedAt)} · {job.descriptionChars} chars
                    </p>
                    <p className="mt-1 line-clamp-3 text-xs">{job.descriptionPreview}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p>
              Fetch failed: <span className="font-mono">{testResult.result.error}</span> · {testResult.result.message}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}

function TermsReviewModal({
  source,
  onClose,
  onSaved,
}: {
  source: MarketSourceRow;
  onClose: () => void;
  onSaved: (narrowed: boolean) => void;
}) {
  const { push } = useToast();
  const [termsUrl, setTermsUrl] = useState(source.termsUrl ?? "");
  const [termsSummary, setTermsSummary] = useState(source.termsSummary ?? "");
  const [uses, setUses] = useState<MarketAllowedUse[]>(source.allowedUses ?? []);
  const [attributionRequired, setAttributionRequired] = useState(source.attributionRequired);
  const [reviewDueAt, setReviewDueAt] = useState(defaultDueDate());
  const [saving, setSaving] = useState(false);

  function toggle(use: MarketAllowedUse) {
    setUses((prev) => (prev.includes(use) ? prev.filter((u) => u !== use) : [...prev, use]));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await marketApi.recordTermsReview(source.id, {
        termsUrl: termsUrl.trim(),
        termsSummary: termsSummary.trim(),
        allowedUses: uses,
        attributionRequired,
        reviewDueAt: new Date(`${reviewDueAt}T23:59:59`).toISOString(),
      });
      onSaved(saved.termsNarrowed);
    } catch (err) {
      push(err instanceof Error ? err.message : "Could not save terms review");
    } finally {
      setSaving(false);
    }
  }

  const valid = /^https?:\/\//.test(termsUrl.trim()) && termsSummary.trim().length >= 20 && !!reviewDueAt;

  return (
    <Modal
      open
      title={`Terms review · ${source.company.name} (${source.type})`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={() => void save()}>
            Save review
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs">
          Record what you actually read. The review is stored with your account and date, and expires on the due date
          (at most 12 months ahead). Fetching requires aggregate analytics to be allowed.
        </p>
        <Input label="Terms / API policy URL" name="termsUrl" value={termsUrl} onChange={(e) => setTermsUrl(e.target.value)} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Summary (what is allowed and forbidden)</span>
          <textarea
            className="min-h-[96px] w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            value={termsSummary}
            onChange={(e) => setTermsSummary(e.target.value)}
          />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700 dark:text-slate-200">Allowed uses</legend>
          {USES.map((u) => (
            <label key={u.value} className="flex items-center gap-2">
              <input type="checkbox" checked={uses.includes(u.value)} onChange={() => toggle(u.value)} />
              <span>{u.label}</span>
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={attributionRequired} onChange={(e) => setAttributionRequired(e.target.checked)} />
          <span>Attribution required</span>
        </label>
        <Input
          label="Review due"
          name="reviewDueAt"
          type="date"
          value={reviewDueAt}
          onChange={(e) => setReviewDueAt(e.target.value)}
        />
      </div>
    </Modal>
  );
}
