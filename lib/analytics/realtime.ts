export function getRealtimeMetrics(data: any) {
  return {
    activeLeads: data.leads?.filter((l: any) => l.status !== "lost").length,
    hotLeads: data.leads?.filter((l: any) => l.score > 80).length,
    dealsOpen: data.deals?.filter((d: any) => d.status !== "closed").length,
  };
}
