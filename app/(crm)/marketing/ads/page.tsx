import { redirect } from "next/navigation";

// Consolidação (auditoria de páginas): o satélite Meta Ads nunca teve dado
// próprio — o desempenho pago vivo mora no hub (/marketing, cost-report +
// Andromeda) e a operação de campanha na central (/marketing/campaigns).
// Redirect de compatibilidade para deep links antigos; padrão sancionado
// (mesmo mecanismo de /dashboard → /command-center).
export default function AdsPage() {
  redirect("/marketing/campaigns");
}
