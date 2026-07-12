const apps = [
  ["/atlas/dashboard", "Command Center", "Gestão executiva com dados em tempo real."],
  ["/atlas/copilot", "AI Copilot", "Assistente inteligente para decisões comerciais."],
  ["/atlas/agents", "Agent Center", "Controle dos agentes especializados."],
  ["/atlas/property", "Property Match", "Conexão inteligente entre cliente e imóvel."],
];

const workflow = [
  "Dados capturados",
  "IA analisa contexto",
  "Atlas recomenda ação",
  "Equipe executa",
  "Resultado alimenta inteligência",
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 180px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 44, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Core Application Experience</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Entrar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS CORE PLATFORM
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            O ambiente onde a inteligência imobiliária acontece.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            O Atlas agora evolui para uma experiência operacional completa com módulos, agentes e inteligência conectados.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(270px,1fr))", gap: 20 }}>
          {apps.map(([path, title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 36 }}>
              <div style={{ color: "#38bdf8" }}>{path}</div>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Atlas Intelligence Workflow</h2>
          {workflow.map((item, index) => (
            <div key={item} style={{ marginTop: 15, padding: 20, borderRadius: 16, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            Do conceito para a operação diária.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            A próxima fase é transformar cada módulo em uma aplicação funcional integrada ao CRM, IA e dados do Atlas.
          </p>
        </section>
      </div>
    </main>
  );
}
