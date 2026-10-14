import { http } from "@/services/http";
import type { DemandView, RoadmapVsMarket, TrendView } from "@/services/api/marketAdminApi";

export function getCareerDemand(slug: string, lane = "all") {
  return http.get<DemandView>(`/market/careers/${encodeURIComponent(slug)}/demand?lane=${encodeURIComponent(lane)}&basis=ACTIVE_STOCK&period=MONTH`);
}

export function getCareerTrends(slug: string, lane = "all") {
  return http.get<TrendView>(`/market/careers/${encodeURIComponent(slug)}/trends?lane=${encodeURIComponent(lane)}&period=MONTH`);
}

export function getRoadmapVsMarket(slug: string, lane = "all") {
  return http.get<RoadmapVsMarket>(`/market/careers/${encodeURIComponent(slug)}/roadmap-vs-market?lane=${encodeURIComponent(lane)}`);
}
