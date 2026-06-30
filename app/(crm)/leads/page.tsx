import { LeadsContainer } from "@/components/crm/leads/LeadsContainer";

/**
 * LEADS PAGE (CRM)
 * Responsável por renderizar o módulo completo de leads
 */
export default function LeadsPage() {
  return (
    <main style={styles.wrapper}>
      <LeadsContainer />
    </main>
  );
}

/**
 * Estilo simples de layout (evita tela crua/404 visual vazio)
 */
const styles = {
  wrapper: {
    padding: "24px",
    backgroundColor: "#f9fafb",
    minHeight: "100vh",
  } as React.CSSProperties,
};
