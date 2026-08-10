"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import {
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  product_type: string | null;
  typologies: string[] | null;
  status: string;
  coveragePercent?: number;
  pendingReview?: number;
  inventory?: {
    total: number;
    available: number;
    minimumPrice: number | null;
    maximumPrice: number | null;
  };
};

type Material = {
  id: string;
  material_type: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
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
type Coverage = {
  developerName: string;
  projects: number;
  complete: number;
  averageCoverage: number;
  expiring: number;
  expired: number;
  pendingReview: number;
};
type PortfolioSummary = {
  projects: number;
  complete: number;
  expiring: number;
  expired: number;
  pendingReview: number;
};

type StorageHomologation = {
  status: "passed" | "incomplete";
  privateBucket: boolean;
  tenantPathProtected: boolean;
  signedUrlTtlSeconds: number;
  essential: Array<{
    type: string;
    available: boolean;
    version: number | null;
    expiresAt: string | null;
  }>;
};

const materialLabels: Record<
  string,
  { label: string; icon: string; description: string }
> = {
  book: {
    label: "Book comercial",
    icon: "◫",
    description: "Apresentação completa do empreendimento",
  },
  price_table: {
    label: "Tabela de vendas",
    icon: "▦",
    description: "Preços, fluxo e condições comerciais",
  },
  sales_mirror: {
    label: "Espelho de vendas",
    icon: "▥",
    description: "Disponibilidade atualizada das unidades",
  },
  floor_plan: {
    label: "Plantas",
    icon: "⌑",
    description: "Tipologias e materiais técnicos",
  },
  presentation: {
    label: "Apresentação",
    icon: "▤",
    description: "Material de apoio para atendimento",
  },
  technical_memorial: {
    label: "Memorial técnico",
    icon: "≣",
    description: "Especificações, acabamentos e escopo técnico",
  },
  registration_form: {
    label: "Ficha cadastral",
    icon: "▧",
    description: "Formulário oficial para cadastro do cliente",
  },
  video: {
    label: "Vídeos comerciais",
    icon: "▶",
    description: "Decorado, facilidades, proximidades e campanha",
  },
  site_plan: {
    label: "Implantação",
    icon: "⌗",
    description: "Posição das unidades, orientação solar e acessos",
  },
  other: {
    label: "Outros materiais",
    icon: "◇",
    description: "Documentos complementares",
  },
};
const essentialTypes = ["book", "price_table", "sales_mirror"] as const;
const libraryGroups = [
  {
    id: "essential",
    title: "Oferta comercial",
    description: "Book, tabela e espelho para atender e negociar.",
  },
  {
    id: "plans",
    title: "Plantas e implantação",
    description: "Tipologias, posição e leitura técnica do produto.",
  },
  {
    id: "visual",
    title: "Imagens e vídeos",
    description: "Conteúdo visual para apresentação ao cliente.",
  },
  {
    id: "documents",
    title: "Documentos de apoio",
    description: "Memoriais, fichas e arquivos complementares.",
  },
] as const;
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectMaterialsPage() {
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [storageHomologation, setStorageHomologation] =
    useState<StorageHomologation | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [portfolioSummary, setPortfolioSummary] =
    useState<PortfolioSummary | null>(null);
  const [currentRole, setCurrentRole] = useState("");
  const [query, setQuery] = useState("");
  const [developer, setDeveloper] = useState("");
  const [region, setRegion] = useState("");
  const [typology, setTypology] = useState("");
  const [materialQuery, setMaterialQuery] = useState("");
  const [materialType, setMaterialType] = useState("");
  const [loading, setLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploading, setUploading] = useState(false);
  const [referenceTime, setReferenceTime] = useState(0);
  const [attendanceLeadId, setAttendanceLeadId] = useState("");
  const [form, setForm] = useState({
    materialType: "price_table",
    title: "",
    description: "",
    validFrom: "",
    validUntil: "",
  });
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
      if (!token) {
        setError("Sessão expirada.");
        setLoading(false);
        return;
      }
      const [portfolioResponse, meResponse] = await Promise.all([
        fetch("/api/v1/developments/materials", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/v1/auth/me"),
      ]);
      const portfolio = await portfolioResponse.json();
      const me = await meResponse.json();
      if (!portfolioResponse.ok)
        setError(portfolio.error || "Não foi possível carregar os projetos.");
      else {
        const items = (portfolio.developments ?? []) as Development[];
        setDevelopments(items);
        setCoverage(portfolio.coverageByDeveloper ?? []);
        setPortfolioSummary(portfolio.summary ?? null);
        const parameters = new URLSearchParams(window.location.search);
        const preferred = parameters.get("project");
        const preferredDeveloper = parameters.get("developer");
        const attendanceLead =
          parameters.get("mode") === "attendance"
            ? parameters.get("lead")
            : null;
        if (attendanceLead) setAttendanceLeadId(attendanceLead);
        if (preferredDeveloper) setDeveloper(preferredDeveloper);
        if (items.length)
          setSelectedId(
            items.some((item) => item.id === preferred)
              ? preferred!
              : items[0].id,
          );
      }
      setCurrentRole(
        me?.data?.profile?.commercialRole || me?.data?.profile?.role || "",
      );
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
      const response = await fetch(
        `/api/v1/developments/${developmentId}/materials`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error || "Não foi possível carregar os materiais.",
        );
      setMaterials(payload.materials ?? []);
      setStorageHomologation(payload.storageHomologation ?? null);
      setReferenceTime(Date.now());
    } catch (loadError) {
      setMaterials([]);
      setStorageHomologation(null);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os materiais.",
      );
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
    () =>
      [
        ...new Set(
          developments.map(
            (item) => item.developer_name || "Sem incorporadora",
          ),
        ),
      ].sort(),
    [developments],
  );
  const regions = useMemo(
    () =>
      [
        ...new Set(
          developments
            .flatMap((item) => [item.neighborhood, item.city])
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [developments],
  );
  const typologies = useMemo(
    () =>
      [
        ...new Set(
          developments
            .flatMap((item) => [item.product_type, ...(item.typologies ?? [])])
            .filter((value): value is string => Boolean(value)),
        ),
      ].sort(),
    [developments],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return developments.filter((item) => {
      const matchesDeveloper =
        !developer ||
        (item.developer_name || "Sem incorporadora") === developer;
      const matchesRegion =
        !region || item.neighborhood === region || item.city === region;
      const matchesTypology =
        !typology ||
        item.product_type === typology ||
        item.typologies?.includes(typology);
      const matchesQuery =
        !normalized ||
        [
          item.name,
          item.developer_name,
          item.neighborhood,
          item.city,
          item.state,
          item.product_type,
          ...(item.typologies ?? []),
        ].some((value) => value?.toLowerCase().includes(normalized));
      return (
        matchesDeveloper && matchesRegion && matchesTypology && matchesQuery
      );
    });
  }, [developer, developments, query, region, typology]);
  const selected = developments.find((item) => item.id === selectedId) ?? null;
  const canManage = ["admin", "director", "superintendent", "manager"].includes(
    currentRole,
  );
  const missingEssential = essentialTypes.filter(
    (type) =>
      !materials.some(
        (material) =>
          material.material_type === type &&
          (!material.valid_until ||
            referenceTime === 0 ||
            new Date(material.valid_until).getTime() >= referenceTime),
      ),
  );
  const essentialReady = essentialTypes.length - missingEssential.length;
  const essentialMaterials = essentialTypes.map((type) => ({
    type,
    material:
      materials.find(
        (material) =>
          material.material_type === type &&
          (!material.valid_until ||
            referenceTime === 0 ||
            new Date(material.valid_until).getTime() >= referenceTime),
      ) ?? null,
  }));
  const closestMaterialExpiry = essentialMaterials
    .map((item) => item.material?.valid_until)
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const visibleMaterials = useMemo(() => {
    const normalized = materialQuery.trim().toLowerCase();
    return materials
      .filter(
        (material) => !materialType || material.material_type === materialType,
      )
      .filter(
        (material) =>
          !normalized ||
          [
            material.title,
            material.description,
            material.file_name,
            materialLabels[material.material_type]?.label,
          ].some((value) => value?.toLowerCase().includes(normalized)),
      )
      .sort((left, right) => {
        const leftExpired = Boolean(
          left.valid_until &&
          referenceTime > 0 &&
          new Date(left.valid_until).getTime() < referenceTime,
        );
        const rightExpired = Boolean(
          right.valid_until &&
          referenceTime > 0 &&
          new Date(right.valid_until).getTime() < referenceTime,
        );
        if (leftExpired !== rightExpired) return leftExpired ? 1 : -1;
        if (left.review_status !== right.review_status)
          return left.review_status === "verified" ? -1 : 1;
        return right.created_at.localeCompare(left.created_at);
      });
  }, [materialQuery, materialType, materials, referenceTime]);
  const groupedVisibleMaterials = useMemo(
    () =>
      libraryGroups.map((group) => ({
        ...group,
        materials: visibleMaterials.filter((material) => {
          if (group.id === "essential")
            return essentialTypes.includes(
              material.material_type as (typeof essentialTypes)[number],
            );
          if (group.id === "plans")
            return ["floor_plan", "site_plan"].includes(material.material_type);
          if (group.id === "visual")
            return (
              ["presentation", "video"].includes(material.material_type) ||
              material.mime_type?.startsWith("image/") ||
              material.mime_type?.startsWith("video/")
            );
          return ![
            ...essentialTypes,
            "floor_plan",
            "site_plan",
            "presentation",
            "video",
          ].includes(material.material_type);
        }),
      })),
    [visibleMaterials],
  );
  const materialActionQueue = useMemo(() => {
    if (!referenceTime) return [];
    return materials
      .flatMap((material) => {
        const expiryAt = material.valid_until
          ? new Date(`${material.valid_until}T12:00:00`).getTime()
          : null;
        const daysUntilExpiry = expiryAt
          ? Math.ceil((expiryAt - referenceTime) / 86_400_000)
          : null;
        const expired = daysUntilExpiry !== null && daysUntilExpiry < 0;
        const expiringSoon =
          daysUntilExpiry !== null &&
          daysUntilExpiry >= 0 &&
          daysUntilExpiry <= 30;
        const needsReview = material.review_status !== "verified";
        if (!expired && !expiringSoon && !needsReview) return [];
        return [
          {
            material,
            priority: expired ? 0 : expiringSoon ? 1 : 2,
            expired,
            expiringSoon,
            needsReview,
            daysUntilExpiry,
          },
        ];
      })
      .sort(
        (left, right) =>
          left.priority - right.priority ||
          (left.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER) -
            (right.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER) ||
          right.material.created_at.localeCompare(left.material.created_at),
      );
  }, [materials, referenceTime]);

  function prepareMaterialUpdate(material: Material) {
    setForm({
      materialType: material.material_type,
      title: material.title,
      description: material.description || "",
      validFrom: "",
      validUntil: "",
    });
    setFile(null);
    requestAnimationFrame(() => {
      document
        .getElementById("material-version-form")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function shareMaterial(material: Material) {
    if (!material.url) return;
    try {
      const nativeShare = typeof navigator.share === "function";
      if (nativeShare)
        await navigator.share({
          title: material.title,
          text: `${selected?.name || "Empreendimento"} · link temporário do Atlas`,
          url: material.url,
        });
      else await navigator.clipboard.writeText(material.url);
      setNotice(
        nativeShare
          ? "Material compartilhado com segurança."
          : "Link temporário copiado. Ele expira em 15 minutos.",
      );
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name === "AbortError")
        return;
      setError(
        "Não foi possível compartilhar. Abra o material e use o compartilhamento do navegador.",
      );
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
      const response = await fetch(
        `/api/v1/developments/${selectedId}/materials`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` }, body },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Falha ao atualizar material.");
      setNotice(
        `${materialLabels[form.materialType]?.label || "Material"} atualizado com sucesso.`,
      );
      setFile(null);
      setForm((current) => ({
        ...current,
        title: "",
        description: "",
        validFrom: "",
        validUntil: "",
      }));
      await loadMaterials(selectedId);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Falha ao atualizar material.",
      );
    } finally {
      setUploading(false);
    }
  }

  async function reviewMaterial(materialId: string) {
    const note = "Material vigente conferido pela gestão comercial";
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sessão expirada. Entre novamente para validar o material.");
      return;
    }
    const response = await fetch("/api/v1/developments/materials", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ materialId, status: "verified", note }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error || "Falha ao validar material.");
    else {
      setNotice("Material validado e registrado no histórico.");
      await loadMaterials(selectedId);
    }
  }

  return (
    <div className="space-y-6 pb-10" data-phase="67-developer-material-center">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8">
        <div className="grid gap-7 xl:grid-cols-[1.4fr_.7fr] xl:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              <AtlasBadge tone="info">MATERIAL HUB</AtlasBadge>
              <AtlasBadge tone="success">TUDO EM UM LUGAR</AtlasBadge>
              <AtlasBadge tone="violet">POR INCORPORADORA</AtlasBadge>
              <AtlasBadge
                tone={
                  storageHomologation?.status === "passed"
                    ? "success"
                    : "warning"
                }
              >
                FASE 31 ·{" "}
                {storageHomologation?.status === "passed"
                  ? "COMPROVADA"
                  : "PENDENTE"}
              </AtlasBadge>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
              Encontre o material certo antes mesmo de o cliente terminar a
              pergunta.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Book, tabela, espelho de vendas, plantas e apresentações
              organizados por incorporadora e projeto, sempre na versão vigente.
            </p>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5">
            <p className="atlas-eyebrow">Projeto selecionado</p>
            <p className="mt-2 text-xl font-semibold text-white">
              {selected?.name || "Escolha um projeto"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              {selected?.developer_name || "Incorporadora não informada"}
            </p>
          </div>
        </div>
      </section>

      {attendanceLeadId ? (
        <section
          className="atlas-material-attendance-context"
          data-ux-phase="50-material-attendance-context"
          aria-labelledby="material-attendance-title"
        >
          <div>
            <p className="atlas-eyebrow">Atendimento em andamento</p>
            <h2 id="material-attendance-title">
              Kit de {selected?.name || "projeto a confirmar"}
            </h2>
            <p>
              Abra book, tabela ou espelho nesta página e retorne à lead sem
              refazer a busca. Confirme vigência, preço e estoque antes de enviar.
            </p>
          </div>
          <Link
            href={`/leads/${encodeURIComponent(attendanceLeadId)}`}
            className="atlas-button-secondary"
          >
            Voltar ao atendimento
          </Link>
        </section>
      ) : null}

      <section
        className="grid gap-4 sm:grid-cols-3"
        data-ux-phase="27-commercial-truth-first"
      >
        <AtlasMetric
          label="Estoque disponível"
          value={
            loading || materialsLoading
              ? "—"
              : (selected?.inventory?.available ?? 0)
          }
          detail={
            selected?.inventory?.total
              ? `${selected.inventory.total} unidades cadastradas no espelho`
              : "Estoque ainda não informado"
          }
          trend={selected?.inventory?.available ? "OFERTÁVEL" : "CONFIRMAR"}
          tone={selected?.inventory?.available ? "green" : "amber"}
        />
        <AtlasMetric
          label="Preço de entrada"
          value={
            loading || materialsLoading
              ? "—"
              : selected?.inventory?.minimumPrice
                ? brl.format(selected.inventory.minimumPrice)
                : "A confirmar"
          }
          detail="Menor valor entre as unidades disponíveis"
          trend={selected?.inventory?.minimumPrice ? "VIGENTE" : "SEM PREÇO"}
          tone={selected?.inventory?.minimumPrice ? "blue" : "amber"}
        />
        <AtlasMetric
          label="Material vigente"
          value={materialsLoading ? "—" : `${essentialReady}/3`}
          detail={
            closestMaterialExpiry
              ? `Próxima validade: ${new Date(`${closestMaterialExpiry}T12:00:00`).toLocaleDateString("pt-BR")}`
              : "Book, tabela e espelho sem vencimento próximo"
          }
          trend={missingEssential.length ? "INCOMPLETO" : "PRONTO"}
          tone={missingEssential.length ? "amber" : "green"}
        />
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Visão corporativa"
          title="Cobertura por incorporadora"
          description={`${portfolioSummary?.complete ?? 0}/${portfolioSummary?.projects ?? 0} projetos completos · ${(portfolioSummary?.expiring ?? 0) + (portfolioSummary?.expired ?? 0)} materiais pedem atualização. Análise secundária após a verdade comercial do projeto.`}
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          {coverage.map((item) => (
            <button
              key={item.developerName}
              onClick={() => setDeveloper(item.developerName)}
              className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-left hover:border-sky-400/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <strong className="text-white">{item.developerName}</strong>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.complete}/{item.projects} projetos completos
                  </p>
                </div>
                <AtlasBadge
                  tone={item.averageCoverage === 100 ? "success" : "warning"}
                >
                  {item.averageCoverage}%
                </AtlasBadge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span>{item.expiring} a vencer</span>
                <span>·</span>
                <span>{item.expired} vencidos</span>
                <span>·</span>
                <span>{item.pendingReview} em revisão</span>
              </div>
            </button>
          ))}
          {!coverage.length && !loading ? (
            <AtlasEmpty
              title="Sem cobertura calculada"
              description="Cadastre projetos e materiais para iniciar."
            />
          ) : null}
        </div>
      </AtlasCard>

      {selected && storageHomologation ? (
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 31 · Storage privado"
            title="Book, tabela e espelho protegidos"
            description="O aceite exige os três materiais vigentes, acessíveis por links temporários e isolados no caminho da organização."
          />
          <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-5">
            {storageHomologation.essential.map((item) => (
              <div
                key={item.type}
                className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
              >
                <span className="text-xs text-slate-500">
                  {materialLabels[item.type]?.label || item.type}
                </span>
                <div className="mt-2">
                  <AtlasBadge tone={item.available ? "success" : "warning"}>
                    {item.available ? `V${item.version} ACESSÍVEL` : "PENDENTE"}
                  </AtlasBadge>
                </div>
              </div>
            ))}
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <span className="text-xs text-slate-500">Segurança</span>
              <strong className="mt-2 block text-sm text-white">
                Bucket privado
              </strong>
              <p className="mt-1 text-[10px] text-slate-500">
                Links expiram em{" "}
                {Math.round(storageHomologation.signedUrlTtlSeconds / 60)} min ·
                caminho interno oculto
              </p>
            </div>
            <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <span className="text-xs text-slate-500">Isolamento</span>
              <strong className="mt-2 block text-sm text-white">
                {storageHomologation.tenantPathProtected
                  ? "Organização protegida"
                  : "Revisar"}
              </strong>
              <p className="mt-1 text-[10px] text-slate-500">
                Acesso validado antes de assinar
              </p>
            </div>
          </div>
        </AtlasCard>
      ) : null}

      <section
        className="grid gap-6 xl:grid-cols-[.72fr_1.28fr]"
        data-ux-phase="26-project-material-finder"
      >
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 26 · Busca decisiva"
            title="Encontre a oferta certa"
            description="Projeto, incorporadora, região e tipologia em uma única busca."
          />
          <div className="space-y-3 p-5">
            <div className="relative">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Projeto, incorporadora, bairro, cidade ou tipologia..."
                className="w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 pr-12 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Limpar busca de projetos"
                  className="absolute inset-y-0 right-0 w-11 text-slate-500 hover:text-white"
                >
                  ×
                </button>
              ) : null}
            </div>
            <select
              value={developer}
              onChange={(event) => setDeveloper(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"
            >
              <option value="">Todas as incorporadoras</option>
              {developers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-2">
              <select
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"
                aria-label="Filtrar por região"
              >
                <option value="">Todas as regiões</option>
                {regions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={typology}
                onChange={(event) => setTypology(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"
                aria-label="Filtrar por tipologia"
              >
                <option value="">Todas as tipologias</option>
                {typologies.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            {query || developer || region || typology ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-cyan-400/15 bg-cyan-400/[.05] px-3 py-2 text-[11px] text-cyan-100">
                <span>{filtered.length} projeto(s) aderentes aos filtros</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setDeveloper("");
                    setRegion("");
                    setTypology("");
                  }}
                  className="font-semibold text-cyan-300 hover:text-white"
                >
                  Limpar filtros
                </button>
              </div>
            ) : null}
            <div className="max-h-[420px] space-y-2 overflow-auto pt-2">
              {loading
                ? [1, 2, 3].map((item) => (
                    <AtlasSkeleton key={item} className="h-20 w-full" />
                  ))
                : filtered.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${selectedId === item.id ? "border-sky-400/30 bg-sky-400/10" : "border-white/[0.06] bg-white/[0.025] hover:bg-white/[0.05]"}`}
                    >
                      <span className="block text-[10px] font-semibold uppercase tracking-[.16em] text-slate-500">
                        {item.developer_name || "Sem incorporadora"}
                      </span>
                      <strong className="mt-1 block text-sm text-white">
                        {item.name}
                      </strong>
                      <span className="mt-1 block text-xs text-slate-500">
                        {[item.neighborhood, item.city, item.state]
                          .filter(Boolean)
                          .join(" · ") || "Região não informada"}
                      </span>
                      <span className="mt-2 block truncate text-[10px] uppercase tracking-[.1em] text-cyan-200/70">
                        {[item.product_type, ...(item.typologies ?? [])]
                          .filter(Boolean)
                          .join(" · ") || "Tipologia a confirmar"}{" "}
                        · {item.status}
                      </span>
                    </button>
                  ))}
              {!loading && filtered.length === 0 ? (
                <AtlasEmpty
                  title="Projeto não encontrado"
                  description="Limpe os filtros ou tente parte do nome, bairro ou incorporadora."
                />
              ) : null}
            </div>
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 28 · Biblioteca operacional"
            title={selected?.name || "Materiais do projeto"}
            description="Abra ou baixe sempre a versão vigente."
            action={
              selected ? (
                <Link
                  href={`/developments/${selected.id}`}
                  className="text-xs font-semibold text-sky-300"
                >
                  Abrir projeto →
                </Link>
              ) : null
            }
          />
          <div className="p-5 sm:p-6">
            {selected && materials.length ? (
              <div className="mb-5 rounded-2xl border border-white/[.07] bg-white/[.02] p-3">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <div className="relative flex-1">
                    <input
                      value={materialQuery}
                      onChange={(event) => setMaterialQuery(event.target.value)}
                      placeholder="Buscar tabela, planta, vídeo, memorial..."
                      className="w-full rounded-xl border border-white/10 bg-[#080f1c] px-4 py-3 pr-11 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/35"
                    />
                    {materialQuery ? (
                      <button
                        type="button"
                        onClick={() => setMaterialQuery("")}
                        aria-label="Limpar busca de materiais"
                        className="absolute inset-y-0 right-0 w-11 text-slate-500 hover:text-white"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  <select
                    value={materialType}
                    onChange={(event) => setMaterialType(event.target.value)}
                    className="rounded-xl border border-white/10 bg-[#080f1c] px-4 py-3 text-sm text-white"
                  >
                    <option value="">Todos os materiais</option>
                    {Object.entries(materialLabels).map(([value, item]) => (
                      <option key={value} value={value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {essentialTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setMaterialType(materialType === type ? "" : type)
                      }
                      className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.1em] transition ${materialType === type ? "border-sky-300/40 bg-sky-300/15 text-sky-200" : "border-white/10 text-slate-400 hover:border-sky-300/20 hover:text-white"}`}
                    >
                      {materialLabels[type].label}
                    </button>
                  ))}
                  <span className="ml-auto self-center text-[10px] text-slate-500">
                    {visibleMaterials.length} resultado(s)
                  </span>
                </div>
              </div>
            ) : null}
            {selected ? (
              <div
                className="mb-5 grid gap-2 sm:grid-cols-3"
                aria-label="Acesso rápido ao kit essencial"
              >
                {essentialMaterials.map(({ type, material }) =>
                  material?.url ? (
                    <a
                      key={type}
                      href={material.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.06] p-3 transition hover:border-emerald-300/35"
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-[.12em] text-emerald-300">
                        Vigente · V{material.version}
                      </span>
                      <strong className="mt-1 block text-sm text-white">
                        {materialLabels[type].label}
                      </strong>
                      <small className="mt-1 block text-slate-500">
                        Abrir agora →
                      </small>
                    </a>
                  ) : (
                    <div
                      key={type}
                      className="rounded-2xl border border-amber-400/15 bg-amber-400/[.04] p-3"
                    >
                      <span className="block text-[10px] font-bold uppercase tracking-[.12em] text-amber-300">
                        Pendente
                      </span>
                      <strong className="mt-1 block text-sm text-white">
                        {materialLabels[type].label}
                      </strong>
                      <small className="mt-1 block text-slate-500">
                        Aguardando publicação
                      </small>
                    </div>
                  ),
                )}
              </div>
            ) : null}
            {!materialsLoading && canManage && selected && materials.length ? (
              <section
                className="mb-5 overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.02]"
                data-ux-phase="29-material-action-queue"
                aria-labelledby="material-action-queue-title"
              >
                <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-amber-300">
                      Atualização necessária
                    </p>
                    <h2
                      id="material-action-queue-title"
                      className="mt-1 text-sm font-semibold text-white"
                    >
                      Fila de materiais
                    </h2>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      Vencimentos e validações em ordem de urgência.
                    </p>
                  </div>
                  <AtlasBadge
                    tone={materialActionQueue.length ? "warning" : "success"}
                  >
                    {materialActionQueue.length
                      ? `${materialActionQueue.length} pendência(s)`
                      : "EM DIA"}
                  </AtlasBadge>
                </header>
                {materialActionQueue.length ? (
                  <div className="divide-y divide-white/[0.05]">
                    {materialActionQueue.slice(0, 5).map((item) => {
                      const config =
                        materialLabels[item.material.material_type] ||
                        materialLabels.other;
                      const urgency = item.expired
                        ? "Vencido"
                        : item.expiringSoon
                          ? item.daysUntilExpiry === 0
                            ? "Vence hoje"
                            : `Vence em ${item.daysUntilExpiry} dia(s)`
                          : "Revisão pendente";
                      return (
                        <article
                          key={item.material.id}
                          className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              className={`grid size-9 shrink-0 place-items-center rounded-xl border text-lg ${item.expired ? "border-rose-400/20 bg-rose-400/[0.07] text-rose-300" : "border-amber-400/20 bg-amber-400/[0.07] text-amber-300"}`}
                              aria-hidden="true"
                            >
                              {config.icon}
                            </span>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <strong className="truncate text-sm text-white">
                                  {item.material.title}
                                </strong>
                                <AtlasBadge
                                  tone={item.expired ? "danger" : "warning"}
                                >
                                  {urgency}
                                </AtlasBadge>
                                {item.needsReview &&
                                (item.expired || item.expiringSoon) ? (
                                  <AtlasBadge tone="neutral">
                                    REVISAR
                                  </AtlasBadge>
                                ) : null}
                              </div>
                              <p className="mt-1 truncate text-[11px] text-slate-500">
                                {config.label} · V{item.material.version}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            {item.needsReview ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void reviewMaterial(item.material.id)
                                }
                                className="atlas-button-secondary px-3 py-2 text-xs"
                              >
                                Validar
                              </button>
                            ) : null}
                            {item.expired || item.expiringSoon ? (
                              <button
                                type="button"
                                onClick={() =>
                                  prepareMaterialUpdate(item.material)
                                }
                                className="atlas-button-primary px-3 py-2 text-xs"
                              >
                                Atualizar versão
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                    {materialActionQueue.length > 5 ? (
                      <p className="px-4 py-3 text-center text-[11px] text-slate-500">
                        + {materialActionQueue.length - 5} pendência(s) no
                        projeto. Resolva as mais urgentes primeiro.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="px-4 py-4 text-xs text-emerald-200/80">
                    Nenhuma versão vencida, próxima do vencimento ou aguardando
                    validação.
                  </p>
                )}
              </section>
            ) : null}
            {!materialsLoading && selected && missingEssential.length ? (
              <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-400/[.07] p-4 text-xs leading-5 text-amber-100">
                Kit incompleto: falta{" "}
                {missingEssential
                  .map((type) => materialLabels[type].label)
                  .join(", ")}
                . Atualize abaixo para o corretor encontrar tudo sem sair do
                projeto.
              </div>
            ) : null}
            {materialsLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[1, 2, 3, 4].map((item) => (
                  <AtlasSkeleton key={item} className="h-44 w-full" />
                ))}
              </div>
            ) : !selected ? (
              <AtlasEmpty
                title="Selecione um projeto"
                description="Escolha uma incorporadora e um empreendimento para acessar o kit comercial."
              />
            ) : materials.length === 0 ? (
              <AtlasEmpty
                title="Kit comercial ainda vazio"
                description="Adicione book, tabela, espelho ou plantas para liberar o material ao time."
              />
            ) : visibleMaterials.length === 0 ? (
              <AtlasEmpty
                title="Nenhum material neste filtro"
                description="Escolha outro tipo ou limpe a busca para visualizar o kit completo."
              />
            ) : (
              <div
                className="space-y-3"
                data-ux-phase="28-compact-project-library"
              >
                {groupedVisibleMaterials
                  .filter((group) => group.materials.length > 0)
                  .map((group) => (
                    <section
                      key={group.id}
                      className="overflow-hidden rounded-[22px] border border-white/[0.07] bg-white/[0.02]"
                    >
                      <header className="flex items-end justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                        <div>
                          <h2 className="text-sm font-semibold text-white">
                            {group.title}
                          </h2>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {group.description}
                          </p>
                        </div>
                        <AtlasBadge tone="neutral">
                          {group.materials.length}
                        </AtlasBadge>
                      </header>
                      <div className="divide-y divide-white/[0.05]">
                        {group.materials.map((material) => {
                          const config =
                            materialLabels[material.material_type] ||
                            materialLabels.other;
                          const expired = Boolean(
                            material.valid_until &&
                            referenceTime > 0 &&
                            new Date(material.valid_until).getTime() <
                              referenceTime,
                          );
                          return (
                            <article
                              key={material.id}
                              className="grid gap-3 px-4 py-3 transition hover:bg-white/[0.025] md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                            >
                              <div className="flex min-w-0 items-start gap-3">
                                <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl border border-sky-300/15 bg-sky-300/[0.06] text-lg text-sky-300">
                                  {config.icon}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <strong className="truncate text-sm text-white">
                                      {material.title}
                                    </strong>
                                    <AtlasBadge
                                      tone={expired ? "danger" : "neutral"}
                                    >
                                      {expired
                                        ? "VENCIDO"
                                        : `V${material.version}`}
                                    </AtlasBadge>
                                    <AtlasBadge
                                      tone={
                                        material.review_status === "verified"
                                          ? "success"
                                          : "warning"
                                      }
                                    >
                                      {material.review_status === "verified"
                                        ? "VALIDADO"
                                        : "REVISAR"}
                                    </AtlasBadge>
                                  </div>
                                  <p className="mt-1 truncate text-[11px] text-slate-500">
                                    {config.label} ·{" "}
                                    {formatSize(material.file_size)} ·{" "}
                                    {material.valid_until
                                      ? `válido até ${new Date(`${material.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}`
                                      : "sem vencimento"}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 md:justify-end">
                                {material.url ? (
                                  <a
                                    href={material.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="atlas-button-primary px-3 py-2 text-xs"
                                  >
                                    Abrir
                                  </a>
                                ) : (
                                  <span className="self-center text-xs text-rose-300">
                                    Indisponível
                                  </span>
                                )}
                                {material.url ? (
                                  <button
                                    type="button"
                                    onClick={() => void shareMaterial(material)}
                                    className="atlas-button-secondary px-3 py-2 text-xs"
                                  >
                                    Compartilhar
                                  </button>
                                ) : null}
                                {canManage &&
                                material.review_status !== "verified" ? (
                                  <button
                                    onClick={() =>
                                      void reviewMaterial(material.id)
                                    }
                                    className="atlas-button-secondary px-3 py-2 text-xs"
                                  >
                                    Validar
                                  </button>
                                ) : null}
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  ))}
              </div>
            )}
          </div>
        </AtlasCard>
      </section>

      {canManage && selected ? (
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Atualização simples"
            title="Publicar nova versão"
            description="A versão anterior é arquivada automaticamente e o time passa a usar apenas o arquivo novo."
          />
          <form
            id="material-version-form"
            onSubmit={uploadMaterial}
            className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2 xl:grid-cols-4"
          >
            <label className="space-y-2 text-xs text-slate-400">
              Tipo do material
              <select
                value={form.materialType}
                onChange={(event) =>
                  setForm({ ...form, materialType: event.target.value })
                }
                className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"
              >
                {Object.entries(materialLabels).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-xs text-slate-400">
              Título
              <input
                required
                minLength={2}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Ex.: Tabela junho 2026"
                className="block w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white"
              />
            </label>
            <label className="space-y-2 text-xs text-slate-400">
              Vigência inicial
              <input
                type="date"
                value={form.validFrom}
                onChange={(event) =>
                  setForm({ ...form, validFrom: event.target.value })
                }
                className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"
              />
            </label>
            <label className="space-y-2 text-xs text-slate-400">
              Válido até
              <input
                type="date"
                value={form.validUntil}
                onChange={(event) =>
                  setForm({ ...form, validUntil: event.target.value })
                }
                className="block w-full rounded-xl border border-white/10 bg-[#0a1120] px-4 py-3 text-sm text-white"
              />
            </label>
            <label className="space-y-2 text-xs text-slate-400 lg:col-span-2">
              Descrição
              <input
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                placeholder="Observação rápida para o time"
                className="block w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white"
              />
            </label>
            <label className="space-y-2 text-xs text-slate-400">
              Arquivo
              <input
                required
                type="file"
                accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp4,.mov"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-xl border border-dashed border-sky-400/30 bg-sky-400/[0.06] px-4 py-2.5 text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-400/15 file:px-3 file:py-1.5 file:text-sky-200"
              />
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={!file || uploading}
                className="atlas-button-primary w-full"
              >
                {uploading ? "Publicando..." : "Publicar nova versão"}
              </button>
            </div>
          </form>
        </AtlasCard>
      ) : null}
    </div>
  );
}
