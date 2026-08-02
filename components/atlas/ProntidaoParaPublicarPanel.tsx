"use client";

/**
 * O QUE FALTA PARA APERTAR O BOTÃO — a tela.
 *
 * ── Por que este componente existe em vez de duas telas ─────────────────────
 *
 * Ele é montado em dois lugares: em /approvals, onde o dono aprova (e aprovar é
 * o ato que autoriza gasto), e na composição da proposta, onde alguém escolhe
 * conta, Página e verba. As duas perguntas são a MESMA, e escrevê-la duas vezes
 * produziria duas respostas — a classe de defeito que este repositório já pagou
 * mais de uma vez. Uma fonte, dois lugares, nenhuma cópia.
 *
 * ── As três regras que este desenho obedece ─────────────────────────────────
 *
 * 1. **Ausência nunca é saúde.** Um item em zero não vira número neutro: vira
 *    bloqueio com dono nomeado. E `0 divergências` (bom) nunca é pintado como
 *    `0 imagens` (ruim) — quem decide a cor é o CRITÉRIO que vem da rota, nunca
 *    o número. O mesmo zero tem dois significados opostos nesta lista.
 *
 * 2. **Falha de leitura nunca vira "tudo pronto".** Se a rota não responde, o
 *    painel não some e não fica verde: ele diz que não conseguiu olhar. O caso
 *    perigoso é o silencioso — token expirado numa sexta à noite, tela calma,
 *    ninguém desconfia.
 *
 * 3. **Bloqueio sem saída ensina a fechar a aba.** Todo item traz o que ainda dá
 *    para fazer sem ele, e o painel abre pelo PRIMEIRO passo — não por uma
 *    parede de quinze vermelhos.
 *
 * Nenhuma decisão é tomada aqui. Estado, cor e frase vêm prontos de
 * `lib/meta/marketing/prontidao-para-publicar.ts`, que o contrato executa.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type EstadoDoItem = "pronto" | "bloqueia" | "consequencia" | "nao_medido";
type EstadoGeral = "sem_leitura" | "bloqueada" | "incerta" | "pronta";
type Criterio = "existe" | "sem_divergencia";
type Grupo = "conta" | "destino" | "midia" | "conversao" | "decisao";

type Item = {
  id: string;
  titulo: string;
  grupo: Grupo;
  criterio: Criterio;
  unidade: string;
  quemResolve: "dono" | "operacao" | "servidor" | "codigo";
  oQueFazer: string;
  semEleDaPara: string;
  estado: EstadoDoItem;
  medida: { valor: number | null; fonte: string; comoFoiMedido: string; motivoSemMedida?: string };
  frase: string;
  bloqueadoPor: string[];
};

type Veredito = {
  estado: EstadoGeral;
  itens: Item[];
  bloqueios: number;
  naoMedidos: number;
  consequencias: number;
  prontos: number;
  porQuemResolve: Record<string, number>;
  primeiroPasso: Item | null;
  oQueDaParaFazerHoje: string[];
  podePublicar: boolean;
  frase: string;
  janelaDias: number;
  dicionario: {
    estados: Record<EstadoDoItem, string>;
    geral: Record<EstadoGeral, string>;
    criterios: Record<Criterio, string>;
    grupos: Record<Grupo, string>;
  };
  grupos: Grupo[];
};

/* Cor sempre em token: hex cravado não é sobrescrito pelo tema claro e o texto
   some sobre fundo branco — a classe de defeito medida neste repositório em
   31/07/2026. `consequencia` fica deliberadamente mais fraca que `bloqueia`:
   sintoma que grita como causa manda a pessoa ao lugar errado. */
const TINTA: Record<EstadoDoItem, string> = {
  pronto: "text-[var(--atlas-estado-sucesso)]",
  bloqueia: "text-[var(--atlas-estado-perigo)]",
  consequencia: "text-[var(--atlas-estado-atencao)]",
  nao_medido: "text-[var(--atlas-texto-fraco)]",
};

const MARCA: Record<EstadoDoItem, string> = {
  pronto: "✓",
  bloqueia: "×",
  consequencia: "↳",
  nao_medido: "?",
};

/** O nome lido por leitor de tela. O símbolo é `aria-hidden`; isto é o texto. */
const NOME_DO_ESTADO: Record<EstadoDoItem, string> = {
  pronto: "pronto",
  bloqueia: "bloqueia a publicação",
  consequencia: "consequência de outro item",
  nao_medido: "não medido",
};

const CADEIRA: Record<string, string> = {
  dono: "o dono",
  operacao: "a operação",
  servidor: "quem opera o servidor",
  codigo: "código",
};

function Linha({ item, dicionario }: { item: Item; dicionario: Veredito["dicionario"] }) {
  const [aberto, setAberto] = useState(false);

  /* A contagem, dita de um jeito que não confunde os dois zeros. Para um item de
     divergência, "0" sozinho ao lado de um ✓ verde é indistinguível de "não
     tenho nenhum" — que na coluna de cima significaria falta. */
  const contagem =
    item.medida.valor === null
      ? "não medido"
      : item.criterio === "sem_divergencia"
        ? item.medida.valor === 0
          ? "nenhuma divergência"
          : `${item.medida.valor} ${item.unidade}`
        : `${item.medida.valor} ${item.unidade}`;

  return (
    <li className="py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={`cc6-num shrink-0 ${TINTA[item.estado]}`} aria-hidden>{MARCA[item.estado]}</span>
        <span className="text-corpo text-[var(--atlas-texto-forte)]">{item.titulo}</span>
        <span className="sr-only">{NOME_DO_ESTADO[item.estado]}.</span>
        {item.estado === "bloqueia" ? (
          <span className="cc6-chip cc6-alerta">resolve {CADEIRA[item.quemResolve] ?? item.quemResolve}</span>
        ) : null}
        {item.estado === "consequencia" ? <span className="cc6-chip">consequência</span> : null}
      </div>

      <p className={`text-rotulo leading-4 ${item.estado === "nao_medido" ? "text-[var(--atlas-texto-fraco)]" : "text-[var(--atlas-texto-medio)]"}`}>
        {contagem}
        {item.medida.valor !== null ? ` · ${item.medida.comoFoiMedido}` : ""}
      </p>

      {/* "Não medido" SEMPRE mostra o motivo sem precisar de clique: é o estado
          em que o silêncio custa mais caro. */}
      {item.estado === "nao_medido" && item.medida.motivoSemMedida ? (
        <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
          {item.medida.motivoSemMedida}.
        </p>
      ) : null}

      {item.estado === "bloqueia" || item.estado === "consequencia" ? (
        <>
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
            className="mt-1 text-rotulo underline underline-offset-2 text-[var(--atlas-accent)]"
          >
            {aberto ? "menos" : "o que fazer, e o que dá para fazer sem isto"}
          </button>
          {aberto ? (
            <div className="mt-2 space-y-2 border-l-2 border-[var(--atlas-border-subtle)] pl-3">
              {item.estado === "consequencia" ? (
                <p className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                  {dicionario.estados.consequencia}
                </p>
              ) : (
                <p className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">{item.oQueFazer}</p>
              )}
              <p className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
                <strong className="font-semibold">Enquanto isso dá para:</strong> {item.semEleDaPara}
              </p>
            </div>
          ) : null}
        </>
      ) : null}
    </li>
  );
}

export function ProntidaoParaPublicarPanel({ titulo = "O QUE FALTA PARA PUBLICAR" }: { titulo?: string }) {
  const [dados, setDados] = useState<Veredito | null>(null);
  const [falha, setFalha] = useState("");
  const [semPermissao, setSemPermissao] = useState(false);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        const r = await fetch("/api/v1/marketing/prontidao-para-publicar", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          cache: "no-store",
        });
        const corpo = await r.json();
        if (!vivo) return;
        if (r.status === 403) { setSemPermissao(true); return; }
        if (!r.ok) throw new Error(corpo?.error?.message ?? "a medição não respondeu");
        setDados(corpo.data as Veredito);
      } catch (e) {
        // O caminho que decide se este painel vale alguma coisa: falha vira
        // AVISO visível, nunca ausência. Um painel que some quando a leitura
        // falha é um painel que mente por omissão exatamente no pior dia.
        if (vivo) setFalha(e instanceof Error ? e.message : "não foi possível medir");
      } finally {
        if (vivo) setCarregando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Quem não decide verba não precisa desta lista — e some sem alarme, porque
  // "restrito" não é "quebrado".
  if (semPermissao) return null;

  if (carregando) {
    return (
      <section className="cc6-panel p-5" aria-label="Prontidão para publicar" aria-busy="true">
        <p className="cc6-eyebrow">{titulo}</p>
        <p className="mt-3 text-corpo text-[var(--atlas-texto-medio)]">Medindo conta, Página, mídia e conversão…</p>
      </section>
    );
  }

  if (falha || !dados) {
    return (
      <section className="cc6-panel p-5" aria-label="Prontidão para publicar" role="status">
        <p className="cc6-eyebrow">{titulo}</p>
        <p className="mt-3 text-corpo leading-5 text-[var(--atlas-estado-atencao)]">
          Não consegui medir a prontidão de publicação{falha ? `: ${falha}` : ""}.
        </p>
        <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          Isto NÃO quer dizer que está tudo pronto e NÃO quer dizer que falta tudo — quer dizer que
          esta tela não sabe. Não trate a ausência desta lista como autorização para publicar.
        </p>
      </section>
    );
  }

  const pendentes = dados.bloqueios + dados.naoMedidos;

  return (
    <section className="cc6-panel p-5" aria-label="Prontidão para publicar" aria-live="polite">
      <p className="cc6-eyebrow">{titulo}</p>

      {/* O número grande conta bloqueio E não medido. Mostrar só bloqueios faria
          "0" aparecer num dia em que metade da lista não foi lida. */}
      <p className={`cc6-metric-value mt-2 text-heroi leading-none ${dados.podePublicar ? "text-[var(--atlas-estado-sucesso)]!" : ""}`}>
        {pendentes}
      </p>
      <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-forte)]">
        {dados.podePublicar
          ? `nada impede publicar — os ${dados.prontos} itens foram medidos`
          : `item(ns) entre o dono e o botão · ${dados.prontos} de ${dados.itens.length} prontos`}
      </p>
      <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">{dados.frase}</p>

      {dados.naoMedidos > 0 ? (
        <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
          {dados.naoMedidos} item(ns) NÃO MEDIDOS entram nesta conta. {dados.dicionario.estados.nao_medido}
        </p>
      ) : null}

      {dados.consequencias > 0 ? (
        <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
          {dados.consequencias} zero(s) desta lista são consequência de outro item e NÃO são tarefa de
          ninguém — resolver a causa resolve todos eles.
        </p>
      ) : null}

      {dados.primeiroPasso ? (
        <div className="cc6-panel-quiet mt-4 p-4">
          <p className="cc6-eyebrow text-micro!">COMECE POR AQUI</p>
          <p className="mt-1 text-corpo leading-5 text-[var(--atlas-texto-forte)]">
            {dados.primeiroPasso.titulo}
          </p>
          <p className="mt-1 text-rotulo leading-4 text-[var(--atlas-texto-medio)]">
            {dados.primeiroPasso.oQueFazer}
          </p>
        </div>
      ) : null}

      {dados.grupos.map((grupo) => {
        const itens = dados.itens.filter((i) => i.grupo === grupo);
        if (!itens.length) return null;
        return (
          <div key={grupo} className="mt-4">
            <p className="text-rotulo font-semibold text-[var(--atlas-texto-medio)]">
              {dados.dicionario.grupos[grupo]}
            </p>
            <ul className="mt-1 divide-y divide-[var(--atlas-border-subtle)]">
              {itens.map((i) => <Linha key={i.id} item={i} dicionario={dados.dicionario} />)}
            </ul>
          </div>
        );
      })}

      {dados.oQueDaParaFazerHoje.length ? (
        <div className="cc6-hairline mt-4 pt-4">
          <p className="cc6-eyebrow text-micro!">E ENQUANTO ISSO</p>
          <ul className="mt-2 space-y-1">
            {dados.oQueDaParaFazerHoje.map((o) => (
              <li key={o} className="text-rotulo leading-4 text-[var(--atlas-texto-medio)]">— {o}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
        Leitura apenas: esta lista consulta a Meta e o banco por GET/SELECT. Nada aqui publica, ativa
        ou gasta — o botão continua sendo do dono. Janela de conversão: {dados.janelaDias} dias.
      </p>
    </section>
  );
}
