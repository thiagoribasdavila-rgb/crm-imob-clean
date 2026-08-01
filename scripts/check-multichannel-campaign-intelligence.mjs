import fs from "node:fs";
const checks=[];const need=(file,...terms)=>{const source=fs.readFileSync(file,"utf8");for(const term of terms)checks.push([`${file}: ${term}`,source.includes(term)])};
need("lib/marketing/multichannel-campaign-intelligence.ts","CAMPAIGN_PLATFORMS","sampleSufficient","platformCrmLeadGap","rankCampaigns");
need("supabase/migrations/20260719133000_phase_91_multichannel_campaign_intelligence.sql","multichannel_campaign_daily_facts","snapshot_version","is_current","source_hash","ingest_multichannel_campaign_fact","campaign_ingest_forbidden","campaign_development_out_of_scope","campaign_date_out_of_range");
need("app/api/v1/campaign-intelligence/route.ts","crmIsConversionTruth: true","platformReportedSeparated: true","minimumCrmLeadsForRanking: 30","automaticBudgetChanges: false");
// CC-6: redesign reword — slogans caixa-alta viraram chip/eyebrow/rótulo mixed-case; governança preservada (chip "CRM é a verdade da conversão", nota "Amostra mínima: 30 leads", eyebrow de canais).
need("app/(crm)/marketing/campaign-intelligence/page.tsx","91-multichannel-campaign-intelligence","CRM é a verdade da conversão","Amostra mínima: 30 leads","Meta · Google · TikTok · YouTube · Portais");
need("config/multichannel-campaign-intelligence.json","\"phase\": 91","\"pii_allowed\": false","\"automatic_budget_changes\": false");
for(const[name,ok]of checks)console.log(`${ok?"✓":"✗"} ${name}`);if(checks.some(([,ok])=>!ok))process.exit(1);console.log(`\nFase 91 aprovada: ${checks.length} controles de campanhas multicanal.`);
