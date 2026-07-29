/**
 * A DERIVAÇÃO da prontidão: das respostas cruas da Graph ao veredito.
 *
 * Mora fora de `campaign-readiness.ts` pelo mesmo motivo de
 * `regra-nunca-contatado.ts`: aquele arquivo começa com `import "server-only"`
 * e não pode ser importado por teste de node. E aqui isso não é detalhe — a
 * primeira versão deste código passou por contrato que só fazia grep, e o
 * mutation testing provou o ponto cego na hora: desligar o `if` que detecta
 * página desconhecida deixava a suíte VERDE, porque a string continuava no
 * arquivo, inalcançável.
 *
 * Aqui não entra rede: entram objetos, sai veredito. É o que permite exercitar
 * o caso que mais importa — "os anúncios publicam numa página que o CRM não
 * conhece" — sem depender da Meta estar no ar.
 */

export type BloqueioDeAquisicao = {
  codigo:
    | "conta_inativa"
    | "teto_esgotado"
    | "sem_campanha_ativa"
    | "pagina_desconhecida"
    | "formulario_nao_cadastrado"
    | "fonte_desativada"
    | "fonte_sem_empreendimento";
  gravidade: "critical" | "attention";
  resumo: string;
  acao: string;
};

export type FonteCadastrada = {
  form_id: string | null;
  page_id: string | null;
  active: boolean | null;
  development_id: string | null;
  name: string | null;
};

export type ProntidaoMedida = {
  medido: true;
  lidoEm: string;
  conta: { id: string; nome: string | null; ativa: boolean };
  verba: { tetoBrl: number | null; gastoBrl: number | null; restanteBrl: number | null; esgotado: boolean };
  campanhas: { total: number; ativas: number };
  anunciosAtivos: number;
  paginasEmUso: string[];
  formulariosEmUso: string[];
  bloqueios: BloqueioDeAquisicao[];
};

const centavosParaReais = (valor: unknown) => {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero / 100 : 0;
};

const brl = (valor: number | null) => (valor === null ? "—" : `R$ ${valor.toLocaleString("pt-BR")}`);

export function derivarProntidao(input: {
  contaId: string;
  lidoEm: string;
  conta: Record<string, unknown>;
  campanhas: Array<{ effective_status?: string }>;
  anuncios: Array<{ creative?: unknown }>;
  fontes: FonteCadastrada[];
}): ProntidaoMedida {
  const { conta } = input;
  const contaAtiva = Number(conta.account_status) === 1;
  const tetoBrl = conta.spend_cap ? centavosParaReais(conta.spend_cap) : null;
  const gastoBrl = conta.amount_spent !== undefined ? centavosParaReais(conta.amount_spent) : null;
  const restanteBrl = tetoBrl !== null && gastoBrl !== null ? Math.round((tetoBrl - gastoBrl) * 100) / 100 : null;
  const esgotado = restanteBrl !== null && tetoBrl !== null && tetoBrl > 0 && restanteBrl <= 0;

  const ativas = input.campanhas.filter((c) => c.effective_status === "ACTIVE");

  // O creative INTEIRO, varrido em qualquer profundidade: dependendo de como o
  // anúncio foi montado (Advantage+, catálogo, criativo dinâmico) o
  // lead_gen_form_id não está em object_story_spec.link_data. A primeira versão
  // do script que virou esta lib procurava num caminho só e concluiu "0
  // formulários" com 19 anúncios ativos usando um.
  const formulariosEmUso = new Set<string>();
  const paginasEmUso = new Set<string>();
  for (const anuncio of input.anuncios) {
    const texto = JSON.stringify(anuncio.creative ?? {});
    for (const achado of texto.matchAll(/"lead_gen_form_id":"?(\d+)"?/g)) formulariosEmUso.add(achado[1]);
    for (const achado of texto.matchAll(/"page_id":"?(\d+)"?/g)) paginasEmUso.add(achado[1]);
  }

  const porFormulario = new Map(input.fontes.filter((f) => f.form_id).map((f) => [String(f.form_id), f]));
  const paginasConhecidas = new Set(input.fontes.filter((f) => f.page_id).map((f) => String(f.page_id)));

  const bloqueios: BloqueioDeAquisicao[] = [];
  if (!contaAtiva) {
    bloqueios.push({
      codigo: "conta_inativa", gravidade: "critical",
      resumo: `A conta de anúncios não está ativa (status ${String(conta.account_status)}).`,
      acao: "Regularizar a conta no Gerenciador de Anúncios.",
    });
  }
  if (esgotado) {
    bloqueios.push({
      codigo: "teto_esgotado", gravidade: "critical",
      resumo: `Teto de gasto esgotado: ${brl(gastoBrl)} de ${brl(tetoBrl)}.`,
      acao: "Nenhuma campanha entrega enquanto o teto não subir.",
    });
  }
  if (!ativas.length && input.campanhas.length) {
    bloqueios.push({
      codigo: "sem_campanha_ativa", gravidade: "critical",
      resumo: `Nenhuma das ${input.campanhas.length} campanhas está no ar.`,
      acao: "Sem campanha ativa não entra lead nova, independente do CRM.",
    });
  }
  // A página pesa mais que o formulário: o webhook casa a fonte por page_id
  // ANTES de olhar o form_id. Página desconhecida = a lead chega e o CRM não
  // sabe de qual organização ela é — vai para meta_leads_sem_destino, e a tela
  // fica verde enquanto a verba é gasta.
  for (const pagina of paginasEmUso) {
    if (!paginasConhecidas.has(pagina)) {
      bloqueios.push({
        codigo: "pagina_desconhecida", gravidade: "critical",
        resumo: `Os anúncios ativos publicam na Página ${pagina}, que o CRM não conhece.`,
        acao: "Cadastrar a fonte e dar acesso ao System User — sem isso a lead paga não chega.",
      });
    }
  }
  for (const formulario of formulariosEmUso) {
    const fonte = porFormulario.get(formulario);
    if (!fonte) {
      bloqueios.push({
        codigo: "formulario_nao_cadastrado", gravidade: "critical",
        resumo: `O formulário ${formulario} está em uso e não existe em meta_lead_sources.`,
        acao: "Cadastrar a fonte com dono e empreendimento antes de liberar verba.",
      });
    } else if (!fonte.active) {
      bloqueios.push({
        codigo: "fonte_desativada", gravidade: "attention",
        resumo: `A fonte do formulário ${formulario}${fonte.name ? ` (${fonte.name})` : ""} está desativada.`,
        acao: "Reativar a fonte ou a lead fica represada.",
      });
    } else if (!fonte.development_id) {
      bloqueios.push({
        codigo: "fonte_sem_empreendimento", gravidade: "attention",
        resumo: `A fonte do formulário ${formulario}${fonte.name ? ` (${fonte.name})` : ""} não tem empreendimento vinculado.`,
        acao: "Vincular o empreendimento para a lead nascer com destino.",
      });
    }
  }

  return {
    medido: true,
    lidoEm: input.lidoEm,
    conta: { id: input.contaId, nome: typeof conta.name === "string" ? conta.name : null, ativa: contaAtiva },
    verba: { tetoBrl, gastoBrl, restanteBrl, esgotado },
    campanhas: { total: input.campanhas.length, ativas: ativas.length },
    anunciosAtivos: input.anuncios.length,
    paginasEmUso: [...paginasEmUso],
    formulariosEmUso: [...formulariosEmUso],
    bloqueios,
  };
}
