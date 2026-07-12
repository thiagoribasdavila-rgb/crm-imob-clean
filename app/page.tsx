const stats = [
  ["+AI", "Decisões inteligentes"],
  ["24/7", "Agentes ativos"],
  ["360°", "Visão do cliente"],
];

const cards = [
  ["CRM Intelligence", "Uma base única para leads, clientes, produtos e vendas."],
  ["Copilot AI", "Pergunte ao Atlas e receba respostas estratégicas."],
  ["Agent Network", "Agentes especializados para cada etapa comercial."],
];

const chat = [
  ["Você", "Quais leads têm maior chance de fechar?"],
  ["Atlas", "Analisei sua carteira. Encontrei 12 oportunidades prioritárias."],
  ["Atlas", "Minha recomendação: atacar propostas paradas e leads quentes."],
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 120px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 40 }}>
          <div>
            <strong style={{ fontSize: 34, letterSpacing: "-0.07em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 28px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(50px,10vw,130px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".18em" }}>
            NEXT GENERATION REAL ESTATE AI
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(62px,11vw,150px)", lineHeight: .86, letterSpacing: "-0.11em" }}>
            A inteligência que transforma imóveis em decisões.
          </h1>
          <p style={{ maxWidth: 950, fontSize: 26, color: "#cbd5e1", lineHeight: 1.7 }}>
            O Atlas une CRM, inteligência artificial, agentes autônomos e dados de mercado em uma experiência operacional criada para a nova geração imobiliária.
          </p>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16, marginTop: 30 }}>
          {stats.map(([title, text]) => (
            <div className="atlas-card" key={title} style={{ padding: 30 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)" }}>{text}</p>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(36px,6vw,70px)", letterSpacing: "-0.06em" }}>Atlas Copilot Experience</h2>
          <div className="atlas-card" style={{ padding: 30 }}>
            {chat.map(([user, text]) => (
              <div key={text} style={{ marginBottom: 14, padding: 18, borderRadius: 16, border: "1px solid var(--border)" }}>
                <strong>{user}:</strong> {text}
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {cards.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 34 }}>
              <h3>{title}</h3>
              <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50, textAlign: "center" }}>
          <h2 style={{ fontSize: 56, letterSpacing: "-0.06em" }}>O futuro da operação imobiliária está sendo construído agora.</h2>
          <a href="/login" style={{ display: "inline-block", marginTop: 24, padding: "18px 40px", borderRadius: 16, background: "linear-gradient(135deg,#0ea5e9,#6366f1)", fontWeight: 800 }}>
            Conhecer Atlas AI
          </a>
        </section>
      </div>
    </main>
  );
}
