/**
 * QUEM PODE INSTALAR O AGENDAMENTO DOS WORKERS.
 *
 * ── O INCIDENTE QUE ORIGINOU ESTE MÓDULO ────────────────────────────────────
 *
 * Em 2026-07-30 foi entregue o comando:
 *
 *     node scripts/gera-crontab-dos-workers.mjs > /tmp/atlas.cron && crontab /tmp/atlas.cron
 *
 * Ele juntava GERAR e INSTALAR num `&&`, e foi executado no Mac de
 * desenvolvimento. Resultado medido: 11 workers comerciais agendados na máquina
 * local, apontando para a URL de PRODUÇÃO — incluindo o `outbox`, que envia
 * mensagem de verdade, a cada 2 minutos.
 *
 * Não houve dano: `/var/www/atlas/.env` não existe no Mac, o `source` falhava e o
 * comando abortava antes do `curl`. A prova disso está na fila — os dois eventos
 * elegíveis seguiram intocados por 373 minutos, com `attempts` e `updated_at`
 * inalterados. Mas a ausência de dano foi ACIDENTE de caminho, não proteção: se o
 * `.env` existisse no Mac (e é comum existir, num clone de servidor), a máquina de
 * desenvolvimento estaria disparando mensagem para cliente real.
 *
 * ── A LIÇÃO, QUE É SOBRE FORMA DE COMANDO ───────────────────────────────────
 *
 * `gerar && instalar` numa linha só transforma "ver o que sairia" em "aplicar".
 * Não existe passo intermediário para alguém olhar. Por isso as três operações
 * são agora comandos SEPARADOS — gerar, validar, instalar — e a instalação
 * carrega a verificação abaixo.
 *
 * A decisão vive aqui, pura e sem efeito colateral, para poder ser testada nos
 * dois lados sem tocar em crontab nenhum. Guarda que nunca foi vista RECUSANDO é
 * guarda não verificada.
 */

export type AmbienteDeInstalacao = {
  /** `process.platform`. */
  plataforma: string;
  /** `os.hostname()`. */
  hostname: string;
  /** usuário efetivo do processo. */
  usuario: string;
  /** o diretório da aplicação existe nesta máquina? */
  diretorioDaAplicacaoExiste: boolean;
  /** caminho conferido, para a mensagem dizer QUAL faltou. */
  diretorioDaAplicacao: string;
  /** valor de `ATLAS_AUTORIZA_INSTALAR_CRON`. */
  autorizacaoExplicita: string | undefined;
  /** hostnames autorizados, se o dono quiser restringir. Vazio = não restringe por nome. */
  hostnamesAutorizados?: string[];
};

export type Veredito = {
  autorizado: boolean;
  /** Códigos, não frases: a mensagem humana é montada por quem exibe. */
  impedimentos: string[];
  motivo: string;
};

/**
 * Plataformas em que instalar workers COMERCIAIS é sempre errado. macOS é a
 * máquina de desenvolvimento deste projeto — foi exatamente onde o incidente
 * aconteceu. `win32` entra pelo mesmo motivo: não é servidor desta aplicação.
 */
export const PLATAFORMAS_RECUSADAS = ["darwin", "win32"] as const;

/** O valor tem de ser este, exato. Qualquer coisa "parecida com sim" não vale. */
export const VALOR_DE_AUTORIZACAO = "eu-confirmo-que-este-e-o-servidor";

export function avaliarAutorizacaoDeInstalacao(ambiente: AmbienteDeInstalacao): Veredito {
  const impedimentos: string[] = [];

  if ((PLATAFORMAS_RECUSADAS as readonly string[]).includes(ambiente.plataforma)) {
    impedimentos.push("plataforma_de_desenvolvimento");
  }

  /**
   * A autorização é explícita e o valor é uma FRASE, não `1` ou `true`. Um `=1`
   * pode ser copiado por engano de um exemplo; uma frase afirmativa exige que a
   * pessoa a escreva sabendo o que diz. É o mesmo raciocínio do "digite o nome do
   * repositório para confirmar a exclusão".
   */
  if (ambiente.autorizacaoExplicita !== VALOR_DE_AUTORIZACAO) {
    impedimentos.push("sem_autorizacao_explicita");
  }

  /**
   * O diretório da aplicação é a prova material de que esta máquina É o servidor.
   * Foi justamente a AUSÊNCIA dele que impediu o dano no incidente — aqui ela
   * vira verificação em vez de sorte.
   */
  if (!ambiente.diretorioDaAplicacaoExiste) {
    impedimentos.push("sem_diretorio_da_aplicacao");
  }

  const lista = ambiente.hostnamesAutorizados ?? [];
  if (lista.length > 0 && !lista.includes(ambiente.hostname)) {
    impedimentos.push("hostname_nao_autorizado");
  }

  if (impedimentos.length === 0) {
    return {
      autorizado: true,
      impedimentos,
      motivo: `Autorizado em ${ambiente.hostname} (${ambiente.plataforma}), usuário ${ambiente.usuario}, aplicação em ${ambiente.diretorioDaAplicacao}.`,
    };
  }

  const explicacao: Record<string, string> = {
    plataforma_de_desenvolvimento: `plataforma \`${ambiente.plataforma}\` é máquina de desenvolvimento — workers comerciais não se instalam aqui`,
    sem_autorizacao_explicita: `falta ATLAS_AUTORIZA_INSTALAR_CRON="${VALOR_DE_AUTORIZACAO}"`,
    sem_diretorio_da_aplicacao: `${ambiente.diretorioDaAplicacao} não existe — esta máquina não hospeda a aplicação`,
    hostname_nao_autorizado: `hostname \`${ambiente.hostname}\` fora da lista autorizada (${lista.join(", ")})`,
  };

  return {
    autorizado: false,
    impedimentos,
    motivo: impedimentos.map((codigo) => explicacao[codigo] ?? codigo).join(" · "),
  };
}
