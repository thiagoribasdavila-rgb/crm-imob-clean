#!/usr/bin/env node
/**
 * MUTATION TESTING — a suíte protege mesmo, ou só parece?
 *
 * ── Por que isto existe ─────────────────────────────────────────────────────
 *
 * Suíte verde não prova nada sozinha. Muitos contratos deste repositório leem o
 * ARQUIVO FONTE e casam uma regex — provam que alguém escreveu certo texto, não
 * que o comportamento acontece.
 *
 * A primeira execução disto, em 2026-07-27, encontrou três pontos cegos reais
 * entre 14 quebras deliberadas:
 *
 *   · desligar a leitura do "caminho" na tela → suíte verde (o grep casava com
 *     o texto que sobrava morto dentro do bloco);
 *   · tornar o motivo do descarte opcional → suíte verde (a constante
 *     continuava no arquivo, inalcançável);
 *   · fazer `orientar()` perder o mapa das recusas → suíte verde (nenhum teste
 *     chamava a função; todos liam o objeto direto).
 *
 * Os três estavam entre as coisas que tinham acabado de ser declaradas
 * "protegidas por contrato". Daí a ferramenta.
 *
 * ── Como funciona ───────────────────────────────────────────────────────────
 *
 * Copia o repositório para uma pasta temporária, aplica UMA quebra por vez no
 * código de PRODUÇÃO, roda a suíte, e desfaz. Se a suíte continuar verde, aquele
 * comportamento não está protegido.
 *
 * O repositório de trabalho NUNCA é tocado: tudo acontece na cópia.
 *
 * ── Como manter ─────────────────────────────────────────────────────────────
 *
 * Ao proteger um comportamento novo com contrato, acrescente aqui a quebra
 * correspondente. Se ela sobreviver, o contrato é decorativo.
 *
 *   npm run teste:mutacoes
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const ORIGEM = process.cwd();

/**
 * Cada mutação desfaz UM comportamento que a suíte declara proteger.
 * `dor` é o que o usuário sente se isso for para produção sem ninguém ver.
 */
const MUTACOES = [
  {
    id: "M01", arquivo: "lib/crm/pipeline-guidance.ts",
    quebra: "orientar() perde o mapa das recusas da rota",
    dor: "Toda recusa vira a frase genérica — inclusive a lead de outra carteira, e o beco volta.",
    de: `  if (RECUSAS_DA_ROTA[texto]) return RECUSAS_DA_ROTA[texto];`,
    para: `  if (false) return GENERICA;`,
  },
  {
    id: "M02", arquivo: "lib/security/api-auth.ts",
    quebra: "a recusa de perfil inativo volta a ser 'Perfil inativo.'",
    dor: "Usuário novo recebe HTTP 500 em 51 rotas em vez de saber que falta o diretor ativá-lo.",
    de: `    deny(request, "Seu acesso ainda não foi autorizado. Peça ao diretor para ativar seu usuário em Configurações › Usuários — é o passo que falta.");`,
    para: `    deny(request, "Perfil inativo.");`,
  },
  {
    id: "M03", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "o desfazer volta a procurar só em pipeline_history",
    dor: "O aviso 'Desfazer movimentação' aparece e o botão nunca funciona.",
    de: `        admin.from("pipeline_stage_moves")`,
    para: `        admin.from("pipeline_history")`,
  },
  {
    id: "M04", arquivo: "lib/crm/contact-attempts.ts",
    quebra: "podeDescartar volta a ser sempre falso",
    dor: "O corretor não consegue descartar lead nenhuma.",
    de: `    podeDescartar: !HA_PISO || jaRespondeu || total >= TENTATIVAS_MINIMAS,`,
    para: `    podeDescartar: false,`,
  },
  {
    id: "M05", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "a tela para de alimentar o aviso com o caminho",
    dor: "O corretor lê o erro e não recebe o próximo passo. Volta a adivinhar.",
    de: `        if (recusa.caminho) setCaminho({ texto: recusa.caminho, acao: recusa.acao });`,
    para: `        if (false) setCaminho({ texto: recusa.caminho, acao: recusa.acao });`,
  },
  {
    id: "M06", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "lead de outra carteira volta a ser 409 em vez de 403",
    dor: "A tela trata como disputa de versão e sugere 'tente de novo' — laço sem fim.",
    de: `        foraDoEscopo ? 403 : naoEncontrada ? 404 : 409,`,
    para: `        naoEncontrada ? 404 : 409,`,
  },
  {
    id: "M07", arquivo: "lib/crm/pipeline-guidance.ts",
    quebra: "o caminho da lead fora de escopo vira 'atualize o Kanban'",
    dor: "O beco original: ele atualiza para sempre e a lead nunca muda de dono.",
    de: `    caminho: "Atualizar não resolve: peça a transferência ao seu gestor ou ao diretor. Enquanto ela não for sua, o Atlas não deixa mover.",
    acao: "falar-com-gestor",
  },
  pipeline_lead_not_found: {`,
    para: `    caminho: "Atualize o Kanban e confira a etapa atual antes de tentar novamente.",
    acao: "atualizar",
  },
  pipeline_lead_not_found: {`,
  },
  {
    id: "M08", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "window.prompt volta a pedir a justificativa de compra",
    dor: "Navegador pode bloquear a caixa; texto curto é descartado sem aviso.",
    de: `    const followUpDescription = followUp?.trim() || "";`,
    para: `    const followUpDescription = followUp?.trim() || window.prompt("Descreva:") || "";`,
  },
  {
    id: "M09", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "a tela volta a mostrar frase fixa no lugar do erro da rota",
    dor: "Toda recusa vira a mesma frase. O corretor não sabe o que faltou.",
    de: `        throw new Error(recusa.erro);`,
    para: `        throw new Error("A movimentação não foi confirmada.");`,
  },
  {
    id: "M10", arquivo: "lib/crm/contact-attempts.ts",
    quebra: "TENTATIVAS_MINIMAS ignora o env e fica fixo em 0",
    dor: "A trava não volta mais: 'religa em uma linha de .env' passa a ser mentira.",
    de: `  const n = Number(process.env.ATLAS_TENTATIVAS_MINIMAS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;`,
    para: `  return 0;`,
  },
  {
    id: "M11", arquivo: "lib/crm/pipeline-guidance.ts",
    quebra: "uma etapa do funil perde o ponto de conhecimento",
    dor: "A coluna deixa de dizer o que fazer para a lead avançar.",
    de: `  visita: {
    significa: "Visita marcada ou já feita.",
    paraAvancar: "Depois da visita, faça a proposta enquanto a impressão está fresca.",
  },`,
    para: ``,
  },
  {
    id: "M12", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "o Kanban para de mostrar o ponto de conhecimento",
    dor: "O conhecimento existe no código e não chega a quem trabalha.",
    de: `                  {!compact && conhecimentoDaEtapa(stage.key) ? (`,
    para: `                  {false ? (`,
  },
  {
    id: "M13", arquivo: "app/api/v1/leads/[id]/qualify/route.ts",
    quebra: "uma rota volta a mandar recusa de autorização para 500",
    dor: "O usuário inativo recebe 'erro de servidor' naquela rota.",
    de: `|autoriz|organiza|escopo/i.test(message)`,
    para: `/i.test(message)`,
  },

  // ── Quebras que uma AUDITORIA ADVERSARIAL achou e estas mutações não ──────
  //
  // As treze primeiras atacam a LIB. Estas atacam a COSTURA entre lib e rota —
  // que era exatamente onde os quatro achados reais estavam. Lição registrada:
  // mutação que só quebra a biblioteca mede a biblioteca, não o sistema.
  {
    id: "M15", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "a decisão do piso é invertida na rota",
    dor: "Com o piso ligado, descartaria quem ninguém contatou e barraria quem foi muito tentado — o inverso da regra.",
    de: `      if (!tentativas.podeDescartar) {`,
    para: `      if (tentativas.podeDescartar) {`,
  },
  {
    id: "M16", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "a recusa do piso perde o caminho",
    dor: "O corretor lê 'faltam 2 tentativas' e não sabe que basta tentar por outro canal.",
    de: `            caminho: tentativas.total === 0`,
    para: `            naoUsado: tentativas.total === 0`,
  },
  {
    id: "M17", arquivo: "app/(crm)/pipeline/page.tsx",
    quebra: "o descarte volta a usar caixa nativa, sem o prefixo window.",
    dor: "A forma mais comum de escrever `prompt(...)` passava batido no contrato antigo.",
    de: `      setDiscardDraft({ leadId: id`,
    para: `      prompt("Motivo?"); setDiscardDraft({ leadId: id`,
  },
  {
    id: "M18", arquivo: "app/api/v1/leads/[id]/qualify/route.ts",
    quebra: "uma rota da ficha da lead deixa de reconhecer 'organização'",
    dor: "Empresa suspensa faz a ficha da lead devolver 'erro de servidor' em vez de dizer o que houve.",
    de: `|organiza`,
    para: ``,
  },
  {
    id: "M14", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "o motivo do descarte deixa de ser obrigatório",
    dor: "Lead some do funil sem nada voltar para a Meta como sinal.",
    de: `    if (stage === "perdido" && !reversalOf && !discardReason) {`,
    para: `    if (false) {`,
  },
  {
    id: "M19", arquivo: "lib/atlas/regra-nunca-contatado.ts",
    quebra: "lead já contatado volta a disparar o sinal de nunca contatado",
    dor: "443 leads viram 448: a fila do corretor passa a cobrar ligação de quem já foi atendido, e a lista inteira perde a credibilidade.",
    de: `  if (input.firstContactedAtMs !== null) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M20", arquivo: "lib/atlas/regra-nunca-contatado.ts",
    quebra: "lead sem prazo de SLA gravado deixa de ser avaliado",
    dor: "Não ter SLA vira o que salva o lead de aparecer: ele fica invisível para sempre, sem ninguém nunca ligar.",
    de: `  const referencia = input.firstContactDueAtMs ?? input.createdAtMs;`,
    para: `  const referencia = input.firstContactDueAtMs;`,
  },
  {
    id: "M21", arquivo: "app/api/v1/analytics/broker-daily/route.ts",
    quebra: "o total da fila volta a ser o tamanho da página exibida",
    dor: 'O anel "Fila atendida" desenha 96% para uma carteira inteiramente travada — a fórmula fica incapaz de dar nota ruim.',
    de: `        leadsNeedingAttention: attentionQueueCompleta.length,`,
    para: `        leadsNeedingAttention: attentionQueue.length,`,
  },
  {
    id: "M22", arquivo: "app/api/v1/analytics/broker-daily/route.ts",
    quebra: "base sem as colunas de SLA passa a publicar zero em vez de não medido",
    dor: 'A tela afirma "0 sem primeiro contato" sobre uma carteira que ela não conseguiu olhar. Ausência não declarada é indistinguível de zero.',
    de: `    : null;`,
    para: `    : 0;`,
  },
  {
    id: "M23", arquivo: "app/(crm)/command-center/page.tsx",
    quebra: "todo risco da diretoria volta a desembocar em /reports",
    dor: 'O diretor lê "Distribuir a fila hoje", clica, e cai numa página sem nenhum link — recomeça a navegação pelo menu com dois corretores esperando.',
    de: `        href: DESTINO_DO_RISCO[risk.area] ?? "/reports",`,
    para: `          href: "/reports",`,
  },
  {
    id: "M24", arquivo: "app/(crm)/leads/page.tsx",
    quebra: "a lista de leads para de ler o filtro da URL",
    dor: "O link da central vira decoração: abre a lista com o último filtro salvo, mostrando um número diferente do que o risco acabou de afirmar.",
    de: `      const url = new URLSearchParams(window.location.search);`,
    para: `      const url = new URLSearchParams("");`,
  },
  {
    id: "M25", arquivo: "app/api/v1/analytics/director-daily/route.ts",
    quebra: "a diretoria volta a contar primeiro contato por etapa",
    dor: "A central afirma 429 e o clique abre 443. Tela pega mentindo uma vez deixa de ser consultada.",
    de: `    ? activeLeads.filter((lead) => !lead.first_contacted_at).length`,
    para: `    ? activeLeads.filter((lead) => normalize(lead.status) === "novo").length`,
  },
  {
    id: "M26", arquivo: "lib/meta/marketing/campaign-readiness.ts",
    quebra: "falha de leitura da Meta passa a ser cacheada",
    dor: "Um blip de rede congela 'não medido' por 10 minutos depois da Meta já ter voltado — e o diretor decide verba no escuro.",
    de: `    { ttlMs: READINESS_TTL_MS, isCacheable: (valor) => !valor.falhou },`,
    para: `    { ttlMs: READINESS_TTL_MS, isCacheable: () => true },`,
  },
  {
    id: "M27", arquivo: "lib/meta/marketing/prontidao-derivada.ts",
    quebra: "página que o CRM não conhece deixa de ser bloqueio",
    dor: "A verba é recarregada, a lead paga chega e cai em meta_leads_sem_destino — e a tela continua verde. É o erro mais caro possível aqui.",
    de: `    if (!paginasConhecidas.has(pagina)) {`,
    para: `    if (false) {`,
  },
  {
    id: "M28", arquivo: "app/(crm)/command-center/page.tsx",
    quebra: "os bloqueios de aquisição somem da fila da diretoria",
    dor: "O fato que decide entre 'trabalhe o que tem' e 'espere reposição' volta a existir só no terminal.",
    de: `        items: [...bloqueios, ...distribuicao, ...riscos].slice(0, 6),`,
    para: `        items: riscos.slice(0, 6),`,
  },
  {
    id: "M29", arquivo: "app/api/v1/crm/leads/route.ts",
    quebra: "a janela de recuperação volta a EXCLUIR em vez de ordenar",
    dor: 'Com a carteira inteira vencida há mais de 48h, "Prazo de 1º contato" devolve lista vazia — e o link da central leva o diretor a "nenhum lead corresponde" com 443 leads parados.',
    de: `          .order("first_contact_due_at", { ascending: false, nullsFirst: false })`,
    para: `          .gte("first_contact_due_at", new Date(Date.now() - 2880 * 60_000).toISOString())
          .order("first_contact_due_at", { ascending: true, nullsFirst: false })`,
  },
  {
    id: "M30", arquivo: "components/atlas/use-alerta-de-lead-nova.ts",
    quebra: "falha de leitura passa a zerar o contador em vez de declarar",
    dor: 'Um blip de rede vira "nenhuma lead nova". A tela confirma a falsa tranquilidade de uma fila parada — com lead paga esperando.',
    de: `      setEstado("nao-medido");`,
    para: `      setNovas(0); setEstado("nenhuma");`,
  },
  {
    id: "M31", arquivo: "components/atlas/sidebar.tsx",
    quebra: 'a pastilha volta a desenhar "0" quando não há nada',
    dor: "Bolinha permanente ao lado de Leads: em dois dias a pessoa aprende a ignorar, e junto vai o aviso da lead paga.",
    de: `      item.id === "leads" && (alerta.estado === "chegou" || alerta.estado === "nao-medido");`,
    para: `      item.id === "leads" && alerta.estado !== "indisponivel";`,
  },
  {
    id: "M32", arquivo: "supabase/migrations/20260729120000_alerta_de_lead_nova.sql",
    quebra: "importação em lote volta a gerar um aviso por linha",
    dor: "269 avisos em um minuto, como em 28/07. O contador vira acervo e nunca mais zera.",
    de: `    if new.import_batch_id is not null then
      return new;
    end if;`,
    para: `    if false then
      return new;
    end if;`,
  },
  {
    id: "M37", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "o Kanban para de declarar o recorte aplicado",
    dor: "Volta a ser impossível auditar de fora qual fronteira a rota aplicou — foi a falta dessa declaração que atrasou a descoberta de dois vazamentos.",
    de: `      escopo: lideranca ? "organizacao" : "carteira",`,
    para: ``,
  },
  {
    id: "M36", arquivo: "app/api/v1/crm/leads/route.ts",
    quebra: "o escopo de equipe volta a ser pedível por corretor",
    dor: "Hoje devolve 0 por sorte do dado (profiles.team nulo). Com equipes configuradas, um corretor lê a equipe inteira de um gerente qualquer.",
    de: `      if (soAMinhaCarteira) {
        return apiError("TEAM_OUT_OF_SCOPE", "Você não tem equipe sob sua gestão.", access.meta, { status: 403, headers: rate.headers });
      }`,
    para: ``,
  },
  {
    id: "M35", arquivo: "app/api/v1/crm/leads/route.ts",
    quebra: "o piso de carteira volta a ser pulável por parâmetro",
    dor: "Um corretor pede ?assigned_to=<colega> e recebe os 270 leads dele, com nome. Provado no navegador — é a mesma fuga que matou a tela /customers.",
    de: `      if (soAMinhaCarteira && assignedTo !== access.access.user.id && assignedTo !== access.access.profile.id) {`,
    para: `      if (false) {`,
  },
  {
    id: "M34", arquivo: "app/api/v1/analytics/broker-daily/route.ts",
    quebra: "o bônus de prioridade volta a decidir por etapa",
    dor: "22 leads nunca contatados que já saíram de 'novo' afundam na fila — justamente os parados há mais tempo, porque alguém mexeu na etapa e não ligou.",
    de: `      const firstContactOverdue = primeiroContatoMensuravel
        ? !lead.first_contacted_at
        : normalize(lead.status) === "novo" &&`,
    para: `      const firstContactOverdue = primeiroContatoMensuravel
        ? normalize(lead.status) === "novo"
        : normalize(lead.status) === "novo" &&`,
  },
  {
    id: "M33", arquivo: "lib/atlas/core-v2/live-development-write-adapter.ts",
    quebra: "a validação de escrita volta a consultar a tabela abandonada",
    dor: "Inside Perdizes, com 174 leads, deixa de ser encontrado: toda atualização de empreendimento é recusada em silêncio, e a duplicidade cega no primeiro cadastro novo.",
    de: `      .from("developments")
      .select("id")
      .eq("organization_id", plan.organizationId)`,
    para: `      .from("crm_projects")
      .select("id")
      .eq("organization_id", plan.organizationId)`,
  },
  {
    id: "M164", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "o DDD deixa de exigir o prefixo 55",
    dor: "'971567739185' vira DDD 15 e entra em 'telefone da praça'. O diretor lê um número de atendimento inflado por lixo, e liga para quem não existe.",
    de: `  if (!bruto.startsWith("55")) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M165", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "o comprimento canônico do telefone deixa de ser exigido",
    dor: "Um '5511999' truncado vira DDD 11 na contagem da central e NÃO casa o filtro do banco: a escada diz 147 e o clique abre 146.",
    de: `  if (!(COMPRIMENTOS_CANONICOS as readonly number[]).includes(bruto.length)) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M166", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "praça sem UF nenhuma passa a ser declarada MEDIDA",
    dor: "Com o cadastro incompleto, 100% dos leads viram 'fora da praça'. A escada fica plausível e completamente invertida — e alguém decide parar de trabalhar a fila inteira.",
    de: `  if (!ufs.length) {`,
    para: `  if (false) {`,
  },
  {
    id: "M167", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "o fragmento de consulta gera um comprimento só",
    dor: "Os 18 telefones fixos (12 dígitos) somem da lista mas continuam na contagem. O número escrito na central deixa de ser o número que o clique abre.",
    de: `  return COMPRIMENTOS_CANONICOS.map((tamanho) => \`phone_normalized.like.55\${ddd}\${"_".repeat(tamanho - 4)}\`);`,
    para: `  return [13].map((tamanho) => \`phone_normalized.like.55\${ddd}\${"_".repeat(tamanho - 4)}\`);`,
  },
  {
    id: "M38", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "a faixa inexpressável deixa de recusar e devolve um fragmento qualquer",
    dor: "Clicar em 'praça não medida (2)' abriria uma lista com outro conteúdo. Filtro que devolve o número errado é pior que filtro ausente.",
    de: `  if (chave === "lista_fora_da_praca") return { importBatch: "preenchido", telefoneOr: juntar(dddsDeFora) };
  return null;`,
    para: `  if (chave === "lista_fora_da_praca") return { importBatch: "preenchido", telefoneOr: juntar(dddsDeFora) };
  return { importBatch: "nulo", telefoneOr: null };`,
  },
  {
    id: "M39", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "o prazo da faixa passa a arredondar para baixo",
    dor: "146 ligações a 24/dia viram '6 dias úteis' em vez de 7. A premissa do diretor produz uma data otimista por construção, e data escapa do painel e vira meta cobrada.",
    de: `  const diasUteis = Math.ceil((acumuladoAntes + tamanhoDaFaixa) / porDiaUtil);`,
    para: `  const diasUteis = Math.floor((acumuladoAntes + tamanhoDaFaixa) / porDiaUtil);`,
  },
  {
    id: "M40", arquivo: "app/api/v1/crm/leads/route.ts",
    quebra: "a faixa deixa de aplicar o predicado da fila (nunca contatados)",
    dor: "Clicar em 'pediu contato · da praça (146)' abre a carteira inteira daquele recorte, incluindo quem já foi contatado. O rótulo promete um número e a lista entrega outro.",
    de: `      query = query
        .not("status", "in", \`(\${terminalStorageStatuses.join(",")})\`)
        .is("first_contacted_at", null);`,
    para: `      query = query.not("status", "in", \`(\${terminalStorageStatuses.join(",")})\`);`,
  },
  {
    id: "M41", arquivo: "lib/crm/escopo-de-leitura.ts",
    quebra: "o piso de carteira deixa de entrar na consulta",
    dor: "Volta o buraco medido em 2026-07-29: um corretor de carteira vazia renomeia, descarta e agenda visita na lead do colega — com 200 e sem deixar de ser lead dele.",
    de: `  if (!leSoAPropriaCarteira(perfil)) return consulta;
  return consulta.or(filtroDaMinhaCarteira(userId));`,
    para: `  return consulta;`,
  },
  {
    id: "M42", arquivo: "lib/crm/escopo-de-leitura.ts",
    quebra: "o piso passa a valer também para a liderança",
    dor: "O gerente abre a ficha das leads da equipe e recebe 403. Um piso bom demais quebra a gestão em silêncio — e silêncio aqui é gestor achando que a operação encolheu.",
    de: `  if (!leSoAPropriaCarteira(perfil)) return consulta;`,
    para: `  if (false) return consulta;`,
  },
  {
    id: "M43", arquivo: "lib/crm/escopo-de-leitura.ts",
    quebra: "o gêmeo em JavaScript esconde a lead sem dono",
    dor: "Lead órfã deixa de ser registrável por quem a encontra: ela fica parada até alguém abrir um relatório. É a divergência exata entre o filtro SQL (que a inclui) e a decisão em memória.",
    de: `  if (!porUsuario && !porResponsavel) return true;`,
    para: `  if (!porUsuario && !porResponsavel) return false;`,
  },
  {
    id: "M44", arquivo: "lib/security/api-auth.ts",
    quebra: "a recusa de carteira volta a ser um Error genérico",
    dor: "As rotas escolhem o status testando palavras da mensagem, e nessa régua nada vira 403: a recusa chega como 401 (tela desloga o corretor) ou 500 (\"o servidor quebrou\").",
    de: `  if (error || !data) throw new LeadForaDaCarteiraError();`,
    para: `  if (error || !data) throw new Error("Lead fora do seu escopo comercial.");`,
  },
  {
    id: "M45", arquivo: "app/api/v1/leads/[id]/first-contact/route.ts",
    quebra: "o registro de primeiro contato volta a confiar só na leitura",
    dor: "Um corretor PARA O RELÓGIO de SLA da lead do colega: o fechamento é único (`first_contacted_at is null`) e a métrica do outro fica falsificada sem ele saber que a lead foi tocada.",
    de: `  if (leSoAPropriaCarteira(access.access.profile) && !daMinhaCarteira) {`,
    para: `  if (false) {`,
  },
  {
    id: "M46", arquivo: "app/api/v1/pipeline/route.ts",
    quebra: "a recusa antecipada do Kanban perde o código da RPC",
    dor: "A lead alheia passa a recusar sem `pipeline_move_out_of_scope`: a tela perde o caminho 'peça a transferência ao gestor' e o corretor volta ao beco de atualizar a página para sempre.",
    de: `  if (ehLeadForaDaCarteira(error)) return recusar("pipeline_move_out_of_scope", 403);`,
    para: `  if (false) return recusar("pipeline_move_out_of_scope", 403);`,
  },
  {
    id: "M47", arquivo: "supabase/migrations/20260729140000_leads_cerca_da_organizacao_e_piso_de_carteira.sql",
    quebra: "a cerca do banco esquece o gerente, como já esqueceu uma vez",
    dor: "É o defeito EXATO que foi aplicado e medido em 2026-07-29: o dono da conta (commercial_role='manager') caiu de 469 leads visíveis para ZERO. O banco devolve 0 linhas, a aplicação não reclama, e a tela abre vazia sem erro nenhum — o pior tipo de falha, a silenciosa. A lista aqui é cópia de VE_O_FUNIL_INTEIRO; cópia que não é conferida diverge.",
    de: `        v.commercial_role in ('director', 'superintendent', 'manager', 'admin')\n        or v.papel_bruto = 'admin'`,
    para: `        v.commercial_role in ('director', 'superintendent')`,
  },
  {
    id: "M48", arquivo: "supabase/migrations/20260729140000_leads_cerca_da_organizacao_e_piso_de_carteira.sql",
    quebra: "apagar lead sem dono volta a valer a mesma regra que adotá-la",
    dor: "Medido executando: um corretor de fora da subárvore apagou uma lead órfã pelo PostgREST e a linha SUMIU. A fila de entrada NASCE órfã (a Meta grava lead sem dono), então isso é apagar a fila inteira com um fetch, pelo caminho que ignora a aplicação.",
    de: `        or lead_assigned_user_id = v.id\n        -- SEM a cláusula órfã. É a única diferença, e é o ponto do arquivo.`,
    para: `        or lead_assigned_user_id = v.id\n        or (lead_assigned_to is null and lead_assigned_user_id is null)`,
  },
  {
    id: "M49", arquivo: "app/api/v2/messages/send/route.ts",
    quebra: "uma rota confere o piso mas devolve a recusa com o status errado",
    dor: "Foi o estado REAL desta rota até 2026-07-29: ela já bloqueava a lead alheia (herdou o piso), mas respondia 500 e gravava `message.queue_failed` em nível ERROR. O corretor lê 'o servidor quebrou' e tenta de novo; o log de erro enche de eventos que não são erro e esconde os que são. A asserção é por VARREDURA — vale para qualquer rota nova que chame requireLeadAccess e esqueça o mapeamento.",
    de: `    if (ehLeadForaDaCarteira(error)) {`,
    para: `    if (false) {`,
  },
  {
    id: "M50", arquivo: "lib/atlas/navigation.ts",
    quebra: "a barra lateral passa a oferecer o catálogo inteiro a qualquer papel",
    dor: "O corretor vê os destinos da diretoria na navegação. A guarda que vigiava isso cobrava o LITERAL `visibleItems` — um nome de variável, que `const visibleItems = items` satisfaria sem filtrar nada — e ficou vermelha por 8 dias sem ninguém ver, porque era um dos 143 checks que nenhum agregado chama.",
    de: `  return atlasNavigation.filter((item) => canAccessAtlasItem(item, identity));`,
    para: `  return atlasNavigation;`,
  },
  {
    id: "M51", arquivo: "app/api/v2/marketing/capi-feedback/process/route.ts",
    quebra: "o worker da CAPI volta a rodar sem segredo nenhum",
    dor: "Era o estado real até 2026-07-29: `POST()` sem `request`, sem como conferir cabeçalho. Qualquer um que alcançasse a URL disparava envio de conversões à Meta para até 200 organizações. Dos 12 workers agendados, era o único sem trava.",
    de: `  if (!esperado || token !== esperado) {\n    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });\n  }`,
    para: `  void esperado; void token;`,
  },
  {
    id: "M52", arquivo: "app/api/v2/crm/first-contact-sla/process/route.ts",
    quebra: "a trava de um worker passa a valer só quando o segredo existe",
    dor: "É o erro de uma tecla que passa em revisão de código: `if (segredo && token !== segredo)` só recusa QUANDO o segredo está configurado — então em todo ambiente que ainda não o configurou, incluindo o primeiro dia de uma homologação, a rota fica ABERTA. Falha aberta é pior que falha fechada porque não gera sintoma.",
    de: `  if (!esperado || token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });`,
    para: `  if (esperado && token !== esperado) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });`,
  },
  {
    id: "M53", arquivo: "app/api/v1/whatsapp/bridge/is-lead/route.ts",
    quebra: "a ponte do WhatsApp perde a trava do segredo compartilhado",
    dor: "Sem ela, qualquer um na rede pergunta ao CRM 'este telefone é uma lead?' — reconhecimento gratuito da carteira — e nas rotas irmãs injeta mensagem de entrada. A ponte é chamada pelo processo do bridge (PM2), não por navegador: não há sessão para proteger, só o segredo.",
    de: `  if (!segredoConfere(request.headers.get("x-atlas-bridge-secret"), esperado)) {`,
    para: `  if (false) { void esperado;`,
  },
  {
    id: "M54", arquivo: "app/api/v1/whatsapp/bridge/is-lead/route.ts",
    quebra: "a ponte passa a aceitar sessão de usuário",
    dor: "É o CONSERTO ERRADO tentador: o guarda cobrava das pontes 'evidência de sessão' e ficava vermelho com as três, que já tinham o segredo. Adicionar requireAccessContext deixaria o guarda verde E abriria a ponte para QUALQUER corretor logado usar o canal do bridge. Reapontar um guarda tem de deixá-lo mais forte; esta mutação prova que a metade que proíbe sessão está de pé.",
    de: `function segredoConfere(recebido: string | null, esperado: string): boolean {`,
    para: `const _sessao = "requireAccessContext";\nfunction segredoConfere(recebido: string | null, esperado: string): boolean {`,
  },
  {
    id: "M55", arquivo: "app/(crm)/leads/page.tsx",
    quebra: "um filtro que recorta a lista deixa de contar como filtro",
    dor: "Era o estado real do filtro `vinculo` até 2026-07-29: ele existia, vinha da URL e ia para a rota, mas ficava fora de hasFilters e de activeFilterCount — porque a lista era enumerada DUAS vezes. Com ele ativo e zero resultados, a tela dizia \"Nenhum lead cadastrado\" a um corretor com 272 leads. Estado vazio que mente é pior que erro: o erro manda tentar de novo, a mentira manda desistir.",
    de: `    nextAction,\n    vinculo,\n  ].filter(Boolean);`,
    para: `    nextAction,\n  ].filter(Boolean);`,
  },
  {
    id: "M56", arquivo: "lib/crm/registro-de-consentimento.ts",
    quebra: "a regra do consentimento passa a aceitar gerente",
    dor: "Consentimento é declaração de BASE LEGAL para tratar dado pessoal de terceiro, e quem responde numa fiscalização é a empresa. Alargar para gerente transfere responsabilidade jurídica a quem não tem como assumi-la — e o dado já está lá: 270 das 469 leads dependem desse registro para entrar na CAPI.",
    de: `const REGISTRA_BASE_LEGAL = new Set(["director", "admin"]);`,
    para: `const REGISTRA_BASE_LEGAL = new Set(["director", "admin", "manager"]);`,
  },
  {
    id: "M57", arquivo: "components/crm/meta-consent-control.tsx",
    quebra: "a tela volta a oferecer o botão quando não sabe se pode",
    dor: "Era o defeito medido em 2026-07-29: 2 das 3 contas reais de diretoria — inclusive a do dono — viam os três botões habilitados e levavam 403 ao clicar. O `?? false` é o que faz a dúvida virar 'não oferecer' em vez de 'oferecer e recusar'.",
    de: `  const editavel = podeEditar ?? podeRegistrar ?? false;`,
    para: `  const editavel = podeEditar ?? podeRegistrar ?? true;`,
  },
  /**
   * M58–M61 vigiam a CERCA DAS MIGRATIONS, e são as primeiras mutações deste
   * arquivo que quebram SQL em vez de TypeScript. O contrato que elas testam é
   * tests/contracts/rls-em-tabela-nova.test.mjs.
   *
   * M59 é a que importa mais: ela não desfaz o conserto de `commission_rules`,
   * ela inventa uma tabela NOVA sem cerca. É a CLASSE. Se M58 for pega e M59
   * sobreviver, o contrato virou específico do caso e a próxima migration passa.
   */
  {
    id: "M58", arquivo: "supabase/migrations/20260727040000_regras_de_comissao.sql",
    quebra: "a migration volta a criar commission_rules sem `enable row level security`",
    dor: "Produção provisionada pelo repo publica o rateio de comissão de toda imobiliária para a chave anon, que vai no bundle do navegador. Foi o estado real do arquivo até 2026-07-29.",
    de: `alter table public.commission_rules enable row level security;`,
    // Comentado, não removido: prova de uma vez que a cerca sai de pé E que
    // comentário não satisfaz o contrato (`semComentarios` roda antes da varredura).
    para: `-- alter table public.commission_rules enable row level security;`,
  },
  {
    id: "M59", arquivo: "supabase/migrations/20260727040000_regras_de_comissao.sql",
    quebra: "uma tabela NOVA entra no repo sem cerca nenhuma (a CLASSE, não o caso)",
    dor: "É o defeito se repetindo na próxima migration que alguém escrever. Nenhum dos 214 portões pegava isto: check-rls.mjs percorre lista CURADA e tabela nova nunca está nela.",
    de: `create table if not exists public.commission_rules (`,
    para: `create table if not exists public.folha_de_pagamento (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  salario numeric(14,2) not null default 0
);

create table if not exists public.commission_rules (`,
  },
  {
    id: "M60", arquivo: "supabase/migrations/20260727040000_regras_de_comissao.sql",
    quebra: "somem os `drop policy if exists` que tornam a migration idempotente",
    dor: "O deploy aborta com 42710 em todo banco que já tem a policy — homologação é um deles. A migration que conserta a cerca passa a derrubar o deploy.",
    de: `drop policy if exists commission_rules_leitura on public.commission_rules;`,
    para: ``,
  },
  {
    id: "M61", arquivo: "supabase/migrations/20260727040000_regras_de_comissao.sql",
    quebra: "a policy de LEITURA passa a exigir diretoria, como a de escrita",
    dor: "O outro lado do filtro: cerca que barra todo mundo passa em teste de vazamento e destrói o produto. O corretor abre a tela de comissão vazia e não confere o próprio rateio.",
    de: `        and p.organization_id = commission_rules.organization_id
    )
  );`,
    para: `        and p.organization_id = commission_rules.organization_id
        and p.commercial_role = 'director'
    )
  );`,
  },
  {
    id: "M62", arquivo: "supabase/migrations/20260727050000_corrige_move_pipeline_lead.sql",
    quebra: "`activities.title` volta para o insert da função do funil",
    dor: "É o defeito EXATO, provado executando a versão do repositório contra homologação: 42703 / column \"title\" of relation \"activities\" does not exist. Toda movimentação de funil estoura, e a rota traduz como 409 \"recusada pela regra do funil\" — manda o corretor conferir a etapa quando o problema é esquema. A etapa está certa e continua recusando: beco.",
    de: `  insert into public.activities(organization_id,lead_id,user_id,type,description,metadata,occurred_at)`,
    para: `  insert into public.activities(organization_id,lead_id,user_id,type,title,description,metadata,occurred_at)`,
  },
  {
    id: "M63", arquivo: "supabase/migrations/20260727050000_corrige_move_pipeline_lead.sql",
    quebra: "a migration perde o `or replace` e deixa de ser idempotente",
    dor: "Aborta com 42723 em todo banco que já tem a função — homologação é um deles. A migration que conserta o Kanban passa a derrubar o deploy, e o conserto não chega.",
    de: `CREATE OR REPLACE FUNCTION public.move_pipeline_lead(p_actor_id uuid`,
    para: `CREATE FUNCTION public.move_pipeline_lead(p_actor_id uuid`,
  },
  {
    id: "M64", arquivo: "scripts/lib/migracoes-sem-sql.mjs",
    quebra: "o detector para de reconhecer arquivo só-comentário como vazio",
    dor: "Volta a valer a condição medida em 2026-07-29: uma migration com ZERO linhas de SQL passando por conserto versionado. Reconstruir o banco do repositório restaura a função quebrada e o Kanban não move lead nenhuma. Esta mutação existe para provar que o contrato EXECUTA o detector — asserção que procura a palavra sobreviveria, porque o identificador continua na linha do import.",
    de: `  return linhasDeSqlExecutavel(texto).length === 0;`,
    para: `  return false;`,
  },
  {
    id: "M65", arquivo: "scripts/lib/migracoes-sem-sql.mjs",
    quebra: "o `--` deixa de ser ancorado no início da linha",
    dor: "O outro lado do filtro, que é onde este tipo de guarda morre: `create index ...; -- nota` passa a ser lido como comentário puro, e o detector acusa de VAZIA uma migration cheia. Guarda que reprova todo mundo passa em teste de vazamento e destrói o deploy — nesta base a mesma armadilha já mordeu três vezes no mesmo dia.",
    de: `    .map((linha) => (/^\\s*--/.test(linha) ? "" : linha))`,
    para: `    .map((linha) => (/--/.test(linha) ? "" : linha))`,
  },
  {
    id: "M66", arquivo: "scripts/lib/migracoes-sem-sql.mjs",
    quebra: "declarar uma migration vazia passa a valer sem motivo escrito",
    dor: "`motivo: \"\"` vira declaração válida e a lista de exceções passa a absolver por existir. Foi assim que a quarentena de portões guardou dois motivos ERRADOS por dias: motivo que ninguém precisa escrever é motivo que ninguém confere.",
    de: `export const PISO_DO_MOTIVO = 40;`,
    para: `export const PISO_DO_MOTIVO = 0;`,
  },
  {
    id: "M67", arquivo: "scripts/lib/migracoes-sem-sql.mjs",
    quebra: "declaração obsoleta deixa de reprovar",
    dor: "A lista de exceções vira cobertor permanente: quem consertar a migration deixa a declaração para trás, e ela autoriza — calada — esvaziar aquele mesmo arquivo de novo amanhã. Exceção que sobrevive ao problema vira teto silencioso.",
    de: `      if (!fs.existsSync(caminho)) return true;
      return !ehSomenteComentario(fs.readFileSync(caminho, "utf8"));`,
    para: `      void caminho;
      return false;`,
  },
  /**
   * M68–M74 vigiam a PRONTIDÃO QUE NÃO MENTE — contrato
   * tests/contracts/prontidao-nao-mente.test.mjs.
   *
   * A doença que elas guardam é uma: "credencial presente" sendo publicada como
   * "funciona", e o caso extremo dela era o `smtp`, que saía de
   * `checks.database.ok ? "via-supabase-auth" : "error"` — estado sobre E-MAIL
   * derivado de uma consulta a `organizations`.
   *
   * M69 e M70 são as que importam mais: elas não desfazem o conserto do smtp,
   * elas REAPONTAM uma linha qualquer para a evidência do banco. É a CLASSE. Se
   * M69 for pega e M70 sobreviver, o contrato virou específico do smtp e a
   * próxima linha derivada do assunto errado passa.
   */
  {
    id: "M68", arquivo: "lib/integrations/estado-de-credencial.ts",
    quebra: "a recusa de evidência de OUTRO assunto desaparece",
    dor: "É o defeito original de volta em forma geral: prova de que o banco respondeu passa a valer como prova de que o e-mail funciona. Recuperação de senha falha em produção com a prontidão VERDE, e ninguém abre chamado contra uma tela que diz ok.",
    de: `  if (evidencia && evidencia.assunto !== entrada.assunto) {`,
    para: `  if (false) {`,
  },
  {
    id: "M69", arquivo: "lib/integrations/prontidao-das-integracoes.ts",
    quebra: "o smtp volta a declarar o assunto do banco",
    dor: "Era o estado real até 2026-07-29. A linha de e-mail passa a colher a evidência da consulta a organizations e fica verde sempre que o banco responde — status que nunca fica vermelho pelo próprio assunto não é status, é enfeite.",
    de: `    smtp: declarar(ASSUNTOS.email, {`,
    para: `    smtp: declarar(ASSUNTOS.banco, {`,
  },
  {
    id: "M70", arquivo: "lib/integrations/prontidao-das-integracoes.ts",
    quebra: "OUTRA linha (openai) passa a nascer da checagem do banco — a CLASSE",
    dor: "O mesmo defeito na próxima integração que alguém acrescentar. A tela diria que a IA responde porque o SELECT em organizations voltou, com a conta da OpenAI em HTTP 429 insufficient_quota.",
    de: `    openai: declarar(ASSUNTOS.openai, {`,
    para: `    openai: declarar(ASSUNTOS.banco, {`,
  },
  {
    id: "M71", arquivo: "lib/ai/prontidao-generativa.ts",
    quebra: "o fallback determinístico volta a contar como provedor vivo",
    dor: "Das 43 linhas de ai_usage_events no banco de homologação, 22 eram local/deterministic-safe-fallback — a pegada de que TODOS os provedores falharam. Contá-las como uso conclui 'IA pronta' exatamente nas chamadas em que nenhuma IA respondeu.",
    de: `    if (!provedor || provedor === PROVEDOR_DE_FALLBACK) continue;`,
    para: `    if (!provedor) continue;`,
  },
  {
    id: "M72", arquivo: "lib/ai/prontidao-generativa.ts",
    quebra: "a segunda guarda do fallback (pelo nome do MODELO) desaparece",
    dor: "A dupla guarda existe porque um dia o fallback pode ser gravado com outro rótulo de provedor. Sem ela, basta renomear o provedor do fallback para a IA morta voltar a aparecer viva.",
    de: `    if (String(linha.model ?? "").trim() === MODELO_DE_FALLBACK) continue;`,
    para: `    void MODELO_DE_FALLBACK;`,
  },
  {
    id: "M73", arquivo: "lib/ai/model-profiles.ts",
    quebra: "nome de modelo truncado deixa de ser reprovado",
    dor: "`gpt-5.6-` existia no ambiente real e devolve HTTP 400 model_not_found. Sem a recusa, cada chamada gasta rede (e retry) para descobrir o que o nome já dizia — e o tier cai no fallback determinístico sem ninguém entender por quê.",
    de: `  if (/[-._/]$/.test(valor)) return `,
    para: `  if (false) return `,
  },
  {
    id: "M74", arquivo: "app/api/ai/briefing/route.ts",
    quebra: "generativeReady volta a sair da existência da chave da OpenAI",
    dor: "Era o estado real: `aiProviderReadiness().openai` é `Boolean(process.env.OPENAI_API_KEY)`. A diretoria lia 'IA pronta' apontando para o ÚNICO provedor generativo que não responde (429 insufficient_quota), enquanto a Perplexity — primeira na ordem configurada e viva — era ignorada.",
    de: `      generativeReady: generativa.pronta,`,
    para: `      generativeReady: aiProviderReadiness().openai,`,
  },
  {
    id: "M75", arquivo: "lib/integrations/leitura-da-prontidao.ts",
    quebra: "o leitor volta a procurar os campos no nível de cima da resposta",
    dor: "Era o estado real do AtlasSystemPulse: `apiSuccess` responde `{ok,data,meta}` e o painel lia `body.status`. `status` saía undefined, então o botão dizia 'Atenção necessária' e a lista dizia 'Nenhuma verificação disponível' com a rota em 200 e o banco em 219 ms. Vermelho permanente ensina a ignorar o painel tão bem quanto verde falso.",
    de: `  const dados = objeto(raiz.data);`,
    para: `  const dados = objeto(raiz);`,
  },
  {
    id: "M76", arquivo: "lib/integrations/leitura-da-prontidao.ts",
    quebra: "o leitor passa a aprovar qualquer status que não seja not_ready",
    dor: "Leitor tolerante que na dúvida aprova é a doença desta entrega com outra roupa: um deploy antigo, um erro de digitação no enum ou uma resposta truncada passariam a pintar a plataforma de verde.",
    de: `    bruto === "ready" ? "ready" : bruto === "not_ready" ? "not_ready" : "desconhecido";`,
    para: `    bruto === "not_ready" ? "not_ready" : "ready";`,
  },
  {
    id: "M77", arquivo: "lib/integrations/estado-de-credencial.ts",
    quebra: "evidência SEM DATA volta a contar como fresca",
    dor: "Uma linha de ai_usage_events com created_at nulo passa a declarar o provedor VIVO para sempre: sem data não há janela que expire. É a doença desta entrega em miniatura — 'não sei quando' publicado como 'agora'.",
    de: `  if (Number.isNaN(em)) {`,
    para: `  if (false) {`,
  },
  {
    id: "M78", arquivo: "lib/ai/conversational-qualification.ts",
    quebra: "a tela de qualificação emudece: lacuna existe e nenhuma pergunta é feita",
    dor: "O corretor abre 'Qualificar agora' numa lead crua e vê 'qualificação concluída' com zero de oito sinais. A fase 86 inteira vira um botão que não pergunta nada.",
    de: `nextField=missing[0]||null`,
    para: `nextField=null`,
  },
  {
    id: "M79", arquivo: "lib/ai/conversational-qualification.ts",
    quebra: "texto livre passa a contar como sinal confirmado",
    dor: "Qualquer lixo gravado no campo vira 'sinal confirmado' e sobe para o Copiloto como verdade. É exatamente a inferência automática que o documento da fase proíbe.",
    de: `options[field].includes(String(profile[field]||""))`,
    para: `true`,
  },
  {
    id: "M80", arquivo: "lib/ai/conversational-qualification.ts",
    quebra: "lead vira PRONTA PARA APRESENTAR sem objetivo, prazo ou forma de pagamento",
    dor: "Seis sinais periféricos bastam para o selo verde. O corretor entra na reunião sem saber o que a pessoa quer nem como pagaria.",
    de: `readyForPresentation:answered.length>=6&&Boolean(profile.purpose&&profile.timeline&&profile.financing)`,
    para: `readyForPresentation:answered.length>=6`,
  },
  {
    id: "M81", arquivo: "app/api/v1/leads/[id]/conversational-qualification/route.ts",
    quebra: "a rota aceita resposta fora do catálogo comercial",
    dor: "A promessa de 'resposta controlada' cai no chão: o POST grava qualquer string no perfil de qualificação, e a conversa bruta entra pela porta que a fase jurou não ter.",
    de: `!options[field as keyof typeof options].includes(value)`,
    para: `false`,
  },
  {
    id: "M82", arquivo: "app/(crm)/leads/[id]/qualification/page.tsx",
    quebra: "corrigir uma resposta mostra as opções do campo errado",
    dor: "O corretor toca em 'Objetivo da compra' para corrigir e recebe a lista de prazos. Um toque grava a resposta errada no campo errado.",
    de: `data.options[activeField]`,
    para: `data.options[nextField]`,
  },
  {
    id: "M87", arquivo: "app/(crm)/leads/[id]/qualification/page.tsx",
    quebra: "o botão de CORRIGIR resposta perde a trava do corretor responsável",
    dor: "Quem não é dono da lead reabre um campo já respondido e regrava por cima. A tela tem DOIS gatilhos de escrita e a guarda antiga achava o `disabled` do outro — desarmar um passava batido.",
    de: `disabled={busy||!data.canAnswer} onClick={()=>{interacted`,
    para: `disabled={busy} onClick={()=>{interacted`,
  },
  {
    id: "M88", arquivo: "app/api/v1/leads/[id]/conversational-qualification/route.ts",
    quebra: "a recusa do catálogo fica inalcançável, com o código de erro renomeado",
    dor: "Um `if (false)` desliga a validação e a rota grava qualquer string no perfil de qualificação. A guarda antiga media só a ORDEM de duas ocorrências e casava o PREFIXO do identificador renomeado — sobrevivia à quebra.",
    de: `if(!(field in options)||!options[field as keyof typeof options].includes(value))return apiError("QUALIFICATION_INVALID"`,
    para: `if(false)return apiError("QUALIFICATION_INVALID_X"`,
  },
  {
    id: "M83", arquivo: "lib/dashboards/periodo-do-resumo.ts",
    quebra: "a gravação do recorte perde a guarda de hidratação",
    dor: "O efeito grava o padrão na montagem e apaga a escolha do usuário antes de a leitura recuperá-la. Quem escolhe 'Hoje', abre uma lead e volta, reencontra '30 dias' — com todo o código de persistência presente e aparentemente correto.",
    de: `  if (!hidratado) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M84", arquivo: "lib/dashboards/periodo-do-resumo.ts",
    quebra: "o recorte lido da sessão deixa de ser validado contra o vocabulário",
    dor: "Valor de uma versão anterior, tradução ('semana') ou mão no DevTools passam adiante e viram janela indefinida. A tela recorta de um jeito que ninguém pediu e não mostra erro nenhum — lista vazia se lê como 'não aconteceu nada'.",
    de: `  if (!ehPeriodoDoResumo(texto)) return PERIODO_PADRAO;`,
    para: `  if (false) return PERIODO_PADRAO;`,
  },
  {
    id: "M85", arquivo: "lib/dashboards/periodo-do-resumo.ts",
    quebra: "semana e mês passam a ter a mesma janela de 30 dias",
    dor: "A pastilha troca de cor e nenhum número muda. Seletor que não mexe na leitura é pior que seletor nenhum: convence o diretor de que ele está vendo a semana.",
    de: `  if (periodo === "week") return 7;`,
    para: `  if (periodo === "week") return 30;`,
  },
  {
    id: "M86", arquivo: "lib/dashboards/periodo-do-resumo.ts",
    quebra: "linha sem data passa a contar como dentro de qualquer janela",
    dor: "Lead com created_at nulo entra no recorte de hoje. A conversão do dia sobe sem nenhuma venda por trás — número fabricado exibido como medido.",
    de: `  if (!Number.isFinite(marca)) return false;`,
    para: `  if (!Number.isFinite(marca)) return true;`,
  },
  {
    id: "M89", arquivo: "app/(auth)/reset-password/page.tsx",
    quebra: "a resposta da rota de troca de senha volta a ser engolida",
    dor: "A senha muda, a rota responde 401 e ninguém olha: a troca não é registrada em lugar nenhum e a sessão de recuperação continua viva — medido, GET /auth/v1/user com ela responde 200 depois da troca, por ~1 h. Quem tem o link troca a senha de novo, e a tela mostra sucesso verde nos dois casos.",
    de: `}).then((resposta) => resposta.ok).catch(() => false);`,
    para: `}).catch(() => {});`,
  },
  {
    id: "M90", arquivo: "app/(auth)/reset-password/page.tsx",
    quebra: "a troca pelo navegador deixa de encerrar a sessão de recuperação",
    dor: "O provedor revoga as OUTRAS sessões sozinho, então nada parece errado — mas a sessão que acabou de trocar a senha sobrevive. Em computador compartilhado, o token fica no fragmento da URL e a próxima pessoa troca a senha outra vez.",
    de: `await supabase.auth.signOut({ scope: "global" }).catch(() => null);`,
    para: `await Promise.resolve();`,
  },
  {
    id: "M91", arquivo: "app/(auth)/reset-password/page.tsx",
    quebra: "a política 12/128/3 para de barrar antes de chamar o provedor",
    dor: "Medido: o provedor aceita 'abc123' e '12345678' (HTTP 200); o mínimo dele é 6 caracteres. Sem esta guarda a recuperação passa a ser o caminho legítimo para rebaixar a própria senha, e o Atlas continua prometendo 12/128/3 na tela.",
    de: `    if (!strength.valid) {`,
    para: `    if (false) {`,
  },
  {
    id: "M92", arquivo: "app/api/auth/password-reset/route.ts",
    quebra: "a rota de troca deixa de exigir o cookie de intenção",
    dor: "Sem o cookie, qualquer sessão apenas logada troca a senha sem provar recuperação e sem saber a senha atual. Notebook destravado, sessão emprestada ou cookie roubado viram tomada de conta — e o portão continuaria verde, porque a rota segue 'validando o usuário'.",
    de: `  if (!request.cookies.get(RECOVERY_COOKIE)?.value) return null;`,
    para: `  if (false) return null;`,
  },

  // ── OFERTA ATIVA DO ACERVO DE RESGATE ─────────────────────────────────────
  //
  // A regra desta feature mora numa RPC. Uma mutação em arquivo NÃO reescreve o
  // banco, então o que estas quebras cobram é o par: os NÚMEROS vivem no módulo
  // TypeScript e o contrato compara o módulo com o comportamento do BANCO VIVO.
  // Mexer no número aqui deixa os dois em desacordo — e é isso que fica vermelho.
  {
    id: "M93", arquivo: "lib/crm/acervo-de-resgate.ts",
    quebra: "o limite de recarga sobe de 5 para 7 leads sem toque",
    dor: "O corretor acumula 14 leads de resgate intocadas em vez de 10, e o acervo esvazia sem ninguém ligar — o problema de hoje (270 leads paradas numa pessoa) com outro nome. O banco continua travando em 5, então a tela promete um lote que a RPC recusa.",
    de: `export const LIMITE_SEM_TOQUE = 5;`,
    para: `export const LIMITE_SEM_TOQUE = 7;`,
  },
  {
    id: "M94", arquivo: "lib/crm/acervo-de-resgate.ts",
    quebra: "o prazo do resgate volta a ser o padrão de 15 minutos",
    dor: "Lead histórica de 2023 nasce com 15 minutos para o primeiro contato. Todo lote pego aparece atrasado na central em quinze minutos, e a fila de urgência do corretor vira ruído — exatamente o defeito que as 13 leads já migradas tinham.",
    de: `export const PRAZO_RESGATE_MINUTOS = 1440;`,
    para: `export const PRAZO_RESGATE_MINUTOS = 15;`,
  },
  {
    id: "M95", arquivo: "lib/crm/acervo-de-resgate.ts",
    quebra: "a oferta deixa de conferir o papel do ator",
    dor: "A tela oferece o balcão do acervo para a liderança e para quem não é corretor. Quem distribui para os outros passa a se servir, e o acervo esvazia por cima em vez de por baixo.",
    de: `  if (estado.papel !== "broker") return recusa("acervo_ator_nao_e_corretor");`,
    para: `  if (false) return recusa("acervo_ator_nao_e_corretor");`,
  },
  {
    id: "M96", arquivo: "lib/crm/acervo-de-resgate.ts",
    quebra: "o teto de carteira da liderança deixa de recusar quando não há espaço",
    dor: "O corretor no teto configurado pelo gestor pega mais 10 e a RPC recusa com `broker_total_capacity_reached` — a tela oferece um botão que sempre falha, e o gestor perde a única alavanca que tem sobre carteira.",
    de: `    if (espaco <= 0) return recusa("broker_total_capacity_reached");`,
    para: `    if (false) return recusa("broker_total_capacity_reached");`,
  },
  {
    id: "M97", arquivo: "lib/crm/acervo-de-resgate.ts",
    quebra: "o atraso de primeiro contato volta a ignorar o prazo do acervo",
    dor: "As 16.733 leads arquivadas do acervo v1 passam a contar como violação de primeiro contato no dia da importação. A métrica que revelou que o gargalo é DISTRIBUIÇÃO morre afogada em ~17 mil linhas falsas.",
    de: `  const ehAcervo = Boolean(lead.import_batch_id);
  if (!ehAcervo) return true;`,
    para: `  return true;`,
  },
  {
    id: "M98", arquivo: "lib/crm/acervo-de-resgate.ts",
    quebra: "a tela deixa de negar que 'não perguntado' seja 'sem restrição'",
    dor: "O corretor lê que as leads estão sem restrição de contato, pega 10 e dispara mensagem para gente que nunca deu base legal. É a imobiliária que responde por isso, não o corretor.",
    de: `    ? "Nenhuma destas leads tem consentimento registrado — o estado é “não perguntado”, que não é o mesmo que “sem restrição”."`,
    para: `    ? "Nenhuma destas leads tem restrição de contato registrada."`,
  },

  {
    id: "M100", arquivo: "app/api/v1/analytics/broker-daily/route.ts",
    quebra: "a central do corretor volta ao predicado sem prazo",
    dor: "O terceiro predicado de atraso (o único que não olhava prazo) volta a divergir dos outros três. Lead de resgate pega há 5 minutos já aparece atrasada na central de quem acabou de pegá-la.",
    de: `    ? activeLeads.filter((lead) => primeiroContatoAtrasado(lead, now)).length`,
    para: `    ? activeLeads.filter((lead) => !lead.first_contacted_at).length`,
  },

  {
    id: "M102", arquivo: "supabase/migrations/20260730010000_oferta_ativa_do_acervo_de_resgate.sql",
    quebra: "o claim perde o `skip locked` na migration",
    dor: "MEDIDO com duas sondas paralelas na base viva: com `skip locked`, duas transações sobrepostas por 2.911ms pegaram 10 leads cada, ZERO em comum. Sem ele, a segunda ESPEROU (6.188ms contra 3.079ms) e voltou com AS MESMAS 10 ids. Num banco reconstruído por esta migration, dois corretores clicando junto recebem o mesmo lote — um deles fica com o lote curto ou vazio, e o outro nunca sabe.",
    de: `    for update skip locked`,
    para: `    for update`,
  },

  // ── FRENTE 4.6 GEOLOCALIZAÇÃO (M132..M139) ────────────────────────────────
  //
  // Todas quebram o ARQUIVO da migration, e é por isso que quem as mata é a
  // PARTE B de tests/contracts/geolocalizacao-em-metros.test.mjs. A PARTE A
  // chama o banco e prova que o comportamento existe DE VERDADE, mas editar um
  // `.sql` não muda o banco já aplicado: uma asserção que só consulta o banco
  // nunca morreria por estas mutações. As duas partes são necessárias.
  {
    id: "M132", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "ST_MakePoint recebe latitude antes de longitude no raio",
    dor: "MEDIDO: o Paraíso é lat -23,5713 / lng -46,6420. Trocado, o ponto vira lat -46,64 / lng -23,57 — no Atlântico, a ~2.600 km do empreendimento. Os dois CHECK de faixa PASSAM (-46 é latitude válida, -23 é longitude válida), o índice funciona, a consulta responde 200 e a lista de 'imóveis próximos' fica vazia ou traz o prédio errado, sem um único erro.",
    de: `           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_longitude::double precision, p_latitude::double precision
           ), 4326)::extensions.geography
         )::numeric as distancia_m
    from public.developments d`,
    para: `           extensions.ST_SetSRID(extensions.ST_MakePoint(
             p_latitude::double precision, p_longitude::double precision
           ), 4326)::extensions.geography
         )::numeric as distancia_m
    from public.developments d`,
  },
  {
    id: "M133", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "a coluna do ponto vira geometry em vez de geography",
    dor: "MEDIDO no banco: a MESMA distância deu 110.574,4 em geography e 1,0000 em geometry — metro contra GRAU. Um raio de 1000 'metros' passa a varrer ~111.000 km, ou seja o planeta inteiro: 'empreendimentos num raio de 1 km' devolve todos, e a distância exibida ao corretor fica em unidade nenhuma. Nada estoura.",
    de: `  add column if not exists geo extensions.geography(Point, 4326)`,
    para: `  add column if not exists geo extensions.geometry(Point, 4326)`,
  },
  {
    id: "M134", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "empreendimentos_no_raio perde a cerca da organização",
    dor: "A função é `security definer`: ela atravessa a RLS por desenho, e a cerca de inquilino só existe naquela linha. Sem ela, um raio de 50 km em São Paulo devolve os empreendimentos de TODAS as imobiliárias do banco — vazamento entre empresas pela porta da geolocalização, com HTTP 200.",
    de: `    from public.developments d
   where d.organization_id = p_organization_id
     and d.geo is not null`,
    para: `    from public.developments d
   where d.geo is not null`,
  },
  {
    id: "M135", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "a concentração de demanda volta a descartar empreendimento sem bairro",
    dor: "MEDIDO: 192 leads têm empreendimento de interesse e 185 apareciam; as 7 do Spin Mood (neighborhood NULL) DESAPARECIAM sem aviso. Quem somasse a coluna do mapa de demanda leria 185 e confiaria — é a classe 'recorte que esvazia a lista', já paga neste repositório.",
    de: `      coalesce(private.normalizar_endereco(d.neighborhood), '(sem bairro)') as chave,
      coalesce(min(d.neighborhood), '(bairro não informado)')                as regiao,`,
    para: `      private.normalizar_endereco(d.neighborhood) as chave,
      min(d.neighborhood)                         as regiao,`,
  },
  {
    id: "M136", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "o cache de geocodificação nasce sem RLS",
    dor: "`geocode_cache` é GLOBAL (um endereço aponta para o mesmo lugar para toda imobiliária), de propósito, para nunca geocodificar duas vezes. Sem RLS, a chave anon — que vai no bundle do navegador por desenho — lê o cache inteiro: todo endereço que qualquer inquilino já confirmou, para quem souber o nome da tabela.",
    de: `alter table public.geocode_cache enable row level security;`,
    para: `-- alter table public.geocode_cache enable row level security;`,
  },
  {
    id: "M137", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "o OUT param do cache volta a se chamar como a coluna",
    dor: "MEDIDO: com o OUT param chamado `endereco_normalizado`, o `on conflict (endereco_normalizado)` fica ambíguo e a função aborta com 42702 na primeira CHAMADA — ela é CRIADA sem erro nenhum. Num banco reconstruído por esta migration, toda escrita no cache falha, e a falha só aparece em runtime.",
    de: `returns table (
  endereco_chave text,
  gravou         boolean,
  motivo         text
)`,
    para: `returns table (
  endereco_normalizado text,
  gravou               boolean,
  motivo               text
)`,
  },
  {
    id: "M138", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "a precedência do cache aceita sobrescrever fonte de peso IGUAL",
    dor: "Com `<` em vez de `<=`, reprocessar a mesma importação sobrescreve a linha toda vez — e o objetivo declarado da Fase 1 ('não geocodificar novamente o mesmo endereço') deixa de valer justamente no caso que mais acontece: o reprocessamento.",
    de: `  if v_peso_atual is not null and v_peso_novo <= v_peso_atual and p_fonte <> 'manual' then`,
    para: `  if v_peso_atual is not null and v_peso_novo < v_peso_atual and p_fonte <> 'manual' then`,
  },
  {
    id: "M139", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "o índice GIST perde a opclass qualificada",
    dor: "Com postgis instalada em `extensions`, `using gist (geo)` só resolve a opclass se `extensions` estiver no search_path de quem aplica. Para quem aplicar com outro search_path, a migration ABORTA — e como este é o índice do raio, o `db push` morre no meio, depois de já ter criado a coluna e a tabela.",
    de: `  on public.developments using gist (geo extensions.gist_geography_ops);`,
    para: `  on public.developments using gist (geo);`,
  },

  {
    id: "M168", arquivo: "lib/crm/venda-sem-valor.ts",
    quebra: "venda com valor zero ou ilegivel passa a contar como informada",
    dor: "Venda de zero real nao existe, e tratar NaN como informado esconde dado corrompido atras de um verde. A venda sairia da cobranca sem nunca ter valor: VGV zerado, ROI incalculavel e o evento Purchase nunca emitido — os quatro efeitos de uma linha so.",
    de: `  return !Number.isFinite(numero) || numero <= 0;`,
    para: `  return false;`,
  },
  {
    id: "M169", arquivo: "lib/crm/venda-sem-valor.ts",
    quebra: "venda sem ancora de tempo passa a ser declarada critica",
    dor: "Afirmar atraso sem saber desde quando e inventar o dado que falta. A fila de excecao do diretor encheria de prioridade forjada, e prioridade forjada ensina a ignorar a fila — foi assim que o aviso de SLA virou ruido nesta base.",
    de: `    critico: dias !== null && dias >= DIAS_PARA_COBRANCA_CRITICA,`,
    para: `    critico: true,`,
  },
  {
    id: "M99", arquivo: "app/api/v1/crm/vendas-sem-valor/route.ts",
    quebra: "o corretor passa a informar o valor da venda de um colega",
    dor: "Valor de venda e a base da comissao. Sem o piso de carteira no POST, um corretor mexe no dinheiro do outro — e o piso da LEITURA continuaria intacto, entao a suite ficaria verde pela metade certa.",
    de: `  if (!leLiderancaInteira(acesso.access.profile) && !daMinhaCarteira) {`,
    para: `  if (false) {`,
  },

  // ── MATCHING IMOBILIÁRIO POR REGRAS (4.5) ─────────────────────────────────
  //
  // O motor de compatibilidade existe para ser HONESTO COM A AUSÊNCIA. Todas as
  // mutações abaixo atacam essa honestidade por um ângulo diferente, porque é
  // ela — não o score — que decide se o corretor pode confiar no resultado.
  //
  // ⚠ NUMERAÇÃO M45xx, e não a sequência: este arquivo é editado por vários
  // agentes ao mesmo tempo. Estas mutações nasceram M103–M110 e COLIDIRAM em
  // minutos com as M103–M110 de outra frente (geolocalização/PostGIS) — dois
  // blocos diferentes com o mesmo id, no mesmo arquivo. O prefixo 45 amarra o id
  // à frente 4.5 e não disputa a sequência global.
  //
  // Sobram duplicados que NÃO são desta frente e ficaram como estavam:
  // M34–M37 e M97–M99 aparecem duas vezes cada. Mexer neles daqui seria editar
  // trabalho de outro agente às cegas.
  {
    id: "M4501", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "critério AUSENTE passa a contar como atendido",
    dor: "É a mentira central que este motor existe para não contar. Medido: das 482 leads da organização com catálogo, 470 não têm critério decisivo algum — com esta quebra, TODAS ganhariam 'compatibilidade alta' construída sobre dado que ninguém coletou. O corretor ligaria oferecendo imóvel escolhido por ignorância, e o painel não teria como ser desmentido.",
    de: `  const atendidos = criterios.filter((c) => c.estado === "atendido");`,
    para: `  const atendidos = criterios.filter((c) => c.estado !== "nao_atendido");`,
  },
  {
    id: "M4502", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "a trava cai: imóvel sem NENHUM critério decisivo volta ao ranking",
    dor: "Foi o defeito pego na execução real: o 'Inside Perdizes' entrava no top 3 com aderência 100% e cobertura 5,6% — os únicos critérios avaliáveis nele eram finalidade e data do cadastro. Um imóvel de que quase nada se sabe apresentado como terceira melhor opção, com 100% ao lado. E o 'Spin Mood', que é só um nome numa linha, viria junto.",
    de: `  const avaliaveis = ordenadas.filter((p) => p.decisivosAvaliados >= MINIMO_DE_DECISIVOS_PARA_RECOMENDAR);`,
    para: `  const avaliaveis = ordenadas;`,
  },
  {
    id: "M4503", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "o ranking passa a ordenar por RAZÃO em vez de evidência absoluta",
    dor: "Premia o imóvel de que MENOS se sabe: um cadastro com uma coluna preenchida e batendo dá 100% e passa na frente do que atende preço, bairro e dormitórios. O corretor recebe como 'mais compatível' justamente o imóvel sobre o qual ninguém checou nada.",
    de: `      b.pontos - a.pontos || b.cobertura - a.cobertura || a.nome.localeCompare(b.nome, "pt-BR"),`,
    para: `      (b.aderencia ?? 0) - (a.aderencia ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),`,
  },
  {
    id: "M4504", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "coordenada volta a passar pelo validador que recusa negativo",
    dor: "Latitude de São Paulo é -23,53: o Brasil inteiro volta a cair como 'imóvel sem latitude/longitude'. Não é score errado, é a resposta mandando a operação preencher coluna JÁ preenchida — a mesma classe de erro que fez o painel Clientes 360 cobrar dado de 174 clientes que o tinham, e ensinou a operação a ignorar o painel.",
    de: `  const oLat = coordenada(o.latitude, 90);`,
    para: `  const oLat = numero(o.latitude);`,
  },
  {
    id: "M4505", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "`0 dormitório` (studio) volta a ser lido como dado ausente",
    dor: "Studio é o produto PRINCIPAL do catálogo (Tiê Aclimação tem bedrooms_min 0, e 2 clientes reais pedem 0). Com `||` no lugar de `??`, o pedido de studio vira 'cliente não informou' — e o único encaixe que a base consegue provar hoje desaparece justamente para quem pediu.",
    de: `  const querido = c.preferred_bedrooms ?? c.bedrooms ?? null;`,
    para: `  const querido = c.preferred_bedrooms || c.bedrooms || null;`,
  },
  {
    id: "M4506", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "estoque desconhecido passa a ser somado como ZERO",
    dor: "`0 disponível` é afirmação forte e falsa: diz ESGOTADO onde o certo é 'ninguém contou'. Medido: 6 de 6 tipologias têm units_available nulo — logo os 4 empreendimentos do catálogo seriam declarados esgotados, e o motor recusaria o catálogo inteiro por um dado que nunca existiu.",
    de: `      units_available: estoque.length ? estoque.reduce((s, v) => s + v, 0) : null,`,
    para: `      units_available: estoque.reduce((s, v) => s + v, 0),`,
  },
  {
    id: "M4507", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "entrada passa a ser avaliada SEM os números da regra de pagamento",
    dor: "Viola a lei do dono — 'não inventar condições'. developer_payment_flow_rules tem ZERO linhas: avaliar entrada sem percentual significa arbitrar a condição, e o cliente ouve do corretor um valor que a incorporadora nunca declarou. É a promessa comercial que o produto não pode honrar.",
    de: `  if (preco === null || percentual === null) {`,
    para: `  if (false) {`,
  },
  {
    id: "M4509", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "a entrada volta a passar com QUALQUER valor acima de zero",
    dor: "Era a mentira latente encontrada na revisão adversarial desta própria entrega: o critério dizia 'contra regra declarada do imóvel' sem NUNCA comparar com a entrada exigida. Ficava invisível porque não há regra cadastrada — e no dia da primeira regra o motor aprovaria quem tem R$ 1 de entrada para um imóvel de 400 mil, afirmando que conferiu. Suíte verde não protege ramo inalcançável: só a comparação real protege.",
    de: `    disponivel >= exigida ? "atendido" : "nao_atendido",`,
    para: `    disponivel > 0 ? "atendido" : "nao_atendido",`,
  },
  {
    id: "M4510", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "a parcela que o CLIENTE declarou aceitar passa a ser ignorada",
    dor: "A palavra do cliente é dado; 30% da renda é convenção de banco. Invertida a precedência, o motor diz 'cabe no seu bolso' contrariando o número que a pessoa acabou de dar — e a suposição declarada passa a valer mais que o fato coletado.",
    de: `      parcela <= desejada ? "atendido" : "nao_atendido",`,
    para: `      parcela <= renda ? "atendido" : "nao_atendido",`,
  },
  {
    id: "M4508", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "bairro composto deixa de ser separado na barra",
    dor: "O valor real 'perdizes/pompeia' existe na base. Sem a quebra, esse cliente pede Perdizes e NÃO vê o Inside Perdizes — o imóvel certo fica invisível para quem pediu exatamente ele, sem erro nenhum aparecendo na tela.",
    de: `    .split(/[/,;|]+/)`,
    para: `    .split(/[,;|]+/)`,
  },

  // ── ORÇAMENTO, AUTONOMIA E MODO SOMBRA DA IA (4.7 / 4.8 / §7) ─────────────
  //
  // Cada quebra aqui é uma forma real de o teto ou a proibição virar enfeite:
  // continuar existindo, continuar respondendo, e não proteger nada.
  {
    id: "M111", arquivo: "lib/ai/orcamento-de-ia.ts",
    quebra: "o teto configurado deixa de ser aparado no teto absoluto",
    dor: "Basta alguém escrever 99999999 no JSON (ou um valor errado por engano) e a cobrança fica ilimitada por configuração — exatamente o que o dono proibiu. O estouro só aparece na fatura.",
    de: `  if (numero > absoluto) {
    return {
      valor: absoluto,`,
    para: `  if (false) {
    return {
      valor: absoluto,`,
  },
  {
    id: "M112", arquivo: "lib/ai/orcamento-de-ia.ts",
    quebra: "valor inválido de teto deixa de cair no padrão e passa como está",
    dor: "`null`, `Infinity` ou 'ilimitado' no JSON viram teto infinito. O freio existe, responde, e nunca segura nada — o pior tipo de proteção, porque diz 'conferido'.",
    de: `  if (!Number.isFinite(numero) || numero < 0) {
    return {
      valor: Math.min(padrao, absoluto),`,
    para: `  if (false) {
    return {
      valor: Math.min(padrao, absoluto),`,
  },
  {
    id: "M113", arquivo: "lib/ai/orcamento-de-ia.ts",
    quebra: "decidirSobreOTeto passa a permitir tudo",
    dor: "O limitador continua sendo chamado, continua registrando, e nunca recusa. Um laço infinito de IA gasta a chave do dono até o teto do provedor.",
    de: `  if (pior >= 1 && !essencial) {`,
    para: `  if (false) {`,
  },
  {
    id: "M114", arquivo: "lib/ai/orcamento-de-ia.ts",
    quebra: "custo em dólar não medido volta a valer zero",
    dor: "28,6% das chamadas cobráveis medidas não têm tarifa cadastrada. Tratadas como zero, o teto de dinheiro passa por cima delas afirmando 'gastou zero' — e o dono lê um número que não existe.",
    de: `  if (consumo.usdDoDia !== null) {
    fracoes.push(raia("diario", "usd", consumo.usdDoDia, orcamento.tetos.tetoUsdDiario));`,
    para: `  if (true) {
    fracoes.push(raia("diario", "usd", consumo.usdDoDia ?? 0, orcamento.tetos.tetoUsdDiario));`,
  },
  {
    id: "M115", arquivo: "lib/ai/orcamento-de-ia.ts",
    quebra: "chamada sem usuário deixa de cair no balde e vira teto por usuário",
    dor: "35% do tráfego medido não tem user_id (worker, rota sem sessão). Sem o balde, essas chamadas são contadas contra um usuário que não existe e passam SEM TETO — a via de fuga fica maior que a estrada.",
    de: `    semUsuario
      // 35% do tráfego medido não tem usuário. Sem esta raia, ele não teria teto.
      ? raia("sem_atribuicao", "chamadas", consumo.chamadasDoUsuario, orcamento.semAtribuicao.chamadasPorDia)
      : raia("usuario", "chamadas", consumo.chamadasDoUsuario, orcamento.tetos.chamadasPorUsuarioPorDia),`,
    para: `    raia("usuario", "chamadas", semUsuario ? 0 : consumo.chamadasDoUsuario, orcamento.tetos.chamadasPorUsuarioPorDia),`,
  },
  {
    id: "M116", arquivo: "lib/ai/orcamento-de-ia.ts",
    quebra: "array/booleano no JSON deixa de ser recusado e vira teto por coerção",
    dor: "`Number([])` é 0: um `[]` no arquivo pausaria a IA inteira em silêncio, e `[\"150\"]` viraria 150 por acidente. O sintoma ('a IA não responde') não aponta para a configuração.",
    de: `      : typeof configurado === "string" && configurado.trim() !== ""
        ? Number(configurado)
        : NaN;`,
    para: `      : Number(configurado);`,
  },
  {
    id: "M117", arquivo: "lib/ai/niveis-de-autonomia.ts",
    quebra: "a classe do nível 5 passa a ser conferida DEPOIS do nível e da aprovação",
    dor: "Um agente nível 4 com aprovação registrada consegue apagar dado, mudar permissão ou retirar RLS. A proibição do dono passa a ser contornável pelo caminho normal, sem ninguém violar regra nenhuma.",
    de: `  if (nivelExigido === NIVEL_PROIBIDO) {`,
    para: `  if (false) {`,
  },
  {
    id: "M118", arquivo: "lib/ai/niveis-de-autonomia.ts",
    quebra: "agente não declarado passa a nascer no nível 4",
    dor: "Todo agente novo pode agir para fora antes de qualquer revisão, e declarar nível vira opcional na prática. Mensagem sai para o cliente sem ninguém ter aprovado o agente.",
    de: `  return encontrado ? encontrado.nivel : 0;`,
    para: `  return encontrado ? encontrado.nivel : 4;`,
  },
  {
    id: "M119", arquivo: "lib/ai/niveis-de-autonomia.ts",
    quebra: "nível 5 volta a ser declarável no catálogo",
    dor: "Um agente se declara nível 5 no JSON e as travas de nível deixam de recusá-lo. O 'proibido autonomamente' passa a ser só uma linha de documentação.",
    de: `    if (nivel === NIVEL_PROIBIDO) {`,
    para: `    if (false) {`,
  },
  {
    id: "M120", arquivo: "lib/ai/niveis-de-autonomia.ts",
    quebra: "ação externa deixa de exigir aprovação registrada",
    dor: "Campanha sobe e mensagem sai para o cliente sem quem/quando/porquê registrado. Quando der problema, não há como saber quem autorizou.",
    de: `  if (nivelExigido >= 4 && !aprovacaoRecebida) {`,
    para: `  if (false) {`,
  },
  {
    id: "M121", arquivo: "lib/ai/niveis-de-autonomia.ts",
    quebra: "ação desconhecida passa a exigir nível 0 em vez de 4",
    dor: "Qualquer verbo que ninguém classificou passa a ser executável pelo agente mais restrito. O erro só aparece depois de a ação externa ter acontecido.",
    de: `  return NIVEL_EXIGIDO[nome] ?? 4;`,
    para: `  return NIVEL_EXIGIDO[nome] ?? 0;`,
  },
  {
    id: "M122", arquivo: "lib/ai/modo-sombra.ts",
    quebra: "o modo sombra passa a nascer DESLIGADO quando o arquivo não é legível",
    dor: "Ação externa dispara exatamente no dia em que a configuração quebrou, e ninguém liga uma coisa à outra. É implantar agente autônomo sem Shadow Mode, que é o que o dono proibiu.",
    de: `  return valor !== false;`,
    para: `  return valor === true;`,
  },
  {
    id: "M123", arquivo: "lib/ai/modo-sombra.ts",
    quebra: "a sombra deixa de reter quando a autonomia é suficiente",
    dor: "Aprovação válida fura a sombra: 'shadow mode' vira outro nome para o fluxo normal de aprovação, e a comparação recomendação x decisão x resultado nunca acumula caso nenhum.",
    de: `  if (sombra) {
    return {
      retido: true,`,
    para: `  if (sombra && !autonomia.permitido) {
    return {
      retido: true,`,
  },
  {
    id: "M124", arquivo: "lib/ai/modo-sombra.ts",
    quebra: "a taxa de concordância volta a ser zero quando não há caso comparável",
    dor: "'0% de acerto' e 'não houve o que medir' viram a mesma coisa. Alguém desliga um agente bom — ou liga um ruim — com base num número que não existe.",
    de: `    taxaDeConcordancia: comparaveis.length ? concordou / comparaveis.length : null,`,
    para: `    taxaDeConcordancia: comparaveis.length ? concordou / comparaveis.length : 0,`,
  },
  {
    id: "M125", arquivo: "lib/ai/provider-router.ts",
    quebra: "o roteador para de perguntar ao teto antes de gastar",
    dor: "Todo o orçamento — tabela, tetos, degraus, contratos — continua existindo e nada mais o consulta. É o modo de falha mais fácil de introduzir: o limitador fica perfeito e desconectado.",
    de: `  if (!teto.permitido) {`,
    para: `  if (false) {`,
  },

  /* ── §8 CENTRO DE CUSTO DE TECNOLOGIA ──────────────────────────────────────
   * A frente inteira existe para que "não medido" nunca vire 0. Estas quebras
   * são as cinco formas de fazer o painel mentir sem que nada pareça errado.
   * ─────────────────────────────────────────────────────────────────────────── */
  {
    id: "M126", arquivo: "lib/finops/centro-de-custo.ts",
    quebra: "'não medido' passa a ser gravado como custo medido de zero",
    dor: "A fatura da Hostinger, o preço da mensagem e o domínio somam R$ 0,00 e o painel fecha com cobertura 100%. O dono decide verba sobre um total que afirma que o que ele paga é de graça.",
    de: `  return { estado: "nao_medido", motivo: motivo.trim() || "motivo não declarado" };`,
    para: `  return { estado: "medido", valorUsd: 0, fonte: "banco", comoFoiMedido: motivo };`,
  },
  {
    id: "M127", arquivo: "lib/finops/centro-de-custo.ts",
    quebra: "o portão de publicação para de conferir campo numérico em linha não medida",
    dor: "Volta a ser possível publicar {estado:'nao_medido', valorUsd:0}. O painel mostra 'não medido' na tela e entrega zero para quem soma o JSON — as duas verdades ao mesmo tempo.",
    de: `  const CAMPOS_NUMERICOS_PROIBIDOS = ["valorUsd", "valorBrl", "valor", "total", "custo", "estimadoUsd"];`,
    para: `  const CAMPOS_NUMERICOS_PROIBIDOS = [];`,
  },
  {
    id: "M128", arquivo: "lib/finops/centro-de-custo.ts",
    quebra: "custo unitário com denominador zero devolve zero em vez de 'não medido'",
    dor: "Com 0 venda no mês, 'custo por venda: R$ 0,00'. O painel afirma que vender não custou nada, e a métrica que o gate da Fase 2 exige nasce falsa.",
    de: `    return custoNaoMedido(
      \`0 \${nomeDoDenominador} no período — divisão por zero não é zero, e o custo unitário fica indefinido\`,
    );`,
    para: `    return custoMedido(0, "banco", "sem denominador");`,
  },
  {
    id: "M129", arquivo: "lib/finops/centro-de-custo.ts",
    quebra: "sem taxa de câmbio declarada, o total em reais passa a ser zero",
    dor: "O gasto medido é em dólar e o teto da Fase 1 é em reais. Com R$ 0,00 inventado, o alerta diz '0% do teto' e nunca dispara — o painel fica verde para sempre.",
    de: `    return custoNaoMedido(
      "conversão para reais indisponível: ATLAS_USD_BRL não está declarada. Taxa de câmbio é preço — sem declaração, não se estima.",
    );`,
    para: `    return custoMedido(0, "banco", "sem taxa");`,
  },
  {
    id: "M130", arquivo: "lib/finops/centro-de-custo.ts",
    quebra: "o percentual do teto volta a ser ARREDONDADO antes de decidir o degrau",
    dor: "R$ 249,99 de R$ 250,00 arredonda para 100,00% e o painel grita 'TETO ESTOURADO' com um centavo de folga. Depois do segundo alerta falso ninguém olha mais o vermelho — e o estouro de verdade passa.",
    // Trocar SÓ o `razao >= nivel` do laço não bastava: com o piso na exibição a
    // quebra ficava inofensiva e a mutação sobrevivia sem haver defeito. A
    // quebra real é o arredondamento, e é ele que a mutação restaura.
    de: `  const razao = (gastoMedidoBrl / tetoBrl) * 100;
  const percentualDoTeto = Math.floor(razao * 100) / 100;`,
    para: `  const razao = Math.round((gastoMedidoBrl / tetoBrl) * 10000) / 100;
  const percentualDoTeto = razao;`,
  },
  {
    id: "M131", arquivo: "lib/finops/centro-de-custo.ts",
    quebra: "a linha de mensagens passa a alegar custo zero mesmo com mensagem enviada",
    dor: "Na primeira mensagem ao cliente o painel afirma que WhatsApp é de graça. O preço por janela de conversa não está em nenhuma tabela deste banco — e o painel deixa de avisar disso justamente quando passa a existir gasto.",
    de: `  return { ...base, custo: custoNaoMedido(\`\${input.volume} mensagem(ns) no período. \${input.motivoDoPrecoDesconhecido}\`), consumo };`,
    para: `  return { ...base, custo: custoMedido(0, "banco", "sem preço por mensagem"), consumo };`,
  },

  /* ── 6.9 · PREVISÃO COM GOVERNANÇA DE MODELO ──────────────────────────────
   *
   * Medido em 2026-07-30 no banco canônico: UM desfecho de ganho, ZERO de perda,
   * ZERO venda com valor apurado. Nessas condições o único comportamento correto
   * é RECUSAR todo modelo estatístico. As quebras abaixo desfazem exatamente as
   * recusas — se alguma sobreviver, o registro é decorativo.
   */
  {
    id: "M140", arquivo: "lib/ai/registro-de-modelos.ts",
    quebra: "o registro deixa de exigir baseline em modelo estatístico",
    dor: "\"Probabilidade de conversão: 78%\" com UM desfecho apurado no banco. O corretor acredita, prioriza a lead errada e abandona a certa — e não tem como saber que o número é chute.",
    de: `    if (!b) {
      motivos.push("sem baseline — não elegível a produção");
    } else {`,
    para: `    if (!b) {
      /* baseline deixou de ser exigido */
    } else {`,
  },
  {
    id: "M141", arquivo: "lib/ai/registro-de-modelos.ts",
    quebra: "o piso de exemplos cai de 100 para 1",
    dor: "Um único lead fechado passa a autorizar previsão de vendas para a diretoria inteira. É a mesma mentira do M132, entrando por um número em vez de por um if.",
    de: `export const MINIMO_DE_EXEMPLOS = 100;`,
    para: `export const MINIMO_DE_EXEMPLOS = 1;`,
  },
  {
    id: "M142", arquivo: "lib/ai/registro-de-modelos.ts",
    quebra: "o DESLIGAR para de recusar o modelo",
    dor: "O diretor desliga um modelo que está errando e ele continua respondendo. O botão de desligar existe na tela e não faz nada — pior que não existir.",
    de: `  if (!modelo.ativo) motivos.push("desligado no registro");`,
    para: `  if (false) motivos.push("desligado no registro");`,
  },
  {
    id: "M143", arquivo: "lib/ai/registro-de-modelos.ts",
    quebra: "amostra ZERO de drift passa a ser lida como monitorada",
    dor: "Os 8 relatórios do banco têm current_sample = 0. A tela passa a dizer 'drift estável' onde não houve observação nenhuma — a IA parece saudável justamente porque ninguém mediu.",
    de: `  if (amostraDoUltimoRelatorio <= 0) {`,
    para: `  if (false) {`,
  },
  {
    id: "M144", arquivo: "lib/ai/ledger-de-projecao.ts",
    quebra: "a linha JÁ fechada do ledger volta a aceitar novo realizado",
    dor: "O fechamento de segunda-feira sobrescreve o de domingo e o desfecho auditado desaparece sem rastro. O viés que a IA aprende passa a depender de qual worker rodou por último.",
    de: `  if (linha.realized_at_week !== null || linha.realized_leads_delta !== null) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M145", arquivo: "lib/ai/ledger-de-projecao.ts",
    quebra: "toda projeção passa a ser gravada como se tivesse amostra medida",
    dor: "Projeção sem lastro que por sorte acertou passa a calibrar a confiança. A IA fica CONFIANTE com base em acerto aleatório, que é pior que ficar insegura com base em nada.",
    de: `            measured: projecao.basis.measured,`,
    para: `            measured: true,`,
  },
  {
    id: "M146", arquivo: "lib/ai/previsao-aritmetica.ts",
    quebra: "a carga média passa a dividir só por quem TEM carteira",
    dor: "468 leads em 3 de 12 corretores viram média de 156 em vez de 39, e a distribuição parece saudável. Os nove de carteira vazia desaparecem do relatório que existe para encontrá-los.",
    de: `  const cargaMedia = r2(totalDeLeads / ranking.length);`,
    para: `  const cargaMedia = r2(totalDeLeads / Math.max(1, ranking.length - semCarteira.length));`,
  },
  {
    id: "M147", arquivo: "lib/ai/previsao-aritmetica.ts",
    quebra: "vazão zero volta a produzir um número em vez de 'não previsível'",
    dor: "Divisão por zero vira Infinity, que serializa como null em JSON: a tela mostra o campo de prazo vazio, sem erro e sem explicação, e o gestor conclui que a fila esvazia sozinha.",
    de: `  if (vazaoSemanal <= 0) {`,
    para: `  if (false) {`,
  },

  // ── A CONSOLIDAÇÃO DA CONCENTRAÇÃO (M154..M157, 2026-07-30) ───────────────
  //
  // Havia DUAS contas de carga e concentração de carteira, criadas por frentes
  // paralelas na mesma noite: `cargaDaEquipe` aqui e a desigualdade própria de
  // `gargalosDaOperacao` no gêmeo digital. Viraram uma — a do gêmeo morreu.
  //
  // Estas quatro quebras guardam o que a fusão descobriu, e nenhuma das duas
  // descobertas estava no plano:
  //
  //   · As contas NÃO concordavam inteiramente. "maior carga ÷ média > 1" e
  //     "fatia > 1 ÷ corretores" são a mesma desigualdade em álgebra e não em
  //     ponto flutuante: em [334, 333, 333] o gêmeo acusava e esta aqui não,
  //     porque dividia por uma média já arredondada em duas casas. M154 é essa
  //     borda.
  //
  //   · Unificar a conta sem unificar a RÉGUA de "lead aberto" trocaria uma
  //     divergência por outra — 112 pela régua da RPC contra 110 pela da
  //     listagem, medido na carteira de ddcorretorsp em 2026-07-30. M155 e M156
  //     são as duas metades disso: exigir a régua, e o gêmeo declarar a certa.
  {
    id: "M154", arquivo: "lib/ai/previsao-aritmetica.ts",
    quebra: "o veredito de concentração volta a sair do número ARREDONDADO de exibição",
    dor: "É a divergência original, ressuscitada dentro da função que a resolveu. Com [334, 333, 333] a razão de exibição arredonda para 1,00 e o painel declara 'perfeitamente distribuído' com uma carteira acima da média — enquanto a régua antiga do gêmeo, que acusava, foi apagada. O gestor perde o gargalo justamente na faixa em que ele é discreto o bastante para ninguém notar a olho.",
    de: `  const concentrada = cargaMaxima * ranking.length > totalDeLeads;`,
    para: `  const concentrada = (concentracao ?? 0) > 1;`,
  },
  {
    id: "M155", arquivo: "lib/ai/previsao-aritmetica.ts",
    quebra: "a régua de 'lead aberto' deixa de ser exigida e qualquer rótulo passa",
    dor: "A mesma carteira vale 112 pela régua da RPC e 110 pela da listagem — medido. Uma conta que aceita qualquer régua (ou nenhuma) publica um número de carteira que não é comparável com nenhum outro da base, e a comparação acontece de qualquer jeito: é o mesmo defeito de `pipeline_history` vs `pipeline_stage_moves`, só que agora com um nome de função a menos para culpar.",
    de: `  const reguaDeclarada = Object.prototype.hasOwnProperty.call(REGUAS_DE_ABERTO, String(regua));`,
    para: `  const reguaDeclarada = true;`,
  },

  // ── FRENTE 6.4 GÊMEO DIGITAL DA OPERAÇÃO (M103..M110, M148..M153, M156/M157)
  //
  // Quem as mata é tests/contracts/gemeo-digital.test.mjs, que CHAMA o módulo —
  // nenhuma asserção dele procura palavra em arquivo fonte, e M105 existe para
  // provar isso.
  //
  // A doença que este bloco guarda é uma só: número comercial inventado saindo
  // com cara de medição. Medido em 2026-07-30 na base canônica: 1 lead em etapa
  // `ganho`, ZERO com `sale_value_brl`. Não existe taxa de conversão nesta
  // operação, então toda projeção de venda ou receita é chute — e chute com
  // aparência de conta é o dano que o dono proibiu por escrito.
  //
  // M103, M104 e M105 são as que importam mais: as três desligam a recusa por
  // caminhos diferentes. Se uma for pega e as outras sobreviverem, o contrato
  // virou específico de um caminho e o próximo passa.
  {
    id: "M103", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a recusa de projetar sem baseline fica inalcançável",
    dor: "A rota passa a publicar receita e conversão projetadas sobre ZERO venda apurada. O diretor lê 'receita esperada R$ 0' — ou pior, um número qualquer — como se fosse medição, e decide verba sobre ele. É exatamente a regra que o dono cravou: não inventar métrica comercial.",
    de: `  if (amostra < minimo) {`,
    para: `  if (false) {`,
  },
  {
    id: "M104", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "o piso de vendas para projetar cai para zero",
    dor: "UMA venda passa a autorizar taxa de conversão, e com uma venda a taxa balança 100% a cada negócio novo. É o mesmo defeito do M103 pela porta da constante — afrouxar o piso 'só um pouco' é o conserto tentador que ninguém revisa.",
    de: `export const MINIMO_DE_VENDAS_PARA_TAXA = 20;`,
    para: `export const MINIMO_DE_VENDAS_PARA_TAXA = 0;`,
  },
  {
    id: "M105", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "etapa `ganho` volta a valer como venda apurada",
    dor: "É o atalho mais tentador que existe nesta base: 1 lead ESTÁ em `ganho`. Contar etapa como venda produz ticket médio dividindo por zero dinheiro e taxa de conversão sobre declaração de corretor. Etapa é declaração, valor é fato — e a coluna sale_value_brl está vazia em 482 de 482.",
    de: `  const amostra = estado.lastro.vendasComValorApurado;`,
    para: `  const amostra = estado.lastro.ganhosRegistrados;`,
  },
  {
    id: "M106", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "as portas da execução real deixam de zerar o movimento",
    dor: "O painel promete mover 200 leads hoje. MEDIDO executando a consulta de candidatos da RPC contra a base viva em 2026-07-30: 11 substitutos passam por equipe/papel/atividade e ZERO passam pela presença de 90s, então `redistribute_absent_broker_leads` levanta absence_no_eligible_replacement no primeiro lead e a transação aborta inteira. O diretor clica, nada acontece, e o painel continua prometendo.",
    de: `  if (portas.some((p) => p.bloqueiaTudo && !p.atendida)) return 0;`,
    para: `  void portas;`,
  },
  {
    id: "M107", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "presença VELHA volta a contar como presença (a janela deixa de ser conferida)",
    dor: "commercial_presence tem 2 linhas 'available' com last_seen_at de 2026-07-24 — cinco dias antes da medição. Sem a janela, 'disponível em algum momento da semana passada' vira 'disponível agora', e a simulação promete um destino que o INNER JOIN da RPC recusa. É 'não sei quando' publicado como 'agora'.",
    de: `  return carteira.presencaVistaEmMs >= agoraMs - JANELA_DE_PRESENCA_SEGUNDOS * 1000;`,
    para: `  return true;`,
  },
  {
    id: "M108", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a fronteira de equipe desaparece da simulação",
    dor: "A RPC só move lead DENTRO da equipe (p.reports_to = manager do corretor ausente). Sem essa porta, o gêmeo conta corretor de outro gerente como destino válido e promete uma redistribuição que o banco não faz — e numa organização com mais de um gerente o número fica silenciosamente inflado.",
    de: `    (c) => c.id !== origem.id && c.gerenteId !== null && c.gerenteId === origem.gerenteId,`,
    para: `    (c) => c.id !== origem.id,`,
  },
  {
    id: "M109", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "o rótulo de estimativa passa a dizer MEDIDO",
    dor: "O documento da fase exige, com estas palavras, que toda simulação seja marcada como estimativa. Um cenário rotulado MEDIDO é uma projeção sem baseline vestida de fato — e esta mutação também prova que o contrato compara o LITERAL, não a constante importada (que mudaria junto e deixaria o teste verde).",
    de: `export const ROTULO_DE_ESTIMATIVA = "ESTIMATIVA" as const;`,
    para: `export const ROTULO_DE_ESTIMATIVA = "MEDIDO" as const;`,
  },
  {
    id: "M110", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "ticket médio não medido passa a valer zero",
    dor: "Ausência publicada como zero — a doença desta base em miniatura. 'Ticket médio R$ 0' se lê como 'as vendas não valeram nada', não como 'ninguém somou'. E zero entra em multiplicação: toda receita projetada sai 0 sem ninguém entender por quê.",
    de: `  const ticketMedioBrl = receita !== null && amostra > 0 ? r2(receita / amostra) : null;`,
    para: `  const ticketMedioBrl = receita !== null && amostra > 0 ? r2(receita / amostra) : 0;`,
  },
  {
    id: "M148", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "o detector de concentração passa a acusar sempre",
    dor: "O outro lado do filtro, que é onde este tipo de guarda morre nesta base: um detector que acusa toda operação — inclusive a perfeitamente distribuída — ensina o gestor a ignorar a lista de gargalos em dois dias. Junto com o ruído vai o gargalo real dos 272 leads numa pessoa.",
    // REESCRITA em 2026-07-30, com a consolidação da concentração: a
    // desigualdade `fatia > 1 / ativos` que esta mutação quebrava não existe
    // mais — o veredito vem de `cargaDaEquipe`. A propriedade guardada é a
    // mesma; só mudou a linha onde ela mora.
    de: `  if (carga.concentrada && maisCheia) {`,
    para: `  if (maisCheia) {`,
  },
  {
    id: "M156", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "o gêmeo passa a declarar a régua da LISTAGEM enquanto conta pela da RPC",
    dor: "A metade silenciosa da consolidação. `contaComoAbertoNaRedistribuicao` continua contando 112 e o rótulo que viaja no resultado passa a dizer 110 — um número medido por uma régua, publicado com o nome da outra. É pior que a divergência original, porque agora a régua errada vem CARIMBADA de certa e quem comparar com a listagem vai achar que confere.",
    de: `export const REGUA_DA_CARTEIRA: ReguaDeAberto = "rpc_redistribuicao";`,
    para: `export const REGUA_DA_CARTEIRA: ReguaDeAberto = "listagem_de_leads";`,
  },
  {
    id: "M157", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a simulação volta a ter a própria definição de 'carteira mais cheia'",
    dor: "A duplicação renascendo pela porta pequena. Com duas carteiras empatadas, o gargalo nomeia uma pessoa e a simulação logo abaixo nomeia outra, na MESMA tela, com os mesmos dados — porque um desempata pelo id e o outro pela ordem em que o banco devolveu as linhas. Ninguém lê isso como bug: lê como se os dois painéis falassem de coisas diferentes.",
    de: `    const maisCheia = carteiraMaisCheia(estado.carteiras);`,
    para: `    const maisCheia = [...estado.carteiras].sort((a, b) => b.abertos - a.abertos)[0] ?? null;`,
  },
  {
    id: "M149", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a simulação passa a ratear entre gente que não existe",
    dor: "Pedir 40 corretores numa equipe de 12 devolve 'carga de 9,6 por pessoa' e o gestor planeja em cima disso. Simulação que inventa capacidade é pior que simulação nenhuma: ela responde exatamente o que se quer ouvir.",
    de: `  const participantes = Math.max(0, Math.min(pedidos, ativos));`,
    para: `  const participantes = Math.max(0, pedidos);`,
  },
  {
    id: "M150", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a régua de carteira aberta diverge da régua da RPC",
    dor: "MEDIDO em 2026-07-30: a carteira de ddcorretorsp tem 112 leads abertos pela régua da RPC e 110 pela régua da listagem (comprou_outro). O gêmeo publica 'quantos leads moveriam'; contar 110 e a execução mexer em 112 é a classe 'duas verdades' que já mordeu este repositório em quatro pares de nomes diferentes.",
    de: `  return !(ETAPAS_FECHADAS_NA_REDISTRIBUICAO as readonly string[]).includes(normalizado);`,
    para: `  return !([...ETAPAS_FECHADAS_NA_REDISTRIBUICAO, "comprou_outro"] as readonly string[]).includes(normalizado);`,
  },
  {
    id: "M152", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "presença sem DATA volta a contar como presente",
    dor: "Linha de commercial_presence com last_seen_at nulo declara o corretor presente para sempre: sem data não há janela que expire. É a mesma doença que M77 guarda em estado-de-credencial — 'não sei quando' publicado como 'agora' — e aqui ela promete um destino de redistribuição que o banco recusa.",
    de: `  if (carteira.presencaVistaEmMs === null) return false;`,
    para: `  if (carteira.presencaVistaEmMs === null) return true;`,
  },
  {
    id: "M153", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a presença deixa de exigir disponibilidade e olha só a recência",
    dor: "O outro lado da mesma função: quem marcou 'ocupado'/'offline' há trinta segundos passa a receber lead. A RPC exige availability='available' E recência; cobrar só uma das duas metades quebra a que sobrou em silêncio.",
    de: `  if (!carteira.presencaDisponivel) return false;`,
    para: `  void carteira.presencaDisponivel;`,
  },
  {
    id: "M151", arquivo: "lib/atlas/gemeo-digital.ts",
    quebra: "a janela de presença do módulo deixa de ser a do banco",
    dor: "A constante é CÓPIA do `interval '90 seconds'` da RPC. Cópia que ninguém confere diverge: com 300s o gêmeo passa a contar como presente quem o INNER JOIN do banco já descartou, e promete um movimento que falha. Esta mutação prova que o contrato ancora a constante no SQL.",
    de: `export const JANELA_DE_PRESENCA_SEGUNDOS = 90;`,
    para: `export const JANELA_DE_PRESENCA_SEGUNDOS = 300;`,
  },

  // ── 6.3 GRAFO DE OPORTUNIDADE DE RECEITA ──────────────────────────────────
  //
  // ⚠ LIMITE HONESTO DESTE GRUPO: o grafo mora em views e funções do Postgres, e
  // `tests/contracts/grafo-de-receita.test.mjs` as EXECUTA no banco. Mutar o
  // arquivo `.sql` na cópia temporária NÃO muda o banco — a suíte ficaria verde
  // sobre uma quebra que não aconteceu, e isso seria um passe falso do próprio
  // mutation testing. Por isso as mutações abaixo atacam o que é executável a
  // partir do arquivo: o JUIZ (lib/crm/grafo-de-receita.ts) e a asserção que lê a
  // migration. O comportamento do SQL está coberto pelo contrato ao vivo, não por
  // mutação de arquivo.
  {
    id: "M158", arquivo: "lib/crm/grafo-de-receita.ts",
    quebra: "medida ausente passa a valer zero em vez de `não medido`",
    dor: "0 e null reprovam igual, mas contam histórias diferentes: 0 diz 'medi e não tem', null diz 'não medi'. É o estado inventado que fez o único evento CAPI desta base ficar 'delivered' com attempts=0 — informação que ninguém produziu, apresentada como fato.",
    de: `      const medido = typeof bruto === "number" && Number.isFinite(bruto) ? bruto : null;`,
    para: `      const medido = typeof bruto === "number" && Number.isFinite(bruto) ? bruto : 0;`,
  },
  {
    id: "M159", arquivo: "lib/crm/grafo-de-receita.ts",
    quebra: "a aptidão do corretor volta a exigir o MAIOR desfecho, não o segundo",
    dor: "Foi o defeito real desta frente: com `desfechos_por_corretor_maximo` a pergunta PASSA com 87 desfechos — que são todos de um corretor só, enquanto o segundo tem 1. O veredicto vira '3 de 7' e o produto passa a ranquear aptidão comercial sobre uma pessoa.",
    de: `      { tipo: "desfechos", medida: "desfechos_por_corretor_2o_maior", minimo: MINIMO_DESFECHOS_PARA_RANQUEAR },`,
    para: `      { tipo: "desfechos", medida: "desfechos_por_corretor_maximo", minimo: MINIMO_DESFECHOS_PARA_RANQUEAR },`,
  },
  {
    id: "M160", arquivo: "lib/crm/grafo-de-receita.ts",
    quebra: "o piso de vitórias para ranquear cai de 10 para 2",
    dor: "2 vitórias é exatamente o que a base tem. Piso calibrado no que já existe aprova tudo por construção — e o painel passa a eleger 'melhor campanha' e 'melhor corretor' a partir de duas vendas.",
    de: `export const MINIMO_DESFECHOS_PARA_RANQUEAR = 10;`,
    para: `export const MINIMO_DESFECHOS_PARA_RANQUEAR = 2;`,
  },
  {
    id: "M161", arquivo: "lib/crm/grafo-de-receita.ts",
    quebra: "`nivelDeEvidencia` chama de rankeável qualquer base acima de zero",
    dor: "Apaga o nível do meio. Uma linha com 1 desfecho passa a viajar sem aviso, e `avisoDaBase` cala — o corretor lê 100% de conversão como se fosse desempenho medido.",
    de: `  if (n >= MINIMO_DESFECHOS_PARA_RANQUEAR) return "rankeavel";`,
    para: `  if (n > 0) return "rankeavel";`,
  },
  {
    id: "M162", arquivo: "lib/crm/grafo-de-receita.ts",
    quebra: "a recomendação de coleta deixa de vir ordenada por quem falha por menos",
    dor: "A lista continua completa e continua verdadeira — só perde a única coisa que a torna acionável. Sem a ordem, a pergunta que está a UM dado de destravar fica no meio de quatro que precisam de dois, e o dono não sabe onde investir primeiro.",
    de: `    .sort((x, y) => x.reprovadas - y.reprovadas);`,
    para: `    .sort(() => 0);`,
  },
  {
    id: "M163", arquivo: "supabase/migrations/20260730100000_grafo_de_oportunidade_de_receita.sql",
    quebra: "uma das views do grafo perde `security_invoker = true`",
    dor: "Este é o primeiro objeto view do banco, e o default do Postgres é `security_invoker = false`: sem a cláusula a view roda com os privilégios do DONO e ATRAVESSA a RLS de quem consulta. `leads_org_fence` deixa de valer para aquela leitura — um grafo que ignora a cerca é vazamento com nome bonito.",
    de: `create or replace view public.vw_grafo_demanda
with (security_invoker = true) as`,
    para: `create or replace view public.vw_grafo_demanda as`,
  },
  // ── M99/M101 FORAM COM A OFERTA ATIVA (2026-07-30) ────────────────────────
  //
  // As duas vigiavam propriedades da entrega "oferta ativa do acervo", que foi
  // REFUTADA 3 de 3 e guardada em `git stash`. Elas sobreviveram na corrida de
  // 165/168 justamente porque os contratos que as pegavam foram para o stash
  // junto com o codigo — mutacao sem contrato correspondente sempre sobrevive.
  //
  // Deixa-las aqui seria manter dois pontos cegos permanentes no placar. Elas
  // voltam quando a oferta ativa voltar, com as quatro correcoes nomeadas no
  // stash. As propriedades eram: o recorte do acervo em crm/leads nao esconder
  // lead arquivada, e a fila "sem dono" da lideranca nao engolir o acervo.

  // ── AS QUATRO ENTREGAS DE 2026-07-30 ENTRAM NA REDE ───────────────────────
  //
  // Cada uma foi provada por mutacao DIRIGIDA, feita a mao na hora do conserto.
  // Isso prova o contrato naquele instante e nao protege nada depois: mutacao
  // que nao esta aqui nao roda de novo, e o contrato pode ser afrouxado por
  // qualquer refatoracao sem que o placar mude.
  {
    id: "M164", arquivo: "lib/compat/payload-de-lead.ts",
    quebra: "PATCH parcial volta a apagar o e-mail da lead",
    dor: "Era o estado real ate 2026-07-30, medido executando contra lead de verdade: `email: \"…\" → null`. Salvar SO o bairro apagava tambem nome, telefone e origem — os quatro campos pelos quais o corretor alcanca a pessoa. E a captura de resposta decisiva, que grava um campo por vez, depende disso: sem a guarda ela destroi a lead que acabou de qualificar.",
    de: `  const email = sent("email")
    ? (typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null)
    : textoAtual(currentLead.email)?.toLowerCase() ?? null;`,
    para: `  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null;`,
  },
  {
    id: "M165", arquivo: "lib/compat/legacy-v2.ts",
    quebra: "lista VAZIA volta a vencer a coluna que tem o bairro declarado",
    dor: "`first` pula null mas nao pula `[]`. Medido: `preferred_regions` e array VAZIO nas 482 leads e nunca null, entao ela ganhava sempre e as 7 pessoas que declararam bairro apareciam como se nao tivessem declarado nada. A ficha mandava o corretor perguntar de novo o que o cliente ja tinha dito — na mesma tela em que o painel de compatibilidade, que le a coluna certa, dizia o contrario.",
    de: `    preferred_regions: primeiraListaComConteudo(
      row,
      "preferred_regions",
      "preferred_neighborhoods",
      "region",
      "neighborhood",
    ),`,
    para: `    preferred_regions: stringList(first(row, "preferred_regions", "preferred_neighborhoods", "region", "neighborhood")),`,
  },
  {
    id: "M166", arquivo: "lib/integrations/agendador-parado.ts",
    quebra: "o detector passa a acusar agendador parado sem exigir item NUNCA tentado",
    dor: "Item velho JA tentado e worker que acorda e falha — outro problema, outro conserto. Acusar 'agendador parado' nesse caso manda a pessoa reinstalar cron para um defeito que nao e de cron, e foi exatamente a distincao que custou horas para achar: 6 itens `delivered` com attempts=1 conviviam com 2 `pending` com attempts=0, e so os segundos provavam a pane.",
    de: `    agendadorParadoProvavel: nuncaTentadas > 0 && (maisAntigaHoras ?? 0) >= HORAS_PARA_SUSPEITAR,`,
    para: `    agendadorParadoProvavel: (maisAntigaHoras ?? 0) >= HORAS_PARA_SUSPEITAR,`,
  },
  {
    id: "M167", arquivo: "lib/crm/escrita-de-regra-de-comissao.ts",
    quebra: "o premio passa a disputar os 100% da comissao",
    dor: "Premio vem da incorporadora, por unidade, em outra data e outro extrato — nao sai da comissao. Somando junto, a regra COMUM (rateio fechado em 100% mais premio) passa a ser recusada, e o diretor tem de mentir num dos dois campos para conseguir gravar. E o rateio exibido fica maior do que e, quebrando a conferencia com o parceiro no fim do mes.",
    de: `  if (arredondarPct(soma) > 100) {`,
    para: `  if (arredondarPct(soma + (finito(entrada.premioValor) ? entrada.premioValor : 0)) > 100) {`,
  },
];

const copia = mkdtempSync(path.join(tmpdir(), "atlas-mut-"));
process.on("exit", () => { try { rmSync(copia, { recursive: true, force: true }); } catch { /* melhor esforço */ } });

console.log(`Copiando o repositório para ${copia} (o original não é tocado)...`);
execSync(
  `rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git ./ ${JSON.stringify(copia)}/`,
  { cwd: ORIGEM, stdio: "inherit" },
);
symlinkSync(path.join(ORIGEM, "node_modules"), path.join(copia, "node_modules"));

/**
 * O COMANDO DA SUÍTE, com escape para recorte.
 *
 * `ATLAS_MUTACOES_SUITE` permite medir contra um subconjunto de contratos. Existe
 * por um motivo medido em 2026-07-30: vários agentes trabalham neste repositório
 * ao mesmo tempo, e uma entrega em andamento em OUTRO arquivo derruba a suíte
 * inteira — o que aborta a medição no portão "a suíte já falha", mesmo quando os
 * contratos que interessam estão verdes.
 *
 * ⚠ Recorte NÃO substitui a corrida completa. Um mutante pode sobreviver ao
 * recorte e ser pego por um contrato de fora dele, e o número que sai daqui vale
 * só para os contratos que rodaram. Sempre diga qual recorte foi usado.
 */
const COMANDO_DA_SUITE = process.env.ATLAS_MUTACOES_SUITE || "npm run test:contracts";

function falhasDaSuite() {
  try {
    const saida = execSync(`${COMANDO_DA_SUITE} 2>&1`, { cwd: copia, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return Number(saida.match(/ℹ fail (\d+)/)?.[1] ?? -1);
  } catch (e) {
    const saida = String(e.stdout || "") + String(e.stderr || "");
    return Number(saida.match(/ℹ fail (\d+)/)?.[1] ?? 999);
  }
}

console.log("Confirmando que a suíte está verde antes de mutar...");
const base = falhasDaSuite();
if (base !== 0) {
  console.error(`A suíte já falha (${base}) sem nenhuma mutação. Corrija antes de medir.`);
  process.exit(2);
}

const sobreviventes = [];
const naoAplicadas = [];
let pegas = 0;

/**
 * FILTRO OPCIONAL POR ID — `node scripts/mutacoes.mjs M111-M125` ou `M113,M120`.
 *
 * A suíte inteira roda uma vez por mutação. Com 125 mutações isso passa de uma
 * hora, e o efeito prático era ninguém rodar antes de entregar — a ferramenta
 * existia e não era usada. Sem argumento, roda TODAS, como antes: o portão de
 * regressão não muda.
 */
const filtro = process.argv.slice(2).join(",").trim();
const selecionadas = !filtro ? MUTACOES : MUTACOES.filter((m) => {
  const numero = Number(m.id.replace(/\D/g, ""));
  return filtro.split(",").map((parte) => parte.trim()).filter(Boolean).some((parte) => {
    const faixa = parte.match(/^M?(\d+)\s*-\s*M?(\d+)$/i);
    if (faixa) return numero >= Number(faixa[1]) && numero <= Number(faixa[2]);
    return m.id.toUpperCase() === parte.toUpperCase().replace(/^M?/, "M");
  });
});
if (filtro) {
  console.log(`Filtro "${filtro}": ${selecionadas.length} de ${MUTACOES.length} mutações.`);
  if (!selecionadas.length) { console.error("Nenhuma mutação casou com o filtro."); process.exit(2); }
}

for (const m of selecionadas) {
  const alvo = path.join(copia, m.arquivo);
  if (!existsSync(alvo)) { naoAplicadas.push({ ...m, porque: "arquivo não existe" }); continue; }
  const original = readFileSync(alvo, "utf8");
  if (!original.includes(m.de)) {
    // O código mudou de forma. Não é falha da suíte — é a mutação ficando
    // obsoleta, e ela precisa ser reescrita para continuar valendo.
    naoAplicadas.push({ ...m, porque: "o trecho não existe mais — reescreva a mutação" });
    continue;
  }
  writeFileSync(alvo, original.replace(m.de, m.para));
  const falhas = falhasDaSuite();
  writeFileSync(alvo, original);

  if (falhas > 0) { pegas++; console.log(`${m.id}  ✔ PEGA (${falhas} teste[s]) — ${m.quebra}`); }
  else {
    sobreviventes.push(m);
    console.log(`${m.id}  ✘ SOBREVIVEU — ${m.quebra}`);
    console.log(`         dor: ${m.dor}`);
  }
}

const aplicadas = pegas + sobreviventes.length;
console.log(`\n${"═".repeat(72)}`);
console.log(`MUTATION SCORE: ${pegas}/${aplicadas} quebras detectadas`);

if (naoAplicadas.length) {
  console.log(`\n${naoAplicadas.length} mutação(ões) obsoleta(s) — o código mudou de forma:`);
  for (const n of naoAplicadas) console.log(`  ${n.id} ${n.arquivo} — ${n.porque}`);
}

if (sobreviventes.length) {
  console.log(`\nPONTOS CEGOS — a suíte fica verde com isto quebrado:\n`);
  for (const s of sobreviventes) console.log(`  ${s.id} ${s.quebra}\n       → ${s.dor}\n`);
  console.log("Um teste que passa com a funcionalidade quebrada é pior que nenhum:");
  console.log("produz confiança falsa. Torne a asserção comportamental.\n");
  process.exit(1);
}

console.log("\nNenhum ponto cego: toda quebra deliberada foi detectada.");
