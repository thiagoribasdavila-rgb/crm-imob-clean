"use client";

import { useEffect } from "react";

/**
 * O LINK DE RECUPERAÇÃO QUE CAI NA PÁGINA ERRADA.
 *
 * ── O que foi rastreado em 03/08/2026, seguindo o link de verdade ─────────
 *
 * Um corretor não conseguia redefinir a senha. Segui a cadeia de
 * redirecionamento de um link real:
 *
 *     GET .../auth/v1/verify?token=…&redirect_to=https://atlasaios.com.br/auth/callback…
 *     303 → http://atlasaios.com.br#access_token=…&type=recovery
 *     301 → https://atlasaios.com.br/
 *     200   (a home)
 *
 * Duas coisas erradas na mesma linha. O destino pedido — `/auth/callback?next=
 * /redefinir-senha` — foi IGNORADO: quando a URL não está na lista de
 * permitidas do Supabase, ele cai no *Site URL* da configuração. E esse Site
 * URL está gravado com `http://`, o que provoca mais um salto para `https://`.
 *
 * O token chega, mas na home. E ninguém na home lê o fragmento: a pessoa vê o
 * site normal e conclui que o link não funcionou.
 *
 * ── Por que a defesa mora no cliente, e no lugar mais alto ───────────────
 *
 * O `#fragmento` NUNCA é enviado ao servidor — o navegador o guarda para si.
 * Nenhuma rota, middleware ou redirecionamento do lado do servidor consegue
 * enxergá-lo. Só código que roda no navegador.
 *
 * E fica montado no alto porque não dá para prever ONDE o Supabase vai largar a
 * pessoa: hoje é a raiz; se o Site URL mudar, será outra. Consertar a
 * configuração continua sendo o certo — mas a aplicação para de depender de ela
 * estar certa, que é a diferença entre um fluxo frágil e um que se sustenta.
 *
 * NÃO consome o token nem cria sessão: só leva a pessoa, com o fragmento
 * intacto, para a tela que sabe tratá-lo.
 */
export function ResgateDoLinkDeRecuperacao() {
  useEffect(() => {
    const fragmento = window.location.hash;
    if (!fragmento || fragmento.length < 2) return;

    const parametros = new URLSearchParams(fragmento.slice(1));
    const tipo = parametros.get("type");
    const temToken = Boolean(parametros.get("access_token"));

    // `recovery` é o link de redefinir senha; `invite` é o primeiro acesso de
    // quem foi convidado — os dois terminam na MESMA tela, porque em ambos a
    // pessoa precisa escolher uma senha.
    const ehResgate = temToken && (tipo === "recovery" || tipo === "invite");
    if (!ehResgate) return;

    // Já está na tela certa: não redireciona (evita laço se ela também montar
    // este componente por vir dentro do layout).
    if (window.location.pathname.startsWith("/redefinir-senha")) return;

    // `replace` e não `assign`: o link de recuperação é de uso único, e deixá-lo
    // no histórico faz o botão "voltar" levar a pessoa a um token já gasto.
    window.location.replace(`/redefinir-senha${fragmento}`);
  }, []);

  return null;
}
