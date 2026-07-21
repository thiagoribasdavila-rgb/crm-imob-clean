import { normalizeIntent, intentToken, missingForCommit, canCommit, assembleMediaRefs } from "/Users/thiagoribasdavila/atlas-v3/lib/marketing/campaign-intake.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { ok ? pass++ : fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

// 1. normalização: trim, dedupe, sort de URLs; budget inválido → null
{
  const i = normalizeIntent({ product: "  Spin Mood ", imageUrls: ["https://b.jpg", "https://a.jpg", "https://a.jpg", " "], weeklyBudgetBrl: "0" });
  t("produto trim", i.product === "Spin Mood");
  t("urls dedup+sort+limpo", JSON.stringify(i.imageUrls) === JSON.stringify(["https://a.jpg", "https://b.jpg"]));
  t("budget 0 → null", i.weeklyBudgetBrl === null);
  t("campos ausentes → null", i.leadFormId === null && i.pageId === null && i.developer === null);
}
// 2. token estável e sensível à intenção (não à ordem das URLs)
{
  const a = intentToken(normalizeIntent({ product: "X", imageUrls: ["https://1.jpg", "https://2.jpg"], pageId: "p", leadFormId: "f", weeklyBudgetBrl: 300 }));
  const b = intentToken(normalizeIntent({ product: "X", imageUrls: ["https://2.jpg", "https://1.jpg"], pageId: "p", leadFormId: "f", weeklyBudgetBrl: 300 }));
  t("token estável (ordem de URL não importa)", a === b);
  const c = intentToken(normalizeIntent({ product: "X", imageUrls: ["https://1.jpg"], pageId: "p", leadFormId: "f", weeklyBudgetBrl: 300 }));
  t("token muda com material diferente", a !== c);
  const d = intentToken(normalizeIntent({ product: "X", imageUrls: ["https://1.jpg", "https://2.jpg"], pageId: "p", leadFormId: "f", weeklyBudgetBrl: 400 }));
  t("token muda com verba diferente", a !== d);
  t("token 32 hex", /^[0-9a-f]{32}$/.test(a));
}
// 3. produto/case não quebra o token (canônico lowercase)
{
  const a = intentToken(normalizeIntent({ product: "Spin Mood" }));
  const b = intentToken(normalizeIntent({ product: "spin mood" }));
  t("produto case-insensitive no token", a === b);
}
// 4. missing: só produto+mídia → lista o que falta para criar
{
  const i = normalizeIntent({ product: "Spin Mood", imageUrls: ["https://a.jpg"] });
  const m = missingForCommit(i);
  t("falta página", m.some((x) => x.includes("Página")));
  t("falta formulário", m.some((x) => x.includes("formulário")));
  t("falta verba", m.some((x) => x.includes("verba")));
  t("não falta mídia (tem imagem)", !m.some((x) => x.includes("imagem")));
  t("não pode commitar ainda", !canCommit(i));
}
// 5. tudo presente → pode commitar
{
  const i = normalizeIntent({ product: "Spin Mood", videoUrls: ["https://v.mp4"], pageId: "123", leadFormId: "456", weeklyBudgetBrl: 300 });
  t("com tudo → sem faltas", missingForCommit(i).length === 0 && canCommit(i));
}
// 6. sem produto e sem mídia
{
  const m = missingForCommit(normalizeIntent({}));
  t("sem produto listado", m.some((x) => x.includes("produto")));
  t("sem mídia listado", m.some((x) => x.includes("imagem ou vídeo")));
}
// 7. assembleMediaRefs preserva ordem das URLs da intenção
{
  const intent = normalizeIntent({ product: "X", imageUrls: ["https://a.jpg", "https://b.jpg", "https://c.jpg"] });
  // resultados chegam fora de ordem
  const refs = assembleMediaRefs(
    [{ url: "https://b.jpg", hash: "HB" }, { url: "https://a.jpg", hash: "HA" }, { url: "https://c.jpg", hash: "HC" }],
    [], intent,
  );
  t("hashes na ordem canônica (a,b,c)", JSON.stringify(refs.imageHashes) === JSON.stringify(["HA", "HB", "HC"]));
  t("sem vídeos → lista vazia", refs.videoIds.length === 0);
}
// 8. assembleMediaRefs ignora url sem hash (upload que não veio)
{
  const intent = normalizeIntent({ product: "X", imageUrls: ["https://a.jpg", "https://b.jpg"] });
  const refs = assembleMediaRefs([{ url: "https://a.jpg", hash: "HA" }], [], intent);
  t("url sem hash é omitida sem quebrar", JSON.stringify(refs.imageHashes) === JSON.stringify(["HA"]));
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
