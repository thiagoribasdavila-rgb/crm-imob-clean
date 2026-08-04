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
 * ── Por que este arquivo só tem números e frase, não a decisão ────────────
 *
 * A primeira versão trazia também `avaliarPedidoDeRecuperacao`, uma função pura
 * que decidia a partir de listas de instantes anteriores. Ficou sem chamador: a
 * rota (`app/api/auth/password-recovery/route.ts`, mesmo commit) foi ligada
 * direto em `checkRateLimit`/`clientKey` de `lib/security/rate-limit.ts` — a
 * ÚNICA implementação de contagem do projeto (ver o cabeçalho daquele arquivo e
 * `tests/contracts/rate-limit-unificado.test.mjs`, teste "existe UMA
 * implementação de contagem no projeto"). Dar chamador à função pura exigiria
 * guardar uma LISTA de instantes por e-mail/IP — um segundo armazenamento de
 * teto, correndo ao lado do único que o projeto decidiu manter. Removida em
 * 03/08/2026 depois de confirmar que a rota já fecha a mesma lacuna (e-mail
 * antes de IP, mesmos números) por outro caminho; o que sobra aqui são os
 * números e a frase que os dois lados — rota e teste de contrato — comparam.
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
