/**
 * §8 CENTRO DE CUSTO DE TECNOLOGIA — a rota que mede, e que declara o que não mede.
 *
 * ── ONDE MONTAR ESTA ROTA NA INTERFACE ───────────────────────────────────────
 *
 * O componente é `components/atlas/CentroDeCustoTecnologico.tsx`. Ele DEVE ser
 * montado numa tela de liderança — a sugestão é `app/(crm)/reports/page.tsx`
 * (Relatórios), que já é território de diretor. Esta entrega NÃO edita tela
 * alguma: `app/(crm)/command-center/page.tsx` e `app/(crm)/leads/page.tsx` estão
 * em uso por outra frente (a oferta ativa do acervo) e mexer nelas colidiria.
 *
 * ── QUEM PODE LER ────────────────────────────────────────────────────────────
 *
 * Só liderança, e a definição de liderança NÃO é reescrita aqui: vem de
 * `leLiderancaInteira` em lib/crm/escopo-de-leitura.ts, o mesmo módulo que o
 * Kanban e a listagem de leads usam. Escrever um `new Set(["director",...])`
 * nesta rota criaria a segunda definição de liderança do produto, e a primeira
 * vez que isso aconteceu um corretor com carteira zero recebeu as 200 leads da
 * imobiliária.
 *
 * ── O QUE ESTA ROTA NÃO FAZ ──────────────────────────────────────────────────
 *
 * Não estima. Não converte com taxa chutada. Não soma "0" no lugar de ausência.
 * Antes de responder, ela submete o painel a `defeitosDaPublicacao()`; se algum
 * custo não medido estiver saindo como número, ela responde ERRO — melhor um
 * painel indisponível que um painel mentiroso. Essa é a asserção central da
 * frente e o contrato a executa.
 *
 * ── COORDENAÇÃO COM A FRENTE DE ORÇAMENTO DA IA ──────────────────────────────
 *
 * O consumo de IA NÃO é remedido aqui e nenhuma tabela nova foi criada. A fonte
 * é `public.ai_usage_events`, gravada por `recordUsage()` em
 * lib/ai/provider-router.ts — a MESMA tabela que a frente de orçamento da IA
 * (migration 20260730050000) instrumenta com a coluna `agent` e com
 * `private.consumo_de_ia_do_dia`. A função dela é do DIA; este painel é do MÊS.
 * Duas janelas, uma tabela.
 *
 * Esta rota NÃO depende daquela migration, de propósito. Quando o painel foi
 * medido, a coluna `agent` ainda não existia no banco canônico; ela chegou horas
 * depois, na mesma sessão. Ler só as colunas que existem desde 20260716223608 é o
 * que faz o painel funcionar dos dois lados dessa fronteira — e é o que impede
 * que a ORDEM de aplicação de duas frentes decida se o custo aparece ou não.
 */

import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { CATALOGO_DE_CUSTO, FORA_DO_ESCOPO } from "@/lib/finops/catalogo-de-custo";
import {
  DEFINICOES_DOS_DENOMINADORES,
  TETO_FASE_1_BRL,
  avaliarOrcamento,
  consumoMedido,
  consumoNaoMedido,
  converterParaBrl,
  custoMedido,
  custoNaoMedido,
  custoUnitario,
  defeitosDaPublicacao,
  linhaDeMensagens,
  linhasDeIa,
  projetarFechamentoDoMes,
  semServico,
  somarLinhas,
  vereditoDoTetoDaFase1,
  type ConsumoDaLinha,
  type CustoDaLinha,
  type EventoDeIa,
  type LinhaDeCusto,
  type PainelDeCusto,
} from "@/lib/finops/centro-de-custo";

export const dynamic = "force-dynamic";

/**
 * Teto de leitura de eventos de IA por resposta.
 *
 * Um total truncado NÃO é o total. Se a leitura bater neste teto, a linha de IA
 * vira NÃO MEDIDA com esse motivo, em vez de publicar a soma dos primeiros N —
 * que seria um número menor que o real, com cara de exato. É o mesmo princípio
 * do resto do arquivo aplicado a um limite técnico.
 */
const TETO_DE_EVENTOS_DE_IA = 5000;

const item = (chave: string) => CATALOGO_DE_CUSTO.find((linha) => linha.chave === chave)!;

export async function GET(request: NextRequest) {
  const limite = enforceRateLimit(request, { limit: 30, scope: "finops.cost-center" });
  if (!limite.ok) return limite.response;

  const identidade = await requireAccessContext(request);
  if (!identidade.ok) return identidade.response;

  const { profile, organization } = identidade.access;
  // A definição de liderança mora em UM lugar. Ver comentário do topo.
  if (!leLiderancaInteira({ commercialRole: profile.commercialRole, role: profile.role })) {
    return apiError(
      "FORBIDDEN",
      "O centro de custo de tecnologia é leitura de liderança. Peça a um diretor, superintendente ou gerente — ou peça ao diretor para ajustar seu papel comercial em Configurações › Usuários.",
      identidade.meta,
      { status: 403 },
    );
  }

  const admin = getSupabaseAdmin();
  const agora = new Date();
  const inicioDoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
  const diasNoMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).getUTCDate();
  const diasCorridos = agora.getUTCDate();
  const desde = inicioDoMes.toISOString();
  const org = organization.id;

  /* ── 1. CONSUMO DE IA, da tabela que já existe ──────────────────────────── */

  const eventosDeIa = await admin
    .from("ai_usage_events")
    .select("provider,model,total_tokens,estimated_cost_usd,pricing_source")
    .eq("organization_id", org)
    .gte("created_at", desde)
    .limit(TETO_DE_EVENTOS_DE_IA);

  const linhas: LinhaDeCusto[] = [];

  if (eventosDeIa.error) {
    linhas.push({
      chave: "ia",
      rotulo: item("ia").rotulo,
      servico: item("ia").servico,
      custo: custoNaoMedido(`a leitura de public.ai_usage_events falhou (${eventosDeIa.error.message}) — sem a tabela não há consumo a apurar`),
      consumo: consumoNaoMedido("leitura de public.ai_usage_events indisponível"),
    });
  } else if ((eventosDeIa.data?.length ?? 0) >= TETO_DE_EVENTOS_DE_IA) {
    linhas.push({
      chave: "ia",
      rotulo: item("ia").rotulo,
      servico: item("ia").servico,
      custo: custoNaoMedido(`mais de ${TETO_DE_EVENTOS_DE_IA} eventos de IA no período: a leitura foi truncada e um total truncado não é o total`),
      consumo: consumoNaoMedido(`leitura truncada em ${TETO_DE_EVENTOS_DE_IA} eventos`),
    });
  } else if (!eventosDeIa.data?.length) {
    linhas.push({
      chave: "ia",
      rotulo: item("ia").rotulo,
      servico: item("ia").servico,
      custo: custoMedido(0, "banco", "nenhum evento de IA gravado em public.ai_usage_events no período — sem chamada, não há token cobrável"),
      consumo: consumoMedido(0, "tokens", "banco", "contagem em public.ai_usage_events no período"),
    });
  } else {
    // A quebra por par (provedor, modelo) e a separação entre o precificado e o
    // sem tarifa vivem em `linhasDeIa`, módulo PURO — para o contrato poder
    // executá-la com os eventos reais em vez de raspar este arquivo.
    linhas.push(...linhasDeIa(eventosDeIa.data as EventoDeIa[]));
  }

  /* ── 2. INFRAESTRUTURA: consumo medido, preço não ───────────────────────── */

  const infra = await admin.rpc("finops_uso_de_infra");
  const usoDeInfra = Array.isArray(infra.data) ? (infra.data[0] as Record<string, unknown> | undefined) : undefined;

  const consumoDoBanco: ConsumoDaLinha = usoDeInfra
    ? consumoMedido(Number(usoDeInfra.banco_bytes ?? 0), "bytes", "banco", "pg_database_size() via public.finops_uso_de_infra()")
    : consumoNaoMedido(
        `public.finops_uso_de_infra() não respondeu (${infra.error?.message ?? "função ausente neste banco"}) — bytes de banco e de armazenamento ficam sem medição`,
      );
  const consumoDoArmazenamento: ConsumoDaLinha = usoDeInfra
    ? consumoMedido(Number(usoDeInfra.armazenamento_bytes ?? 0), "bytes", "banco", `soma de metadata->>'size' em ${Number(usoDeInfra.armazenamento_objetos ?? 0)} objeto(s) de storage, em ${Number(usoDeInfra.armazenamento_buckets ?? 0)} bucket(s)`)
    : consumoNaoMedido("public.finops_uso_de_infra() não respondeu");

  /**
   * O PLANO DO SUPABASE não é alcançável pelo produto: a API de gestão exige um
   * token de gestão, que esta aplicação não tem (e não deveria ter). Então o
   * plano é DECLARADO pelo operador em `ATLAS_SUPABASE_PLAN`.
   *
   * Medido fora do produto em 2026-07-30, pela API de gestão: a organização
   * `hhzcgjrfbyupsbzpqozv` está no plano `free`. E medido no ambiente:
   * `ATLAS_SUPABASE_PLAN` está AUSENTE — por isso o painel entregue hoje mostra
   * o banco como NÃO MEDIDO. Isso é a resposta certa: o produto não sabe.
   *
   * Declarar `ATLAS_SUPABASE_PLAN=free` faz a linha virar US$ 0,00 com
   * procedência auditável. Não declarar mantém o buraco visível. As duas coisas
   * são honestas; inventar "free" no código não seria — seria um status que nunca
   * poderia ficar vermelho quando o dono subisse de plano, e é exatamente o
   * defeito que `/api/ready` cometeu com o SMTP.
   */
  const planoDeclarado = String(process.env.ATLAS_SUPABASE_PLAN || "").trim().toLowerCase();
  const custoDoBanco: CustoDaLinha =
    planoDeclarado === "free"
      ? custoMedido(0, "tarifa_declarada", "plano declarado em ATLAS_SUPABASE_PLAN=free: a assinatura do projeto não é cobrada", "plano free = US$ 0,00/mês")
      : planoDeclarado
        ? custoNaoMedido(
            `ATLAS_SUPABASE_PLAN="${planoDeclarado}" é um plano pago e o valor da assinatura não está neste banco nem em variável de ambiente. Consulte a fatura do Supabase e declare o valor mensal.`,
          )
        : custoNaoMedido(
            "ATLAS_SUPABASE_PLAN não declarada: o produto não consegue perguntar o plano à API de gestão (exige token de gestão que ele não tem). Sem o plano, o valor da assinatura é desconhecido — não zero.",
          );

  linhas.push({
    chave: "banco",
    rotulo: item("banco").rotulo,
    servico: item("banco").servico,
    custo: custoDoBanco,
    consumo: consumoDoBanco,
  });

  linhas.push({
    chave: "armazenamento",
    rotulo: item("armazenamento").rotulo,
    servico: item("armazenamento").servico,
    // O armazenamento entra na mesma assinatura do projeto ATÉ a cota do plano.
    // A cota não está neste banco, então o excedente é desconhecido — e é o
    // excedente que cobra. Publicar 0 aqui afirmaria que não há como estourar.
    custo: custoNaoMedido(
      "está dentro da assinatura do projeto Supabase até a cota do plano, e a cota não é conhecida por este produto. O excedente — que é o que efetivamente cobra — é desconhecido. Consumo medido; preço por gigabyte acima da cota, não.",
    ),
    consumo: consumoDoArmazenamento,
  });

  /* ── 3. MENSAGENS: o volume é medido; o preço, não ──────────────────────── */

  const mensagens = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org)
    .gte("created_at", desde);

  // A regra dos dois lados — volume zero mede, volume acima de zero declara
  // preço desconhecido — mora em `linhaDeMensagens`, módulo puro, e o contrato
  // executa AS DUAS metades.
  linhas.push(
    linhaDeMensagens({
      volume: mensagens.error ? null : (mensagens.count ?? 0),
      erroDeLeitura: mensagens.error?.message ?? null,
      motivoDoPrecoDesconhecido: item("mensagens").porQueNaoDaParaMedir ?? "preço por mensagem não conhecido pelo produto",
      rotulo: item("mensagens").rotulo,
      servico: item("mensagens").servico,
    }),
  );

  /* ── 4. MAPAS: zero verdadeiro, com evidência que pode ficar vermelha ───── */

  linhas.push({
    chave: "mapas",
    rotulo: item("mapas").rotulo,
    servico: item("mapas").servico,
    // Esta é a única afirmação de ausência do painel, e ela NÃO é uma crença
    // congelada no código: `tests/contracts/centro-de-custo-tecnologico.test.mjs`
    // varre lib/, app/ e components/ e FICA VERMELHO se qualquer provedor de
    // mapa ou geocodificação aparecer. É a diferença entre "declaramos que não
    // usamos" e um status que nunca pode ficar vermelho.
    custo: semServico(
      "varredura_de_codigo",
      "nenhum provedor de mapa ou geocodificação é referenciado em lib/, app/ ou components/ — vigiado pelo contrato tests/contracts/centro-de-custo-tecnologico.test.mjs, que reprova se algum aparecer",
    ),
    consumo: consumoMedido(0, "chamadas de mapa", "varredura_de_codigo", "nenhuma integração de mapa existe no produto"),
  });

  /* ── 5. O QUE SÓ A FATURA SABE ──────────────────────────────────────────── */

  for (const chave of ["hospedagem", "dominio"] as const) {
    const declarado = item(chave);
    linhas.push({
      chave,
      rotulo: declarado.rotulo,
      servico: declarado.servico,
      custo: custoNaoMedido(declarado.porQueNaoDaParaMedir ?? "sem caminho de medição declarado"),
      consumo: consumoNaoMedido("não há telemetria deste item dentro do produto"),
    });
  }

  /* ── 6. DENOMINADORES ───────────────────────────────────────────────────── */

  const [leadsDoMes, atendimentosBrutos, vendasDoMes, usuariosAtivos] = await Promise.all([
    admin.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org).gte("created_at", desde),
    // Atendimento = lead DISTINTA tocada. As duas fontes de toque do produto
    // (timeline e movimentação de etapa) são unidas e deduplicadas por lead —
    // ver DEFINICOES_DOS_DENOMINADORES.atendimento.
    Promise.all([
      admin.from("lead_events").select("lead_id").eq("organization_id", org).gte("created_at", desde).limit(TETO_DE_EVENTOS_DE_IA),
      admin.from("pipeline_stage_moves").select("lead_id").eq("organization_id", org).gte("occurred_at", desde).limit(TETO_DE_EVENTOS_DE_IA),
    ]),
    admin.from("pipeline_stage_moves").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("to_stage", "ganho").gte("occurred_at", desde),
    admin.from("profiles").select("id", { count: "exact", head: true }).eq("organization_id", org).eq("active", true),
  ]);

  const leadsTocadas = new Set<string>();
  for (const resultado of atendimentosBrutos) {
    for (const linha of resultado.data ?? []) if (linha.lead_id) leadsTocadas.add(String(linha.lead_id));
  }

  /* ── 7. SOMA, CÂMBIO, PROJEÇÃO, ORÇAMENTO ───────────────────────────────── */

  const somatorio = somarLinhas(linhas);
  const totalBrl = converterParaBrl(somatorio.totalMedidoUsd, process.env.ATLAS_USD_BRL);
  const projecaoUsd = projetarFechamentoDoMes(somatorio.totalMedidoUsd, diasCorridos, diasNoMes, somatorio.cobertura);

  const unitarios = [
    { chave: "por_lead", rotulo: "Custo por lead", denominador: DEFINICOES_DOS_DENOMINADORES.lead, quantos: leadsDoMes.count ?? 0, nome: "lead(s)" },
    { chave: "por_atendimento", rotulo: "Custo por atendimento", denominador: DEFINICOES_DOS_DENOMINADORES.atendimento, quantos: leadsTocadas.size, nome: "atendimento(s)" },
    { chave: "por_venda", rotulo: "Custo por venda", denominador: DEFINICOES_DOS_DENOMINADORES.venda, quantos: vendasDoMes.count ?? 0, nome: "venda(s)" },
    { chave: "por_usuario", rotulo: "Custo por usuário", denominador: DEFINICOES_DOS_DENOMINADORES.usuario, quantos: usuariosAtivos.count ?? 0, nome: "usuário(s) ativo(s)" },
  ].map((u) => ({
    chave: u.chave,
    rotulo: u.rotulo,
    denominador: `${u.quantos} ${u.nome} — ${u.denominador}`,
    custo: custoUnitario(somatorio.totalMedidoUsd, u.quantos, u.nome, "total MEDIDO do período (parcial: ver cobertura)"),
  }));

  const alerta = avaliarOrcamento(
    totalBrl.estado === "medido" ? totalBrl.valorUsd : null,
    TETO_FASE_1_BRL.maximo,
    somatorio.fracaoCoberta,
    somatorio.chavesNaoMedidas.length,
  );

  const painel: PainelDeCusto = {
    geradoEm: agora.toISOString(),
    janela: { inicio: desde, fim: agora.toISOString(), diasCorridos, diasNoMes },
    plano: {
      provedor: "Supabase",
      plano: planoDeclarado || "não declarado",
      fonte: "tarifa_declarada",
      comoFoiMedido: planoDeclarado
        ? "declarado em ATLAS_SUPABASE_PLAN"
        : "ATLAS_SUPABASE_PLAN ausente — o produto não tem token de gestão para perguntar o plano ao Supabase",
    },
    linhas,
    somatorio,
    totalBrl,
    projecaoUsd,
    unitarios,
    orcamento: { tetoBrl: TETO_FASE_1_BRL, alerta, veredito: vereditoDoTetoDaFase1(alerta, somatorio.chavesNaoMedidas.length) },
  };

  /**
   * O PORTÃO. Se qualquer custo não medido estiver saindo como número, ou
   * qualquer número estiver saindo sem procedência, esta rota responde erro.
   *
   * Isso parece severo até você lembrar o que a alternativa produz: uma decisão
   * de verba tomada sobre um zero inventado. Painel indisponível é um problema
   * de operação; painel mentiroso é um problema de dinheiro.
   */
  const defeitos = defeitosDaPublicacao(painel);
  if (defeitos.length) {
    return apiError(
      "PAINEL_DE_CUSTO_REPROVADO",
      "O painel de custo foi montado com número sem lastro e NÃO será publicado. Um centro de custo que inventa número é pior que não existir.",
      identidade.meta,
      { status: 500, details: { defeitos } },
    );
  }

  return apiSuccess(
    {
      ...painel,
      definicoes: DEFINICOES_DOS_DENOMINADORES,
      foraDoEscopo: FORA_DO_ESCOPO,
      /**
       * Ressalvas globais: as fragilidades do próprio instrumento de medição.
       * Escondê-las faria o painel parecer mais confiável do que é.
       */
      ressalvas: [
        "A gravação de consumo de IA é best-effort: recordUsage() em lib/ai/provider-router.ts engole falha de telemetria para não derrubar o atendimento comercial. Logo, o consumo de IA medido é PISO, não garantia de totalidade.",
        "`estimated_cost_usd` é calculado com a tarifa que o OPERADOR declarou em ATLAS_AI_PRICE_TABLE, não com a fatura do provedor. É preço declarado e auditável — não é preço confirmado pelo provedor.",
        "Nenhum item deste painel vem de fatura. A conciliação com o que foi efetivamente cobrado não existe neste produto.",
      ],
    },
    identidade.meta,
  );
}
