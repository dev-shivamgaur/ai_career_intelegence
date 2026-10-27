import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ResearchSource } from "@/types";
import { ExternalLink } from "lucide-react";
import { LinkedText } from "./LinkedText";

export function ResearchSourceCard({ source }: { source: ResearchSource }) {
  const href = source.url?.startsWith("http") ? source.url : undefined;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-medium leading-snug">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer" className="hover:underline">
                {source.title}
              </a>
            ) : (
              source.title
            )}
          </h3>
          <StatusBadge status={source.quality} />
        </div>
        <p className="text-xs uppercase tracking-wide text-[#5C4E4E] dark:text-[#988686]">
          {sourceLabel(source.type)}
          {source.domain ? ` · ${source.domain}` : ""}
        </p>
        <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
          <LinkedText text={source.keyFinding} />
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5C4E4E] dark:text-[#988686]">
          <span>Saved note · confidence {source.confidence}%</span>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-brand-800 dark:text-[#AFEEEE]"
            >
              Open source
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <span>No public link stored</span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function sourceLabel(type: string): string {
  if (type === "job") return "News headline";
  if (type === "learning") return "Learning page";
  if (type === "government") return "Government page";
  if (type === "career_guide") return "Career guide";
  return type.replaceAll("_", " ");
}
