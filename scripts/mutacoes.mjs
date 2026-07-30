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
    id: "M34", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "o DDD deixa de exigir o prefixo 55",
    dor: "'971567739185' vira DDD 15 e entra em 'telefone da praça'. O diretor lê um número de atendimento inflado por lixo, e liga para quem não existe.",
    de: `  if (!bruto.startsWith("55")) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M35", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "o comprimento canônico do telefone deixa de ser exigido",
    dor: "Um '5511999' truncado vira DDD 11 na contagem da central e NÃO casa o filtro do banco: a escada diz 147 e o clique abre 146.",
    de: `  if (!(COMPRIMENTOS_CANONICOS as readonly number[]).includes(bruto.length)) return null;`,
    para: `  if (false) return null;`,
  },
  {
    id: "M36", arquivo: "lib/atlas/triagem-da-fila.ts",
    quebra: "praça sem UF nenhuma passa a ser declarada MEDIDA",
    dor: "Com o cadastro incompleto, 100% dos leads viram 'fora da praça'. A escada fica plausível e completamente invertida — e alguém decide parar de trabalhar a fila inteira.",
    de: `  if (!ufs.length) {`,
    para: `  if (false) {`,
  },
  {
    id: "M37", arquivo: "lib/atlas/triagem-da-fila.ts",
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
    id: "M99", arquivo: "app/api/v1/crm/leads/route.ts",
    quebra: "o recorte do acervo volta a esconder lead arquivada",
    dor: "O corretor pega 10 leads do acervo e não vê NENHUMA na lista: 16.733 das 17.151 do v1 estão em `arquivado`, e a lista exclui arquivado em toda consulta. A feature entrega leads invisíveis.",
    de: `    query = acervo
      ? query
          .not("import_batch_id", "is", null)
          .or(filtroDaCarteiraDaPessoa(access.access.user.id))
      : query.not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)");`,
    para: `    query = query.not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)");`,
  },
  {
    id: "M100", arquivo: "app/api/v1/analytics/broker-daily/route.ts",
    quebra: "a central do corretor volta ao predicado sem prazo",
    dor: "O terceiro predicado de atraso (o único que não olhava prazo) volta a divergir dos outros três. Lead de resgate pega há 5 minutos já aparece atrasada na central de quem acabou de pegá-la.",
    de: `    ? activeLeads.filter((lead) => primeiroContatoAtrasado(lead, now)).length`,
    para: `    ? activeLeads.filter((lead) => !lead.first_contacted_at).length`,
  },
  {
    id: "M101", arquivo: "app/api/v1/ai/next-best-action/route.ts",
    quebra: "a fila 'sem dono' da liderança volta a engolir o acervo",
    dor: "Os dois balcões disputam as mesmas linhas: a liderança distribui a lead de acervo como demanda nova enquanto o corretor a pega no auto-serviço. É como nasce a lead com dois donos — e o painel volta a ser 76% acervo e 18% falso positivo.",
    de: `    ? base.is("assigned_user_id", null).is("assigned_to", null).is("import_batch_id", null)`,
    para: `    ? base.is("assigned_user_id", null)`,
  },
  {
    id: "M102", arquivo: "supabase/migrations/20260730010000_oferta_ativa_do_acervo_de_resgate.sql",
    quebra: "o claim perde o `skip locked` na migration",
    dor: "MEDIDO com duas sondas paralelas na base viva: com `skip locked`, duas transações sobrepostas por 2.911ms pegaram 10 leads cada, ZERO em comum. Sem ele, a segunda ESPEROU (6.188ms contra 3.079ms) e voltou com AS MESMAS 10 ids. Num banco reconstruído por esta migration, dois corretores clicando junto recebem o mesmo lote — um deles fica com o lote curto ou vazio, e o outro nunca sabe.",
    de: `    for update skip locked`,
    para: `    for update`,
  },

  // ── FRENTE 4.6 GEOLOCALIZAÇÃO ──────────────────────────────────────────────
  //
  // Todas quebram o ARQUIVO da migration, e é por isso que quem as mata é a
  // PARTE B de tests/contracts/geolocalizacao-em-metros.test.mjs. A PARTE A
  // chama o banco e prova que o comportamento existe DE VERDADE, mas editar um
  // `.sql` não muda o banco já aplicado: uma asserção que só consulta o banco
  // nunca morreria por estas mutações. As duas partes são necessárias.
  {
    id: "M103", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
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
    id: "M104", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "a coluna do ponto vira geometry em vez de geography",
    dor: "MEDIDO no banco: a MESMA distância deu 110.574,4 em geography e 1,0000 em geometry — metro contra GRAU. Um raio de 1000 'metros' passa a varrer ~111.000 km, ou seja o planeta inteiro: 'empreendimentos num raio de 1 km' devolve todos, e a distância exibida ao corretor fica em unidade nenhuma. Nada estoura.",
    de: `  add column if not exists geo extensions.geography(Point, 4326)`,
    para: `  add column if not exists geo extensions.geometry(Point, 4326)`,
  },
  {
    id: "M105", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "empreendimentos_no_raio perde a cerca da organização",
    dor: "A função é `security definer`: ela atravessa a RLS por desenho, e a cerca de inquilino só existe naquela linha. Sem ela, um raio de 50 km em São Paulo devolve os empreendimentos de TODAS as imobiliárias do banco — vazamento entre empresas pela porta da geolocalização, com HTTP 200.",
    de: `    from public.developments d
   where d.organization_id = p_organization_id
     and d.geo is not null`,
    para: `    from public.developments d
   where d.geo is not null`,
  },
  {
    id: "M106", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "a concentração de demanda volta a descartar empreendimento sem bairro",
    dor: "MEDIDO: 192 leads têm empreendimento de interesse e 185 apareciam; as 7 do Spin Mood (neighborhood NULL) DESAPARECIAM sem aviso. Quem somasse a coluna do mapa de demanda leria 185 e confiaria — é a classe 'recorte que esvazia a lista', já paga neste repositório.",
    de: `      coalesce(private.normalizar_endereco(d.neighborhood), '(sem bairro)') as chave,
      coalesce(min(d.neighborhood), '(bairro não informado)')                as regiao,`,
    para: `      private.normalizar_endereco(d.neighborhood) as chave,
      min(d.neighborhood)                         as regiao,`,
  },
  {
    id: "M107", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "o cache de geocodificação nasce sem RLS",
    dor: "`geocode_cache` é GLOBAL (um endereço aponta para o mesmo lugar para toda imobiliária), de propósito, para nunca geocodificar duas vezes. Sem RLS, a chave anon — que vai no bundle do navegador por desenho — lê o cache inteiro: todo endereço que qualquer inquilino já confirmou, para quem souber o nome da tabela.",
    de: `alter table public.geocode_cache enable row level security;`,
    para: `-- alter table public.geocode_cache enable row level security;`,
  },
  {
    id: "M108", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
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
    id: "M109", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "a precedência do cache aceita sobrescrever fonte de peso IGUAL",
    dor: "Com `<` em vez de `<=`, reprocessar a mesma importação sobrescreve a linha toda vez — e o objetivo declarado da Fase 1 ('não geocodificar novamente o mesmo endereço') deixa de valer justamente no caso que mais acontece: o reprocessamento.",
    de: `  if v_peso_atual is not null and v_peso_novo <= v_peso_atual and p_fonte <> 'manual' then`,
    para: `  if v_peso_atual is not null and v_peso_novo < v_peso_atual and p_fonte <> 'manual' then`,
  },
  {
    id: "M110", arquivo: "supabase/migrations/20260730030000_geolocalizacao_inicial_postgis.sql",
    quebra: "o índice GIST perde a opclass qualificada",
    dor: "Com postgis instalada em `extensions`, `using gist (geo)` só resolve a opclass se `extensions` estiver no search_path de quem aplica. Para quem aplicar com outro search_path, a migration ABORTA — e como este é o índice do raio, o `db push` morre no meio, depois de já ter criado a coluna e a tabela.",
    de: `  on public.developments using gist (geo extensions.gist_geography_ops);`,
    para: `  on public.developments using gist (geo);`,
  },

  {
    id: "M97", arquivo: "lib/crm/venda-sem-valor.ts",
    quebra: "venda com valor zero ou ilegivel passa a contar como informada",
    dor: "Venda de zero real nao existe, e tratar NaN como informado esconde dado corrompido atras de um verde. A venda sairia da cobranca sem nunca ter valor: VGV zerado, ROI incalculavel e o evento Purchase nunca emitido — os quatro efeitos de uma linha so.",
    de: `  return !Number.isFinite(numero) || numero <= 0;`,
    para: `  return false;`,
  },
  {
    id: "M98", arquivo: "lib/crm/venda-sem-valor.ts",
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
  {
    id: "M103", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "critério AUSENTE passa a contar como atendido",
    dor: "É a mentira central que este motor existe para não contar. Medido: das 482 leads da organização com catálogo, 470 não têm critério decisivo algum — com esta quebra, TODAS ganhariam 'compatibilidade alta' construída sobre dado que ninguém coletou. O corretor ligaria oferecendo imóvel escolhido por ignorância, e o painel não teria como ser desmentido.",
    de: `  const atendidos = criterios.filter((c) => c.estado === "atendido");`,
    para: `  const atendidos = criterios.filter((c) => c.estado !== "nao_atendido");`,
  },
  {
    id: "M104", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "a trava cai: imóvel sem NENHUM critério decisivo volta ao ranking",
    dor: "Foi o defeito pego na execução real: o 'Inside Perdizes' entrava no top 3 com aderência 100% e cobertura 5,6% — os únicos critérios avaliáveis nele eram finalidade e data do cadastro. Um imóvel de que quase nada se sabe apresentado como terceira melhor opção, com 100% ao lado. E o 'Spin Mood', que é só um nome numa linha, viria junto.",
    de: `  const avaliaveis = ordenadas.filter((p) => p.decisivosAvaliados >= MINIMO_DE_DECISIVOS_PARA_RECOMENDAR);`,
    para: `  const avaliaveis = ordenadas;`,
  },
  {
    id: "M105", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "o ranking passa a ordenar por RAZÃO em vez de evidência absoluta",
    dor: "Premia o imóvel de que MENOS se sabe: um cadastro com uma coluna preenchida e batendo dá 100% e passa na frente do que atende preço, bairro e dormitórios. O corretor recebe como 'mais compatível' justamente o imóvel sobre o qual ninguém checou nada.",
    de: `      b.pontos - a.pontos || b.cobertura - a.cobertura || a.nome.localeCompare(b.nome, "pt-BR"),`,
    para: `      (b.aderencia ?? 0) - (a.aderencia ?? 0) || a.nome.localeCompare(b.nome, "pt-BR"),`,
  },
  {
    id: "M106", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "coordenada volta a passar pelo validador que recusa negativo",
    dor: "Latitude de São Paulo é -23,53: o Brasil inteiro volta a cair como 'imóvel sem latitude/longitude'. Não é score errado, é a resposta mandando a operação preencher coluna JÁ preenchida — a mesma classe de erro que fez o painel Clientes 360 cobrar dado de 174 clientes que o tinham, e ensinou a operação a ignorar o painel.",
    de: `  const oLat = coordenada(o.latitude, 90);`,
    para: `  const oLat = numero(o.latitude);`,
  },
  {
    id: "M107", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "`0 dormitório` (studio) volta a ser lido como dado ausente",
    dor: "Studio é o produto PRINCIPAL do catálogo (Tiê Aclimação tem bedrooms_min 0, e 2 clientes reais pedem 0). Com `||` no lugar de `??`, o pedido de studio vira 'cliente não informou' — e o único encaixe que a base consegue provar hoje desaparece justamente para quem pediu.",
    de: `  const querido = c.preferred_bedrooms ?? c.bedrooms ?? null;`,
    para: `  const querido = c.preferred_bedrooms || c.bedrooms || null;`,
  },
  {
    id: "M108", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "estoque desconhecido passa a ser somado como ZERO",
    dor: "`0 disponível` é afirmação forte e falsa: diz ESGOTADO onde o certo é 'ninguém contou'. Medido: 6 de 6 tipologias têm units_available nulo — logo os 4 empreendimentos do catálogo seriam declarados esgotados, e o motor recusaria o catálogo inteiro por um dado que nunca existiu.",
    de: `      units_available: estoque.length ? estoque.reduce((s, v) => s + v, 0) : null,`,
    para: `      units_available: estoque.reduce((s, v) => s + v, 0),`,
  },
  {
    id: "M109", arquivo: "lib/crm/compatibilidade-imovel.ts",
    quebra: "entrada passa a ser avaliada SEM regra de pagamento declarada",
    dor: "Viola a lei do dono — 'não inventar condições'. developer_payment_flow_rules tem ZERO linhas: avaliar entrada sem ela significa arbitrar percentual e juros, e o cliente ouve do corretor uma condição que a incorporadora nunca declarou. É a promessa comercial que o produto não pode honrar.",
    de: `  if (!o.tem_regra_de_pagamento || preco === null) {
    return monta(
      "valorDeEntrada",
      "falta_oferta",`,
    para: `  if (false) {
    return monta(
      "valorDeEntrada",
      "falta_oferta",`,
  },
  {
    id: "M110", arquivo: "lib/crm/compatibilidade-imovel.ts",
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
];

const copia = mkdtempSync(path.join(tmpdir(), "atlas-mut-"));
process.on("exit", () => { try { rmSync(copia, { recursive: true, force: true }); } catch { /* melhor esforço */ } });

console.log(`Copiando o repositório para ${copia} (o original não é tocado)...`);
execSync(
  `rsync -a --exclude node_modules --exclude .next --exclude dist --exclude .git ./ ${JSON.stringify(copia)}/`,
  { cwd: ORIGEM, stdio: "inherit" },
);
symlinkSync(path.join(ORIGEM, "node_modules"), path.join(copia, "node_modules"));

function falhasDaSuite() {
  try {
    const saida = execSync("npm run test:contracts 2>&1", { cwd: copia, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
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

for (const m of MUTACOES) {
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
