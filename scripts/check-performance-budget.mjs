import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const config = JSON.parse(readFileSync(resolve("config/performance-budget.json"), "utf8"));
const root = resolve(config.buildOutput);
if (!existsSync(root)) {
  console.error("PERFORMANCE Fase 7: build ausente. Execute npm run build antes deste gate.");
  process.exit(1);
}

function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(path) : entry.name.endsWith(".js") ? [path] : [];
  });
}

const files = filesIn(root).map((path) => {
  const bytes = statSync(path).size;
  const gzipBytes = gzipSync(readFileSync(path), { level: 9 }).byteLength;
  return { path, bytes, gzipBytes };
});
const largest = files.reduce((current, file) => file.bytes > current.bytes ? file : current, { bytes: 0, gzipBytes: 0, path: "" });
const largestGzip = files.reduce((current, file) => file.gzipBytes > current.gzipBytes ? file : current, { bytes: 0, gzipBytes: 0, path: "" });
const totalBytes = files.reduce((total, file) => total + file.bytes, 0);
const budget = config.javascript;
const failures = [];
if (files.length > budget.maximumChunkCount) failures.push(`chunks ${files.length} > ${budget.maximumChunkCount}`);
if (largest.bytes > budget.maximumSingleChunkBytes) failures.push(`maior chunk ${largest.bytes} B > ${budget.maximumSingleChunkBytes} B`);
if (largestGzip.gzipBytes > budget.maximumSingleChunkGzipBytes) failures.push(`maior gzip ${largestGzip.gzipBytes} B > ${budget.maximumSingleChunkGzipBytes} B`);
if (totalBytes > budget.maximumTotalBytes) failures.push(`total ${totalBytes} B > ${budget.maximumTotalBytes} B`);

console.log("ATLAS PERFORMANCE BUDGET");
console.log(JSON.stringify({
  javascriptChunks: files.length,
  totalBytes,
  largestChunkBytes: largest.bytes,
  largestChunkGzipBytes: largestGzip.gzipBytes,
  runtimeEvidencePending: config.runtimeEvidenceRequired,
}, null, 2));
if (failures.length) {
  console.error(`PERFORMANCE Fase 7: REPROVADA\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log("PERFORMANCE Fase 7: orçamento estático aprovado; latência real permanece pendente de homologação.");
