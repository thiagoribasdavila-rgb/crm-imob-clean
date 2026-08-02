"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IaAutonomaRobo } from "@/components/ia-autonoma-robo";
import { supabase } from "@/lib/supabase";

/**
 * A PÁGINA QUE INVENTAVA 55%.
 *
 * ── O defeito, medido em 02/08/2026 ───────────────────────────────────────
 *
 * A versão anterior calculava a prontidão da plataforma assim:
 *
 *     const active = Object.values(metrics).filter(v => v > 0).length;
 *     return Math.min(100, 55 + active * 5);
 *
 * As oito tabelas do Atlas 2030 estão TODAS em zero linha no banco canônico
 * (`atlas_entities`, `atlas_relationships`, `atlas_memories`,
 * `atlas_recommendations`, `atlas_simulations`, `atlas_launch_rooms`,
 * `atlas_inventory_reservations`, `atlas_data_products`). Com `active = 0` a
 * conta devolvia **55%** — e a página desenhava uma barra mais que meio cheia
 * sobre evidência nenhuma. Os 55 não vinham de lugar algum: não são medida,
 * não são meta declarada, não têm origem rastreável. É número inventado.
 *
 * Trocado por uma fração que EXISTE: quantos dos oito repositórios têm ao menos
 * uma linha. Hoje, honestamente, 0 de 8.
 *
 * ── O segundo defeito, na mesma tela ──────────────────────────────────────
 *
 * O `useEffect` gravava `count ?? 0` mesmo quando a consulta falhava, e o erro
 * virava um aviso discreto no topo enquanto os oito cartões exibiam "0". Falha
 * de leitura desenhada como zero é a classe de defeito que este repositório já
 * catalogou. Agora cada contagem é `number | null`, e `null` se escreve na tela
 * como "não lido" — jamais como zero.
 */

/** `null` = não consegui contar. `0` = contei e não havia nenhuma. */
type Contagem = number | null;

type Repositorio = {
  tabela: string;
  titulo: string;
  oQueGuarda: string;
  contagem: Contagem;
  unidade: string;
  /**
   * O motivo devolvido pelo banco quando a contagem falhou.
   *
   * A versão anterior desta página mostrava o erro num aviso âmbar no topo
   * ("Aplique as migrations Atlas 2030…: {mensagem}"). A reescrita de 02/08/2026
   * trocou o zero mentiroso por "não lido" — acerto —, mas jogou fora a
   * mensagem junto, e a tela passou a AFIRMAR "a leitura foi negada" a partir de
   * uma evidência que só diz "houve erro". Negação é uma causa entre várias
   * (tabela ausente, rede, tempo esgotado). Guardar o motivo devolve o que a
   * página perdeu e faz a frase parar de afirmar o que não mediu.
   */
  erro: string | null;
};

const REPOSITORIOS = [
  { tabela: "atlas_entities", titulo: "Grafo de conhecimento", oQueGuarda: "Entidades do ecossistema imobiliário e como elas se ligam.", unidade: "entidades" },
  { tabela: "atlas_relationships", titulo: "Relações do grafo", oQueGuarda: "As arestas entre empreendimento, comprador, campanha e unidade.", unidade: "relações" },
  { tabela: "atlas_memories", titulo: "Memória institucional", oQueGuarda: "O que a operação aprendeu e não pode depender de quem estava na sala.", unidade: "memórias" },
  { tabela: "atlas_recommendations", titulo: "Motor de recomendação", oQueGuarda: "Recomendações explicáveis para comprador, estoque e campanha.", unidade: "recomendações" },
  { tabela: "atlas_simulations", titulo: "Motor de simulação", oQueGuarda: "Cenários de preço, verba, estoque, atraso e VGV.", unidade: "simulações" },
  { tabela: "atlas_launch_rooms", titulo: "Salas de lançamento", oQueGuarda: "Distribuição de unidades no dia do lançamento.", unidade: "salas" },
  { tabela: "atlas_inventory_reservations", titulo: "Reservas de estoque", oQueGuarda: "Unidade travada para um comprador, com prazo.", unidade: "reservas" },
  { tabela: "atlas_data_products", titulo: "Produtos de dados", oQueGuarda: "Contratos versionados para parceiros e incorporadoras.", unidade: "contratos" },
] as const;

/**
 * O motivo, com as palavras do banco — e silêncio quando ele não deu palavra
 * nenhuma. A contagem aqui é `head: true`, ou seja, uma requisição HEAD: a
 * resposta de recusa vem SEM CORPO, então nem sempre há mensagem para exibir.
 * Nesse caso a tela não inventa uma causa; continua só em "não lido".
 */
const motivoDoErro = (erro: { message?: string; details?: string; hint?: string; code?: string } | null): string | null => {
  if (!erro) return null;
  const partes = [erro.message, erro.details, erro.hint, erro.code].filter((parte): parte is string => Boolean(parte && parte.trim()));
  return partes.length ? partes.join(" · ") : null;
};

export default function Atlas2030Page() {
  const [repositorios, setRepositorios] = useState<Repositorio[]>(
    REPOSITORIOS.map((item) => ({ ...item, contagem: null, erro: null })),
  );
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const resultados = await Promise.all(
        REPOSITORIOS.map((item) => supabase.from(item.tabela).select("id", { count: "exact", head: true })),
      );
      if (!ativo) return;
      // Erro → `null`. Antes era `count ?? 0`, e a consulta que falhava entrava
      // no mesmo cartão da tabela genuinamente vazia.
      setRepositorios(
        REPOSITORIOS.map((item, indice) => ({
          ...item,
          contagem: resultados[indice].error ? null : (resultados[indice].count ?? 0),
          erro: motivoDoErro(resultados[indice].error),
        })),
      );
      setCarregando(false);
    }
    void carregar();
    return () => {
      ativo = false;
    };
  }, []);

  const lidos = repositorios.filter((item) => item.contagem !== null);
  const comDado = lidos.filter((item) => (item.contagem ?? 0) > 0).length;
  const naoLidos = repositorios.length - lidos.length;
  const motivoDaFalha = repositorios.find((item) => item.erro)?.erro ?? null;

  return (
    <div className="space-y-4 pb-10">
      <header className="cc6-panel cc6-reveal p-5 sm:p-7">
        <p className="cc6-eyebrow">Atlas AI OS 2030 · camada de plataforma</p>
        <h1
          className="mt-3 max-w-[26ch] font-semibold tracking-[-.03em] text-[var(--atlas-texto-forte)]"
          // A cascata do globals.css é inteiramente sem camada e vence as
          // utilities do Tailwind; o degrau de herói vai no style para pintar.
          style={{ fontSize: "var(--text-heroi)", lineHeight: 1.1 }}
        >
          A infraestrutura dos lançamentos, quando ela existir.
        </h1>
        <p className="mt-4 max-w-[72ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          Grafo, memória, recomendação, simulação, lançamento e produtos de dados são a camada projetada para as
          incorporadoras. Abaixo está quanto dela tem dado hoje — sem arredondar para cima.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/atlas-v3" className="cc6-chip cc6-interativo">
            Intelligence Layer
          </Link>
          <Link href="/atlas-v3/developer" className="cc6-chip cc6-interativo">
            Portal da incorporadora
          </Link>
          <Link href="/atlas-v3/scenarios" className="cc6-chip cc6-interativo-acento">
            Executar simulação
          </Link>
        </div>
      </header>

      {/* Sem barra de percentual: a versão anterior desenhava 55% sobre zero
          evidência. Uma fração de repositórios COM dado é medida — e quando a
          leitura falha ela sai da conta em vez de contar como vazio. */}
      <section className="cc6-panel cc6-reveal p-5" aria-label="Prontidão medida da plataforma">
        <p className="cc6-eyebrow">Prontidão medida</p>
        <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-5">
          <div>
            {/* "0 de 0" seria aritmeticamente verdadeiro e lido como "medi e não
                achei nada". Quando NENHUM repositório respondeu não há fração a
                mostrar — medido em 02/08/2026, os oito recusam a leitura pela
                cerca do usuário e a página inteira cai neste caso. */}
            <p className="cc6-metric-value leading-none" style={{ fontSize: "var(--text-heroi)" }}>
              {carregando ? "—" : lidos.length === 0 ? "não lido" : `${comDado} de ${lidos.length}`}
            </p>
            <p className="mt-2 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
              {lidos.length === 0 && !carregando ? "nenhum repositório respondeu" : "repositórios com ao menos uma linha"}
            </p>
          </div>
          {naoLidos > 0 ? (
            <div>
              <p className="cc6-metric-value cc6-warn leading-none" style={{ fontSize: "var(--text-numero)" }}>
                {naoLidos}
              </p>
              <p className="mt-2 text-rotulo uppercase tracking-[.22em] text-[var(--atlas-texto-fraco)]">
                não lidos — fora da conta
              </p>
            </div>
          ) : null}
        </div>
        <p className="mt-4 max-w-[74ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          {carregando
            ? "Contando as linhas de cada repositório."
            : lidos.length === 0
              ? `Nenhum dos ${repositorios.length} repositórios respondeu à consulta — a leitura falhou, não veio vazia. Não afirmo que a camada está vazia, porque não consegui olhar. E não desenho zero no lugar, porque zero seria uma afirmação que eu não posso fazer.`
              : comDado === 0
                ? "Nenhum repositório recebeu dado ainda. A camada está aplicada no banco e nunca foi alimentada — não há percentual de prontidão a exibir, porque não há nada medido para sustentá-lo."
                : `${comDado} de ${lidos.length} repositórios têm dado. Os demais estão criados e vazios.`}
        </p>
        {/* O motivo, com as palavras do banco. Restaurado em 02/08/2026: a
            reescrita tinha descartado `error.message` e, sem ele, "não lido" é
            um beco sem saída para quem precisa consertar — a página dizia QUE
            falhou e nunca POR QUE. Medido hoje, as oito tabelas `atlas_*` não
            têm GRANT de SELECT para `authenticated` (só `postgres` e
            `service_role`), e é essa frase que o banco devolve. */}
        {!carregando && motivoDaFalha ? (
          <p className="mt-2 max-w-[74ch] text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
            O banco devolveu: “{motivoDaFalha}”.
          </p>
        ) : null}
      </section>

      {/* A IA desta plataforma é a mesma do CRM. Se ela está parada, dizer isso
          aqui evita que a página de plataforma pareça mais viva que o produto. */}
      <section aria-label="Estado da inteligência artificial">
        <IaAutonomaRobo compacto />
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Repositórios da plataforma">
        {repositorios.map((item) => (
          <article key={item.tabela} className="cc6-panel p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-corpo font-semibold text-[var(--atlas-texto-forte)]">{item.titulo}</h2>
              <span className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]">{item.unidade}</span>
            </div>
            <p
              className={`cc6-metric-value mt-3 leading-none ${item.contagem === null && !carregando ? "cc6-warn" : ""}`}
              style={{ fontSize: "var(--text-numero)" }}
            >
              {carregando ? "—" : item.contagem === null ? "não lido" : item.contagem}
            </p>
            <p className="mt-3 text-corpo leading-5 text-[var(--atlas-texto-medio)]">{item.oQueGuarda}</p>
            {!carregando && item.contagem === 0 ? (
              <p className="mt-2 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                Tabela criada e nunca alimentada.
              </p>
            ) : null}
          </article>
        ))}
      </section>

      {/* RESTAURADO em 02/08/2026. A reescrita que matou os 55% levou junto o
          cartão "Developer-first platform", que não tinha defeito nenhum: ele é
          a única frase da plataforma que responde COMO integrar sem reescrever o
          núcleo. Perda de conteúdo não declarada é regressão mesmo quando o
          resto da reescrita está certo — e este parágrafo não é medida, é a
          promessa de contrato, então ele não disputa espaço com os números. */}
      <section className="cc6-panel p-5" aria-label="Plataforma para quem integra">
        <p className="cc6-eyebrow">Developer-first</p>
        <h2 className="mt-1 text-corpo font-semibold text-[var(--atlas-texto-forte)]">
          Integração sem reconstruir o núcleo
        </h2>
        <p className="mt-2 max-w-[74ch] text-corpo leading-6 text-[var(--atlas-texto-medio)]">
          APIs governadas, eventos versionados, contratos de dados, idempotência e isolamento multiempresa permitem
          conectar ERPs, portais, construtoras, bancos, Meta, WhatsApp e parceiros.
        </p>
      </section>

      <p className="cc6-panel px-5 py-3 text-rotulo leading-5 text-[var(--atlas-texto-fraco)]">
        Cada número acima é uma contagem exata da tabela homônima no banco, lida pela cerca da sua organização. Nenhum
        índice composto, nenhuma média, nenhum percentual derivado.
      </p>
    </div>
  );
}
