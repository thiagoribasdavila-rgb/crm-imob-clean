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
   * ── ESTA TELA PAROU DE ADIVINHAR EM 2026-07-29 ────────────────────────────
   *
   * Antes ela lia `app_metadata.access_role` do PRÓPRIO token e decidia sozinha,
   * "sem chamada extra por lead". Parecia econômico e estava errado: o servidor
   * decide pelo PERFIL, com outra precedência (`commercialRole || role`).
   *
   * MEDIDO sobre as contas reais: das 3 com papel de diretoria, DUAS divergiam —
   * inclusive a do dono (`role=director`, `commercial_role=manager`,
   * `access_role=director`). Elas viam os três botões habilitados e levavam 403
   * ao clicar. O comentário antigo dizia que este bloco existia "para o corretor
   * não descobrir a regra levando erro depois de clicar" — e era exatamente isso
   * que acontecia.
   *
   * Alinhar as duas derivações não resolveria: as FONTES são diferentes, e o
   * claim do JWT só coincide com o perfil enquanto ninguém troca um papel sem
   * reemitir token. Dar precedência a claim sobre perfil é a armadilha que já
   * vazou dado entre empresas neste projeto.
   *
   * Agora ela PERGUNTA. Uma decisão, calculada por quem manda, transmitida —
   * e vem com o MOTIVO, para o botão cinza poder se explicar.
   */
  const [podeRegistrar, setPodeRegistrar] = useState<boolean | null>(null);
  const [motivoSemRegistro, setMotivoSemRegistro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const { data: sessao } = await supabase.auth.getSession();
        const r = await fetch("/api/v1/crm/leads/meta-consent", {
          headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` },
          cache: "no-store",
        });
        if (!vivo) return;
        const corpo = await r.json().catch(() => null);
        if (!r.ok) { setPodeRegistrar(false); return; }
        setPodeRegistrar(corpo?.data?.podeRegistrar === true);
        setMotivoSemRegistro(corpo?.data?.motivo ?? null);
      } catch {
        // Rede fora: assume que NÃO pode. Errar para o lado de não oferecer é
        // melhor que oferecer e o servidor recusar — foi o defeito que isto
        // fecha, e o padrão errado seria repeti-lo com outro nome.
        if (vivo) setPodeRegistrar(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const editavel = podeEditar ?? podeRegistrar ?? false;

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
        // A frase vem do SERVIDOR quando ele respondeu, e é a MESMA que o 403
        // devolve — uma recusa, uma redação. A frase local fica como reserva para
        // quando a rede falhou e não há resposta: nesse caso o motivo é
        // desconhecido, mas a regra continua valendo e o botão continua fechado.
        <p className="atlas-consent-nota">
          {motivoSemRegistro
            ?? "Quem registra é o diretor — ele responde pela base legal de todas as leads e formulários."}
        </p>
      ) : null}
    </div>
  );
}

export default MetaConsentControl;
