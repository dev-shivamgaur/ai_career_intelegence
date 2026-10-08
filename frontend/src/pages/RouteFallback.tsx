import { DashboardSkeleton } from "@/components/ui/Skeleton";

export function RouteFallback() {
  return (
    <div className="p-8">
      <DashboardSkeleton />
    </div>
  );
}
