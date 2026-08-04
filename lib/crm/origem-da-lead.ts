/**
 * A ORIGEM DE UMA LEAD, montada de uma vez só.
 *
 * ── O defeito que este módulo corrige ─────────────────────────────────────
 *
 * `app/api/v1/leads/[id]/route.ts` respondia `campaign: null` — CRAVADO. A lead
 * carregava `campaign_id` (UUID com FK para `marketing_campaigns`), a campanha
 * tinha nome, plataforma e gasto registrado, e a ficha mostrava "campanha: —".
 *
 * Medido em 03/08/2026 na organização: 28 leads têm `campaign_id` e as 8
 * campanhas cadastradas somam R$ 4.122 de gasto. Sete delas são "[Cia360]
 * Inside Smart". O corretor abria a lead sem saber de qual anúncio ela veio, e
 * o diretor não conseguia perguntar "quanto custou esta pessoa".
 *
 * ── POR QUE A ORIGEM TEM TRÊS CAMADAS, E NÃO UMA ─────────────────────────
 *
 * "De onde veio" é uma pergunta com três respostas empilhadas, e juntá-las numa
 * string só é como se perde a informação útil:
 *
 *   · CAMPANHA — a decisão de investimento (tem verba, tem nome de negócio)
 *   · ANÚNCIO/CONJUNTO — a peça criativa que a pessoa viu
 *   · FORMULÁRIO — a pergunta que ela respondeu, e a resposta que deu
 *
 * A resposta de qualificação é o dado mais valioso da lead — a pessoa DECLAROU
 * a intenção antes de qualquer corretor ligar — e mora só no evento da Meta.
 *
 * ── O QUE ESTE MÓDULO RECUSA A FAZER ─────────────────────────────────────
 *
 * Não inventa nome de campanha a partir do id. Se a campanha não está
 * cadastrada, `nome` fica nulo e `idExterno` mostra o número — dizer
 * "Campanha 120251064213360700" como se fosse nome batiza um dado que não
 * temos. E `null` aqui significa NÃO SEI: quem chama precisa distinguir "lead
 * sem campanha" de "não consegui ler a campanha", por isso `medido`.
 */

export type CampanhaDaLead = {
  /** UUID interno, quando a campanha está cadastrada. */
  id: string | null;
  /** Nome de negócio. `null` quando a campanha não está cadastrada. */
  nome: string | null;
  /** O id da Meta. É ele que aparece no Gerenciador de Anúncios. */
  idExterno: string | null;
  plataforma: string | null;
  status: string | null;
  /** Gasto acumulado registrado para esta campanha, em reais. `null` = não medido. */
  gasto: number | null;
};

export type OrigemDaLead = {
  /** O rótulo curto que a lista usa. Nunca vazio. */
  resumo: string;
  campanha: CampanhaDaLead | null;
  anuncioId: string | null;
  conjuntoId: string | null;
  formularioId: string | null;
  formularioNome: string | null;
  paginaId: string | null;
  /** "fb" | "ig" | null — de onde a pessoa clicou. */
  plataformaDeOrigem: string | null;
  /** Veio de post orgânico, não de anúncio. */
  organica: boolean | null;
  /** O que a pessoa RESPONDEU no formulário do anúncio. */
  respostasDoFormulario: Array<{ pergunta: string; resposta: string }>;
  /**
   * `false` quando alguma leitura FALHOU. Origem vazia com isto `true` é
   * ausência de verdade; com `false`, é cegueira — e a tela precisa dizer qual.
   */
  medido: boolean;
};

type LinhaDaCampanha = {
  id?: string | null;
  name?: string | null;
  external_campaign_id?: string | null;
  platform?: string | null;
  status?: string | null;
};

type LinhaDoEvento = {
  ad_id?: string | null;
  adset_id?: string | null;
  form_id?: string | null;
  page_id?: string | null;
  campaign_external_id?: string | null;
  payload?: unknown;
};

/** Campos do formulário que já viram coluna própria da lead — não repetir na ficha. */
const JA_ESTA_NA_FICHA = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone"]);

/** `qual_é_o_seu_objetivo_com_o_imóvel?` → `Qual é o seu objetivo com o imóvel?` */
export function humanizarPergunta(chave: string): string {
  const texto = String(chave ?? "").replace(/_/g, " ").trim();
  if (!texto) return "Pergunta sem nome";
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Monta a origem. PURA: recebe as linhas já lidas e decide — assim o contrato
 * testa a regra sem banco, e as três telas que precisam disto não divergem.
 */
export function montarOrigemDaLead(entrada: {
  fonteDaLead: string | null;
  campanha: LinhaDaCampanha | null;
  gastoDaCampanha: number | null;
  evento: LinhaDoEvento | null;
  nomeDoFormulario: string | null;
  /** `false` quando alguma consulta falhou. */
  medido: boolean;
}): OrigemDaLead {
  const c = entrada.campanha;
  const campanha: CampanhaDaLead | null = c
    ? {
        id: c.id ? String(c.id) : null,
        nome: c.name?.trim() || null,
        idExterno: c.external_campaign_id ? String(c.external_campaign_id) : null,
        plataforma: c.platform ?? null,
        status: c.status ?? null,
        gasto: entrada.gastoDaCampanha,
      }
    : entrada.evento?.campaign_external_id
      ? {
          // A campanha existe na Meta e NÃO está cadastrada aqui. Mostrar o
          // número é honesto; inventar um nome, não.
          id: null,
          nome: null,
          idExterno: String(entrada.evento.campaign_external_id),
          plataforma: "META",
          status: null,
          gasto: null,
        }
      : null;

  const payload = (entrada.evento?.payload ?? null) as
    | { platform?: string; is_organic?: boolean; field_data?: Array<{ name?: string; values?: string[] }> }
    | null;

  const respostas: Array<{ pergunta: string; resposta: string }> = [];
  for (const campo of payload?.field_data ?? []) {
    const chave = String(campo?.name ?? "").trim();
    if (!chave || JA_ESTA_NA_FICHA.has(chave.toLowerCase())) continue;
    const valor = (campo?.values ?? []).map((v) => String(v ?? "").trim()).filter(Boolean).join(", ");
    if (!valor) continue;
    respostas.push({ pergunta: humanizarPergunta(chave), resposta: valor });
  }

  // O resumo é o que cabe numa linha de lista. Ordem de preferência: nome da
  // campanha, nome do formulário, a fonte crua. Nunca vazio — "—" numa coluna
  // de origem faz o corretor achar que a lead não tem origem, quando o que
  // falta é o cadastro da campanha.
  const resumo =
    campanha?.nome ||
    entrada.nomeDoFormulario ||
    (campanha?.idExterno ? `Campanha ${campanha.idExterno}` : null) ||
    entrada.fonteDaLead ||
    "Origem não informada";

  return {
    resumo,
    campanha,
    anuncioId: entrada.evento?.ad_id ? String(entrada.evento.ad_id) : null,
    conjuntoId: entrada.evento?.adset_id ? String(entrada.evento.adset_id) : null,
    formularioId: entrada.evento?.form_id ? String(entrada.evento.form_id) : null,
    formularioNome: entrada.nomeDoFormulario,
    paginaId: entrada.evento?.page_id ? String(entrada.evento.page_id) : null,
    plataformaDeOrigem: payload?.platform ?? null,
    organica: typeof payload?.is_organic === "boolean" ? payload.is_organic : null,
    respostasDoFormulario: respostas,
    medido: entrada.medido,
  };
}
