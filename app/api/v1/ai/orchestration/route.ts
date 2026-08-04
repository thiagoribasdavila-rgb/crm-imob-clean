import{type NextRequest}from"next/server";import{apiError,apiSuccess}from"@/lib/api/core";import{enforceRateLimit,requireAccessContext}from"@/lib/api/security";import{aiProviderReadiness,aiPricingReadiness,aiRoutingDiagnostics}from"@/lib/ai/provider-router";import{planCommercialAI,type OrchestratedTask}from"@/lib/ai/commercial-orchestrator";import{type ClasseDeFalhaDeIa}from"@/lib/ai/falha-de-ia";import{fetchAllRows}from"@/lib/supabase/fetch-all-rows";const management=(r:string|null,role:string)=>['director','superintendent'].includes(r||'')||role==='admin';
type OrchestrationRow={requested_task:string;resolved_task:string;data_class:string;risk_level:string;provider_order:string[];selected_provider:string|null;selected_model:string|null;token_budget:number;routing_reasons:string[];human_review_required:boolean;fallback_used:boolean;status:string;latency_ms:number|null;total_tokens:number|null;estimated_cost_usd:number|null;created_at:string;
  // Opcionais porque o banco pode ser anterior à migration da causa — e porque
  // linha gravada ANTES dela existe com os campos nulos, legitimamente.
  error_class?:string|null;error_code?:string|null;error_message?:string|null;who_resolves?:string|null};

/**
 * POR QUE A IA CAIU NO TEXTO DETERMINÍSTICO.
 *
 * ── O que motivou ──────────────────────────────────────────────────────────
 *
 * Medido no banco vivo em 03/08/2026: 67 chamadas em 9 dias, 32 delas servidas
 * pelo fallback local. A tela mostrava `local` na coluna "Provedor" e mais nada
 * — quem opera lia "a IA respondeu" sem saber que nenhuma IA tinha respondido,
 * nem por quê.
 *
 * A causa JÁ era gravada: `recordOrchestration` escreve `error_class`,
 * `error_code`, `error_message`, `who_resolves` e `provider_attempts` desde a
 * migration `causa_da_falha_de_ia`. O `select` desta rota simplesmente não pedia
 * nenhuma dessas colunas. Regra pronta, fio no chão — a mesma classe de defeito
 * que esta entrega perseguiu cinco vezes.
 *
 * O que estava escondido atrás disso, provado por chamada real às duas APIs:
 *
 *   · Anthropic → HTTP 400 `invalid_request_error`: "Your credit balance is too
 *     low to access the Anthropic API."
 *   · OpenAI    → HTTP 429 `insufficient_quota`: "You exceeded your current
 *     quota, please check your plan and billing details."
 *
 * As duas chaves AUTENTICARAM — chave errada devolveria 401. O bloqueio é saldo,
 * e saldo é do dono da conta. É exatamente por isso que `who_resolves` sobe
 * junto: sem ele a tela acusaria o time técnico por uma fatura.
 *
 * ── QUEM CHAMA `select` PRECISA SOBREVIVER AO BANCO ANTIGO ─────────────────
 *
 * Pedir uma coluna inexistente derruba a consulta inteira, e a tela de
 * orquestração sairia do ar em qualquer ambiente sem a migration. O gravador já
 * trata esse caso (`orchestrationErrorColumnsMissing`); o leitor passa a tratar
 * também: tenta com a causa, e só se o erro for de ESQUEMA repete sem ela.
 * Falha transitória não pode aposentar a leitura da causa até o próximo deploy.
 */
const ehErroDeEsquema=(erro:{code?:string|null;message?:string|null}|null)=>/column|schema cache|PGRST204/i.test(`${erro?.code||''} ${erro?.message||''}`);

/**
 * Rótulo curto por classe — a tela não deve ter que traduzir enum.
 *
 * Tipado como `Record<ClasseDeFalhaDeIa, …>` de propósito: classe nova em
 * `falha-de-ia.ts` quebra o BUILD aqui, em vez de aparecer crua na tela ou cair
 * num `?? 'desconhecida'` que esconde a novidade. A frase de QUEM resolve não é
 * duplicada — ela vem gravada em `who_resolves`, escrita no momento da falha.
 */
const RESUMO_DA_CAUSA:Record<ClasseDeFalhaDeIa,string>={
  credencial:'chave do provedor ausente ou recusada',
  cota:'sem saldo ou cota na conta do provedor',
  rede:'o provedor não respondeu ou a rede caiu',
  configuracao:'modelo ou parâmetro inválido na configuração',
  recusa_do_modelo:'o modelo recusou o conteúdo enviado',
  politica_interna:'uma regra do próprio Atlas barrou a chamada',
  cancelada:'quem pediu cancelou antes da resposta',
  desconhecida:'causa não classificada',
};
export async function GET(request:NextRequest){const rate=enforceRateLimit(request,{limit:30,scope:'ai.orchestration.read'});if(!rate.ok)return rate.response;const access=await requireAccessContext(request);if(!access.ok)return access.response;if(!management(access.access.profile.commercialRole,access.access.profile.role))return apiError('FORBIDDEN','Orquestração disponível para diretoria e superintendência.',access.meta,{status:403});const readiness=aiProviderReadiness(),pricing=aiPricingReadiness(),since=new Date(Date.now()-30*86400000).toISOString(),
// .limit(1000) cortava a janela de 30 dias em silêncio: acima disso o custo e a
// taxa de fallback saíam menores que a realidade sem nenhum aviso. Ordem estável
// (created_at + id) porque paginar por range sem ordem determinística repete e
// pula linhas entre páginas.
// Os dois `select` são LITERAIS, e não uma variável: o supabase-js infere a
// forma da linha a partir da string literal, e uma `string` montada em tempo de
// execução apaga essa inferência (o build acusa `GenericStringError[]`).
//
// O preço disso é a lista duplicada, e o risco é REAL: quem acrescentar uma
// coluna à consulta com causa e esquecer a de reserva faria a tela perder
// campos exatamente no ambiente sem a migration — o mais difícil de testar.
// `tests/contracts/consulta-de-causa-nao-diverge.test.mjs` guarda esse par:
// as duas listas têm de diferir SÓ pelas quatro colunas de causa.
ler=(comCausa:boolean)=>fetchAllRows<OrchestrationRow>((from,to)=>{const consulta=access.supabase.from('ai_orchestration_decisions');const base=comCausa?consulta.select('requested_task,resolved_task,data_class,risk_level,provider_order,selected_provider,selected_model,token_budget,routing_reasons,human_review_required,fallback_used,status,latency_ms,total_tokens,estimated_cost_usd,created_at,id,error_class,error_code,error_message,who_resolves'):consulta.select('requested_task,resolved_task,data_class,risk_level,provider_order,selected_provider,selected_model,token_budget,routing_reasons,human_review_required,fallback_used,status,latency_ms,total_tokens,estimated_cost_usd,created_at,id');return base.gte('created_at',since).order('created_at',{ascending:false}).order('id',{ascending:false}).range(from,to)});
let{rows,error,truncated}=await ler(true);
// Banco anterior à migration da causa não pode derrubar a tela inteira: repete
// sem as colunas novas. Só para erro de ESQUEMA — falha transitória tem de
// continuar sendo falha, e não virar "a causa não existe".
let causaLegivel=true;
if(error&&ehErroDeEsquema(error)){causaLegivel=false;({rows,error,truncated}=await ler(false))}
if(error)return apiError('AI_ORCHESTRATION_UNAVAILABLE','Aplique a migration da Fase 81.',access.meta,{status:503});
// Custo só soma linhas COM tarifa: linha sem tarifa tem custo desconhecido, não zero.
const priced=rows.filter(item=>item.estimated_cost_usd!==null&&item.estimated_cost_usd!==undefined),cost=priced.reduce((sum,item)=>sum+Number(item.estimated_cost_usd||0),0);
// ── Por que a IA não respondeu, agrupado ───────────────────────────────────
//
// Uma linha por classe, com a contagem, o rótulo e a frase de quem destrava
// GRAVADA no momento da falha. Fallback sem causa entra como `desconhecida`
// em vez de sumir: linha antiga (anterior à migration) é informação, e omiti-la
// faria a soma das causas não bater com o número de quedas na mesma tela.
const quedas=rows.filter(item=>item.fallback_used);
const porCausa=new Map<string,{chamadas:number;quemResolve:string|null;exemplo:string|null}>();
for(const linha of quedas){
  const classe=String(linha.error_class||'desconhecida');
  const atual=porCausa.get(classe)??{chamadas:0,quemResolve:null,exemplo:null};
  atual.chamadas+=1;
  atual.quemResolve=atual.quemResolve??(linha.who_resolves||null);
  atual.exemplo=atual.exemplo??(linha.error_message||null);
  porCausa.set(classe,atual);
}
const causasDeFalha=[...porCausa.entries()].map(([classe,dados])=>({classe,resumo:RESUMO_DA_CAUSA[classe as ClasseDeFalhaDeIa]??'causa não classificada',...dados})).sort((a,b)=>b.chamadas-a.chamadas);
return apiSuccess({readiness,pricing,routingDiagnostics:aiRoutingDiagnostics(),decisions:rows.slice(0,50),causasDeFalha,
// Sem isto, tela sem causa nenhuma seria lida como "nenhuma falha" num banco
// que apenas não sabe responder — a diferença entre não haver e não dar para
// olhar.
causaLegivel,summary:{calls:rows.length,truncated,fallbacks:rows.filter(item=>item.fallback_used).length,personalDataCalls:rows.filter(item=>item.data_class==='personal').length,humanReview:rows.filter(item=>item.human_review_required).length,totalTokens:rows.reduce((sum,item)=>sum+Number(item.total_tokens||0),0),pricedCalls:priced.length,unpricedCalls:rows.length-priced.length,costMeasurementComplete:rows.length>0&&priced.length===rows.length&&!truncated,estimatedCostUsd:priced.length?Math.round(cost*1e6)/1e6:null},policy:{singleOrchestrator:true,personalDataTrustedProviderOnly:true,researchRequiresSources:true,costAware:true,tokenBudgeted:true,humanReviewEscalation:true,externalActionAllowed:false,deterministicFallback:true,host:'hostinger'}},access.meta,{headers:{...rate.headers,'Cache-Control':'no-store'}})}
export async function POST(request:NextRequest){const rate=enforceRateLimit(request,{limit:30,scope:'ai.orchestration.preview'});if(!rate.ok)return rate.response;const access=await requireAccessContext(request);if(!access.ok)return access.response;if(!management(access.access.profile.commercialRole,access.access.profile.role))return apiError('FORBIDDEN','Simulação reservada à gestão.',access.meta,{status:403});const body=await request.json().catch(()=>null)as{task?:string;containsPersonalData?:boolean;feature?:string}|null,task=String(body?.task||'');if(!['fast','commercial','reasoning','research'].includes(task))return apiError('TASK_INVALID','Escolha uma tarefa válida.',access.meta,{status:400});const plan=planCommercialAI({task:task as OrchestratedTask,containsPersonalData:Boolean(body?.containsPersonalData),feature:String(body?.feature||'orchestration-preview').slice(0,100),available:aiProviderReadiness()});return apiSuccess({plan,simulationOnly:true,providerCalled:false,promptStored:false},access.meta,{headers:rate.headers})}
