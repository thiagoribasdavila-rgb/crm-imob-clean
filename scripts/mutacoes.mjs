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
