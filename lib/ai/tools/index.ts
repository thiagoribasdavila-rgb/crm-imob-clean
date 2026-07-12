import { registerAtlasTool } from "../registry";
import { getDashboardMetricsTool } from "./dashboard";

registerAtlasTool(getDashboardMetricsTool);

export { getDashboardMetricsTool };
