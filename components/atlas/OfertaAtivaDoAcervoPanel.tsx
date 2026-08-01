"use client";

/**
 * O "CAMPO DE OFERTA ATIVA" — o corretor se serve do acervo de resgate.
 *
 * ── O QUE ESTA TELA TEM DE DIZER ANTES DO CLIQUE ────────────────────────────
 *
 * Que ISTO NÃO É LEAD QUENTE. Medido no pool de hoje: 13 leads, 8 em `perdido`,
 * qualidade de cadastro `critical` (35%) ou `incomplete` (45%) em 13/13 —
 * nenhuma `usable` — e ZERO com consentimento registrado (13 `nao_perguntado`).
 * Não existe nenhum opt-out registrado na base (`lead_contact_preferences` e
 * `messaging_suppressions` têm 0 linhas), e ausência de "não" não é "sim".
 *
 * Se a tela não disser isso, o corretor pega 10 e descobre sozinho — e a feature
 * vira armadilha. Por isso o bloqueio aqui é FRASE, nunca botão cinza: ele
 * precisa saber POR QUE não pode, e o que fazer para poder.
 *
 * ── POR QUE A PRÉVIA NÃO MOSTRA NOME NEM TELEFONE ───────────────────────────
 *
 * Mesma régua que a fila da liderança já estabeleceu (`unassignedPolicy`:
 * `metadataOnly: true, piiExposed: false`). Antes do claim a lead não é de
 * ninguém; mostrar o dado da pessoa a quem ainda não a assumiu é vazamento com
 * cara de conveniência. Depois do claim, a lead está na carteira dele e a lista
 * mostra tudo.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type PreviaItem = {
  status: string;
  temTelefone: boolean;
  temEmail: boolean;
  consentimento: string;
  corretorLegado: string | null;
  qualidade: string;
  qualidadePercent: number;
  criadoEm: string;
};

type Oferta = {
  papel: string | null;
  disponivel: number;
  semToque: number;
  lotesHoje: number;
  tetoDeCarteira: number | null;
  carteiraTotal: number | null;
  prazoMinutos: number;
  previa: PreviaItem[];
  resumo: { comTelefone?: number; comEmail?: number; semConsentimento?: number; emStatusFechado?: number };
  veredito: { pode: boolean; motivo: string | null; frase: string; lote: number };
  contador: string;
  canal: { frase: string; disparoEmMassaBloqueado: boolean; caminho: string };
  regras: { lote: number; limiteSemToque: number; lotesPorDia: number; prazoResgateMinutos: number };
  vazio: { acervoEsgotado: boolean; voceJaPegouSeuLote: boolean };
};

type Estado =
  | { tipo: "carregando" }
  | { tipo: "indisponivel"; motivo: string }
  | { tipo: "pronta"; oferta: Oferta };

const QUALIDADE_ROTULO: Record<string, string> = {
  critical: "cadastro crítico",
  incomplete: "cadastro incompleto",
  usable: "cadastro utilizável",
  complete: "cadastro completo",
};

const CONSENTIMENTO_ROTULO: Record<string, string> = {
  concedido: "consentimento concedido",
  negado: "consentimento NEGADO",
  nao_perguntado: "consentimento não perguntado",
};

async function cabecalhos(): Promise<Record<string, string> | null> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : null;
}

const horas = (minutos: number) => (minutos % 60 === 0 ? `${minutos / 60}h` : `${minutos} min`);

export function OfertaAtivaDoAcervoPanel() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [pegando, setPegando] = useState(false);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    try {
      const cab = await cabecalhos();
      if (!cab) {
        setEstado({ tipo: "indisponivel", motivo: "Sessão necessária." });
        return;
      }
      const res = await fetch("/api/v1/crm/acervo", { headers: cab, cache: "no-store" });
      const corpo = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: Oferta; error?: { message?: string } }
        | null;
      if (!res.ok || !corpo?.ok || !corpo.data) {
        setEstado({ tipo: "indisponivel", motivo: corpo?.error?.message ?? "Oferta ativa indisponível." });
        return;
      }
      setEstado({ tipo: "pronta", oferta: corpo.data });
    } catch {
      setEstado({ tipo: "indisponivel", motivo: "Falha ao carregar a oferta ativa." });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const pegar = useCallback(async () => {
    setPegando(true);
    setAviso("");
    try {
      const cab = await cabecalhos();
      if (!cab) {
        setAviso("Sessão necessária.");
        return;
      }
      const res = await fetch("/api/v1/crm/acervo", {
        method: "POST",
        headers: { ...cab, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pegar" }),
      });
      const corpo = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { pegos?: number }; error?: { message?: string } }
        | null;
      if (res.ok && corpo?.ok) {
        const pegos = Number(corpo.data?.pegos ?? 0);
        setAviso(`✓ ${pegos} ${pegos === 1 ? "lead" : "leads"} na sua carteira. O relógio de primeiro contato começou agora.`);
        await carregar();
        // Levar para a lista já recortada: sem isso o corretor pega 10 leads e
        // fica olhando o painel, sem saber onde elas foram parar.
        router.push("/leads?acervo=1");
        return;
      }
      // A recusa vem com FRASE do servidor, e a frase explica o que fazer.
      setAviso(corpo?.error?.message ?? "Não foi possível pegar o lote agora.");
      await carregar();
    } catch {
      setAviso("Falha ao pegar o lote.");
    } finally {
      setPegando(false);
    }
  }, [carregar, router]);

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="◇ Oferta ativa · acervo de resgate"
        title="Pegar leads do acervo para a sua base"
        description="Lista HISTÓRICA da imobiliária: estas pessoas já falaram com a empresa e não compraram. Não pediram contato agora — pegar é assumir o resgate."
        action={
          <Link
            href="/leads?acervo=1"
            className="rounded-[8px] border border-[rgba(148,163,184,0.18)] px-3 py-1.5 font-mono text-rotulo uppercase tracking-[0.14em] text-[#8b97ab] transition-colors hover:border-[rgba(75,141,248,0.5)] hover:text-[#4b8df8]"
          >
            Meu acervo →
          </Link>
        }
      />
      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {estado.tipo === "carregando" ? (
          <div className="h-28 animate-pulse rounded-[12px] bg-[rgba(148,163,184,0.06)]" aria-hidden="true" />
        ) : estado.tipo === "indisponivel" ? (
          <p className="text-sm leading-6 text-[#8b97ab]">{estado.motivo}</p>
        ) : (
          <>
            {/* OS NÚMEROS, SEMPRE VISÍVEIS — a trava nunca pode ser surpresa. */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="min-w-0">
                <dt className="text-rotulo text-slate-500">Acervo disponível</dt>
                <dd className="mt-0.5 font-mono text-xl text-[var(--atlas-texto-forte)] [font-variant-numeric:tabular-nums]">
                  {estado.oferta.disponivel}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-rotulo text-slate-500">Suas de resgate sem 1º contato</dt>
                <dd
                  className={`mt-0.5 font-mono text-xl [font-variant-numeric:tabular-nums] ${
                    estado.oferta.semToque >= estado.oferta.regras.limiteSemToque ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-forte)]"
                  }`}
                >
                  {estado.oferta.semToque} <span className="text-sm text-[var(--atlas-texto-fraco)]">de {estado.oferta.regras.limiteSemToque - 1}</span>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-rotulo text-slate-500">Lotes hoje</dt>
                <dd className="mt-0.5 font-mono text-xl text-[var(--atlas-texto-forte)] [font-variant-numeric:tabular-nums]">
                  {estado.oferta.lotesHoje} <span className="text-sm text-[var(--atlas-texto-fraco)]">de {estado.oferta.regras.lotesPorDia}</span>
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-rotulo text-slate-500">Prazo que você assume</dt>
                <dd className="mt-0.5 font-mono text-xl text-[var(--atlas-texto-forte)]">{horas(estado.oferta.prazoMinutos)}</dd>
              </div>
            </dl>

            {/* A FRASE DE CANAL. Sem ela o corretor pega 10 e descobre sozinho
                que não pode disparar mensagem para ninguém. */}
            <p
              className={`rounded-[10px] border px-3 py-2 text-xs leading-5 ${
                estado.oferta.canal.disparoEmMassaBloqueado
                  ? "border-[rgba(201,138,43,0.35)] bg-[rgba(201,138,43,0.06)] text-[#d8a44a]"
                  : "border-[rgba(148,163,184,0.14)] bg-[rgba(148,163,184,0.04)] text-[#c3ccdb]"
              }`}
            >
              {estado.oferta.canal.frase}
            </p>

            {/* A PRÉVIA — o que o próximo lote traz, sem PII. */}
            {estado.oferta.previa.length ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-rotulo uppercase tracking-[0.14em] text-[var(--atlas-texto-fraco)]">
                  O que o próximo lote traz ({estado.oferta.previa.length})
                </p>
                <ul className="flex flex-col gap-1.5">
                  {estado.oferta.previa.map((item, indice) => (
                    <li
                      key={`${item.criadoEm}-${indice}`}
                      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[rgba(148,163,184,0.08)] px-3 py-2 text-rotulo text-[var(--atlas-texto-medio)]"
                    >
                      <span className="font-mono uppercase tracking-[0.1em] text-[#78a6f9]">{item.status}</span>
                      <span>{item.temTelefone ? "telefone" : "sem telefone"}</span>
                      <span>{item.temEmail ? "e-mail" : "sem e-mail"}</span>
                      <span className={item.consentimento === "concedido" ? "text-[var(--atlas-estado-sucesso)]" : "text-[#d8a44a]"}>
                        {CONSENTIMENTO_ROTULO[item.consentimento] ?? item.consentimento}
                      </span>
                      <span>
                        {QUALIDADE_ROTULO[item.qualidade] ?? item.qualidade} ({item.qualidadePercent}%)
                      </span>
                      {item.corretorLegado ? (
                        <span className="text-[#8b97ab]">já trabalhada por {item.corretorLegado}</span>
                      ) : null}
                      <span className="text-[var(--atlas-texto-fraco)]">
                        entrou em {new Date(item.criadoEm).toLocaleDateString("pt-BR")}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {aviso ? (
              <p className="rounded-[10px] border border-[rgba(148,163,184,0.14)] bg-[rgba(148,163,184,0.04)] px-3 py-2 text-sm text-[#c3ccdb]">
                {aviso}
              </p>
            ) : null}

            {/* ── O BOTÃO, OU A FRASE QUE EXPLICA ────────────────────────────
                Estado vazio HONESTO: "acervo esgotado" e "você já pegou seu
                lote" são problemas diferentes, com donos diferentes. */}
            {estado.oferta.veredito.pode ? (
              <button
                type="button"
                onClick={() => void pegar()}
                disabled={pegando}
                className="rounded-[8px] border border-[rgba(75,141,248,0.4)] px-4 py-2.5 text-sm font-medium text-[#78a6f9] transition-colors hover:bg-[rgba(75,141,248,0.1)] disabled:opacity-50"
              >
                {pegando ? "Pegando…" : `Pegar ${estado.oferta.veredito.lote} ${estado.oferta.veredito.lote === 1 ? "lead" : "leads"} do acervo`}
              </button>
            ) : (
              <div className="flex flex-col gap-1.5 rounded-[10px] border border-[rgba(148,163,184,0.14)] bg-[rgba(148,163,184,0.04)] px-3 py-2.5">
                <p className="text-sm leading-6 text-[#c3ccdb]">{estado.oferta.veredito.frase}</p>
                {estado.oferta.vazio.acervoEsgotado ? (
                  <p className="text-rotulo text-[var(--atlas-texto-fraco)]">
                    Acervo esgotado: não há lead histórica sem dono agora. Quando a próxima onda de importação entrar, ela aparece aqui.
                  </p>
                ) : estado.oferta.vazio.voceJaPegouSeuLote ? (
                  <p className="text-rotulo text-[var(--atlas-texto-fraco)]">
                    O acervo tem {estado.oferta.disponivel} leads esperando — a trava é sua, não do acervo. Registre o primeiro contato
                    (ligação, e-mail, WhatsApp) ou descarte com motivo para liberar o próximo lote.
                  </p>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>
    </AtlasCard>
  );
}
