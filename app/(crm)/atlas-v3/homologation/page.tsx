"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";
import type { HomologationCheck, HomologationRole } from "@/lib/atlas/homologation-checklist";
import type { EvolutionPhase } from "@/lib/atlas/evolution-phases";

type Result = { id: string; check_key: string; outcome: "passed" | "failed"; notes: string | null; verified_by: string; verified_at: string };
type Payload = { checks: HomologationCheck[]; results: Result[]; readiness: { overallEvolution: number; technicalEvolution: number; aiCalibration: { percent: number; controls: number; scenarios: number; next: string; dimensions: Array<{ name: string; percent: number }> }; phases: EvolutionPhase[]; deployment: Record<string, boolean> }; currentUser: { id: string; commercialRole: HomologationRole } };
const roleLabels: Record<HomologationRole, string> = { director: "Diretor", superintendent: "Superintendente", manager: "Gerente", broker: "Corretor" };
const deploymentLabels: Record<string, string> = { hostinger: "Hostinger", publicUrl: "URL pública", passwordRecovery: "Recuperação PKCE", cron: "Cron", openai: "OpenAI", perplexity: "Perplexity", metaLeads: "Meta Leads", metaConversions: "Meta CAPI", metaInsights: "Meta Insights", whatsapp: "WhatsApp", nightlyTemplate: "Template 20h" };

export default function HomologationPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  async function request(path: string, init?: RequestInit) {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.session.access_token}`, ...(init?.headers || {}) } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha ao carregar homologação.");
    return body;
  }

  async function load() {
    setError("");
    try { setData(await request("/api/v1/homologation") as Payload); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao carregar homologação."); }
  }
  useEffect(() => { void load(); }, []);

  const latest = useMemo(() => {
    const map = new Map<string, Result>();
    for (const result of data?.results ?? []) if (!map.has(result.check_key)) map.set(result.check_key, result);
    return map;
  }, [data]);
  const passed = data?.checks.filter((check) => latest.get(check.key)?.outcome === "passed").length ?? 0;
  const failed = data?.checks.filter((check) => latest.get(check.key)?.outcome === "failed").length ?? 0;
  const progress = data?.checks.length ? Math.round(passed / data.checks.length * 100) : 0;

  async function verify(checkKey: string, outcome: "passed" | "failed") {
    const notes = outcome === "failed" ? window.prompt("Descreva o problema encontrado para orientar a correção:") : null;
    if (outcome === "failed" && notes === null) return;
    setSaving(checkKey); setError("");
    try { await request("/api/v1/homologation", { method: "POST", body: JSON.stringify({ checkKey, outcome, notes }) }); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao registrar evidência."); }
    finally { setSaving(null); }
  }

  return <div className="space-y-6 pb-12">
    <section className="atlas-grid-glow rounded-[30px] border border-emerald-400/15 bg-gradient-to-br from-emerald-500/[.12] via-sky-500/[.06] to-violet-500/[.1] p-6 sm:p-8"><div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between"><div><AtlasBadge tone="success">HOMOLOGAÇÃO ASSISTIDA</AtlasBadge><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Aceite operacional com evidência.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Cada perfil executa seu próprio roteiro. Um clique registra quem validou, quando e qual foi o resultado; falhas não aumentam o percentual.</p></div><div className="min-w-72 rounded-3xl border border-white/[.08] bg-[#070d1b]/75 p-5"><div className="flex items-end justify-between"><span className="text-sm text-slate-400">Roteiro aprovado</span><strong className="text-4xl text-emerald-300">{progress}%</strong></div><div className="mt-4"><AtlasProgress value={progress} /></div></div></div></section>
    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
    {data ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><AtlasMetric label="Evolução do V3" value={`${data.readiness.overallEvolution}%`} detail="Média ponderada das 12 fases" trend="PROJETO" tone="blue" /><AtlasMetric label="Prontidão técnica" value={`${data.readiness.technicalEvolution}%`} detail="Sem maquiar piloto e produção" trend="BUILD" tone="green" /><AtlasMetric label="Calibragem da IA" value={`${data.readiness.aiCalibration.percent}%`} detail={`${data.readiness.aiCalibration.controls} controles · ${data.readiness.aiCalibration.scenarios} cenários`} trend="IA" tone="violet" /><AtlasMetric label="Homologação real" value={`${progress}%`} detail="Somente testes aprovados por usuários" trend="EVIDÊNCIA" tone="amber" /></section> : null}
    <section className="grid gap-4 sm:grid-cols-3"><AtlasMetric label="Aprovados" value={data ? passed : "—"} detail="Critérios com evidência positiva" trend="PASS" tone="green" /><AtlasMetric label="Falhas" value={data ? failed : "—"} detail="Precisam de correção e reteste" trend="FIX" tone="rose" /><AtlasMetric label="Pendentes" value={data ? data.checks.length - passed - failed : "—"} detail="Ainda sem execução registrada" trend="TODO" tone="amber" /></section>
    {data ? <AtlasCard><AtlasCardHeader eyebrow="Hostinger · preflight" title="APIs e serviços necessários para subir" description="Configuração detectada sem revelar credenciais. PRONTO ainda precisa do teste real da fase correspondente." /><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-5">{Object.entries(data.readiness.deployment).map(([key, value]) => <div key={key} className="flex items-center justify-between rounded-xl border border-white/[.07] bg-white/[.025] p-3"><span className="text-xs text-slate-400">{deploymentLabels[key] || key}</span><AtlasBadge tone={value ? "success" : "warning"}>{value ? "PRONTO" : "PENDENTE"}</AtlasBadge></div>)}</div></AtlasCard> : null}
    {data ? <AtlasCard><AtlasCardHeader eyebrow="Mapa de evolução" title="O que já está pronto e o que impede a homologação" description="Percentuais de engenharia ficam separados da comprovação operacional para a diretoria decidir com segurança." /><div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6">{data.readiness.phases.map((phase) => <Link href={phase.href} key={phase.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-sky-400/30"><div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-white">{phase.id}. {phase.shortName}</span><strong className="text-sm text-sky-300">{phase.progress}%</strong></div><div className="mt-3"><AtlasProgress value={phase.progress} /></div><p className="mt-3 text-xs leading-5 text-slate-400">{phase.next}</p></Link>)}</div></AtlasCard> : null}
    {data ? <AtlasCard><AtlasCardHeader eyebrow="Calibragem da IA" title="Inteligência orientada à conversão e ao custo" description={data.readiness.aiCalibration.next} /><div className="grid gap-3 p-5 md:grid-cols-5 sm:p-6">{data.readiness.aiCalibration.dimensions.map((item) => <div key={item.name} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><div className="text-xs leading-5 text-slate-400">{item.name}</div><div className="mt-2 text-2xl font-semibold text-white">{item.percent}%</div><div className="mt-3"><AtlasProgress value={item.percent} /></div></div>)}</div></AtlasCard> : null}
    {!data && !error ? <div className="grid gap-4 md:grid-cols-2"><AtlasSkeleton className="h-72" /><AtlasSkeleton className="h-72" /></div> : null}
    {data ? <div className="space-y-6">{(["director", "superintendent", "manager", "broker"] as HomologationRole[]).map((role) => <AtlasCard key={role}><AtlasCardHeader eyebrow={`Perfil · ${roleLabels[role]}`} title={`Roteiro de ${roleLabels[role]}`} description="Execute com um usuário real deste perfil e registre o resultado observado." /><div className="grid gap-4 p-5 md:grid-cols-2 sm:p-6">{data.checks.filter((check) => check.role === role).map((check) => { const result = latest.get(check.key); const canVerify = data.currentUser.commercialRole === role || data.currentUser.commercialRole === "director"; return <article key={check.key} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-white">{check.title}</h2><p className="mt-2 text-xs leading-5 text-slate-400">{check.procedure}</p></div><AtlasBadge tone={result?.outcome === "passed" ? "success" : result?.outcome === "failed" ? "danger" : "warning"}>{result?.outcome === "passed" ? "APROVADO" : result?.outcome === "failed" ? "FALHOU" : "PENDENTE"}</AtlasBadge></div><div className="mt-4 rounded-xl border border-sky-400/10 bg-sky-400/[.05] p-3 text-xs leading-5 text-sky-100"><strong>Esperado:</strong> {check.expected}</div>{result ? <p className="mt-3 text-[10px] text-slate-500">Última evidência: {new Date(result.verified_at).toLocaleString("pt-BR")}{result.notes ? ` · ${result.notes}` : ""}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><Link href={check.href} className="atlas-button-secondary">Executar teste</Link>{canVerify ? <><button disabled={saving === check.key} onClick={() => void verify(check.key, "passed")} className="atlas-button-primary">Aprovar</button><button disabled={saving === check.key} onClick={() => void verify(check.key, "failed")} className="atlas-button-secondary">Registrar falha</button></> : null}</div></article>; })}</div></AtlasCard>)}</div> : null}
    {data && !data.checks.length ? <AtlasEmpty title="Roteiro indisponível" description="Nenhum critério de homologação foi configurado." /> : null}
  </div>;
}
