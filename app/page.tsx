const modules = [
  {
    title: "CRM inteligente",
    description: "Leads, funil, atividades, histórico e visão 360° do cliente.",
  },
  {
    title: "Estoque imobiliário",
    description: "Imóveis, unidades, disponibilidade, preços e materiais comerciais.",
  },
  {
    title: "Marketing e Andromeda",
    description: "Campanhas, criativos, públicos, orçamento e desempenho em um só lugar.",
  },
  {
    title: "Atlas AI",
    description: "Score, recomendações, follow-up e inteligência para acelerar vendas.",
  },
];

const stages = [
  "Base segura",
  "CRM operacional",
  "Automação",
  "Marketing",
  "Inteligência V3",
];

export default function Home() {
  return (
    <main style={{ padding: "32px 0 64px" }}>
      <div className="atlas-container">
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
            marginBottom: 72,
          }}
        >
          <div>
            <strong style={{ fontSize: 20, letterSpacing: "-0.03em" }}>
              ATLAS AI
            </strong>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>
              Real Estate Operating System
            </div>
          </div>

          <a
            href="/crm"
            style={{
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "10px 18px",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            Acessar CRM
          </a>
        </header>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)",
            gap: 28,
            alignItems: "stretch",
          }}
        >
          <div className="atlas-card" style={{ padding: "clamp(28px, 6vw, 64px)" }}>
            <div
              style={{
                display: "inline-flex",
                padding: "7px 12px",
                borderRadius: 999,
                border: "1px solid rgba(56,189,248,.25)",
                background: "rgba(56,189,248,.08)",
                color: "#7dd3fc",
                fontSize: 13,
                marginBottom: 24,
              }}
            >
              V1 + V2 em construção · arquitetura pronta para V3
            </div>

            <h1
              className="atlas-gradient-text"
              style={{
                margin: 0,
                maxWidth: 760,
                fontSize: "clamp(42px, 7vw, 78px)",
                lineHeight: 0.98,
                letterSpacing: "-0.065em",
              }}
            >
              A operação imobiliária em um único sistema.
            </h1>

            <p
              style={{
                maxWidth: 720,
                margin: "28px 0 0",
                color: "#cbd5e1",
                fontSize: "clamp(17px, 2vw, 21px)",
                lineHeight: 1.65,
              }}
            >
              Centralize atendimento, leads, imóveis, vendas, campanhas e decisões de IA.
              O Atlas nasce simples para operar agora e evolui sem reconstrução até o V3.
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 34 }}>
              <a
                href="/crm"
                style={{
                  borderRadius: 12,
                  padding: "13px 20px",
                  background: "linear-gradient(135deg, #0ea5e9, #4f46e5)",
                  fontWeight: 700,
                }}
              >
                Entrar no Atlas
              </a>
              <a
                href="/crm/leads"
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: "13px 20px",
                  background: "rgba(255,255,255,0.035)",
                }}
              >
                Ver leads
              </a>
            </div>
          </div>

          <aside className="atlas-card" style={{ padding: 28 }}>
            <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>
              EVOLUÇÃO DO PRODUTO
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {stages.map((stage, index) => (
                <div
                  key={stage}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "36px 1fr",
                    alignItems: "center",
                    gap: 12,
                    padding: 14,
                    borderRadius: 14,
                    background: index === 0 ? "rgba(56,189,248,.1)" : "rgba(255,255,255,.025)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: index === 0 ? "#0284c7" : "rgba(148,163,184,.1)",
                      fontWeight: 700,
                    }}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <strong style={{ display: "block" }}>{stage}</strong>
                    <span style={{ color: "var(--muted)", fontSize: 13 }}>
                      {index === 0 ? "Em andamento" : "Estrutura prevista"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section style={{ marginTop: 56 }}>
          <div style={{ marginBottom: 22 }}>
            <div style={{ color: "var(--primary)", fontSize: 13, fontWeight: 700 }}>
              PLATAFORMA
            </div>
            <h2 style={{ margin: "8px 0 0", fontSize: "clamp(28px, 4vw, 42px)", letterSpacing: "-0.04em" }}>
              Uma base única para toda a operação.
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 16,
            }}
          >
            {modules.map((module, index) => (
              <article key={module.title} className="atlas-card" style={{ padding: 24 }}>
                <div style={{ color: "var(--primary)", fontSize: 13, marginBottom: 28 }}>
                  0{index + 1}
                </div>
                <h3 style={{ margin: 0, fontSize: 21 }}>{module.title}</h3>
                <p style={{ margin: "12px 0 0", color: "var(--muted)", lineHeight: 1.65 }}>
                  {module.description}
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
