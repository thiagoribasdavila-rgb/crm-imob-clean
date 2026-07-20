import Link from "next/link";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

/*
 * CC-6 · Webhooks — satélite ainda sem dado (nenhum fetch existia; nenhum foi
 * criado). Consolidação do redesign: o h1 "Webhooks" e o parágrafo "Eventos
 * automáticos do CRM" não declaravam estado nenhum — agora o título vive no
 * PageHeader, o estado é um badge honesto de uma linha e a página aponta para
 * a central de integrações, onde os conectores reais já vivem.
 */

export default function WebhooksPage() {
  return (
    <div className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Integrações · Webhooks"
        title="Webhooks"
        description="Eventos automáticos do CRM."
      />
      <section
        aria-label="Estado do módulo"
        className="cc6-panel cc6-reveal flex flex-wrap items-center gap-x-4 gap-y-3 p-5"
      >
        <StatusBadge tone="neutral">Em preparação</StatusBadge>
        <p className="text-sm leading-6 text-[#aab6ca]">
          Nenhum webhook configurável publicado ainda — os conectores e eventos ativos vivem na central de integrações.
        </p>
        <Link href="/integrations" className="cc6-ghost-btn ml-auto">
          Central de integrações →
        </Link>
      </section>
    </div>
  );
}
