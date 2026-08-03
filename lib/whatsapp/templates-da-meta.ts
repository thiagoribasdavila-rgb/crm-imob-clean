import "server-only";

import { metaGraphUrl, describeMetaGraphFailure } from "@/lib/meta/graph";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { importarTemplateDaMeta, type TemplateDaMeta, type TemplateImportado } from "@/lib/whatsapp/catalogo-de-templates";

/**
 * LER DA META O QUE ELA JÁ SABE — GET, E SÓ GET.
 *
 * ── Por que este arquivo existe ─────────────────────────────────────────────
 *
 * O template aprovado é um fato que já mora no Business Manager. Obrigar o dono
 * a redigitar aqui o nome, o idioma e o corpo exatos de algo que a Meta já tem
 * é convidar a divergência: basta um caractere diferente no corpo e o CRM passa
 * a guardar um texto que não é o aprovado. O par (nome, idioma) é a chave do
 * envio — errar nele é enviar para o vazio.
 *
 * ── O que ele NÃO faz, de propósito ────────────────────────────────────────
 *
 * Não cria template na Meta, não submete para aprovação, não edita e não
 * apaga. Submeter template é ato do dono no Business Manager, com a
 * responsabilidade sobre o texto que a Meta vai avaliar. Todas as chamadas
 * daqui são `GET`.
 *
 * ── A conta certa, e o defeito que quase entrou aqui ───────────────────────
 *
 * Para listar templates é preciso o ID da WABA (WhatsApp Business Account), e
 * ele NÃO está no ambiente: só existem `WHATSAPP_PHONE_NUMBER_ID` e
 * `WHATSAPP_ACCESS_TOKEN`. O campo `whatsapp_business_account` não existe no
 * nó do número — confirmado contra a Graph v23.0 em 02/08/2026:
 *
 *     GET /527541623768288?fields=whatsapp_business_account
 *     → HTTP 400 (#100) Tried accessing nonexisting field
 *
 * A descoberta então desce pela conta de anúncios → negócio → WABAs do negócio,
 * caminho medido e confirmado na mesma data. E aí mora o risco: um negócio pode
 * ter mais de uma WABA, e ler os templates da WABA errada devolveria HTTP 200
 * com uma lista plausível de templates que o número configurado não pode usar.
 * É a mesma classe do caso das duas contas de anúncio — gasto numa, lead na
 * outra, tudo 200.
 *
 * Por isso a WABA escolhida é obrigada a PROVAR que contém
 * `WHATSAPP_PHONE_NUMBER_ID` em `/{waba}/phone_numbers`. Não provando, este
 * módulo devolve "não achei", e nunca um palpite.
 */

const TEMPO_LIMITE_MS = 20_000;

export type AlcanceDaMeta =
  | {
      alcance: "sem_credencial";
      /** Quais nomes faltam. Só os NOMES — nunca o valor. */
      faltando: string[];
      quemResolve: "engenharia";
      recado: string;
    }
  | {
      alcance: "nao_achei_a_conta";
      quemResolve: "dono" | "engenharia";
      recado: string;
      /** Cada passo tentado, com o resultado. É o que torna a falha diagnosticável. */
      trilha: string[];
    }
  | {
      alcance: "erro";
      quemResolve: "dono" | "engenharia";
      recado: string;
      trilha: string[];
    }
  | {
      alcance: "lido";
      contaDaMeta: { id: string; nome: string | null; comoFoiDescoberta: string };
      templates: TemplateImportado[];
      /** Templates que a Meta devolveu e que não viraram linha — com o motivo. */
      descartados: Array<{ nome: string; motivo: string }>;
      trilha: string[];
    };

type Resposta = { http: number; corpo: unknown };

async function pegar(caminho: string, token: string): Promise<Resposta> {
  // Token SEMPRE no header. Nunca em query string — ela vaza para log de acesso
  // e para o histórico de qualquer proxy no caminho.
  const resposta = await resilientFetch(
    metaGraphUrl(caminho),
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    { timeoutMs: TEMPO_LIMITE_MS, operation: "Graph API (templates de WhatsApp)" },
  );
  const corpo = (await resposta.json().catch(() => null)) as unknown;
  return { http: resposta.status, corpo };
}

const lista = (corpo: unknown): Array<Record<string, unknown>> => {
  const dados = (corpo as { data?: unknown })?.data;
  return Array.isArray(dados) ? (dados as Array<Record<string, unknown>>) : [];
};

/**
 * Confirma que a WABA candidata é dona do número configurado.
 *
 * Sem esta confirmação, "achei uma WABA" viraria "achei A WABA", e a tela
 * mostraria templates que o número do CRM não pode usar. HTTP 200 o tempo todo.
 */
async function wabaContemONumero(waba: string, phoneNumberId: string, token: string, trilha: string[]): Promise<boolean> {
  const { http, corpo } = await pegar(`${encodeURIComponent(waba)}/phone_numbers?fields=id&limit=50`, token);
  if (http !== 200) {
    trilha.push(`GET /${waba}/phone_numbers → ${describeMetaGraphFailure(http, corpo)}`);
    return false;
  }
  const numeros = lista(corpo).map((n) => String(n.id ?? ""));
  const contem = numeros.includes(phoneNumberId);
  trilha.push(`GET /${waba}/phone_numbers → ${numeros.length} número(s); contém o número configurado: ${contem ? "sim" : "não"}`);
  return contem;
}

/**
 * Descobre a WABA que realmente atende o número configurado.
 *
 * Ordem: variável explícita primeiro (quem declarou, mandou — mas ainda assim
 * é conferida contra o número), depois a descida pela conta de anúncios.
 */
async function descobrirConta(
  token: string,
  phoneNumberId: string,
  trilha: string[],
): Promise<{ id: string; nome: string | null; comoFoiDescoberta: string } | { erro: string; quemResolve: "dono" | "engenharia" }> {
  const declarada = String(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID ?? "").trim();
  if (declarada) {
    trilha.push("WHATSAPP_BUSINESS_ACCOUNT_ID declarada no ambiente.");
    if (await wabaContemONumero(declarada, phoneNumberId, token, trilha)) {
      return { id: declarada, nome: null, comoFoiDescoberta: "declarada em WHATSAPP_BUSINESS_ACCOUNT_ID e confirmada por /phone_numbers" };
    }
    return {
      erro:
        "A conta declarada em WHATSAPP_BUSINESS_ACCOUNT_ID não contém o número em WHATSAPP_PHONE_NUMBER_ID. " +
        "Ler os templates dela mostraria uma lista que este número não pode usar.",
      quemResolve: "engenharia",
    };
  }

  const contaDeAnuncio = String(process.env.META_AD_ACCOUNT_ID ?? "").replace(/^act_/, "").trim();
  if (!contaDeAnuncio) {
    return {
      erro:
        "Não há WHATSAPP_BUSINESS_ACCOUNT_ID no servidor, e sem META_AD_ACCOUNT_ID não há por onde descobrir a conta. " +
        "O nó do número não expõe a conta de WhatsApp (a Graph responde (#100) campo inexistente).",
      quemResolve: "engenharia",
    };
  }

  const negocio = await pegar(`act_${encodeURIComponent(contaDeAnuncio)}?fields=business{id,name}`, token);
  if (negocio.http !== 200) {
    trilha.push(`GET /act_${contaDeAnuncio}?fields=business → ${describeMetaGraphFailure(negocio.http, negocio.corpo)}`);
    return { erro: "A Graph não devolveu o negócio dono da conta de anúncios — sem ele não há como chegar na conta de WhatsApp.", quemResolve: "dono" };
  }
  const bloco = (negocio.corpo as { business?: { id?: string; name?: string } })?.business;
  const negocioId = String(bloco?.id ?? "").trim();
  if (!negocioId) {
    return { erro: "A conta de anúncios configurada não está dentro de nenhum negócio (Business Manager) que este token enxergue.", quemResolve: "dono" };
  }
  trilha.push(`GET /act_${contaDeAnuncio} → negócio ${negocioId}${bloco?.name ? ` (${bloco.name})` : ""}`);

  const contas = await pegar(`${encodeURIComponent(negocioId)}/owned_whatsapp_business_accounts?fields=id,name&limit=25`, token);
  if (contas.http !== 200) {
    trilha.push(`GET /${negocioId}/owned_whatsapp_business_accounts → ${describeMetaGraphFailure(contas.http, contas.corpo)}`);
    return {
      erro: "A Graph recusou listar as contas de WhatsApp do negócio. Normalmente é permissão `whatsapp_business_management` faltando no token.",
      quemResolve: "dono",
    };
  }
  const candidatas = lista(contas.corpo);
  trilha.push(`GET /${negocioId}/owned_whatsapp_business_accounts → ${candidatas.length} conta(s) de WhatsApp`);
  if (!candidatas.length) {
    return { erro: "O negócio não tem nenhuma conta de WhatsApp Business. É no Business Manager que ela nasce.", quemResolve: "dono" };
  }

  for (const candidata of candidatas) {
    const id = String(candidata.id ?? "");
    if (!id) continue;
    if (await wabaContemONumero(id, phoneNumberId, token, trilha)) {
      return {
        id,
        nome: candidata.name ? String(candidata.name) : null,
        comoFoiDescoberta: `conta de anúncios → negócio ${negocioId} → conta de WhatsApp que contém o número configurado`,
      };
    }
  }

  return {
    erro:
      `Nenhuma das ${candidatas.length} conta(s) de WhatsApp do negócio contém o número em WHATSAPP_PHONE_NUMBER_ID. ` +
      "Enquanto isso não bater, qualquer template lido seria de outra conta.",
    quemResolve: "dono",
  };
}

/**
 * Lê os templates que a Meta já tem para o número configurado.
 *
 * Nunca lança: a rota que chama precisa continuar respondendo mesmo com a Meta
 * fora do ar, porque o cadastro manual não depende dela. Falha da Meta vira
 * recado na tela — nunca lista vazia, que seria indistinguível de "a conta não
 * tem template nenhum".
 */
export async function lerTemplatesDaMeta(): Promise<AlcanceDaMeta> {
  const token = String(process.env.WHATSAPP_ACCESS_TOKEN ?? "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID ?? "").trim();
  const faltando = [
    ...(token ? [] : ["WHATSAPP_ACCESS_TOKEN"]),
    ...(phoneNumberId ? [] : ["WHATSAPP_PHONE_NUMBER_ID"]),
  ];
  if (faltando.length) {
    return {
      alcance: "sem_credencial",
      faltando,
      quemResolve: "engenharia",
      recado:
        `O servidor não tem ${faltando.join(" e ")}. Sem isso não dá para perguntar à Meta o que ela já aprovou — ` +
        "mas o cadastro manual desta tela continua funcionando.",
    };
  }

  const trilha: string[] = [];
  try {
    const conta = await descobrirConta(token, phoneNumberId, trilha);
    if ("erro" in conta) {
      return { alcance: "nao_achei_a_conta", quemResolve: conta.quemResolve, recado: conta.erro, trilha };
    }

    const resposta = await pegar(
      `${encodeURIComponent(conta.id)}/message_templates?fields=id,name,status,category,language,components&limit=100`,
      token,
    );
    if (resposta.http !== 200) {
      trilha.push(`GET /${conta.id}/message_templates → ${describeMetaGraphFailure(resposta.http, resposta.corpo)}`);
      return {
        alcance: "erro",
        quemResolve: "dono",
        recado: `A Meta não devolveu a lista de templates. ${describeMetaGraphFailure(resposta.http, resposta.corpo)}`,
        trilha,
      };
    }

    const brutos = lista(resposta.corpo) as TemplateDaMeta[];
    trilha.push(`GET /${conta.id}/message_templates → ${brutos.length} template(s)`);
    const templates: TemplateImportado[] = [];
    const descartados: Array<{ nome: string; motivo: string }> = [];
    for (const bruto of brutos) {
      const convertido = importarTemplateDaMeta(bruto);
      if (convertido) templates.push(convertido);
      else descartados.push({ nome: String(bruto?.name ?? "(sem nome)"), motivo: "sem nome válido ou sem componente BODY — importar criaria um template que envia mensagem vazia" });
    }
    return { alcance: "lido", contaDaMeta: conta, templates, descartados, trilha };
  } catch (causa) {
    return {
      alcance: "erro",
      quemResolve: "engenharia",
      recado: `Não foi possível falar com a Graph API: ${causa instanceof Error ? causa.message.slice(0, 160) : "falha de rede"}.`,
      trilha,
    };
  }
}
