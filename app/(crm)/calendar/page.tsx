"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Item = { id:string; title:string; due_at:string|null; priority:string; status:string };

export default function CalendarPage(){
  const [items,setItems]=useState<Item[]>([]);
  useEffect(()=>{ void (async()=>{ const {data}=await supabase.from("tasks").select("id,title,due_at,priority,status").order("due_at"); setItems((data??[]) as Item[]); })(); },[]);
  const groups=items.reduce<Record<string,Item[]>>((acc,item)=>{ const key=item.due_at?new Date(item.due_at).toLocaleDateString("pt-BR"):"Sem data"; (acc[key]??=[]).push(item); return acc; },{});
  return <div className="space-y-6"><header><p className="text-sm uppercase tracking-[.2em] text-blue-400">Agenda</p><h1 className="mt-2 text-3xl font-black">Calendário operacional</h1></header>{Object.entries(groups).map(([date,list])=><section key={date} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="font-bold">{date}</h2><div className="mt-4 space-y-3">{list.map(item=><div key={item.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-4"><div><p className="font-semibold">{item.title}</p><p className="text-xs text-zinc-500">Prioridade: {item.priority}</p></div><span className="text-xs text-zinc-400">{item.status}</span></div>)}</div></section>)}{items.length===0&&<p className="text-zinc-500">Nenhum compromisso agendado.</p>}</div>;
}