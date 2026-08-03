"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { supabase } from "@/lib/supabase";
import {
  CATEGORIAS,
  IDIOMAS,
  extrairParametros,
  STATUS_QUE_A_OPERACAO_ESCREVE,
} from "@/lib/whatsapp/catalogo-de-templates";

/**
 * A TELA QUE FALTAVA.
 *
 * `message_templates` tinha 0 linhas de qualquer status e ZERO escritores no
 * repositório — seis leitores exigiam `status='approved'` e nenhuma tela, rota
 * ou script sabia criar essa linha. A tela irmã (`/integrations/whatsapp`)
 * chegava a mandar "cadastre e sincronize ao menos um template aprovado", e o
 * cadastro não existia. Era cobrança sem porta.
 *
 * ── As três regras desta tela ──────────────────────────────────────────────
 *
 * 1. **Ninguém digita "aprovado".** O seletor de situação só oferece rascunho
 *    e enviado-para-a-Meta. O selo de aprovado só aparece depois que a Graph
 *    API disser `APPROVED` — porque aprovação é fato da Meta, e um CRM que a
 *    afirma sozinho manda a IA enviar, a Meta recusa, e a lead já foi marcada
 *    como abordada.
 *
 * 2. **Zero desenhado como saúde é proibido.** Quando uma contagem não pôde
 *    ser lida, a tela escreve "não deu para medir" — nunca `0`. Falha de
 *    leitura e ausência de fato mandam a pessoa fazer coisas opostas.
 *
 * 3. **Falta de alcance tem nome e dono.** Se a Graph API não responder, a
 *    tela diz o que faltou e quem resolve, com a trilha das chamadas — em vez
 *    de mostrar uma lista vazia que parece "a conta não tem template".
 */

/**
 * `Medida` foi declarada aqui e nunca usada — uma terceira cópia da mesma ideia.
 * A canônica vive em `lib/ai/prontidao-para-ligar.ts` (com `valor: number | null`,
 * onde `null` é afirmação sobre a LEITURA e `0` é afirmação sobre o mundo), e
 * esta tela na prática usa `Elo`, que já carrega a mesma distinção em `numero`.
 * Tipo duplicado que ninguém usa é o convite para o próximo leitor achar que há
 * duas semânticas onde só existe uma.
 */
type Elo = { titulo: string; numero: number | null; detalhe: string };
type Registrado = { id: string; name: string; language: string; category: string; body: string; variables: unknown; status: string; external_template_id: string | null; updated_at: string };
type DaMeta =
  | { alcance: "sem_credencial"; faltando: string[]; quemResolve: string; recado: string }
  | { alcance: "nao_achei_a_conta" | "erro"; quemResolve: string; recado: string; trilha: string[] }
  | { alcance: "lido"; contaDaMeta: { id: string; nome: string | null; comoFoiDescoberta: string }; templates: Array<{ name: string; language: string; category: string; body: string; variables: string[]; status: string; statusLiteralDaMeta: string }>; descartados: Array<{ nome: string; motivo: string }>; trilha: string[] };

type Painel = {
  geradoEm: string;
  registrados: Registrado[] | null;
  motivoSemLista?: string;
  aprovados: number | null;
  destrave: { frase: string; elos: Elo[]; algumaLeituraFalhou: boolean };
  meta: DaMeta | null;
};

type Estado = { fase: "carregando" } | { fase: "erro"; mensagem: string } | { fase: "pronto"; painel: Painel };

const ROTULO_DA_SITUACAO: Record<string, string> = {
  draft: "rascunho aqui",
  pending: "na fila da Meta",
  approved: "aprovado pela Meta",
  rejected: "recusado pela Meta",
  archived: "existe lá, não pode enviar",
};

/** Um número que talvez não tenha sido medido. Nunca imprime `0` por falha de leitura. */
function Numero({ valor }: { valor: number | null }) {
  if (valor === null) {
    return (
      <span className="cc6-warn text-corpo font-semibold" title="A leitura falhou. Isto não é zero.">
        não deu para medir
      </span>
    );
  }
  return <span className="cc6-metric-value cc6-num">{valor}</span>;
}

async function comSessao(url: string, init?: RequestInit) {
  const token = (await supabase.auth.getSession()).data.session?.access_token || "";
  return fetch(url, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
}

export default function TemplatesDeWhatsApp() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [ocupado, setOcupado] = useState("");
  const [recado, setRecado] = useState<{ tom: "ok" | "ruim"; texto: string } | null>(null);

  const [nome, setNome] = useState("");
  const [idioma, setIdioma] = useState("pt_BR");
  const [categoria, setCategoria] = useState<string>("utility");
  const [corpo, setCorpo] = useState("");
  const [situacao, setSituacao] = useState<string>("pending");

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await comSessao("/api/v1/whatsapp/templates");
      const body = await resposta.json();
      if (!resposta.ok || !body?.ok) {
        setEstado({ fase: "erro", mensagem: body?.error?.message || "Não foi possível ler os templates agora." });
        return;
      }
      setEstado({ fase: "pronto", painel: body.data as Painel });
    } catch {
      setEstado({ fase: "erro", mensagem: "Não foi possível falar com o servidor para ler os templates." });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function agir(acao: string, extra: Record<string, unknown> = {}, rotulo = acao) {
    setOcupado(acao);
    setRecado(null);
    try {
      const resposta = await comSessao("/api/v1/whatsapp/templates", { method: "POST", body: JSON.stringify({ acao, ...extra }) });
      const body = await resposta.json();
      if (!resposta.ok || !body?.ok) {
        setRecado({ tom: "ruim", texto: body?.error?.message || `Não foi possível ${rotulo}.` });
        return;
      }
      if (acao === "registrar") {
        setRecado({ tom: "ok", texto: `Template "${body.data.gravado.name}" (${body.data.gravado.language}) registrado como ${ROTULO_DA_SITUACAO[body.data.gravado.status] ?? body.data.gravado.status}. Confirmado pela linha que voltou do banco.` });
        setNome("");
        setCorpo("");
      } else if (acao === "importar") {
        setRecado({ tom: "ok", texto: `${body.data.importados.length} template(s) importado(s) da conta ${body.data.contaDaMeta.id}. A situação de cada um é a que a Meta informou.` });
      } else if (acao === "sincronizar") {
        const m = body.data.mudancas as Array<{ nome: string; de: string; para: string }>;
        setRecado({
          tom: "ok",
          texto: m.length
            ? `A Meta mudou a situação de ${m.length}: ${m.map((x) => `${x.nome} (${x.de} → ${x.para})`).join("; ")}.`
            : "Perguntei à Meta e nada mudou de situação — o que está aqui é o que ela diz agora.",
        });
      }
      await carregar();
    } catch {
      setRecado({ tom: "ruim", texto: `Não foi possível ${rotulo}: o servidor não respondeu.` });
    } finally {
      setOcupado("");
    }
  }

  const painel = estado.fase === "pronto" ? estado.painel : null;
  const daMeta = painel?.meta ?? null;
  const parametros = extrairParametros(corpo);
  const podeRegistrar = nome.trim().length > 0 && corpo.trim().length > 1 && ocupado === "";

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="WhatsApp oficial"
        title="Template aprovado pela Meta"
        description="Onde o template que a Meta aprovou passa a existir no CRM. Falar PRIMEIRO com uma lead pelo WhatsApp oficial só é permitido por template — e até aqui não havia onde registrá-lo."
      />

      {estado.fase === "carregando" ? (
        <div className="grid gap-3" aria-busy="true">
          <AtlasSkeleton className="h-40" />
          <AtlasSkeleton className="h-32" />
        </div>
      ) : null}

      {estado.fase === "erro" ? (
        <section className="cc6-panel p-4 sm:p-5" role="alert">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">Não foi possível ler os templates</h2>
          <p className="mt-1.5 max-w-[68ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">{estado.mensagem}</p>
          <p className="mt-1.5 text-xs leading-5 text-[var(--atlas-text-tertiary)]">
            Isto <strong>não</strong> quer dizer que não há template cadastrado — quer dizer que não deu para olhar agora.
          </p>
          <button type="button" onClick={() => void carregar()} className="mt-3 inline-flex min-h-[44px] items-center rounded-lg border border-[var(--atlas-border)] px-4 text-corpo font-semibold text-[var(--atlas-text-primary)] transition-colors hover:border-[var(--atlas-border-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]">
            Tentar ler de novo
          </button>
        </section>
      ) : null}

      {recado ? (
        <section className={`cc6-panel cc6-sev-band p-4 pl-5`} style={{ "--cc6-sev": recado.tom === "ok" ? "var(--atlas-success)" : "var(--atlas-danger)" } as CSSProperties} role="status">
          <p className="max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-primary)]">{recado.texto}</p>
        </section>
      ) : null}

      {painel ? (
        <>
          {/* ── O QUE DESTRAVA, com o número medido agora ───────────────────── */}
          <section
            className="cc6-panel cc6-sev-band cc6-reveal p-4 pl-5 sm:p-5 sm:pl-6"
            style={{ "--cc6-sev": painel.aprovados ? "var(--atlas-success)" : "var(--atlas-warning)" } as CSSProperties}
            aria-labelledby="destrave-titulo"
          >
            <h2 id="destrave-titulo" className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">
              O que está esperando este template
            </h2>
            <p className="mt-1.5 max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">{painel.destrave.frase}</p>

            <ul className="mt-3.5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {painel.destrave.elos.map((elo) => (
                <li key={elo.titulo} className="cc6-panel-quiet p-3">
                  <p className="cc6-metric-label">{elo.titulo}</p>
                  <p className="mt-1">
                    <Numero valor={elo.numero} />
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[var(--atlas-text-secondary)]">{elo.detalhe}</p>
                </li>
              ))}
            </ul>

            {painel.destrave.algumaLeituraFalhou ? (
              <p className="mt-3 text-xs leading-5 text-[var(--atlas-text-tertiary)]" role="note">
                <span aria-hidden="true">⚠️ </span>
                Pelo menos uma dessas contagens não pôde ser lida. O item aparece como <strong>não deu para medir</strong> e nunca como zero — falha de leitura e ausência de fato mandam fazer coisas opostas.
              </p>
            ) : null}

            <p className="mt-3 text-xs leading-5 text-[var(--atlas-text-tertiary)]">
              Template aprovado é condição <strong>necessária</strong>, não suficiente: o número oficial em <code className="cc6-num">integrations</code> e o consentimento da lead continuam valendo.{" "}
              <Link href="/integrations/whatsapp" className="cc6-interativo-acento underline-offset-2 hover:underline">
                Ver a saúde do número oficial
              </Link>
              .
            </p>
          </section>

          {/* ── O QUE A META DIZ ─────────────────────────────────────────────── */}
          <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="meta-titulo">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="meta-titulo" className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">
                O que a Meta já tem
              </h2>
              {daMeta?.alcance === "lido" ? (
                <span className="cc6-chip shrink-0" title={daMeta.contaDaMeta.comoFoiDescoberta}>
                  conta {daMeta.contaDaMeta.id}
                  {daMeta.contaDaMeta.nome ? ` · ${daMeta.contaDaMeta.nome}` : ""}
                </span>
              ) : null}
            </header>

            {daMeta === null ? (
              <p className="mt-2 text-corpo leading-6 text-[var(--atlas-text-secondary)]">A Meta não foi consultada nesta carga.</p>
            ) : daMeta.alcance === "lido" ? (
              <>
                <p className="mt-1.5 max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">
                  Leitura direta da Graph API — somente consulta. O Atlas não cria, não submete e não apaga template na Meta: isso é ato do dono no Business Manager.
                </p>
                {daMeta.templates.length === 0 ? (
                  <p className="mt-3 max-w-[80ch] rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--atlas-text-secondary)]" role="note">
                    <span aria-hidden="true">📭 </span>
                    A conta de WhatsApp desta operação <strong>não tem nenhum template</strong>, de nenhum status. Este vazio é da Meta, não do CRM: a leitura funcionou e voltou sem itens. Enquanto ninguém criar e submeter um template no Business Manager, não há o que importar — e o cadastro abaixo serve para registrar aqui o que já estiver aprovado por outro caminho.
                  </p>
                ) : (
                  <>
                    <ul className="mt-3 grid gap-2">
                      {daMeta.templates.map((t) => (
                        <li key={`${t.name}-${t.language}`} className="cc6-panel-quiet flex flex-wrap items-center justify-between gap-2 p-3">
                          <span className="min-w-0">
                            <span className="text-corpo font-medium text-[var(--atlas-text-primary)]">{t.name}</span>
                            <span className="ml-2 text-xs text-[var(--atlas-text-tertiary)]">{t.language} · {t.category}</span>
                            <span className="mt-0.5 block max-w-[70ch] truncate text-xs leading-5 text-[var(--atlas-text-secondary)]">{t.body}</span>
                          </span>
                          <span className={`cc6-badge ${t.status === "approved" ? "cc6-badge-success" : "cc6-badge-warning"} shrink-0`} title={`Palavra literal da Meta: ${t.statusLiteralDaMeta}`}>
                            {t.statusLiteralDaMeta}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      disabled={ocupado !== ""}
                      onClick={() => void agir("importar", {}, "importar da Meta")}
                      className="cc6-ghost-btn mt-3 min-h-[44px] px-4 disabled:opacity-50"
                    >
                      {ocupado === "importar" ? "Importando..." : `Importar ${daMeta.templates.length} template(s) da Meta`}
                    </button>
                  </>
                )}
                {daMeta.descartados.length ? (
                  <p className="mt-2 text-xs leading-5 text-[var(--atlas-text-tertiary)]">
                    {daMeta.descartados.length} template(s) da Meta não podem ser importados: {daMeta.descartados.map((d) => `${d.nome} — ${d.motivo}`).join("; ")}.
                  </p>
                ) : null}
              </>
            ) : (
              <div className="mt-2">
                <p className="max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">{daMeta.recado}</p>
                <p className="mt-1.5 text-xs text-[var(--atlas-text-tertiary)]">
                  <span aria-hidden="true">{daMeta.quemResolve === "dono" ? "🔑 " : "🖥️ "}</span>
                  {daMeta.quemResolve === "dono" ? "Depende do dono da conta na Meta" : "Depende de quem opera o servidor"}
                  {daMeta.alcance === "sem_credencial" ? ` · falta no servidor: ${daMeta.faltando.join(", ")} (nome da variável, nunca o valor)` : ""}
                </p>
                <p className="mt-1.5 text-xs leading-5 text-[var(--atlas-text-tertiary)]">
                  Isto <strong>não</strong> quer dizer que a Meta não tem templates — quer dizer que não deu para perguntar. O cadastro manual abaixo continua valendo.
                </p>
                {"trilha" in daMeta && daMeta.trilha.length ? (
                  <details className="mt-2">
                    <summary className="min-h-[44px] cursor-pointer py-2 text-xs text-[var(--atlas-text-tertiary)]">Ver a trilha das chamadas</summary>
                    <ul className="mt-1 grid gap-1">
                      {daMeta.trilha.map((passo, i) => (
                        <li key={i} className="text-xs leading-5 text-[var(--atlas-text-secondary)]">{passo}</li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            )}
          </section>

          {/* ── O QUE ESTÁ CADASTRADO AQUI ───────────────────────────────────── */}
          <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="registrados-titulo">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="registrados-titulo" className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">
                Cadastrados neste CRM
              </h2>
              <button
                type="button"
                disabled={ocupado !== ""}
                onClick={() => void agir("sincronizar", {}, "perguntar à Meta")}
                className="cc6-ghost-btn min-h-[44px] px-4 disabled:opacity-50"
              >
                {ocupado === "sincronizar" ? "Perguntando..." : "Perguntar à Meta a situação atual"}
              </button>
            </header>

            {painel.registrados === null ? (
              <p className="mt-2 max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]" role="alert">
                {painel.motivoSemLista}
              </p>
            ) : painel.registrados.length === 0 ? (
              <p className="mt-2 max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">
                Nenhum template cadastrado. Enquanto ficar assim, seis lugares do produto — reativação, jornada noturna, sombra do atendimento, prontidão da IA, diagnóstico do canal e o ensaio de homologação — continuam procurando uma linha aprovada e não achando.
              </p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {painel.registrados.map((t) => (
                  <li key={t.id} className="cc6-panel-quiet flex flex-wrap items-center justify-between gap-2 p-3">
                    <span className="min-w-0">
                      <span className="text-corpo font-medium text-[var(--atlas-text-primary)]">{t.name}</span>
                      <span className="ml-2 text-xs text-[var(--atlas-text-tertiary)]">
                        {t.language} · {t.category}
                        {Array.isArray(t.variables) && t.variables.length ? ` · ${t.variables.length} parâmetro(s)` : " · sem parâmetro"}
                      </span>
                      <span className="mt-0.5 block max-w-[70ch] truncate text-xs leading-5 text-[var(--atlas-text-secondary)]">{t.body}</span>
                    </span>
                    <span className={`cc6-badge shrink-0 ${t.status === "approved" ? "cc6-badge-success" : t.status === "rejected" ? "cc6-badge-danger" : "cc6-badge-warning"}`}>
                      {ROTULO_DA_SITUACAO[t.status] ?? t.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── O CADASTRO — a porta que não existia ─────────────────────────── */}
          <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "180ms" }} aria-labelledby="cadastro-titulo">
            <h2 id="cadastro-titulo" className="text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">
              Registrar um template
            </h2>
            <p className="mt-1.5 max-w-[80ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">
              Use exatamente o nome e o idioma que estão no Business Manager: é esse par que a Cloud API usa para achar o template no envio. Um caractere diferente e a mensagem não sai.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1">
                <span className="cc6-metric-label">Nome na Meta</span>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value.toLowerCase())}
                  placeholder="primeiro_contato_imovel"
                  className="min-h-[44px] rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] px-3 text-corpo text-[var(--atlas-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                />
                <span className="text-xs text-[var(--atlas-text-tertiary)]">Só minúsculas, números e sublinhado.</span>
              </label>

              <label className="grid gap-1">
                <span className="cc6-metric-label">Idioma</span>
                <select
                  value={idioma}
                  onChange={(e) => setIdioma(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] px-3 text-corpo text-[var(--atlas-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                >
                  {IDIOMAS.map((codigo) => (
                    <option key={codigo} value={codigo}>{codigo}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="cc6-metric-label">Categoria</span>
                <select
                  value={categoria}
                  onChange={(e) => setCategoria(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] px-3 text-corpo text-[var(--atlas-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                >
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1">
                <span className="cc6-metric-label">Situação</span>
                <select
                  value={situacao}
                  onChange={(e) => setSituacao(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] px-3 text-corpo text-[var(--atlas-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                >
                  {STATUS_QUE_A_OPERACAO_ESCREVE.map((s) => (
                    <option key={s} value={s}>{ROTULO_DA_SITUACAO[s]}</option>
                  ))}
                </select>
                {/* A ausência de "aprovado" nesta lista é a regra mais cara da
                    tela, então ela é dita em voz alta e não deixada por conta
                    de quem reparar no que falta. */}
                <span className="text-xs leading-5 text-[var(--atlas-text-tertiary)]">
                  <strong>Aprovado não está aqui de propósito.</strong> Quem aprova é a Meta, e o selo só aparece depois que a Graph API responder <code className="cc6-num">APPROVED</code>. Se o CRM marcasse aprovado por conta própria, a IA enviaria, a Meta recusaria — e a lead já estaria marcada como abordada.
                </span>
              </label>
            </div>

            <label className="mt-3 grid gap-1">
              <span className="cc6-metric-label">Corpo aprovado</span>
              <textarea
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={4}
                placeholder="Olá {{1}}, aqui é da {{2}}. Vi seu interesse no empreendimento e posso te mandar as opções disponíveis. Posso seguir por aqui?"
                className="rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] p-3 text-corpo leading-6 text-[var(--atlas-text-primary)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
              />
              <span className="text-xs leading-5 text-[var(--atlas-text-tertiary)]">
                Cole o texto <strong>exatamente</strong> como a Meta aprovou. Os parâmetros saem do próprio corpo — não há lista separada para divergir dele.
              </span>
            </label>

            <p className="mt-2 text-xs leading-5 text-[var(--atlas-text-secondary)]">
              Parâmetros detectados:{" "}
              {parametros.length === 0 ? (
                <span className="text-[var(--atlas-text-tertiary)]">nenhum — este template pode ser usado no ensaio de homologação, que exige template sem parâmetro.</span>
              ) : (
                parametros.map((p) => (
                  <code key={p} className="cc6-num mr-1.5">{`{{${p}}}`}</code>
                ))
              )}
            </p>

            <button
              type="button"
              disabled={!podeRegistrar}
              onClick={() => void agir("registrar", { template: { nome, idioma, categoria, corpo, situacao } }, "registrar o template")}
              className="cc6-ghost-btn mt-3 min-h-[44px] px-4 disabled:opacity-50"
            >
              {ocupado === "registrar" ? "Gravando..." : "Registrar template"}
            </button>
          </section>

          <p className="text-xs leading-5 text-[var(--atlas-text-tertiary)]">
            Lido em {new Date(painel.geradoEm).toLocaleString("pt-BR")} · a gravação é conferida pela linha que volta do banco, porque no PostgREST um update que não casa com nenhuma linha responde 200 sem erro.
          </p>
        </>
      ) : null}
    </div>
  );
}
