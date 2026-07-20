import { redirect } from "next/navigation";

// Fusão Início → Sala de comando: o Command Center passou a ser a única home
// (informação por papel e grau de importância). /dashboard permanece apenas
// como rota de compatibilidade para deep links, favoritos e atalhos antigos.
export default function DashboardPage() {
  redirect("/command-center");
}
