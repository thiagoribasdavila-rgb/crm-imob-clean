/**
 * CONTRATO DA PONTE DE WHATSAPP.
 *
 * ── Por que existe um processo separado ─────────────────────────────────────
 *
 * Todo worker deste projeto é uma rota HTTP acordada por cron
 * (`config/workers-schedule.json`). O WhatsApp por QR Code não cabe nesse
 * molde: a biblioteca mantém um socket ABERTO com o servidor do WhatsApp, e um
 * socket não sobrevive ao fim de uma requisição. Fechar e reabrir a cada
 * chamada é justamente o padrão que faz o WhatsApp derrubar a conta.
 *
 * Então a ponte é uma aplicação PM2 própria, de vida longa, e o CRM fala com
 * ela por HTTP local. Este arquivo é o contrato entre os dois — importado pelos
 * dois lados, para que a forma das mensagens não possa divergir.
 *
 * ── Onde ficam as credenciais ───────────────────────────────────────────────
 *
 * Em lugar nenhum daqui. As credenciais de sessão do WhatsApp dão acesso total
 * à conta do corretor e vivem SÓ no disco do servidor, em
 * `ATLAS_WHATSAPP_SESSION_DIR`, fora do repositório. O banco guarda estado
 * (conectado, desde quando, qual número); o repositório e o ZIP não guardam
 * nada. A ponte só é alcançável em rede local e exige um segredo compartilhado.
 *
 * ── O risco, dito por escrito ───────────────────────────────────────────────
 *
 * Conectar por QR Code usa uma biblioteca não oficial e contraria os termos do
 * WhatsApp. Há risco real de banimento do número pessoal do corretor. A decisão
 * de assumir esse risco foi do dono do produto, com a alternativa oficial
 * apresentada e recusada (migrar para a Cloud API remove o número do aplicativo
 * do celular). Está registrado aqui porque quem mantiver este código depois
 * precisa saber que é uma escolha, não um descuido.
 */

export type StatusSessao =
  | "desconectado"
  | "aguardando_qr"
  | "conectado"
  | "falhou"
  | "banido";

/** O que a ponte devolve sobre uma sessão. Nunca inclui credencial. */
export type EstadoSessao = {
  profileId: string;
  status: StatusSessao;
  /** DataURL do QR, presente só enquanto `status === "aguardando_qr"`. */
  qr?: string | null;
  /** E.164 sem '+', preenchido pelo WhatsApp — nunca digitado pelo corretor. */
  phoneE164?: string | null;
  /** Diagnóstico legível. Nunca contém credencial. */
  erro?: string | null;
  conectadoEm?: string | null;
  ultimaAtividadeEm?: string | null;
};

/** Mensagem que a ponte entrega ao CRM. */
export type MensagemRecebida = {
  profileId: string;
  organizationId: string;
  /** Número do OUTRO lado (o cliente), E.164 sem '+'. */
  contatoE164: string;
  /** Id do WhatsApp — a chave de idempotência. */
  externalMessageId: string;
  direcao: "entrada" | "saida";
  texto: string | null;
  tipo: "texto" | "imagem" | "audio" | "video" | "documento" | "outro";
  enviadaEm: string;
  nomeDoContato?: string | null;
};

/**
 * Telefone para E.164 brasileiro, sem '+'.
 *
 * Mesma regra da integração oficial (`app/api/v1/integrations/whatsapp`):
 * 10 ou 11 dígitos ganham o 55 na frente. Duas normalizações diferentes
 * significariam a mesma pessoa virando dois contatos — foi por isso que se
 * juntou aqui, para os dois lados usarem a mesma.
 */
export function paraE164(valor: string): string {
  const digitos = String(valor ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  return digitos;
}

/**
 * Mascara um número para a interface e para os logs.
 * `5511987654321` → `+55 11 *****-4321`
 */
export function mascararTelefone(e164: string | null | undefined): string {
  const d = String(e164 ?? "").replace(/\D/g, "");
  if (d.length < 6) return "—";
  const fim = d.slice(-4);
  const ddi = d.slice(0, 2);
  const ddd = d.slice(2, 4);
  return `+${ddi} ${ddd} *****-${fim}`;
}

/** Onde a ponte escuta. Só rede local — nunca exposta à internet. */
export function enderecoDaPonte(): string {
  return process.env.ATLAS_WHATSAPP_BRIDGE_URL || "http://127.0.0.1:8790";
}

/**
 * Segredo compartilhado entre CRM e ponte.
 *
 * Sem ele a ponte recusa toda chamada: qualquer processo no mesmo servidor
 * poderia mandar mensagem pelo WhatsApp de um corretor.
 */
export function segredoDaPonte(): string | null {
  const s = process.env.ATLAS_WHATSAPP_BRIDGE_SECRET;
  return s && s.length >= 16 ? s : null;
}

/** A ponte está configurada a ponto de valer a pena chamar? */
export function ponteConfigurada(): boolean {
  return Boolean(segredoDaPonte());
}
