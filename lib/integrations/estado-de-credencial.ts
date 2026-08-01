/**
 * ESTADO DE UMA CREDENCIAL — "presente" não é o mesmo que "funciona".
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `/api/ready` publicava dois estados: `configured` e `not_configured`. A rota
 * ADMITIA em comentário que `configured` significa apenas "a variável de
 * ambiente existe" — mas quem lê a tela não lê o comentário, lê a palavra. E a
 * palavra dizia pronto.
 *
 * Medido em 2026-07-29, com as credenciais reais do ambiente, uma chamada mínima
 * de leitura por provedor:
 *
 *   · OpenAI  `gpt-5.6-luna`   → HTTP 429 `insufficient_quota` (conta sem saldo)
 *   · Anthropic `claude-sonnet-4-5` → HTTP 400 "credit balance is too low"
 *   · Perplexity `sonar`       → HTTP 200, 14 tokens de verdade
 *
 * Os três apareciam iguais em `/api/ready`: `configured`.
 *
 * Pior que os três: `smtp` era `checks.database.ok ? "via-supabase-auth" :
 * "error"`. Um estado sobre E-MAIL derivado de uma consulta a `organizations`.
 * Status que só fica vermelho quando OUTRO assunto cai nunca fica vermelho pelo
 * próprio — é enfeite, não status. E o preço é concreto: se o SMTP for o padrão
 * do Supabase (poucos e-mails por hora), recuperação de senha falha em produção
 * com a prontidão VERDE, e ninguém abre chamado contra uma tela que diz "ok".
 *
 * ── A DOENÇA, NOMEADA ───────────────────────────────────────────────────────
 *
 * Ausência não declarada é indistinguível de zero. Aqui, "credencial presente"
 * estava sendo publicada como "funciona", e "não medido" como "medido e ok".
 *
 * O modelo desta correção é uma decisão que a PRÓPRIA rota já tinha tomado
 * certo: ela se recusa a checar `META_CAPI_DATASET_ID` no ambiente porque o
 * dataset migrou para o banco, e checá-lo "deixaria a tela VERDE enquanto o
 * envio segue bloqueado". Este módulo generaliza aquela recusa.
 *
 * ── OS ESTADOS ──────────────────────────────────────────────────────────────
 *
 *   viva                        chamada real bem-sucedida, com data
 *   quebrada                    chamada real falhou, OU a configuração torna a
 *                               próxima chamada impossível (modelo irresolvível)
 *   configurada_nao_verificada  credencial presente, NADA exercitado
 *   desativada                  desligada de propósito por variável de ambiente
 *   ausente                     credencial faltando
 *
 * SÓ `viva` é verde. Qualquer leitor que pinte `configurada_nao_verificada` de
 * verde recria o defeito — por isso `verificado` sai junto, como booleano, e
 * `motivo` nunca vem vazio.
 *
 * ── A REGRA QUE IMPEDE A RECAÍDA ────────────────────────────────────────────
 *
 * Toda evidência carrega o ASSUNTO que ela exercitou, e uma evidência de assunto
 * diferente do da integração é RECUSADA. Foi exatamente o defeito do `smtp`:
 * evidência sobre `banco` publicada como estado de `email`. A recusa é
 * executável — não é um comentário pedindo cuidado — e sai declarada em
 * `evidenciaDeOutroAssunto` para o log poder gritar.
 */

export const ESTADOS_DE_CREDENCIAL = [
  "viva",
  "quebrada",
  "configurada_nao_verificada",
  "desativada",
  "ausente",
] as const;

export type EstadoDeCredencial = (typeof ESTADOS_DE_CREDENCIAL)[number];

/**
 * Uma chamada real que ACONTECEU. `assunto` é o que foi exercitado — e é o
 * campo que impede que a prova de um assunto seja usada como prova de outro.
 */
export type EvidenciaDeUso = {
  assunto: string;
  ok: boolean;
  /** ISO-8601 do momento medido. Sem data não há como avaliar frescor. */
  em?: string | null;
  detalhe?: string;
};

export type DeclaracaoDeCredencial = {
  estado: EstadoDeCredencial;
  /** O que esta linha fala. Publicado para o leitor poder cobrar coerência. */
  assunto: string;
  /** Houve chamada real ao ASSUNTO desta integração? Só `viva` implica true. */
  verificado: boolean;
  verificadoEm: string | null;
  motivo: string;
  /** Nome do assunto da evidência recusada, quando houve uma. */
  evidenciaDeOutroAssunto: string | null;
  /** Onde a configuração de verdade vive, quando não é neste processo. */
  ondeSeConfigura?: string;
};

/**
 * Evidência velha não é evidência de AGORA.
 *
 * Sete dias é a janela escolhida: curta o bastante para que uma conta que ficou
 * sem saldo pare de aparecer viva na semana seguinte, longa o bastante para que
 * um provedor usado só no briefing da manhã não pisque a cada dia sem tráfego.
 * Fora da janela o estado volta a `configurada_nao_verificada` — com a DATA no
 * motivo, porque "não sei agora" é diferente de "nunca funcionou".
 */
export const JANELA_DE_EVIDENCIA_MS = 7 * 24 * 60 * 60 * 1000;

export type EntradaDaDeclaracao = {
  assunto: string;
  presente: boolean;
  /** Variáveis que faltam, para o motivo dizer O QUE configurar. */
  faltando?: string[];
  /** Desligada de propósito: qual variável desligou. */
  desligadaPor?: string | null;
  /**
   * Defeito de configuração que torna a PRÓXIMA chamada impossível — modelo com
   * nome inválido, por exemplo. Vale mais que evidência antiga de sucesso:
   * é a forma atual da configuração, não a história dela.
   */
  defeitoDeConfiguracao?: string | null;
  evidencia?: EvidenciaDeUso | null;
  motivoSemVerificacao?: string;
  ondeSeConfigura?: string;
  agora?: number;
};

export function declararCredencial(entrada: EntradaDaDeclaracao): DeclaracaoDeCredencial {
  const agora = entrada.agora ?? Date.now();
  const base = {
    assunto: entrada.assunto,
    verificado: false,
    verificadoEm: null as string | null,
    evidenciaDeOutroAssunto: null as string | null,
    ...(entrada.ondeSeConfigura ? { ondeSeConfigura: entrada.ondeSeConfigura } : {}),
  };

  // 1. A recusa que mata a classe de bug do `smtp`: prova de outro assunto não
  //    vale. Recusar em silêncio seria repetir o erro em outra forma, então o
  //    assunto recusado sai declarado.
  let evidencia = entrada.evidencia ?? null;
  let deOutroAssunto: string | null = null;
  if (evidencia && evidencia.assunto !== entrada.assunto) {
    deOutroAssunto = evidencia.assunto;
    evidencia = null;
  }
  base.evidenciaDeOutroAssunto = deOutroAssunto;

  // 2. Desligada de propósito é fato, não falha — e não é o mesmo que ausente.
  if (entrada.desligadaPor) {
    return {
      ...base,
      estado: "desativada",
      motivo: `Desligada de propósito por ${entrada.desligadaPor}. Não é falha e não vira verde.`,
    };
  }

  // 3. Sem credencial não há o que verificar. Vem antes da evidência: evidência
  //    de sucesso sem credencial presente é contradição, e a contradição não
  //    pode virar verde.
  if (!entrada.presente) {
    const faltando = (entrada.faltando ?? []).filter(Boolean);
    return {
      ...base,
      estado: "ausente",
      motivo: faltando.length
        ? `Credencial ausente: falta ${faltando.join(", ")}.`
        : "Credencial ausente neste ambiente.",
    };
  }

  // 4. Defeito de forma na configuração: a próxima chamada não tem como dar
  //    certo, e afirmar isso não custa uma chamada.
  if (entrada.defeitoDeConfiguracao) {
    return { ...base, estado: "quebrada", motivo: entrada.defeitoDeConfiguracao };
  }

  const semVerificacao = (motivo: string): DeclaracaoDeCredencial => ({
    ...base,
    estado: "configurada_nao_verificada",
    motivo,
  });

  if (!evidencia) {
    const porOutroAssunto = deOutroAssunto
      ? ` A evidência oferecida era sobre "${deOutroAssunto}" e foi recusada: prova de um assunto não prova outro.`
      : "";
    return semVerificacao(
      (entrada.motivoSemVerificacao ??
        "Credencial presente; nenhuma chamada real registrada. Presente não é o mesmo que funciona.") + porOutroAssunto,
    );
  }

  // 5. Frescor. Sucesso de três semanas atrás não é sucesso de agora.
  //
  //    Evidência SEM DATA não passa por aqui como fresca: sem data não há como
  //    avaliar frescor, e tratar "não sei quando" como "agora" é a mesma doença
  //    desta entrega — ausência não declarada virando afirmação.
  const em = evidencia.em ? Date.parse(evidencia.em) : Number.NaN;
  if (Number.isNaN(em)) {
    return semVerificacao(
      "Há registro de chamada real, mas sem data legível: não é possível avaliar se ela vale para agora.",
    );
  }
  if (agora - em > JANELA_DE_EVIDENCIA_MS) {
    return semVerificacao(
      `Última chamada real em ${evidencia.em}, fora da janela de ${Math.round(JANELA_DE_EVIDENCIA_MS / 86_400_000)} dias. ` +
        "Não sei o estado de agora — e não sei é diferente de funciona.",
    );
  }

  if (!evidencia.ok) {
    return {
      ...base,
      verificadoEm: evidencia.em ?? null,
      estado: "quebrada",
      motivo: evidencia.detalhe
        ? `Chamada real falhou: ${evidencia.detalhe}`
        : "Chamada real falhou.",
    };
  }

  return {
    ...base,
    estado: "viva",
    verificado: true,
    verificadoEm: evidencia.em ?? null,
    motivo: evidencia.detalhe
      ? `Chamada real bem-sucedida: ${evidencia.detalhe}`
      : "Chamada real bem-sucedida.",
  };
}

/** Verde é só `viva`. Existe como função para ninguém reescrever a regra. */
export function estadoEhVerde(estado: EstadoDeCredencial): boolean {
  return estado === "viva";
}

export function resumirDeclaracoes(
  declaracoes: Record<string, DeclaracaoDeCredencial>,
): Record<EstadoDeCredencial, string[]> {
  const resumo = Object.fromEntries(
    ESTADOS_DE_CREDENCIAL.map((estado) => [estado, [] as string[]]),
  ) as Record<EstadoDeCredencial, string[]>;
  for (const [nome, declaracao] of Object.entries(declaracoes)) {
    resumo[declaracao.estado].push(nome);
  }
  return resumo;
}
