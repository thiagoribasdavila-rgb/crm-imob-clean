const marketplace = [
  ["Supply Intelligence", "Conecta estoque, lançamentos e oportunidades."],
  ["Demand Intelligence", "Entende clientes, investidores e intenção de compra."],
  ["Opportunity Engine", "Encontra conexões e oportunidades em tempo real."],
];

const ecosystem = [
  "Incorporadoras conectadas",
  "Imobiliárias inteligentes",
  "Investidores analisados por IA",
  "Clientes com recomendações personalizadas",
  "Mercado operado por inteligência",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 180px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 46, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>AI Marketplace Intelligence</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS INTELLIGENT MARKETPLACE
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            A inteligência que conecta oferta, demanda e oportunidades.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            O Atlas cria uma rede inteligente onde imóveis, empresas, investidores e clientes encontram as melhores oportunidades.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
          {marketplace.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 38 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Atlas Connected Ecosystem</h2>
          {ecosystem.map((item, index) => (
            <div key={item} style={{ marginTop: 16, padding: 22, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            O mercado imobiliário conectado por inteligência artificial.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            O Atlas evolui para uma camada de conexão inteligente entre todos os participantes do mercado.
          </p>
        </section>
      </div>
    </main>
  );
}
