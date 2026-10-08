import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ResearchSource } from "@/types";

export function ResearchSourceCard({ source }: { source: ResearchSource }) {
  return (
    <Card>
      <CardBody className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium">{source.title}</h3>
          <StatusBadge status={source.quality} />
        </div>
        <p className="text-xs uppercase tracking-wide text-slate-500">
          {source.type} · {source.domain}
        </p>
        <p className="text-sm">{source.keyFinding}</p>
        <p className="text-xs text-slate-500">
          Confidence {source.confidence}% · {source.usedInRecommendation ? "Used in recommendation" : "Not used"}
        </p>
      </CardBody>
    </Card>
  );
}
