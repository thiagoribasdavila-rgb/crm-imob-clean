"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Task = {
  id: string;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: string;
  status: string;
};

export default function TasksPage() {
  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, description, due_at, priority, status")
        .order("due_at", { ascending: true, nullsFirst: false });

      if (error) setError(error.message);
      setItems((data as Task[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const open = items.filter((item) => item.status !== "concluida").length;
  const urgent = items.filter((item) => item.priority === "alta" && item.status !== "concluida").length;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-300">Execution Engine</p>
        <h1 className="mt-2 text-3xl font-black">Tarefas e follow-up</h1>
        <p className="mt-2 text-zinc-400">Fila operacional para corretores, gestores e agentes de IA.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><p className="text-sm text-zinc-400">Pendentes</p><p className="mt-2 text-3xl font-black">{open}</p></div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><p className="text-sm text-zinc-400">Alta prioridade</p><p className="mt-2 text-3xl font-black text-amber-300">{urgent}</p></div>
      </div>

      {error && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}

      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl border border-zinc-800 p-8 text-zinc-400">Carregando tarefas...</div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-zinc-800 p-8 text-zinc-400">Nenhuma tarefa cadastrada.</div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:flex-row sm:items-center">
              <div><h2 className="font-bold">{item.title}</h2><p className="mt-1 text-sm text-zinc-400">{item.description || "Sem descrição"}</p></div>
              <div className="flex items-center gap-3 text-xs">
                <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-300">{item.priority}</span>
                <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-300">{item.status}</span>
                <span className="text-zinc-500">{item.due_at ? new Date(item.due_at).toLocaleString("pt-BR") : "Sem prazo"}</span>
              </div>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
