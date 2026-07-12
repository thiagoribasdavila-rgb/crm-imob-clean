const network = [
  ["Supply", "Empreendimentos, imóveis e oportunidades."],
  ["Intelligence", "IA conecta dados e identifica padrões."],
  ["Demand", "Clientes encontram oportunidades personalizadas."],
];

const agents = [
  "Atlas SDR Agent",
  "Atlas Broker Agent",
  "Atlas Investor Agent",
  "Atlas Market Agent",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 160px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 42, letterSpacing: "-0.09em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Autonomous Real Estate Network</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,170px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            AUTONOMOUS REAL ESTATE NETWORK
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,180px)", lineHeight: .8, letterSpacing: "-0.13em" }}>
            A rede inteligente que conecta todo o mercado imobiliário.
          </h1>
          <p style={{ maxWidth: 1100, fontSize: 30, color: "#cbd5e1", lineHeight: 1.8 }}>
            O Atlas une oferta, demanda, inteligência artificial e agentes autônomos para criar uma nova forma de operar imóveis.
          </p>
        </section>

        <section style={{ marginTop: 70, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {network.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 36 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50 }}>
          <h2>Atlas Agent Network</h2>
          {agents.map((agent, index) => (
            <div key={agent} style={{ marginTop: 14, padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
              {index + 1}. {agent}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 90 }}>
          <h2 style={{ fontSize: "clamp(45px,7vw,90px)", letterSpacing: "-0.07em" }}>
            De plataforma para ecossistema autônomo.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 24, lineHeight: 1.9 }}>
            O Atlas representa uma nova geração de PropTech: uma inteligência capaz de conectar oportunidades, pessoas e decisões em escala.
          </p>
        </section>
      </div>
    </main>
  );
}
