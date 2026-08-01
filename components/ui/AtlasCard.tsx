import type { ReactNode } from "react";

/*
 * ── O CHROME QUE ANULAVA AS PRÓPRIAS CLASSES SAIU DAQUI ───────────────────
 *
 * Este arquivo aplicava `atlas-panel atlas-panel-hover atlas-surface-card` e,
 * no mesmo `className`, repintava fundo e borda com quatro utilitários `!` —
 * um gradiente literal 180deg de #0f1830 para #0b1224, e companhia. Ou seja:
 * baixava três classes para desfazê-las. A receita repintada era, caractere
 * por caractere, a de `.cc6-panel`.
 *
 * (O nome completo daquela classe NÃO é escrito aqui de propósito: o Tailwind
 * varre este arquivo inteiro, comentário incluído, e voltaria a emitir a regra
 * com `!important` só porque a prosa a menciona. Medido — foi o que aconteceu
 * na primeira versão deste comentário.)
 *
 * E o `!important` tinha uma consequência que ninguém tinha medido: ele vencia
 * `:root[data-theme="light"] .atlas-surface-card`, a regra que EXISTE e que
 * clareia o cartão. Medido na produção em 01/08/2026, forçando o tema claro em
 * /marketing: 194 de 210 trechos de texto dentro de painel reprovavam contraste
 * AA, com o pior em 1,06 — números como "R$ 3.612" invisíveis sobre o painel.
 *
 * Agora o componente usa a primitiva, e só. Os estados de interação (hover,
 * focus-visible) passaram para `.cc6-panel` em globals.css, onde pertencem:
 * estado de superfície é da superfície, não de cada consumidor.
 *
 * Alcance: 153 usos de <AtlasCard> e 171 de <AtlasMetric>.
 */

export function AtlasCard({
  children,
  className = "",
  density = "comfortable",
  emphasis = "standard",
}: {
  children: ReactNode;
  className?: string;
  density?: "compact" | "comfortable";
  emphasis?: "standard" | "primary" | "quiet";
}) {
  return (
    <section
      className={`cc6-panel ${className}`.trim()}
      data-card-density={density}
      data-card-emphasis={emphasis}
    >
      {children}
    </section>
  );
}

export function AtlasCardHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="atlas-card-header flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="min-w-0">
        {eyebrow ? (
          /* `cc6-eyebrow`, sem sobrescrever nada. Havia SEIS classes *eyebrow*
             no globals.css com cinco tratamentos distintos, mais esta sétima
             variante montada aqui por cima com `!` — e num terceiro valor de
             tracking (0.14em contra 0.22em e 0). A convergência é escolher uma:
             a que tem o vocabulário do v3 (mono, 11px, caixa alta) e que já é a
             família dominante. */
          <p className="cc6-eyebrow [font-variant-numeric:tabular-nums]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="atlas-card-title mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--atlas-texto-medio)]">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AtlasMetric({
  label,
  value,
  detail,
  trend,
  icon,
  tone = "blue",
  relevance = "supporting",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: ReactNode;
  icon?: ReactNode;
  tone?: "blue" | "green" | "amber" | "violet" | "rose";
  relevance?: "primary" | "supporting";
}) {
  /*
   * `.atlas-metric` JÁ está na regra de tema claro de globals.css — ela sempre
   * soube clarear. Quem a impedia era o `cc5CardChrome` com `!important` em
   * cima, nas 171 métricas não-primárias. Removê-lo não tira tratamento: devolve
   * o que a folha de estilo já oferecia e o componente anulava.
   */
  return (
    <article
      className={`atlas-metric atlas-metric-${tone}`}
      data-tone={tone}
      data-relevance={relevance}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {icon ? (
            <span className="atlas-metric-icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <p className="font-mono text-rotulo font-medium uppercase leading-4 tracking-[0.14em] text-[var(--atlas-texto-fraco)]">
            {label}
          </p>
        </div>
        {trend ? (
          <span className="atlas-metric-trend font-mono text-rotulo [font-variant-numeric:tabular-nums]">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="atlas-metric-number mt-4 font-mono text-3xl font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-[var(--atlas-texto-fraco)]">{detail}</p>
      ) : null}
    </article>
  );
}
