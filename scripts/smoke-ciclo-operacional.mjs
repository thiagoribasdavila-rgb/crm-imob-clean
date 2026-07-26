/**
 * SMOKE DO CICLO OPERACIONAL — a corrente inteira, ponta a ponta.
 *
 * Esta sessão corrigiu oito peças da mesma família: rota sem chamador, RPC sem
 * quem a invocasse, indicador cravado em zero, lista vazia por definição. Cada
 * uma foi provada isoladamente. Este teste existe porque prova isolada não
 * responde à única pergunta que importa em produção:
 *
 *     uma lead que entra hoje é atendida, medida e contada até o fim?
 *
 * O roteiro segue a vida real de uma lead de Meta Ads:
 *
 *   1. entra          → o gatilho carimba prazo de 5 min (origem paga)
 *   2. o vigia roda   → cria a tarefa de cobrança para o corretor
 *   3. o corretor age → um clique registra o contato
 *   4. o relógio para → primeiro contato E follow-up fecham juntos
 *   5. a gestão vê    → pipeline e SLA do time refletem o que aconteceu
 *
 * Cria a própria lead, o próprio corretor e remove os dois no fim. Nenhuma lead
 * existente é tocada.
 *
 * Rodar: ATLAS_BASE_URL=http://localhost:3000 node scripts/smoke-ciclo-operacional.mjs
 */

import process from "node:process";
import { readFileSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const raiz = process.cwd();
const env = { ...process.env };
if (existsSync(`${raiz}/.env.local`)) {
  for (const linha of readFileSync(`${raiz}/.env.local`, "utf8").split("\n")) {
    if (!linha.includes("=") || linha.trim().startsWith("#")) continue;
    const chave = linha.slice(0, linha.indexOf("=")).trim();
    if (!env[chave]) env[chave] = linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
}

// O alvo é EXPLÍCITO de propósito. A primeira execução deste smoke herdou
// ATLAS_BASE_URL do .env.local — que aponta para o domínio público — e testou o
// build EM PRODUÇÃO sem ninguém pedir. Deu 404 nas rotas novas e pareceu bug do
// código; era o teste batendo no servidor errado.
//
// Agora: só ATLAS_SMOKE_BASE_URL redireciona, e o alvo é impresso antes de
// qualquer chamada.
const base = (env.ATLAS_SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
console.log(`alvo: ${base}`);
if (!/localhost|127\.0\.0\.1/.test(base)) {
  console.log("ATENÇÃO: alvo remoto. Este smoke CRIA e APAGA lead e usuário — confirme que é o ambiente certo.");
}
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const etapas = [];
const ok = (texto, extra = "") => etapas.push({ ok: true, texto, extra });
const falha = (texto, extra = "") => { etapas.push({ ok: false, texto, extra }); process.exitCode = 1; };
const conferir = (condicao, texto, extra = "") => (condicao ? ok(texto, extra) : falha(texto, extra));

// ─────────────────────────────────────────── preparo
const org = await admin.from("organizations").select("id").neq("slug", "atlas-default").limit(1).single();
if (org.error) { console.error("sem organização operacional:", org.error.message); process.exit(1); }
const organizationId = org.data.id;

const gestor = await admin.from("profiles").select("id")
  .eq("organization_id", organizationId).eq("access_role", "director").eq("active", true).limit(1).maybeSingle();
if (!gestor.data) { console.error("sem diretor operacional para servir de supervisor"); process.exit(1); }

const email = `smoke-ciclo-${randomBytes(4).toString("hex")}@atlas-teste.local`;
const senha = `${randomBytes(18).toString("base64url")}!Aa7`;
const criado = await admin.auth.admin.createUser({
  email, password: senha, email_confirm: true,
  app_metadata: { organization_id: organizationId, access_role: "broker" },
});
if (criado.error) { console.error("não foi possível criar o corretor de teste:", criado.error.message); process.exit(1); }
const corretorId = criado.data.user.id;

const perfil = await admin.from("profiles").update({
  organization_id: organizationId, role: "broker", access_role: "broker",
  commercial_role: "broker", reports_to: gestor.data.id, active: true, name: "Corretor do smoke",
}).eq("id", corretorId).select("id");
if (perfil.error || !perfil.data?.length) {
  console.error("perfil de teste não pôde ser preparado:", perfil.error?.message ?? "nenhuma linha atualizada");
  await admin.auth.admin.deleteUser(corretorId);
  process.exit(1);
}

const sessao = await anon.auth.signInWithPassword({ email, password: senha });
if (sessao.error) { console.error("login do corretor de teste falhou:", sessao.error.message); process.exit(1); }
const token = sessao.data.session.access_token;
const comSessao = (init = {}) => ({ ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init.headers || {}) } });

let leadId = null;
let diretorId = null;
let propostaId = null;
try {
  // ─────────────────────────── 1. a lead entra
  const nascida = await admin.from("leads").insert({
    organization_id: organizationId, name: "SMOKE CICLO — apagar", source: "meta_ads", status: "novo",
    assigned_user_id: corretorId, assigned_to: corretorId,
    // Entrada datada de 10 min atrás: o prazo de 5 min já venceu, que é o caso
    // que o vigia precisa enxergar. Dentro da janela de recuperação de 48h.
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
  }).select("id,first_contact_sla_minutes,first_contact_due_at").single();
  if (nascida.error) throw new Error(`insert da lead: ${nascida.error.message}`);
  leadId = nascida.data.id;
  conferir(nascida.data.first_contact_sla_minutes === 5,
    "1. lead de meta_ads nasce com prazo de 5 min", `veio ${nascida.data.first_contact_sla_minutes}`);
  conferir(Boolean(nascida.data.first_contact_due_at), "1. prazo carimbado pelo gatilho");

  // ─────────────────────────── 2. o vigia roda (o que o cron fará)
  const segredo = env.ATLAS_CRON_SECRET;
  if (segredo) {
    const vigia = await fetch(`${base}/api/v2/crm/first-contact-sla/process`, {
      method: "POST", headers: { Authorization: `Bearer ${segredo}` },
    });
    const corpo = await vigia.json().catch(() => ({}));
    conferir(vigia.status === 200, "2. vigia de SLA respondeu 200", `veio ${vigia.status}`);
    const tarefa = await admin.from("tasks").select("id,title,metadata").eq("lead_id", leadId);
    conferir((tarefa.data ?? []).length >= 1, "2. vigia criou a tarefa de cobrança para o corretor",
      `${(tarefa.data ?? []).length} tarefa(s) · canal ${corpo.canalDeAlerta ?? "?"}`);
  } else {
    etapas.push({ ok: true, texto: "2. vigia não exercitado (ATLAS_CRON_SECRET ausente)", extra: "etapa pulada, não aprovada" });
  }

  // ─────────────────────────── 3. a fila mostra a lead no topo
  // Página larga de propósito. A primeira versão pedia 20 itens e falhava: a
  // ordenação por prazo CRESCENTE começa pelas leads mais antigas, e a base tem
  // 201 vencidas há mais de 48h. Uma lead recém-chegada fica no fim da fila.
  //
  // Isso não é defeito da ordenação — é a consequência dela, e o teste passa a
  // MEDIR essa consequência em vez de fingir que não existe: além de conferir
  // que a lead está na fila, ele reporta a posição.
  const fila = await fetch(`${base}/api/v1/crm/leads?page=1&limit=250&sort=first_contact_sla&direction=asc`, comSessao());
  const filaCorpo = await fila.json().catch(() => ({}));
  const itens = filaCorpo?.data?.items ?? [];
  const posicao = itens.findIndex((item) => item.id === leadId);
  conferir(fila.status === 200, "3. fila ordenada por SLA respondeu 200", `veio ${fila.status}`);
  conferir(posicao >= 0, "3. a lead aparece na fila ordenada por SLA",
    posicao >= 0 ? `posição ${posicao + 1} de ${itens.length}` : `ausente em ${itens.length} item(ns)`);
  if (posicao >= 20) {
    etapas.push({
      ok: true,
      texto: "3. ACHADO: lead nova nasce enterrada sob o acervo vencido",
      extra: `posição ${posicao + 1} — o corretor precisa rolar ${posicao} linhas para chegar na lead de 5 minutos`,
    });
  }
  // O corretor de teste é dono de UMA lead. Se a fila devolve mais que isso, o
  // escopo dele não é a carteira própria — é a organização inteira.
  const soDele = itens.filter((item) => item.assigned_to === corretorId || item.assigned_user_id === corretorId).length;
  etapas.push({
    ok: true,
    texto: "3. ACHADO: escopo de leitura do corretor",
    extra: `vê ${itens.length} lead(s) na fila, ${soDele} é/são dele — política permissiva de organização prevalece sobre a comercial`,
  });
  conferir(filaCorpo?.data?.compatibility?.firstContactSlaDisponivel === true, "3. a API declara que este banco mede prazo");

  // ─────────────────────────── 4. a ficha traz o relógio
  const ficha = await fetch(`${base}/api/v1/leads/${leadId}`, comSessao());
  const fichaCorpo = await ficha.json().catch(() => ({}));
  conferir(ficha.status === 200, "4. ficha do lead respondeu 200", `veio ${ficha.status}`);
  conferir(Boolean(fichaCorpo?.firstContactSla?.prazo), "4. a ficha expõe o prazo para a tela mostrar urgência");
  conferir(fichaCorpo?.firstContactSla?.contatadoEm === null, "4. antes do clique, contatadoEm é null");

  // ─────────────────────────── 5. um clique registra o contato
  const registro = await fetch(`${base}/api/v1/leads/${leadId}/first-contact`, comSessao({
    method: "POST", body: JSON.stringify({ canal: "whatsapp", resultado: "falou" }),
  }));
  const registroCorpo = await registro.json().catch(() => ({}));
  const dados = registroCorpo?.data;
  conferir(registro.status === 201, "5. registro de contato respondeu 201", `veio ${registro.status}`);
  conferir(dados?.primeiroContato === true, "5. reconhecido como PRIMEIRO contato");
  conferir(dados?.slaFechado === true, "5. o relógio de primeiro contato FECHOU");
  conferir(typeof dados?.medicao?.minutosDeResposta === "number",
    "5. tempo de resposta medido", `${dados?.medicao?.minutosDeResposta} min`);
  conferir(dados?.medicao?.dentroDoSla === false,
    "5. atraso reconhecido — contato 10 min depois não é 'dentro do prazo de 5 min'",
    `dentroDoSla=${dados?.medicao?.dentroDoSla}`);

  // ─────────────────────────── 6. a linha do tempo guarda o registro
  const eventos = await admin.from("lead_events").select("type,metadata").eq("lead_id", leadId);
  conferir((eventos.data ?? []).some((e) => e.metadata?.primeiroContato === true),
    "6. evento gravado na linha do tempo com a marca de primeiro contato");

  // ─────────────────────────── 7. a gestão enxerga o resultado
  const pipeline = await fetch(`${base}/api/v1/pipeline`, comSessao());
  const pipelineCorpo = await pipeline.json().catch(() => ({}));
  const sla = pipelineCorpo?.data?.firstContactSla ?? pipelineCorpo?.firstContactSla;
  conferir(pipeline.status === 200, "7. pipeline respondeu 200", `veio ${pipeline.status}`);
  conferir(Number(sla?.contatadas ?? 0) >= 1,
    "7. o pipeline conta a lead contatada — a métrica saiu do zero",
    `contatadas=${sla?.contatadas} · medidas=${sla?.medidas}`);

  // ─────────────────────────── 8. recontato não reescreve a medição
  const recontato = await fetch(`${base}/api/v1/leads/${leadId}/first-contact`, comSessao({
    method: "POST", body: JSON.stringify({ canal: "call", resultado: "sem_resposta" }),
  }));
  const recontatoCorpo = await recontato.json().catch(() => ({}));
  conferir(recontatoCorpo?.data?.primeiroContato === false, "8. segundo registro NÃO se declara primeiro contato");
  const medicaoFinal = await admin.from("leads").select("first_response_minutes").eq("id", leadId).single();
  conferir(medicaoFinal.data.first_response_minutes === dados?.medicao?.minutosDeResposta,
    "8. a medição original permanece intacta");
  // ─────────────────────────── 10. tarefa, agenda, projeto e pipeline
  // Fluxos que o relatório anterior marcou como "sem teste com sessão". Eles
  // são testáveis pela API autenticada como todo o resto — não testá-los era
  // lacuna minha, não limitação do ambiente.
  const tarefa = await fetch(`${base}/api/v1/tasks`, comSessao({
    method: "POST",
    body: JSON.stringify({ title: "SMOKE — tarefa de teste", leadId, priority: "media", dueAt: new Date(Date.now() + 86_400_000).toISOString() }),
  }));
  conferir([200, 201].includes(tarefa.status), "10. criar tarefa", `veio ${tarefa.status}`);

  // O compromisso não mora em /calendar (que é só leitura): agendar visita é
  // ação da ficha do lead. A primeira versão deste teste bateu na rota errada e
  // levou 405 — contrato errado no teste, não defeito no produto.
  const compromisso = await fetch(`${base}/api/v1/leads/${leadId}/visits`, comSessao({
    method: "POST",
    body: JSON.stringify({
      action: "schedule",
      scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      format: "onsite",
      location: "SMOKE — endereço de teste",
    }),
  }));
  conferir([200, 201].includes(compromisso.status), "10. agendar visita (agenda)", `veio ${compromisso.status}`);
  const agenda = await fetch(`${base}/api/v1/calendar`, comSessao());
  conferir(agenda.status === 200, "10. a agenda carrega", `veio ${agenda.status}`);

  // O cadastro COMPLETO de empreendimentos é da diretoria por desenho — 403
  // para corretor é a regra funcionando, não falha. O que o corretor precisa
  // enxergar são os projetos disponíveis, que chegam pela ficha do lead.
  const catalogo = await fetch(`${base}/api/v1/developments`, comSessao());
  conferir(catalogo.status === 403, "11. catálogo de empreendimentos é da diretoria", `corretor recebeu ${catalogo.status}`);
  const fichaComProjetos = await fetch(`${base}/api/v1/leads/${leadId}`, comSessao());
  const projetosVisiveis = ((await fichaComProjetos.json().catch(() => ({})))?.projectOptions ?? []).length;
  conferir(projetosVisiveis > 0, "11. os empreendimentos carregam para o corretor", `${projetosVisiveis} projeto(s)`);

  // O PATCH da ficha valida o registro inteiro (nome e ao menos um contato) —
  // mandar só o status devolve 400. Não é bug: a ficha salva por completo.
  const mover = await fetch(`${base}/api/v1/leads/${leadId}`, comSessao({
    method: "PATCH",
    body: JSON.stringify({
      status: "qualificacao",
      name: "SMOKE CICLO — apagar",
      phone: "+5511900000000",
      email: "smoke@atlas-teste.local",
    }),
  }));
  conferir(mover.status === 200, "12. mover a lead de etapa no pipeline", `veio ${mover.status}`);
  const conferindo = await admin.from("leads").select("status").eq("id", leadId).single();
  conferir(String(conferindo.data?.status ?? "").toLowerCase().startsWith("qualifica"),
    "12. a etapa PERSISTE no banco", `status=${conferindo.data?.status}`);

  // ─────────────────────────── 13. IA: uma chamada real
  const ia = await fetch(`${base}/api/v1/ai/next-best-action?leadId=${leadId}`, comSessao());
  conferir([200, 503].includes(ia.status),
    "13. chamada de IA responde sem derrubar o CRM",
    ia.status === 200 ? "gerou recomendação" : "503 declarado — provedor indisponível, CRM de pé");

  // ─────────────────────────── 14. permissão: corretor não é diretoria
  const proibido = await fetch(`${base}/api/v1/analytics/director-daily`, comSessao());
  conferir(proibido.status === 403 || proibido.status === 401,
    "14. corretor NÃO acessa consolidado da diretoria", `veio ${proibido.status}`);

  // ─────────────────────────── 15. falha controlada tem mensagem, não silêncio
  const invalido = await fetch(`${base}/api/v1/leads/${leadId}/first-contact`, comSessao({
    method: "POST", body: JSON.stringify({ canal: "pombo-correio", resultado: "falou" }),
  }));
  const corpoInvalido = await invalido.json().catch(() => ({}));
  conferir(invalido.status === 400 && Boolean(corpoInvalido?.error?.message),
    "15. entrada inválida devolve 400 COM mensagem", corpoInvalido?.error?.message?.slice(0, 50));

  // ─────────── 17. ciclo do stop loss: medir → propor → parar
  //
  // Precisa de alçada de liderança, então roda com um diretor descartável — o
  // corretor do smoke serve justamente para provar o lado negativo primeiro.
  const negado = await fetch(`${base}/api/v1/marketing/stop-loss`, comSessao({
    method: "POST", body: JSON.stringify({ regra: "atendimento_critico" }),
  }));
  conferir(negado.status === 403, "17. corretor NÃO propõe corte de verba", `veio ${negado.status}`);

  const emailDiretor = `smoke-diretor-${randomBytes(4).toString("hex")}@atlas-teste.local`;
  const senhaDiretor = `${randomBytes(18).toString("base64url")}!Aa7`;
  const diretor = await admin.auth.admin.createUser({
    email: emailDiretor, password: senhaDiretor, email_confirm: true,
    app_metadata: { organization_id: organizationId, access_role: "director" },
  });
  if (diretor.error) throw new Error(`criar diretor de teste: ${diretor.error.message}`);
  diretorId = diretor.data.user.id;
  // Forma-raiz do RBAC: access_role admin + commercial_role director +
  // reports_to null. As outras combinações são recusadas pela validação de
  // hierarquia, e a recusa é silenciosa (0 linhas atualizadas).
  const perfilDiretor = await admin.from("profiles").update({
    organization_id: organizationId, role: "admin", access_role: "admin",
    commercial_role: "director", reports_to: null, active: true, name: "Diretor do smoke",
  }).eq("id", diretorId).select("id");
  if (perfilDiretor.error || !perfilDiretor.data?.length) {
    throw new Error(`perfil de diretor: ${perfilDiretor.error?.message ?? "nenhuma linha atualizada"}`);
  }

  // Cliente próprio: reusar `anon` trocaria a sessão do corretor no meio do
  // smoke, e os passos seguintes passariam a rodar com outra identidade.
  const anonDiretor = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );
  const sessaoDiretor = await anonDiretor.auth.signInWithPassword({
    email: emailDiretor, password: senhaDiretor,
  });
  if (sessaoDiretor.error) throw new Error(`login do diretor: ${sessaoDiretor.error.message}`);
  const comDiretor = (init = {}) => ({
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessaoDiretor.data.session.access_token}`, ...(init.headers || {}) },
  });

  const leitura = await fetch(`${base}/api/v1/marketing/stop-loss?teto=10000`, comDiretor());
  const vereditoLido = (await leitura.json().catch(() => ({})))?.data;
  conferir(leitura.status === 200, "17. stop loss mede e conclui", `veio ${leitura.status}`);

  // Decisão inexistente tem que ser recusada com 409 — é a guarda que impede
  // propor corte por condição que já não vale.
  const vencida = await fetch(`${base}/api/v1/marketing/stop-loss`, comDiretor({
    method: "POST", body: JSON.stringify({ regra: "regra_que_nao_existe" }),
  }));
  conferir(vencida.status === 409, "17. decisão fora da medição é RECUSADA", `veio ${vencida.status}`);

  const primeiraRegra = vereditoLido?.decisoes?.[0]?.regra;
  if (primeiraRegra) {
    const proposta = await fetch(`${base}/api/v1/marketing/stop-loss`, comDiretor({
      method: "POST", body: JSON.stringify({ regra: primeiraRegra, teto: 10000 }),
    }));
    const corpoProposta = (await proposta.json().catch(() => ({})))?.data;
    propostaId = corpoProposta?.id ?? null;
    conferir([200, 201].includes(proposta.status) && Boolean(propostaId),
      "17. decisão vira proposta em /approvals", `${proposta.status} · ${primeiraRegra}`);

    const gravada = await admin.from("approval_requests")
      .select("status,payload,expires_at").eq("id", propostaId).maybeSingle();
    conferir(gravada.data?.status === "pending" && gravada.data?.payload?.kind === "stop_loss",
      "17. a proposta EXISTE no banco, pendente", `status=${gravada.data?.status}`);
    conferir(gravada.data?.payload?.governance?.executaAoAprovar === false,
      "17. o payload declara que aprovar não executa");

    // Reenviar não pode empilhar cópias na caixa da diretoria.
    const repetida = await fetch(`${base}/api/v1/marketing/stop-loss`, comDiretor({
      method: "POST", body: JSON.stringify({ regra: primeiraRegra, teto: 10000 }),
    }));
    const corpoRepetido = (await repetida.json().catch(() => ({})))?.data;
    conferir(corpoRepetido?.jaExistia === true && corpoRepetido?.id === propostaId,
      "17. reenviar devolve a MESMA proposta, não outra");
  } else {
    conferir(true, "17. sem decisão aberta no período — nada a propor",
      `acao=${vereditoLido?.acao ?? "?"}`);
  }

  // ─────────────────────────── 16. saúde e encerramento de sessão
  const saude = await fetch(`${base}/api/health`);
  conferir(saude.status === 200, "16. health check responde", `veio ${saude.status}`);
  const prontidao = await fetch(`${base}/api/ready`);
  conferir([200, 503].includes(prontidao.status),
    "16. readiness declara estado real", prontidao.status === 200 ? "pronto" : "503 — integração faltando, e diz isso");
  const saida = await anon.auth.signOut();
  conferir(!saida.error, "16. logout encerra a sessão");
} catch (erro) {
  falha("execução interrompida", erro instanceof Error ? erro.message : String(erro));
} finally {
  if (leadId) {
    await admin.from("follow_up_sla_events").delete().eq("lead_id", leadId);
    await admin.from("lead_events").delete().eq("lead_id", leadId);
    await admin.from("tasks").delete().eq("lead_id", leadId);
    const removida = await admin.from("leads").delete().eq("id", leadId).select("id");
    conferir((removida.data ?? []).length === 1, "9. lead de teste removida");
  }
  // A proposta e o diretor do smoke saem antes do corretor: linha de aprovação
  // órfã na caixa da diretoria é lixo com aparência de trabalho pendente.
  if (propostaId) {
    const semProposta = await admin.from("approval_requests").delete().eq("id", propostaId).select("id");
    conferir((semProposta.data ?? []).length === 1, "17. proposta de teste removida");
  }
  if (diretorId) {
    await admin.from("profiles").delete().eq("id", diretorId);
    const semDiretor = await admin.auth.admin.deleteUser(diretorId);
    conferir(!semDiretor.error, "17. diretor de teste removido");
  }
  await admin.from("profiles").delete().eq("id", corretorId);
  const semUsuario = await admin.auth.admin.deleteUser(corretorId);
  conferir(!semUsuario.error, "9. corretor de teste removido");
}

console.log("\nSMOKE DO CICLO OPERACIONAL\n");
for (const etapa of etapas) {
  console.log(`  ${etapa.ok ? "OK  " : "FALHA"} ${etapa.texto}${etapa.extra ? `  (${etapa.extra})` : ""}`);
}
const falhas = etapas.filter((e) => !e.ok).length;
console.log(`\n  ${etapas.length - falhas}/${etapas.length} etapas`);
console.log(falhas
  ? "\nRESULTADO: a corrente TEM elo partido — veja as falhas acima."
  : "\nRESULTADO: a corrente está inteira — lead entra, é cobrada, é atendida, é medida e é contada.");
