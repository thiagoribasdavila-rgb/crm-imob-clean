"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * REGISTRO DE PRIMEIRO CONTATO EM 1 CLIQUE.
 *
 * A regra que define este componente: se registrar contato custar mais de 5
 * segundos, ninguém registra — e a métrica de tempo de resposta morre de novo,
 * exatamente como morreu antes (210 leads ativas, 0 contatos registrados).
 *
 * Por isso: sem modal, sem formulário, sem campo obrigatório. Três botões que
 * cobrem o que de fato acontece na mesa do corretor — falei por telefone, falei
 * por WhatsApp, tentei e não atendeu. Observação é opcional e vem depois.
 *
 * O componente não fala com a API direto: recebe `onRegister` da página, que já
 * carrega a sessão autenticada. Mesmo padrão de LeadContextCorrection.
 */

export type FirstContactSla = {
  mensuravel: boolean;
  prazo: string | null;
  contatadoEm: string | null;
  minutosDePrazo: number | null;
  minutosDeResposta: number | null;
  dentroDoPrazo: boolean | null;
};

export type FirstContactRegistration = {
  canal: "call" | "whatsapp";
  resultado: "falou" | "sem_resposta";
};

export type FirstContactResult = {
  primeiroContato: boolean;
  medicao: { minutosDeResposta: number | null; dentroDoSla: boolean | null } | null;
  aviso: string | null;
};

type Props = {
  sla: FirstContactSla;
  onRegister: (input: FirstContactRegistration) => Promise<FirstContactResult>;
};

const BOTOES: Array<{ chave: string; rotulo: string; icone: string; input: FirstContactRegistration }> = [
  { chave: "ligou", rotulo: "Falei por telefone", icone: "◌", input: { canal: "call", resultado: "falou" } },
  { chave: "whatsapp", rotulo: "Falei por WhatsApp", icone: "↗", input: { canal: "whatsapp", resultado: "falou" } },
  { chave: "sem-resposta", rotulo: "Tentei, sem resposta", icone: "–", input: { canal: "call", resultado: "sem_resposta" } },
];

function minutosEmTexto(minutos: number) {
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h${String(minutos % 60).padStart(2, "0")}`;
  return `${Math.floor(horas / 24)}d`;
}

export function FirstContactQuickLog({ sla, onRegister }: Props) {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<FirstContactResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // O prazo é um relógio: precisa andar sozinho na tela, senão o corretor lê um
  // "vence em 4 min" congelado de meia hora atrás.
  const [agora, setAgora] = useState<number | null>(null);

  useEffect(() => {
    setAgora(Date.now());
    const timer = setInterval(() => setAgora(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const contatado = Boolean(sla.contatadoEm) || Boolean(resultado);
  const prazo = useMemo(() => (sla.prazo ? Date.parse(sla.prazo) : NaN), [sla.prazo]);

  const relogio = useMemo(() => {
    if (contatado || agora === null || !Number.isFinite(prazo)) return null;
    const minutos = Math.round((prazo - agora) / 60_000);
    if (minutos >= 0) return { vencido: false, texto: `vence em ${minutosEmTexto(minutos)}` };
    return { vencido: true, texto: `vencido há ${minutosEmTexto(Math.abs(minutos))}` };
  }, [agora, contatado, prazo]);

  async function registrar(botao: (typeof BOTOES)[number]) {
    if (enviando) return;
    setEnviando(botao.chave);
    setErro(null);
    try {
      setResultado(await onRegister(botao.input));
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível registrar o contato.");
    } finally {
      setEnviando(null);
    }
  }

  // Medição consolidada: a que voltou do registro agora, ou a que já estava na
  // ficha. Nunca inventar zero quando não há medida.
  const medidos = resultado?.medicao?.minutosDeResposta ?? sla.minutosDeResposta;
  const dentroDoPrazo = resultado?.medicao?.dentroDoSla ?? sla.dentroDoPrazo;

  return (
    <div className="atlas-first-contact" data-vencido={relogio?.vencido ? "true" : undefined}>
      <div className="atlas-first-contact-head">
        <span>{contatado ? "Primeiro contato" : "Primeiro contato pendente"}</span>
        <strong>
          {contatado
            ? typeof medidos === "number"
              ? `respondido em ${minutosEmTexto(medidos)}${dentroDoPrazo === null ? "" : dentroDoPrazo ? " · dentro do prazo" : " · fora do prazo"}`
              : "registrado"
            : relogio
              ? relogio.texto
              : sla.mensuravel
                ? "sem prazo definido"
                : "medição indisponível neste banco"}
        </strong>
        {!contatado && sla.minutosDePrazo ? <small>prazo de {sla.minutosDePrazo} min para esta origem</small> : null}
      </div>

      <div className="atlas-first-contact-actions" role="group" aria-label="Registrar contato">
        {BOTOES.map((botao) => (
          <button
            key={botao.chave}
            type="button"
            onClick={() => void registrar(botao)}
            disabled={Boolean(enviando)}
            data-carregando={enviando === botao.chave ? "true" : undefined}
            title={contatado ? `${botao.rotulo} (recontato)` : botao.rotulo}
          >
            <span aria-hidden="true">{botao.icone}</span>
            {enviando === botao.chave ? "Registrando…" : botao.rotulo}
          </button>
        ))}
      </div>

      {erro ? (
        <p className="atlas-first-contact-note" role="alert">
          {erro}
        </p>
      ) : resultado?.aviso ? (
        <p className="atlas-first-contact-note" role="status">
          {resultado.aviso}
        </p>
      ) : null}
    </div>
  );
}
