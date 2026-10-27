import { http, type RequestOpts } from "@/services/http";
import type { DemandView, RoadmapVsMarket, TrendView } from "@/services/api/marketAdminApi";

export function getCareerDemand(slug: string, lane = "all", opts?: RequestOpts) {
  return http.get<DemandView>(`/market/careers/${encodeURIComponent(slug)}/demand?lane=${encodeURIComponent(lane)}&basis=ACTIVE_STOCK&period=MONTH`, opts);
}

export function getCareerTrends(slug: string, lane = "all", opts?: RequestOpts) {
  return http.get<TrendView>(`/market/careers/${encodeURIComponent(slug)}/trends?lane=${encodeURIComponent(lane)}&period=MONTH`, opts);
}

export function getRoadmapVsMarket(slug: string, lane = "all", opts?: RequestOpts) {
  return http.get<RoadmapVsMarket>(`/market/careers/${encodeURIComponent(slug)}/roadmap-vs-market?lane=${encodeURIComponent(lane)}`, opts);
}
