import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "next-env.d.ts",

    // Legacy and experimental surfaces preserved for architectural audit,
    // but excluded from the V3 release gate until they are migrated.
    "application/**",
    "domain/**",
    "core/**",
    "components/crm/**",
    "components/analytics/**",
    "components/pipeline/**",
    "components/ui/ProtectedRoute.tsx",
    "lib/ai/**",
    "lib/analytics/**",
    "lib/auth/**",
    "lib/data/**",
    "lib/services/**",
    "app/(atlas)/**",
    "app/(crm)/kanban/**",
    "app/(crm)/pipedrive/**",
    "app/(crm)/pipeline/**",
    "app/(crm)/leads/edit/**",
    "app/(crm)/leads/table/**",
    "app/(crm)/tasks/**",
    "app/api/leads/**",
    "middlewere.ts",
  ]),
]);

export default eslintConfig;
