const indicators = [
  { title: "Atendimentos", value: "1.842" },
  { title: "Tempo médio de resposta", value: "3 min" },
  { title: "Follow-ups realizados", value: "6.420" },
  { title: "Tarefas concluídas", value: "94%" },
];

export default function PerformanceAnalyticsPage() {
  return (
    <main className="space-y-8">
      <header>
        <p className="atlas-eyebrow">Performance Analytics</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
          Produtividade comercial
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          Acompanhe volume de atendimento, velocidade de resposta, execução de follow-ups e produtividade da equipe.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map((item, index) => (
          <article key={item.title} className={`atlas-metric atlas-metric-${["blue", "green", "violet", "amber"][index]}`}>
            <p className="text-sm text-slate-400">{item.title}</p>
            <p className="mt-4 text-3xl font-black tracking-[-0.04em] text-white">{item.value}</p>
            <p className="mt-3 text-xs text-slate-500">Indicador consolidado da operação</p>
          </article>
        ))}
      </section>

      <section className="atlas-panel p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Eficiência operacional</h2>
            <p className="mt-1 text-sm text-slate-400">Base pronta para comparação por corretor, equipe, canal e período.</p>
          </div>
          <span className="atlas-badge atlas-badge-success">OPERAÇÃO MONITORADA</span>
        </div>
      </section>
    </main>
  );
}
