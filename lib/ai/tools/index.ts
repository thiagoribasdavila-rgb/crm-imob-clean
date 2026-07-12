import { registerAtlasTool } from "../registry";
import { getDashboardMetricsTool } from "./dashboard";
import { searchLeadsTool } from "./leads";
import { getLead360Tool } from "./lead360";

registerAtlasTool(getDashboardMetricsTool);
registerAtlasTool(searchLeadsTool);
registerAtlasTool(getLead360Tool);

export {
  getDashboardMetricsTool,
  searchLeadsTool,
  getLead360Tool,
};
