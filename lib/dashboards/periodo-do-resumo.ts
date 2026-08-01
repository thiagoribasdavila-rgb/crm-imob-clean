/**
 * PERÍODO DO RESUMO OPERACIONAL — a escolha sobrevive à navegação.
 *
 * ── O DEFEITO QUE ISTO FIXA (medido em 2026-07-29) ──────────────────────────
 *
 * `app/(crm)/reports/page.tsx` já alternava o recorte entre dia, semana, mês e
 * histórico, e o recorte já era REAL: `periodData` refaz VGV, forecast,
 * conversão, score médio, funil e fontes a partir do `created_at`. O que não
 * existia era MEMÓRIA. O estado nascia `useState("month")` e nada gravava a
 * escolha, então quem olhava "Hoje", abria uma lead e voltava, encontrava
 * "30 dias" outra vez.
 *
 * Dor pequena e diária: quem decide reescolhe o recorte a cada volta, e — pior —
 * lê números de 30 dias acreditando estar vendo o dia, porque a pastilha ativa
 * é discreta e a tela não avisa que o recorte foi embora.
 *
 * `docs/FINAL_PHASE_7_ROLE_DASHBOARDS.md` prometia isto por escrito desde a
 * Fase Final 7 — "O período escolhido permanece durante a sessão" — e a promessa
 * era decorativa. É a mesma classe do `?view=today` de `/activity`: contrato
 * publicado, comportamento ausente.
 *
 * ── POR QUE A LÓGICA MORA AQUI, E NÃO NA PÁGINA ─────────────────────────────
 *
 * Porque assim ela é EXECUTÁVEL por contrato. Enquanto a decisão de gravar
 * vivesse dentro de um `useEffect`, a única asserção possível seria procurar
 * texto no `.tsx` — e uma mutação que troque a guarda por `true` sobrevive a
 * qualquer busca textual, porque as palavras continuam na linha.
 * `periodoParaGravar` transforma a guarda em VALOR DE RETORNO: quebrá-la muda o
 * que a função devolve, e o contrato reprova ao rodar.
 *
 * ── UM VOCABULÁRIO, TRÊS CONSUMIDORES ──────────────────────────────────────
 *
 * `PERIODOS_DO_RESUMO` desenha as pastilhas, valida o valor lido do
 * sessionStorage e define o padrão. Uma lista só. Quando a lista de opções e a
 * lista aceita na validação são DUAS, elas divergem — e a divergência aparece
 * como tela vazia sem erro nenhum, que se lê como "não aconteceu nada".
 *
 * Este arquivo não importa nada de propósito: os contratos o carregam com
 * `stripTypeScriptTypes` numa data: URL, e qualquer import quebraria isso.
 */

/**
 * Chave versionada, e em sessionStorage — não localStorage.
 *
 * A promessa escrita é "permanece durante a SESSÃO". Recorte de relatório é
 * postura momentânea ("hoje eu estou olhando o dia"), não preferência de
 * usuário: sobreviver a semanas de navegador faria o diretor abrir o Atlas numa
 * segunda-feira olhando o recorte que escolheu para uma dúvida de sexta.
 * O `:v1` existe para que um vocabulário futuro possa ignorar o valor antigo em
 * vez de tentar interpretá-lo.
 */
export const DASHBOARD_PERIOD_KEY = "atlas:dashboard-period:v1";

/** O vocabulário fechado. Ordem = ordem das pastilhas na tela. */
export const PERIODOS_DO_RESUMO = ["day", "week", "month", "all"] as const;

export type PeriodoDoResumo = (typeof PERIODOS_DO_RESUMO)[number];

/**
 * O padrão quando NÃO HÁ escolha salva.
 *
 * Continua "month" porque era o comportamento já em produção antes desta
 * mudança, e porque é o único recorte com denominador nesta base. MEDIDO em
 * 2026-07-29 na homologação (`public.leads`, sem os arquivados):
 *
 *   1 dia: 0 · 7 dias: 280 · 30 dias: 406 · histórico: 470
 *
 * Abrir em "Hoje" mostraria conversão "—" e funil todo zerado num dia como
 * este, e zero exibido na abertura se lê como "a operação parou".
 *
 * Persistir NÃO é desculpa para trocar o padrão: quem nunca escolheu deve ver
 * exatamente o que via antes.
 */
export const PERIODO_PADRAO: PeriodoDoResumo = "month";

export function ehPeriodoDoResumo(valor: unknown): valor is PeriodoDoResumo {
  return typeof valor === "string" && (PERIODOS_DO_RESUMO as readonly string[]).includes(valor);
}

/**
 * O que veio do sessionStorage vira recorte — ou vira o padrão.
 *
 * Nada aqui confia no que estava gravado: chave ausente, string vazia, valor
 * de uma versão anterior do vocabulário e valor inventado à mão no DevTools
 * caem todos no padrão. Um recorte inválido que passasse adiante viraria
 * `days = null`/`undefined` mais tarde e recortaria a lista de um jeito que
 * ninguém pediu, sem mensagem de erro — o modo de falha mais caro que existe
 * numa tela de números.
 */
export function lerPeriodoSalvo(bruto: string | null | undefined): PeriodoDoResumo {
  if (typeof bruto !== "string") return PERIODO_PADRAO;
  const texto = bruto.trim();
  if (!ehPeriodoDoResumo(texto)) return PERIODO_PADRAO;
  return texto;
}

/**
 * A GUARDA DA HIDRATAÇÃO, como valor.
 *
 * Devolve `null` = NÃO GRAVE. É o que impede o defeito clássico deste padrão:
 * o efeito de gravação roda na primeira montagem, quando `period` ainda é o
 * padrão, e sobrescreve a escolha salva antes de o efeito de leitura recuperá-la.
 * O sintoma é exatamente "não persiste", com o código de persistência todo
 * presente e aparentemente correto.
 *
 * Também recusa valor fora do vocabulário: gravar lixo só adia o problema para
 * a próxima leitura.
 */
export function periodoParaGravar(periodo: unknown, hidratado: boolean): PeriodoDoResumo | null {
  if (!hidratado) return null;
  if (!ehPeriodoDoResumo(periodo)) return null;
  return periodo;
}

/**
 * A janela em dias. `null` = histórico inteiro, sem recorte.
 *
 * Mora aqui junto com o vocabulário porque é a prova de que a pastilha NÃO É
 * DECORAÇÃO: um seletor que troca de cor e não mexe em número nenhum é pior
 * que seletor nenhum — ele convence de que a leitura mudou.
 */
export function diasDoPeriodo(periodo: PeriodoDoResumo): number | null {
  if (periodo === "day") return 1;
  if (periodo === "week") return 7;
  if (periodo === "month") return 30;
  return null;
}

/**
 * A pergunta que o recorte faz de CADA linha.
 *
 * Data ausente ou impossível de interpretar fica FORA de qualquer janela
 * fechada, e DENTRO do histórico. É a escolha conservadora: contar uma linha
 * sem data como "aconteceu no período" inventaria movimento que ninguém pode
 * conferir, e é assim que uma conversão nasce alta sem nenhuma venda por trás.
 */
export function dentroDoPeriodo(
  periodo: PeriodoDoResumo,
  data: string | null | undefined,
  agoraMs: number,
): boolean {
  const dias = diasDoPeriodo(periodo);
  if (dias === null) return true;
  const marca = typeof data === "string" ? Date.parse(data) : Number.NaN;
  if (!Number.isFinite(marca)) return false;
  return marca >= agoraMs - dias * 86_400_000;
}
