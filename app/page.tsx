const intelligence = [
  ["CRM Intelligence", "Leads, funil, histórico e visão 360° do cliente."],
  ["AI Copilot", "Decisões comerciais baseadas em dados reais."],
  ["AI Agents", "SDR, Broker, Manager e Marketing especializados."],
  ["Market Intelligence", "Produtos, demanda e oportunidades imobiliárias."],
];

const metrics = [
  ["🔥", "Oportunidades", "Prioridades identificadas pela IA"],
  ["📈", "Forecast", "Previsão comercial inteligente"],
  ["🤖", "Agentes", "Especialistas trabalhando juntos"],
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 80px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
          <div>
            <strong style={{ fontSize: 24, letterSpacing: "-0.04em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "12px 22px" }}>
            Entrar no sistema
          </a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(32px,6vw,80px)", overflow: "hidden" }}>
          <div style={{ color: "#38bdf8", fontWeight: 700, marginBottom: 20 }}>
            THE INTELLIGENT REAL ESTATE PLATFORM
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(48px,8vw,96px)", lineHeight: 1, letterSpacing: "-0.07em", margin: 0 }}>
            O cérebro inteligente da operação imobiliária.
          </h1>
          <p style={{ maxWidth: 780, fontSize: 21, lineHeight: 1.7, color: "#cbd5e1", marginTop: 28 }}>
            CRM, inteligência artificial, agentes comerciais e dados de mercado em um único sistema operacional criado para transformar imóveis em decisões mais rápidas e vendas mais inteligentes.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 36, flexWrap: "wrap" }}>
            <a href="/login" style={{ padding: "15px 26px", borderRadius: 14, background: "linear-gradient(135deg,#0ea5e9,#4f46e5)", fontWeight: 700 }}>
              Acessar Atlas AI
            </a>
            <a href="#platform" style={{ padding: "15px 26px", borderRadius: 14, border: "1px solid var(--border)" }}>
              Conhecer plataforma
            </a>
          </div>
        </section>

        <section style={{ marginTop: 32, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {metrics.map((item) => (
            <div key={item[1]} className="atlas-card" style={{ padding: 24 }}>
              <div style={{ fontSize: 28 }}>{item[0]}</div>
              <h3>{item[1]}</h3>
              <p style={{ color: "var(--muted)" }}>{item[2]}</p>
            </div>
          ))}
        </section>

        <section id="platform" style={{ marginTop: 64 }}>
          <h2 style={{ fontSize: 42, letterSpacing: "-0.04em" }}>Uma nova geração de operação imobiliária.</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 16, marginTop: 28 }}>
            {intelligence.map(([title, description]) => (
              <article key={title} className="atlas-card" style={{ padding: 28 }}>
                <h3>{title}</h3>
                <p style={{ color: "var(--muted)", lineHeight: 1.6 }}>{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="atlas-card" style={{ marginTop: 64, padding: 40 }}>
          <h2>Atlas Command Center</h2>
          <p style={{ color: "var(--muted)", fontSize: 18 }}>
            A visão executiva onde gestores acompanham oportunidades, riscos, vendas, marketing e decisões recomendadas pela inteligência artificial.
          </p>
        </section>
      </div>
    </main>
  );
}
