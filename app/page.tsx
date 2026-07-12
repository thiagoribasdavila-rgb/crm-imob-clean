const layers = [
  ["01", "Data Layer", "CRM, estoque, clientes e mercado conectados."],
  ["02", "Intelligence Layer", "IA interpreta dados e recomenda decisões."],
  ["03", "Action Layer", "Agentes transformam decisões em execução."],
];

const flow = [
  "Lead recebido",
  "IA qualifica",
  "Melhor oportunidade encontrada",
  "Corretor recebe estratégia",
  "Venda acelerada",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 140px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 36, letterSpacing: "-0.08em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Estate Operating System</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 30px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(55px,10vw,140px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".2em" }}>
            THE FUTURE OF REAL ESTATE
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(64px,12vw,160px)", lineHeight: .84, letterSpacing: "-0.12em" }}>
            Uma nova inteligência para vender, gerir e crescer.
          </h1>
          <p style={{ maxWidth: 1000, fontSize: 28, lineHeight: 1.7, color: "#cbd5e1" }}>
            O Atlas é um sistema operacional imobiliário criado para unir pessoas, dados e inteligência artificial em uma única experiência.
          </p>
        </section>

        <section style={{ marginTop: 40 }}>
          <div className="atlas-card" style={{ padding: 40 }}>
            <h2>Como o Atlas trabalha em 24 horas</h2>
            {flow.map((step, index) => (
              <div key={step} style={{ marginTop: 14, padding: 18, borderRadius: 16, border: "1px solid var(--border)" }}>
                {index + 1}. {step}
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 70, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {layers.map(([number, title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 36 }}>
              <div style={{ color: "#38bdf8" }}>{number}</div>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.7 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50 }}>
          <h2>Atlas Vision</h2>
          <p style={{ color: "var(--muted)", fontSize: 21, lineHeight: 1.8 }}>
            Uma plataforma preparada para a próxima geração do mercado imobiliário: mais inteligência, mais velocidade e decisões orientadas por dados.
          </p>
        </section>
      </div>
    </main>
  );
}
