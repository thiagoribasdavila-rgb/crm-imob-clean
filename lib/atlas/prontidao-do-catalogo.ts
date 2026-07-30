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
 * 482 leads**. Não por falta de resposta do cliente — por falta de preço na
 * oferta.
 *
 * E a inversão é o que dói:
 *
 *   Perdizes .... 174 de demanda revelada ·  1 empreendimento · 0 tipologias
 *   Aclimação ...   0 de demanda           ·  1 empreendimento · 6 tipologias
 *
 * O único empreendimento com catálogo completo é o único que ninguém procura.
 *
 * ── POR QUE ISTO É BLOQUEIO, E NÃO MÉTRICA ──────────────────────────────────
 *
 * A central já tem uma fila de bloqueios — hoje alimentada só pela prontidão da
 * Meta — e ela existe para responder "o que impede a operação AGORA". Catálogo sem
 * preço impede mais que verba esgotada: sem verba o corretor trabalha o que já
 * entrou; sem preço ele não tem o que dizer a ninguém.
 *
 * A assimetria decide a ordem da ação: preencher preço de UM empreendimento
 * destrava 482 leads de uma vez; perguntar orçamento destrava um cliente por
 * ligação. Por isso o bloqueio nomeia o empreendimento com mais demanda e sem
 * preço — não "cadastre preços", que é conselho, mas "este aqui, e destrava tanto".
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
    | "demanda_sem_oferta_cadastrada"
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
  /** Demanda revelada por bairro, do que os leads pedem. `null` = não medido. */
  demandaPorBairro?: Record<string, number> | null;
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
     * O empreendimento a nomear é o de MAIOR demanda, não o primeiro da lista.
     * Sem a demanda medida, cai no que tem mais tipologias — cadastrar preço onde
     * já existe tipologia é menos trabalho que começar do zero.
     */
    const demanda = medido.demandaPorBairro ?? null;
    const prioritario = [...empreendimentos].sort((a, b) => {
      const da = demanda?.[String(a.bairro ?? "")] ?? -1;
      const db = demanda?.[String(b.bairro ?? "")] ?? -1;
      return db - da || b.tipologias - a.tipologias;
    })[0];

    const quantos = demanda?.[String(prioritario.bairro ?? "")] ?? null;
    const alvo = prioritario.nome || prioritario.bairro || prioritario.id;

    bloqueios.push({
      codigo: "catalogo_sem_preco",
      gravidade: "critical",
      resumo:
        `Nenhum dos ${contar(empreendimentos.length, "empreendimento", "empreendimentos")} tem preço cadastrado. ` +
        "Sem preço, a compatibilidade não recomenda imóvel para lead nenhuma.",
      acao:
        quantos !== null && quantos > 0
          ? `Comece por ${alvo}: ${contar(quantos, "lead procura", "leads procuram")} esse bairro. ` +
            "Preencher o preço de um empreendimento destrava todos os clientes de uma vez; " +
            "perguntar orçamento destrava um por ligação."
          : `Comece por ${alvo}. Preencher o preço de um empreendimento destrava todos os clientes ` +
            "de uma vez; perguntar orçamento destrava um por ligação.",
    });
  }

  /**
   * A INVERSÃO: bairro com demanda e sem oferta cadastrada, existindo ao mesmo
   * tempo um empreendimento cadastrado onde ninguém procura. Isolado, nenhum dos
   * dois é notícia; juntos, dizem onde o cadastro deveria ter começado.
   */
  const demanda = medido.demandaPorBairro;
  if (demanda) {
    const bairrosComOferta = new Set(
      empreendimentos
        .filter((e) => e.tipologias > 0)
        .map((e) => String(e.bairro ?? "").toLowerCase().trim())
        .filter(Boolean),
    );
    const procuradoSemOferta = Object.entries(demanda)
      .filter(([bairro, n]) => n > 0 && !bairrosComOferta.has(bairro.toLowerCase().trim()))
      .sort((a, b) => b[1] - a[1])[0];

    const ofertaSemProcura = empreendimentos.find(
      (e) => e.tipologias > 0 && (demanda[String(e.bairro ?? "")] ?? 0) === 0,
    );

    if (procuradoSemOferta && ofertaSemProcura) {
      bloqueios.push({
        codigo: "demanda_sem_oferta_cadastrada",
        gravidade: "critical",
        resumo:
          `${contar(procuradoSemOferta[1], "lead procura", "leads procuram")} ${procuradoSemOferta[0]} ` +
          `e não há tipologia cadastrada lá — enquanto ${ofertaSemProcura.nome || ofertaSemProcura.bairro} ` +
          "tem o catálogo completo e nenhuma procura.",
        acao: `Cadastre as tipologias de ${procuradoSemOferta[0]}: o esforço de cadastro está no lugar sem demanda.`,
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
