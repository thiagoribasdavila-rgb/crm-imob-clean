import { runInsights } from "@/lib/ai/insights-engine";

export function generateInsights(data: any) {
  return runInsights(data.leads || []);
}
