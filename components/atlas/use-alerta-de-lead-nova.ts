"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";

/**
 * O AVISO DE LEAD NOVA — e a disciplina de não mentir quando não sabe.
 *
 * ── POR QUE RELEITURA E NÃO TEMPO REAL ───────────────────────────────────────
 *
 * O caminho óbvio seria assinar `public.leads` pelo Supabase Realtime. Ele está
 * fora de questão, e não por preguiça: as políticas de `leads` são todas
 * PERMISSIVE e a `leads_org_access` libera a organização inteira. O navegador
 * fala DIRETO com o servidor de realtime, sem passar pela aplicação, então o
 * piso de carteira não vale ali. Um corretor assinaria o canal pelo console e
 * receberia `payload.new` completo — nome, telefone, e-mail, orçamento — de
 * leads dos colegas. E não apareceria em teste nenhum, porque na tela o filtro
 * do cliente esconderia tudo. É o mesmo vazamento que a tela `/customers` tinha
 * e que foi apagado nesta entrega.
 *
 * Releitura a cada 60s custa uma consulta indexada e não abre esse buraco.
 *
 * ── OS QUATRO ESTADOS, E POR QUE ELES EXISTEM ────────────────────────────────
 *
 * · `nenhuma`      — verificado agora, não há nada. Não desenha nada.
 * · `chegou`       — há N esperando.
 * · `nao-medido`   — a última verificação falhou OU envelheceu além do limite.
 *                    Desenha um anel vazio com "?", nunca "0".
 * · `indisponivel` — ainda não deu tempo de perguntar nem uma vez. Nada.
 *
 * A distinção entre `nenhuma` e `nao-medido` é a regra do projeto ("ausência de
 * dado nunca vira zero") virando comportamento imposto pelo código. Um badge
 * mostrando "0" sobre uma fila que ninguém conseguiu ler confirma a falsa
 * tranquilidade em vez de denunciá-la.
 */

export type EstadoDoAlerta = "indisponivel" | "nenhuma" | "chegou" | "nao-medido";

const INTERVALO_MS = 60_000;
// Depois disto, o último número lido deixa de valer. Três ciclos: tolera um
// blip de rede sem começar a mentir por muito tempo.
const VALIDADE_MS = 180_000;

export type AlertaDeLeadNova = {
  estado: EstadoDoAlerta;
  novas: number;
  /** Verdadeiro no ciclo em que o número SUBIU — dispara a animação uma vez. */
  chegouAgora: boolean;
  /** Frase pronta para title/leitor de tela. Sempre diz de quando é o dado. */
  explicacao: string;
  /** Marca tudo como visto (chamado ao abrir a lista de leads). */
  marcarComoVisto: () => Promise<void>;
};

export function useAlertaDeLeadNova(): AlertaDeLeadNova {
  const [novas, setNovas] = useState(0);
  const [estado, setEstado] = useState<EstadoDoAlerta>("indisponivel");
  const [verificadoEm, setVerificadoEm] = useState<number | null>(null);
  const [chegouAgora, setChegouAgora] = useState(false);
  const anterior = useRef(0);

  const verificar = useCallback(async () => {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) return; // Sem sessão não é falha de medição: é não haver quem medir.
      const resposta = await fetch("/api/v1/crm/alertas-de-lead", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!resposta.ok) throw new Error(String(resposta.status));
      const corpo = (await resposta.json()) as { data?: { novas?: number } };
      const total = Number(corpo?.data?.novas ?? 0);
      // A animação só dispara quando o número SOBE. Repetir o pulso a cada
      // releitura com o mesmo valor é o que treina o olho a ignorar.
      setChegouAgora(total > anterior.current);
      anterior.current = total;
      setNovas(total);
      setEstado(total > 0 ? "chegou" : "nenhuma");
      setVerificadoEm(Date.now());
    } catch {
      // Nunca zera `novas`: o último número conhecido continua sendo a melhor
      // informação disponível, e o estado passa a declarar que ela envelheceu.
      setEstado("nao-medido");
    }
  }, []);

  useEffect(() => {
    void verificar();
    const relogio = window.setInterval(() => void verificar(), INTERVALO_MS);
    // Voltar para a aba relê na hora: quem passou a manhã em outra aba não
    // deveria esperar até um minuto para ver o que chegou.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") void verificar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    // Navegar dentro da aplicação não dispara visibilitychange. Quando a lista
    // de leads marca os avisos como vistos, ela avisa por evento — senão a
    // pastilha ficaria acesa por até um minuto sobre algo que a pessoa acabou
    // de abrir, que é a forma mais rápida de ensinar a ignorá-la.
    const aoMarcar = () => void verificar();
    window.addEventListener("atlas:leads-vistas", aoMarcar);
    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("atlas:leads-vistas", aoMarcar);
    };
  }, [verificar]);

  // Rebaixamento por idade: um número lido há 5 minutos não é "o número agora".
  useEffect(() => {
    if (estado !== "chegou" && estado !== "nenhuma") return;
    const restante = verificadoEm ? verificadoEm + VALIDADE_MS - Date.now() : 0;
    const relogio = window.setTimeout(() => setEstado("nao-medido"), Math.max(0, restante));
    return () => window.clearTimeout(relogio);
  }, [estado, verificadoEm]);

  // A animação dura um ciclo de render, não um estado permanente.
  useEffect(() => {
    if (!chegouAgora) return;
    const relogio = window.setTimeout(() => setChegouAgora(false), 900);
    return () => window.clearTimeout(relogio);
  }, [chegouAgora]);

  const marcarComoVisto = useCallback(async () => {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const token = sessao.session?.access_token;
      if (!token) return;
      await fetch("/api/v1/crm/alertas-de-lead", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      anterior.current = 0;
      setNovas(0);
      setEstado("nenhuma");
      setVerificadoEm(Date.now());
    } catch {
      // Falhou marcar: o aviso continua aceso, que é o lado seguro do erro.
    }
  }, []);

  const horario = verificadoEm
    ? new Date(verificadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  const explicacao =
    estado === "nao-medido"
      ? `Não consegui verificar as chegadas${horario ? ` desde ${horario}` : ""}.`
      : estado === "chegou"
        ? `${novas} ${novas === 1 ? "lead nova esperando" : "leads novas esperando"}${horario ? ` · verificado às ${horario}` : ""}`
        : "Nenhuma lead nova.";

  return { estado, novas, chegouAgora, explicacao, marcarComoVisto };
}
