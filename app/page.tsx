const twin = [
  ["Market Twin", "Modelo inteligente do comportamento do mercado."],
  ["Neighborhood Intelligence", "Análise de bairros, demanda e valorização."],
  ["Demand Forecast", "Previsão de procura e oportunidades futuras."],
];

const signals = [
  "Valorização regional",
  "Movimento de demanda",
  "Perfil de compradores",
  "Oportunidades ocultas",
  "Tendências futuras",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 180px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 46, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Digital Twin Intelligence</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS DIGITAL TWIN
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            O mapa inteligente do futuro imobiliário.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            O Atlas cria uma camada digital de inteligência capaz de compreender regiões, prever movimentos e revelar oportunidades antes do mercado.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
          {twin.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 38 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Market Intelligence Signals</h2>
          {signals.map((item, index) => (
            <div key={item} style={{ marginTop: 16, padding: 22, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            Antecipar o mercado é a próxima vantagem competitiva.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            O Atlas Digital Twin transforma dados imobiliários em inteligência estratégica para empresas, investidores e consumidores.
          </p>
        </section>
      </div>
    </main>
  );
}
