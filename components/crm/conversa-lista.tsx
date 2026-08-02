import Link from "next/link";

/**
 * A LISTA DE CONVERSAS DE VERDADE — as linhas de `conversations`.
 *
 * A versão anterior desta tela listava `lead_events` (tabela morta) e chamava
 * cada evento de "interação", inferindo o canal a partir do texto do
 * `event_type`. Um `pipeline_stage_changed` virava linha na caixa de entrada.
 *
 * Aqui cada linha é uma conversa que existe, e o que não se sabe fica escrito
 * como não sabido — conversa sem lead vinculada não vira "contato externo"
 * inventado, porque essa invenção esconde exatamente o defeito que a produziu
 * (telefone que não bateu com nenhuma lead, ou que bateu com duas).
 */

export type ConversaDaLista = {
  id: string;
  canal: string;
  status: string;
  naoLidas: number;
  ultimaMensagemEm: string | null;
  leadId: string | null;
  leadNome: string | null;
  donoNome: string | null;
  ultimaPreview: string | null;
  ultimaDirecao: string | null;
};

/** Canal de origem lido em varredura — a categoria que a lei do emoji aprova. */
const EMOJI_DO_CANAL: Record<string, string> = {
  whatsapp: "💬",
  email: "✉️",
  instagram: "📷",
  messenger: "💠",
  telefone: "📞",
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

function quando(valor: string | null) {
  if (!valor) return "sem data";
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return "sem data";
  return `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function ConversaLista({ conversas, truncado, teto }: { conversas: ConversaDaLista[]; truncado: boolean; teto: number }) {
  return (
    <ul className="cc6-hairline">
      {conversas.map((conversa) => (
        <li
          key={conversa.id}
          className="flex flex-col gap-3 border-t border-[var(--atlas-border)] py-3.5 first:border-t-0 md:flex-row md:items-center md:justify-between md:gap-6"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="cc6-chip">
                <span aria-hidden="true">{EMOJI_DO_CANAL[conversa.canal] ?? "•"} </span>
                {conversa.canal}
              </span>
              {conversa.leadNome ? (
                <p className="truncate text-sm font-semibold text-[var(--atlas-text-primary)]">{conversa.leadNome}</p>
              ) : (
                <p className="text-sm font-semibold text-[var(--atlas-text-tertiary)]">
                  Sem lead vinculada
                  <span className="sr-only"> — o telefone desta conversa não bateu com nenhuma lead, ou bateu com mais de uma.</span>
                </p>
              )}
              {conversa.naoLidas > 0 ? (
                <span className="cc6-chip cc6-warn" title="Mensagens recebidas que ainda não foram lidas no CRM.">
                  {conversa.naoLidas} por ler
                </span>
              ) : null}
            </div>
            {conversa.ultimaPreview ? (
              <p className="mt-1 truncate text-xs leading-5 text-[var(--atlas-text-secondary)]">
                <span className="text-[var(--atlas-text-tertiary)]">{conversa.ultimaDirecao === "outbound" ? "nós: " : "cliente: "}</span>
                {conversa.ultimaPreview}
              </p>
            ) : (
              <p className="mt-1 text-xs leading-5 text-[var(--atlas-text-tertiary)]">
                Conversa aberta sem nenhuma mensagem gravada.
              </p>
            )}
            <p className="mt-1 text-[11px] leading-5 text-[var(--atlas-text-tertiary)]">
              {conversa.donoNome ? `Responsável: ${conversa.donoNome}` : "Sem responsável definido"} · situação {conversa.status}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-col md:items-end md:gap-1.5">
            <p className="cc6-num text-xs text-[var(--atlas-text-secondary)]">{quando(conversa.ultimaMensagemEm)}</p>
            {conversa.leadId ? (
              <Link
                href={`/leads/${conversa.leadId}`}
                className={`inline-flex min-h-[44px] items-center rounded-md px-1 text-xs font-semibold text-[var(--atlas-accent)] transition-colors hover:text-[var(--atlas-text-primary)] ${focusRing}`}
              >
                Abrir a lead
              </Link>
            ) : null}
          </div>
        </li>
      ))}
      {truncado ? (
        <li className="border-t border-[var(--atlas-border)] pt-3 text-[11px] leading-5 text-[var(--atlas-text-tertiary)]">
          Mostrando as {teto} conversas mais recentes do seu escopo. Há mais além deste recorte.
        </li>
      ) : null}
    </ul>
  );
}
