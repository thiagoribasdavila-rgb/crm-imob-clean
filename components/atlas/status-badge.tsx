import type { ReactNode } from "react";

type StatusBadgeTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "violet";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: StatusBadgeTone;
};

/*
 * ── A GUERRA DE CLASSES SAIU DAQUI ────────────────────────────────────────
 *
 * Este arquivo baixava `atlas-badge atlas-badge-<tom>` e, no mesmo className,
 * anulava com `!` exatamente as três propriedades que a variante existe para
 * dar: borda, fundo e cor. Mais `text-micro!` e `tracking-[0.14em]!` por cima
 * do `font-size` e do `letter-spacing` da base. Eram 6 variantes carregadas
 * para serem 100% descartadas, em 219 instâncias.
 *
 * O `!` era obrigatório porque `.atlas-badge-*` é regra SEM CAMADA em
 * globals.css, e sem camada vence `@layer utilities` do Tailwind — o mesmo
 * mecanismo que obrigou o AtlasCard a repintar a receita do painel.
 *
 * Agora a aparência é declarada uma vez, em `.cc6-badge` / `.cc6-badge-<tom>`,
 * com os valores LIDOS do getComputedStyle das 6 variantes antes da troca.
 * Nada aqui sobrescreve nada.
 *
 * `.atlas-badge-*` continua existindo e continua servindo: são 17 usos diretos
 * em AtlasUI, CopilotDock e FeedbackCenter, com outro tratamento (Geist 11px,
 * sem caixa alta). O que era uma classe desfeita virou duas classes honestas.
 *
 * "violet" segue mapeado para a variante quieta do acento único — nunca foi
 * violeta, e não é aqui que uma segunda cor decorativa vai nascer.
 */
export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return (
    <span className={`cc6-badge cc6-badge-${tone}`} data-tone={tone}>
      {children}
    </span>
  );
}
