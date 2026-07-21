"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

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
  technical_memorial: { label: "Memorial técnico", icon: "≣", description: "Especificações, acabamentos e escopo técnico" },
  registration_form: { label: "Ficha cadastral", icon: "▧", description: "Formulário oficial para cadastro do cliente" },
  video: { label: "Vídeos comerciais", icon: "▶", description: "Decorado, facilidades, proximidades e campanha" },
  site_plan: { label: "Implantação", icon: "⌗", description: "Posição das unidades, orientação solar e acessos" },
  other: { label: "Outros materiais", icon: "◇", description: "Documentos complementares" },
};
const essentialTypes = ["book", "price_table", "sales_mirror"] as const;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* CC-6: anel de foco padrão e campos compostos sem conflito de padding. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const fieldBase =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] ${focusRing}`;
const fieldClass = `${fieldBase} px-4`;
const searchFieldClass = `${fieldBase} pl-4 pr-12`;
const selectClass =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-[#0b1224] px-4 text-sm text-[#e8eef8] transition-colors focus:border-[color:var(--atlas-accent)] ${focusRing}`;

/* Estado semântico único por material: vencido > rejeitado > pendente > vigente.
   Substitui os dois badges simultâneos (revisão + versão) do layout anterior. */
function materialState(material: Material, referenceTime: number) {
  const expired = Boolean(material.valid_until && referenceTime > 0 && new Date(material.valid_until).getTime() < referenceTime);
  if (expired) return { label: `Vencido · v${material.version}`, tone: "danger" as const, band: "#fb7185" };
  if (material.review_status === "rejected") return { label: `Rejeitado · v${material.version}`, tone: "danger" as const, band: "#fb7185" };
  if (material.review_status === "pending") return { label: `Validação pendente · v${material.version}`, tone: "warning" as const, band: "#f5b544" };
  return { label: `Vigente · v${material.version}`, tone: "success" as const, band: "#34d399" };
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
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialType, setMaterialType] = useState("");
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
      if (!portfolioResponse.ok) setError(portfolio.error?.message || portfolio.error || "Não foi possível carregar os projetos.");
      else {
        const items = (portfolio.developments ?? []) as Development[];
        setDevelopments(items);
        setCoverage(portfolio.coverageByDeveloper ?? []);
        setPortfolioSummary(portfolio.summary ?? null);
        const parameters = new URLSearchParams(window.location.search);
        const preferred = parameters.get("project");
        const preferredDeveloper = parameters.get("developer");
        if (preferredDeveloper) setDeveloper(preferredDeveloper);
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

  useEffect(() => {
    setMaterialQuery("");
    setMaterialType("");
    void loadMaterials(selectedId);
  }, [selectedId]);

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
  const visibleMaterials = useMemo(() => {
    const normalized = materialQuery.trim().toLowerCase();
    return materials
      .filter((material) => !materialType || material.material_type === materialType)
      .filter((material) => !normalized || [material.title, material.description, material.file_name, materialLabels[material.material_type]?.label].some((value) => value?.toLowerCase().includes(normalized)))
      .sort((left, right) => {
        const leftExpired = Boolean(left.valid_until && referenceTime > 0 && new Date(left.valid_until).getTime() < referenceTime);
        const rightExpired = Boolean(right.valid_until && referenceTime > 0 && new Date(right.valid_until).getTime() < referenceTime);
        if (leftExpired !== rightExpired) return leftExpired ? 1 : -1;
        if (left.review_status !== right.review_status) return left.review_status === "verified" ? -1 : 1;
        return right.created_at.localeCompare(left.created_at);
      });
  }, [materialQuery, materialType, materials, referenceTime]);

  async function shareMaterial(material: Material) {
    if (!material.url) return;
    try {
      const nativeShare = typeof navigator.share === "function";
      if (nativeShare) await navigator.share({ title: material.title, text: `${selected?.name || "Empreendimento"} · link temporário do Atlas`, url: material.url });
      else await navigator.clipboard.writeText(material.url);
      setNotice(nativeShare ? "Material compartilhado com segurança." : "Link temporário copiado. Ele expira em 15 minutos.");
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError") return;
      setError("Não foi possível compartilhar. Abra o material e use o compartilhamento do navegador.");
    }
  }

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
    if (!response.ok) setError(payload.error?.message || payload.error || "Falha ao validar material."); else { setNotice("Material validado e registrado no histórico."); await loadMaterials(selectedId); }
  }

  return (
    <div className="space-y-4 pb-10" data-phase="67-developer-material-center" data-materials-layout="cc6-governance" aria-busy={loading}>
      <PageHeader
        eyebrow="Empreendimentos · Central de materiais"
        title="O material certo, sempre na versão vigente"
        description="Book, tabela e espelho por incorporadora e projeto — links temporários, versões arquivadas e validação humana."
      />

      {/* Pulso do portfólio (única superfície com 3D). Consolida o hero antigo,
          os quatro badges decorativos e a régua de métricas em um painel. */}
      <section aria-label="Pulso do portfólio de materiais">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso · portfólio</p>
            <span className="cc6-chip">{loading ? "sincronizando" : `${developments.length} projetos`}</span>
          </div>
          <div className="cc6-hairline mt-4 grid grid-cols-1 gap-x-8 gap-y-4 pt-4 sm:grid-cols-3">
            <div title="Projetos com book, tabela e espelho vigentes.">
              <p className="cc6-metric-value text-3xl leading-none">{loading ? "—" : `${portfolioSummary?.complete ?? 0}/${portfolioSummary?.projects ?? 0}`}</p>
              <p className="cc6-metric-label mt-1.5">Projetos com kit completo</p>
            </div>
            <div title="Vencidos ou a vencer em 7 dias em todo o portfólio.">
              <p className={`cc6-metric-value text-3xl leading-none ${(portfolioSummary?.expiring || portfolioSummary?.expired) ? "cc6-warn" : ""}`}>
                {loading ? "—" : (portfolioSummary?.expiring ?? 0) + (portfolioSummary?.expired ?? 0)}
              </p>
              <p className="cc6-metric-label mt-1.5">Pedem atualização</p>
            </div>
            <div title="Materiais aguardando validação da gestão comercial.">
              <p className="cc6-metric-value text-3xl leading-none">{loading ? "—" : portfolioSummary?.pendingReview ?? 0}</p>
              <p className="cc6-metric-label mt-1.5">Aguardam validação</p>
            </div>
          </div>
        </TiltShell>
      </section>

      <div aria-live="polite" className="space-y-2 empty:hidden">
        {error ? <div role="alert" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[#fb7185]" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div> : null}
        {notice ? <div role="status" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[#34d399]" style={{ "--cc6-sev": "#34d399" } as CSSProperties}>{notice}</div> : null}
      </div>

      <section className="cc6-panel cc6-reveal p-5" style={{ animationDelay: "90ms" }} aria-labelledby="materials-coverage-title">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="cc6-eyebrow">Visão corporativa</p>
            <h2 id="materials-coverage-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Cobertura por incorporadora</h2>
          </div>
          <span className="cc6-chip">{coverage.length} incorporadoras</span>
        </header>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {coverage.map((item, index) => (
            <button
              key={item.developerName}
              type="button"
              onClick={() => setDeveloper(item.developerName)}
              className={`cc6-panel-quiet cc6-reveal p-4 text-left transition-colors hover:border-[rgba(148,163,184,0.22)]! ${focusRing}`}
              style={{ animationDelay: `${110 + Math.min(index, 8) * 40}ms` }}
            >
              <span className="flex items-start justify-between gap-3">
                <strong className="truncate text-[13px] font-semibold text-[#e8eef8]">{item.developerName}</strong>
                <StatusBadge tone={item.averageCoverage === 100 ? "success" : "warning"}>{item.averageCoverage}%</StatusBadge>
              </span>
              <span className="cc6-num mt-2 block text-[11px] leading-4 text-[#6b7890]">
                {item.complete}/{item.projects} completos · {item.expiring} a vencer · {item.expired} vencidos · {item.pendingReview} em revisão
              </span>
            </button>
          ))}
          {!coverage.length && !loading ? (
            <p className="text-sm text-[#6b7890] sm:col-span-2 xl:col-span-3">Sem cobertura calculada — cadastre projetos e materiais para iniciar.</p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[.72fr_1.28fr] xl:items-start">
        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "140ms" }} aria-labelledby="materials-picker-title">
          <header className="px-5 pb-4 pt-5">
            <p className="cc6-eyebrow">Busca rápida</p>
            <h2 id="materials-picker-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Incorporadora e projeto</h2>
          </header>
          <div className="cc6-hairline space-y-3 p-5">
            <div className="relative">
              <label className="sr-only" htmlFor="materials-project-query">Buscar projeto</label>
              <input
                id="materials-project-query"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Projeto, incorporadora ou cidade…"
                className={searchFieldClass}
              />
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca de projetos" className={`absolute inset-y-0 right-0 w-11 rounded-r-xl text-[#6b7890] transition-colors hover:text-[#e8eef8] ${focusRing}`}>×</button> : null}
            </div>
            <label className="sr-only" htmlFor="materials-developer-filter">Filtrar por incorporadora</label>
            <select id="materials-developer-filter" value={developer} onChange={(event) => setDeveloper(event.target.value)} className={selectClass}>
              <option value="">Todas as incorporadoras</option>
              {developers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <div className="max-h-[420px] space-y-2 overflow-auto pt-1">
              {loading ? [1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-16 w-full" />) : filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selectedId === item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === item.id ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)]" : "border-[rgba(148,163,184,0.12)] bg-white/[0.02] hover:border-[rgba(148,163,184,0.26)]"} ${focusRing}`}
                >
                  <span className="block truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7890]">{item.developer_name || "Sem incorporadora"}</span>
                  <strong className="mt-1 block truncate text-[13px] font-semibold text-[#e8eef8]">{item.name}</strong>
                  <span className="cc6-num mt-0.5 block truncate text-[11px] text-[#6b7890]">{item.city || "Cidade não informada"} · {item.status}</span>
                </button>
              ))}
              {!loading && filtered.length === 0 ? (
                <AtlasEmpty
                  reason="no-results"
                  eyebrow="Busca sem correspondência"
                  title="Nenhum projeto neste filtro"
                  description="Limpe a busca ou tente parte do nome."
                />
              ) : null}
            </div>
          </div>
        </section>

        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "170ms" }} aria-labelledby="materials-kit-title">
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Kit comercial</p>
              <h2 id="materials-kit-title" className="mt-1 truncate text-lg font-semibold tracking-tight text-[#e8eef8]">{selected?.name || "Materiais do projeto"}</h2>
              {selected ? <p className="mt-0.5 truncate font-mono text-[11px] text-[#6b7890]">{selected.developer_name || "Incorporadora não informada"}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="cc6-chip" title="Book, tabela e espelho vigentes no projeto selecionado.">{materialsLoading ? "kit …" : `kit ${essentialReady}/3`}</span>
              {selected ? (
                <Link href={`/developments/${selected.id}`} className={`rounded-md text-[12px] font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[#e8eef8] ${focusRing}`}>
                  Abrir projeto →
                </Link>
              ) : null}
            </div>
          </header>
          <div className="cc6-hairline p-5">
            {/* Kit essencial: uma única superfície por tipo — funde o antigo
                grid de acesso rápido, a lista da homologação e o banner amber. */}
            {selected ? (
              <div className="grid gap-2 sm:grid-cols-3" aria-label="Acesso rápido ao kit essencial">
                {essentialMaterials.map(({ type, material }) => material?.url ? (
                  <a
                    key={type}
                    href={material.url}
                    target="_blank"
                    rel="noreferrer"
                    className={`cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 transition-colors hover:border-[rgba(148,163,184,0.22)]! ${focusRing}`}
                    style={{ "--cc6-sev": "#34d399" } as CSSProperties}
                  >
                    <strong className="block truncate text-[13px] font-semibold text-[#e8eef8]">{materialLabels[type].label}</strong>
                    <span className="cc6-num mt-0.5 block text-[11px] text-[#34d399]">vigente · v{material.version} · abrir →</span>
                  </a>
                ) : (
                  <div key={type} className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3" style={{ "--cc6-sev": "#f5b544" } as CSSProperties}>
                    <strong className="block truncate text-[13px] font-semibold text-[#e8eef8]">{materialLabels[type].label}</strong>
                    <span className="cc6-num cc6-warn mt-0.5 block text-[11px]">pendente de publicação</span>
                  </div>
                ))}
              </div>
            ) : null}
            {!materialsLoading && selected && missingEssential.length ? (
              <p className="cc6-warn mt-3 text-[12px] leading-5">
                Kit incompleto — falta {missingEssential.map((type) => materialLabels[type].label).join(", ")}.
              </p>
            ) : null}
            {selected && storageHomologation ? (
              <div className="cc6-hairline mt-4 flex flex-wrap items-center gap-2 pt-3" aria-label="Homologação do storage privado">
                <StatusBadge tone={storageHomologation.status === "passed" ? "success" : "warning"}>
                  Fase 31 · {storageHomologation.status === "passed" ? "Comprovada" : "Pendente"}
                </StatusBadge>
                <span className="cc6-chip">links de {Math.round(storageHomologation.signedUrlTtlSeconds / 60)} min</span>
                <span className={storageHomologation.privateBucket ? "cc6-chip" : "cc6-chip cc6-crit"}>{storageHomologation.privateBucket ? "bucket privado" : "bucket público — revisar"}</span>
                <span className={storageHomologation.tenantPathProtected ? "cc6-chip" : "cc6-chip cc6-crit"}>{storageHomologation.tenantPathProtected ? "caminho isolado" : "isolamento — revisar"}</span>
              </div>
            ) : null}

            {selected && materials.length ? (
              <div className="cc6-hairline mt-4 pt-4">
                <div className="flex flex-col gap-2 lg:flex-row">
                  <div className="relative flex-1">
                    <label className="sr-only" htmlFor="materials-kit-query">Buscar material</label>
                    <input
                      id="materials-kit-query"
                      type="search"
                      value={materialQuery}
                      onChange={(event) => setMaterialQuery(event.target.value)}
                      placeholder="Tabela, planta, vídeo, memorial…"
                      className={searchFieldClass}
                    />
                    {materialQuery ? <button type="button" onClick={() => setMaterialQuery("")} aria-label="Limpar busca de materiais" className={`absolute inset-y-0 right-0 w-11 rounded-r-xl text-[#6b7890] transition-colors hover:text-[#e8eef8] ${focusRing}`}>×</button> : null}
                  </div>
                  <label className="sr-only" htmlFor="materials-type-filter">Filtrar por tipo de material</label>
                  <select id="materials-type-filter" value={materialType} onChange={(event) => setMaterialType(event.target.value)} className={`${selectClass} lg:w-56`}>
                    <option value="">Todos os materiais</option>
                    {Object.entries(materialLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {essentialTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={materialType === type}
                      onClick={() => setMaterialType(materialType === type ? "" : type)}
                      className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors ${materialType === type ? "border-[rgba(75,141,248,0.45)] bg-[rgba(75,141,248,0.08)] text-[#e8eef8]" : "border-[rgba(148,163,184,0.16)] text-[#aab6ca] hover:border-[rgba(148,163,184,0.3)] hover:text-[#e8eef8]"} ${focusRing}`}
                    >
                      {materialLabels[type].label}
                    </button>
                  ))}
                  <span className="cc6-num ml-auto text-[11px] text-[#6b7890]">{visibleMaterials.length} resultado(s)</span>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              {materialsLoading ? (
                <div className="grid gap-2">{[1, 2, 3, 4].map((item) => <AtlasSkeleton key={item} className="h-20 w-full" />)}</div>
              ) : !selected ? (
                <AtlasEmpty
                  reason="not-configured"
                  eyebrow="Seleção necessária"
                  title="Escolha uma incorporadora e um projeto"
                  description="Selecione o projeto para acessar o kit comercial."
                />
              ) : materials.length === 0 ? (
                <AtlasEmpty
                  reason="first-use"
                  eyebrow="Kit ainda vazio"
                  title="Nenhum material publicado"
                  description="Publique book, tabela ou espelho para liberar o material ao time."
                />
              ) : visibleMaterials.length === 0 ? (
                <AtlasEmpty
                  reason="no-results"
                  eyebrow="Filtro sem correspondência"
                  title="Nenhum material neste filtro"
                  description="Escolha outro tipo ou limpe a busca."
                />
              ) : (
                <div className="grid gap-2">
                  {visibleMaterials.map((material, index) => {
                    const config = materialLabels[material.material_type] || materialLabels.other;
                    const state = materialState(material, referenceTime);
                    return (
                      <article
                        key={material.id}
                        className="cc6-sev-band cc6-panel-quiet cc6-reveal flex flex-col gap-3 py-3 pl-4 pr-3 transition-colors hover:border-[rgba(148,163,184,0.22)]! sm:flex-row sm:items-center"
                        style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, "--cc6-sev": state.band } as CSSProperties}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-[13px] font-semibold text-[#e8eef8]" title={material.title}>{material.title}</h3>
                            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                          </div>
                          <p className="cc6-num mt-1 truncate text-[11px] text-[#6b7890]" title={material.description || config.description}>
                            {config.label} · {formatSize(material.file_size)} · {material.valid_until ? `até ${new Date(`${material.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}` : "sem vencimento"}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {material.url ? (
                            <>
                              <a href={material.url} target="_blank" rel="noreferrer" className="atlas-button-primary">Abrir</a>
                              <button type="button" onClick={() => void shareMaterial(material)} className="cc6-ghost-btn">Compartilhar</button>
                            </>
                          ) : (
                            <span className="cc6-crit text-xs">Arquivo indisponível</span>
                          )}
                          {canManage && material.review_status !== "verified" ? (
                            <button type="button" onClick={() => void reviewMaterial(material.id)} className="cc6-ghost-btn">Validar</button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      </section>

      {canManage && selected ? (
        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "200ms" }} aria-labelledby="materials-upload-title">
          <header className="px-5 pb-4 pt-5">
            <p className="cc6-eyebrow">Governança de versões</p>
            <h2 id="materials-upload-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Publicar nova versão</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">A anterior é arquivada automaticamente; o time passa a ver somente o arquivo novo.</p>
          </header>
          <form onSubmit={uploadMaterial} className="cc6-hairline grid gap-3 p-5 lg:grid-cols-2 xl:grid-cols-4">
            <label className="block text-xs font-medium text-[#aab6ca]">Tipo do material
              <select value={form.materialType} onChange={(event) => setForm({ ...form, materialType: event.target.value })} className={`${selectClass} mt-1.5`}>
                {Object.entries(materialLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Título
              <input required minLength={2} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Tabela junho 2026" className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Vigência inicial
              <input type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Válido até
              <input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca] lg:col-span-2">Descrição
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Observação rápida para o time" className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Arquivo
              <input
                required
                type="file"
                accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp4,.mov"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className={`mt-1.5 block w-full rounded-xl border border-dashed border-[rgba(75,141,248,0.35)] bg-[rgba(75,141,248,0.05)] px-4 py-2.5 text-sm text-[#aab6ca] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(75,141,248,0.14)] file:px-3 file:py-1.5 file:text-[color:var(--atlas-accent-hover)] ${focusRing}`}
              />
            </label>
            <div className="flex items-end">
              <button type="submit" disabled={!file || uploading} className="atlas-button-primary w-full disabled:opacity-40">{uploading ? "Publicando…" : "Publicar nova versão"}</button>
            </div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
