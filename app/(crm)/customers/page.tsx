"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { isMissingRelation } from "@/lib/compat/legacy-v2";

type Customer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_type: string | null;
  income: number | null;
  created_at: string;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function CustomersPage() {
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState("all");

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: loadError } = await supabase
        .from("customers")
        .select("id, full_name, email, phone, profile_type, income, created_at")
        .order("created_at", { ascending: false });
      if (!active) return;
      if (loadError && isMissingRelation(loadError)) {
        const leads = await supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(5000);
        if (leads.error) setError("Não foi possível carregar a visão unificada de clientes.");
        else setItems(((leads.data ?? []) as Record<string, unknown>[]).map((lead) => ({ id:String(lead.id), full_name:String(lead.name||"Cliente sem nome"), email:typeof lead.email==="string"?lead.email:null, phone:typeof lead.phone==="string"?lead.phone:null, profile_type:typeof lead.profile_type==="string"?lead.profile_type:"Comprador", income:Number(lead.monthly_income||0)||null, created_at:String(lead.created_at) })));
      } else {
        if (loadError) setError("Não foi possível carregar a visão unificada de clientes.");
        setItems((data as Customer[]) ?? []);
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const profiles = useMemo(() => [...new Set(items.map((item) => item.profile_type || "Comprador"))].sort(), [items]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return items.filter((item) => {
      const matchesProfile = profile === "all" || (item.profile_type || "Comprador") === profile;
      const matchesQuery = !normalized || [item.full_name, item.email, item.phone].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized));
      return matchesProfile && matchesQuery;
    });
  }, [items, profile, query]);
  const withContact = items.filter((item) => Boolean(item.email || item.phone)).length;
  const withIncome = items.filter((item) => Number(item.income || 0) > 0).length;
  const completeness = items.length ? Math.round(((withContact + withIncome) / (items.length * 2)) * 100) : 0;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        eyebrow="Customer 360 · Fonte única"
        title="Clientes"
        description="Compradores, investidores e relacionamentos comerciais reunidos em uma visão pesquisável e segura."
        actions={<Link className="atlas-button-primary" href="/leads/new">Novo cliente</Link>}
      />
      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric label="Clientes visíveis" value={loading ? "—" : items.length} detail="Respeitando seu escopo comercial" trend="360" tone="blue" />
        <AtlasMetric label="Com contato" value={loading ? "—" : withContact} detail="Telefone ou e-mail disponível" trend="DADOS" tone="green" />
        <AtlasMetric label="Perfil financeiro" value={loading ? "—" : withIncome} detail="Renda informada para qualificação" trend="FIT" tone="violet" />
        <AtlasMetric label="Completude essencial" value={loading ? "—" : `${completeness}%`} detail="Contato e capacidade financeira" trend="QUALIDADE" tone={completeness >= 70 ? "green" : "amber"} />
      </section>
      <AtlasCard>
        <AtlasCardHeader eyebrow="Lista inteligente" title="Base unificada" description="Encontre rapidamente uma pessoa e identifique o próximo dado que falta para personalizar o atendimento." action={<AtlasBadge tone="success">SEM DUPLICAR HISTÓRICO</AtlasBadge>} />
        <div className="grid gap-3 border-b border-white/[.06] p-4 sm:grid-cols-[1fr_240px] sm:p-5">
          <label className="relative"><span className="sr-only">Buscar cliente</span><input className="w-full px-4" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nome, telefone ou e-mail" /></label>
          <label><span className="sr-only">Filtrar por perfil</span><select className="w-full px-4" value={profile} onChange={(event) => setProfile(event.target.value)}><option value="all">Todos os perfis</option>{profiles.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
        </div>
        {loading ? <div className="grid gap-3 p-5">{[1, 2, 3].map((item) => <AtlasSkeleton className="h-20" key={item} />)}</div> : visible.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[760px] text-sm">
              <thead><tr><th>Cliente</th><th>Contato</th><th>Perfil</th><th>Renda</th><th>Qualidade</th><th>Entrada</th></tr></thead>
              <tbody>{visible.map((item) => {
                const contact = item.email || item.phone;
                const complete = Boolean(contact && item.income);
                return <tr key={item.id}>
                  <td><strong className="text-white">{item.full_name}</strong><span className="mt-1 block text-[10px] text-slate-600">ID {item.id.slice(0, 8)}</span></td>
                  <td className="text-slate-400">{contact || "Contato pendente"}</td>
                  <td><AtlasBadge tone="info">{item.profile_type || "Comprador"}</AtlasBadge></td>
                  <td className="text-slate-300">{item.income ? money.format(item.income) : "Não informada"}</td>
                  <td><AtlasBadge tone={complete ? "success" : "warning"}>{complete ? "ESSENCIAL OK" : "ENRIQUECER"}</AtlasBadge></td>
                  <td className="text-slate-500">{new Date(item.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <div className="p-5"><AtlasEmpty title={items.length ? "Nenhum cliente neste filtro" : "Nenhum cliente cadastrado"} description={items.length ? "Altere a busca ou o perfil para ampliar os resultados." : "Cadastre a primeira lead para iniciar a memória comercial unificada."} action={items.length ? <button className="atlas-button-secondary" onClick={() => { setQuery(""); setProfile("all"); }}>Limpar filtros</button> : <Link className="atlas-button-primary" href="/leads/new">Cadastrar lead</Link>} /></div>}
      </AtlasCard>
    </div>
  );
}
