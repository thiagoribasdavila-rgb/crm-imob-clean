/**
 * LEMBRETES DE TAREFA.
 *
 * ── O defeito que derrubava a página ────────────────────────────────────────
 *
 * O join pedia `tasks(... due_at ...)`. A coluna real da tabela `tasks` é
 * `due_date` — `due_at` existe em `task_reminders`, não em `tasks`. O
 * PostgREST recusava o select inteiro e a rota devolvia 500
 * TASK_REMINDERS_LOAD_FAILED.
 *
 * Efeito: a tela de lembretes não abria. Nenhum aviso de tarefa vencida
 * chegava ao corretor, e o vigia de SLA ficava sem a ponta visível.
 *
 * É a mesma classe de defeito do Kanban (`activities.title`) e do
 * `LIVE_PROFILE_SELECT`: o código pede uma coluna que o banco vivo não tem, e
 * quem paga é uma tela inteira.
 */
import type{NextRequest}from"next/server";import{apiError,apiSuccess}from"@/lib/api/core";import{enforceRateLimit,requireAccessContext}from"@/lib/api/security";export const dynamic="force-dynamic";const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f-]{36}$/i.test(value)?value:null;
export async function GET(request:NextRequest){const rate=enforceRateLimit(request,{limit:90,scope:"task-reminders-read"});if(!rate.ok)return rate.response;const identity=await requireAccessContext(request);if(!identity.ok)return identity.response;const result=await identity.supabase.from("task_reminders").select("id,kind,task_due_at,priority,created_at,read_at,dismissed_at,assigned_to,task:tasks(id,title,due_date,status,lead_id)").eq("organization_id",identity.access.organization.id).is("dismissed_at",null).order("created_at",{ascending:false}).limit(500);if(result.error)return apiError("TASK_REMINDERS_LOAD_FAILED","Não foi possível carregar os lembretes.",identity.meta,{status:500});const done=new Set(["done","concluido","concluida","completed","cancelado","cancelled"]);const reminders=(result.data??[]).filter(item=>{const task=Array.isArray(item.task)?item.task[0]:item.task;return task&&!done.has(String(task.status||"").toLowerCase());});return apiSuccess({scope:{role:identity.access.profile.commercialRole||identity.access.profile.role,hierarchicalRls:true,ownActionsOnly:true},summary:{open:reminders.length,unread:reminders.filter(item=>!item.read_at).length,overdue:reminders.filter(item=>item.kind==="overdue").length},reminders,governance:{customerContacted:false,automaticMessage:false,deduplicated:true}},identity.meta,{headers:{...rate.headers,"Cache-Control":"no-store"}});}
export async function PATCH(request:NextRequest){const rate=enforceRateLimit(request,{limit:90,scope:"task-reminders-write"});if(!rate.ok)return rate.response;const identity=await requireAccessContext(request);if(!identity.ok)return identity.response;const body=await request.json();const id=uuid(body.id),action=String(body.action||"");if(!id||!["read","dismiss"].includes(action))return apiError("TASK_REMINDER_ACTION_INVALID","Ação de lembrete inválida.",identity.meta,{status:400});const now=new Date().toISOString(),update=action==="read"?{read_at:now}:{dismissed_at:now,read_at:now};const result=await identity.supabase.from("task_reminders").update(update).eq("id",id).eq("organization_id",identity.access.organization.id).eq("assigned_to",identity.access.profile.id).select("id,read_at,dismissed_at").maybeSingle();if(result.error||!result.data)return apiError("TASK_REMINDER_NOT_VISIBLE","Lembrete não encontrado na sua caixa pessoal.",identity.meta,{status:404});return apiSuccess({reminder:result.data,action},identity.meta,{headers:rate.headers});}
