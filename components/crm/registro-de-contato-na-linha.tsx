"use client";

import { useId, useState } from "react";
import {
  DESFECHOS_PRIMARIOS,
  DESFECHOS_SECUNDARIOS,
  estadoDaLinha,
  type Desfecho,
  type RegistroDeContato,
} from "./registro-de-contato-desfechos";

/**
 * REGISTRAR O CONTATO NA LINHA DA LEAD — onde o corretor de fato está.
 *
 * ── O que estava errado ─────────────────────────────────────────────────────
 *
 * A rota existia, o componente de 1 clique existia, e os dois estavam montados
 * só na FICHA. Para marcar "liguei e não atenderam" o corretor tinha de abrir
 * a lead, registrar, voltar, achar de novo onde estava na rolagem — trinta
 * vezes por dia. Ele não faz. O resultado medido é 4,5% da base com primeiro
 * contato e ZERO atividades de contato em 481 atividades.
 *
 * ── As quatro decisões que este componente toma ─────────────────────────────
 *
 * **1. Um toque, não dois.** Os desfechos da ligação ficam na tela sem nenhum
 * gesto anterior. Um botão "registrar" que abre outra coisa já é o custo que
 * matou a métrica — só que menor. Menor não basta: o gesto tem de caber entre
 * desligar o telefone e olhar a próxima lead.
 *
 * **2. O desfecho é obrigatório, e vem no mesmo toque.** Não existe botão
 * "liguei". Existe "Falei" e existe "Não atendeu" — cada botão carrega o par
 * (canal, resultado) fechado. "Liguei" sem desfecho encheria `activities` de
 * linhas que não respondem à única pergunta que a operação faz: adiantou?
 *
 * **3. Otimista COM reversão visível.** A linha muda na hora — senão o corretor
 * duvida se pegou e toca de novo. Mas se a rota recusar, a linha VOLTA ao
 * estado anterior e diz que falhou, em `role="alert"`. Falha silenciosa aqui é
 * pior do que não ter o botão: o corretor jura que registrou, o banco não tem
 * a linha, e a próxima auditoria conclui de novo que ninguém liga para lead.
 * A reversão mora na página, que é dona da lista; o aviso mora aqui.
 *
 * **4. Sem modal, sem navegação, sem recarga.** A página faz patch otimista no
 * item, não `reloadKey` — refazer a consulta jogaria a rolagem para o topo e
 * mudaria a ordem debaixo do dedo de quem está trabalhando a fila.
 *
 * ── O alvo de toque ─────────────────────────────────────────────────────────
 *
 * 44px de altura declarados em `style`, não em utilitário. `app/globals.css` é
 * inteiramente sem camada e uma regra sem camada vence `@layer utilities` —
 * utilitário aplicado direto num `<button>` já foi letra morta nesta mesma
 * tela (os segmentos de "Vínculo" pediam 11px e renderizavam 16). O tamanho de
 * texto, pelo mesmo motivo, vai nos `<span>` de dentro e não no botão.
 */

type Props = {
  leadId: string;
  leadNome: string;
  /** `first_contacted_at` — já com o patch otimista da página aplicado. */
  contatadoEm: string | null;
  /**
   * `tabela` desenha sem rótulo (o `<th>` já nomeia a coluna) e sem moldura.
   * `cartao` desenha com rótulo e moldura, porque no celular não há cabeçalho
   * e o bloco precisa se separar dos outros botões do cartão.
   */
  variante: "tabela" | "cartao";
  /**
   * Grava. A página aplica o patch otimista, chama a rota, e em caso de falha
   * DESFAZ o patch e relança — é o relançamento que acende o aviso aqui.
   */
  aoRegistrar: (registro: RegistroDeContato) => Promise<void>;
};

/* Fundo e borda por token, e a razão é medida: `background` e `color` são um
   par, e cor cravada não vira com o tema. A receita de superfície discreta é a
   mesma já usada nos segmentos desta tela — uma só, não duas. */
const BOTAO_BASE =
  "inline-flex grow basis-20 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-center bg-[color-mix(in_srgb,var(--atlas-texto-fraco)_6%,transparent)] motion-safe:transition-colors disabled:cursor-progress disabled:opacity-60";

/* A gaveta divide a MESMA fileira dos primários — não uma linha própria. Numa
   coluna de tabela isso é a diferença entre a linha da lead crescer 44px ou
   crescer 100px, e uma fila que cresce 100px por lead deixa de ser uma fila. */
const EXPANSOR =
  "inline-flex shrink-0 basis-14 items-center justify-center rounded-xl border border-dashed border-[var(--atlas-border)] px-2 text-[var(--atlas-texto-fraco)] hover:border-[var(--atlas-border-strong)] hover:text-[var(--atlas-texto-medio)] motion-safe:transition-colors disabled:opacity-60";

const TOM: Record<Desfecho["tom"], string> = {
  positivo:
    "border-[color-mix(in_srgb,var(--atlas-estado-sucesso)_42%,transparent)] text-[var(--atlas-texto-forte)] hover:bg-[color-mix(in_srgb,var(--atlas-estado-sucesso)_12%,transparent)]",
  neutro:
    "border-[var(--atlas-border-strong)] text-[var(--atlas-texto-medio)] hover:border-[var(--atlas-accent)] hover:text-[var(--atlas-texto-forte)]",
  /* Âmbar porque este desfecho ENCERRA a fila de ligação desta lead. Não é
     erro (perigo) nem sucesso: é "pare de tentar por aqui". */
  encerra:
    "border-[color-mix(in_srgb,var(--atlas-estado-atencao)_45%,transparent)] text-[var(--atlas-texto-medio)] hover:bg-[color-mix(in_srgb,var(--atlas-estado-atencao)_12%,transparent)]",
};

export function RegistroDeContatoNaLinha({
  leadId,
  leadNome,
  contatadoEm,
  variante,
  aoRegistrar,
}: Props) {
  const [enviando, setEnviando] = useState<string | null>(null);
  const [gravado, setGravado] = useState<string | null>(null);
  const [falha, setFalha] = useState<{ chave: string; motivo: string } | null>(null);
  const [aberto, setAberto] = useState(false);
  /* `id` em componente reutilizável é GLOBAL no documento: com 20 leads na
     página, o segundo bloco roubaria a referência do primeiro e o
     `aria-controls` apontaria todo mundo para a mesma gaveta. */
  const gaveta = useId();

  const estado = estadoDaLinha({ contatadoEm, enviando, gravado, falha });
  const jaContatada = estado.tipo === "registrado";

  async function registrar(desfecho: Desfecho) {
    if (enviando) return;
    setEnviando(desfecho.chave);
    setFalha(null);
    try {
      await aoRegistrar({ canal: desfecho.canal, resultado: desfecho.resultado });
      setGravado(desfecho.chave);
      setAberto(false);
    } catch (erro) {
      setFalha({
        chave: desfecho.chave,
        motivo:
          erro instanceof Error && erro.message
            ? erro.message
            : "o servidor não confirmou",
      });
    } finally {
      setEnviando(null);
    }
  }

  /* Lead já contatada não mostra a fileira de botões: numa fila de 20, cinco
     alvos por linha em lead resolvida é a parede que faz a pessoa parar de ler
     a fila. Ela mostra o carimbo e uma saída para recontato — porque contato de
     acompanhamento também não é medido hoje (zero atividades de contato na
     base), e fechá-lo aqui repetiria o erro num andar acima.

     Na gaveta vai SÓ o que o botão de fato revela. Foi tentador enfiar os
     primários lá dentro e economizar um `<div>`: `aria-controls` passaria a
     apontar para botões já visíveis, e quem navega por leitor de tela ouviria
     "recolhido" sobre um controle que está na tela. */
  const naGaveta: readonly Desfecho[] = jaContatada
    ? [...DESFECHOS_PRIMARIOS, ...DESFECHOS_SECUNDARIOS]
    : DESFECHOS_SECUNDARIOS;

  function botao(desfecho: Desfecho) {
    return (
      <button
        key={desfecho.chave}
        type="button"
        onClick={() => void registrar(desfecho)}
        disabled={Boolean(enviando)}
        aria-label={`${desfecho.aria} — ${leadNome}`}
        title={desfecho.aria}
        data-desfecho={desfecho.chave}
        /* 44px em `style` porque utilitário de layout num `<button>` já morreu
           nesta tela por causa de regra sem camada. */
        style={{ minHeight: 44 }}
        className={`${BOTAO_BASE} ${TOM[desfecho.tom]}`}
      >
        {/* O emoji carrega o CANAL, que o rótulo não diz — é o único eixo que
            ele acrescenta. `aria-hidden` porque o `aria-label` do botão já
            soletra canal e desfecho por extenso. */}
        <span aria-hidden="true" className="text-corpo leading-none">
          {desfecho.marca}
        </span>
        <span className="text-micro font-semibold leading-tight">
          {enviando === desfecho.chave ? "Gravando…" : desfecho.rotulo}
        </span>
      </button>
    );
  }

  return (
    <div
      className={
        variante === "cartao"
          ? "grid gap-2 rounded-xl border border-[var(--atlas-border)] p-2.5"
          : "grid gap-1.5"
      }
      data-registro-de-contato={estado.tipo}
      data-lead={leadId}
    >
      {variante === "cartao" ? (
        <span className="text-micro font-bold uppercase tracking-[0.12em] text-[var(--atlas-texto-fraco)]">
          Primeiro contato
        </span>
      ) : null}

      {/* O ESTADO, sempre dito. "Ausência de dado" aqui é "sem registro" — e
          nunca um zero desenhado, que leria como "zero tentativas medidas". */}
      {estado.tipo === "pendente" ? (
        <span className="text-micro text-[var(--atlas-texto-fraco)]">
          Sem registro
        </span>
      ) : null}
      {estado.tipo === "registrando" ? (
        <span className="text-micro text-[var(--atlas-texto-medio)]" role="status">
          Registrando {estado.rotulo}…
        </span>
      ) : null}
      {estado.tipo === "registrado" ? (
        <span className="inline-flex items-center gap-1 text-micro font-semibold text-[var(--atlas-estado-sucesso)]">
          <span aria-hidden="true">✓</span>
          {estado.rotulo}
        </span>
      ) : null}
      {estado.tipo === "falhou" ? (
        <span
          role="alert"
          className="text-micro font-semibold text-[var(--atlas-estado-perigo)]"
        >
          {/* "Não confirmou", e não "não gravou": a rota devolve 201 mesmo
              quando só o evento entrou e o carimbo de SLA não. Dizer "não
              gravou" nesse caso seria trocar uma mentira por outra. O que se
              sabe com certeza — e o que o corretor precisa saber — é que o
              servidor não confirmou e que a linha voltou ao que estava. */}
          Não confirmou ({estado.motivo}). A linha voltou ao estado anterior.
        </span>
      ) : null}

      {/* OS DOIS DESFECHOS DA LIGAÇÃO, sem nenhum toque antes. É este bloco que
          cumpre a exigência de UM toque; tudo o mais aqui é acessório.
          O expansor divide a fileira com eles — ver `EXPANSOR`. */}
      <div
        role="group"
        aria-label={`Registrar contato com ${leadNome}`}
        className="flex flex-wrap gap-1.5"
      >
        {!jaContatada ? DESFECHOS_PRIMARIOS.map(botao) : null}
        <button
          type="button"
          onClick={() => setAberto((atual) => !atual)}
          aria-expanded={aberto}
          aria-controls={gaveta}
          aria-label={
            jaContatada
              ? `Registrar um novo contato com ${leadNome}`
              : `Outros desfechos: WhatsApp e número inválido — ${leadNome}`
          }
          disabled={Boolean(enviando)}
          style={{ minHeight: 44 }}
          className={EXPANSOR}
        >
          <span className="text-micro font-semibold">
            {aberto ? "Menos" : jaContatada ? "Registrar" : "Outros"}
          </span>
        </button>
      </div>

      {/* A gaveta. `hidden` é classe do autor (display:none) e não o atributo:
          o atributo `[hidden]` vem da folha do navegador e perderia para o
          `flex` declarado aqui, deixando-a aberta o tempo todo. */}
      <div
        id={gaveta}
        role="group"
        aria-label={`Outros desfechos de contato com ${leadNome}`}
        className={aberto ? "flex flex-wrap gap-1.5" : "hidden"}
      >
        {aberto ? naGaveta.map(botao) : null}
      </div>
    </div>
  );
}

export default RegistroDeContatoNaLinha;
