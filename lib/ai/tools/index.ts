import { registerAtlasTool } from "../registry";
import { getDashboardMetricsTool } from "./dashboard";
import { searchLeadsTool } from "./leads";

registerAtlasTool(getDashboardMetricsTool);
registerAtlasTool(searchLeadsTool);

export { getDashboardMetricsTool, searchLeadsTool };
