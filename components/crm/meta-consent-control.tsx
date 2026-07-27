"use client";

import { useEffect, useState } from "react";
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
  podeEditar,
}: {
  leadId: string;
  estadoInicial?: Estado;
  /** Deixe indefinido para o componente decidir pelo papel da sessão. */
  podeEditar?: boolean;
}) {
  const [estado, setEstado] = useState<Estado>(estadoInicial);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState(false);
  /**
   * Só o DIRETOR registra — ele responde pela base legal de todas as leads.
   *
   * O papel vem do PRÓPRIO token da sessão, que o navegador já tem: nenhuma
   * chamada extra por lead. E o servidor recusa de qualquer jeito (403) — isto
   * aqui existe para o corretor não descobrir a regra levando erro depois de
   * clicar.
   */
  const [ehDiretor, setEhDiretor] = useState<boolean | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!vivo) return;
      const t = data.session?.access_token;
      if (!t) { setEhDiretor(false); return; }
      try {
        const carga = JSON.parse(atob(t.split(".")[1] ?? "")) as Record<string, unknown>;
        const meta = (carga.app_metadata ?? {}) as Record<string, unknown>;
        const papel = String(meta.access_role ?? meta.role ?? "");
        setEhDiretor(papel === "director" || papel === "admin");
      } catch {
        // Token ilegível: assume que NÃO pode. Errar para o lado de não
        // oferecer é melhor que oferecer e o servidor recusar.
        setEhDiretor(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const editavel = podeEditar ?? ehDiretor ?? false;

  /**
   * Resolvido = já respondido. 204 das 217 leads do banco vivo já têm
   * consentimento; mostrar três botões pedindo decisão em todas elas é pedir
   * ao corretor que reconfirme 204 vezes algo que já está feito.
   *
   * Resolvido vira uma linha discreta que ele pode abrir se quiser mudar. Só o
   * "ainda não perguntei" continua pedindo atenção — porque só ele bloqueia.
   */
  const resolvido = estado !== "nao_perguntado";

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

  // Resolvido e fechado: uma linha, sem pedir nada.
  if (resolvido && !aberto) {
    return (
      <button
        type="button"
        className="atlas-consent-resumo"
        data-estado={estado}
        onClick={() => setAberto(true)}
        disabled={!editavel}
        title={editavel ? "Clique para alterar" : undefined}
      >
        {estado === "concedido"
          ? "✓ Cliente autorizou compartilhar dados com a Meta"
          : "✕ Cliente não autorizou — esta lead não é enviada"}
        {editavel ? <span> · alterar</span> : null}
      </button>
    );
  }

  return (
    <div className="atlas-consent" data-pendente={!resolvido}>
      <p className="atlas-consent-titulo">
        {resolvido
          ? "Compartilhar dados com a Meta"
          : editavel
            ? "O cliente autorizou compartilhar os dados com a Meta?"
            : "Consentimento ainda não registrado"}
        {resolvido ? null : (
          <span className="atlas-consent-consequencia">
            {" "}Enquanto você não responder, o resultado desta lead não volta para otimizar a campanha.
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
            disabled={!editavel || ocupado}
            onClick={() => void registrar(o.estado)}
          >
            {o.rotulo}
          </button>
        ))}
      </div>
      {erro ? <p className="atlas-consent-erro">{erro}</p> : null}
      {!editavel ? (
        <p className="atlas-consent-nota">
          Quem registra é o diretor — ele responde pela base legal de todas as leads e formulários.
        </p>
      ) : null}
    </div>
  );
}

export default MetaConsentControl;
