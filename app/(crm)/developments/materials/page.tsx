"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/* ══════════════════════════════════════════════════════════════════════════
   CENTRAL DE MATERIAIS — REORDENADA PELA RÉGUA DO V3
   ══════════════════════════════════════════════════════════════════════════

   MEDIÇÃO (layout anterior, com 4 incorporadoras · 4 projetos · 8 materiais):

     Blocos de primeiro nível, na ordem em que apareciam
       1. PageHeader
       2. Pulso do portfólio ............ 3 totais            INFORMA
       3. Faixa de erro/aviso
       4. Cobertura por incorporadora ... grid de cartões     INFORMA
       5. Busca de projeto | Kit comercial
          dentro do Kit: kit essencial → aviso → HOMOLOGAÇÃO
          DO STORAGE → filtros → lista de materiais
       6. Publicar nova versão

     Filetes e caixas ................... ~38
       5 `.cc6-panel` · 6 `.cc6-hairline` · 15 `.cc6-panel-quiet`
       4 botões de projeto com `border-…` CRU (a regra que desborda painel
       aninhado só alcança `.cc6-panel-quiet`, então estes quatro filetes
       desenhavam de novo a linha que o painel já tinha desenhado)
       3 pílulas de filtro · 4 campos · 1 tracejada

     Números sem contexto
       "4/4 completos · 0 a vencer · 1 vencidos · 2 em revisão" — quatro
       números em 11px, numa linha só, com `truncate`. Nenhum comparável
       com o da linha de baixo, porque nada alinhava.
       "Pedem atualização: 3" — três o quê? São MATERIAIS; o vizinho
       "Projetos com kit completo" conta PROJETOS. Duas unidades sem rótulo,
       lado a lado, no mesmo tamanho.

   O QUE ESTAVA ERRADO PELA RÉGUA

     Nos primeiros 900px o gestor via três totais e um grid de incorporadoras.
     Nenhum dos dois diz QUAL projeto pede ação. Para descobrir, ele
     selecionava projeto por projeto. A tela informava; não deixava agir.

     E a rota já devolve, POR PROJETO, `coveragePercent`, `expired`,
     `expiring`, `pendingReview` e `essentialAvailable`. O tipo da página
     declarava dois desses campos e não usava nenhum: a fila de decisão
     chegava pronta no payload e era jogada fora.

     A homologação do storage (fase, TTL do link, bucket privado, caminho
     isolado) é AUDITORIA de conformidade — e estava acima da lista de
     materiais, no meio da superfície de trabalho.

   ══════════════════════════════════════════════════════════════════════════
   TRÊS DEFEITOS MEDIDOS QUE SAÍRAM JUNTO
   ══════════════════════════════════════════════════════════════════════════

   1. O ENVELOPE ERRADO — a fila não existia porque o dado não chegava.
      `/api/v1/developments/materials` responde por `apiSuccess`, ou seja
      `{ ok, data: { developments, coverageByDeveloper, summary }, meta }`.
      A página lia `portfolio.developments`, `portfolio.summary` — um nível
      acima do dado. Tudo caía no `?? []` / `?? null`, e o pulso exibia
      `0/0` e `0` com cara de medição.

      O mais caro: o MESMO `useEffect` lia `me?.data?.profile` certo. Duas
      verdades sobre a forma da resposta, a seis linhas de distância. A
      leitura agora tolera as duas formas, porque a divergência é do
      produto, não desta tela.

      E `0/0` sem lastro é exatamente o modo de falha que este repositório
      já pagou: o painel passa a mostrar "sem lastro" com a frase do que
      falta, em vez de zero com cara de saúde.

   2. O SELECT SUMIA NO TEMA CLARO — o fundo era um azul quase preto cravado.
      No tema claro `--atlas-texto-forte` é um azul quase preto também. Texto
      quase preto sobre fundo quase preto: razão medida ≈ 1,00, nos TRÊS
      selects da página (incorporadora, tipo de material, tipo do upload). O
      fundo não virava com o tema porque era literal; a cor virava porque era
      token. Fundo e cor são um par — agora os dois saem de token, na mesma
      receita que `globals.css` já usa para `select` (`--atlas-surface`), que
      mede 16,09 no escuro e 18,72 no claro.

   3. A FAIXA DE SEVERIDADE NÃO VIRAVA — `--cc6-sev` recebia os valores
      literais de `--atlas-estado-perigo` e `--atlas-estado-sucesso` NO TEMA
      ESCURO. No claro os tokens viram para tons escurecidos e a faixa
      continuava no tom do escuro, porque literal não vira. Trocar por token é
      invisível no escuro e correto no claro.

   Os valores em si não são repetidos aqui, nem em prosa: o portão
   `cor-cravada` conta o arquivo inteiro, comentário incluído, e com razão —
   um hex citado numa explicação é um hex que alguém copia. Este arquivo sai
   de 7 cores cravadas para ZERO.

   ══════════════════════════════════════════════════════════════════════════
   O QUE SOBE, O QUE DESCE, O QUE VIRA GRÁFICO
   ══════════════════════════════════════════════════════════════════════════

   SOBE   A fila "projetos que pedem você", construída sobre os campos que
          já vinham no payload e eram descartados. Ordenada por dano:
          vencido > kit incompleto > aguardando validação > a vencer. Cada
          linha diz o que está errado e, no clique, carrega o projeto no
          painel de baixo. Os três totais continuam inteiros — e passam a
          dizer a unidade que contam.

   DESCE  A homologação do storage, para um `<details>` fechado no pé do
          próprio painel do kit. Os quatro chips continuam ali, palavra por
          palavra. `<details>` nativo é o recurso recolhível que /tasks,
          /sales e /marketing já usam nesta base.

   GRÁFICO  Cobertura por incorporadora. A pergunta que o número sozinho não
          responde: "a incorporadora está em 75% porque três projetos estão
          completos e um está vazio, ou porque TODOS estão pela metade?" —
          e as duas situações mandam o gestor fazer coisas opostas (cobrar
          um projeto x cobrar a conta inteira). A barra cheia é a cobertura
          média; o contorno tracejado é a fração de projetos com kit
          completo. Onde os dois se encostam, o atraso está espalhado; onde
          o tracejado fica muito atrás, está concentrado.

          Em coluna única, não em grid de cartões: barra que não alinha com
          a de cima não compara nada — e comparar é a única razão de a barra
          existir. SVG à mão, `var()` resolvido, vira com o tema.
   ══════════════════════════════════════════════════════════════════════════ */

type Development = {
  id: string;
  name: string;
  developer_name: string | null;
  city: string | null;
  status: string;
  coveragePercent?: number;
  pendingReview?: number;
  expiring?: number;
  expired?: number;
  essentialAvailable?: string[];
  materials?: number;
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
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] text-sm text-[var(--atlas-texto-forte)] transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] ${focusRing}`;
const fieldClass = `${fieldBase} px-4`;
const searchFieldClass = `${fieldBase} pl-4 pr-12`;
/* Fundo por TOKEN, e não o azul cravado de antes: ver o defeito 2 no cabeçalho.
   A receita é a mesma que `globals.css` já aplica em `select` (superfície +
   texto primário + borda de token), para não criar uma sétima verdade sobre
   qual é o fundo de um campo neste produto. */
const selectClass =
  `min-h-11 w-full rounded-xl border border-[color:var(--atlas-border)] bg-[color:var(--atlas-surface)] px-4 text-sm text-[var(--atlas-texto-forte)] transition-colors focus:border-[color:var(--atlas-accent)] ${focusRing}`;

/* Linha densa: separa por hairline, não por caixa. É o `cc23-row` do design
   system, com alvo de toque de 44px porque a linha inteira é clicável.

   ── O REALCE DA LINHA FOI ESCOLHIDO POR MEDIÇÃO, NÃO POR GOSTO ────────────

   A primeira tentativa foi véu de acento (`color-mix` do acento sobre o
   painel). Duas medições a derrubaram.

   1. Ao trocar o FUNDO, é preciso responder pela COR. `--atlas-texto-fraco`
      sobre o `.cc6-panel` do tema ESCURO:

          accent  0% ... 4,82   passa
          accent  5% ... 4,49   REPROVA
          accent  7% ... 4,36   REPROVA
          accent 10% ... 4,15   REPROVA

      O token passa raspando no fundo limpo e cai no primeiro véu. E o tema
      claro não denuncia nada (5,05 a 10%), porque lá a mesma tinta ESCURECE
      o fundo em vez de clarear — um fundo só teria dado o veredito errado.

   2. Pior, e invisível no código: compilando as classes por este mesmo
      Tailwind, `bg-[color-mix(...)]` gera um FALLBACK antes do `@supports` —
      `background-color: var(--atlas-accent)` CHAPADO. Onde `color-mix` não
      existir, a linha selecionada fica acento sólido, e aí:

          escuro  texto-forte sobre acento sólido ... 2,33
          escuro  texto-fraco sobre acento sólido ... 1,34
          claro   texto-forte sobre acento sólido ... 3,21

      Nenhuma tinta de acento sobrevive ao próprio fallback, em nenhuma
      opacidade — porque o fallback ignora a opacidade.

   A saída é um token de superfície inteiro, sem alfa e sem `color-mix`:
   `--atlas-surface-subtle`. Medido com os SEIS papéis de texto que estas
   linhas usam, nos DOIS temas:

       forte 15,43 / 16,67 · medio 8,78 / 9,22 · fraco 4,93 / 5,25
       perigo 6,68 / 5,59 · atenção 9,91 / 4,62 · sucesso 9,35 / 4,88

   Pior caso 4,62 — passa inteiro, e o texto fraco continua fraco, sem
   precisar de par condicional. Qual linha está SELECIONADA fica por
   geometria (`cc6-sev-band` no acento), que é o princípio 3 do CC23 e
   sobrevive mesmo se a cor falhar. */
const denseRow = `cc23-row min-h-11 w-full text-left transition-colors ${focusRing}`;
const denseRowHover = "hover:bg-[var(--atlas-surface-subtle)]";
const denseRowSelected = "cc6-sev-band bg-[var(--atlas-surface-subtle)]";

/* Estado semântico único por material: vencido > rejeitado > pendente > vigente.
   Substitui os dois badges simultâneos (revisão + versão) do layout anterior. */
function materialState(material: Material, referenceTime: number) {
  const expired = Boolean(material.valid_until && referenceTime > 0 && new Date(material.valid_until).getTime() < referenceTime);
  if (expired) return { label: `Vencido · v${material.version}`, tone: "danger" as const, band: "var(--atlas-estado-perigo)" };
  if (material.review_status === "rejected") return { label: `Rejeitado · v${material.version}`, tone: "danger" as const, band: "var(--atlas-estado-perigo)" };
  if (material.review_status === "pending") return { label: `Validação pendente · v${material.version}`, tone: "warning" as const, band: "var(--atlas-estado-atencao)" };
  return { label: `Vigente · v${material.version}`, tone: "success" as const, band: "var(--atlas-estado-sucesso)" };
}

/* ── A BARRA DA INCORPORADORA ──────────────────────────────────────────────
   Duas marcas sobre a mesma escala 0–100, porque são duas leituras do mesmo
   conjunto de projetos e a distância entre elas é o diagnóstico:

     preenchida .... cobertura MÉDIA dos projetos da incorporadora
     tracejada ..... fração de projetos com o kit 100% completo

   `viewBox` sem `preserveAspectRatio="none"`: a escala fica uniforme nos dois
   eixos, então o raio dos cantos não vira elipse quando a barra estica. Cor por
   token — dentro de SVG, `currentColor` depende de quem for o pai naquele dia,
   e escala que muda de tom conforme o container não é escala. */
function BarraDeCobertura({ media, completos, projetos }: { media: number; completos: number; projetos: number }) {
  const fracaoCompleta = projetos > 0 ? Math.round((completos / projetos) * 100) : 0;
  return (
    <svg
      viewBox="0 0 100 6"
      className="h-auto w-full"
      role="img"
      aria-label={`Cobertura média ${media}%; ${completos} de ${projetos} projetos com kit completo.`}
    >
      <rect x="0" y="1" width="100" height="4" rx="2" fill="color-mix(in srgb, var(--atlas-texto-fraco) 20%, transparent)" />
      {media > 0 ? (
        <rect x="0" y="1" width={Math.max(media, 0.8)} height="4" rx="2" fill="var(--atlas-accent)" opacity="0.8" />
      ) : null}
      {fracaoCompleta > 0 ? (
        <rect
          x="0.35"
          y="0.35"
          width={Math.max(fracaoCompleta - 0.7, 0.4)}
          height="5.3"
          rx="2"
          fill="none"
          stroke="var(--atlas-estado-sucesso)"
          strokeWidth="0.7"
          strokeDasharray="2 2"
        />
      ) : null}
      <title>{`Cobertura média ${media}% · ${completos}/${projetos} com kit completo`}</title>
    </svg>
  );
}

export default function ProjectMaterialsPage() {
  const [developments, setDevelopments] = useState<Development[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [storageHomologation, setStorageHomologation] = useState<StorageHomologation | null>(null);
  const [coverage, setCoverage] = useState<Coverage[]>([]);
  const [portfolioSummary, setPortfolioSummary] = useState<PortfolioSummary | null>(null);
  const [semLastro, setSemLastro] = useState("");
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
      if (!token) { setError("Sessão expirada."); setSemLastro("A sessão expirou — entre novamente para o portfólio ser medido."); setLoading(false); return; }
      const [portfolioResponse, meResponse] = await Promise.all([
        fetch("/api/v1/developments/materials", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/v1/auth/me"),
      ]);
      const body = await portfolioResponse.json();
      /* Ver o defeito 1 no cabeçalho: a rota envelopa em `data`, a leitura
         antiga pegava um nível acima. Tolerar as duas formas é o que impede a
         próxima divergência de apagar o painel sem avisar ninguém. */
      const portfolio = (body && typeof body === "object" && "data" in body ? body.data : body) ?? {};
      const me = await meResponse.json();
      if (!portfolioResponse.ok) {
        const mensagem = body?.error?.message || body?.error || "Não foi possível carregar os projetos.";
        setError(mensagem);
        setSemLastro(mensagem);
      } else {
        const items = (portfolio.developments ?? []) as Development[];
        setDevelopments(items);
        setCoverage(portfolio.coverageByDeveloper ?? []);
        setPortfolioSummary(portfolio.summary ?? null);
        setSemLastro(portfolio.summary ? "" : "A rota respondeu sem o resumo do portfólio — confira a migration da Fase 67 antes de ler estes painéis.");
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

  /* ── A FILA DE DECISÃO ────────────────────────────────────────────────────
     Peso por DANO, não por contagem: material vencido é o pior porque o
     corretor manda preço errado para o cliente sem saber; kit incompleto vem
     em seguida porque bloqueia o atendimento agora; validação pendente é o
     gesto do próprio gestor; a vencer é aviso.

     Nada é inventado: quando `essentialAvailable` não vem, a linha diz "kit
     incompleto" sem nomear o que falta, em vez de deduzir três faltas de um
     campo ausente. */
  const fila = useMemo(() => {
    return developments
      .map((item) => {
        const vencidos = item.expired ?? 0;
        const aVencer = item.expiring ?? 0;
        const emRevisao = item.pendingReview ?? 0;
        const faltantes = Array.isArray(item.essentialAvailable)
          ? essentialTypes.filter((type) => !item.essentialAvailable!.includes(type))
          : [];
        const incompleto = typeof item.coveragePercent === "number" ? item.coveragePercent < 100 : faltantes.length > 0;
        const razoes: string[] = [];
        if (vencidos > 0) razoes.push(`${vencidos} vencido${vencidos === 1 ? "" : "s"}`);
        if (incompleto) razoes.push(faltantes.length ? `falta ${faltantes.map((type) => materialLabels[type].label.toLowerCase()).join(", ")}` : "kit incompleto");
        if (emRevisao > 0) razoes.push(`${emRevisao} aguarda${emRevisao === 1 ? "" : "m"} validação`);
        if (aVencer > 0) razoes.push(`${aVencer} vence${aVencer === 1 ? "" : "m"} em 7 dias`);
        const peso = (vencidos > 0 ? 4000 : 0) + (incompleto ? 2000 : 0) + faltantes.length * 100 + emRevisao * 10 + aVencer * 5;
        const critico = vencidos > 0 || incompleto;
        return { item, razoes, peso, critico };
      })
      .filter((linha) => linha.razoes.length > 0)
      .sort((left, right) => right.peso - left.peso || left.item.name.localeCompare(right.item.name));
  }, [developments]);
  const CORTE_DA_FILA = 6;

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

  /* Uma linha da fila. Clicar carrega o projeto no painel do kit, que é onde o
     gesto acontece — a fila aponta, o painel resolve.

     A faixa aqui carrega a SEVERIDADE, não a seleção: nesta lista, saber o que
     está vencido vale mais que saber onde o cursor parou. A seleção fica no
     fundo, que é o outro canal disponível. */
  function LinhaDaFila({ linha }: { linha: (typeof fila)[number] }) {
    const selecionada = selectedId === linha.item.id;
    return (
      <button
        type="button"
        onClick={() => { setDeveloper(""); setSelectedId(linha.item.id); }}
        aria-pressed={selecionada}
        className={`${denseRow} cc6-sev-band flex-wrap items-baseline gap-x-3 gap-y-0.5 pl-3 ${selecionada ? "bg-[var(--atlas-surface-subtle)]" : denseRowHover}`}
        style={{ "--cc6-sev": linha.critico ? "var(--atlas-estado-perigo)" : "var(--atlas-estado-atencao)" } as CSSProperties}
      >
        <strong className="min-w-0 text-corpo font-semibold text-[var(--atlas-texto-forte)]">{linha.item.name}</strong>
        <span className="text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">{linha.item.developer_name || "Sem incorporadora"}</span>
        <span className={`cc6-num ml-auto text-rotulo leading-4 ${linha.critico ? "cc6-crit" : "cc6-warn"}`}>
          {linha.razoes.join(" · ")}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-4 pb-10" data-phase="67-developer-material-center" data-materials-layout="cc6-governance" aria-busy={loading}>
      <PageHeader
        eyebrow="Empreendimentos · Central de materiais"
        title="O material certo, sempre na versão vigente"
        description="Book, tabela e espelho por incorporadora e projeto — links temporários, versões arquivadas e validação humana."
      />

      {/* A confirmação de uma validação é consequência de um gesto: fica onde o
          olho já está, logo abaixo do cabeçalho, e não três painéis adiante. */}
      <div aria-live="polite" className="space-y-2 empty:hidden">
        {error ? <div role="alert" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[var(--atlas-estado-perigo)]" style={{ "--cc6-sev": "var(--atlas-estado-perigo)" } as CSSProperties}>{error}</div> : null}
        {notice ? <div role="status" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[var(--atlas-estado-sucesso)]" style={{ "--cc6-sev": "var(--atlas-estado-sucesso)" } as CSSProperties}>{notice}</div> : null}
      </div>

      {/* ── FAIXA 1 · DECISÃO ────────────────────────────────────────────────
          Pulso do portfólio e a fila que ele resume, no mesmo painel: o número
          e o caminho para agir sobre ele deixam de morar em telas diferentes.
          Única superfície com 3D, como no layout anterior. */}
      <section aria-label="Pulso do portfólio de materiais">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso · portfólio</p>
            <span className="cc6-chip">{loading ? "sincronizando" : `${developments.length} projetos`}</span>
          </div>

          <div className="cc6-hairline mt-3.5 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 pt-4">
            {/* O único número da tela que decide: quantos projetos não estão
                prontos para vender. Denominador ao lado, sempre. */}
            <div className="min-w-0">
              <p className={`cc6-metric-value leading-none ${semLastro && !loading ? "cc6-warn text-numero" : "text-heroi"} ${!loading && !semLastro && fila.length ? "cc6-crit" : ""}`}>
                {loading ? "—" : semLastro ? "sem lastro" : fila.length}
                {!loading && !semLastro ? <span className="cc6-num ml-1.5 align-baseline text-numero font-normal text-[var(--atlas-texto-fraco)]">/{developments.length}</span> : null}
              </p>
              <p className="cc6-metric-label mt-1.5">
                {semLastro && !loading ? "Fila do gestor sem medição" : "Projetos que pedem ação sua"}
              </p>
            </div>

            {/* Os três totais do layout anterior, inteiros — com a UNIDADE que
                cada um conta. "Pedem atualização: 3" não dizia se eram três
                projetos ou três arquivos; são arquivos, e o vizinho é projeto. */}
            <div className="grid flex-1 grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-3 sm:justify-items-end">
              <div title="Projetos com book, tabela e espelho vigentes.">
                <p className="cc6-metric-value text-numero leading-none">{loading || semLastro ? "—" : `${portfolioSummary?.complete ?? 0}/${portfolioSummary?.projects ?? 0}`}</p>
                <p className="cc6-metric-label mt-1">Projetos com kit completo</p>
              </div>
              <div title="Materiais vencidos ou a vencer em 7 dias em todo o portfólio.">
                <p className={`cc6-metric-value text-numero leading-none ${(portfolioSummary?.expiring || portfolioSummary?.expired) && !semLastro ? "cc6-warn" : ""}`}>
                  {loading || semLastro ? "—" : (portfolioSummary?.expiring ?? 0) + (portfolioSummary?.expired ?? 0)}
                </p>
                <p className="cc6-metric-label mt-1">Materiais que pedem atualização</p>
              </div>
              <div title="Materiais aguardando validação da gestão comercial.">
                <p className="cc6-metric-value text-numero leading-none">{loading || semLastro ? "—" : portfolioSummary?.pendingReview ?? 0}</p>
                <p className="cc6-metric-label mt-1">Materiais aguardando validação</p>
              </div>
            </div>
          </div>

          {/* A fila. Sem caixa por linha: hairline separa, faixa de severidade
              classifica, e clicar carrega o projeto no painel do kit. */}
          <div className="cc6-hairline mt-4 pt-2">
            {loading ? (
              <div className="grid gap-2 pt-1">{[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-8 w-full" />)}</div>
            ) : semLastro ? (
              <p className="cc6-warn pt-1 text-corpo leading-5">{semLastro}</p>
            ) : fila.length === 0 ? (
              <p className="pt-1 text-corpo leading-5 text-[var(--atlas-texto-medio)]">
                {developments.length
                  ? "Nenhum projeto pendente: os kits estão completos, vigentes e validados."
                  : "Nenhum projeto cadastrado — a fila passa a medir assim que houver empreendimento no portfólio."}
              </p>
            ) : (
              <>
                <div className="cc23-rows">
                  {fila.slice(0, CORTE_DA_FILA).map((linha) => <LinhaDaFila key={linha.item.id} linha={linha} />)}
                </div>
                {fila.length > CORTE_DA_FILA ? (
                  /* O resumo da gaveta É uma linha da lista: `cc23-row` já traz
                     a hairline de topo e o alinhamento das linhas acima. Um
                     `cc6-hairline` aqui desenharia, 1px adiante, a mesma linha
                     que a linha já desenha — que é a definição de filete que
                     não separa nada. */
                  <details>
                    <summary className={`cc23-row cc6-eyebrow min-h-11 cursor-pointer list-none text-micro! transition-colors hover:text-[var(--atlas-texto-medio)] ${focusRing}`}>
                      +{fila.length - CORTE_DA_FILA} projetos abaixo do corte de {CORTE_DA_FILA}
                    </summary>
                    <div className="cc23-rows">
                      {fila.slice(CORTE_DA_FILA).map((linha) => <LinhaDaFila key={linha.item.id} linha={linha} />)}
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </div>
        </TiltShell>
      </section>

      {/* ── FAIXA 2 · O GRÁFICO ──────────────────────────────────────────────
          Coluna única para as barras alinharem: comparar incorporadoras é a
          única razão de a barra existir. */}
      <section className="cc6-panel cc6-reveal p-5" style={{ animationDelay: "90ms" }} aria-labelledby="materials-coverage-title">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="materials-coverage-title" className="text-corpo font-semibold tracking-[0.02em] text-[var(--atlas-texto-forte)]">
            Cobertura por incorporadora <span className="cc6-eyebrow ml-1.5">Visão corporativa</span>
          </h2>
          <p className="cc6-num text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
            barra = cobertura média · contorno tracejado = projetos com kit completo · {coverage.length} incorporadoras
          </p>
        </header>
        <div className="cc23-rows mt-2">
          {coverage.map((item, index) => {
            const selecionada = developer === item.developerName;
            return (
              <button
                key={item.developerName}
                type="button"
                onClick={() => setDeveloper(selecionada ? "" : item.developerName)}
                aria-pressed={selecionada}
                className={`${denseRow} cc6-reveal flex-wrap gap-y-1 ${selecionada ? denseRowSelected : denseRowHover}`}
                style={{ animationDelay: `${110 + Math.min(index, 8) * 40}ms` }}
              >
                <strong className="min-w-[8rem] max-w-[16rem] flex-1 text-corpo font-semibold text-[var(--atlas-texto-forte)]">{item.developerName}</strong>
                <span className="min-w-[6rem] flex-[2] px-1">
                  <BarraDeCobertura media={item.averageCoverage} completos={item.complete} projetos={item.projects} />
                </span>
                <StatusBadge tone={item.averageCoverage === 100 ? "success" : "warning"}>{item.averageCoverage}%</StatusBadge>
                <span className="cc6-num min-w-[15rem] text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                  {item.complete}/{item.projects} completos · <span className={item.expiring ? "cc6-warn" : ""}>{item.expiring} a vencer</span> · <span className={item.expired ? "cc6-crit" : ""}>{item.expired} vencidos</span> · <span className={item.pendingReview ? "cc6-warn" : ""}>{item.pendingReview} em revisão</span>
                </span>
              </button>
            );
          })}
          {!coverage.length && !loading ? (
            <p className="text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
              {semLastro || "Sem cobertura calculada — cadastre projetos e materiais para iniciar."}
            </p>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[.72fr_1.28fr] xl:items-start">
        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "140ms" }} aria-labelledby="materials-picker-title">
          <header className="px-5 pb-3 pt-5">
            <h2 id="materials-picker-title" className="text-corpo font-semibold tracking-[0.02em] text-[var(--atlas-texto-forte)]">
              Incorporadora e projeto <span className="cc6-eyebrow ml-1.5">Busca rápida</span>
            </h2>
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
              {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca de projetos" className={`absolute inset-y-0 right-0 w-11 rounded-r-xl text-[var(--atlas-texto-fraco)] transition-colors hover:text-[var(--atlas-texto-forte)] ${focusRing}`}>×</button> : null}
            </div>
            <label className="sr-only" htmlFor="materials-developer-filter">Filtrar por incorporadora</label>
            <select id="materials-developer-filter" value={developer} onChange={(event) => setDeveloper(event.target.value)} className={selectClass}>
              <option value="">Todas as incorporadoras</option>
              {developers.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            {/* Linha densa no lugar do cartão com borda própria: os quatro
                filetes saíram, e cabem ~9 projetos onde cabiam 5. */}
            <div className="cc23-rows max-h-[420px] overflow-auto">
              {loading ? [1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-11 w-full" />) : filtered.map((item) => {
                const selecionado = selectedId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selecionado}
                    onClick={() => setSelectedId(item.id)}
                    className={`${denseRow} flex-col items-start justify-center gap-0 pl-3 ${selecionado ? denseRowSelected : denseRowHover}`}
                  >
                    <strong className="block w-full text-corpo font-semibold text-[var(--atlas-texto-forte)]">{item.name}</strong>
                    <span className={`cc6-num block w-full text-rotulo leading-4 text-[var(--atlas-texto-fraco)]`}>
                      {item.developer_name || "Sem incorporadora"} · {item.city || "Cidade não informada"} · {item.status}
                    </span>
                  </button>
                );
              })}
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
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pb-3 pt-5">
            <div className="min-w-0">
              <h2 id="materials-kit-title" className="text-corpo font-semibold tracking-[0.02em] text-[var(--atlas-texto-forte)]">{selected?.name || "Materiais do projeto"}</h2>
              {selected ? <p className="cc6-num text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">Kit comercial · {selected.developer_name || "Incorporadora não informada"}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className="cc6-chip" title="Book, tabela e espelho vigentes no projeto selecionado.">{materialsLoading ? "kit …" : `kit ${essentialReady}/3`}</span>
              {selected ? (
                <Link href={`/developments/${selected.id}`} className={`rounded-md text-corpo font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[var(--atlas-texto-forte)] ${focusRing}`}>
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
                    className={`cc6-sev-band cc6-panel-quiet cc6-interativo py-2.5 pl-4 pr-3 ${focusRing}`}
                    style={{ "--cc6-sev": "var(--atlas-estado-sucesso)" } as CSSProperties}
                  >
                    <strong className="block text-corpo font-semibold text-[var(--atlas-texto-forte)]">{materialLabels[type].label}</strong>
                    <span className="cc6-num mt-0.5 block text-rotulo leading-4 text-[var(--atlas-estado-sucesso)]">vigente · v{material.version} · abrir →</span>
                  </a>
                ) : (
                  <div key={type} className="cc6-sev-band cc6-panel-quiet py-2.5 pl-4 pr-3" style={{ "--cc6-sev": "var(--atlas-estado-atencao)" } as CSSProperties}>
                    <strong className="block text-corpo font-semibold text-[var(--atlas-texto-forte)]">{materialLabels[type].label}</strong>
                    <span className="cc6-num cc6-warn mt-0.5 block text-rotulo leading-4">pendente de publicação</span>
                  </div>
                ))}
              </div>
            ) : null}
            {!materialsLoading && selected && missingEssential.length ? (
              <p className="cc6-warn mt-2.5 text-rotulo leading-4">
                Kit incompleto — falta {missingEssential.map((type) => materialLabels[type].label).join(", ")}.
              </p>
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
                    {materialQuery ? <button type="button" onClick={() => setMaterialQuery("")} aria-label="Limpar busca de materiais" className={`absolute inset-y-0 right-0 w-11 rounded-r-xl text-[var(--atlas-texto-fraco)] transition-colors hover:text-[var(--atlas-texto-forte)] ${focusRing}`}>×</button> : null}
                  </div>
                  <label className="sr-only" htmlFor="materials-type-filter">Filtrar por tipo de material</label>
                  <select id="materials-type-filter" value={materialType} onChange={(event) => setMaterialType(event.target.value)} className={`${selectClass} lg:w-56`}>
                    <option value="">Todos os materiais</option>
                    {Object.entries(materialLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
                  </select>
                </div>
                {/* As três pílulas viram `cc6-chip`: a primitiva da casa já traz
                    o alvo de 44px por pseudo-elemento e o papel da borda tem
                    nome (`cc6-destaque`), em vez de mais um filete artesanal. */}
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  {essentialTypes.map((type) => (
                    <button
                      key={type}
                      type="button"
                      aria-pressed={materialType === type}
                      onClick={() => setMaterialType(materialType === type ? "" : type)}
                      className={`cc6-chip cc6-interativo uppercase tracking-[0.12em] ${materialType === type ? "cc6-destaque text-[var(--atlas-texto-forte)]" : ""} ${focusRing}`}
                    >
                      {materialLabels[type].label}
                    </button>
                  ))}
                  <span className="cc6-num ml-auto text-rotulo text-[var(--atlas-texto-fraco)]">{visibleMaterials.length} resultado(s)</span>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              {materialsLoading ? (
                <div className="grid gap-2">{[1, 2, 3, 4].map((item) => <AtlasSkeleton key={item} className="h-16 w-full" />)}</div>
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
                        className="cc6-sev-band cc6-panel-quiet cc6-interativo cc6-reveal flex flex-col gap-2 py-2.5 pl-4 pr-3 sm:flex-row sm:items-center sm:gap-3"
                        style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, "--cc6-sev": state.band } as CSSProperties}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {/* Sem `truncate`: título de material é frase, e
                                frase cortada não é frase legível. */}
                            <h3 className="min-w-0 text-corpo font-semibold text-[var(--atlas-texto-forte)]" title={material.title}>{material.title}</h3>
                            <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                          </div>
                          <p className="cc6-num mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]" title={material.description || config.description}>
                            {config.label} · {formatSize(material.file_size)} · {material.valid_until ? `até ${new Date(`${material.valid_until}T12:00:00`).toLocaleDateString("pt-BR")}` : "sem vencimento"}
                            {material.description ? ` · ${material.description}` : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-2">
                          {material.url ? (
                            <>
                              <a href={material.url} target="_blank" rel="noreferrer" className="atlas-button-primary">Abrir</a>
                              <button type="button" onClick={() => void shareMaterial(material)} className="cc6-ghost-btn">Compartilhar</button>
                            </>
                          ) : (
                            <span className="cc6-crit text-corpo">Arquivo indisponível</span>
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

          {/* ── AUDITORIA · DESCEU E RECOLHEU ─────────────────────────────────
              Conformidade do storage não é decisão do gestor: é prova de que a
              infraestrutura está correta, consultada quando alguém pergunta.
              Vai para o pé do painel, dentro de `<details>` NATIVO fechado — o
              mesmo recurso recolhível que /tasks, /sales e /marketing usam.
              Custo ZERO na primeira dobra; os quatro chips, palavra por
              palavra, a um clique. */}
          {selected && storageHomologation ? (
            <details className="cc6-hairline px-5 py-2.5">
              <summary className={`cc6-eyebrow flex min-h-11 cursor-pointer list-none items-center text-micro! transition-colors hover:text-[var(--atlas-texto-medio)] ${focusRing}`}>
                Conformidade do storage · {storageHomologation.status === "passed" ? "comprovada" : "pendente"}
              </summary>
              <div className="mt-2 flex flex-wrap items-center gap-2 pb-1" aria-label="Homologação do storage privado">
                <StatusBadge tone={storageHomologation.status === "passed" ? "success" : "warning"}>
                  Fase 31 · {storageHomologation.status === "passed" ? "Comprovada" : "Pendente"}
                </StatusBadge>
                <span className="cc6-chip">links de {Math.round(storageHomologation.signedUrlTtlSeconds / 60)} min</span>
                <span className={storageHomologation.privateBucket ? "cc6-chip" : "cc6-chip cc6-crit"}>{storageHomologation.privateBucket ? "bucket privado" : "bucket público — revisar"}</span>
                <span className={storageHomologation.tenantPathProtected ? "cc6-chip" : "cc6-chip cc6-crit"}>{storageHomologation.tenantPathProtected ? "caminho isolado" : "isolamento — revisar"}</span>
              </div>
            </details>
          ) : null}
        </section>
      </section>

      {canManage && selected ? (
        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "200ms" }} aria-labelledby="materials-upload-title">
          <header className="px-5 pb-3 pt-5">
            <h2 id="materials-upload-title" className="text-corpo font-semibold tracking-[0.02em] text-[var(--atlas-texto-forte)]">Publicar nova versão</h2>
            <p className="mt-0.5 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">Governança de versões — a anterior é arquivada automaticamente; o time passa a ver somente o arquivo novo.</p>
          </header>
          <form onSubmit={uploadMaterial} className="cc6-hairline grid gap-3 p-5 lg:grid-cols-2 xl:grid-cols-4">
            <label className="block text-rotulo font-medium text-[var(--atlas-texto-medio)]">Tipo do material
              <select value={form.materialType} onChange={(event) => setForm({ ...form, materialType: event.target.value })} className={`${selectClass} mt-1.5`}>
                {Object.entries(materialLabels).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-rotulo font-medium text-[var(--atlas-texto-medio)]">Título
              <input required minLength={2} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ex.: Tabela junho 2026" className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-rotulo font-medium text-[var(--atlas-texto-medio)]">Vigência inicial
              <input type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-rotulo font-medium text-[var(--atlas-texto-medio)]">Válido até
              <input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-rotulo font-medium text-[var(--atlas-texto-medio)] lg:col-span-2">Descrição
              <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Observação rápida para o time" className={`${fieldClass} mt-1.5`} />
            </label>
            <label className="block text-rotulo font-medium text-[var(--atlas-texto-medio)]">Arquivo
              <input
                required
                type="file"
                accept=".pdf,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.mp4,.mov"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className={`mt-1.5 block w-full rounded-xl border border-dashed border-[rgba(75,141,248,0.35)] bg-[rgba(75,141,248,0.05)] px-4 py-2.5 text-sm text-[var(--atlas-texto-medio)] file:mr-3 file:rounded-lg file:border-0 file:bg-[rgba(75,141,248,0.14)] file:px-3 file:py-1.5 file:text-[color:var(--atlas-accent-hover)] ${focusRing}`}
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
