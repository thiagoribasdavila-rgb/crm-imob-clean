"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  city: string | null;
  status: string;
  coveragePercent?: number;
  pendingReview?: number;
};

type Material = {
  id: string;
  material_type: string;
  title: string;
  description: string | null;
  file_name: string;
  file_size: number;
  version: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  url: string | null;
  urlExpiresAt: string | null;
  review_status: "pending" | "verified" | "rejected";
  verified_at: string | null;
};
type Coverage = { developerName: string; projects: number; complete: number; averageCoverage: number; expiring: number; expired: number; pendingReview: number };
type PortfolioSummary = { projects: number; complete: number; expiring: number; expired: number; pendingReview: number };

type StorageHomologation = { status: "passed" | "incomplete"; privateBucket: boolean; tenantPathProtected: boolean; signedUrlTtlSeconds: number; essential: Array<{ type: string; available: boolean; version: number | null; expiresAt: string | null }> };

const materialLabels: Record<string, { label: string; icon: string; description: string }> = {
  book: { label: "Book comercial", icon: "◫", description: "Apresentação completa do empreendimento" },
  price_table: { label: "Tabela de vendas", icon: "▦", description: "Preços, fluxo e condições comerciais" },
  sales_mirror: { label: "Espelho de vendas", icon: "▥", description: "Disponibilidade atualizada das unidades" },
  floor_plan: { label: "Plantas", icon: "⌑", description: "Tipologias e materiais técnicos" },
  presentation: { label: "Apresentação", icon: "▤", description: "Material de apoio para atendimento" },
  other: { label: "Outros materiais", icon: "◇", description: "Documentos complementares" },
};
const essentialTypes = ["book", "price_table", "sales_mirror"] as const;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectMaterialsPage() {
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [storageHomologation, setStorageHomologation] = useState<StorageHomologation | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [query, setQuery] = useState("");
  const [developer, setDeveloper] = useState("");
  const [loading, setLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [form, setForm] = useState({ materialType: "price_table", title: "", description: "", validFrom: "", validUntil: "" });
  const [file, setFile] = useState<File | null>(null);

  async function accessToken() {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente no Atlas.");
    return token;
  }

  useEffect(() => {
    async function loadPortfolio() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) { setError("Sessão expirada."); setLoading(false); return; }
      const [portfolioResponse, meResponse] = await Promise.all([
        fetch("/api/v1/developments/materials", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/v1/auth/me"),
      ]);
      const portfolio = await portfolioResponse.json();
      const me = await meResponse.json();
      if (!portfolioResponse.ok) setError(portfolio.error || "Não foi possível carregar os projetos.");
      else {
        const items = (portfolio.developments ?? []) as Development[];
        setDevelopments(items);
        setCoverage(portfolio.coverageByDeveloper ?? []);
        setPortfolioSummary(portfolio.summary ?? null);
        const preferred = new URLSearchParams(window.location.search).get("project");
        if (items.length) setSelectedId(items.some((item) => item.id === preferred) ? preferred! : items[0].id);
      }
      setCurrentRole(me?.data?.profile?.commercialRole || me?.data?.profile?.role || "");
      setLoading(false);
    }
    void loadPortfolio();
  }, []);

  async function loadMaterials(developmentId: string) {
    if (!developmentId) return;
    setMaterialsLoading(true);
    setError("");
    try {
      const token = await accessToken();
      const response = await fetch(`/api/v1/developments/${developmentId}/materials`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar os materiais.");
      setMaterials(payload.materials ?? []);
      setStorageHomologation(payload.storageHomologation ?? null);
      setReferenceTime(Date.now());
    } catch (loadError) {
      setMaterials([]);
      setStorageHomologation(null);
      setError(loadError instanceof Error ? loadError.message : "Não foi possível carregar os materiais.");
    } finally {
      setMaterialsLoading(false);
    }
  }

  useEffect(() => { void loadMaterials(selectedId); }, [selectedId]);

  const developers = useMemo(
    () => [...new Set(developments.map((item) => item.developer_name || "Sem incorporadora"))].sort(),
    [developments],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return developments.filter((item) => {
      const matchesDeveloper = !developer || (item.developer_name || "Sem incorporadora") === developer;
      const matchesQuery = !normalized || [item.name, item.developer_name, item.city].some((value) => value?.toLowerCase().includes(normalized));
      return matchesDeveloper && matchesQuery;
    });
  }, [developer, developments, query]);
  const selected = developments.find((item) => item.id === selectedId) ?? null;
  const canManage = ["admin", "director", "superintendent", "manager"].includes(currentRole);
  const missingEssential = essentialTypes.filter((type) => !materials.some((material) => material.material_type === type && (!material.valid_until || referenceTime === 0 || new Date(material.valid_until).getTime() >= referenceTime)));
  const essentialReady = essentialTypes.length - missingEssential.length;
  const essentialMaterials = essentialTypes.map((type) => ({
    type,
    material: materials.find((material) => material.material_type === type && (!material.valid_until || referenceTime === 0 || new Date(material.valid_until).getTime() >= referenceTime)) ?? null,
  }));

  async function uploadMaterial(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId || !file) return;
    setUploading(true);
    setError("");
    setNotice("");
    const body = new FormData();
    body.set("file", file);
    Object.entries(form).forEach(([key, value]) => body.set(key, value));
    try {
      const token = await accessToken();
      const response = await fetch(`/api/v1/developments/${selectedId}/materials`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha ao atualizar material.");
      setNotice(`${materialLabels[form.materialType]?.label || "Material"} atualizado com sucesso.`);
      setFile(null);
      setForm((current) => ({ ...current, title: "", description: "", validFrom: "", validUntil: "" }));
      await loadMaterials(selectedId);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Falha ao atualizar material.");
    } finally {
      setUploading(false);
    }
  }

  async function reviewMaterial(materialId: string) {
    const note = "Material vigente conferido pela gestão comercial";
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) { setError("Sessão expirada. Entre novamente para validar o material."); return; }
    const response = await fetch("/api/v1/developments/materials", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ materialId, status: "verified", note }) });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Falha ao validar material."); else { setNotice("Material validado e registrado no histórico."); await loadMaterials(selectedId); }
  }

  return (
    <div className="space-y-6 pb-10" data-phase="67-developer-material-center">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8">
        <div className="grid gap-7 xl:grid-cols-[1.4fr_.7fr] xl:items-end">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="info">MATERIAL HUB</AtlasBadge><AtlasBadge tone="success">TUDO EM UM LUGAR</AtlasBadge><AtlasBadge tone="violet">POR INCORPORADORA</AtlasBadge><AtlasBadge tone={storageHomologation?.status === "passed" ? "success" : "warning"}>FASE 31 · {storageHomologation?.status === "passed" ? "COMPROVADA" : "PENDENTE"}</AtlasBadge></div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Encontre o material certo antes mesmo de o cliente terminar a pergunta.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Book, tabela, espelho de vendas, plantas e apresentações organizados por incorporadora e projeto, sempre na versão vigente.</p>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5">
            <p className="atlas-eyebrow">Projeto selecionado</p>
            <p className="mt-2 text-xl font-semibold text-white">{selected?.name || "Escolha um projeto"}</p>
            <p className="mt-1 text-sm text-slate-400">{selected?.developer_name || "Incorporadora não informada"}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <AtlasMetric label="Cobertura do portfólio" value={loading ? "—" : `${portfolioSummary?.complete ?? 0}/${portfolioSummary?.projects ?? 0}`} detail="Projetos com book, tabela e espelho" trend="PORTFÓLIO" tone="blue" />
        <AtlasMetric label="Kit essencial" value={materialsLoading ? "—" : `${essentialReady}/3`} detail="Book, tabela e espelho" trend={missingEssential.length ? "INCOMPLETO" : "COMPLETO"} tone={missingEssential.length ? "amber" : "green"} />
        <AtlasMetric label="Pedem atualização" value={loading ? "—" : (portfolioSummary?.expiring ?? 0) + (portfolioSummary?.expired ?? 0)} detail="Vencidos ou a vencer em 7 dias no portfólio" trend={(portfolioSummary?.expiring || portfolioSummary?.expired) ? "ATENÇÃO" : "EM DIA"} tone={(portfolioSummary?.expiring || portfolioSummary?.expired) ? "amber" : "green"} />
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      {notice ? <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">{notice}</div> : null}

      <AtlasCard>
        <AtlasCardHeader eyebrow="Visão corporativa" title="Cobertura por incorporadora" description="Kit essencial, vencimentos e validações pendentes em todo o portfólio." />
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          {coverage.map((item) => <button key={item.developerName} onClick={() => setDeveloper(item.developerName)} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-left hover:border-sky-400/25"><div className="flex items-start justify-between gap-3"><div><strong className="text-white">{item.developerName}</strong><p className="mt-1 text-xs text-slate-500">{item.complete}/{item.projects} projetos completos</p></div><AtlasBadge tone={item.averageCoverage === 100 ? "success" : "warning"}>{item.averageCoverage}%</AtlasBadge></div><div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400"><span>{item.expiring} a vencer</span><span>·</span><span>{item.expired} vencidos</span><span>·</span><span>{item.pendingReview} em revisão</span></div></button>)}
          {!coverage.length && !loading ? <AtlasEmpty title="Sem cobertura calculada" description="Cadastre projetos e materiais para iniciar." /> : null}
        </div>
      </AtlasCard>

      {selected && storageHomologation ? <AtlasCard><AtlasCardHeader eyebrow="Fase 31 · Storage privado" title="Book, tabela e espelho protegidos" description="O aceite exige os três materiais vigentes, acessíveis por links temporários e isolados no caminho da organização." /><div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">{storageHomologation.essential.map((item) => <div key={item.type} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-xs text-slate-500">{materialLabels[item.type]?.label || item.type}</span><div className="mt-2"><AtlasBadge tone={item.available ? "success" : "warning"}>{item.available ? `V${item.version} ACESSÍVEL` : "PENDENTE"}</AtlasBadge></div></div>)}<div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-xs text-slate-500">Segurança</span><strong className="mt-2 block text-sm text-white">Bucket privado</strong><p className="mt-1 text-[10px] text-slate-500">Links expiram em {Math.round(storageHomologation.signedUrlTtlSeconds / 60)} min · caminho interno oculto</p></div><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"><span className="text-xs text-slate-500">Isolamento</span><strong className="mt-2 block text-sm text-white">{storageHomologation.tenantPathProtected ? "Organização protegida" : "Revisar"}</strong><p className="mt-1 text-[10px] text-slate-500">Acesso validado antes de assinar</p></div></div></AtlasCard> : null}

      <section className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]">
        <AtlasCard>
          <AtlasCardHeader eyebrow="Busca rápida" title="Incorporadora e projeto" description="Filtre e escolha o empreendimento." />
          <div className="space-y-3 p-5">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar projeto, cidade..." className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30" />
            <select value={developer} onChange={(event) => setDeveloper(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white">
              <option value="">Todas as incorporadoras</option>
              {developers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <div className="max-h-[420px] space-y-2 overflow-auto pt-2">
              {loading ? [1,2,3].map((item) => <AtlasSkeleton key={item} className="h-20 w-full" />) : filtered.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === item.id ? "border-sky-400/30 bg-sky-400/10" : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05]"}`}>
                  <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">{item.developer_name || "Sem incorporadora"}</span>
                  <strong className="mt-1 block text-sm text-white">{item.name}</strong>
                  <span className="mt-1 block text-xs text-slate-500">{item.city || "Cidade não informada"} · {item.status}</span>
                </button>
              ))}
            </div>
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader eyebrow="Kit comercial" title={selected?.name || "Materiais do projeto"} description="Abra ou baixe sempre a versão vigente." action={selected ? <Link href={`/developments/${selected.id}`} className="text-xs font-semibold text-sky-300">Abrir projeto →</Link> : null} />
          <div className="p-5 sm:p-6">
            {selected ? <div className="mb-5 grid gap-2 sm:grid-cols-3" aria-label="Acesso rápido ao kit essencial">{essentialMaterials.map(({ type, material }) => material?.url ? <a key={type} href={material.url} target="_blank" rel="noreferrer" className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-3 transition hover:border-emerald-300/35"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300">Vigente · V{material.version}</span><strong className="mt-1 block text-sm text-white">{materialLabels[type].label}</strong><small className="mt-1 block text-slate-500">Abrir agora →</small></a> : <div key={type} className="rounded-2xl border border-amber-400/15 bg-amber-400/[.04] p-3"><span className="block text-[10px] font-bold uppercase tracking-[.12em] text-amber-300">Pendente</span><strong className="mt-1 block text-sm text-white">{materialLabels[type].label}</strong><small className="mt-1 block text-slate-500">Aguardando publicação</small></div>)}</div> : null}
            {!materialsLoading && selected && missingEssential.length ? <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-xs leading-5 text-amber-100">Kit incompleto: falta {missingEssential.map((type) => materialLabels[type].label).join(", ")}. Atualize abaixo para o corretor encontrar tudo sem sair do projeto.</div> : null}
            {materialsLoading ? <div className="grid gap-4 sm:grid-cols-2">{[1,2,3,4].map((item) => <AtlasSkeleton key={item} className="h-44 w-full" />)}</div> : !selected ? <AtlasEmpty title="Selecione um projeto" description="Escolha uma incorporadora e um empreendimento para acessar o kit comercial." /> : materials.length === 0 ? <AtlasEmpty title="Kit comercial ainda vazio" description="Adicione book, tabela, espelho ou plantas para liberar o material ao time." /> : (
              <div className="grid gap-4 sm:grid-cols-2">
                {materials.map((material) => {
                  const config = materialLabels[material.material_type] || materialLabels.other;
                  const expired = Boolean(material.valid_until && referenceTime > 0 && new Date(material.valid_until).getTime() < referenceTime);
                  return <article key={material.id} className="rounded-[22px] border border-white/[0.07] bg-white/[0.025] p-5">
                    <div className="flex items-start justify-between"><span className="text-3xl text-sky-300">{config.icon}</span><div className="flex gap-2"><AtlasBadge tone={material.review_status === "verified" ? "success" : "warning"}>{material.review_status === "verified" ? "VALIDADO" : "Validação pendente"}</AtlasBadge><AtlasBadge tone={expired ? "danger" : "success"}>{expired ? "VENCIDO" : `V${material.version}`}</AtlasBadge></div></div>
                    <h2 className="mt-4 text-lg font-semibold text-white">{material.title}</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{config.description}</p>
                    <div className="mt-4 flex justify-between text-xs text-slate-500"><span>{formatSize(material.file_size)}</span><span>{material.valid_until ? `Válido até ${new Date(`${material.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}` : "Sem vencimento"}</span></div>
                    <div className="mt-4 grid grid-cols-2 gap-2">{material.url ? <a href={material.url} target="_blank" rel="noreferrer" className="atlas-button-secondary block text-center">Abrir material</a> : <span className="text-xs text-rose-300">Arquivo indisponível</span>}{canManage && material.review_status !== "verified" ? <button onClick={() => void reviewMaterial(material.id)} className="atlas-button-secondary">Validar material</button> : null}</div>
                  </article>;
                })}
              </div>
            )}
          </div>
        </AtlasCard>
      </section>

      {canManage && selected ? (
        <AtlasCard>
          <AtlasCardHeader eyebrow="Atualização simples" title="Publicar nova versão" description="A versão anterior é arquivada automaticamente e o time passa a usar apenas o arquivo novo." />
          <form onSubmit={uploadMaterial} className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-2 text-xs text-slate-400">Tipo do material<select value={form.materialType} onChange={(event) => setForm({ ...form, materialType: event.target.value })} className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white">{Object.entries(materialLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
            <label className="space-y-2 text-xs text-slate-400">Título<input required minLength={2} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Tabela junho 2026" className="block w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white" /></label>
            <label className="space-y-2 text-xs text-slate-400">Vigência inicial<input type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white" /></label>
            <label className="space-y-2 text-xs text-slate-400">Válido até<input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white" /></label>
            <label className="space-y-2 text-xs text-slate-400 lg:col-span-2">Descrição<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Observação rápida para o time" className="block w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white" /></label>
            <label className="space-y-2 text-xs text-slate-400">Arquivo<input required type="file" accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,.webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="block w-full rounded-xl border border-dashed border-sky-400/30 bg-sky-400/[0.06] px-4 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-400/15 file:px-3 file:py-1.5 file:text-sky-200" /></label>
            <div className="flex items-end"><button type="submit" disabled={!file || uploading} className="atlas-button-primary w-full">{uploading ? "Publicando..." : "Publicar nova versão"}</button></div>
          </form>
        </AtlasCard>
      ) : null}
    </div>
  );
}
