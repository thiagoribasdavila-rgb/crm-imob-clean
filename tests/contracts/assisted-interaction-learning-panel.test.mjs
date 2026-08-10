import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("painel de aprendizado consome somente a métrica agregada e não expõe atendimentos", async () => {
  const panel = await readFile(new URL("../../components/decision-center/AssistedInteractionLearningPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /\/api\/v1\/analytics\/assisted-interaction\?days=30/);
  assert.match(panel, /response\.status === 403/);
  assert.match(panel, /Não exibe\s+conteúdo de atendimentos nem executa contatos/);
  assert.match(panel, /A avaliação indica utilidade percebida pelo corretor/);
  assert.match(panel, /Registrar revisão no Livro Executivo/);
  assert.match(panel, /automaticamente/);
  assert.equal(panel.includes("sourceText"), false);
  assert.equal(panel.includes("originalNote"), false);
});

test("painel não fica em carregamento para corretor sem permissão de gestão", async () => {
  const panel = await readFile(new URL("../../components/decision-center/AssistedInteractionLearningPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /const \[forbidden, setForbidden\] = useState\(false\)/);
  assert.match(panel, /setForbidden\(true\)/);
  assert.match(panel, /if \(forbidden \|\| unavailable\) return null/);
});

test("centro de decisão conecta o painel sem alterar a fila de decisões", async () => {
  const page = await readFile(new URL("../../app/(crm)/decision-center/page.tsx", import.meta.url), "utf8");
  assert.match(page, /AssistedInteractionLearningPanel/);
  assert.match(page, /<DecisionLearningLedger\s+decisions=\{decisions\}/);
  assert.match(page, /onGovernanceReview=\{receiveAssistedInteractionReview\}/);
  assert.match(page, /onAssistedInteractionGovernanceStatus=\s*\{\s*receiveAssistedInteractionGovernanceStatus\s*\}/);
});
