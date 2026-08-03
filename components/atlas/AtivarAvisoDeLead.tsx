"use client";

import { useState } from "react";
import { useAlertaDeLeadNova } from "@/components/atlas/use-alerta-de-lead-nova";

/**
 * A OFERTA DE ATIVAR O AVISO — e por que ela existe numa tela em vez de um popup.
 *
 * ── O problema ──────────────────────────────────────────────────────────────
 *
 * `Notification.requestPermission()` só funciona dentro de um gesto da pessoa.
 * Pior: o navegador dá UMA chance. Quem nega não volta a ser perguntado, e
 * reverter exige entrar nas configurações do site — passo que ninguém dá.
 *
 * Pedir na carga da página é o caminho garantido para a negação: a pessoa recebe
 * a caixa antes de entender o que está sendo oferecido, e nega por reflexo.
 *
 * ── A escolha ───────────────────────────────────────────────────────────────
 *
 * A oferta fica na tela de Leads, que é onde o corretor já está pensando em
 * atendimento, e diz o que ganha ANTES de pedir. Só aparece quando há algo a
 * ganhar: permissão ainda não pedida. Concedida, negada ou navegador sem
 * suporte — some, porque não há nada a oferecer nesses três casos.
 *
 * Recusar aqui NÃO chama o navegador: "agora não" é um estado desta tela, e a
 * única chance com o navegador fica preservada para quando a pessoa quiser.
 */
export function AtivarAvisoDeLead() {
  const { permissaoDeAviso, pedirPermissaoDeAviso } = useAlertaDeLeadNova();
  const [dispensado, setDispensado] = useState(false);
  const [resultado, setResultado] = useState<"concedida" | "negada" | null>(null);

  if (dispensado) return null;

  if (resultado === "concedida") {
    return (
      <div className="cc6-panel-quiet cc6-ok px-4 py-2.5 text-corpo leading-5" role="status">
        Avisos ativados. A partir da próxima lead você é chamado mesmo com o Atlas em segundo plano.
      </div>
    );
  }

  if (resultado === "negada") {
    return (
      <div className="cc6-panel-quiet px-4 py-2.5 text-corpo leading-5 text-[var(--atlas-texto-fraco)]" role="status">
        Avisos bloqueados neste navegador. A pastilha ao lado de <strong className="text-[var(--atlas-texto-medio)]">Leads</strong> continua
        funcionando enquanto o Atlas estiver aberto. Para reverter, é preciso liberar as notificações nas
        configurações do site — o navegador não pergunta duas vezes.
      </div>
    );
  }

  if (permissaoDeAviso !== "nao-pedida") return null;

  return (
    <div className="cc6-panel-quiet flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
      <p className="min-w-0 flex-1 text-corpo leading-5 text-[var(--atlas-texto-fraco)]">
        <strong className="text-[var(--atlas-texto-forte)]">Ser avisado quando uma lead cair na sua carteira</strong>{" "}
        — com o nome de quem chegou, mesmo com o Atlas em segundo plano. O prazo de primeiro contato mais curto
        desta operação é de <strong className="text-[var(--atlas-texto-medio)]">5 minutos</strong>.
      </p>
      <div className="flex shrink-0 flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void pedirPermissaoDeAviso().then((r) => { if (r !== "indisponivel") setResultado(r); })}
          className="atlas-button-primary"
        >
          Ativar avisos
        </button>
        <button type="button" onClick={() => setDispensado(true)} className="cc6-ghost-btn">
          Agora não
        </button>
      </div>
    </div>
  );
}
