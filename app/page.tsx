const platform = [
  ["AI Cloud", "Infraestrutura inteligente para operações imobiliárias."],
  ["API Platform", "Conectando sistemas, parceiros e ecossistemas."],
  ["Agent Marketplace", "Agentes especializados para cada necessidade."],
];

const network = [
  "Incorporadoras",
  "Imobiliárias",
  "Corretores",
  "Investidores",
  "Clientes",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 150px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 40, letterSpacing: "-0.08em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Global Real Estate Intelligence Platform</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(65px,11vw,160px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".22em" }}>
            ATLAS GLOBAL PLATFORM
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(65px,12vw,170px)", lineHeight: .82, letterSpacing: "-0.12em" }}>
            A infraestrutura de inteligência do mercado imobiliário.
          </h1>
          <p style={{ maxWidth: 1050, fontSize: 30, lineHeight: 1.7, color: "#cbd5e1" }}>
            O Atlas conecta empresas, pessoas, dados e inteligência artificial para criar uma nova camada operacional para o mercado imobiliário.
          </p>
        </section>

        <section style={{ marginTop: 70, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {platform.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 36 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50 }}>
          <h2>Atlas Network</h2>
          {network.map((item, index) => (
            <div key={item} style={{ marginTop: 14, padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 90 }}>
          <h2 style={{ fontSize: "clamp(42px,6vw,80px)", letterSpacing: "-0.07em" }}>
            De software para infraestrutura de mercado.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 23, lineHeight: 1.9 }}>
            O Atlas representa a evolução da PropTech: uma plataforma onde dados, inteligência artificial e agentes digitais trabalham juntos para transformar decisões imobiliárias.
          </p>
        </section>
      </div>
    </main>
  );
}
