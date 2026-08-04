"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { decidirAnuncio, podarAvisados, type ChegadaConhecida } from "@/lib/crm/aviso-fora-da-aba";

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
  /** Quem chegou: nome, origem e espera. Vazio quando não há nada pendente. */
  chegadas: ChegadaConhecida[];
  /** Marca tudo como visto (chamado ao abrir a lista de leads). */
  marcarComoVisto: () => Promise<void>;
  /**
   * Pede ao navegador a permissão de aviso. Só pode ser chamada de dentro de um
   * gesto da pessoa — o navegador ignora (e alguns punem) pedidos automáticos.
   */
  pedirPermissaoDeAviso: () => Promise<"concedida" | "negada" | "indisponivel">;
  /** O estado atual da permissão, para a tela poder oferecer o botão certo. */
  permissaoDeAviso: "concedida" | "negada" | "nao-pedida" | "indisponivel";
};

/** Onde a memória de "já avisei sobre esta lead" sobrevive ao recarregar. */
const CHAVE_DOS_AVISADOS = "atlas:leads-avisadas";

function lerAvisados(): string[] {
  try {
    const cru = window.localStorage.getItem(CHAVE_DOS_AVISADOS);
    const lista = cru ? (JSON.parse(cru) as unknown) : [];
    return Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // `localStorage` bloqueado (aba anônima, política de terceiros) não pode
    // derrubar o alerta: sem memória, o pior que acontece é avisar de novo.
    return [];
  }
}

function gravarAvisados(ids: string[]): void {
  try {
    window.localStorage.setItem(CHAVE_DOS_AVISADOS, JSON.stringify(podarAvisados(ids)));
  } catch { /* idem */ }
}

/**
 * O som do aviso, sintetizado — sem arquivo, sem rede.
 *
 * Duas notas curtas e baixas (0,05 de volume). Um arquivo de áudio custaria uma
 * requisição no caminho quente e um asset para versionar; e um som ALTO é a
 * segunda forma mais rápida de fazer alguém desligar o aviso, logo depois de
 * avisar duas vezes sobre a mesma lead.
 *
 * Falha em silêncio de propósito: navegador que bloqueia áudio sem gesto prévio
 * não pode derrubar a notificação, que é a parte que importa.
 */
function tocarAviso(): void {
  try {
    const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Contexto) return;
    const contexto = new Contexto();
    if (contexto.state === "suspended") { void contexto.close(); return; }
    [0, 0.14].forEach((atraso, indice) => {
      const oscilador = contexto.createOscillator();
      const ganho = contexto.createGain();
      oscilador.type = "sine";
      oscilador.frequency.value = indice === 0 ? 880 : 1174;
      ganho.gain.setValueAtTime(0.0001, contexto.currentTime + atraso);
      ganho.gain.exponentialRampToValueAtTime(0.05, contexto.currentTime + atraso + 0.01);
      ganho.gain.exponentialRampToValueAtTime(0.0001, contexto.currentTime + atraso + 0.12);
      oscilador.connect(ganho).connect(contexto.destination);
      oscilador.start(contexto.currentTime + atraso);
      oscilador.stop(contexto.currentTime + atraso + 0.13);
    });
    window.setTimeout(() => void contexto.close(), 600);
  } catch { /* som é acessório; o aviso não depende dele */ }
}

export function useAlertaDeLeadNova(): AlertaDeLeadNova {
  const [novas, setNovas] = useState(0);
  const [estado, setEstado] = useState<EstadoDoAlerta>("indisponivel");
  const [verificadoEm, setVerificadoEm] = useState<number | null>(null);
  const [chegouAgora, setChegouAgora] = useState(false);
  const [chegadas, setChegadas] = useState<ChegadaConhecida[]>([]);
  const [permissaoDeAviso, setPermissaoDeAviso] = useState<AlertaDeLeadNova["permissaoDeAviso"]>("indisponivel");
  const anterior = useRef(0);
  /** `false` até a primeira leitura completar — ver a regra 3 do módulo puro. */
  const linhaDeBase = useRef(false);

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
      const corpo = (await resposta.json()) as { data?: { novas?: number; chegadas?: ChegadaConhecida[] } };
      const total = Number(corpo?.data?.novas ?? 0);
      const lista = Array.isArray(corpo?.data?.chegadas) ? corpo.data.chegadas : [];
      // A animação só dispara quando o número SOBE. Repetir o pulso a cada
      // releitura com o mesmo valor é o que treina o olho a ignorar.
      setChegouAgora(total > anterior.current);
      anterior.current = total;
      setNovas(total);
      setChegadas(lista);
      setEstado(total > 0 ? "chegou" : "nenhuma");
      setVerificadoEm(Date.now());

      // ── O AVISO QUE SAI DA ABA ────────────────────────────────────────────
      //
      // A decisão inteira mora em `lib/crm/aviso-fora-da-aba.ts`, testada: uma
      // vez por lead, nada com a aba visível, nada na primeira leitura. Aqui só
      // sobra o efeito.
      const anuncio = decidirAnuncio(lista, {
        jaAvisados: new Set(lerAvisados()),
        linhaDeBaseEstabelecida: linhaDeBase.current,
        abaVisivel: document.visibilityState === "visible",
      });
      gravarAvisados(anuncio.proximosAvisados);
      linhaDeBase.current = true;

      if (anuncio.titulo && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const aviso = new Notification(anuncio.titulo, {
          body: anuncio.corpo ?? undefined,
          // `tag` faz o navegador SUBSTITUIR o aviso anterior em vez de
          // empilhar. Três leads em três minutos viram um aviso atualizado, não
          // três caixas para fechar uma a uma.
          tag: "atlas-lead-nova",
          // `app/icon.svg` é servido pelo Next em `/icon.svg`. Um caminho que
          // não existe faz o aviso aparecer sem ícone em vez de falhar, mas
          // apontar para nada seria mentira no código.
          icon: "/icon.svg",
        });
        aviso.onclick = () => {
          window.focus();
          if (anuncio.destino) window.location.assign(anuncio.destino);
          aviso.close();
        };
        tocarAviso();
      }
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
      setChegadas([]);
      setEstado("nenhuma");
      setVerificadoEm(Date.now());
    } catch {
      // Falhou marcar: o aviso continua aceso, que é o lado seguro do erro.
    }
  }, []);

  // O estado da permissão é lido, nunca pedido automaticamente: pedir sem gesto
  // é ignorado pelos navegadores modernos e queima a única chance de pedir.
  useEffect(() => {
    if (typeof Notification === "undefined") { setPermissaoDeAviso("indisponivel"); return; }
    setPermissaoDeAviso(
      Notification.permission === "granted" ? "concedida"
        : Notification.permission === "denied" ? "negada"
          : "nao-pedida",
    );
  }, []);

  const pedirPermissaoDeAviso = useCallback(async () => {
    if (typeof Notification === "undefined") return "indisponivel" as const;
    const resultado = await Notification.requestPermission();
    const traduzido = resultado === "granted" ? ("concedida" as const) : ("negada" as const);
    setPermissaoDeAviso(traduzido);
    return traduzido;
  }, []);

  const horario = verificadoEm
    ? new Date(verificadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;
  // A pastilha passa a NOMEAR quem chegou. "3 leads novas" manda procurar;
  // "Chiara Ferro, Hericles Lima e mais 1" já diz o que a pessoa vai encontrar,
  // e é o mesmo texto que o leitor de tela recita.
  const quem = chegadas.length
    ? chegadas.slice(0, 2).map((c) => c.nome).join(", ") + (chegadas.length > 2 ? ` e mais ${chegadas.length - 2}` : "")
    : null;
  const explicacao =
    estado === "nao-medido"
      ? `Não consegui verificar as chegadas${horario ? ` desde ${horario}` : ""}.`
      : estado === "chegou"
        ? `${novas} ${novas === 1 ? "lead nova esperando" : "leads novas esperando"}${quem ? `: ${quem}` : ""}${horario ? ` · verificado às ${horario}` : ""}`
        : "Nenhuma lead nova.";

  return { estado, novas, chegouAgora, explicacao, chegadas, marcarComoVisto, pedirPermissaoDeAviso, permissaoDeAviso };
}
