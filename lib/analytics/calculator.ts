export function forecastRevenue(deals: any[]) {
  const total = deals.reduce((acc, deal) => {
    return acc + (deal.value || 0);
  }, 0);

  const probability = deals.reduce((acc, deal) => {
    return acc + (deal.probability || 0);
  }, 0) / (deals.length || 1);

  return {
    expectedRevenue: total * (probability / 100),
    confidence: probability,
  };
}
