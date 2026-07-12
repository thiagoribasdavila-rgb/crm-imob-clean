const experiences = [
  ["Public Intelligence Portal", "Busca inteligente de imóveis com linguagem natural."],
  ["Command Center", "Gestão executiva com decisões orientadas por IA."],
  ["Agent Network", "Agentes digitais trabalhando em toda jornada."],
];

const products = [
  "Portal Inteligente",
  "CRM AI OS",
  "Market Intelligence",
  "Investor Dashboard",
  "Partner Platform",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 170px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 44, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>The Future Real Estate Intelligence Platform</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Acessar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(75px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS PRODUCT EXPERIENCE
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            Transformando o mercado imobiliário em uma experiência inteligente.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            A visão do Atlas materializada em produtos: busca inteligente, operação comercial, inteligência de mercado e plataformas conectadas.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
          {experiences.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 38 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Atlas Product Universe</h2>
          {products.map((item, index) => (
            <div key={item} style={{ marginTop: 15, padding: 20, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            Agora a visão vira produto.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            O Atlas deixa de ser apenas uma ideia de futuro e se transforma em uma plataforma completa para operar, analisar e conectar o mercado imobiliário.
          </p>
        </section>
      </div>
    </main>
  );
}
