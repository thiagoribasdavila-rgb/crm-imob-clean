const agents = [
  ["SDR Agent", "Capta, qualifica e prioriza oportunidades."],
  ["Broker Agent", "Apoia corretores durante toda negociação."],
  ["Market Agent", "Analisa tendências e oportunidades."],
  ["Investor Agent", "Avalia patrimônio e investimentos."],
];

const intelligence = [
  "Dados em tempo real",
  "Decisões preditivas",
  "Automação comercial",
  "Aprendizado contínuo",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 180px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 46, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Autonomous Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS AUTONOMOUS OS
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            A operação imobiliária que aprende, decide e evolui.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            O Atlas conecta dados, agentes artificiais e pessoas para criar uma operação imobiliária autônoma e inteligente.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
          {agents.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 38 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Atlas Intelligence Engine</h2>
          {intelligence.map((item, index) => (
            <div key={item} style={{ marginTop: 16, padding: 22, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            O Atlas deixa de ser uma ferramenta. Torna-se uma inteligência operacional.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            A próxima geração do mercado imobiliário será operada por humanos e agentes inteligentes trabalhando em conjunto.
          </p>
        </section>
      </div>
    </main>
  );
}
