const investor = [
  ["Problema", "Operações imobiliárias ainda dependem de processos manuais e dados desconectados."],
  ["Solução", "Um sistema operacional com IA para decisões comerciais inteligentes."],
  ["Mercado", "A próxima geração de PropTech será orientada por inteligência artificial."],
];

const roadmap = [
  "CRM Intelligence",
  "AI Copilot",
  "Autonomous Agents",
  "Market Intelligence",
  "Real Estate Network",
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
          <a href="/login" className="atlas-card" style={{ padding: "14px 30px" }}>Acessar</a>
        </header>

        <section className="atlas-card" style={{ padding: "clamp(60px,10vw,150px)" }}>
          <div style={{ color: "#38bdf8", fontWeight: 900, letterSpacing: ".2em" }}>
            INVESTOR PRESENTATION
          </div>
          <h1 className="atlas-gradient-text" style={{ fontSize: "clamp(64px,12vw,160px)", lineHeight: .84, letterSpacing: "-0.12em" }}>
            Construindo o sistema operacional do mercado imobiliário.
          </h1>
          <p style={{ maxWidth: 1000, fontSize: 28, lineHeight: 1.7, color: "#cbd5e1" }}>
            O Atlas conecta dados, inteligência artificial e automação para transformar como empresas imobiliárias operam, vendem e crescem.
          </p>
        </section>

        <section style={{ marginTop: 60, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18 }}>
          {investor.map(([title, text]) => (
            <article className="atlas-card" key={title} style={{ padding: 34 }}>
              <h2>{title}</h2>
              <p style={{ color: "var(--muted)", lineHeight: 1.8 }}>{text}</p>
            </article>
          ))}
        </section>

        <section className="atlas-card" style={{ marginTop: 80, padding: 50 }}>
          <h2>Atlas Roadmap</h2>
          {roadmap.map((item, index) => (
            <div key={item} style={{ marginTop: 14, padding: 18, borderRadius: 14, border: "1px solid var(--border)" }}>
              {index + 1}. {item}
            </div>
          ))}
        </section>

        <section style={{ marginTop: 80 }}>
          <h2 style={{ fontSize: "clamp(40px,6vw,72px)", letterSpacing: "-0.06em" }}>
            De CRM para inteligência operacional.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: 22, lineHeight: 1.8 }}>
            O Atlas nasce para criar uma nova categoria: Real Estate Operating System, unindo tecnologia, dados e inteligência artificial para o futuro do mercado imobiliário.
          </p>
        </section>
      </div>
    </main>
  );
}
