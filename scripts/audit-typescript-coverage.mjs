import ts from "typescript";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const loadConfig = (name) => {
  const configPath = resolve(root, name);
  const parsed = ts.readConfigFile(configPath, (path) => readFileSync(path, "utf8"));
  if (parsed.error) {
    throw new Error(ts.flattenDiagnosticMessageText(parsed.error.messageText, "\n"));
  }
  return ts.parseJsonConfigFileContent(parsed.config, ts.sys, root, undefined, configPath);
};
const normalize = (path) => relative(root, path).replaceAll("\\", "/");
const current = new Set(loadConfig("tsconfig.json").fileNames.map(normalize));
const active = new Set(loadConfig("tsconfig.active.json").fileNames.map(normalize));
const coveredByBoth = [...active].filter((file) => current.has(file)).sort();
const newlyCovered = [...active].filter((file) => !current.has(file)).sort();
const currentOnly = [...current].filter((file) => !active.has(file)).sort();
const percentage = active.size
  ? Math.round((coveredByBoth.length / active.size) * 1000) / 10
  : 0;

console.log(
  JSON.stringify(
    {
      currentTypecheckedFiles: current.size,
      activeDeployableTypeScriptFiles: active.size,
      filesCoveredByBothContracts: coveredByBoth.length,
      originalContractCoverageOfActivePercentage: percentage,
      newlyCoveredByActiveContract: newlyCovered.length,
      filesOnlyInOriginalContract: currentOnly.length,
      sampleNewlyProtectedByActiveContract: newlyCovered.slice(0, 25),
      interpretation:
        "typecheck:active valida 100% do contrato publicável; o percentual mede apenas quanto dele o tsconfig anterior alcançava.",
    },
    null,
    2,
  ),
);
