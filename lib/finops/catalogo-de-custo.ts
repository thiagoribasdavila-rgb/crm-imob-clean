/**
 * CATÁLOGO DE CUSTO — a lista DECLARADA de tudo que esta operação paga.
 *
 * ── POR QUE O CATÁLOGO É SEPARADO DA MEDIÇÃO ─────────────────────────────────
 *
 * Um painel de custos só é honesto se souber o que NÃO consegue medir. E ele só
 * sabe isso se alguém escreveu a lista completa do que existe — inclusive as
 * linhas que o banco jamais vai conhecer, como a nota fiscal da Hostinger.
 *
 * Se a lista fosse derivada do que o banco tem, o painel só enxergaria o que
 * consegue medir, e a soma pareceria completa. É a mesma doença de
 * `/api/ready`, que publicava `smtp: "via-supabase-auth"` a partir de uma
 * checagem do BANCO: um status que nunca podia ficar vermelho porque não media
 * o assunto de que falava.
 *
 * Portanto: a lista é DECLARADA aqui e a medição é tentada por cima. Item
 * declarado sem medição aparece como "não medido" com motivo — nunca como zero,
 * nunca como estimativa.
 *
 * ── COMO MANTER ──────────────────────────────────────────────────────────────
 *
 * Ao contratar qualquer serviço novo, acrescente a linha AQUI, mesmo (e
 * principalmente) se não houver como medi-la. Uma linha não medida declarada
 * derruba a cobertura do painel e aparece na tela — que é o comportamento
 * desejado. Uma linha esquecida é gasto invisível.
 */

/** Como a medição do custo desta linha pode acontecer, se puder. */
export type CaminhoDeMedicao =
  /** O Postgres canônico tem os dados. */
  | "banco"
  /** A API de gestão do provedor responde. */
  | "api_de_gestao"
  /** Só existe fora do sistema: fatura, e-mail, painel do fornecedor. */
  | "fora_do_sistema";

export type ItemDoCatalogo = {
  chave: string;
  rotulo: string;
  servico: string;
  /** O que esta linha paga, em uma frase. */
  oQuePaga: string;
  caminho: CaminhoDeMedicao;
  /**
   * Se `caminho` é `fora_do_sistema`, este é o MOTIVO que vai para a tela no
   * lugar do número. Escreva-o para um humano: ele é a justificativa de por que
   * o painel não cobre 100%.
   */
  porQueNaoDaParaMedir?: string;
};

/**
 * As linhas que o dono pediu em §8, uma a uma, com o veredito de medibilidade
 * apurado no ambiente real em 2026-07-30.
 *
 * IA, banco e armazenamento têm caminho de medição. Hospedagem, domínio, preço
 * de mensagem e preço de mapa NÃO TÊM — e é por isso que estão escritos aqui.
 */
export const CATALOGO_DE_CUSTO: readonly ItemDoCatalogo[] = [
  {
    chave: "ia",
    rotulo: "Inteligência artificial (tokens)",
    servico: "provedores de LLM",
    oQuePaga: "tokens de entrada e saída consumidos por chamada de IA",
    caminho: "banco",
  },
  {
    chave: "banco",
    rotulo: "Banco de dados (Supabase Postgres)",
    servico: "Supabase",
    oQuePaga: "assinatura do projeto Postgres gerenciado",
    caminho: "api_de_gestao",
  },
  {
    chave: "armazenamento",
    rotulo: "Armazenamento de arquivos (Supabase Storage)",
    servico: "Supabase",
    oQuePaga: "bytes guardados em buckets, dentro da mesma assinatura do projeto",
    caminho: "api_de_gestao",
  },
  {
    chave: "mensagens",
    rotulo: "Mensagens (WhatsApp)",
    servico: "WhatsApp",
    oQuePaga: "envio e recebimento de mensagem ao cliente",
    caminho: "fora_do_sistema",
    porQueNaoDaParaMedir:
      "o preço por mensagem/conversa não existe em nenhuma tabela deste banco. A Meta cobra por janela de conversa, com faixa que varia por país e categoria, e a fatura não é lida por nenhuma integração daqui. O VOLUME é medido; o PREÇO não. Publicar R$ 0,00 aqui afirmaria que WhatsApp é de graça.",
  },
  {
    chave: "mapas",
    rotulo: "Mapas e geocodificação",
    servico: "nenhum",
    oQuePaga: "chamadas a provedor de mapa/geocodificação",
    caminho: "banco",
  },
  {
    chave: "hospedagem",
    rotulo: "Hospedagem da aplicação (Hostinger)",
    servico: "Hostinger",
    oQuePaga: "servidor onde a aplicação e a ponte de WhatsApp rodam",
    caminho: "fora_do_sistema",
    porQueNaoDaParaMedir:
      "o valor da fatura da Hostinger não está no banco nem em variável de ambiente, e não há integração com a API de faturamento dela. É custo real e recorrente, e conhecido apenas pelo dono. Enquanto ele não for declarado, o total do painel está incompleto por baixo.",
  },
  {
    chave: "dominio",
    rotulo: "Domínio e certificado",
    servico: "registrador de domínio",
    oQuePaga: "registro anual do domínio e emissão de certificado",
    caminho: "fora_do_sistema",
    porQueNaoDaParaMedir:
      "custo anual pago fora do sistema, sem integração de faturamento. Também não é possível ratear o valor anual por mês sem conhecer o valor — e rateio de valor desconhecido é estimativa.",
  },
] as const;

/**
 * O QUE FICA FORA DESTE PAINEL, DE PROPÓSITO — declarado para não parecer
 * esquecimento.
 *
 * §8 é o centro de custo de TECNOLOGIA. Verba de mídia é custo comercial: ela
 * não disputa o teto de R$ 0–250/mês de custo técnico adicional da Fase 1, e
 * misturá-la faria o teto estourar por motivo errado no primeiro anúncio.
 */
export const FORA_DO_ESCOPO = [
  {
    item: "Verba de mídia (Meta Ads e afins)",
    porque:
      "é custo comercial de aquisição, não custo técnico. Não disputa o teto da Fase 1. O CPL/CAC dessa verba já tem lugar próprio em lib/marketing/cost-report.ts.",
    ondeVive: "lib/marketing/cost-report.ts e a tabela public.marketing_spend",
  },
  {
    item: "Salários, comissões e prêmios",
    porque: "custo de pessoal, fora de qualquer leitura de infraestrutura.",
    ondeVive: "public.commission_rules e public.commission_events",
  },
] as const;
