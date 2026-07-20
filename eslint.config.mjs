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
    ".atlas-route-quarantine-*/**",
    "next-env.d.ts",

    // Somente superfícies legadas AINDA órfãs (pendentes de decisão de
    // migração/remoção) ficam fora do gate. Código vivo é sempre lintado:
    // lib/ai, lib/auth, lib/analytics, pipeline, tasks e kanban voltaram ao
    // gate em 2026-07-20 (limpos por mérito próprio; órfãos com erro foram
    // removidos em vez de silenciados). Entradas de caminhos já deletados
    // foram podadas.
    "domain/**",
    "core/**",
    "components/crm/**",
    "components/analytics/**",
    "components/pipeline/**",
    "components/ui/ProtectedRoute.tsx",
    "lib/data/**",
  ]),
]);

export default eslintConfig;
