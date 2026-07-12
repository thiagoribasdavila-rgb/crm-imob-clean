import { registerAtlasTool } from "../registry";
import { getDashboardMetricsTool } from "./dashboard";
import { searchLeadsTool } from "./leads";
import { getLead360Tool } from "./lead360";
import { listAttentionLeadsTool } from "./attention";

registerAtlasTool(getDashboardMetricsTool);
registerAtlasTool(searchLeadsTool);
registerAtlasTool(getLead360Tool);
registerAtlasTool(listAttentionLeadsTool);

export {
  getDashboardMetricsTool,
  searchLeadsTool,
  getLead360Tool,
  listAttentionLeadsTool,
};
