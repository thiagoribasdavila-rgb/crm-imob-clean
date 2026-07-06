export const CRM_HEAD = {
  system: "CRM-IMOB-CLEAN",
  version: "3.0-AUTONOMOUS",

  ai: {
    enabled: true,
    mode: "autonomous",
    insightLevel: "MAX",
  },

  pipeline: {
    autoAssignLeads: true,
    prioritizeHotLeads: true,
    coldLeadDecay: true,
  },

  ads: {
    metaIntegration: true,
    autoOptimizeCPL: true,
    autoPauseBadAds: true,
  },

  agents: {
    leadAgent: true,
    salesAgent: true,
    adsAgent: true,
  },

  rules: {
    realTimeSync: true,
    noManualOverrideForHotLeads: true,
    forcePipelineUpdate: true,
  },
};
