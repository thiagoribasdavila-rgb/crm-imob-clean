/**
 * Alerta interno por Telegram.
 *
 * Serve a UM problema medido: o vigia de SLA cria tarefa no CRM, e tarefa no CRM
 * só é vista por quem abre o CRM. O corretor em visita não abre. Em 2026-07-26 a
 * base tinha 214 leads e 0 contatos registrados — o aviso precisa alcançar o
 * telefone, não a aba.
 *
 * Por que Telegram e não WhatsApp: o WhatsApp Business está bloqueado (token da
 * Meta fora do Business Manager do app) e, mesmo destravado, é canal de CLIENTE.
 * Este canal fala com a EQUIPE. Telegram é gratuito, não pede aprovação de
 * template e entrega em segundos.
 *
 * ── A REGRA QUE GOVERNA ESTE ARQUIVO ────────────────────────────────────────
 * NENHUM DADO PESSOAL DE LEAD SAI POR AQUI. Vai contagem, prazo e link para o
 * CRM. Nome, telefone e e-mail de cliente não atravessam um canal de
 * conveniência — é a mesma regra do livro da carteira, que exibe "SEM PII".
 *
 * `montarAlertaDeSla` é pura e exportada justamente para que essa regra seja
 * testável sem rede.
 */

import { resilientFetch } from "@/lib/http/resilient-fetch";
import { logger } from "@/lib/observability/logger";

const API_BASE = "https://api.telegram.org";

export type ResultadoDeEnvio =
  | { status: "enviado"; messageId: number | null }
  | { status: "nao_configurado"; motivo: string }
  | { status: "erro"; motivo: string; code?: number };

export function telegramConfigurado() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export type AlertaDeSla = {
  /** Quantas leads do corretor estão com o prazo estourado. */
  vencidas: number;
  /** Quantas estão dentro da janela de aviso, prestes a vencer. */
  aVencer: number;
  /** Minutos até o vencimento mais próximo. Null quando só há vencidas. */
  minutosMaisProximo: number | null;
  /** Endereço do CRM já na fila ordenada por urgência. */
  linkDaFila: string;
};

/**
 * Monta o texto do alerta.
 *
 * Pura de propósito: é aqui que a promessa de "sem dado pessoal" se cumpre ou se
 * quebra, e uma função pura pode ser provada sem tocar na rede.
 */
export function montarAlertaDeSla(alerta: AlertaDeSla): string {
  const linhas: string[] = [];
  if (alerta.vencidas > 0) {
    linhas.push(`⏰ ${alerta.vencidas} lead(s) com prazo de primeiro contato VENCIDO.`);
  }
  if (alerta.aVencer > 0) {
    const quando = alerta.minutosMaisProximo != null
      ? ` — a mais urgente vence em ${alerta.minutosMaisProximo} min`
      : "";
    linhas.push(`⚠️ ${alerta.aVencer} lead(s) com prazo correndo${quando}.`);
  }
  if (!linhas.length) return "";
  linhas.push("");
  linhas.push(`Abrir a fila: ${alerta.linkDaFila}`);
  linhas.push("Registre o contato no Atlas assim que falar — é o que para o relógio.");
  return linhas.join("\n");
}

/**
 * Envia a mensagem. Falha de envio NUNCA propaga: alerta é conveniência, e
 * derrubar o worker de SLA por causa de uma notificação seria trocar o essencial
 * pelo acessório.
 */
export async function enviarAlertaTelegram(chatId: string, texto: string): Promise<ResultadoDeEnvio> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: "nao_configurado", motivo: "TELEGRAM_BOT_TOKEN ausente" };
  if (!chatId) return { status: "nao_configurado", motivo: "corretor sem chat id no Telegram" };
  if (!texto.trim()) return { status: "nao_configurado", motivo: "nada a comunicar" };

  try {
    const response = await resilientFetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: texto,
        // Sem parse_mode: o texto é montado por nós e não precisa de marcação;
        // habilitá-la abriria caminho para quebra de formatação com dado externo.
        disable_web_page_preview: true,
      }),
    }, { timeoutMs: 8_000, retries: 1, retryUnsafe: true, operation: "telegram.sendMessage" });

    const corpo = await response.json().catch(() => ({})) as {
      ok?: boolean; result?: { message_id?: number }; description?: string; error_code?: number;
    };
    if (!response.ok || corpo.ok === false) {
      return { status: "erro", motivo: String(corpo.description ?? response.statusText).slice(0, 160), code: corpo.error_code };
    }
    return { status: "enviado", messageId: corpo.result?.message_id ?? null };
  } catch (erro) {
    // Nem o log leva o texto: ele contém o link da organização e nada mais, mas
    // manter a disciplina aqui é mais barato que revisá-la depois.
    logger.warn("telegram.envio_falhou", { motivo: erro instanceof Error ? erro.message : String(erro) });
    return { status: "erro", motivo: "canal indisponível" };
  }
}
