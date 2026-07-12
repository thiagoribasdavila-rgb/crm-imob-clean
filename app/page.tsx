const partners = [
  ["Incorporadoras", "Inteligência para estoque, campanhas e vendas."],
  ["Imobiliárias", "Operação comercial com IA e agentes especializados."],
  ["Corretores", "Copilot para decisões e produtividade diária."],
];

const ecosystem = [
  "Produtos imobiliários",
  "Clientes qualificados",
  "Agentes de IA",
  "Dados de mercado",
  "Oportunidades comerciais",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 140px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 38, letterSpacing: "-0.08em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 30px" }}>Demonstração</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(60px,10vw,150px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".2em" }}>
            REAL ESTATE INTELLIGENCE NETWORK
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(60px,11vw,150px)", lineHeight: .85, letterSpacing: "-0.11em" }}>
            Conectando a nova geração do mercado imobiliário.
          </h1>
          <p style={{ maxWidth: 1000, fontSize: 28, color: "#cbd5e1", lineHeight: 1.7 }}>
            Uma plataforma que conecta incorporadoras, imobiliárias, corretores e clientes através de inteligência artificial.
          </p>
        </section>

        <section style={{ marginTop: 60, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {partners.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 34 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50 }}>
          <h2>Atlas Ecosystem</h2>
          {ecosystem.map((item, index) => (
            <div key={item} style={{ marginTop: 14, padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(40px,6vw,72px)", letterSpacing: "-0.06em" }}>
            Uma rede inteligente para o futuro imobiliário.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 22, lineHeight: 1.8 }}>
            O Atlas evolui de uma plataforma operacional para um ecossistema de inteligência imobiliária conectando todos os participantes do mercado.
          </p>
        </section>
      </div>
    </main>
  );
}
