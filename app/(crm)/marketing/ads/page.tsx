import Link from "next/link";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

/*
 * CC-6 · Meta Ads — satélite ainda sem dado (nenhum fetch existia; nenhum foi
 * criado). Consolidação do redesign: o h1 "Meta Ads" e o parágrafo "Controle
 * de anúncios pagos" diziam a mesma coisa duas vezes sem declarar estado —
 * agora o título vive no PageHeader, o estado é um badge honesto de uma linha
 * e a página aponta para onde o desempenho pago já é medido hoje.
 */

export default function AdsPage() {
  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Marketing · Ads"
        title="Meta Ads"
        description="Controle operacional dos anúncios pagos."
      />
      <section
        aria-label="Estado do módulo"
        className="cc6-panel cc6-reveal flex flex-wrap items-center gap-x-4 gap-y-3 p-5"
      >
        <StatusBadge tone="neutral">Em preparação</StatusBadge>
        <p className="text-sm leading-6 text-[#aab6ca]">
          Nenhum controle publicado ainda — o desempenho pago já é medido na central de campanhas.
        </p>
        <Link href="/marketing/campaigns" className="cc6-ghost-btn ml-auto">
          Central de campanhas →
        </Link>
      </section>
    </div>
  );
}
