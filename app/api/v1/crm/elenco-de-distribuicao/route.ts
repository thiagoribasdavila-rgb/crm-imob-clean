import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { leLiderancaInteira } from "@/lib/crm/escopo-de-leitura";
import { montarFila, mover, type EstadoDoCorretor, type MembroDaFila } from "@/lib/distribution/fila-de-atendimento";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * QUEM PARTICIPA DA FILA DE CADA PROJETO E DE CADA CAMPANHA, E EM QUE ORDEM.
 *
 * A regra de quem PODE vive em `lib/distribution/elenco-por-escopo.ts`; a de
 * quem é a VEZ, em `lib/distribution/fila-de-atendimento.ts`. As duas são puras
 * e testadas. Esta rota só lê e escreve as linhas — a decisão de quem recebe a
 * lead continua na cascata, no momento em que a lead entra.
 *
 * ── QUEM PODE MEXER, E POR QUÊ A DIFERENÇA ─────────────────────────────────
 *
 * LER ..... qualquer pessoa da organização. Saber quem atende o quê não é
 *           segredo dentro da casa — e o corretor precisa conseguir entender
 *           por que não recebeu a lead do Arvo, e quando será a vez dele.
 * ESCREVER  só liderança. Montar time é decisão de gestão; se o próprio
 *           corretor pudesse se incluir, o elenco deixaria de significar algo.
 *
 * A checagem de escrita é feita AQUI, em código, e a RLS da tabela repete a
 * mesma regra. Não é redundância inútil: esta rota usa `service_role`, que passa
 * por cima da RLS. A política existe para o dia em que alguém consultar a tabela
 * por outro caminho.
 *
 * ── O QUE ESTA ROTA NUNCA FAZ ──────────────────────────────────────────────
 *
 * Devolver lista vazia quando a leitura falhou. Elenco vazio significa "fila
 * aberta a toda a equipe" — é uma AFIRMAÇÃO sobre a operação, e afirmá-la por
 * causa de um erro de banco faria o gestor acreditar que ninguém foi cadastrado
 * quando o time está lá. Falha vira 503.
 */

const ESCOPOS = ["projeto", "campanha"] as const;
type Escopo = (typeof ESCOPOS)[number];

const CAPACIDADE_PADRAO = 100;

/** Fechadas não ocupam carteira — é a mesma lista que a cascata usa. */
const STATUS_FECHADOS = new Set([
  "won", "ganho", "vendido", "lost", "perdido", "descartado", "discarded", "archived", "arquivado",
]);

const ehCorretor = (p: Record<string, unknown>) => {
  const c = String(p.commercial_role || "").toLowerCase();
  if (c) return c === "broker";
  return String(p.role || "").toUpperCase() === "CORRETOR";
};

const nomeDoPerfil = (p: Record<string, unknown>) =>
  String(p.full_name || p.name || p.id).slice(0, 60);

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 60, windowMs: 60_000, scope: "crm.elenco-distribuicao" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager", "broker"],
  });
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;

  const url = new URL(request.url);
  const escopoPedido = url.searchParams.get("escopo");
  const escopoIdPedido = url.searchParams.get("escopoId");
  const escopo = escopoPedido && (ESCOPOS as readonly string[]).includes(escopoPedido) ? (escopoPedido as Escopo) : null;

  const admin = getSupabaseAdmin();
  // `contexto=1` significa "estou desenhando a tela inteira": ela precisa saber
  // quantos participam de CADA escopo para mostrar o número ao lado de cada
  // empreendimento e de cada campanha na lista. Recortar `membros` pelo escopo
  // selecionado zeraria todos os outros — e "0 na fila" é justamente a leitura
  // que este produto não pode dar por engano, porque significa "aberta a todos".
  // O escopo pedido continua valendo para `fila`, que é o que ele seleciona.
  const querContexto = url.searchParams.get("contexto") === "1";
  let consulta = admin
    .from("distribution_roster")
    .select("id,escopo,escopo_id,profile_id,ativo,posicao,created_at")
    .eq("organization_id", organizationId);
  if (!querContexto) {
    if (escopo) consulta = consulta.eq("escopo", escopo);
    if (escopoIdPedido) consulta = consulta.eq("escopo_id", escopoIdPedido);
  }

  const { data, error } = await consulta.order("created_at", { ascending: true });
  if (error) {
    return apiError(
      "ELENCO_READ_FAILED",
      "Não foi possível ler o elenco de distribuição. A lista NÃO está vazia — ela não pôde ser lida.",
      identity.meta,
      { status: 503 },
    );
  }

  const linhas = data ?? [];

  // ── O CONTEXTO QUE A TELA PRECISA, NA MESMA IDA ──────────────────────────
  //
  // Sem isto a página faria seis requisições para desenhar uma fila — e cada
  // uma poderia falhar sozinha, deixando a tela meio montada sem que ninguém
  // soubesse qual metade faltou.
  //
  // `contexto=1` é explícito: quem só quer o elenco (a cascata, um script) não
  // paga por dados que não vai usar.
  let contexto: {
    corretores: Array<{
      id: string; nome: string; ativo: boolean;
      disponivel: boolean; whatsappConectado: boolean;
      cargaAberta: number; capacidade: number;
      elegivelAgora: boolean; porQueNao: string | null;
    }>;
    escopos: Array<{
      escopo: Escopo; id: string; nome: string;
      leadsTotal: number; leads30d: number; leadsSemDono: number;
      plataforma: string | null; situacao: string | null;
    }>;
    /**
     * O que impede a fila inteira de girar, quando é a mesma coisa para todo
     * mundo. Sem esta frase o gestor vê uma fila montada, ninguém marcado como
     * "próximo", e nenhuma explicação na tela.
     */
    travaGeral: string | null;
  } | null = null;

  /** A fila ordenada do escopo pedido — só quando um escopo foi pedido. */
  let fila: {
    escopo: Escopo; escopoId: string;
    lugares: Array<{
      profileId: string; nome: string; ordem: number;
      ultimaLeadEm: string | null; elegivelAgora: boolean;
      porQueNao: string | null; proximo: boolean; puladoPorque: string | null;
    }>;
    proximoId: string | null;
    porque: string;
  } | null = null;

  const querFila = Boolean(escopo && escopoIdPedido);

  if (querContexto || querFila) {
    const [perfis, projetos, campanhas, leads, sessoes] = await Promise.all([
      admin.from("profiles").select("id,full_name,name,commercial_role,role,active,availability_status,max_active_leads")
        .eq("organization_id", organizationId).eq("active", true),
      admin.from("developments").select("id,name").eq("organization_id", organizationId).limit(200),
      admin.from("marketing_campaigns").select("id,name,status,platform").eq("organization_id", organizationId).limit(200),
      // `development_id` E `campaign_id`: são as duas colunas que a lead carrega
      // e que os dois escopos desta tela usam. Ler só uma faria metade dos
      // escopos aparecer com volume zero — que se lê como "não gera lead".
      admin.from("leads").select("id,assigned_to,assigned_user_id,status,development_id,campaign_id,created_at,import_batch_id")
        .eq("organization_id", organizationId).limit(5000),
      admin.from("whatsapp_broker_sessions").select("profile_id,status").eq("organization_id", organizationId),
    ]);

    // Nenhuma destas leituras pode virar silêncio: contagem zero por falha de
    // banco vira "esta campanha não gera lead" na tela, que é uma afirmação
    // sobre o marketing da casa feita a partir de um erro de rede.
    if (perfis.error || projetos.error || campanhas.error || leads.error) {
      return apiError(
        "ELENCO_CONTEXTO_ILEGIVEL",
        "Não foi possível montar a fila de atendimento agora. Os números NÃO são zero — eles não puderam ser lidos.",
        identity.meta,
        { status: 503 },
      );
    }

    const conectados = new Set(
      (sessoes.data ?? []).filter((s) => String(s.status) === "conectado").map((s) => String(s.profile_id)),
    );
    const todasAsLeads = leads.data ?? [];
    const dono = (l: Record<string, unknown>) => String(l.assigned_to || l.assigned_user_id || "");
    const aberta = (l: Record<string, unknown>) => !STATUS_FECHADOS.has(String(l.status || "").toLowerCase());

    const cargaPorCorretor = new Map<string, number>();
    for (const lead of todasAsLeads) {
      if (!aberta(lead)) continue;
      const id = dono(lead);
      if (id) cargaPorCorretor.set(id, (cargaPorCorretor.get(id) ?? 0) + 1);
    }

    const corretores = (perfis.data ?? []).filter(ehCorretor).map((p) => {
      const id = String(p.id);
      const disponivel = String(p.availability_status || "AVAILABLE").toUpperCase() !== "OFFLINE";
      const whatsappConectado = conectados.has(id);
      const cargaAberta = cargaPorCorretor.get(id) ?? 0;
      const capacidade = Number(p.max_active_leads || CAPACIDADE_PADRAO);
      // A ordem dos motivos é a ordem em que a cascata barra. Mostrar o segundo
      // motivo quando o primeiro já barrou mandaria o gestor consertar a coisa
      // errada.
      const porQueNao = p.active === false ? "perfil inativo"
        : !disponivel ? "fora da fila (disponibilidade)"
        : !whatsappConectado ? "sem WhatsApp conectado"
        : cargaAberta >= capacidade ? `na capacidade (${cargaAberta}/${capacidade})`
        : null;
      return {
        id, nome: nomeDoPerfil(p), ativo: p.active !== false,
        disponivel, whatsappConectado, cargaAberta, capacidade,
        elegivelAgora: porQueNao === null, porQueNao,
      };
    });

    if (querContexto) {
      const trinta = Date.now() - 30 * 24 * 60 * 60_000;
      const volumeDe = (chave: "development_id" | "campaign_id", id: string) => {
        let leadsTotal = 0, leads30d = 0, leadsSemDono = 0;
        for (const lead of todasAsLeads) {
          if (String(lead[chave] || "") !== id) continue;
          leadsTotal += 1;
          if (Date.parse(String(lead.created_at)) >= trinta) leads30d += 1;
          // Acervo de resgate tem balcão próprio e não é demanda nova — contá-lo
          // aqui inflaria a fila deste escopo com lead histórica.
          if (!dono(lead) && !lead.import_batch_id) leadsSemDono += 1;
        }
        return { leadsTotal, leads30d, leadsSemDono };
      };

      const semNinguem = corretores.length === 0;
      const semWhatsapp = corretores.length > 0 && corretores.every((c) => !c.whatsappConectado);
      const todosFora = corretores.length > 0 && corretores.every((c) => !c.disponivel);

      contexto = {
        corretores,
        escopos: [
          ...(projetos.data ?? []).map((d) => ({
            escopo: "projeto" as Escopo, id: String(d.id), nome: String(d.name || d.id),
            ...volumeDe("development_id", String(d.id)),
            plataforma: null, situacao: null,
          })),
          ...(campanhas.data ?? []).map((c) => ({
            escopo: "campanha" as Escopo, id: String(c.id), nome: String(c.name || c.id),
            ...volumeDe("campaign_id", String(c.id)),
            plataforma: c.platform ? String(c.platform) : null,
            situacao: c.status ? String(c.status) : null,
          })),
        ],
        travaGeral: semNinguem
          ? "Nenhum corretor ativo na organização — não há fila para montar."
          : semWhatsapp
            ? "NENHUM corretor está com o WhatsApp conectado. A distribuição automática exige o canal ligado: enquanto ninguém conectar, a lead entra represada (sem dono) em vez de cair para quem não pode atendê-la."
            : todosFora
              ? "Todos os corretores estão fora da fila pela própria disponibilidade."
              : null,
      };
    }

    if (querFila && escopo && escopoIdPedido) {
      // ── QUANDO CADA UM RECEBEU A ÚLTIMA LEAD DESTE ESCOPO ────────────────
      //
      // Fonte ÚNICA: `lead_distribution_history`, que é o registro do ATO de
      // distribuir — e é onde tanto a cascata (`recordDistribution`) quanto a
      // distribuição manual gravam. `leads.created_at` seria a chegada da lead,
      // não a entrega dela: uma lead antiga transferida hoje não moveria o
      // ponteiro, e o rodízio daria a vez a quem acabou de receber.
      //
      // Histórico esparso não é defeito aqui: sem registro, `ultimaLeadEm` é
      // `null` para todos e a vez é do primeiro da ordem — que é exatamente o
      // certo para uma fila que ainda não girou.
      const doEscopo = new Set(
        todasAsLeads
          .filter((l) => String(escopo === "projeto" ? l.development_id : l.campaign_id || "") === escopoIdPedido)
          .map((l) => String(l.id)),
      );
      const historico = await admin
        .from("lead_distribution_history")
        .select("lead_id,assigned_user_id,created_at")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false })
        .limit(5000);
      const ultimaPorCorretor = new Map<string, string>();
      for (const linha of historico.data ?? []) {
        const corretor = String(linha.assigned_user_id || "");
        if (!corretor || ultimaPorCorretor.has(corretor)) continue;
        if (!doEscopo.has(String(linha.lead_id))) continue;
        ultimaPorCorretor.set(corretor, String(linha.created_at));
      }

      const porId = new Map(corretores.map((c) => [c.id, c]));
      const membros: MembroDaFila[] = linhas
        .filter((r) => r.escopo === escopo && String(r.escopo_id) === escopoIdPedido)
        .map((r) => ({
          profileId: String(r.profile_id),
          ativo: Boolean(r.ativo),
          posicao: r.posicao === null || r.posicao === undefined ? null : Number(r.posicao),
          entrouEm: r.created_at ? String(r.created_at) : null,
        }));
      const estados: EstadoDoCorretor[] = membros.map((m) => {
        const corretor = porId.get(m.profileId);
        return {
          profileId: m.profileId,
          ultimaLeadEm: ultimaPorCorretor.get(m.profileId) ?? null,
          // Quem está no elenco mas não aparece entre os corretores ativos saiu
          // da organização ou perdeu o papel: não recebe, e o motivo é esse.
          elegivelAgora: corretor?.elegivelAgora ?? false,
          porQueNao: corretor ? corretor.porQueNao : "não é mais corretor ativo",
        };
      });

      const resultado = montarFila(membros, estados);
      fila = {
        escopo, escopoId: escopoIdPedido,
        lugares: resultado.lugares.map((lugar) => ({
          ...lugar,
          nome: porId.get(lugar.profileId)?.nome ?? lugar.profileId.slice(0, 8),
        })),
        proximoId: resultado.proximoId,
        porque: resultado.porque,
      };
    }
  }

  return apiSuccess({
    contexto,
    fila,
    membros: linhas.map((r) => ({
      id: r.id,
      escopo: r.escopo,
      escopoId: r.escopo_id,
      profileId: r.profile_id,
      ativo: r.ativo,
      posicao: r.posicao === null || r.posicao === undefined ? null : Number(r.posicao),
    })),
    total: linhas.length,
    // A frase que a tela mostra quando não há ninguém. Dizer "vazio" sem dizer o
    // que vazio SIGNIFICA já produziu confusão suficiente neste produto.
    significadoDeVazio:
      "Sem elenco cadastrado, a fila deste escopo fica aberta a toda a equipe — que é o comportamento padrão.",
  }, identity.meta);
}

export async function POST(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "crm.elenco-distribuicao.escrita" });
  if (!rate.ok) return rate.response;

  const identity = await requireAccessContext(request, {
    roles: ["admin", "director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;
  const organizationId = identity.access.organization.id;

  // A checagem por PAPEL acima já barra corretor. Esta segunda, pelo mesmo
  // predicado que o resto do produto usa para "vê o funil inteiro", existe
  // porque as duas listas podem divergir com o tempo — e a que manda em
  // "montar time" é esta.
  if (!leLiderancaInteira(identity.access.profile)) {
    return apiError("ELENCO_SEM_PERMISSAO", "Montar o elenco de distribuição é decisão de liderança.", identity.meta, { status: 403 });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return apiError("ELENCO_CORPO_INVALIDO", "Corpo inválido: esperado JSON.", identity.meta, { status: 400 });
  }

  const { escopo, escopoId, profileId, ativo, acao, direcao } = (corpo ?? {}) as Record<string, unknown>;

  // Validação explícita e por campo. Mensagem genérica obriga quem chama a
  // adivinhar qual dos quatro está errado.
  if (typeof escopo !== "string" || !(ESCOPOS as readonly string[]).includes(escopo)) {
    return apiError("ELENCO_ESCOPO_INVALIDO", `\`escopo\` deve ser um de: ${ESCOPOS.join(", ")}.`, identity.meta, { status: 400 });
  }
  if (typeof escopoId !== "string" || escopoId.trim().length === 0) {
    return apiError("ELENCO_ESCOPO_ID_AUSENTE", "`escopoId` é obrigatório: o id do empreendimento ou da campanha.", identity.meta, { status: 400 });
  }
  if (typeof profileId !== "string" || !/^[0-9a-f-]{36}$/i.test(profileId)) {
    return apiError("ELENCO_PERFIL_INVALIDO", "`profileId` deve ser o uuid do perfil do corretor.", identity.meta, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  // ── MOVER NA FILA ─────────────────────────────────────────────────────────
  //
  // Reordenar não mexe em quem participa: é uma escrita separada de propósito,
  // para que um clique em "subir" nunca possa, por descuido de campo faltando,
  // acabar tirando alguém da fila.
  if (acao === "mover") {
    if (direcao !== "subir" && direcao !== "descer") {
      return apiError("ELENCO_DIRECAO_INVALIDA", "`direcao` deve ser `subir` ou `descer`.", identity.meta, { status: 400 });
    }
    const { data: atuais, error: erroLeitura } = await admin
      .from("distribution_roster")
      .select("profile_id,ativo,posicao,created_at")
      .eq("organization_id", organizationId)
      .eq("escopo", escopo)
      .eq("escopo_id", escopoId.trim());
    if (erroLeitura) {
      return apiError("ELENCO_ORDEM_ILEGIVEL", "Não foi possível ler a ordem atual da fila.", identity.meta, { status: 503 });
    }

    const nova = mover(
      (atuais ?? []).map((r) => ({
        profileId: String(r.profile_id),
        ativo: Boolean(r.ativo),
        posicao: r.posicao === null || r.posicao === undefined ? null : Number(r.posicao),
        entrouEm: r.created_at ? String(r.created_at) : null,
      })),
      profileId,
      direcao,
    );

    // Renumeração inteira, uma escrita por pessoa. A fila cabe numa tela — são
    // unidades de linhas, não milhares — e gravar só os dois que trocaram
    // deixaria buracos de `posicao` que o próximo movimento herdaria.
    for (const item of nova) {
      const { error: erroOrdem } = await admin
        .from("distribution_roster")
        .update({ posicao: item.posicao, updated_at: new Date().toISOString() })
        .eq("organization_id", organizationId)
        .eq("escopo", escopo)
        .eq("escopo_id", escopoId.trim())
        .eq("profile_id", item.profileId);
      if (erroOrdem) {
        return apiError("ELENCO_ORDEM_ESCRITA_FALHOU", "Não foi possível gravar a nova ordem da fila.", identity.meta, { status: 503 });
      }
    }

    return apiSuccess({ ordem: nova, movido: profileId, direcao }, identity.meta);
  }

  const querAtivo = ativo === undefined ? true : Boolean(ativo);

  // O perfil precisa ser DESTA organização. Sem esta checagem, um id válido de
  // outra empresa entraria no elenco — e a distribuição passaria a considerar
  // alguém que não deveria nem existir para esta operação.
  const { data: perfil, error: erroPerfil } = await admin
    .from("profiles")
    .select("id,organization_id,active")
    .eq("id", profileId)
    .maybeSingle();
  if (erroPerfil) return apiError("ELENCO_PERFIL_ILEGIVEL", "Não foi possível validar o perfil informado.", identity.meta, { status: 503 });
  if (!perfil || perfil.organization_id !== organizationId) {
    return apiError("ELENCO_PERFIL_DE_FORA", "Perfil não encontrado nesta organização.", identity.meta, { status: 404 });
  }

  // Quem entra vai para o FIM da fila, não para a frente. Sem posição explícita
  // a pessoa nova cairia no bloco dos "sem posição" — que também vai para o fim,
  // mas passaria à frente de quem já foi ordenado à mão no dia em que alguém
  // renumerasse. Entrar na fila não pode furar a fila.
  let posicaoDeEntrada: number | null = null;
  if (querAtivo) {
    const { data: existentes } = await admin
      .from("distribution_roster")
      .select("profile_id,posicao,ativo")
      .eq("organization_id", organizationId)
      .eq("escopo", escopo)
      .eq("escopo_id", escopoId.trim());
    const jaEstava = (existentes ?? []).some((r) => String(r.profile_id) === profileId && Boolean(r.ativo));
    if (!jaEstava) {
      const maior = (existentes ?? [])
        .filter((r) => Boolean(r.ativo) && r.posicao !== null && r.posicao !== undefined)
        .reduce((maximo, r) => Math.max(maximo, Number(r.posicao)), 0);
      posicaoDeEntrada = maior + 1;
    }
  }

  const { data, error } = await admin
    .from("distribution_roster")
    .upsert(
      {
        organization_id: organizationId,
        escopo: escopo as Escopo,
        escopo_id: escopoId.trim(),
        profile_id: profileId,
        ativo: querAtivo,
        ...(posicaoDeEntrada === null ? {} : { posicao: posicaoDeEntrada }),
        created_by: identity.access.profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organization_id,escopo,escopo_id,profile_id" },
    )
    .select("id,escopo,escopo_id,profile_id,ativo,posicao")
    .maybeSingle();

  if (error) return apiError("ELENCO_ESCRITA_FALHOU", "Não foi possível gravar o elenco agora.", identity.meta, { status: 503 });

  return apiSuccess({
    membro: data,
    // Um perfil inativo pode ser cadastrado de propósito (montar o time antes de
    // ativar a pessoa), mas quem está montando precisa saber.
    aviso: perfil.active === false
      ? "Este perfil está INATIVO: ele fica no elenco, mas não entra no rodízio enquanto não for ativado."
      : null,
  }, identity.meta);
}
