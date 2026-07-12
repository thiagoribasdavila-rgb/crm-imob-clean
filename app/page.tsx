const products = [
  ["Command Center", "Dashboard executivo com decisões inteligentes."],
  ["AI Copilot", "Assistente comercial para cada decisão."],
  ["Property Intelligence", "Busca e recomendação inteligente de imóveis."],
  ["Investor OS", "Análise de oportunidades e patrimônio."],
];

const screens = [
  "Dashboard Inteligente",
  "Conversação com IA",
  "Lead Score em tempo real",
  "Match de imóveis",
  "Insights de mercado",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 170px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 44, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Product Experience</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Acessar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS USER EXPERIENCE
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            A experiência operacional do futuro imobiliário.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            Agora a visão do Atlas se transforma em produtos reais: dashboards, agentes, inteligência e experiências utilizadas diariamente.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
          {products.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 38 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Atlas Interface Universe</h2>
          {screens.map((item, index) => (
            <div key={item} style={{ marginTop: 15, padding: 20, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            Da visão para a experiência real.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            O próximo estágio do Atlas é transformar cada conceito em uma interface real para usuários, gestores, incorporadoras e investidores.
          </p>
        </section>
      </div>
    </main>
  );
}
