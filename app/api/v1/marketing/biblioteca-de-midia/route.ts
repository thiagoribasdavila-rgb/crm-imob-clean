/**
 * A BIBLIOTECA DE MÍDIA DENTRO DO CRM — listar (GET) e importar (POST).
 *
 * ── Fronteira, dita uma vez e valendo para o arquivo inteiro ────────────────
 *
 * Na META: só GET. Esta rota lista `/adimages` e `/advideos` e mais nada. Não
 * sobe mídia, não cria, não edita, não ativa e não gasta — subir peça é ESCRITA
 * na conta do dono, e essa decisão é dele, no Gerenciador de Anúncios.
 *
 * No BANCO: escreve, e só em `creative_assets`. A importação copia para o CRM o
 * hash da imagem / id do vídeo que a Meta já tem, para a composição da proposta
 * OFERECER a peça numa lista em vez de exigir que alguém digite um hash de 32
 * caracteres copiado à mão. Nenhuma linha é apagada nem sobrescrita: a
 * importação só ACRESCENTA o que falta, e rodar dez vezes deixa o banco igual à
 * primeira.
 *
 * ── Onde mora a decisão, e por que não é aqui ───────────────────────────────
 *
 * Esta rota mede e grava; `lib/marketing/importar-biblioteca-de-midia.ts`
 * decide. O módulo é puro e o contrato o EXECUTA — é assim que a idempotência,
 * o descarte de peça inutilizável e a regra "falha de leitura não é zero" ficam
 * provadas rodando, e não procuradas por grep no fonte.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import {
  errosDaLeitura,
  lerBibliotecaDaConta,
  pecasDaBiblioteca,
  TETO_DE_LEITURA,
  totalDePecas,
  type BibliotecaLida,
} from "@/lib/meta/marketing/biblioteca-de-midia";
import { chaveDaPeca, planejarImportacao, resumirImportacao } from "@/lib/marketing/importar-biblioteca-de-midia";
import {
  gravarPecasImportadas,
  lerAtivosDaBiblioteca,
  TETO_DE_ATIVOS,
} from "@/lib/marketing/creative-assets-da-biblioteca";

export const dynamic = "force-dynamic";

const LIDERANCA = new Set(["director", "superintendent", "manager"]);

/**
 * TTL da leitura viva. A biblioteca muda quando alguém sobe uma peça no
 * Gerenciador de Anúncios — evento manual e raro. `isCacheable` só aceita
 * leitura em que os DOIS lados responderam: uma falha nunca envelhece como se
 * fosse medida.
 */
const TTL_MS = 5 * 60_000;

function papelDe(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Normaliza o id da conta para a forma `act_…` — a mesma que a chave usa. */
function normalizarConta(valor: string): string {
  return `act_${valor.replace(/^act_/, "")}`;
}

/** Lê a biblioteca viva. `null` quando não há token — que não é "conta vazia". */
async function lerBiblioteca(contaId: string, comCache: boolean): Promise<BibliotecaLida | null> {
  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) return null;
  const ler = () => lerBibliotecaDaConta(contaId, token);
  if (!comCache) return ler();
  return cachedMetaRead<BibliotecaLida>(`biblioteca-de-midia:${contaId}`, ler, {
    ttlMs: TTL_MS,
    isCacheable: (v) => pecasDaBiblioteca(v) !== null,
  });
}

/**
 * GET — a lista que a composição oferece, e o tamanho do que ainda falta trazer.
 *
 * Os dois números aparecem juntos porque eles respondem perguntas diferentes:
 * `pecas` é o que dá para escolher HOJE; `naBiblioteca` é o que a conta tem. A
 * distância entre eles é exatamente o botão de importar.
 */
export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "marketing.biblioteca-de-midia" });
  if (!limite.ok) return limite.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;
  if (!LIDERANCA.has(papelDe(identidade.access))) {
    return apiError("FORBIDDEN", "A biblioteca de mídia da conta pertence à liderança comercial.", identidade.meta, {
      status: 403,
      headers: limite.headers,
    });
  }

  const pedida = texto(request.nextUrl.searchParams.get("contaId"));
  const contaId = normalizarConta(pedida || texto(process.env.META_AD_ACCOUNT_ID));
  const temConta = contaId !== "act_";

  const [ativos, biblioteca] = await Promise.all([
    lerAtivosDaBiblioteca(identidade.access.organization.id),
    temConta ? lerBiblioteca(contaId, true) : Promise.resolve(null),
  ]);

  if (!ativos.ok) {
    return apiError("CREATIVE_ASSETS_UNAVAILABLE", `Não foi possível ler as peças do CRM: ${ativos.erro}`, identidade.meta, {
      status: 503,
      headers: limite.headers,
    });
  }

  // A lista é filtrada pela conta: um `image_hash` só vale dentro da conta que
  // o hospeda. Oferecer o hash de outra conta é oferecer um criativo recusado.
  const pecas = temConta ? ativos.pecas.filter((p) => normalizarConta(p.contaId) === contaId) : ativos.pecas;

  const naBiblioteca = biblioteca ? totalDePecas(biblioteca) : null;
  const erros = biblioteca
    ? errosDaLeitura(biblioteca)
    : [temConta
      ? "META_ADS_ACCESS_TOKEN ausente no servidor — a biblioteca da conta não foi lida"
      : "nenhuma conta de anúncios escolhida (META_AD_ACCOUNT_ID vazio e nenhuma conta na chamada)"];

  // Quantas peças a Meta tem e o CRM não registrou. `null` quando a leitura não
  // foi completa — subtrair de um total desconhecido produziria um número com
  // cara de medida.
  const daBiblioteca = biblioteca ? pecasDaBiblioteca(biblioteca) : null;
  const naoImportadas = daBiblioteca
    ? daBiblioteca.filter((p) => !ativos.chaves.has(chaveDaPeca(contaId, p.referencia))).length
    : null;

  return apiSuccess(
    {
      contaId: temConta ? contaId : null,
      pecas,
      naBiblioteca,
      naoImportadas,
      erros,
      /** Recorte dito em voz alta: lista truncada em silêncio parece lista completa. */
      teto: { ativosLidos: TETO_DE_ATIVOS, pecasPorLeitura: TETO_DE_LEITURA },
      nota:
        "Importar copia para o CRM o hash/ID que a Meta já tem. Nada é enviado à Meta por aqui: subir peça é escrita na conta do dono.",
    },
    identidade.meta,
    { headers: limite.headers },
  );
}

/**
 * POST — importa a biblioteca da conta para `creative_assets`.
 *
 * Idempotente: só insere o que falta. Uma metade da leitura que falhe não
 * impede a outra de ser importada — o que ela impede é a conclusão "está tudo
 * aqui", e o resumo diz isso com todas as letras.
 */
export async function POST(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 10, windowMs: 60_000, scope: "marketing.biblioteca-de-midia.importar" });
  if (!limite.ok) return limite.response;
  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;
  if (!LIDERANCA.has(papelDe(identidade.access))) {
    return apiError("FORBIDDEN", "Importar a biblioteca de mídia pertence à liderança comercial.", identidade.meta, {
      status: 403,
      headers: limite.headers,
    });
  }

  let corpo: { contaId?: unknown } = {};
  try {
    corpo = (await request.json()) as { contaId?: unknown };
  } catch {
    // Corpo vazio é uso legítimo: importar a conta padrão do servidor.
    corpo = {};
  }

  const contaId = normalizarConta(texto(corpo.contaId) || texto(process.env.META_AD_ACCOUNT_ID));
  if (contaId === "act_") {
    return apiError("META_ACCOUNT_MISSING", "Escolha a conta de anúncios: nenhuma foi informada e META_AD_ACCOUNT_ID está vazio.", identidade.meta, {
      status: 422,
      headers: limite.headers,
    });
  }

  // Leitura VIVA, sem cache: importar é ato deliberado, e quem clica acabou de
  // subir a peça no Gerenciador de Anúncios. Servir 5 minutos de cache aqui
  // devolveria "nada novo" para a peça que a pessoa está vendo na outra aba.
  const biblioteca = await lerBiblioteca(contaId, false);
  if (!biblioteca) {
    return apiError("META_UNREACHABLE", "META_ADS_ACCESS_TOKEN ausente no servidor — não há como ler a biblioteca da conta.", identidade.meta, {
      status: 503,
      headers: limite.headers,
    });
  }

  const erros = errosDaLeitura(biblioteca);
  const lidas = [...(biblioteca.imagens.pecas ?? []), ...(biblioteca.videos.pecas ?? [])];
  if (erros.length === 2) {
    return apiError("META_UNREACHABLE", `A Meta não respondeu a nenhum lado da biblioteca. ${erros.join(" · ")}`, identidade.meta, {
      status: 503,
      headers: limite.headers,
    });
  }

  const ativos = await lerAtivosDaBiblioteca(identidade.access.organization.id);
  if (!ativos.ok) {
    return apiError("CREATIVE_ASSETS_UNAVAILABLE", `Não foi possível ler as peças já registradas: ${ativos.erro}`, identidade.meta, {
      status: 503,
      headers: limite.headers,
    });
  }

  const plano = planejarImportacao(lidas, ativos.chaves, {
    organizationId: identidade.access.organization.id,
    contaId,
    createdBy: identidade.access.profile.id,
    agoraIso: new Date().toISOString(),
  });

  const gravacao = await gravarPecasImportadas(plano.linhas);
  if (!gravacao.ok) {
    // A mensagem do banco viaja inteira de propósito: foi um 23503 mudo em
    // `campaign_id` que manteve esta tabela com zero linhas por meses.
    return apiError("CREATIVE_ASSETS_INSERT_FAILED", `O banco recusou a gravação: ${gravacao.erro}`, identidade.meta, {
      status: 500,
      headers: limite.headers,
    });
  }
  const importadas = gravacao.gravadas;

  const resumo = resumirImportacao(plano, { naBiblioteca: totalDePecas(biblioteca), erros });

  return apiSuccess(
    {
      contaId,
      importadas,
      resumo,
      descartadas: plano.descartadas,
      semEndereco: plano.semEndereco,
      jaRegistradas: plano.jaRegistradas.length,
      nota: "Nada foi enviado, criado ou ativado na Meta. A importação só copiou para o CRM o que a conta já tinha.",
    },
    identidade.meta,
    { status: importadas ? 201 : 200, headers: limite.headers },
  );
}
