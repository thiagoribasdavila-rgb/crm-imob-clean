"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * QUANTAS VEZES JÁ SE TENTOU FALAR COM ESTA LEAD.
 *
 * ── Por que aparece antes de o corretor precisar ────────────────────────────
 *
 * O servidor já recusa o descarte abaixo do piso de 3 tentativas. Mas descobrir
 * uma regra levando um erro na cara é a pior forma de aprender uma regra: gera
 * a sensação de que o sistema atrapalha, e não de que ele protege.
 *
 * Mostrando antes, o corretor sabe onde está — e "faltam 2" é um convite a
 * tentar de novo, que é exatamente o comportamento que a regra existe para
 * provocar.
 *
 * ── Silêncio quando já houve contato ────────────────────────────────────────
 *
 * Lead que respondeu não precisa de contador: o assunto dela é outro. Mostrar
 * "1 tentativa" numa conversa em andamento seria ruído — e ruído repetido em
 * 200 leads treina a pessoa a não olhar mais para o cartão.
 */

type Estado = {
  total: number;
  podeDescartar: boolean;
  faltam: number;
  houveResposta: boolean;
  frase: string | null;
};

export function ContactAttemptsBadge({ leadId }: { leadId: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);

  useEffect(() => {
    let vivo = true;
    void (async () => {
      const { data: sessao } = await supabase.auth.getSession();
      const r = await fetch(`/api/v1/crm/leads/contact-attempts?leadId=${leadId}`, {
        headers: { Authorization: `Bearer ${sessao.session?.access_token || ""}` },
      });
      if (!r.ok || !vivo) return;
      const { data } = await r.json();
      setEstado(data);
    })();
    return () => { vivo = false; };
  }, [leadId]);

  // Sem dado ainda, ou conversa já em andamento: nada a dizer.
  if (!estado || estado.houveResposta || !estado.frase) return null;

  return (
    <p
      className="atlas-tentativas"
      data-pode-descartar={estado.podeDescartar}
      title={
        estado.podeDescartar
          ? "Ao descartar, informe o motivo — ele vira sinal para a Meta."
          : `Faltam ${estado.faltam} tentativa(s) para o descarte ficar disponível.`
      }
    >
      <strong>
        {estado.total === 0 ? "Sem contato" : `${estado.total} tentativa${estado.total > 1 ? "s" : ""}`}
      </strong>
      {" · "}
      {estado.frase}
    </p>
  );
}

export default ContactAttemptsBadge;
