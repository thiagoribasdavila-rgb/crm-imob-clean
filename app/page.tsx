const modules = [
  ["Command Center", "Visão executiva com KPIs, pipeline e decisões IA."],
  ["Copilot Workspace", "Conversas inteligentes para orientar equipes."],
  ["Agent Center", "Gestão de agentes especializados."],
  ["Property Intelligence", "Match entre cliente, imóvel e oportunidade."],
  ["Market Intelligence", "Dados e tendências do mercado."],
];

const screens = [
  ["Dashboard", "R$ 42M pipeline | 87 oportunidades | 14 riscos"],
  ["Copilot", "Análise comercial em linguagem natural"],
  ["Lead Score", "Priorização automática de clientes"],
];

export default function Home() {
  return (
    <main style={{ padding: "24px 0 180px" }}>
      <div className="atlas-container">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 50 }}>
          <div>
            <strong style={{ fontSize: 44, letterSpacing: "-0.1em" }}>ATLAS AI</strong>
            <div style={{ color: "var(--muted)" }}>Real Product Platform</div>
          </div>
          <a href="/login" className="atlas-card" style={{ padding: "14px 32px" }}>Acessar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(70px,12vw,190px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".25em" }}>
            ATLAS PRODUCT OS
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(70px,13vw,190px)", lineHeight: .78, letterSpacing: "-0.14em" }}>
            A plataforma que transforma inteligência em operação.
          </h1>
          <p style={{ maxWidth: 1150, fontSize: 32, color: "#cbd5e1", lineHeight: 1.8 }}>
            Agora cada visão do Atlas vira um módulo real para gestores, corretores, incorporadoras e investidores.
          </p>
        </section>

        <section style={{ marginTop: 80, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 20 }}>
          {modules.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 36 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 90, padding: 55 }}>
          <h2>Real Product Screens</h2>
          {screens.map(([title, text], index) => (
            <div key={title} style={{ marginTop: 16, padding: 22, borderRadius: 16, border: "1px solid var(--border)" }}>
              <strong>{index + 1}. {title}</strong>
              <div style={{ color: "var(--muted)", marginTop: 8 }}>{text}</div>
            </div>
          ))}
        </section>

        <section style={{ marginTop: 100 }}>
          <h2 style={{ fontSize: "clamp(48px,7vw,96px)", letterSpacing: "-0.08em" }}>
            O Atlas agora ganha forma de produto.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 26, lineHeight: 1.9 }}>
            O próximo estágio é construir cada módulo como uma experiência funcional conectada ao núcleo CRM, IA e dados.
          </p>
        </section>
      </div>
    </main>
  );
}
