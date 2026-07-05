import { createClient } from "@/lib/supabase/client";

export class LeadService {
  private supabase = createClient();

  // =========================
  // 📦 BASE CRUD
  // =========================

  async getLeads() {
    const { data, error } = await this.supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data;
  }

  async getLeadById(id: string) {
    const { data, error } = await this.supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  async createLead(lead: any) {
    const enrichedLead = {
      ...lead,
      score: this.calculateScore(lead),
      status: "new",
      created_at: new Date(),
    };

    const { data, error } = await this.supabase
      .from("leads")
      .insert(enrichedLead)
      .select()
      .single();

    if (error) throw error;

    // dispara inteligência após criação
    await this.runAIAnalysis(data.id);

    return data;
  }

  async updateLead(id: string, updates: any) {
    const { data, error } = await this.supabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    await this.runAIAnalysis(id);

    return data;
  }

  // =========================
  // 🧠 IA CORE (CÉREBRO)
  // =========================

  calculateScore(lead: any) {
    let score = 0;

    if (lead.budget_max > 1000000) score += 25;
    if (lead.source === "meta") score += 15;
    if (lead.phone) score += 10;
    if (lead.email) score += 10;

    if (lead.intent === "buy_now") score += 30;

    return Math.min(score, 100);
  }

  predictPipeline(score: number) {
    if (score >= 80) return "HOT";
    if (score >= 50) return "WARM";
    return "COLD";
  }

  nextBestAction(score: number) {
    if (score >= 80) return "CALL_IMMEDIATELY";
    if (score >= 60) return "SEND_WHATSAPP";
    if (score >= 40) return "SEND_PROPERTY";
    return "NURTURE";
  }

  // =========================
  // 🤖 AUTOMAÇÃO INTELIGENTE
  // =========================

  async runAIAnalysis(leadId: string) {
    const lead = await this.getLeadById(leadId);

    const score = this.calculateScore(lead);
    const pipeline = this.predictPipeline(score);
    const action = this.nextBestAction(score);

    await this.supabase
      .from("leads")
      .update({
        score,
        pipeline,
        next_action: action,
        updated_at: new Date(),
      })
      .eq("id", leadId);

    await this.logEvent({
      type: "AI_ANALYSIS",
      leadId,
      payload: { score, pipeline, action },
    });
  }

  // =========================
  // 📡 EVENTOS DO SISTEMA
  // =========================

  async logEvent(event: any) {
    await this.supabase.from("system_events").insert({
      type: event.type,
      lead_id: event.leadId,
      payload: event.payload,
    });
  }

  // =========================
  // 📊 PIPELINE INTELIGENTE
  // =========================

  async movePipelineAutomatically(leadId: string) {
    const lead = await this.getLeadById(leadId);

    const newStage = this.predictPipeline(lead.score);

    await this.supabase
      .from("leads")
      .update({
        status: newStage,
      })
      .eq("id", leadId);
  }
}
