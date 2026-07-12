const questions = [
  "Atlas, quais leads devo priorizar hoje?",
  "Qual imóvel combina com este cliente?",
  "Como está minha previsão de vendas?",
];

const comparison = [
  ["CRM tradicional", "Organiza dados"],
  ["Atlas AI", "Analisa, recomenda e orienta decisões"],
];

const architecture = [
  "CRM Core",
  "AI Copilot",
  "Specialized Agents",
  "Market Intelligence",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 120px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
          <div>
            <strong style={{ fontSize: 32, letterSpacing: "-0.07em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 28px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(45px,9vw,120px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".16em" }}>
            REAL ESTATE AI PLATFORM
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(60px,11vw,140px)", lineHeight: .88, letterSpacing: "-0.1em" }}>
            O copiloto inteligente para o mercado imobiliário.
          </h1>
          <p style={{ maxWidth: 920, fontSize: 26, lineHeight: 1.7, color: "#cbd5e1" }}>
            Uma plataforma que conecta dados, inteligência artificial e agentes especializados para transformar operações imobiliárias.
          </p>
        </section>

        <section className="atlas-card" style={{ marginTop: 32, padding: 36 }}>
          <h2>Atlas Copilot Demo</h2>
          <div style={{ display: "grid", gap: 12 }}>
            {questions.map((question) => (
              <div key={question} style={{ padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
                {question}
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 70 }}>
          <h2 style={{ fontSize: 56, letterSpacing: "-0.06em" }}>Antes vs Depois do Atlas</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
            {comparison.map(([title, text]) => (
              <div className="atlas-card" key={title} style={{ padding: 32 }}>
                <h3>{title}</h3>
                <p style={{ color: "var(--muted)" }}>{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="atlas-card" style={{ marginTop: 70, padding: 42 }}>
          <h2>Arquitetura Atlas AI OS</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
            {architecture.map((item) => (
              <div key={item} style={{ padding: 18, borderRadius: 14, background: "rgba(255,255,255,.03)" }}>
                {item}
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 80, textAlign: "center" }}>
          <h2 style={{ fontSize: 60, letterSpacing: "-0.06em" }}>
            O futuro da operação imobiliária está sendo construído agora.
          </h2>
          <a href="/login" style={{ display: "inline-block", marginTop: 24, padding: "18px 36px", borderRadius: 16, fontWeight: 800, background: "linear-gradient(135deg,#0ea5e9,#6366f1)" }}>
            Conhecer Atlas AI
          </a>
        </section>
      </div>
    </main>
  );
}
