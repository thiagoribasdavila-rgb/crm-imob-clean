/**
 * O CAMINHO DE VOLTA DE CADA RECUSA DO PIPELINE.
 *
 * ── O problema ──────────────────────────────────────────────────────────────
 *
 * A rota recusava movimentações com frases que dizem o que aconteceu e não o
 * que fazer. Pior: oito recusas diferentes da RPC caíam todas na mesma frase,
 * "Atualize o Kanban e confira a etapa atual".
 *
 * Para metade delas isso é um beco. A lead que não é do corretor
 * (`pipeline_move_out_of_scope`) não muda de dono porque ele atualizou a tela —
 * ele atualiza, tenta de novo, recebe a mesma frase, e conclui que o CRM está
 * quebrado. O caminho verdadeiro ali é pedir a lead ao gestor, e ninguém disse.
 *
 * ── A régua ─────────────────────────────────────────────────────────────────
 *
 * Toda recusa carrega um `caminho`: o próximo passo concreto de quem está
 * olhando a tela. Nunca vazio. Se uma recusa nova não tiver saída óbvia, o
 * problema é a regra, não o texto — recusa sem saída é armadilha.
 *
 * ── Por que aqui e não na tela ──────────────────────────────────────────────
 *
 * A rota devolve a orientação junto com o erro. Assim o Copilot, o app e
 * qualquer integração recebem a mesma saída que o corretor vê — em vez de cada
 * cliente inventar a sua e elas divergirem (que é como nasceram os dois
 * caminhos que divergiram no `move.id`).
 */

/** O que a tela pode oferecer como botão junto da explicação. */
export type AcaoSugerida =
  | "atualizar"
  | "escolher-motivo"
  | "descrever-compra"
  /** Fechar exige o valor apurado — é ele que a CAPI devolve para a Meta. */
  | "informar-valor-da-venda"
  | "falar-com-gestor"
  | "tentar-de-novo";

export type Orientacao = {
  /** O que aconteceu, em uma frase, sem jargão de banco. */
  problema: string;
  /** O passo concreto que resolve. Nunca vazio. */
  caminho: string;
  acao?: AcaoSugerida;
};

/**
 * Exceções que a RPC `move_pipeline_lead` levanta, cada uma com sua saída.
 *
 * Vieram de `raise exception '...'` no Postgres e chegam como texto na mensagem
 * do erro. Mapear uma a uma é o que separa "o sistema recusou" de "faça isto".
 */
export const RECUSAS: Record<string, Orientacao> = {
  pipeline_move_out_of_scope: {
    problema: "Esta lead está com outra pessoa — ela não aparece na sua carteira.",
    caminho: "Atualizar não resolve: peça a transferência ao seu gestor ou ao diretor. Enquanto ela não for sua, o Atlas não deixa mover.",
    acao: "falar-com-gestor",
  },
  pipeline_lead_not_found: {
    problema: "A lead não foi encontrada nesta empresa.",
    caminho: "Ela pode ter sido removida ou movida para outra organização. Atualize a lista; se continuar sumida, avise o diretor.",
    acao: "atualizar",
  },
  pipeline_stage_conflict: {
    problema: "Outra pessoa moveu esta lead enquanto você olhava a tela.",
    caminho: "Atualize o Kanban para ver onde ela está agora e refaça a movimentação a partir de lá.",
    acao: "atualizar",
  },
  pipeline_stage_invalid: {
    problema: "A etapa de destino não existe no funil.",
    caminho: "Recarregue a página — a tela pode estar numa versão antiga do funil.",
    acao: "atualizar",
  },
  pipeline_buyer_reason_required: {
    problema: "Falta descrever o que pesou na compra.",
    caminho: "Escreva ao menos uma linha: projeto, região, preço, prazo, financiamento ou atendimento. É o que mostra onde perdemos negócio.",
    acao: "descrever-compra",
  },
  pipeline_undo_invalid: {
    problema: "Esta movimentação não pode ser desfeita.",
    caminho: "O desfazer só vale para a última movimentação da lead. Mova manualmente para a etapa correta.",
    acao: "atualizar",
  },
  pipeline_already_reversed: {
    problema: "Esta movimentação já foi desfeita uma vez.",
    caminho: "Desfazer de novo faria a lead ir e voltar sem registro do que houve. Mova manualmente para a etapa certa.",
    acao: "atualizar",
  },
  pipeline_undo_stale: {
    problema: "A lead se moveu depois desta movimentação.",
    caminho: "Desfazer agora pularia por cima do que veio depois. Atualize o Kanban e mova para a etapa certa.",
    acao: "atualizar",
  },
};

/** Recusas da própria rota, antes de chegar ao banco. */
export const RECUSAS_DA_ROTA: Record<string, Orientacao> = {
  DISCARD_REASON_REQUIRED: {
    problema: "Descarte sem motivo não ensina nada.",
    caminho: "Escolha um motivo no painel. Ele volta para a Meta como sinal e faz o anúncio parar de trazer leads parecidas.",
    acao: "escolher-motivo",
  },
  INVALID_DISCARD_REASON: {
    problema: "Esse motivo de descarte não existe na lista.",
    caminho: "Escolha um dos motivos do painel — a lista é fechada de propósito, para o relatório poder somar.",
    acao: "escolher-motivo",
  },
  SALE_VALUE_REQUIRED: {
    problema: "Falta o valor apurado da venda.",
    caminho: "Informe quanto a unidade foi vendida, em reais. É o valor do contrato, não o orçamento que o cliente declarou na qualificação.",
    acao: "informar-valor-da-venda",
  },
  SALE_VALUE_INVALID: {
    problema: "O valor informado não é um número válido em reais.",
    caminho: "Digite apenas números, sem letras e sem sinal negativo. Zero é aceito se a operação realmente não teve valor.",
    acao: "informar-valor-da-venda",
  },
  FOLLOWUP_REQUIRED: {
    problema: "Falta descrever o que pesou na compra.",
    caminho: "Escreva ao menos 10 caracteres: projeto, região, preço, prazo, financiamento ou atendimento.",
    acao: "descrever-compra",
  },
  LEAD_OR_STAGE_MISSING: {
    problema: "A tela não informou qual lead ou para qual etapa mover.",
    caminho: "Recarregue a página e tente de novo. Se repetir, avise o suporte com o nome da lead.",
    acao: "atualizar",
  },
  PIPELINE_STAGE_CONFLICT: {
    problema: "Outra pessoa moveu esta lead enquanto você olhava a tela.",
    caminho: "Atualize o Kanban para ver onde ela está agora e refaça a movimentação a partir de lá.",
    acao: "atualizar",
  },
  PIPELINE_AUDIT_FAILED: {
    problema: "A movimentação não pôde ser registrada no histórico, e foi desfeita.",
    caminho: "A lead continua onde estava — nada se perdeu. Tente de novo; se repetir, avise o suporte.",
    acao: "tentar-de-novo",
  },
  COPILOT_PIPELINE_CONFIRMATION_REQUIRED: {
    problema: "O Copilot sugeriu esta movimentação, mas ela precisa do seu aval.",
    caminho: "Confirme a sugestão na tela do Copilot. O Atlas não move lead por conta própria.",
  },
  RATE_LIMITED: {
    problema: "Muitas movimentações em poucos segundos.",
    caminho: "Espere alguns segundos e continue. O limite existe para uma tela travada não bagunçar o histórico.",
    acao: "tentar-de-novo",
  },
  PIPELINE_UNAVAILABLE: {
    problema: "O pipeline não pôde ser carregado agora.",
    caminho: "Tente novamente em alguns segundos. O Atlas já registrou a falha — nenhuma lead se perdeu, é só a leitura da tela.",
    acao: "tentar-de-novo",
  },
  LEAD_NOT_FOUND: {
    problema: "A lead não foi encontrada nesta empresa.",
    caminho: "Atualize a lista. Se continuar sumida, avise o diretor.",
    acao: "atualizar",
  },
};

/**
 * Recusas da checagem de acesso, que acontece ANTES de tudo.
 *
 * `requireLeadAccess` estoura por exceção, então estas nunca passavam pelo
 * caminho normal de recusa — chegavam ao corretor como texto cru, sem saída.
 * É o caso mais comum de todos: a lead que não é dele.
 */
export const RECUSAS_DE_ACESSO: Record<string, Orientacao> = {
  ESCOPO: {
    problema: "Esta lead está com outra pessoa — ela não aparece na sua carteira.",
    caminho: "Atualizar não resolve: peça a transferência ao seu gestor ou ao diretor. Enquanto ela não for sua, o Atlas não deixa mover.",
    acao: "falar-com-gestor",
  },
  SESSAO: {
    problema: "Sua sessão expirou.",
    caminho: "Entre de novo. O que você já registrou está salvo — nada se perdeu.",
  },
  ORGANIZACAO: {
    problema: "Seu usuário não está ligado a uma imobiliária.",
    caminho: "Só o diretor resolve isso, no cadastro de usuários. Avise-o antes de continuar.",
  },
};

/** Última linha de defesa: recusa sem mapa ainda assim aponta uma saída. */
const GENERICA: Orientacao = {
  problema: "A movimentação não foi aceita.",
  caminho: "Atualize o Kanban e confira em que etapa a lead está antes de tentar de novo.",
  acao: "atualizar",
};

/**
 * A orientação de uma recusa, pela mensagem do banco ou pelo código da rota.
 *
 * A mensagem do Postgres chega como texto livre (`raise exception`), por isso a
 * busca é por conteúdo: procurar a chave exata falharia com qualquer prefixo
 * que o driver acrescente.
 */
export function orientar(codigoOuMensagem: string | null | undefined): Orientacao {
  const texto = String(codigoOuMensagem ?? "");
  if (!texto) return GENERICA;
  if (RECUSAS_DA_ROTA[texto]) return RECUSAS_DA_ROTA[texto];
  for (const [chave, orientacao] of Object.entries(RECUSAS)) {
    if (texto.includes(chave)) return orientacao;
  }
  return GENERICA;
}

/**
 * Extrai a recusa do corpo que a rota devolveu.
 *
 * ── Por que isto virou função ───────────────────────────────────────────────
 *
 * Esta lógica morava dentro do `catch` da página. O contrato que a protegia
 * fazia `grep` por `payload.caminho` no arquivo — e um mutation test mostrou o
 * buraco: desligando o `if` que faz a leitura, o texto `payload.caminho`
 * continuava no arquivo (dentro do corpo do bloco), o grep casava, e a suíte
 * ficava VERDE com o caminho nunca chegando ao corretor.
 *
 * Fora da página, a regra pode ser exercitada de verdade: dá para chamar com um
 * corpo e conferir o que sai. Teste que roda a função não tem como confundir
 * "o texto está escrito" com "o comportamento acontece".
 */
export function extrairRecusa(payload: unknown): { erro: string; caminho: string | null; acao: AcaoSugerida | null } {
  const corpo = (payload && typeof payload === "object") ? payload as Record<string, unknown> : {};
  const erro = typeof corpo.error === "string" && corpo.error
    ? corpo.error
    : "A movimentação não foi confirmada. A lead permaneceu na etapa anterior.";
  const caminho = typeof corpo.caminho === "string" && corpo.caminho ? corpo.caminho : null;
  const acao = typeof corpo.acao === "string" ? corpo.acao as AcaoSugerida : null;
  return { erro, caminho, acao };
}

/**
 * A orientação para a mensagem de uma exceção de acesso.
 *
 * A mensagem é em português e livre (`requireLeadAccess` monta a frase), por
 * isso a busca é por palavra-chave — a mesma régua que o `authError` já usa
 * para escolher o status HTTP.
 */
export function orientarAcesso(mensagem: string): Orientacao | null {
  if (/escopo|carteira|não pertence/i.test(mensagem)) return RECUSAS_DE_ACESSO.ESCOPO;
  if (/sessão|token|autenticação/i.test(mensagem)) return RECUSAS_DE_ACESSO.SESSAO;
  if (/organização/i.test(mensagem)) return RECUSAS_DE_ACESSO.ORGANIZACAO;
  return null;
}

// ── PONTOS DE CONHECIMENTO DO FUNIL ────────────────────────────────────────
//
// O corretor herda 195 leads numa tela que ele nunca usou. Sem isto, "etapa"
// vira palpite: cada um decide o que "Qualificação" quer dizer e o funil deixa
// de medir a mesma coisa entre pessoas.
//
// Cada etapa responde duas perguntas: o que significa estar aqui, e o que
// precisa acontecer para sair. A segunda é a que faz a lead andar.

export type PontoDeConhecimento = {
  /** O que significa a lead estar nesta etapa. */
  significa: string;
  /** O que fazer para ela avançar. */
  paraAvancar: string;
};

export const GUIA_DAS_ETAPAS: Record<string, PontoDeConhecimento> = {
  novo: {
    significa: "Chegou do anúncio e ninguém falou com ela ainda.",
    paraAvancar: "Ligue ou mande WhatsApp. Quanto mais rápido, maior a chance — lead do Meta esfria em horas, não em dias.",
  },
  contato: {
    significa: "Você já tentou falar, mas ainda não sabe o que ela procura.",
    paraAvancar: "Descubra o essencial: para morar ou investir, região, e se já tem financiamento aprovado.",
  },
  qualificacao: {
    significa: "Você sabe o que ela quer e se ela tem como comprar.",
    paraAvancar: "Marque a visita. É o passo que mais separa quem compra de quem só olha.",
  },
  visita: {
    significa: "Visita marcada ou já feita.",
    paraAvancar: "Depois da visita, faça a proposta enquanto a impressão está fresca.",
  },
  proposta: {
    significa: "Proposta enviada, aguardando resposta.",
    paraAvancar: "Combine uma data para retornar. Proposta sem data de retorno é proposta esquecida.",
  },
  contrato: {
    significa: "Negócio fechado, em documentação.",
    paraAvancar: "Acompanhe assinatura e financiamento até a venda ser confirmada.",
  },
  ganho: {
    significa: "Venda confirmada.",
    paraAvancar: "Nada a fazer aqui — e esta é a etapa que ensina a Meta a procurar mais gente como esta.",
  },
  perdido: {
    significa: "Não vai comprar com a gente, e o motivo está registrado.",
    paraAvancar: "O motivo vira sinal para o anúncio parar de trazer leads parecidas. Por isso ele é obrigatório.",
  },
  comprou_outro: {
    significa: "Comprou, mas em outro lugar.",
    paraAvancar: "A descrição do que pesou é o que mostra onde perdemos — preço, prazo, projeto ou atendimento.",
  },
};

export function conhecimentoDaEtapa(etapa: string): PontoDeConhecimento | null {
  return GUIA_DAS_ETAPAS[etapa] ?? null;
}
