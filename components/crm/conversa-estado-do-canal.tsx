import type { CSSProperties } from "react";
import type { DiagnosticoDoCanal, FatosDoCanal, QuemResolve } from "@/app/api/v1/crm/conversations/diagnostico-do-canal";

/**
 * O PAINEL QUE IMPEDE O ZERO DE MENTIR.
 *
 * Uma tela que some porque não há mensagem é indistinguível de uma tela
 * quebrada. Este painel é o que fica no lugar do vazio — e a única coisa que
 * ele nunca faz é desenhar "0 conversas" como se fosse notícia sobre a
 * operação quando o que existe é canal desligado.
 *
 * Ele não decide nada: `diagnosticarCanal` decide, num módulo puro que os
 * testes alcançam. Aqui só se desenha o veredito.
 */

const ROTULO_DE_QUEM: Record<QuemResolve, string> = {
  dono: "Depende do dono da conta",
  operacao: "Depende da operação",
  engenharia: "Depende de quem opera o servidor",
};

/** Âncora de leitura por responsável — o texto ao lado já nomeia, então o emoji é decorativo. */
const EMOJI_DE_QUEM: Record<QuemResolve, string> = {
  dono: "🔑",
  operacao: "🧑‍💼",
  engenharia: "🖥️",
};

function Linha({ ligado, titulo, detalhe }: { ligado: boolean; titulo: string; detalhe: string }) {
  return (
    <li className="flex items-start gap-2.5 py-2">
      <span
        aria-hidden="true"
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${ligado ? "bg-[var(--atlas-success)]" : "bg-[var(--atlas-border-strong)]"}`}
      />
      <span className="min-w-0">
        <span className="text-corpo font-medium text-[var(--atlas-text-primary)]">{titulo}</span>
        <span className="sr-only">{ligado ? " — ligado." : " — desligado."}</span>
        <span className={`ml-2 text-rotulo font-semibold uppercase tracking-wide ${ligado ? "cc6-ok" : "text-[var(--atlas-text-tertiary)]"}`}>
          {ligado ? "ligado" : "desligado"}
        </span>
        <span className="mt-0.5 block text-xs leading-5 text-[var(--atlas-text-secondary)]">{detalhe}</span>
      </span>
    </li>
  );
}

export function ConversaEstadoDoCanal({
  diagnostico,
  fatos,
  escopo,
}: {
  diagnostico: DiagnosticoDoCanal;
  fatos: FatosDoCanal;
  escopo: "organizacao" | "carteira";
}) {
  const desligado = !diagnostico.podeReceber;

  return (
    <section
      className="cc6-panel cc6-sev-band cc6-reveal p-4 pl-5 sm:p-5 sm:pl-6"
      style={{ "--cc6-sev": desligado ? "var(--atlas-danger)" : "var(--atlas-success)" } as CSSProperties}
      aria-labelledby="estado-do-canal-titulo"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="estado-do-canal-titulo" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--atlas-text-primary)]">
            {/* Estado — categoria em que o emoji acrescenta um canal de leitura
                que o texto sozinho não dá numa varredura. */}
            <span aria-hidden="true">{desligado ? "🔌" : "✅"}</span>
            {desligado ? "O canal de conversa está desligado" : "O canal de conversa está de pé"}
          </h2>
          <p className="mt-1.5 max-w-[68ch] text-corpo leading-6 text-[var(--atlas-text-secondary)]">{diagnostico.frase}</p>
        </div>
        <span className="cc6-chip shrink-0" title={escopo === "organizacao" ? "Você vê as conversas da organização inteira." : "Você vê as conversas atribuídas a você e as das leads da sua carteira."}>
          {escopo === "organizacao" ? "escopo: organização" : "escopo: minha carteira"}
        </span>
      </header>

      {/* ── O aviso mais caro desta tela ──────────────────────────────────────
          Enquanto não há número em `integrations`, o webhook da Meta responde
          200 e descarta. Se a Meta já estiver apontada para cá, mensagens de
          verdade estão sendo perdidas AGORA — e a tela mostraria o mesmo zero. */}
      {diagnostico.mensagemEntraENinguemVe ? (
        <p className="mt-3 rounded-lg border border-[var(--atlas-border)] bg-[var(--atlas-surface-soft)] px-3 py-2.5 text-xs leading-5 text-[var(--atlas-text-secondary)]" role="note">
          <span aria-hidden="true">⚠️ </span>
          <strong className="cc6-warn font-semibold">Se a Meta já estiver enviando para o webhook, as mensagens estão sendo descartadas.</strong>{" "}
          O webhook procura a organização pelo <code className="cc6-num">phone_number_id</code> em <code className="cc6-num">integrations</code>; sem nenhuma linha cadastrada ele responde 200 e segue adiante. A Meta registra entrega feita, e a conversa não fica em lugar nenhum.
        </p>
      ) : null}

      <div className="cc6-hairline mt-3.5 pt-3.5">
        <h3 className="cc6-metric-label">Por onde uma mensagem poderia entrar</h3>
        <ul className="mt-1">
          <Linha
            ligado={diagnostico.caminhosDeEntrada.oficial}
            titulo="WhatsApp oficial (Cloud API)"
            detalhe={
              fatos.numerosOficiais === 0
                ? "Nenhum número cadastrado na tabela integrations para esta organização."
                : `${fatos.numerosOficiais} número(s) com phone_number_id cadastrado — que é tudo o que o webhook consulta para achar a organização.`
            }
          />
          <Linha
            ligado={diagnostico.caminhosDeEntrada.ponte}
            titulo="WhatsApp do corretor (ponte por QR)"
            detalhe={
              !fatos.ponteConfigurada
                ? "O segredo da ponte não está definido no servidor: a rota de entrada responde 503 a tudo."
                : `${fatos.sessoesDeCorretorConectadas} sessão(ões) conectada(s) em whatsapp_broker_sessions.`
            }
          />
        </ul>
      </div>

      {diagnostico.pendencias.length ? (
        <div className="cc6-hairline mt-3.5 pt-3.5">
          <h3 className="cc6-metric-label">O que falta, e o que cada falta custa</h3>
          <ul className="mt-2 grid gap-2">
            {diagnostico.pendencias.map((pendencia) => (
              <li
                key={pendencia.id}
                className="cc6-panel-quiet cc6-sev-band py-2.5 pl-3.5 pr-3"
                style={{ "--cc6-sev": pendencia.bloqueia.includes("receber") ? "var(--atlas-danger)" : "var(--atlas-warning)" } as CSSProperties}
              >
                <p className="text-corpo font-medium leading-5 text-[var(--atlas-text-primary)]">{pendencia.titulo}</p>
                <p className="mt-1 text-xs leading-5 text-[var(--atlas-text-secondary)]">{pendencia.porque}</p>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-rotulo text-[var(--atlas-text-tertiary)]">
                  <span>
                    <span aria-hidden="true">{EMOJI_DE_QUEM[pendencia.quemResolve]} </span>
                    {ROTULO_DE_QUEM[pendencia.quemResolve]}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Bloqueia {pendencia.bloqueia.includes("receber") ? "receber" : ""}
                    {pendencia.bloqueia.length > 1 ? " e " : ""}
                    {pendencia.bloqueia.includes("enviar") ? "enviar" : ""}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Enviar e-mail é recusado na porta pela própria rota de envio — está no
          código, não é suposição, e o corretor precisa saber antes de tentar. */}
      <p className="mt-3.5 text-rotulo leading-5 text-[var(--atlas-text-tertiary)]">
        E-mail não é um canal de saída do Atlas hoje: a rota de envio recusa com <code className="cc6-num">501 EMAIL_CHANNEL_NOT_CONNECTED</code> e orienta usar o rascunho da tela da lead.
      </p>
    </section>
  );
}
