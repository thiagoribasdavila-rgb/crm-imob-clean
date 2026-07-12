const universe = [
  ["AI Search", "Busca conversacional de imóveis e oportunidades."],
  ["Market Twin", "Uma visão inteligente do mercado e suas tendências."],
  ["Smart Match", "Conexão entre pessoas, imóveis e investimentos."],
];

const future = [
  "Portal inteligente de imóveis",
  "Previsão de mercado por região",
  "Gêmeo digital imobiliário",
  "Marketplace inteligente",
  "Rede global de oportunidades",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 170px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 44, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Intelligence Universe</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(75px,12vw,180px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            REAL ESTATE INTELLIGENCE UNIVERSE
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            A inteligência que entende o mercado imobiliário.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            O Atlas evolui para uma camada global de inteligência capaz de conectar imóveis, pessoas, dados e decisões em escala.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
          {universe.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 38 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Atlas Future Vision</h2>
          {future.map((item, index) => (
            <div key={item} style={{ marginTop: 15, padding: 20, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            De marketplace para inteligência do mercado imobiliário.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            O Atlas representa uma nova fronteira da PropTech: uma inteligência capaz de compreender, conectar e antecipar movimentos do mercado imobiliário.
          </p>
        </section>
      </div>
    </main>
  );
}
