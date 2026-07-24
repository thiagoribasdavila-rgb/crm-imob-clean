"use client";

import { redirect } from "next/navigation";

// Fusão Início → Sala de comando: o Command Center passou a ser a única home
// (informação por papel e grau de importância). /dashboard permanece apenas
// como rota de compatibilidade para deep links, favoritos e atalhos antigos.
//
// O bloco de saúde dos módulos morava AQUI e era importado pelo Command Center
// a partir deste arquivo de página. Isso viola o contrato de página do Next
// (um page.tsx só pode exportar default e alguns campos reservados) e só não
// quebrava o build porque o turbopack não valida esse contrato. Agora ele vive
// em components/atlas/command-center-module-health.tsx, que é o lugar certo:
// componente reaproveitável, importável sem passar por uma rota.

export default function DashboardPage() {
  redirect("/command-center");
}
