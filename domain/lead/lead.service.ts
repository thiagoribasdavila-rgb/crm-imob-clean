export class LeadService {
  calculateScore(lead: any) {
    let score = 0;

    if (lead.budget > 1000000) score += 30;
    if (lead.source === "meta") score += 10;
    if (lead.status === "new") score += 5;

    return score;
  }
}
