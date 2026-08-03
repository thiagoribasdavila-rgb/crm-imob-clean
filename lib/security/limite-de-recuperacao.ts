/**
 * O LIMITE DA RECUPERAÇÃO DE SENHA — protegendo a caixa postal, não o IP.
 *
 * ── O defeito medido em 03/08/2026 ────────────────────────────────────────
 *
 * Um corretor recém-criado não conseguia entrar. A rota respondia:
 *
 *     HTTP 429 — "Muitas solicitações. Aguarde alguns minutos."
 *
 * A cota era `5 por 15 minutos POR IP`, e a chave vinha de `x-forwarded-for`.
 * Duas consequências, as duas ruins:
 *
 *   · QUEM É LEGÍTIMO TRAVA. O e-mail do Supabase demora (SMTP embutido, com
 *     limite próprio de 1 envio a cada 57 segundos). A pessoa não recebe,
 *     tenta de novo, e na quinta vez leva 429 — que ela lê como "o sistema
 *     está quebrado", não como "espere".
 *
 *   · QUEM QUER BURLAR, BURLA. Testado contra a produção: com um
 *     `X-Forwarded-For` inventado, a mesma chamada que dava 429 passou com 202.
 *     O cabeçalho vem de fora e ninguém o valida. O limite não impedia abuso —
 *     só atrapalhava usuário honesto.
 *
 * ── O que este módulo protege, então ─────────────────────────────────────
 *
 * O recurso escasso não é o IP: é a CAIXA POSTAL. O abuso que importa é
 * bombardear o e-mail de alguém com links de redefinição, e isso independe de
 * onde o pedido nasce. Limitar por e-mail normalizado atinge o abuso real e
 * para de punir quem divide IP — escritório, operadora de celular, VPN.
 *
 * O IP continua como segunda trava, mais frouxa, contra varredura de muitos
 * e-mails a partir de um ponto. Ela é frágil por natureza (o cabeçalho é
 * forjável) e por isso NÃO é a principal.
 *
 * PURO: sem relógio próprio, sem armazenamento. Quem chama traz o histórico e o
 * agora — senão o mesmo pedido teria veredito diferente conforme a hora.
 */

/** Por caixa postal: o recurso que o abuso realmente consome. */
export const TENTATIVAS_POR_EMAIL = 3;
export const JANELA_DO_EMAIL_MS = 15 * 60_000;

/**
 * Por IP: mais alta de propósito. Um escritório inteiro pode legitimamente
 * pedir recuperação no mesmo dia, e travá-los em 5 é criar um chamado de
 * suporte para resolver um problema que não existe.
 */
export const TENTATIVAS_POR_IP = 20;
export const JANELA_DO_IP_MS = 15 * 60_000;

export type Veredito = {
  permitido: boolean;
  /** Segundos até poder tentar de novo. `0` quando permitido. */
  esperarSegundos: number;
  /** A frase que a pessoa lê. Diz QUANDO, não só "muitas". */
  mensagem: string | null;
  /** `email` | `ip` — para o log saber qual trava fechou. */
  travaQueFechou: "email" | "ip" | null;
};

const PERMITIDO: Veredito = { permitido: true, esperarSegundos: 0, mensagem: null, travaQueFechou: null };

/** Minutos arredondados para cima: "aguarde 0 minutos" não ajuda ninguém. */
function emMinutos(ms: number): number {
  return Math.max(1, Math.ceil(ms / 60_000));
}

/**
 * Decide se o pedido passa.
 *
 * `tentativasDoEmail` e `tentativasDoIp` são os INSTANTES das tentativas
 * anteriores, em epoch ms. Quem chama guarda; aqui só se decide.
 */
export function avaliarPedidoDeRecuperacao(entrada: {
  agora: number;
  tentativasDoEmail: readonly number[];
  tentativasDoIp: readonly number[];
}): Veredito {
  const { agora } = entrada;

  const doEmail = entrada.tentativasDoEmail.filter((t) => agora - t < JANELA_DO_EMAIL_MS);
  if (doEmail.length >= TENTATIVAS_POR_EMAIL) {
    // Espera até a MAIS ANTIGA sair da janela — é quando abre a próxima vaga.
    const maisAntiga = Math.min(...doEmail);
    const restante = JANELA_DO_EMAIL_MS - (agora - maisAntiga);
    return {
      permitido: false,
      esperarSegundos: Math.ceil(restante / 1000),
      mensagem:
        `Já enviamos ${TENTATIVAS_POR_EMAIL} links para este e-mail há pouco. ` +
        `Confira a caixa de entrada e o SPAM — o remetente é o Atlas. ` +
        `Se nada chegou, tente de novo em ${emMinutos(restante)} minuto(s).`,
      travaQueFechou: "email",
    };
  }

  const doIp = entrada.tentativasDoIp.filter((t) => agora - t < JANELA_DO_IP_MS);
  if (doIp.length >= TENTATIVAS_POR_IP) {
    const maisAntiga = Math.min(...doIp);
    const restante = JANELA_DO_IP_MS - (agora - maisAntiga);
    return {
      permitido: false,
      esperarSegundos: Math.ceil(restante / 1000),
      // Não diz "o seu IP": a pessoa não tem como agir sobre isso, e a frase
      // soa como acusação de algo que ela provavelmente não fez.
      mensagem: `Muitos pedidos de recuperação vindos desta rede. Tente de novo em ${emMinutos(restante)} minuto(s).`,
      travaQueFechou: "ip",
    };
  }

  return PERMITIDO;
}

/**
 * A frase que a tela mostra DEPOIS de aceitar o pedido.
 *
 * A rota responde 202 sem dizer se o e-mail existe — proteção contra descobrir
 * quem tem conta. Mas a frase antiga ("Se o e-mail estiver cadastrado, o link
 * será enviado") deixava a pessoa sem saber o que fazer quando nada chegava, e
 * é aí que ela tenta cinco vezes e trava.
 */
export function fraseDoEnvioAceito(): string {
  return (
    "Se este e-mail tiver conta, o link chega em até 2 minutos. " +
    "Confira também a caixa de SPAM. O link vale por 1 hora e só pode ser usado uma vez."
  );
}
