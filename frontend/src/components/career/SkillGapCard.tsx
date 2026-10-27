import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Modal } from "@/components/ui/Modal";
import { WhyPanel } from "@/components/ui/WhyPanel";
import type { SkillGapItem } from "@/types";
import { useState } from "react";
import { HiOutlineBookOpen, HiOutlineClock } from "react-icons/hi";
import { Link } from "react-router-dom";

export function SkillGapCard({ item }: { item: SkillGapItem }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const needsWork = item.currentStatus === "missing" || item.currentStatus === "needs_improvement";
  const market = item.market;

  return (
    <>
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{item.skill}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#5C4E4E] dark:text-[#988686]">
                <HiOutlineClock className="h-3.5 w-3.5" />
                <span>
                  {item.stretch ? "Later" : item.priority === "high" ? "This week" : "Next 30 days"}
                  {item.estimatedHours ? ` · ${item.estimatedHours} hours` : ""}
                  {item.category ? ` · ${item.category}` : ""}
                </span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={item.currentStatus} />
              <Badge tone={item.priority === "high" ? "danger" : item.priority === "medium" ? "warning" : "neutral"}>
                {item.priority === "high" ? "High priority" : item.priority === "medium" ? "Medium priority" : "Low priority"}
              </Badge>
              {market && market.demandPct !== null && (
                <Badge tone="neutral">
                  market {(market.demandPct * 100).toFixed(0)}%{market.trend ? ` · ${market.trend}` : ""}
                </Badge>
              )}
              <Button size="sm" variant="ghost" onClick={() => setWhyOpen(true)}>
                Why this is next
              </Button>
            </div>
          </div>
          {needsWork && item.why.solution && (
            <p className="text-sm text-slate-600 dark:text-slate-300">{item.why.solution}</p>
          )}
          {item.resources && item.resources.length > 0 && (
            <ul className="text-sm">
              {item.resources.map((resource) => (
                <li key={resource.url}>
                  <a className="text-brand-700 underline" href={resource.url} target="_blank" rel="noreferrer">
                    {resource.title}
                  </a>
                  <span className="text-xs text-slate-500"> · {resource.kind}</span>
                </li>
              ))}
            </ul>
          )}
          {needsWork && (item.why.learnWhere?.length ?? 0) > 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-300">
              <p className="flex items-center gap-1 text-xs font-semibold text-[#5C4E4E] dark:text-[#988686]">
                <HiOutlineBookOpen className="h-3.5 w-3.5" />
                Where to learn
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-4">
                {item.why.learnWhere!.slice(0, 3).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {needsWork && item.skillId && (
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/prepare/${item.skillId}`}
                className="inline-flex h-8 items-center rounded-lg bg-ink px-3 text-sm font-medium text-white"
              >
                Prepare this skill
              </Link>
              <Link
                to={`/roadmap?skill=${encodeURIComponent(item.skill)}`}
                className="inline-flex items-center text-sm font-medium text-brand-700"
              >
                Open on roadmap
              </Link>
            </div>
          )}
        </CardBody>
      </Card>
      <Modal open={whyOpen} onClose={() => setWhyOpen(false)} title={`Close the gap: ${item.skill}`}>
        <WhyPanel why={item.why} />
      </Modal>
    </>
  );
}
