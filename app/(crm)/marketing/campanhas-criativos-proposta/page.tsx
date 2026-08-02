"use client";

/**
 * COMPOR PROPOSTA DE ANÚNCIO — a tela que faltava entre compor e propor.
 *
 * ── O que foi medido antes de escrever esta tela (02/08/2026) ──────────────
 *
 * `/marketing/nova-campanha` compõe e termina em "rascunho salvo": não existe
 * uma única chamada a `/api/v1/marketing/proposals` naquele arquivo, e
 * `creative_assets` tinha 0 linhas no banco de produção. O painel da Sala de
 * Comando propõe com um clique, mas só sabe propor os dois produtos cravados em
 * `ready-campaigns` ("Arvo" e "Spin Mood") — e o banco tem 4 empreendimentos.
 * Inside Perdizes e Tiê Aclimação não tinham caminho nenhum até /approvals.
 *
 * Aqui a composição inteira (empreendimento, objetivo, público, verba, texto,
 * mídia) vira UMA proposta pendente, com prévia do que sobe e prontidão medida
 * item a item.
 *
 * ── O que esta tela nunca faz ──────────────────────────────────────────────
 *
 * Não publica, não ativa e não gasta. O botão final registra a proposta em
 * `approval_requests` com status "pending". Aprovar acontece em /approvals;
 * ativar é outro passo, depois. A cadeia aparece desenhada no topo porque um
 * botão que "envia" sem dizer para onde é um botão que esconde o gasto.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
/* Os limites vêm do núcleo, não de prosa: rótulo que repete o número à mão
   vira mentira no dia em que a régua da Meta mudar. O módulo é puro (só
   `import type`), então entra no bundle do cliente sem arrastar servidor. */
import {
  LIMITE_TITULO,
  LIMITE_TEXTO,
  LIMITE_DESCRICAO,
} from "@/lib/marketing/campanhas-criativos-composicao";

// ── Tipos espelhando a resposta das rotas ─────────────────────────────────

type Conta = { id: string; nome: string; ativa: boolean; moeda: string | null };
type Empreendimento = {
  id: string; nome: string; incorporadora: string | null; bairro: string | null;
  cidade: string | null; precoMin: number | null; entrega: string | null;
  tipologias: string[]; materiais: string[];
};
type Objetivo = { valor: string; rotulo: string; ajuda: string; temConstrutorDePlano: boolean };
type Contexto = {
  empreendimentos: Empreendimento[];
  objetivos: Objetivo[];
  contas: Conta[];
  contasMedidas: boolean;
  contaPadrao: string | null;
  contaPadraoAlcancavel: boolean | null;
  paginaPadrao: string | null;
  formularioPadrao: string | null;
};

type EstadoDoItem = "ok" | "falta" | "nao_medido";
type ItemDeProntidao = {
  chave: string; rotulo: string; estado: EstadoDoItem; detalhe: string;
  bloqueia: boolean; ondeResolver?: { rotulo: string; href: string } | null;
};
type Resumo = {
  total: number; ok: number; faltando: number; naoMedidos: number;
  bloqueadores: number; podePublicar: boolean; motivos: string[];
};
type Previa = {
  paginaId: string | null; titulo: string | null; textoPrincipal: string | null;
  descricao: string | null; cta: string; temMidia: boolean; midiaResumo: string;
  origemDoTexto: "humano" | "ia" | "ia_editado";
};
type Plano = {
  passos: number; campanhas: number; conjuntos: number; criativos: number;
  anuncios: number; todosPausados: boolean; statusEncontrados: string[];
};
type LastroDaIA = {
  provedor: string; modelo: string; tokensTotais: number; custoEstimadoUsd: number | null;
  camposUsados: string[]; camposAusentes: string[]; objetivo: string; geradoEm: string;
};
type PropostaPronta = { kind: "create"; title: string; payload: Record<string, unknown> };
type RespostaPrevia = {
  previa: Previa; itens: ItemDeProntidao[]; resumo: Resumo; plano: Plano;
  planoIndisponivel: string | null;
  violacoesDePublico: Array<{ field: string; rule: string; detail: string }>;
  titulo: string; propostaPronta: PropostaPronta | null;
  origemDoTexto: "humano" | "ia" | "ia_editado"; lastroDaIA: LastroDaIA | null;
};

/** Prontidão de PRODUTO e CRM — outra rota, outra fonte. Nunca recalculada aqui. */
type ItemProduto = { chave: string; rotulo: string; ok: boolean; detalhe: string };
type ProntidaoProduto = { grupos: { produto: ItemProduto[]; crm: ItemProduto[] } };

const CTAS = [
  { valor: "SIGN_UP", rotulo: "Cadastre-se" },
  { valor: "LEARN_MORE", rotulo: "Saiba mais" },
  { valor: "CONTACT_US", rotulo: "Fale conosco" },
];

async function cabecalho(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const t = data.session?.access_token;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

const brl = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/* Cor por estado, sempre em token: hex cravado não é sobrescrito pelo tema
   claro e o texto some sobre fundo branco — a classe de defeito medida neste
   repositório em 31/07/2026. */
const TINTA: Record<EstadoDoItem, string> = {
  ok: "text-[var(--atlas-estado-sucesso)]",
  falta: "text-[var(--atlas-estado-atencao)]",
  nao_medido: "text-[var(--atlas-texto-fraco)]",
};
const MARCA: Record<EstadoDoItem, string> = { ok: "✓", falta: "○", nao_medido: "?" };
const NOME_DO_ESTADO: Record<EstadoDoItem, string> = {
  ok: "pronto", falta: "falta", nao_medido: "não medido",
};

/** Linha de prontidão. `nao_medido` nunca é desenhado como falta nem como ok. */
function LinhaDeProntidao({ item }: { item: ItemDeProntidao }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
      <span className={`cc6-num shrink-0 ${TINTA[item.estado]}`} aria-hidden>{MARCA[item.estado]}</span>
      <span className="text-corpo text-[var(--atlas-texto-forte)]">{item.rotulo}</span>
      {item.bloqueia && item.estado !== "ok" ? (
        <span className="cc6-chip cc6-alerta">impede publicar</span>
      ) : null}
      <span className="sr-only">{NOME_DO_ESTADO[item.estado]}.</span>
      <span className="w-full text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
        {item.detalhe}
        {item.ondeResolver ? (
          <>
            {" · "}
            <Link href={item.ondeResolver.href} className="underline underline-offset-2 text-[var(--atlas-accent)]">
              {item.ondeResolver.rotulo}
            </Link>
          </>
        ) : null}
      </span>
    </li>
  );
}

export default function ComporPropostaDeAnuncio() {
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);

  // Composição
  const [developmentId, setDevelopmentId] = useState("");
  const [objetivo, setObjetivo] = useState("gerar_leads");
  const [contaId, setContaId] = useState("");
  const [paginaId, setPaginaId] = useState("");
  const [formularioId, setFormularioId] = useState("");
  const [cidade, setCidade] = useState("");
  const [verba, setVerba] = useState(80);
  const [dias, setDias] = useState(14);
  const [titulo, setTitulo] = useState("");
  const [textoPrincipal, setTextoPrincipal] = useState("");
  const [descricao, setDescricao] = useState("");
  const [cta, setCta] = useState("SIGN_UP");
  const [imageHashes, setImageHashes] = useState("");
  const [videoIds, setVideoIds] = useState("");

  // Origem do texto — o que a Caixa de Aprovações vai ler junto da proposta.
  const [origemDoTexto, setOrigemDoTexto] = useState<"humano" | "ia" | "ia_editado">("humano");
  const [lastroDaIA, setLastroDaIA] = useState<LastroDaIA | null>(null);
  const [gerandoIA, setGerandoIA] = useState(false);

  const [previa, setPrevia] = useState<RespostaPrevia | null>(null);
  const [medindo, setMedindo] = useState(false);
  const [prontidaoProduto, setProntidaoProduto] = useState<ProntidaoProduto | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [propostaId, setPropostaId] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState("");

  const empreendimento = useMemo(
    () => contexto?.empreendimentos.find((e) => e.id === developmentId) ?? null,
    [contexto, developmentId],
  );

  // ── Contexto inicial ─────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch("/api/v1/marketing/campanhas-criativos-proposta", {
          headers: await cabecalho(), cache: "no-store",
        });
        const p = await r.json();
        if (!r.ok) throw new Error(p?.error?.message ?? "Contexto indisponível.");
        if (!vivo) return;
        const c = p.data as Contexto;
        setContexto(c);
        setContaId(c.contaPadrao ?? c.contas[0]?.id ?? "");
        setPaginaId(c.paginaPadrao ?? "");
        setFormularioId(c.formularioPadrao ?? "");
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : "Falha ao carregar.");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Cidade acompanha o empreendimento até alguém digitar outra.
  const cidadeTocada = useRef(false);
  useEffect(() => {
    if (!cidadeTocada.current) setCidade(empreendimento?.cidade ?? "");
  }, [empreendimento]);

  // ── Prontidão de PRODUTO e CRM: fonte separada, nunca recalculada aqui ──
  useEffect(() => {
    if (!developmentId) { setProntidaoProduto(null); return; }
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(`/api/v1/marketing/campaign-readiness?developmentId=${developmentId}`, {
          headers: await cabecalho(), cache: "no-store",
        });
        const p = await r.json();
        if (vivo && r.ok) setProntidaoProduto(p.data as ProntidaoProduto);
      } catch { /* informativa: falha aqui não trava a composição */ }
    })();
    return () => { vivo = false; };
  }, [developmentId]);

  // ── Prévia medida no servidor, a cada mudança da composição ─────────────
  const medir = useCallback(async () => {
    setMedindo(true);
    try {
      const r = await fetch("/api/v1/marketing/campanhas-criativos-proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await cabecalho()) },
        body: JSON.stringify({
          objetivo, developmentId, contaId,
          paginaId: paginaId || null, formularioId: formularioId || null,
          cidade, verbaDiariaBrl: verba, duracaoDias: dias,
          titulos: titulo ? [titulo] : [],
          textos: textoPrincipal ? [textoPrincipal] : [],
          descricoes: descricao ? [descricao] : [],
          cta,
          imageHashes: imageHashes.split(/[\s,]+/).filter(Boolean),
          videoIds: videoIds.split(/[\s,]+/).filter(Boolean),
          origemDoTexto, lastroDaIA,
        }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error?.message ?? "Não foi possível medir a prontidão.");
      setPrevia(p.data as RespostaPrevia);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao medir.");
    } finally {
      setMedindo(false);
    }
  }, [objetivo, developmentId, contaId, paginaId, formularioId, cidade, verba, dias,
      titulo, textoPrincipal, descricao, cta, imageHashes, videoIds, origemDoTexto, lastroDaIA]);

  // Debounce: a medição resolve geo na Meta (GET) e lista contas — disparar a
  // cada tecla castigaria o rate limit da Graph sem nenhum ganho de leitura.
  useEffect(() => {
    if (!contexto) return;
    const t = setTimeout(() => { void medir(); }, 450);
    return () => clearTimeout(t);
  }, [contexto, medir]);

  // ── IA propõe o texto ────────────────────────────────────────────────────
  async function proporComIA() {
    if (!empreendimento) return;
    setGerandoIA(true); setErro("");
    try {
      const r = await fetch("/api/v1/marketing/creative-studio", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await cabecalho()) },
        body: JSON.stringify({ developmentId, objetivo }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error?.message ?? "A geração falhou.");
      const d = p.data as {
        copies: { titulos: string[]; textosPrincipais: string[]; descricoes: string[]; ctas: string[] };
        consumo: { provedor: string; modelo: string; tokensTotais: number; custoEstimadoUsd: number | null };
        pendenciasDoProduto: string[];
      };
      setTitulo(d.copies.titulos[0] ?? "");
      setTextoPrincipal(d.copies.textosPrincipais[0] ?? "");
      setDescricao(d.copies.descricoes[0] ?? "");
      setOrigemDoTexto("ia");
      // O lastro é o que a IA TINHA à mão. `pendenciasDoProduto` é a lista do
      // que faltava — e é por isso que a peça não cita preço nem prazo.
      setLastroDaIA({
        provedor: d.consumo.provedor, modelo: d.consumo.modelo,
        tokensTotais: d.consumo.tokensTotais, custoEstimadoUsd: d.consumo.custoEstimadoUsd,
        camposUsados: [
          empreendimento.nome,
          ...(empreendimento.bairro ? [`bairro ${empreendimento.bairro}`] : []),
          ...(empreendimento.cidade ? [`cidade ${empreendimento.cidade}`] : []),
          ...(empreendimento.precoMin ? [`preço a partir de ${brl(empreendimento.precoMin)}`] : []),
          ...(empreendimento.tipologias.length ? [`${empreendimento.tipologias.length} tipologia(s)`] : []),
        ],
        camposAusentes: d.pendenciasDoProduto,
        objetivo, geradoEm: new Date().toISOString(),
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha na geração.");
    } finally {
      setGerandoIA(false);
    }
  }

  /* Editar texto de IA muda a origem — e a Caixa precisa saber disso. Uma peça
     "de IA" que um humano reescreveu inteira não é mais proposta de IA, e
     manter o selo original faria a auditoria de origem mentir. */
  const marcarEdicao = useCallback(() => {
    setOrigemDoTexto((o) => (o === "ia" ? "ia_editado" : o));
  }, []);

  // ── Enviar para aprovação ────────────────────────────────────────────────
  async function enviarParaAprovacao() {
    if (!previa?.propostaPronta) return;
    setEnviando(true); setErroEnvio("");
    try {
      const r = await fetch("/api/v1/marketing/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await cabecalho()) },
        body: JSON.stringify(previa.propostaPronta),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p?.error?.message ?? "A proposta não foi registrada.");
      setPropostaId(String((p.data as { id: string }).id));
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : "Falha ao propor.");
    } finally {
      setEnviando(false);
    }
  }

  const resumo = previa?.resumo ?? null;
  const objetivoAtual = contexto?.objetivos.find((o) => o.valor === objetivo) ?? null;

  /* MEDIDO no CSS que o servidor entrega (não no fonte) em 02/08/2026:
     `.atlas-app-shell input, select, textarea` de globals.css é UNLAYERED e
     vence `@layer utilities` do Tailwind. Ela já pinta `background` e
     `border-color` do campo, nos dois temas — um `bg-transparent` ou um
     `border-[var(--atlas-border)]` escritos aqui existiriam no HTML e não
     pintariam nada. Ficam de fora: classe inerte é mentira no fonte.

     O que continua sendo nosso, e por quê:
       `border`  — só a LARGURA. O preflight do Tailwind zera border-width, e
                   sem ela a cor que globals define não teria o que pintar.
       `focus:border-…` — (0,2,0) contra os (0,1,1) da regra unlayered, então
                   vence no foco, que é o único estado que ela não cobre.
       `text-corpo` — 13px, o degrau do texto que se lê. Abaixo de 768px
                   globals impõe 16px nos campos para o iOS não dar zoom no
                   foco; é decisão de acessibilidade e não se briga com ela. */
  const campoTexto =
    "mt-2 w-full rounded-xl border px-3 py-2.5 text-corpo text-[var(--atlas-texto-forte)] outline-none focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)] placeholder:text-[var(--atlas-texto-fraco)]";
  const rotulo = "block cc6-eyebrow";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      {/* ═══ FAIXA DE COMANDO — a cadeia governada, desenhada ═══════════════ */}
      <section className="cc6-panel p-5" aria-label="Compor proposta de anúncio">
        <p className="cc6-eyebrow">MARKETING · CAMPANHAS E CRIATIVOS</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-[var(--atlas-texto-forte)] sm:text-2xl">
          Compor proposta de anúncio
        </h1>
        <p className="mt-2 max-w-3xl text-corpo leading-5 text-[var(--atlas-texto-medio)]">
          Monte a proposta inteira e veja, item a item, o que ainda falta para publicar.
          Nada nesta tela publica, ativa ou move verba.
        </p>
        <ol className="cc6-hairline mt-4 flex flex-wrap items-center gap-2 pt-4" aria-label="Cadeia de governança">
          <li className="cc6-chip cc6-destaque text-[var(--atlas-texto-forte)]!">1 · PROPOR — você está aqui</li>
          <li aria-hidden className="text-[var(--atlas-texto-fraco)]">→</li>
          <li>
            <Link href="/approvals" className="cc6-chip cc6-interativo-acento">2 · APROVAR em /approvals</Link>
          </li>
          <li aria-hidden className="text-[var(--atlas-texto-fraco)]">→</li>
          <li className="cc6-chip">3 · ATIVAR — passo humano posterior</li>
        </ol>
      </section>

      {erro ? (
        <div className="mt-4">
          <AtlasRecoverableError title="Não foi possível continuar" description={erro} onRetry={() => setErro("")} />
        </div>
      ) : null}

      {carregando ? (
        <AtlasSkeleton className="mt-4 h-64 w-full" />
      ) : !contexto ? null : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ═══ COLUNA DA DECISÃO ═════════════════════════════════════════ */}
          <div className="space-y-4">
            {/* ── Produto e objetivo ── */}
            <section className="cc6-panel p-5">
              <p className="cc6-eyebrow">O QUE E PARA QUÊ</p>

              <label className={`${rotulo} mt-4`} htmlFor="cc-empreendimento">EMPREENDIMENTO</label>
              <select
                id="cc-empreendimento" className={campoTexto} value={developmentId}
                onChange={(e) => setDevelopmentId(e.target.value)}
              >
                <option value="">Selecione…</option>
                {contexto.empreendimentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}{e.bairro ? ` · ${e.bairro}` : ""}
                  </option>
                ))}
              </select>
              {empreendimento ? (
                <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                  {[
                    empreendimento.incorporadora,
                    `${empreendimento.tipologias.length} tipologia(s)`,
                    empreendimento.precoMin ? `a partir de ${brl(empreendimento.precoMin)}` : "preço não confirmado",
                    empreendimento.materiais.length
                      ? `material: ${empreendimento.materiais.join(", ")}`
                      : "sem material cadastrado",
                  ].filter(Boolean).join(" · ")}
                </p>
              ) : null}

              <label className={`${rotulo} mt-5`} htmlFor="cc-objetivo">OBJETIVO</label>
              <select
                id="cc-objetivo" className={campoTexto} value={objetivo}
                onChange={(e) => setObjetivo(e.target.value)}
              >
                {contexto.objetivos.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}{o.temConstrutorDePlano ? "" : " — sem construtor de plano"}
                  </option>
                ))}
              </select>
              {objetivoAtual ? (
                <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">{objetivoAtual.ajuda}</p>
              ) : null}
              {objetivoAtual && !objetivoAtual.temConstrutorDePlano ? (
                <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                  Hoje só “Gerar leads” tem plano de publicação montado no Atlas. Este objetivo precisa
                  ser montado no Gerenciador de Anúncios — a proposta não sairá daqui.
                </p>
              ) : null}
            </section>

            {/* ── Público ── */}
            <section className="cc6-panel p-5">
              <p className="cc6-eyebrow">PARA QUEM</p>
              <label className={`${rotulo} mt-4`} htmlFor="cc-cidade">CIDADE</label>
              <input
                id="cc-cidade" className={campoTexto} value={cidade}
                onChange={(e) => { cidadeTocada.current = true; setCidade(e.target.value); }}
                placeholder="São Paulo"
              />
              <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                O nome é resolvido na Meta para a chave numérica antes de virar plano. Mandar o nome
                cru faz a campanha nascer e o CONJUNTO ser recusado.
              </p>
              <p className="cc6-hairline mt-4 pt-3 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                Categoria especial HOUSING: idade 18–65+, sem recorte por gênero e raio mínimo de 24 km.
                São travas da política da Meta — o Atlas não as afrouxa.
              </p>
            </section>

            {/* ── Verba ── */}
            <section className="cc6-panel p-5">
              <p className="cc6-eyebrow">QUANTO</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <div>
                  <label className={rotulo} htmlFor="cc-verba">VERBA DIÁRIA (R$)</label>
                  <input
                    id="cc-verba" type="number" min={20} className={campoTexto}
                    value={verba} onChange={(e) => setVerba(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className={rotulo} htmlFor="cc-dias">DURAÇÃO (DIAS)</label>
                  <input
                    id="cc-dias" type="number" min={1} max={90} className={campoTexto}
                    value={dias} onChange={(e) => setDias(Number(e.target.value))}
                  />
                </div>
                <div>
                  <p className={rotulo}>TOTAL DO PERÍODO</p>
                  <p className="cc6-metric-value mt-2 text-numero">{brl(verba * dias)}</p>
                </div>
              </div>
              {/* A DURAÇÃO NÃO VIAJA NO PLANO — medido em 02/08/2026 pelo cético.
                  `duracaoDias` entra na rota e morre no texto de um item de
                  prontidão: não alcança `steps` nem `propostaPronta.payload`.
                  `leadCampaignSkeleton` escreve `daily_budget` e mais nada;
                  `planFullPublication` não escreve `end_time` nem
                  `lifetime_budget` em lugar nenhum. Sem esta frase, um total em
                  R$ no degrau de métrica leria como teto aprovado, e o que o
                  aprovador assina é verba DIÁRIA sem data de parada. */}
              <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                O total é aritmética para a sua decisão: verba diária × {dias} dia(s). A duração
                NÃO entra no plano — o que vai para aprovação é a verba DIÁRIA, sem data de
                término. Parar no dia {dias} continua sendo um ato humano.
              </p>
              <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                Nenhuma projeção de leads aparece aqui. Sem CPL histórico deste produto, qualquer
                número teria cara de previsão sem ser uma.
              </p>
            </section>

            {/* ── Criativo ── */}
            <section className="cc6-panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="cc6-eyebrow">O QUE O ANÚNCIO DIZ</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`cc6-chip ${origemDoTexto === "humano" ? "" : "cc6-destaque"}`}>
                    {origemDoTexto === "humano" ? "escrito por pessoa"
                      : origemDoTexto === "ia" ? "proposta de IA"
                      : "proposta de IA · editada por pessoa"}
                  </span>
                  <button
                    type="button" onClick={() => void proporComIA()}
                    disabled={!developmentId || gerandoIA}
                    className="cc6-ghost-btn disabled:opacity-40"
                  >
                    {gerandoIA ? "Gerando…" : "Propor texto com IA"}
                  </button>
                </div>
              </div>
              <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                A IA consome tokens (o custo aparece abaixo) e grava as peças como rascunho.
                Deixar em branco usa a sugestão determinística montada da ficha do empreendimento —
                que é regra, não IA, e por isso não recebe o selo.
              </p>

              <label className={`${rotulo} mt-5`} htmlFor="cc-titulo">TÍTULO (ATÉ {LIMITE_TITULO} CARACTERES)</label>
              <input
                id="cc-titulo" className={campoTexto} value={titulo} maxLength={80}
                onChange={(e) => { setTitulo(e.target.value); marcarEdicao(); }}
                placeholder="deixe vazio para usar a sugestão do sistema"
              />

              <label className={`${rotulo} mt-4`} htmlFor="cc-texto">TEXTO PRINCIPAL (ATÉ {LIMITE_TEXTO})</label>
              <textarea
                id="cc-texto" rows={3} className={campoTexto} value={textoPrincipal} maxLength={400}
                onChange={(e) => { setTextoPrincipal(e.target.value); marcarEdicao(); }}
                placeholder="deixe vazio para usar a sugestão do sistema"
              />

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={rotulo} htmlFor="cc-descricao">DESCRIÇÃO (ATÉ {LIMITE_DESCRICAO})</label>
                  <input
                    id="cc-descricao" className={campoTexto} value={descricao} maxLength={60}
                    onChange={(e) => { setDescricao(e.target.value); marcarEdicao(); }}
                  />
                </div>
                <div>
                  <label className={rotulo} htmlFor="cc-cta">BOTÃO</label>
                  <select id="cc-cta" className={campoTexto} value={cta} onChange={(e) => setCta(e.target.value)}>
                    {CTAS.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
                  </select>
                </div>
              </div>

              <div className="cc6-hairline mt-5 pt-4">
                <p className={rotulo}>MÍDIA</p>
                <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                  Enviar imagem ou vídeo é ESCRITA na Meta e não acontece nesta tela. Informe aqui o
                  hash da imagem ou o ID do vídeo já presentes na biblioteca da conta.
                </p>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={rotulo} htmlFor="cc-img">HASHES DE IMAGEM</label>
                    <input
                      id="cc-img" className={campoTexto} value={imageHashes}
                      onChange={(e) => setImageHashes(e.target.value)}
                      placeholder="separe por vírgula"
                    />
                  </div>
                  <div>
                    <label className={rotulo} htmlFor="cc-vid">IDs DE VÍDEO</label>
                    <input
                      id="cc-vid" className={campoTexto} value={videoIds}
                      onChange={(e) => setVideoIds(e.target.value)}
                      placeholder="separe por vírgula"
                    />
                  </div>
                </div>
              </div>

              {lastroDaIA ? (
                <div className="cc6-panel-quiet mt-5 p-4">
                  <p className={rotulo}>O QUE A IA USOU PARA PROPOR</p>
                  <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    {lastroDaIA.provedor}/{lastroDaIA.modelo} · {lastroDaIA.tokensTotais} tokens ·{" "}
                    {lastroDaIA.custoEstimadoUsd == null
                      ? "custo não calculado (falta tarifa na tabela de preços)"
                      : `US$ ${lastroDaIA.custoEstimadoUsd.toFixed(5)}`}
                  </p>
                  <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    Insumos: {lastroDaIA.camposUsados.join(" · ") || "nenhum campo confirmado"}
                  </p>
                  {lastroDaIA.camposAusentes.length ? (
                    <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                      Faltava no cadastro: {lastroDaIA.camposAusentes.join(" · ")} — a peça foi escrita
                      SEM esses dados, nunca com dado inventado.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {/* ── Conta, Página e formulário ── */}
            <section className="cc6-panel p-5">
              <p className="cc6-eyebrow">POR ONDE SOBE</p>

              <label className={`${rotulo} mt-4`} htmlFor="cc-conta">CONTA DE ANÚNCIOS</label>
              {contexto.contasMedidas ? (
                <select id="cc-conta" className={campoTexto} value={contaId} onChange={(e) => setContaId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {contexto.contas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · {c.id}{c.ativa ? "" : " (inativa)"}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input id="cc-conta" className={campoTexto} value={contaId} onChange={(e) => setContaId(e.target.value)} />
                  <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                    A Meta não respondeu à listagem de contas. Este campo aceita digitação, mas
                    ninguém conferiu que este token alcança esta conta — a prontidão marca “não medido”.
                  </p>
                </>
              )}
              {/* Aqui havia o total investido em número. Saiu: é um valor
                  medido numa janela que passa, cravado numa frase que fica —
                  em duas semanas seria um número errado com cara de fato. O
                  que a frase precisa carregar é a CONSEQUÊNCIA, que não vence. */}
              <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                Há mais de uma conta em uso, e o investimento já saiu de uma enquanto as leads
                atribuídas chegaram por outra. Escolher a conta errada gasta verba onde a lead
                não volta. Os números por conta vivem na Central de campanhas.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={rotulo} htmlFor="cc-pagina">PÁGINA (PAGE ID)</label>
                  <input id="cc-pagina" className={campoTexto} value={paginaId} onChange={(e) => setPaginaId(e.target.value)} />
                </div>
                <div>
                  <label className={rotulo} htmlFor="cc-form">FORMULÁRIO DE LEADS</label>
                  <input id="cc-form" className={campoTexto} value={formularioId} onChange={(e) => setFormularioId(e.target.value)} />
                </div>
              </div>
              <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                Os dois vêm do ambiente quando configurados. Sem eles a proposta ainda é registrável —
                o que fica bloqueado é a ATIVAÇÃO.
              </p>
            </section>
          </div>

          {/* ═══ COLUNA DA CONSEQUÊNCIA ════════════════════════════════════ */}
          <div className="space-y-4">
            {/* ── Veredito ── */}
            <section className="cc6-panel p-5" aria-live="polite">
              <p className="cc6-eyebrow">PRONTIDÃO PARA PUBLICAR</p>
              {!resumo ? (
                <p className="mt-3 text-corpo text-[var(--atlas-texto-medio)]">
                  {medindo ? "Medindo…" : "Escolha o empreendimento para começar a medição."}
                </p>
              ) : (
                <>
                  {/* O `!` não é gosto: `.cc6-metric-value` é unlayered e crava
                      `color: var(--atlas-text-primary)`, então o utilitário de
                      cor perderia a cascata e o verde nunca apareceria. */}
                  <p className={`cc6-metric-value mt-2 text-heroi leading-none ${
                    resumo.podePublicar ? "text-[var(--atlas-estado-sucesso)]!" : ""
                  }`}>
                    {resumo.bloqueadores + resumo.naoMedidos}
                  </p>
                  <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-forte)]">
                    {resumo.podePublicar
                      ? "nada impede publicar — os itens abaixo foram todos medidos"
                      : `item(ns) impedem publicar · ${resumo.ok} de ${resumo.total} prontos`}
                  </p>
                  {resumo.naoMedidos > 0 ? (
                    <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                      {resumo.naoMedidos} item(ns) NÃO MEDIDOS entram nesta conta. Item não medido não é
                      item aprovado — por isso o painel não diz “pronto”.
                    </p>
                  ) : null}
                </>
              )}
            </section>

            {/* ── Itens desta proposta ── */}
            {previa ? (
              <section className="cc6-panel p-5">
                <p className="cc6-eyebrow">ESTA PROPOSTA</p>
                <ul className="mt-2 divide-y divide-[var(--atlas-border-subtle)]">
                  {previa.itens.map((i) => <LinhaDeProntidao key={i.chave} item={i} />)}
                </ul>
              </section>
            ) : null}

            {/* ── Produto e CRM: outra fonte, dito na tela ── */}
            {prontidaoProduto ? (
              <section className="cc6-panel p-5">
                <p className="cc6-eyebrow">PRODUTO E CRM</p>
                <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                  Medido por campaign-readiness — fonte separada, para nenhum item ter duas verdades.
                </p>
                <ul className="mt-2 divide-y divide-[var(--atlas-border-subtle)]">
                  {[...prontidaoProduto.grupos.produto, ...prontidaoProduto.grupos.crm].map((i) => (
                    <LinhaDeProntidao
                      key={i.chave}
                      item={{ chave: i.chave, rotulo: i.rotulo, estado: i.ok ? "ok" : "falta", detalhe: i.detalhe, bloqueia: false }}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            {/* ── Prévia ── */}
            {previa ? (
              <section className="cc6-panel p-5">
                <p className="cc6-eyebrow">O QUE SERÁ PUBLICADO</p>
                <div className="cc6-panel-quiet mt-3 p-4">
                  <p className="text-rotulo text-[var(--atlas-texto-medio)]">
                    {previa.previa.paginaId ? `Página ${previa.previa.paginaId}` : "Página não definida"} · patrocinado
                  </p>
                  <p className="mt-2 text-corpo leading-5 text-[var(--atlas-texto-forte)]">
                    {previa.previa.textoPrincipal ?? "— sem texto principal —"}
                  </p>
                  <div
                    className="mt-3 flex h-24 items-center justify-center rounded-lg border border-dashed border-[var(--atlas-border)] text-rotulo text-[var(--atlas-texto-medio)]"
                  >
                    {previa.previa.midiaResumo}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-corpo font-semibold text-[var(--atlas-texto-forte)]">
                        {previa.previa.titulo ?? "— sem título —"}
                      </p>
                      <p className="text-rotulo text-[var(--atlas-texto-medio)]">
                        {previa.previa.descricao ?? "— sem descrição —"}
                      </p>
                    </div>
                    <span className="cc6-chip">{CTAS.find((c) => c.valor === previa.previa.cta)?.rotulo ?? previa.previa.cta}</span>
                  </div>
                </div>

                {previa.planoIndisponivel ? (
                  <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-estado-atencao)]">
                    Plano não montado: {previa.planoIndisponivel}
                  </p>
                ) : (
                  <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    Plano: {previa.plano.campanhas} campanha · {previa.plano.conjuntos} conjunto ·{" "}
                    {previa.plano.criativos} criativo · {previa.plano.anuncios} anúncio(s).{" "}
                    {previa.plano.todosPausados
                      ? "Tudo nasce PAUSED."
                      : `ATENÇÃO: status ${previa.plano.statusEncontrados.join(", ")} — algo nasceria ativo.`}
                  </p>
                )}
                {previa.violacoesDePublico.length ? (
                  <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-estado-perigo)]">
                    Público reprovado na política HOUSING: {previa.violacoesDePublico.map((v) => v.detail).join(" · ")}
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* ── Enviar ── */}
            <section className="cc6-panel p-5">
              <p className="cc6-eyebrow">ENVIAR PARA APROVAÇÃO</p>
              {propostaId ? (
                <>
                  <p className="mt-3 text-corpo leading-5 text-[var(--atlas-estado-sucesso)]">
                    Proposta registrada como pendente.
                  </p>
                  <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                    Nada foi publicado. A decisão acontece na Caixa de Aprovações; depois de aprovada,
                    a ativação continua sendo um passo humano.
                  </p>
                  <Link href="/approvals" className="cc6-ghost-btn mt-4">Abrir /approvals</Link>
                </>
              ) : (
                <>
                  <button
                    type="button" onClick={() => void enviarParaAprovacao()}
                    disabled={!previa?.propostaPronta || enviando}
                    className="cc6-ghost-btn mt-3 w-full disabled:opacity-40"
                  >
                    {enviando ? "Registrando…" : "Enviar para aprovação"}
                  </button>
                  {/* Botão desabilitado SEMPRE diz por quê. Um controle morto sem
                      explicação faz o usuário concluir que o produto quebrou. */}
                  {!previa?.propostaPronta ? (
                    <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                      {previa?.planoIndisponivel
                        ? `Ainda não dá para propor — ${previa.planoIndisponivel}.`
                        : "Ainda não dá para propor: escolha empreendimento, conta e verba."}
                    </p>
                  ) : (
                    <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                      A proposta entra PENDENTE, com o plano inteiro anexado.
                      {resumo && !resumo.podePublicar
                        ? " Propor é permitido com pendências; o que elas bloqueiam é a ATIVAÇÃO."
                        : ""}
                    </p>
                  )}
                  {resumo && resumo.motivos.length ? (
                    <ul className="mt-3 space-y-1">
                      {resumo.motivos.map((m) => (
                        <li key={m} className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">— {m}</li>
                      ))}
                    </ul>
                  ) : null}
                  {erroEnvio ? (
                    <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-estado-perigo)]">{erroEnvio}</p>
                  ) : null}
                </>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
