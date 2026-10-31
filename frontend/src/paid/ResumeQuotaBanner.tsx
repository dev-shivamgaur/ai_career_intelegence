import { Card, CardBody } from "@/components/ui/Card";
import type { ResumeQuota } from "@/paid/types";

export function ResumeQuotaBanner({ quota }: { quota: ResumeQuota }) {
  const showWarn = !quota.isPaid && quota.used > 0 && quota.remaining <= quota.warnAtRemaining;
  return (
    <Card>
      <CardBody className="space-y-1 text-sm">
        <p>
          Plan: <span className="font-medium">{quota.plan}</span>
          {" · "}
          Resume uploads used:{" "}
          <span className="font-medium">
            {quota.used}/{quota.limit}
          </span>
          {" · "}
          Remaining: <span className="font-medium">{quota.remaining}</span>
        </p>
        {showWarn && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            Warning: you have changed your resume {quota.used} time{quota.used === 1 ? "" : "s"}. Only{" "}
            <strong>{quota.remaining}</strong> free attempt{quota.remaining === 1 ? "" : "s"} left. After that you need a
            paid plan (Settings).
          </p>
        )}
        {quota.blocked && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100">
            Free resume limit reached. Open Settings to upgrade to paid before uploading another resume.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
