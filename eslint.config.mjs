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

    // Worktrees de sessão (git worktree add .claude/worktrees/<nome>) são
    // CÓPIAS deste mesmo repositório: sem ignorá-las, `eslint .` lintaria o
    // projeto inteiro em duplicidade e o gate `npm run lint --max-warnings=0`
    // sai vermelho por causa de arquivos que já foram corrigidos aqui —
    // verificado: 128 erros vindos só de .claude/worktrees/.
    ".claude/**",

    // Única superfície fora do gate: core/** (471 arquivos de arquitetura
    // legada/experimental). Auditada em 2026-07-20: ZERO imports de código
    // vivo (alias e relativo verificados) — quarentena documentada; a
    // decisão de remover ~500 arquivos é do dono do projeto, não do gate.
    // Todo o resto do repositório é lintado; órfãos foram removidos em vez
    // de silenciados (50 arquivos na última varredura).
    "core/**",
  ]),
]);

export default eslintConfig;
