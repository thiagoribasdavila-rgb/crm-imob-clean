/**
 * O PAYLOAD DE ATUALIZAÇÃO DA LEAD — módulo PURO, e é por isso que ele existe.
 *
 * Esta função morava em `lib/compat/live-writes.ts`, que importa `server-only`.
 * Consequência: nenhum contrato conseguia carregá-la, e ela ficou sem cobertura
 * executável desde sempre.
 *
 * Foi assim que o defeito viveu: `name`, `email`, `phone` e `source` não usavam
 * `sent()`, então QUALQUER PATCH parcial gravava `null` nos quatro. Atualizar só
 * o bairro de uma lead apagava o nome e o telefone dela — que é como o corretor
 * a alcança. Medido executando contra uma lead real: `email: "…" → null`.
 *
 * Separar não é organização: é o que torna a regra exercitável. `live-writes.ts`
 * reexporta, então nenhum chamador muda.
 */
// Caminho RELATIVO com extensão, e não o alias `@/`: o alias não resolve em
// `node --test`, e um módulo que o contrato não consegue carregar volta a ser
// exatamente o que este arquivo veio consertar. `allowImportingTsExtensions` já
// está ligado no tsconfig, então o compilador aceita a mesma forma.
import { calculateLeadScore } from "../atlas/scoring.ts";
import type { AtlasLead } from "@/types/atlas";

const PURPOSE_IN_NOTES = /Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?/i;

/** Número finito 0–100 arredondado; null quando não há score declarado (0 inclusive). */
function readDeclaredScore(value: unknown): number | null {
  const parsed = typeof value === "number" || (typeof value === "string" && value.trim()) ? Number(value) : NaN;
  if (!Number.isFinite(parsed)) return null;
  const bounded = Math.min(100, Math.max(0, Math.round(parsed)));
  // 0 nunca é declaração: o Lead 360 devolve 0 quando a coluna está null, e um
  // lead válido (exige telefone ou e-mail) sempre pontua acima de zero.
  return bounded > 0 ? bounded : null;
}

function readCurrentNumber(value: unknown): number | null {
  const parsed = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(parsed) ? parsed : null;
}

function purposeFromNotes(value: unknown): string {
  const match = typeof value === "string" ? value.match(PURPOSE_IN_NOTES) : null;
  if (!match) return "";
  const normalized = match[1].toLocaleLowerCase("pt-BR");
  return normalized.startsWith("loca") ? "locacao" : normalized;
}

/**
 * Payload de UPDATE do lead (substituição total da linha).
 *
 * Regra de ouro desta função: campo AUSENTE no corpo preserva o valor atual —
 * nunca vira null, 0 ou "frio". O PATCH parcial rebaixava o lead em silêncio
 * (score_ia = 0 e temperature = "frio"), e esses dois campos comandam fila do
 * dia, distribuição e filtro de min_score.
 *
 * score_ia é DERIVADO dos dados (mesma função da criação, lib/atlas/scoring),
 * não declarado pelo cliente: a tela devolve o score que leu, então tratar esse
 * eco como declaração congelaria o número para sempre — preencher orçamento e
 * região nunca elevaria o score. Só um valor DIFERENTE do atual é aceito como
 * override deliberado de um cliente de API.
 */
export function liveLeadUpdatePayload(
  body: Record<string, unknown>,
  currentStatus: unknown,
  currentLead: Record<string, unknown> = {},
) {
  const sent = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

  const budgetMinRaw = body.budget_min === null || body.budget_min === "" ? null : Number(body.budget_min);
  const budgetMaxRaw = body.budget_max === null || body.budget_max === "" ? null : Number(body.budget_max);
  const bedroomsRaw = body.bedrooms === null || body.bedrooms === "" ? null : Number(body.bedrooms);
  const budgetMin = sent("budget_min")
    ? (Number.isFinite(budgetMinRaw) ? budgetMinRaw : null)
    : readCurrentNumber(currentLead.budget_min);
  const budgetMax = sent("budget_max")
    ? (Number.isFinite(budgetMaxRaw) ? budgetMaxRaw : null)
    : readCurrentNumber(currentLead.budget_max);
  const bedrooms = sent("bedrooms")
    ? (Number.isFinite(bedroomsRaw) ? bedroomsRaw : null)
    : readCurrentNumber(currentLead.preferred_bedrooms);

  const currentNeighborhoods = Array.isArray(currentLead.preferred_neighborhoods)
    ? currentLead.preferred_neighborhoods.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
    : [];
  const preferredNeighborhoods = sent("preferred_regions")
    ? (Array.isArray(body.preferred_regions)
      ? body.preferred_regions.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
      : [])
    : currentNeighborhoods;

  const currentNotes = typeof currentLead.notes === "string" ? currentLead.notes : "";
  const purpose = sent("purpose") && typeof body.purpose === "string"
    ? body.purpose.trim()
    : purposeFromNotes(currentNotes);
  const notesSource = sent("notes") && typeof body.notes === "string" ? body.notes : currentNotes;
  const notes = notesSource
    .replace(/^Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?\s*/i, "")
    .trim();
  const enrichedNotes = [purpose ? `Objetivo declarado: ${purpose}.` : "", notes].filter(Boolean).join("\n").slice(0, 5000) || null;

  /**
   * ── IDENTIDADE DA LEAD: OMITIR NÃO É APAGAR ────────────────────────────────
   *
   * `budget_*`, `bedrooms` e `preferred_regions` já usavam `sent()` acima. Nome,
   * e-mail, telefone e origem NÃO usavam: um PATCH que não os trouxesse gravava
   * `null` nos quatro. Ou seja, atualizar só o bairro de uma lead apagava o nome
   * e o telefone dela — que é exatamente como o corretor a alcança.
   *
   * Medido executando, contra uma lead real: `email: "…" → null`.
   *
   * A distinção que o `sent()` restaura é a que importa: campo AUSENTE preserva o
   * que está no banco; campo enviado VAZIO (`""` ou `null`) limpa de propósito.
   * Sem ela, toda tela que salvar um campo por vez destrói os outros quatro — e é
   * essa a forma de captura que a operação precisa, com 473 leads de SLA vencido
   * e o corretor com um toque por cliente.
   */
  const textoAtual = (valor: unknown) =>
    typeof valor === "string" && valor.trim() ? valor.trim() : null;

  const email = sent("email")
    ? (typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null)
    : textoAtual(currentLead.email)?.toLowerCase() ?? null;
  const phone = sent("phone")
    ? (typeof body.phone === "string" && body.phone.trim() ? body.phone.replace(/\D/g, "") : null)
    : textoAtual(currentLead.phone)?.replace(/\D/g, "") ?? null;
  const status = typeof body.status === "string" && body.status.trim()
    ? body.status.trim().toLowerCase()
    : String(currentStatus || "novo").toLowerCase();

  // Mapeamento snake→camel explícito: calculateLeadScore lê AtlasLead. Passar a
  // linha do banco direto produziria score sobre objeto vazio.
  // lastInteractionAt/nextActionAt ficam de fora de propósito — a criação também
  // não os informa, e incluí-los aqui daria scores diferentes para o mesmo lead
  // dependendo do caminho de escrita.
  const scoringInput: Partial<AtlasLead> = {
    email,
    phone,
    budgetMax: budgetMax ?? null,
    preferredRegions: preferredNeighborhoods,
    bedrooms: bedrooms ?? null,
    purpose: purpose || null,
    status,
  };
  const derived = calculateLeadScore(scoringInput);
  const declaredScore = readDeclaredScore(body.score);
  const storedScore = readDeclaredScore(currentLead.score_ia);
  const scoreIa = declaredScore !== null && declaredScore !== storedScore ? declaredScore : derived.score;

  const currentTemperature = typeof currentLead.temperature === "string" && currentLead.temperature.trim()
    ? currentLead.temperature.trim().toLowerCase()
    : null;
  // Temperatura é declarada por humano na Lead 360: o valor enviado vence, o
  // atual é preservado na omissão, e só na ausência dos dois cai na derivada.
  const temperature = typeof body.temperature === "string" && body.temperature.trim()
    ? body.temperature.trim().toLowerCase()
    : currentTemperature ?? derived.temperature;

  return {
    // Mesma regra de `email`/`phone`: ausente preserva, enviado vazio limpa.
    name: sent("name")
      ? (typeof body.name === "string" ? body.name.trim() : null)
      : textoAtual(currentLead.name),
    email,
    phone,
    source: sent("source")
      ? (typeof body.source === "string" && body.source.trim() ? body.source.trim() : null)
      : textoAtual(currentLead.source),
    status,
    temperature,
    // A criação grava as duas colunas de temperatura; o PATCH só gravava uma e
    // deixava classificacao_ia congelada no valor do nascimento do lead.
    classificacao_ia: temperature,
    score_ia: scoreIa,
    budget_min: budgetMin,
    budget_max: budgetMax,
    preferred_bedrooms: bedrooms,
    preferred_neighborhoods: preferredNeighborhoods,
    notes: enrichedNotes,
    /**
     * ── OS QUATRO CAMPOS QUE NÃO TINHAM COMO SER GRAVADOS ──────────────────
     *
     * Medido no banco vivo em 03/08/2026, sobre 613 leads: `payment_method`,
     * `purchase_timeline`, `monthly_income` e `financing_required` com 100% de
     * vazios — 613 de 613, os quatro.
     *
     * Não era desleixo de quem atende. A ficha não tinha input para nenhum
     * deles, e este construtor não os mapeava: mesmo que a tela mandasse, o
     * PATCH descartaria em silêncio, com HTTP 200 e a ficha desenhando normal.
     *
     * `purpose` entra junto pelo mesmo motivo — ele só chegava ao banco de
     * carona no texto das observações (`Objetivo declarado: …`), nunca na
     * coluna, e por isso 424 leads estão sem finalidade enquanto a frase existe
     * na nota.
     *
     * Todos seguem a regra da casa: AUSENTE preserva o que está gravado, VAZIO
     * limpa de propósito.
     */
    purpose: sent("purpose")
      ? (typeof body.purpose === "string" && body.purpose.trim() ? body.purpose.trim() : null)
      : textoAtual(currentLead.purpose),
    payment_method: sent("payment_method")
      ? (typeof body.payment_method === "string" && body.payment_method.trim() ? body.payment_method.trim() : null)
      : textoAtual(currentLead.payment_method),
    purchase_timeline: sent("purchase_timeline")
      ? (typeof body.purchase_timeline === "string" && body.purchase_timeline.trim() ? body.purchase_timeline.trim() : null)
      : textoAtual(currentLead.purchase_timeline),
    /**
     * `financing_required` é BOOLEAN no banco vivo — conferido em
     * `information_schema` depois de a prova derrubar o PATCH inteiro com um
     * texto ali. Um `"sim"` nesta coluna faz o Postgres recusar a gravação toda
     * e leva junto os outros nove campos da ficha.
     *
     * A tela manda `"sim"`/`"nao"` (os valores estáveis do catálogo); a tradução
     * para booleano acontece AQUI, uma vez, e não em cada tela que precisar.
     */
    financing_required: sent("financing_required")
      ? (() => {
        const cru = body.financing_required;
        if (cru === null || cru === "" || cru === undefined) return null;
        if (typeof cru === "boolean") return cru;
        const texto = String(cru).trim().toLowerCase();
        if (texto === "sim" || texto === "true") return true;
        if (texto === "nao" || texto === "não" || texto === "false") return false;
        // Valor que não é nenhum dos dois NÃO vira `false` por conveniência:
        // `false` afirma "não precisa financiar", e afirmar isso a partir de um
        // texto desconhecido é inventar resposta do cliente.
        return null;
      })()
      : (typeof currentLead.financing_required === "boolean" ? currentLead.financing_required : null),
    monthly_income: sent("monthly_income")
      ? (body.monthly_income === null || body.monthly_income === "" ? null : Number(body.monthly_income) || null)
      : readCurrentNumber(currentLead.monthly_income),
  };
}
