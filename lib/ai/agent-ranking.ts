export function rankAgents(agents: any[]) {
  return agents
    .map(a => ({
      ...a,
      score:
        a.sales * 40 +
        a.responseTime * -2 +
        a.leadsClosed * 30,
    }))
    .sort((a, b) => b.score - a.score);
}
