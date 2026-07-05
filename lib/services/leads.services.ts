import { createClient } from "@/lib/supabase/client";

export class LeadService {
  private supabase = createClient();

  async getLeads() {
    const { data } = await this.supabase.from("leads").select("*");
    return data;
  }

  async createLead(lead: any) {
    return this.supabase.from("leads").insert(lead);
  }
}
