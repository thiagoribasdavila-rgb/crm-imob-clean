import{NextResponse}from"next/server";import{getSupabaseAdmin}from"@/lib/supabase/admin";import{logger}from"@/lib/observability/logger";import{origemDaChamada,registrarExecucao}from"@/lib/integrations/livro-de-execucoes";export const dynamic="force-dynamic";export const maxDuration=60;
export async function POST(request:Request){const expected=process.env.ATLAS_CRON_SECRET;const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");if(!expected||token!==expected)return NextResponse.json({error:"Não autorizado."},{status:401});
  /* O livro de execucoes: uma linha por invocacao, inclusive quando nao ha
     trabalho. Sem isto, "task-recurrences nao rodou" e "task-recurrences rodou e a fila estava
     vazia" sao a MESMA ausencia no banco -- e foi assim que a automacao ficou
     em zero sem ninguem conseguir dizer por que. */
  const iniciadoEm = Date.now();
  const origem = origemDaChamada(request);
  const livro = (desfecho: "ok" | "sem_trabalho" | "falhou", resposta: Record<string, unknown>, erro?: string) =>
    registrarExecucao({ vigia: "task-recurrences", rota: "/api/v2/tasks/recurrences/process", origem, iniciadoEm, desfecho, resposta, erro });
try{const{data,error}=await getSupabaseAdmin().rpc("process_due_task_recurrences",{p_limit:200});if(error)throw error;logger.info("tasks.recurrence_worker_completed",{generated:Number(data?.generated||0)});const corpo = {status:"completed",...(data||{})};
    /* `sem_trabalho` quando a RPC nao mexeu em nada: desfecho LEGITIMO, e
       justamente o que se confundia com "nunca rodou". */
    const fez = Object.values(data ?? {}).some((v) => typeof v === "number" && v > 0);
    return NextResponse.json({ ...corpo, livro: await livro(fez ? "ok" : "sem_trabalho", corpo) });}catch(error){logger.error("tasks.recurrence_worker_failed",error);return NextResponse.json({error:"Falha ao gerar tarefas recorrentes.", livro: await livro("falhou", {}, String(error))},{status:500});}}
