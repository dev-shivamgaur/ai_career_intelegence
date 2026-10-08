import { Button } from "@/components/ui/Button";
import { SkillBadge, StatusBadge } from "@/components/ui/StatusBadge";
import { Card, CardBody } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { WhyPanel } from "@/components/ui/WhyPanel";
import type { Job } from "@/types";
import { useState } from "react";

export function JobCard({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const label = job.matchLabel === "strong" ? "strong" : job.matchLabel === "potential" ? "potential" : "low";
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{job.company}</p>
            <h3 className="text-base font-semibold">{job.role}</h3>
            <p className="text-sm text-slate-500">
              {job.location} · {job.workType} · {job.experience}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold">{job.matchPercent}%</p>
            <p className="text-[11px] text-slate-500">Platform estimated match</p>
            <div className="mt-1">
              <StatusBadge status={label} />
            </div>
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Matched</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {job.matchedSkills.map((s) => (
              <SkillBadge key={s} name={s} />
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-500">Missing</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {job.missingSkills.map((s) => (
              <SkillBadge key={s} name={s} />
            ))}
          </div>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-300">{job.whyMatches}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen(true)}>
            Why this job matches
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.alert("Apply is disabled in mock mode. No external applications are sent.")}
          >
            Apply
          </Button>
        </div>
        <p className="text-[11px] text-amber-700">Mock / demo listing · not a real employer</p>
      </CardBody>
      <Modal open={open} onClose={() => setOpen(false)} title="Why this job matches">
        <WhyPanel
          why={{
            recommendation: job.role,
            currentProfile: `Matched skills: ${job.matchedSkills.join(", ")}`,
            targetCareer: job.role,
            marketEvidence: "Generated from the job catalog on the server.",
            reason: job.whyMatches,
          }}
        />
      </Modal>
    </Card>
  );
}
