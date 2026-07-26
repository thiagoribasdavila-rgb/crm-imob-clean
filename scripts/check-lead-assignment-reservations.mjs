import{readFileSync}from"node:fs";import{resolve}from"node:path";const read=p=>readFileSync(resolve(process.cwd(),p),"utf8"),
// Comparação por CONTEÚDO, não por formatação: o Prettier quebra JSX em várias
// linhas e o TypeScript recebe espaços em volta do ===. O portão reprovava por
// isso, não por ausência. `tem` colapsa espaço em branco dos dois lados antes de
// comparar — segue exigindo o mesmo trecho, sem depender de como ele foi
// impresso. O espaço é REMOVIDO, não colapsado: `body.action === "x"` no código
// precisa casar com `body.action==="x"` no contrato, e prosa quebrada em duas
// linhas com a mesma frase escrita corrida.
norm=t=>t.replace(/\s+/g,""),
tem=(fonte,trecho)=>norm(fonte).includes(norm(trecho)),
c=JSON.parse(read("config/lead-assignment-reservations.json")),sql=read(c.migration).toLowerCase(),distribution=read(c.distributionApi),lead=read(c.leadApi),worker=read(c.worker),page=read(c.page),fail=[];for(const marker of["lead_assignment_reservations","lead_assignment_one_pending_idx","distribute_project_leads_v4","accept_lead_assignment","process_expired_lead_reservations","for update skip locked","atendimento iniciado antes da expiração","assigned_to=null","update public.tasks","customercontacted","singleownerpreserved"])if(!tem(sql,marker))fail.push(`banco incompleto: ${marker}`);for(const marker of["distribute_project_leads_v4","p_acceptance_minutes: 5"])if(!tem(distribution,marker))fail.push(`distribuição incompleta: ${marker}`);for(const marker of['body.action==="accept_assignment"',"accept_lead_assignment","assignmentReservation"])if(!tem(lead,marker))fail.push(`aceite incompleto: ${marker}`);if(!tem(worker,"ATLAS_CRON_SECRET")||!tem(worker,"process_expired_lead_reservations"))fail.push("worker sem proteção ou processamento");for(const marker of['data-phase="58-lead-reservation"',"Reserva aguardando aceite","Aceitar lead","não será devolvida automaticamente"])if(!tem(page,marker))fail.push(`experiência incompleta: ${marker}`);// Menção não é uso, e foi assim que esta fase passou meses "aprovada" com a
// reserva cravada em null: o nome aparecia no arquivo, o dado nunca chegava à
// tela. Estes dois casos exigem a CHAMADA e proíbem o literal.
if(/assignmentReservation\s*:\s*null/.test(lead))fail.push("aceite incompleto: assignmentReservation devolvido como null literal — a tela nunca mostra a reserva");
if(!/\.rpc\(\s*["']accept_lead_assignment["']/.test(lead))fail.push("aceite incompleto: accept_lead_assignment não é CHAMADA — o aceite manual deixa a reserva pendente para sempre");
if(fail.length){console.error("RESERVA DE LEADS Fase 58: REPROVADA");for(const f of fail)console.error(`- ${f}`);process.exit(1)}console.log(`RESERVA DE LEADS Fase 58: aprovada — aceite em ${c.acceptanceMinutes} min, expiração segura, interação protegida e contato automático zero.`);
