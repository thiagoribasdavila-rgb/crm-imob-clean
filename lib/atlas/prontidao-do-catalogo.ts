/**
 * O CATÁLOGO SUSTENTA UMA CONVERSA DE VENDA?
 *
 * ── O FATO QUE ISTO TORNA VISÍVEL ───────────────────────────────────────────
 *
 * Medido no banco vivo em 2026-07-30, e não aparece em tela nenhuma:
 *
 *   developments ................. 4 linhas · price_min/price_max em 0 de 4
 *   development_typologies ....... 6 linhas · price_from/price_to em 0 de 6
 *                                  e as 6 são TODAS de um único empreendimento
 *   units · inventory_units · properties .......... 0 linhas
 *   developer_payment_flow_rules .................. 0 linhas
 *
 * Consequência medida: o motor de compatibilidade recomenda algo para **12 de
 * 482 leads**.
 *
 * ⚠ CORREÇÃO DE 2026-07-30 — a versão anterior deste comentário dizia que isso
 * NÃO era falta de resposta do cliente, e sim falta de preço na oferta. Estava
 * errado, e o erro custou horas de prioridade mal dirigida:
 *
 *   leads na organização ............................ 482
 *   com bairro DECLARADO (preferred_neighborhoods) ....  6
 *   vinculadas a um empreendimento .................. 192  (174 Inside Perdizes)
 *
 * `Bairro` é o critério de MAIOR peso do motor (18, decisivo) e está sem resposta
 * para 476 clientes porque o cliente nunca declarou. Preço de catálogo não
 * conserta isso. Prova viva: o Spin Mood recebeu preço, 30 unidades e bairro em
 * 2026-07-30, e a recomendação foi de 12 para **13** — não para 482.
 *
 * A inversão que este módulo nomeia é real, mas é de VÍNCULO, não de procura:
 *
 *   Perdizes .... 174 leads VINCULADAS ·  1 empreendimento · 0 tipologias
 *   Aclimação ...   0 vinculadas       ·  1 empreendimento · 6 tipologias
 *
 * O único empreendimento com catálogo completo é o único sem lead vinculada.
 *
 * ── POR QUE ISTO É BLOQUEIO, E NÃO MÉTRICA ──────────────────────────────────
 *
 * A central já tem uma fila de bloqueios — hoje alimentada só pela prontidão da
 * Meta — e ela existe para responder "o que impede a operação AGORA". Catálogo sem
 * preço impede mais que verba esgotada: sem verba o corretor trabalha o que já
 * entrou; sem preço ele não tem o que dizer a ninguém.
 *
 * A ordem da ação vem do VÍNCULO, não de uma promessa de totalidade: o bloqueio
 * nomeia o empreendimento com mais leads já vinculadas e sem preço, porque são
 * essas as leads cuja recomendação o preço destrava. Não é "cadastre preços",
 * que é conselho; é "este aqui, e são tantas leads".
 *
 * ⚠ Esta parágrafo dizia "preencher preço de UM empreendimento destrava 482 leads
 * de uma vez". Era falso e foi medido como falso: preço é um critério entre
 * catorze, e o de maior peso (`Bairro`, 18, decisivo) depende de o cliente
 * responder. Prometer totalidade aqui é o que mandou o dono para a tarefa errada.
 *
 * ── A FORMA É A QUE A CENTRAL JÁ DESENHA ────────────────────────────────────
 *
 * `{ codigo, gravidade, resumo, acao }` — idêntica à de
 * lib/meta/marketing/prontidao-derivada.ts, para a fiação ser uma linha e não um
 * conceito novo de tela. Módulo puro, sem `server-only`: um contrato precisa
 * conseguir chamá-lo com linhas de verdade.
 */

export type BloqueioDoCatalogo = {
  codigo:
    | "catalogo_sem_preco"
    | "vinculo_sem_oferta_cadastrada"
    | "estoque_sem_unidade"
    | "catalogo_nao_medido";
  gravidade: "critical" | "attention";
  resumo: string;
  acao: string;
};

export type EmpreendimentoMedido = {
  id: string;
  nome?: string | null;
  bairro?: string | null;
  temPreco: boolean;
  tipologias: number;
  tipologiasComPreco: number;
};

export type CatalogoMedido = {
  /** `null` quando a leitura FALHOU — diferente de `[]`, que é catálogo vazio. */
  empreendimentos: EmpreendimentoMedido[] | null;
  /** Unidades contáveis somadas (units + inventory_units + properties). `null` = não medido. */
  unidades: number | null;
  /**
   * Leads VINCULADAS a um empreendimento, agrupadas pelo bairro dele.
   * `null` = não medido.
   *
   * NÃO é bairro pedido pelo cliente. Vínculo vem da campanha de origem; pedido
   * vem de `preferred_neighborhoods`, que em 2026-07-30 existia em **6 de 482**
   * leads. Trocar um pelo outro faz o bloqueio prometer destravar 482 quando
   * destrava 13 — foi exatamente o que aconteceu, e o nome antigo do campo
   * (`demandaPorBairro`) era metade da causa.
   */
  leadsVinculadasPorBairro?: Record<string, number> | null;
};

/**
 * O caso que este projeto mais paga: ausência não declarada é indistinguível de
 * zero. Leitura que falhou NÃO pode virar "catálogo em ordem" — ela vira um
 * bloqueio próprio, que diz que não sabe.
 */
function naoMedido(): BloqueioDoCatalogo {
  return {
    codigo: "catalogo_nao_medido",
    gravidade: "attention",
    resumo: "Não foi possível ler o catálogo de empreendimentos.",
    acao: "Sem esta leitura, nada aqui afirma que existe preço cadastrado — nem que não existe.",
  };
}

/** Plural sem gambiarra de string, porque o texto vai para a tela do diretor. */
const contar = (n: number, um: string, muitos: string) => `${n} ${n === 1 ? um : muitos}`;

export function bloqueiosDoCatalogo(medido: CatalogoMedido): BloqueioDoCatalogo[] {
  if (medido.empreendimentos === null) return [naoMedido()];

  const bloqueios: BloqueioDoCatalogo[] = [];
  const empreendimentos = medido.empreendimentos;

  // Catálogo vazio é problema de cadastro, não de preço — e dizer "sem preço"
  // para quem não cadastrou empreendimento nenhum manda a pessoa ao lugar errado.
  if (empreendimentos.length === 0) {
    bloqueios.push({
      codigo: "catalogo_sem_preco",
      gravidade: "critical",
      resumo: "Nenhum empreendimento cadastrado.",
      acao: "Cadastre ao menos um empreendimento: sem catálogo, não existe o que oferecer a lead nenhuma.",
    });
    return bloqueios;
  }

  const comPreco = empreendimentos.filter(
    (e) => e.temPreco || e.tipologiasComPreco > 0,
  );

  if (comPreco.length === 0) {
    /**
     * O empreendimento a nomear é o de MAIS LEADS VINCULADAS, não o primeiro da
     * lista. Sem essa contagem, cai no que tem mais tipologias — cadastrar preço onde
     * já existe tipologia é menos trabalho que começar do zero.
     */
    const vinculadas = medido.leadsVinculadasPorBairro ?? null;
    const prioritario = [...empreendimentos].sort((a, b) => {
      const da = vinculadas?.[String(a.bairro ?? "")] ?? -1;
      const db = vinculadas?.[String(b.bairro ?? "")] ?? -1;
      return db - da || b.tipologias - a.tipologias;
    })[0];

    const quantos = vinculadas?.[String(prioritario.bairro ?? "")] ?? null;
    const alvo = prioritario.nome || prioritario.bairro || prioritario.id;

    bloqueios.push({
      codigo: "catalogo_sem_preco",
      gravidade: "critical",
      resumo:
        `Nenhum dos ${contar(empreendimentos.length, "empreendimento", "empreendimentos")} tem preço cadastrado. ` +
        "Sem preço, a compatibilidade não recomenda imóvel para lead nenhuma.",
      /**
       * O texto NÃO promete destravar o catálogo inteiro, e não chama vínculo de
       * procura. As duas promessas estavam aqui e as duas eram falsas: preço é um
       * critério entre catorze, e `Bairro` — o de maior peso — depende de o
       * cliente responder, não de o catálogo ser preenchido.
       */
      acao:
        quantos !== null && quantos > 0
          ? `Comece por ${alvo}: ${contar(quantos, "lead já está vinculada", "leads já estão vinculadas")} a ele. ` +
            "Vínculo é origem de campanha, não é bairro pedido pelo cliente — o preço destrava a " +
            "recomendação dessas leads, não a do catálogo inteiro."
          : `Comece por ${alvo}. Sem preço ele não entra em recomendação nenhuma, ` +
            "e com preço entra apenas para quem já tiver respondido os critérios decisivos.",
    });
  }

  /**
   * A INVERSÃO: bairro com leads VINCULADAS e sem oferta cadastrada, existindo ao
   * mesmo tempo um empreendimento cadastrado onde não há lead nenhuma. Isolado,
   * nenhum dos dois é notícia; juntos, dizem onde o cadastro deveria ter começado.
   *
   * O nome antigo deste bloqueio era `demanda_sem_oferta_cadastrada`, e o texto
   * dizia "N leads procuram X". Nenhuma das duas coisas era verdade: o número
   * conta vínculo de campanha, não pedido do cliente — que existia em 6 de 482
   * leads. O nome era metade da causa, então o nome mudou junto.
   */
  const vinculadas = medido.leadsVinculadasPorBairro;
  if (vinculadas) {
    const bairrosComOferta = new Set(
      empreendimentos
        .filter((e) => e.tipologias > 0)
        .map((e) => String(e.bairro ?? "").toLowerCase().trim())
        .filter(Boolean),
    );
    const vinculadoSemOferta = Object.entries(vinculadas)
      .filter(([bairro, n]) => n > 0 && !bairrosComOferta.has(bairro.toLowerCase().trim()))
      .sort((a, b) => b[1] - a[1])[0];

    const ofertaSemVinculo = empreendimentos.find(
      (e) => e.tipologias > 0 && (vinculadas[String(e.bairro ?? "")] ?? 0) === 0,
    );

    if (vinculadoSemOferta && ofertaSemVinculo) {
      bloqueios.push({
        codigo: "vinculo_sem_oferta_cadastrada",
        gravidade: "critical",
        resumo:
          `${contar(vinculadoSemOferta[1], "lead está vinculada", "leads estão vinculadas")} a ` +
          `${vinculadoSemOferta[0]} e não há tipologia cadastrada lá — enquanto ` +
          `${ofertaSemVinculo.nome || ofertaSemVinculo.bairro} tem o catálogo completo e nenhuma ` +
          "lead vinculada.",
        acao:
          `Cadastre as tipologias de ${vinculadoSemOferta[0]}: o esforço de cadastro está no lugar ` +
          "onde não há lead alguma.",
      });
    }
  }

  // Tipologia sem unidade contável: a tela pode dizer "disponível" sem saber.
  if (medido.unidades === 0 && empreendimentos.some((e) => e.tipologias > 0)) {
    bloqueios.push({
      codigo: "estoque_sem_unidade",
      gravidade: "attention",
      resumo: "Existem tipologias cadastradas e nenhuma unidade contável no estoque.",
      acao:
        "Sem unidade, disponibilidade não é afirmável: a compatibilidade marca o imóvel como " +
        "'ninguém contou', não como esgotado nem como disponível.",
    });
  }

  return bloqueios;
}
