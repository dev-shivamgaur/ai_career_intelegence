import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import type { AccountPlan } from "@/paid/types";

export function PlanCard({ plan }: { plan?: AccountPlan | null }) {
  const isPaid = plan === "PAID";
  return (
    <Card>
      <CardHeader
        title="Plan"
        description="Free accounts get limited resume changes. Paid unlocks higher resume limits (admin can set PAID on your account)."
      />
      <CardBody className="space-y-2 text-sm">
        <p>
          Current plan: <span className="font-semibold">{isPaid ? "Paid" : "Free"}</span>
        </p>
        <ul className="list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
          <li>Free: up to 5 resume uploads/replacements. All preparation skills stay free for now.</li>
          <li>Paid: higher resume upload limits for ongoing document updates.</li>
          <li>One phone number = one learner account (already enforced). Admins are not capped the same way.</li>
        </ul>
        {!isPaid && (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            To move to paid, contact support or an admin to set your plan to PAID. Payment checkout is not wired in this
            build yet — limits are enforced on the server.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
