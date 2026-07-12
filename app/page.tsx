const features = [
  ["01", "AI Copilot", "Decisões comerciais com dados reais do CRM."],
  ["02", "AI Agents", "SDR, Broker, Manager e Marketing trabalhando juntos."],
  ["03", "Market Intelligence", "Produtos, clientes e oportunidades conectados."],
  ["04", "Command Center", "A visão executiva da operação imobiliária."],
];

const dashboard = [
  ["🔥", "87", "Oportunidades quentes"],
  ["⚠", "14", "Leads em risco"],
  ["📈", "R$ 42M", "Pipeline analisado"],
  ["🤖", "24/7", "Inteligência ativa"],
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 96px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
          <div>
            <strong style={{ fontSize: 26, letterSpacing: "-0.05em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "12px 24px" }}>
            Acessar plataforma
          </a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(40px,8vw,100px)", position: "relative", overflow: "hidden" }}>
          <div style={{ color: "#38bdf8", fontWeight: 800, letterSpacing: ".08em" }}>
            AI POWERED REAL ESTATE OS
          </div>

          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(52px,9vw,110px)", lineHeight: .95, letterSpacing: "-0.08em", maxWidth: 1000 }}>
            A inteligência que opera o futuro do mercado imobiliário.
          </h1>

          <p style={{ maxWidth: 850, fontSize: 22, color: "#cbd5e1", lineHeight: 1.7 }}>
            O Atlas conecta CRM, inteligência artificial, agentes comerciais, marketing e dados de mercado em uma única plataforma operacional.
          </p>

          <div style={{ display: "flex", gap: 14, marginTop: 36, flexWrap: "wrap" }}>
            <a href="/login" style={{ padding: "16px 30px", borderRadius: 16, fontWeight: 800, background: "linear-gradient(135deg,#0ea5e9,#6366f1)" }}>
              Entrar no Atlas
            </a>
            <a href="#demo" style={{ padding: "16px 30px", borderRadius: 16, border: "1px solid var(--border)" }}>
              Ver inteligência
            </a>
          </div>
        </section>

        <section id="demo" style={{ marginTop: 28, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {dashboard.map(([icon, value, label]) => (
            <div className="atlas-card" key={label} style={{ padding: 28 }}>
              <div style={{ fontSize: 30 }}>{icon}</div>
              <strong style={{ fontSize: 34 }}>{value}</strong>
              <div style={{ color: "var(--muted)" }}>{label}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(32px,5vw,56px)", letterSpacing: "-0.05em" }}>
            Não é um CRM. É o sistema operacional da venda imobiliária.
          </h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
            {features.map(([number, title, text]) => (
              <article className="atlas-card" key={title} style={{ padding: 30 }}>
                <div style={{ color: "#38bdf8" }}>{number}</div>
                <h3>{title}</h3>
                <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 48 }}>
          <h2>Atlas Intelligence Command Center</h2>
          <p style={{ color: "var(--muted)", fontSize: 19, lineHeight: 1.7 }}>
            Uma visão única para gestores acompanharem oportunidades, riscos, previsões de vendas e recomendações da inteligência artificial.
          </p>
        </section>
      </div>
    </main>
  );
}
