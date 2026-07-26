import{readFileSync}from"node:fs";import{resolve}from"node:path";const read=p=>readFileSync(resolve(process.cwd(),p),"utf8"),c=JSON.parse(read("config/portfolio-audit-ledger.json")),sql=read(c.migration).toLowerCase(),api=read(c.api),page=read(c.page),fail=[];for(const marker of["get_portfolio_audit_ledger","portfolio_audit_actor_forbidden","with recursive visible","lead_distribution_events","lead_transfer_items","lead_assignment_reservations","broker_absence_events","broker_capacity_limits","reasonrecorded","piiexposed","hierarchicalscope","immutablesources"])if(!sql.includes(marker))fail.push(`livro incompleto: ${marker}`);for(const forbidden of["l.name","l.phone","l.email","b.reason)","a.reason)","c.reason)"])if(sql.includes(forbidden))fail.push(`possível dado livre exposto: ${forbidden}`);for(const marker of["get_portfolio_audit_ledger","auditResult"])if(!api.includes(marker))fail.push(`API incompleta: ${marker}`);
// O marcador anterior era `portfolioAudit:auditResult.data` — uma EXPRESSÃO
// exata. A rota passou a embrulhar o resultado da RPC (para poder declarar
// `available` quando ela falha), o que é melhor, e o portão reprovou a melhoria.
// O que importa é que o livro chegue ao payload sob a chave portfolioAudit e
// venha da RPC, não a forma de escrever a atribuição.
if(!/portfolioAudit\s*:/.test(api))fail.push("API incompleta: o payload não expõe portfolioAudit");
// Segue o RASTRO em vez de medir distância: descobre a que identificador
// portfolioAudit é atribuído e exige que a definição dele venha de auditResult.
// Assim a checagem sobrevive a refatoração e continua reprovando um payload
// montado à mão que só finge ter vindo da RPC.
{
  const alvo=/portfolioAudit\s*:\s*([A-Za-z_$][\w$]*)/.exec(api);
  // A janela precisa parar na PRÓPRIA declaração. Uma busca por N caracteres à
  // frente encontrava `auditResult` na declaração SEGUINTE e aprovava um livro
  // montado à mão — furo achado no teste de mutação deste portão.
  const decl=alvo?new RegExp(`(?:const|let)\\s+${alvo[1]}\\s*=`).exec(api):null;
  let origem=false;
  if(decl){
    const resto=api.slice(decl.index+decl[0].length);
    const fim=resto.search(/\n\s*(?:const|let|return|if|for)\s/);
    origem=/auditResult/.test(fim<0?resto:resto.slice(0,fim));
  }
  if(!alvo)fail.push("API incompleta: portfolioAudit não recebe um valor nomeado");
  else if(!origem)fail.push(`API incompleta: ${alvo[1]} não é derivado de auditResult — o livro não vem da RPC`);
}for(const marker of['data-phase="59-portfolio-audit"',"Histórico gerencial unificado","SEM PII","Distribuições","Transferências","Devoluções","textos livres da lead não expostos"])if(!page.includes(marker))fail.push(`experiência incompleta: ${marker}`);if(fail.length){console.error("AUDITORIA DA CARTEIRA Fase 59: REPROVADA");for(const f of fail)console.error(`- ${f}`);process.exit(1)}console.log(`AUDITORIA DA CARTEIRA Fase 59: aprovada — ${c.sources.length} fontes, ${c.eventTypes.length} tipos, até ${c.maximumEvents} eventos e PII zero.`);
