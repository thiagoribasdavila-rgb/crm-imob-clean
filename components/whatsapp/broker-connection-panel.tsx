"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

/**
 * CONECTAR O WHATSAPP DO CORRETOR.
 *
 * ── O aviso fica na tela, não na documentação ───────────────────────────────
 *
 * A conexão por QR usa biblioteca não oficial e contraria os termos do
 * WhatsApp. O risco recai sobre o número PESSOAL do corretor, não sobre a
 * empresa — então quem corre o risco tem que ler o aviso antes de decidir, na
 * mesma tela do botão. Escondê-lo num manual seria transferir o risco sem
 * transferir a informação.
 *
 * ── O QR expira ────────────────────────────────────────────────────────────
 *
 * O WhatsApp troca o código a cada ~20 segundos. Por isso a tela pergunta de
 * novo enquanto está pareando, e para de perguntar assim que conecta — ficar
 * consultando uma sessão estável é gastar bateria e servidor à toa.
 */

type Estado = {
  status: "desconectado" | "aguardando_qr" | "conectado" | "falhou" | "banido";
  qr: string | null;
  telefone: string;
  conectadoDesde: string | null;
  ultimaAtividade: string | null;
  erro: string | null;
  ponteAtiva: boolean;
  ponteConfigurada: boolean;
  aviso: string;
};

const ROTULO: Record<Estado["status"], { texto: string; cor: string }> = {
  desconectado: { texto: "Desconectado", cor: "neutro" },
  aguardando_qr: { texto: "Leia o código no celular", cor: "atencao" },
  conectado: { texto: "Conectado", cor: "ok" },
  falhou: { texto: "Falhou", cor: "erro" },
  banido: { texto: "Recusado pelo WhatsApp", cor: "erro" },
};

export function BrokerConnectionPanel() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmouRisco, setConfirmouRisco] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const consultar = useCallback(async () => {
    const { data: s } = await supabase.auth.getSession();
    const r = await fetch("/api/v1/whatsapp/session", {
      headers: { Authorization: `Bearer ${s.session?.access_token || ""}` },
    });
    if (!r.ok) return;
    const corpo = await r.json();
    setEstado(corpo.data);
    return corpo.data as Estado;
  }, []);

  useEffect(() => {
    void consultar();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [consultar]);

  // Enquanto está pareando, o código muda a cada ~20s — consultar a cada 4s
  // mantém a imagem válida. Conectado, não há o que consultar.
  useEffect(() => {
    if (estado?.status !== "aguardando_qr") return;
    timer.current = setTimeout(() => { void consultar(); }, 4000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [estado, consultar]);

  async function agir(action: "conectar" | "desconectar") {
    setOcupado(true);
    try {
      const { data: s } = await supabase.auth.getSession();
      const r = await fetch("/api/v1/whatsapp/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token || ""}` },
        body: JSON.stringify({ action }),
      });
      const corpo = await r.json();
      if (r.ok) setEstado((atual) => (atual ? { ...atual, ...corpo.data } : atual));
      else setEstado((atual) => (atual ? { ...atual, erro: corpo?.error?.message ?? "Não foi possível." } : atual));
      await consultar();
    } finally {
      setOcupado(false);
    }
  }

  if (!estado) return <p className="atlas-wa-carregando">Verificando sua conexão…</p>;

  const rotulo = ROTULO[estado.status];
  const conectado = estado.status === "conectado";

  return (
    <div className="atlas-wa">
      <div className="atlas-wa-cabeca">
        <span className="atlas-wa-farol" data-cor={rotulo.cor} />
        <div>
          <p className="atlas-wa-status">{rotulo.texto}</p>
          {conectado ? (
            <p className="atlas-wa-sub">
              {estado.telefone}
              {estado.conectadoDesde
                ? ` · desde ${new Date(estado.conectadoDesde).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                : ""}
            </p>
          ) : (
            <p className="atlas-wa-sub">
              <strong className="atlas-wa-consequencia">Você não está recebendo leads novas.</strong>{" "}
              O rodízio só distribui para quem está com o WhatsApp conectado.
            </p>
          )}
        </div>
      </div>

      {!estado.ponteConfigurada ? (
        <p className="atlas-wa-aviso">
          A ponte de WhatsApp não está configurada neste servidor. Fale com quem cuida da infraestrutura —
          faltam <code>ATLAS_WHATSAPP_BRIDGE_SECRET</code> e o processo <code>atlas-whatsapp-bridge</code>.
        </p>
      ) : null}

      {estado.ponteConfigurada && !estado.ponteAtiva ? (
        <p className="atlas-wa-aviso">
          A ponte não respondeu agora. O estado abaixo é o último que o CRM conhecia.
        </p>
      ) : null}

      {estado.erro ? <p className="atlas-wa-erro">{estado.erro}</p> : null}

      {estado.status === "aguardando_qr" && estado.qr ? (
        <div className="atlas-wa-qr">
          {/* O QR vem como data URL da ponte e troca a cada poucos segundos. */}
          <Image src={estado.qr} alt="Código QR para conectar o WhatsApp" width={240} height={240} unoptimized />
          <ol>
            <li>Abra o WhatsApp no celular</li>
            <li>Toque em <strong>Aparelhos conectados</strong></li>
            <li>Toque em <strong>Conectar um aparelho</strong></li>
            <li>Aponte a câmera para este código</li>
          </ol>
        </div>
      ) : null}

      {/* O aviso de risco vem ANTES do botão e precisa ser marcado. Quem corre
          o risco é o dono do número — ele decide sabendo. */}
      {!conectado && estado.ponteConfigurada ? (
        <label className="atlas-wa-risco">
          <input
            type="checkbox"
            checked={confirmouRisco}
            onChange={(e) => setConfirmouRisco(e.target.checked)}
          />
          <span>{estado.aviso}</span>
        </label>
      ) : null}

      <div className="atlas-wa-acoes">
        {conectado ? (
          <button type="button" onClick={() => void agir("desconectar")} disabled={ocupado}>
            {ocupado ? "Desconectando…" : "Desconectar"}
          </button>
        ) : (
          <button
            type="button"
            data-primario="true"
            onClick={() => void agir("conectar")}
            disabled={ocupado || !confirmouRisco || !estado.ponteConfigurada}
          >
            {ocupado ? "Gerando código…" : "📱 Conectar meu WhatsApp"}
          </button>
        )}
      </div>

      {conectado ? (
        <p className="atlas-wa-nota">
          Você está no rodízio de leads novas. Cada conversa <strong>com uma lead</strong> entra
          sozinha no histórico dela — sem você copiar nada.
        </p>
      ) : null}

      {/* O corretor está pondo o WhatsApp PESSOAL numa ferramenta da empresa.
          O limite do que é gravado tem que estar escrito onde ele decide, com
          a mesma clareza do aviso de risco. */}
      <p className="atlas-wa-privacidade">
        🔒 <strong>Só conversa de lead é gravada.</strong> Antes de guardar qualquer coisa, o
        sistema confere se o número está cadastrado como lead da imobiliária. Se não estiver, a
        mensagem não é registrada — e nem chega a sair do seu servidor: nem o texto, nem o
        contato, nem o registro de que existiu. Suas conversas particulares continuam suas.
      </p>
    </div>
  );
}

export default BrokerConnectionPanel;
