/**
 * QUEM REGISTRA CONSENTIMENTO — uma decisão, um lugar.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * Registrar consentimento não é observação sobre a lead: é declaração de BASE
 * LEGAL para tratar dado pessoal de terceiro. Quem responde numa fiscalização é a
 * empresa, então o ato é da diretoria — corretor e gerente VEEM o estado, não
 * registram.
 *
 * Essa regra existia em DOIS lugares, com derivações DIFERENTES:
 *
 *   servidor  (app/api/v1/crm/leads/meta-consent/route.ts)
 *       papel = commercialRole || (role === "admin" ? "director" : role)
 *   tela      (components/crm/meta-consent-control.tsx)
 *       papel = JWT.app_metadata.access_role ?? JWT.app_metadata.role
 *
 * MEDIDO em 2026-07-29, executando as duas derivações sobre as linhas reais de
 * `public.profiles ⋈ auth.users` (ignorando os 17 @atlas-teste.local). Das 3
 * contas reais com papel de diretoria, DUAS divergiam — inclusive a do dono:
 *
 *   ddcorretorsp@icloud.com      role=manager  commercial=manager  jwt=director
 *       → servidor 403 · tela HABILITA o botão
 *   thiagoribasdavila@gmail.com  role=director commercial=manager  jwt=director
 *       → servidor 403 · tela HABILITA o botão
 *   thiagoribasdavila@hotmail.com role=admin   commercial=director jwt=admin
 *       → os dois permitem
 *
 * O que o usuário sentia: dois de três diretores viam os três botões habilitados
 * e levavam 403 ao clicar. E o preço era alto — 270 das 469 leads estão em
 * `nao_perguntado`, e só `concedido` libera envio para a CAPI. O elo que fecha o
 * ciclo com a Meta estava travado atrás de um botão que convida e recusa.
 *
 * ── POR QUE A TELA DEIXOU DE DECIDIR ────────────────────────────────────────
 *
 * Não bastava alinhar as duas derivações: alinhadas hoje, elas divergem amanhã,
 * porque leem FONTES diferentes — o perfil no banco e o claim do JWT, que só
 * coincidem enquanto ninguém troca um papel sem reemitir token. É a mesma
 * armadilha que já vazou dado entre empresas neste projeto: claim com precedência
 * sobre o perfil.
 *
 * Então a tela parou de decidir. Ela PERGUNTA (`GET` da própria rota) e o
 * servidor responde. Uma decisão, calculada por quem manda, transmitida — não
 * sobra segunda derivação para divergir.
 *
 * Este módulo é puro e SEM `server-only` de propósito: um contrato precisa
 * conseguir chamá-lo com as formas reais de perfil e conferir caso a caso.
 */

/**
 * Papéis que registram base legal. Deliberadamente estreito: é ato de quem
 * responde pela empresa. `admin` entra porque no RBAC deste produto ele é o
 * papel-raiz — quem pode tudo, inclusive criar diretor.
 */
const REGISTRA_BASE_LEGAL = new Set(["director", "admin"]);

/**
 * A precedência é `commercialRole` e depois `role`, igual ao resto do CRM
 * (`leLiderancaInteira` em lib/crm/escopo-de-leitura.ts usa a mesma ordem). Um
 * `admin` sem papel comercial definido continua registrando — daí a segunda
 * checagem, e não uma tradução de `admin` para `director`, que perdia a
 * informação de que ele é raiz.
 */
export function podeRegistrarConsentimento(perfil: {
  commercialRole?: string | null;
  role?: string | null;
}): boolean {
  const papel = perfil.commercialRole || perfil.role;
  return REGISTRA_BASE_LEGAL.has(String(papel || "")) || perfil.role === "admin";
}

/**
 * A frase da recusa, num lugar só, porque ela aparece na tela E na resposta 403.
 * Duas redações da mesma recusa é como o usuário aprende que o produto não sabe
 * o que está fazendo.
 */
export const MOTIVO_SEM_REGISTRO =
  "Registrar o consentimento é do diretor — é ele quem responde pela base legal de todas as leads e formulários.";
