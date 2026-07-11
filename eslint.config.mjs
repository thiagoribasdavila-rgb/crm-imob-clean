import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // Legacy and experimental surfaces preserved for architectural audit,
    // but excluded from the V3 release gate until they are migrated.
    "application/**",
    "domain/**",
    "core/data-platform/**",
    "core/intelligence/**",
    "core/knowledge/**",
    "core/operating-system/**",
    "components/crm/**",
    "components/analytics/**",
    "components/crm/customer/**",
    "lib/ai/**",
    "lib/analytics/**",
    "lib/auth/**",
    "lib/services/**",
    "app/(crm)/kanban/**",
    "app/(crm)/pipedrive/**",
    "app/(crm)/pipeline/[stage]/**",
    "app/(crm)/pipeline/cold/**",
    "app/(crm)/pipeline/hot/**",
    "app/(crm)/pipeline/warm/**",
    "app/(crm)/leads/edit/**",
    "app/(crm)/leads/table/**",
    "app/(crm)/tasks/[id]/**",
    "app/api/leads/**",
    "middlewere.ts",
  ]),
]);

export default eslintConfig;
