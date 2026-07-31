/**
 * NÍVEIS DE AUTONOMIA (§7) — declaração executável, não documento.
 *
 * ── O que já existia, medido em 2026-07-30 ────────────────────────────────
 *
 * `lib/atlas/core-v2/event-contract.ts` tem `autonomyLevel: 0 | 1 | 2 | 3 | 4` e
 * exige aprovação humana a partir de 3. Existe e funciona — para EVENTOS.
 *
 * Faltavam três coisas:
 *   · o sexto nível (o 5, do PROIBIDO) não existia em lugar nenhum;
 *   · nenhum agente declarava o seu nível — o campo existia sem catálogo;
 *   · nada ligava nível a AÇÃO: o tipo aceitava nível 4 e a ação seguia.
 *
 * ── O nível 5 tem de ser INAPLICÁVEL, não proibido por escrito ────────────
 *
 * "Proibido autonomamente" escrito num README é uma sugestão. Aqui são duas
 * travas independentes:
 *
 *   1. O tipo `NivelDeclaravel` vai de 0 a 4. Declarar 5 é erro de compilação, e
 *      `validarCatalogo()` recusa o catálogo inteiro em tempo de execução — para
 *      o caso de o valor vir de JSON, onde o tipo não protege nada.
 *
 *   2. A CLASSE de ação do nível 5 é recusada em `avaliarAcaoDeAgente()`
 *      independentemente do nível declarado e MESMO COM aprovação registrada.
 *      Este é o ponto que importa: sem ele, bastaria um agente nível 4 com
 *      aprovação para apagar dado ou derrubar RLS — e a proibição do dono seria
 *      contornável pelo caminho normal, sem ninguém violar regra nenhuma.
 *
 * Módulo PURO: sem `server-only`, sem rede. O contrato o EXECUTA.
 */

import fs from "node:fs";
import path from "node:path";

/** O que um agente PODE declarar. O 5 não está aqui — é o ponto. */
export type NivelDeclaravel = 0 | 1 | 2 | 3 | 4;

/** O 5 existe como conceito para poder ser RECUSADO, não para ser usado. */
export const NIVEL_PROIBIDO = 5 as const;

export const NIVEIS: Record<0 | 1 | 2 | 3 | 4 | 5, { nome: string; significa: string }> = {
  0: { nome: "observação", significa: "Lê e registra. Não sugere, não escreve, não age." },
  1: { nome: "sugestão", significa: "Recomenda a um humano. Quem decide e executa é a pessoa." },
  2: { nome: "preparação", significa: "Prepara rascunho ou payload e DEIXA salvo. Nada sai." },
  3: { nome: "execução interna reversível", significa: "Grava dado interno que dá para desfazer. Nada sai para fora." },
  4: { nome: "execução externa com aprovação registrada", significa: "Age para fora (cliente, Meta, verba) SOMENTE com aprovação nomeada, datada e justificada." },
  5: { nome: "PROIBIDO autonomamente", significa: "Apagar dado, mudar permissão, retirar RLS, disparo em massa, prometer financiamento, garantir preço/estoque, ação irreversível. Nenhum nível autoriza, nenhuma aprovação libera." },
};

/**
 * A CLASSE DE AÇÃO DO NÍVEL 5 — as sete do dono, uma a uma.
 *
 * `porque` não é enfeite: quando a recusa chegar ao operador, ele precisa
 * entender por que um "sim" do gestor não resolveu.
 */
export const ACOES_PROIBIDAS_AUTONOMAMENTE = [
  { acao: "apagar_dado", porque: "Apagar é irreversível e não existe desfazer para o cliente que perdeu o histórico." },
  { acao: "mudar_permissao", porque: "Permissão é quem vê o quê. Agente que altera acesso pode se conceder acesso." },
  { acao: "retirar_rls", porque: "RLS é a cerca entre empresas. Retirá-la vaza dado de uma imobiliária para outra." },
  { acao: "disparo_em_massa", porque: "Disparo em massa queima base e número de WhatsApp de uma vez, e não dá para chamar de volta." },
  { acao: "prometer_financiamento", porque: "Aprovação de crédito é do banco. Prometer cria obrigação que a imobiliária não pode cumprir." },
  { acao: "garantir_preco_ou_estoque", porque: "Preço e estoque mudam por fora. Garantir gera venda que não existe e cliente enganado." },
  { acao: "acao_irreversivel", porque: "Sem caminho de volta não há Shadow Mode possível: o erro já aconteceu quando alguém percebe." },
] as const;

export type AcaoProibida = (typeof ACOES_PROIBIDAS_AUTONOMAMENTE)[number]["acao"];

const PROIBIDAS = new Set<string>(ACOES_PROIBIDAS_AUTONOMAMENTE.map((item) => item.acao));

export function ehAcaoProibidaAutonomamente(acao: string): boolean {
  return PROIBIDAS.has(String(acao || "").trim().toLowerCase());
}

export function porqueEhProibida(acao: string): string | null {
  const nome = String(acao || "").trim().toLowerCase();
  return ACOES_PROIBIDAS_AUTONOMAMENTE.find((item) => item.acao === nome)?.porque ?? null;
}

export type AgenteDeclarado = { agente: string; nivel: NivelDeclaravel; porque: string };

/**
 * Aprovação registrada. Os três campos são obrigatórios de propósito: aprovação
 * sem QUEM, QUANDO e POR QUÊ é a assinatura em branco que o dono não pediu.
 * Mesma forma de `humanApproval` em core-v2/event-contract.ts — divergir criaria
 * duas noções de "aprovado" no mesmo produto.
 */
export type AprovacaoRegistrada = { approvedBy: string; approvedAt: string; reason: string };

function ehDataIso(valor: unknown) {
  return typeof valor === "string" && Boolean(valor) && !Number.isNaN(Date.parse(valor));
}

export function aprovacaoValida(aprovacao: AprovacaoRegistrada | null | undefined): boolean {
  if (!aprovacao) return false;
  return Boolean(
    typeof aprovacao.approvedBy === "string" && aprovacao.approvedBy.trim() &&
    ehDataIso(aprovacao.approvedAt) &&
    typeof aprovacao.reason === "string" && aprovacao.reason.trim(),
  );
}

let cacheDoCatalogo: AgenteDeclarado[] | null | undefined;

type ProblemaDeCatalogo = { agente: string; problema: string };

/**
 * Valida a declaração vinda do JSON, onde o tipo TypeScript não protege nada.
 *
 * Recusa nível 5 explicitamente e nível fora de 0..4 — inclusive 6, 4.5 e
 * "quatro". Um catálogo com uma entrada inválida é recusado INTEIRO: aceitar as
 * boas e ignorar a ruim faria o agente da linha ruim rodar sem nível declarado,
 * que é pior que não ter catálogo.
 */
export function validarCatalogo(bruto: unknown): { agentes: AgenteDeclarado[]; problemas: ProblemaDeCatalogo[] } {
  const problemas: ProblemaDeCatalogo[] = [];
  const agentes: AgenteDeclarado[] = [];
  if (!Array.isArray(bruto)) return { agentes, problemas: [{ agente: "(catálogo)", problema: "catálogo de agentes ausente ou não é lista" }] };

  for (const item of bruto) {
    const linha = (item ?? {}) as Record<string, unknown>;
    const agente = String(linha.agente ?? "").trim();
    if (!agente) {
      problemas.push({ agente: "(sem nome)", problema: "entrada sem nome de agente" });
      continue;
    }
    const nivel = linha.nivel;
    if (nivel === NIVEL_PROIBIDO) {
      problemas.push({
        agente,
        problema: `declara nível ${NIVEL_PROIBIDO}, que é a classe do PROIBIDO autonomamente. Nenhum agente pode declará-lo: as ações do nível 5 são recusadas mesmo com aprovação. Declare 0..4 e leve a ação para aprovação humana.`,
      });
      continue;
    }
    if (typeof nivel !== "number" || !Number.isInteger(nivel) || nivel < 0 || nivel > 4) {
      problemas.push({ agente, problema: `nível inválido (${String(nivel)}) — só 0, 1, 2, 3 ou 4 são declaráveis.` });
      continue;
    }
    const porque = String(linha.porque ?? "").trim();
    if (!porque) {
      // Mesma doutrina de config/workers-schedule.json: sem `porque`, ninguém
      // revisou o nível, e nível não revisado é nível que cresce sozinho.
      problemas.push({ agente, problema: "nível sem `porque` — justificativa é obrigatória." });
      continue;
    }
    agentes.push({ agente, nivel: nivel as NivelDeclaravel, porque });
  }
  return { agentes, problemas };
}

/** O catálogo em vigor. Catálogo com problema devolve LISTA VAZIA — ver `nivelDoAgente`. */
export function catalogoDeAgentes(): AgenteDeclarado[] {
  if (cacheDoCatalogo !== undefined) return cacheDoCatalogo ?? [];
  try {
    const caminho = path.join(import.meta.dirname, "..", "..", "config", "orcamento-e-autonomia-da-ia.json");
    const arquivo = JSON.parse(fs.readFileSync(caminho, "utf8")) as { agentes?: { catalogo?: unknown } };
    const { agentes, problemas } = validarCatalogo(arquivo?.agentes?.catalogo);
    cacheDoCatalogo = problemas.length ? null : agentes;
  } catch {
    cacheDoCatalogo = null;
  }
  return cacheDoCatalogo ?? [];
}

export function problemasDoCatalogo(): ProblemaDeCatalogo[] {
  try {
    const caminho = path.join(import.meta.dirname, "..", "..", "config", "orcamento-e-autonomia-da-ia.json");
    const arquivo = JSON.parse(fs.readFileSync(caminho, "utf8")) as { agentes?: { catalogo?: unknown } };
    return validarCatalogo(arquivo?.agentes?.catalogo).problemas;
  } catch (erro) {
    return [{ agente: "(catálogo)", problema: `não foi possível ler a declaração: ${erro instanceof Error ? erro.message : String(erro)}` }];
  }
}

export function esquecerCatalogoEmCache() {
  cacheDoCatalogo = undefined;
}

/**
 * O nível de um agente. AGENTE NÃO DECLARADO É NÍVEL 0.
 *
 * Falha fechada de verdade: o agente novo que ninguém cadastrou nasce apenas
 * observando. O contrário — assumir um nível permissivo por omissão — faria todo
 * agente novo poder agir para fora antes de qualquer revisão, e a declaração de
 * nível viraria opcional na prática.
 */
export function nivelDoAgente(agente: string): NivelDeclaravel {
  const nome = String(agente || "").trim().toLowerCase();
  const encontrado = catalogoDeAgentes().find((item) => item.agente.toLowerCase() === nome);
  return encontrado ? encontrado.nivel : 0;
}

export type VeredictoDeAutonomia = {
  permitido: boolean;
  nivel: NivelDeclaravel;
  nivelExigido: 0 | 1 | 2 | 3 | 4 | 5;
  /** Verdade quando a recusa é da classe do nível 5. */
  proibidaAutonomamente: boolean;
  exigeAprovacao: boolean;
  aprovacaoRecebida: boolean;
  motivo: string;
};

/**
 * Nível mínimo que cada tipo de ação exige. Ação desconhecida exige 4:
 * um verbo que ninguém classificou pode muito bem ser externo, e presumir
 * "interno e reversível" para o que não se conhece é o erro barato de cometer.
 */
const NIVEL_EXIGIDO: Record<string, 0 | 1 | 2 | 3 | 4> = {
  observar: 0,
  registrar_observacao: 0,
  pontuar: 0,
  recomendar: 1,
  sugerir: 1,
  explicar: 1,
  preparar_rascunho: 2,
  preparar_mensagem: 2,
  preparar_apresentacao: 2,
  gravar_interno_reversivel: 3,
  mover_etapa: 3,
  criar_tarefa: 3,
  enviar_mensagem: 4,
  redistribuir_lead: 4,
  iniciar_campanha: 4,
  alterar_condicao_comercial: 4,
  alterar_verba: 4,
};

export function nivelExigidoPor(acao: string): 0 | 1 | 2 | 3 | 4 | 5 {
  const nome = String(acao || "").trim().toLowerCase();
  if (ehAcaoProibidaAutonomamente(nome)) return NIVEL_PROIBIDO;
  return NIVEL_EXIGIDO[nome] ?? 4;
}

/**
 * A AVALIAÇÃO. Puro: entra agente + ação + aprovação, sai veredicto.
 *
 * A ordem das travas é o que dá a garantia:
 *
 *   1º a classe do nível 5 — antes de olhar nível ou aprovação. Se fosse depois,
 *      um nível 4 aprovado passaria, e "proibido" seria só "difícil".
 *   2º o nível declarado contra o nível exigido pela ação.
 *   3º a aprovação registrada, obrigatória de 4 para cima.
 */
export function avaliarAcaoDeAgente(input: {
  agente: string;
  acao: string;
  aprovacao?: AprovacaoRegistrada | null;
  /** Só para teste e para o caminho em que o nível vem de fora do catálogo. */
  nivel?: NivelDeclaravel;
}): VeredictoDeAutonomia {
  const nivel = input.nivel ?? nivelDoAgente(input.agente);
  const nivelExigido = nivelExigidoPor(input.acao);
  const aprovacaoRecebida = aprovacaoValida(input.aprovacao);

  // 1º — a proibição absoluta. Nem nível, nem aprovação, nem os dois juntos.
  if (nivelExigido === NIVEL_PROIBIDO) {
    return {
      permitido: false,
      nivel,
      nivelExigido,
      proibidaAutonomamente: true,
      exigeAprovacao: false,
      aprovacaoRecebida,
      motivo:
        `"${input.acao}" é do nível 5 — proibido autonomamente. ${porqueEhProibida(input.acao) ?? ""} ` +
        `Aprovação registrada NÃO libera: leve a ação para um humano executar fora do agente.`,
    };
  }

  if (nivel < nivelExigido) {
    return {
      permitido: false,
      nivel,
      nivelExigido,
      proibidaAutonomamente: false,
      exigeAprovacao: nivelExigido >= 4,
      aprovacaoRecebida,
      motivo:
        `Agente "${input.agente}" está no nível ${nivel} (${NIVEIS[nivel].nome}) e "${input.acao}" exige nível ${nivelExigido} ` +
        `(${NIVEIS[nivelExigido].nome}). ${nivel === 0 && !catalogoDeAgentes().some((a) => a.agente.toLowerCase() === String(input.agente).toLowerCase()) ? "Este agente não está no catálogo — agente não declarado nasce no nível 0." : ""}`.trim(),
    };
  }

  if (nivelExigido >= 4 && !aprovacaoRecebida) {
    return {
      permitido: false,
      nivel,
      nivelExigido,
      proibidaAutonomamente: false,
      exigeAprovacao: true,
      aprovacaoRecebida: false,
      motivo:
        `"${input.acao}" age para fora e exige aprovação registrada com quem aprovou, quando e por quê. ` +
        `O agente "${input.agente}" tem nível ${nivel}, suficiente, mas a aprovação está ausente ou incompleta.`,
    };
  }

  return {
    permitido: true,
    nivel,
    nivelExigido,
    proibidaAutonomamente: false,
    exigeAprovacao: nivelExigido >= 4,
    aprovacaoRecebida,
    motivo: `Agente "${input.agente}" nível ${nivel} autorizado para "${input.acao}" (exige ${nivelExigido})${nivelExigido >= 4 ? `, com aprovação de ${input.aprovacao?.approvedBy}` : ""}.`,
  };
}
