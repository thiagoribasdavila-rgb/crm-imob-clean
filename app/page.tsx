const blocks = [
  ["01", "Command Center", "Acompanhe vendas, oportunidades, riscos e decisões da IA em uma visão executiva."],
  ["02", "Copilot", "Pergunte ao Atlas e receba análises comerciais baseadas nos seus dados."],
  ["03", "Agents Network", "Agentes especializados trabalham juntos para acelerar resultados."],
];

const demo = [
  "Atlas, quais leads devo priorizar hoje?",
  "Qual imóvel combina com este cliente?",
  "Como está minha previsão de vendas?",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 110px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 48 }}>
          <div>
            <strong style={{ fontSize: 30, letterSpacing: "-0.06em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "13px 26px" }}>Acessar plataforma</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(45px,9vw,120px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".15em" }}>
            THE AI OPERATING SYSTEM FOR REAL ESTATE
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(58px,10vw,128px)", lineHeight: .9, letterSpacing: "-0.1em" }}>
            O futuro da operação imobiliária começa aqui.
          </h1>
          <p style={{ maxWidth: 900, fontSize: 25, lineHeight: 1.7, color: "#cbd5e1" }}>
            Uma plataforma de inteligência artificial que conecta CRM, vendas, marketing, estoque e decisões estratégicas em um único sistema operacional.
          </p>
        </section>

        <section style={{ marginTop: 30, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {blocks.map(([number, title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 34 }}>
              <div style={{ color: "#38bdf8" }}>{number}</div>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 70, padding: 42 }}>
          <h2>Atlas Copilot Experience</h2>
          {demo.map((item) => (
            <div key={item} style={{ marginTop: 14, padding: 16, border: "1px solid var(--border)", borderRadius: 14 }}>
              {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 70 }}>
          <h2 style={{ fontSize: "clamp(36px,5vw,64px)", letterSpacing: "-0.05em" }}>
            Construído para a próxima geração do mercado imobiliário.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 20, lineHeight: 1.8 }}>
            O Atlas une inteligência artificial, dados e automação para ajudar imobiliárias e incorporadoras a venderem com mais velocidade, previsibilidade e inteligência.
          </p>
        </section>
      </div>
    </main>
  );
}
