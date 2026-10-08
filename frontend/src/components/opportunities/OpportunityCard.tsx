import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/store/hooks";
import type { GovernmentOpportunity } from "@/types";

export function OpportunityCard({ item }: { item: GovernmentOpportunity }) {
  const { push } = useToast();
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">{item.organization}</p>
            <h3 className="font-semibold">{item.opportunity}</h3>
          </div>
          <StatusBadge status={item.eligibilityStatus} />
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Eligibility</dt>
            <dd>{item.eligibility}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Age</dt>
            <dd>{item.ageRequirement}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Education</dt>
            <dd>{item.educationRequirement}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Location</dt>
            <dd>{item.location}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Deadline</dt>
            <dd>{item.deadline}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Source verification</dt>
            <dd>{item.sourceVerification.replaceAll("_", " ")}</dd>
          </div>
        </dl>
        <p className="text-xs text-amber-800 dark:text-amber-200">{item.officialNote}</p>
        <Button size="sm" variant="outline" onClick={() => push("Official notification is not linked in mock mode.")}>
          View Official Notification
        </Button>
      </CardBody>
    </Card>
  );
}
