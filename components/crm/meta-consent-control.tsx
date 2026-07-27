"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * REGISTRAR SE O CLIENTE AUTORIZOU COMPARTILHAR OS DADOS COM A META.
 *
 * ── Por que isto ganhou lugar na tela da lead ───────────────────────────────
 *
 * Medido no banco vivo: 217 leads, TODAS com e-mail ou telefone, sete já em
 * etapa que dispara evento de conversão — e zero prontas para enviar. Faltava
 * uma coisa só, em todas: ninguém registrou o consentimento.
 *
 * Enquanto isso não é registrado, a Meta não recebe de volta quem virou visita,
 * proposta ou venda. E sem esse retorno ela otimiza a entrega para gerar mais
 * formulários preenchidos — que é o que ela consegue medir. A verba vai para
 * lead que nunca ia fechar.
 *
 * ── As três respostas ───────────────────────────────────────────────────────
 *
 * "Não perguntei" existe de propósito. Sem ela, o corretor com pressa marcaria
 * "sim" só para tirar o aviso da frente — e um "sim" que não aconteceu é pior
 * que um "não sei", porque vira base legal falsa.
 */

type Estado = "concedido" | "negado" | "nao_perguntado";

const OPCOES: Array<{ estado: Estado; rotulo: string; dica: string }> = [
  { estado: "concedido", rotulo: "✓ Autorizou", dica: "O cliente concordou em compartilhar os dados com a Meta" },
  { estado: "negado", rotulo: "✕ Não autorizou", dica: "O cliente recusou — esta lead nunca será enviada" },
  { estado: "nao_perguntado", rotulo: "— Ainda não perguntei", dica: "Resposta honesta; a lead não é enviada até você perguntar" },
];

export function MetaConsentControl({
  leadId,
  estadoInicial = "nao_perguntado",
  podeEditar = true,
}: {
  leadId: string;
  estadoInicial?: Estado;
  podeEditar?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function registrar(novo: Estado) {
    if (novo === estado || ocupado) return;
    setOcupado(true);
    setErro(null);
    const anterior = estado;
    setEstado(novo); // otimista: o corretor vê a resposta na hora
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch("/api/v1/crm/leads/meta-consent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessao.session?.access_token || ""}`,
        },
        body: JSON.stringify({ leadId, estado: novo }),
      });
      if (!r.ok) {
        const corpo = await r.json().catch(() => null);
        setEstado(anterior); // desfaz: gravar consentimento que não gravou é o pior erro possível
        setErro(corpo?.error?.message ?? "Não foi possível registrar.");
      }
    } catch {
      setEstado(anterior);
      setErro("Falha de rede — nada foi registrado.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="atlas-consent">
      <p className="atlas-consent-titulo">
        Compartilhar dados com a Meta
        {estado === "concedido" ? null : (
          <span className="atlas-consent-consequencia">
            {" "}· sem isto, o resultado desta lead não volta para otimizar a campanha
          </span>
        )}
      </p>
      <div className="atlas-consent-opcoes">
        {OPCOES.map((o) => (
          <button
            key={o.estado}
            type="button"
            title={o.dica}
            data-ativo={estado === o.estado}
            data-estado={o.estado}
            disabled={!podeEditar || ocupado}
            onClick={() => void registrar(o.estado)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {erro ? <p className="atlas-consent-erro">{erro}</p> : null}
      {!podeEditar ? (
        <p className="atlas-consent-nota">Só quem atende a lead — ou a liderança — registra isto.</p>
      ) : null}
    </div>
  );
}

export default MetaConsentControl;
