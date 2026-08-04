"use client";

/**
 * O QUE FALTA PARA LIGAR A IA — a tela que se recusa a desenhar zero como calma.
 *
 * ── AS TRÊS DECISÕES VISUAIS QUE CARREGAM A REGRA ──────────────────────────
 *
 * 1. **Falha de leitura tem a MESMA altura de um bloqueio.** "Não medido" não
 *    é cinza discreto num canto: é uma linha inteira, com o motivo escrito. A
 *    hierarquia visual é onde uma tela honesta ainda consegue mentir — quem bate
 *    o olho lê o que é grande e vai embora, e um item não lido escondido embaixo
 *    faz o dono concluir que viu a lista toda.
 *
 * 2. **Consequência não usa a cor de pendência.** O zero das jornadas é
 *    verdadeiro e não é tarefa de ninguém. Pintá-lo de vermelho ao lado das
 *    causas produziria uma parede de urgências onde existem três.
 *
 * 3. **Nenhum item aparece sem "e enquanto isso?".** Toda linha bloqueada
 *    carrega o que continua possível sem ela. Uma lista que só diz "não dá"
 *    ensina a fechar a aba, e aí o painel deixa de ser lido justamente quando
 *    passa a ter notícia nova.
 *
 * ── O QUE ESTA TELA NUNCA FAZ ──────────────────────────────────────────────
 *
 * Nunca escreve um número sem antes conferir o estado. `null` não passa por
 * formatação: `textoDaMedida()` devolve "não medido — <motivo>" e nunca um
 * dígito. E o erro de rede não vira lista vazia — vira a frase que diz que a
 * lista NÃO pôde ser lida, que é a mentira mais cara possível aqui.
 *
 * ── ONDE MONTAR ────────────────────────────────────────────────────────────
 *
 *   import { ProntidaoParaLigarPanel } from "@/components/atlas/ProntidaoParaLigarPanel";
 *   <ProntidaoParaLigarPanel />
 *
 * A sugestão é uma tela de liderança. Esta entrega NÃO edita tela alguma:
 * `app/globals.css`, `app/(crm)/command-center/page.tsx` e
 * `components/atlas/SalaDeComandoPanel.tsx` estão em uso por outra frente
 * neste momento.
 */

import { useCallback, useEffect, useState } from "react";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import {
  EXPLICACAO_DO_ESTADO,
  EXPLICACAO_DO_GERAL,
  QUEM_RESOLVE,
  type EstadoDoItem,
  type EstadoGeral,
  type QuemResolve,
  type VereditoDeProntidao,
} from "@/lib/ai/prontidao-para-ligar";

type ConsentimentoInvisivel = {
  legivelPeloTrabalhador: number;
  declaradoNaEntrada: number;
  diferenca: number;
  frase: string;
} | null;

type Carga = {
  geradoEm: string;
  veredito: VereditoDeProntidao;
  contexto: {
    templatesDeQualquerStatus: { valor: number | null; comoFoiMedido: string; motivoSemMedida?: string };
    consentimentoInvisivel: ConsentimentoInvisivel;
    janelaDoProvedorEmDias: number;
  };
};

type Estado =
  | { fase: "carregando" }
  | { fase: "erro"; mensagem: string }
  | { fase: "pronto"; carga: Carga };

/** Um rótulo curto por estado. O texto longo mora em EXPLICACAO_DO_ESTADO. */
const ROTULO: Record<EstadoDoItem, string> = {
  pronto: "pronto",
  bloqueia: "bloqueia",
  consequencia: "consequência",
  nao_medido: "não medido",
};

const ROTULO_GERAL: Record<EstadoGeral, string> = {
  sem_leitura: "sem leitura",
  bloqueada: "bloqueada",
  incerta: "incerta",
  pronta: "pronta",
};

const QUEM_CURTO: Record<QuemResolve, string> = {
  dono: "o dono",
  operacao: "a operação",
  servidor: "quem opera o servidor",
  codigo: "código",
};

/**
 * O número, ou a confissão. Nunca as duas coisas, e nunca um dígito quando o
 * valor é `null` — é aqui que a tela pararia de ser honesta se alguém
 * escrevesse `valor ?? 0` para "não quebrar o layout".
 */
function textoDaMedida(medida: { valor: number | null; motivoSemMedida?: string }, unidade: string): string {
  if (medida.valor === null) return `não medido — ${medida.motivoSemMedida ?? "a leitura falhou"}`;
  return `${medida.valor} ${unidade}`;
}

export function ProntidaoParaLigarPanel() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  const carregar = useCallback(async () => {
    setEstado({ fase: "carregando" });
    try {
      const resposta = await fetch("/api/v1/ai/prontidao-para-ligar", { cache: "no-store" });
      const corpo = await resposta.json();
      if (!resposta.ok || !corpo?.ok) {
        // A mensagem do servidor é preservada porque ela distingue "não consegui
        // ler" de "não falta nada" — e as duas mandam o dono fazer coisas opostas.
        setEstado({
          fase: "erro",
          mensagem: corpo?.error?.message || "Não foi possível ler o que falta para ligar a IA.",
        });
        return;
      }
      setEstado({ fase: "pronto", carga: corpo.data as Carga });
    } catch {
      setEstado({
        fase: "erro",
        mensagem:
          "Não foi possível falar com o servidor. A lista NÃO está vazia e a IA NÃO está pronta — " +
          "esta tela apenas não conseguiu medir nada.",
      });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.fase === "carregando") {
    return (
      <AtlasCard>
        <AtlasCardHeader title="O que falta para ligar a IA" />
        <p className="text-sm opacity-80">Medindo cada item no banco…</p>
      </AtlasCard>
    );
  }

  if (estado.fase === "erro") {
    return (
      <AtlasCard>
        <AtlasCardHeader title="O que falta para ligar a IA" />
        <p className="text-sm font-semibold" data-estado="nao_medido">
          {estado.mensagem}
        </p>
        <p className="mt-2 text-sm opacity-80">{EXPLICACAO_DO_GERAL.sem_leitura}</p>
        <button type="button" className="mt-3 text-sm underline" onClick={() => void carregar()}>
          Tentar medir de novo
        </button>
      </AtlasCard>
    );
  }

  const { veredito, contexto, geradoEm } = estado.carga;
  const causas = veredito.itens.filter((item) => item.estado === "bloqueia");
  const naoLidos = veredito.itens.filter((item) => item.estado === "nao_medido");
  const sintomas = veredito.itens.filter((item) => item.estado === "consequencia");
  const prontos = veredito.itens.filter((item) => item.estado === "pronto");

  return (
    <AtlasCard>
      <AtlasCardHeader
        title="O que falta para ligar a IA"
        description={`Medido em ${new Date(geradoEm).toLocaleString("pt-BR")}`}
      />

      {/* O VEREDITO. A frase vem colada ao rótulo, no mesmo bloco: um rótulo
          sozinho ("bloqueada") não diz o que fazer, e um rótulo com a frase diz. */}
      <p className="text-base font-semibold" data-estado-geral={veredito.estado}>
        {ROTULO_GERAL[veredito.estado].toUpperCase()} — {veredito.frase}
      </p>
      <p className="mt-1 text-sm opacity-80">{EXPLICACAO_DO_GERAL[veredito.estado]}</p>

      {/* A FILA DE CADA CADEIRA. Só causas entram; sintoma não é tarefa de
          ninguém e inflar a fila do dono é como um painel perde a confiança. */}
      {causas.length > 0 && (
        <p className="mt-3 text-sm">
          Na mão de quem:{" "}
          {(Object.keys(veredito.porQuemResolve) as QuemResolve[])
            .filter((quem) => veredito.porQuemResolve[quem] > 0)
            .map((quem) => `${QUEM_CURTO[quem]} (${veredito.porQuemResolve[quem]})`)
            .join(" · ")}
        </p>
      )}

      {/* ── AS CAUSAS ─────────────────────────────────────────────────────── */}
      {causas.map((item) => (
        <div key={item.id} className="mt-4 border-t pt-3" data-estado="bloqueia">
          <p className="text-sm font-semibold">
            {item.titulo} — {ROTULO.bloqueia.toUpperCase()}
          </p>
          <p className="mt-1 text-sm">
            Estado medido: <strong>{textoDaMedida(item.medida, item.unidade)}</strong>{" "}
            <span className="opacity-70">({item.medida.comoFoiMedido})</span>
          </p>
          <p className="mt-1 text-sm">
            Quem resolve: <strong>{QUEM_RESOLVE[item.quemResolve]}</strong>
          </p>
          <p className="mt-1 text-sm">{item.oQueFazer}</p>
          <p className="mt-1 text-sm opacity-80">Sem ele, ainda dá para: {item.semEleDaPara}</p>
        </div>
      ))}

      {/* ── O QUE NÃO FOI LIDO — mesma altura, mesma fonte, nunca rodapé ──── */}
      {naoLidos.map((item) => (
        <div key={item.id} className="mt-4 border-t pt-3" data-estado="nao_medido">
          <p className="text-sm font-semibold">
            {item.titulo} — {ROTULO.nao_medido.toUpperCase()}
          </p>
          <p className="mt-1 text-sm">
            <strong>{textoDaMedida(item.medida, item.unidade)}</strong>
          </p>
          <p className="mt-1 text-sm opacity-80">{EXPLICACAO_DO_ESTADO.nao_medido}</p>
        </div>
      ))}

      {/* ── OS SINTOMAS — presentes, explicados, e sem cor de urgência ────── */}
      {sintomas.map((item) => (
        <div key={item.id} className="mt-4 border-t pt-3" data-estado="consequencia">
          <p className="text-sm font-semibold">
            {item.titulo} — {ROTULO.consequencia.toUpperCase()}
          </p>
          {/* A frase do módulo já traz os TÍTULOS dos antecedentes; os ids ficam
              em `bloqueadoPor` para quem consome o JSON, e não vão para a tela. */}
          <p className="mt-1 text-sm">{item.frase}</p>
          <p className="mt-1 text-sm opacity-80">{EXPLICACAO_DO_ESTADO.consequencia}</p>
        </div>
      ))}

      {/* ── O QUE JÁ ESTÁ PRONTO ──────────────────────────────────────────── */}
      {prontos.map((item) => (
        <div key={item.id} className="mt-4 border-t pt-3" data-estado="pronto">
          <p className="text-sm font-semibold">
            {item.titulo} — {ROTULO.pronto.toUpperCase()}
          </p>
          <p className="mt-1 text-sm">
            Estado medido: <strong>{textoDaMedida(item.medida, item.unidade)}</strong>{" "}
            <span className="opacity-70">({item.medida.comoFoiMedido})</span>
          </p>
        </div>
      ))}

      {/* ── O CONTRASTE DO CONSENTIMENTO ──────────────────────────────────
          Aparece só quando existe diferença medida. É a frase que impede o
          painel de mandar a operação coletar de novo o que já está coletado. */}
      {contexto.consentimentoInvisivel && (
        <div className="mt-4 border-t pt-3" data-estado="bloqueia">
          <p className="text-sm font-semibold">Consentimento coletado que o motor não enxerga</p>
          <p className="mt-1 text-sm">{contexto.consentimentoInvisivel.frase}</p>
        </div>
      )}

      {/* Zero templates em QUALQUER status distingue "ninguém submeteu" de
          "está na fila da Meta" — e são duas esperas muito diferentes. */}
      {contexto.templatesDeQualquerStatus.valor === 0 && (
        <p className="mt-4 border-t pt-3 text-sm">
          Nenhum template foi submetido à Meta em nenhum status. Não há nada na fila de aprovação
          esperando — a espera ainda não começou.
        </p>
      )}

      {/* ── E ENQUANTO ISSO ───────────────────────────────────────────────── */}
      {veredito.oQueDaParaFazerHoje.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="text-sm font-semibold">O que já dá para fazer hoje</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {veredito.oQueDaParaFazerHoje.map((saida) => (
              <li key={saida}>{saida}</li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="mt-4 text-sm underline" onClick={() => void carregar()}>
        Medir de novo
      </button>
    </AtlasCard>
  );
}
