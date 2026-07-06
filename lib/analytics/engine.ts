export class AnalyticsEngine {
  static calculateConversion(leads: number, deals: number) {
    if (leads === 0) return 0;
    return (deals / leads) * 100;
  }

  static cac(spend: number, leads: number) {
    if (leads === 0) return 0;
    return spend / leads;
  }

  static ltv(avgTicket: number, repeatRate: number) {
    return avgTicket * repeatRate;
  }
}
