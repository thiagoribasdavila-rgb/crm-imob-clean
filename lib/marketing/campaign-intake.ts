/**
 * Intake de campanha — a porta "mande o material aqui e a IA sobe".
 *
 * Fluxo escolhido pelo dono (2026-07): DIRETO COM PRÉVIA. O material (produto +
 * fotos/vídeo) entra, a IA gera o copy e monta a estrutura; a rota mostra a
 * PRÉVIA exata (nada escrito na Meta) e devolve um confirmToken determinístico
 * sobre a INTENÇÃO. Confirmar = reenviar o mesmo token: se o material não mudou,
 * a campanha é criada — sempre PAUSED (garantia do executor). Ativar (gastar)
 * segue sendo etapa humana separada.
 *
 * Este módulo é puro: normaliza a intenção, calcula o token e diz o que ainda
 * falta para criar. Upload de mídia e execução ficam na rota (injetados).
 */

import { createHash } from "node:crypto";

export type IntakeIntent = {
  product: string;
  developer: string | null;
  angles: string[];
  imageUrls: string[];
  videoUrls: string[];
  weeklyBudgetBrl: number | null;
  leadFormId: string | null;
  pageId: string | null;
  instagramActorId: string | null;
};

const cleanStr = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const cleanUrls = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.map(cleanStr).filter(Boolean))].sort() : [];

/** Normaliza o corpo cru numa intenção canônica (determinística). */
export function normalizeIntent(raw: unknown): IntakeIntent {
  const r = (raw ?? {}) as Record<string, unknown>;
  const budget = Number(r.weeklyBudgetBrl);
  return {
    product: cleanStr(r.product),
    developer: cleanStr(r.developer) || null,
    angles: Array.isArray(r.angles) ? [...new Set(r.angles.map(cleanStr).filter(Boolean))].sort() : [],
    imageUrls: cleanUrls(r.imageUrls),
    videoUrls: cleanUrls(r.videoUrls),
    weeklyBudgetBrl: Number.isFinite(budget) && budget > 0 ? budget : null,
    leadFormId: cleanStr(r.leadFormId) || null,
    pageId: cleanStr(r.pageId) || null,
    instagramActorId: cleanStr(r.instagramActorId) || null,
  };
}

/**
 * Token determinístico sobre a INTENÇÃO (não sobre hashes de mídia, que só
 * existem após o upload). Preview e commit concordam sobre o que será criado;
 * se o material mudar, o token muda e o commit é recusado — o dono revê.
 */
export function intentToken(intent: IntakeIntent): string {
  const canonical = JSON.stringify({
    product: intent.product.toLowerCase(),
    developer: intent.developer?.toLowerCase() ?? null,
    angles: intent.angles,
    imageUrls: intent.imageUrls,
    videoUrls: intent.videoUrls,
    weeklyBudgetBrl: intent.weeklyBudgetBrl,
    leadFormId: intent.leadFormId,
    pageId: intent.pageId,
    instagramActorId: intent.instagramActorId,
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** O que ainda falta para CRIAR (mensagens em PT para o dono). */
export function missingForCommit(intent: IntakeIntent): string[] {
  const missing: string[] = [];
  if (!intent.product) missing.push("o produto (empreendimento)");
  if (intent.imageUrls.length === 0 && intent.videoUrls.length === 0) missing.push("ao menos uma imagem ou vídeo");
  if (!intent.pageId) missing.push("a Página da Meta que vai veicular o anúncio");
  if (!intent.leadFormId) missing.push("o formulário de lead (instant form) publicado");
  if (intent.weeklyBudgetBrl == null) missing.push("a verba semanal");
  return missing;
}

export function canCommit(intent: IntakeIntent): boolean {
  return missingForCommit(intent).length === 0;
}

/** Referências de mídia para o asset_feed_spec, na ordem canônica. */
export type MediaRefs = { imageHashes: string[]; videoIds: string[] };

/** Junta hashes/ids de mídia preservando a ordem das URLs da intenção. */
export function assembleMediaRefs(
  imageResults: Array<{ url: string; hash: string }>,
  videoResults: Array<{ url: string; videoId: string }>,
  intent: IntakeIntent,
): MediaRefs {
  const imgByUrl = new Map(imageResults.map((r) => [r.url, r.hash]));
  const vidByUrl = new Map(videoResults.map((r) => [r.url, r.videoId]));
  return {
    imageHashes: intent.imageUrls.map((u) => imgByUrl.get(u)).filter((h): h is string => Boolean(h)),
    videoIds: intent.videoUrls.map((u) => vidByUrl.get(u)).filter((v): v is string => Boolean(v)),
  };
}
