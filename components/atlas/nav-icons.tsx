/**
 * ÍCONES DA NAVEGAÇÃO — um traço só, uma família só.
 *
 * ── POR QUE SAIR DOS GLIFOS ──────────────────────────────────────────────────
 *
 * A barra usava caracteres unicode como ícone (⌘ ◎ ⌁ ✓ □ ▥ ◇ ⇄ ◌ ↗ ⚡ ◈ ♙ ↙ ∞ ⚙).
 * Eles vêm da fonte do sistema, então cada máquina desenha um peso, um tamanho
 * óptico e um alinhamento de base diferentes — e alguns nem existem em todas as
 * fontes, caindo no retângulo vazio. O resultado é uma coluna que parece
 * desalinhada sem ninguém conseguir dizer por quê: é a mesma linha com 17
 * tipografias diferentes.
 *
 * Aqui todos são SVG de 20×20, traço de 1,5, `currentColor` e as mesmas
 * terminações. Herdam a cor do estado do item (repouso, ativo, foco) sem
 * nenhuma regra extra, e são idênticos em qualquer sistema.
 *
 * ── A GARANTIA QUE NÃO DEPENDE DE NINGUÉM RODAR TESTE ────────────────────────
 *
 * O Record é chaveado por `AtlasNavigationId`, que é a união dos ids do catálogo
 * (`as const` em lib/atlas/navigation.ts). Se alguém acrescentar um destino sem
 * ícone, `npm run typecheck` QUEBRA. Não é convenção, é o compilador.
 */

import { atlasNavigation } from "@/lib/atlas/navigation";

/**
 * A união dos ids do catálogo, derivada do próprio catálogo (`as const`).
 * Deriva em vez de declarar: uma lista escrita à mão aqui poderia divergir da
 * de lá, e divergência entre duas listas da mesma verdade é a classe de defeito
 * mais cara deste repositório.
 */
export type AtlasNavigationId = (typeof atlasNavigation)[number]["id"];

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
};

/** Hoje / sala de comando — o alvo e o centro. */
const Comando = () => (
  <svg {...base}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="1.75" /><path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2" /></svg>
);
/** Leads — pessoas entrando. */
const Leads = () => (
  <svg {...base}><path d="M12.5 16.5v-1.2a3.2 3.2 0 0 0-3.2-3.2H5.7a3.2 3.2 0 0 0-3.2 3.2v1.2" /><circle cx="7.5" cy="6.3" r="2.8" /><path d="M14.5 5.5h4M16.5 3.5v4" /></svg>
);
/** Funil / pipeline — o afunilamento. */
const Funil = () => (
  <svg {...base}><path d="M2.8 3.5h14.4l-5.4 6.4v5.3l-3.6 1.8v-7.1z" /></svg>
);
/** Tarefas — a marca de feito. */
const Tarefas = () => (
  <svg {...base}><path d="M4 5.8h12M4 10h12M4 14.2h7" /><path d="M15.2 13.2l1.4 1.4 2.4-2.6" /></svg>
);
/** Agenda — o calendário. */
const Agenda = () => (
  <svg {...base}><rect x="3" y="4.2" width="14" height="12.3" rx="2.2" /><path d="M3 8.2h14M7 2.8v2.6M13 2.8v2.6" /></svg>
);
/** Projetos / empreendimentos — as torres. */
const Projetos = () => (
  <svg {...base}><path d="M3.2 17h13.6M5 17V5.4l5-2.4v14M15 17V8.6l-5-2" /><path d="M7 7.6h1.2M7 10.4h1.2M12.2 10.6h1.2M12.2 13.2h1.2" /></svg>
);
/** Corretores — o time. */
const Corretores = () => (
  <svg {...base}><circle cx="7.2" cy="6.6" r="2.6" /><path d="M2.6 16.4v-1a3 3 0 0 1 3-3h3.2a3 3 0 0 1 3 3v1" /><path d="M13.4 5.1a2.6 2.6 0 0 1 0 5M14.6 12.5h.4a3 3 0 0 1 3 3v.9" /></svg>
);
/** Distribuição — o encaminhamento. */
const Distribuicao = () => (
  <svg {...base}><path d="M2.6 7h8.2l-2-2M17.4 13H9.2l2 2" /><circle cx="15.2" cy="7" r="2.1" /><circle cx="4.8" cy="13" r="2.1" /></svg>
);
/** Vendas — o valor fechado. */
const Vendas = () => (
  <svg {...base}><path d="M10 2.6v14.8M13.2 5.6H8.4a2.35 2.35 0 0 0 0 4.7h3.2a2.35 2.35 0 0 1 0 4.7H6.4" /></svg>
);
/** Relatórios — a série. */
const Relatorios = () => (
  <svg {...base}><path d="M3 16.6h14" /><path d="M5.4 13.4V9.2M9 13.4V4.8M12.6 13.4v-5.6M16.2 13.4v-2.9" /></svg>
);
/** Decisões — a bifurcação resolvida. */
const Decisoes = () => (
  <svg {...base}><path d="M10 2.8 3.6 9.4h4.1l-1.3 7.4 6.9-7.6H9.2z" /></svg>
);
/** Marketing — a irradiação. */
const Marketing = () => (
  <svg {...base}><path d="M3.4 8.2v3.6a1.4 1.4 0 0 0 1.4 1.4h1.6l6.6 3.4V4.8L6.4 8.2H4.8a1.4 1.4 0 0 0-1.4 1.4z" /><path d="M16 7.4a4.2 4.2 0 0 1 0 5.2" /></svg>
);
/** Usuários e acessos — a chave. */
const Usuarios = () => (
  <svg {...base}><circle cx="6.4" cy="7.2" r="3" /><path d="M2.4 16.6v-1.2a3.2 3.2 0 0 1 3.2-3.2h1.6" /><path d="M11.6 12.8h6M15.4 12.8v2.4M17.6 12.8v1.6" /><circle cx="10.4" cy="12.8" r="1.5" /></svg>
);
/** Vendas externas — a saída. */
const VendasExternas = () => (
  <svg {...base}><path d="M11.4 3.4h5.2v5.2M16.6 3.4 9.8 10.2" /><path d="M14.4 12v3.4a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 15.4V7.6a1.8 1.8 0 0 1 1.8-1.8H8" /></svg>
);
/** Integrações — o elo. */
const Integracoes = () => (
  <svg {...base}><path d="M8.4 11.6a3 3 0 0 1 0-4.2l2.1-2.1a3 3 0 0 1 4.2 4.2l-1 1" /><path d="M11.6 8.4a3 3 0 0 1 0 4.2l-2.1 2.1a3 3 0 0 1-4.2-4.2l1-1" /></svg>
);
/** Configurações — o ajuste. */
const Configuracoes = () => (
  <svg {...base}><circle cx="10" cy="10" r="2.6" /><path d="M15.9 12.3a1.4 1.4 0 0 0 .28 1.54l.05.05a1.7 1.7 0 1 1-2.4 2.4l-.05-.05a1.4 1.4 0 0 0-1.54-.28 1.4 1.4 0 0 0-.85 1.28v.14a1.7 1.7 0 1 1-3.4 0v-.07a1.4 1.4 0 0 0-.92-1.28 1.4 1.4 0 0 0-1.54.28l-.05.05a1.7 1.7 0 1 1-2.4-2.4l.05-.05a1.4 1.4 0 0 0 .28-1.54 1.4 1.4 0 0 0-1.28-.85h-.14a1.7 1.7 0 1 1 0-3.4h.07a1.4 1.4 0 0 0 1.28-.92 1.4 1.4 0 0 0-.28-1.54l-.05-.05a1.7 1.7 0 1 1 2.4-2.4l.05.05a1.4 1.4 0 0 0 1.54.28h.07a1.4 1.4 0 0 0 .85-1.28v-.14a1.7 1.7 0 1 1 3.4 0v.07a1.4 1.4 0 0 0 .85 1.28 1.4 1.4 0 0 0 1.54-.28l.05-.05a1.7 1.7 0 1 1 2.4 2.4l-.05.05a1.4 1.4 0 0 0-.28 1.54v.07a1.4 1.4 0 0 0 1.28.85h.14a1.7 1.7 0 1 1 0 3.4h-.07a1.4 1.4 0 0 0-1.28.85z" /></svg>
);
export const NAV_ICONS: Record<AtlasNavigationId, () => React.ReactElement> = {
  "command-center": Comando,
  leads: Leads,
  pipeline: Funil,
  tasks: Tarefas,
  calendar: Agenda,
  developments: Projetos,
  brokers: Corretores,
  distribution: Distribuicao,
  sales: Vendas,
  reports: Relatorios,
  "decision-center": Decisoes,
  marketing: Marketing,
  users: Usuarios,
  "external-sales": VendasExternas,
  integrations: Integracoes,
  settings: Configuracoes,
};

/**
 * O ícone de um destino. `null` nunca acontece em código correto — o Record é
 * exaustivo por tipo — mas devolver um fallback silencioso seria pior: um item
 * sem ícone desalinha a coluna inteira, e é melhor descobrir isso no build.
 */
export function NavIcon({ id }: { id: AtlasNavigationId }) {
  const Icone = NAV_ICONS[id];
  return <Icone />;
}
