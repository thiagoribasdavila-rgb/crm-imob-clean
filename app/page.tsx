const pillars = [
  {
    title: "AI Command Center",
    text: "Uma visão executiva com oportunidades, riscos, pipeline e decisões recomendadas.",
  },
  {
    title: "Autonomous Agents",
    text: "SDR, Broker, Manager e Marketing trabalhando como uma equipe inteligente.",
  },
  {
    title: "Real Estate Intelligence",
    text: "Dados de clientes, produtos, mercado e vendas conectados em tempo real.",
  },
];

const numbers = [
  ["01", "CRM", "Base operacional"],
  ["02", "AI", "Inteligência comercial"],
  ["03", "Agents", "Automação de decisões"],
  ["04", "Data", "Aprendizado contínuo"],
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 100px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
          <div>
            <strong style={{ fontSize: 28, letterSpacing: "-0.06em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "12px 24px" }}>
            Entrar
          </a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(40px,8vw,110px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 800, letterSpacing: ".12em" }}>
            THE FUTURE OF REAL ESTATE OPERATIONS
          </div>

          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(56px,10vw,120px)", lineHeight: .92, letterSpacing: "-0.09em", maxWidth: 1100 }}>
            O sistema operacional inteligente do mercado imobiliário.
          </h1>

          <p style={{ maxWidth: 900, fontSize: 24, lineHeight: 1.7, color: "#cbd5e1" }}>
            O Atlas combina CRM, inteligência artificial, agentes autônomos e dados de mercado para transformar operações imobiliárias em negócios orientados por inteligência.
          </p>

          <div style={{ display: "flex", gap: 16, marginTop: 40, flexWrap: "wrap" }}>
            <a href="/login" style={{ padding: "17px 32px", borderRadius: 16, fontWeight: 800, background: "linear-gradient(135deg,#0ea5e9,#6366f1)" }}>
              Acessar Atlas AI
            </a>
            <a href="#architecture" style={{ padding: "17px 32px", borderRadius: 16, border: "1px solid var(--border)" }}>
              Ver arquitetura
            </a>
          </div>
        </section>

        <section style={{ marginTop: 30, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {numbers.map(([n, title, text]) => (
            <div className="atlas-card" key={title} style={{ padding: 28 }}>
              <div style={{ color: "#38bdf8" }}>{n}</div>
              <h3>{title}</h3>
              <p style={{ color: "var(--muted)" }}>{text}</p>
            </div>
          ))}
        </section>

        <section id="architecture" style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(34px,5vw,60px)", letterSpacing: "-0.05em" }}>
            Uma nova categoria: Real Estate Operating System.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
            {pillars.map((pillar) => (
              <article className="atlas-card" key={pillar.title} style={{ padding: 32 }}>
                <h3>{pillar.title}</h3>
                <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{pillar.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50 }}>
          <h2>Atlas Intelligence Platform</h2>
          <p style={{ color: "var(--muted)", fontSize: 20, lineHeight: 1.8 }}>
            Uma plataforma preparada para imobiliárias, incorporadoras e operações comerciais que querem substituir processos manuais por decisões inteligentes baseadas em dados.
          </p>
        </section>
      </div>
    </main>
  );
}
