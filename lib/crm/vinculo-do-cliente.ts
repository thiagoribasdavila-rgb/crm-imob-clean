/**
 * O VÍNCULO — em que ponto da relação comercial a pessoa está.
 *
 * ── DE ONDE ISTO VEIO ────────────────────────────────────────────────────────
 *
 * Era a única ideia própria da tela "Clientes 360" (`/customers`), que em
 * 2026-07-29 foi apagada: ela lia a MESMA tabela `leads` pela mesma função de
 * leitura (`readCompatibleCustomers` era um alias de `readCompatibleLeads` que
 * só trocava o rótulo da origem), e não tinha SLA, nem filtros, nem lote, nem
 * ordenação — mas tinha estes quatro segmentos, que valem.
 *
 * A regra mora aqui, e não dentro de uma rota, porque agora tem DOIS
 * consumidores (a rota de leads e a tela de leads) e porque a classe de defeito
 * mais cara deste repositório é a mesma verdade calculada em dois lugares que
 * divergem com o tempo. Sem `server-only`: assim o contrato executa a regra em
 * vez de fazer grep nela.
 */

export type VinculoDoCliente = "em_atendimento" | "compra_concluida" | "compra_externa" | "encerrado";

export const VINCULOS: readonly VinculoDoCliente[] = [
  "em_atendimento",
  "compra_concluida",
  "compra_externa",
  "encerrado",
] as const;

export const ROTULO_DO_VINCULO: Record<VinculoDoCliente, string> = {
  em_atendimento: "Em atendimento",
  compra_concluida: "Compra concluída",
  compra_externa: "Compra externa",
  encerrado: "Encerrado",
};

/**
 * Os status de armazenamento que compõem cada vínculo.
 *
 * Em maiúsculas E minúsculas porque a base tem as duas grafias — é o mesmo
 * cuidado que `terminalStorageStatuses` já toma na rota de leads. Escolher uma
 * só perderia metade dos registros de um dos lados.
 */
export const STATUS_DO_VINCULO: Record<VinculoDoCliente, readonly string[]> = {
  compra_concluida: ["ganho", "GANHO", "venda", "VENDA", "vendido", "VENDIDO"],
  compra_externa: ["comprou_outro", "COMPROU_OUTRO"],
  encerrado: ["perdido", "PERDIDO"],
  // "em atendimento" é o COMPLEMENTO dos outros três, não uma lista: qualquer
  // etapa nova do funil nasce em atendimento sem ninguém precisar lembrar de
  // cadastrá-la aqui. Listar as etapas abertas uma a uma foi como o filtro de
  // etapa deste CRM já esqueceu "negociação" uma vez.
  em_atendimento: [],
};

const semAcento = (valor: unknown) =>
  String(valor || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Todos os status que NÃO são "em atendimento" — usado para montar o filtro. */
export function statusForaDoAtendimento(): string[] {
  return [
    ...STATUS_DO_VINCULO.compra_concluida,
    ...STATUS_DO_VINCULO.compra_externa,
    ...STATUS_DO_VINCULO.encerrado,
  ];
}

/** Deriva o vínculo a partir do status gravado no lead. */
export function vinculoDoStatus(status: unknown): VinculoDoCliente {
  const valor = semAcento(status);
  if (["ganho", "venda", "vendido"].includes(valor)) return "compra_concluida";
  if (valor === "comprou_outro") return "compra_externa";
  if (valor === "perdido") return "encerrado";
  return "em_atendimento";
}

/** `true` quando o texto veio da URL e é um vínculo que sabemos aplicar. */
export function ehVinculoValido(valor: unknown): valor is VinculoDoCliente {
  return typeof valor === "string" && (VINCULOS as readonly string[]).includes(valor);
}
