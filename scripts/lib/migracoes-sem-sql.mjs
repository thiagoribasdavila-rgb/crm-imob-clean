/**
 * MIGRATION VAZIA MENTE — o detector, em funções puras e EXECUTÁVEIS.
 *
 * ── O DEFEITO QUE ISTO FECHA ────────────────────────────────────────────────
 *
 * `20260727050000_corrige_move_pipeline_lead.sql` passou dois dias com ZERO
 * linhas de SQL. Só comentário, terminando em "Aplicada em homologação. Ver a
 * função completa no banco."
 *
 * Migration ausente falha ALTO na primeira reconstrução: ninguém a aplica,
 * ninguém acha que foi aplicada. Migration VAZIA é pior: ela aparece na pasta,
 * aparece no ledger, passa em revisão de código — e o que o repositório
 * reconstrói é a versão ANTERIOR, a quebrada. No caso medido, reconstruir do
 * repositório restaurava uma `move_pipeline_lead` que insere `activities.title`,
 * coluna que a tabela nunca teve: 42703 em toda movimentação de funil, traduzida
 * pela rota como 409 "recusada pela regra do funil".
 *
 * O conserto estava versionado na aparência e perdido no fato.
 *
 * ── POR QUE O DETECTOR MORA AQUI, E NÃO DENTRO DO TESTE ─────────────────────
 *
 * Porque o contrato precisa EXECUTÁ-LO contra entradas sintéticas — arquivo só
 * com `--`, só com `/* *\/`, com SQL de verdade, com SQL depois do comentário —
 * e provar os dois lados. Asserção que procura a palavra "comentário" no fonte
 * de um script prova que alguém escreveu a palavra. Só a execução prova que o
 * detector detecta.
 */

import fs from "node:fs";
import path from "node:path";

/**
 * O texto de uma migration, sem comentários.
 *
 * Blocos primeiro, depois linha: se a ordem fosse invertida, um `-- /*` dentro
 * de uma linha de comentário abriria bloco falso e engoliria o arquivo inteiro.
 *
 * Comentário de linha só é removido quando ele É a linha (âncora no início,
 * tolerando indentação). `create table x; -- nota` continua contando como SQL,
 * que é o certo: há SQL ali.
 */
export function semComentarios(texto) {
  const semBlocos = texto.replace(/\/\*[\s\S]*?\*\//g, "");
  return semBlocos
    .split("\n")
    .map((linha) => (/^\s*--/.test(linha) ? "" : linha))
    .join("\n");
}

/** As linhas de SQL executável que sobram. Vazia => a migration não faz nada. */
export function linhasDeSqlExecutavel(texto) {
  return semComentarios(texto)
    .split("\n")
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
}

/** A pergunta do contrato, em uma função. */
export function ehSomenteComentario(texto) {
  return linhasDeSqlExecutavel(texto).length === 0;
}

/**
 * Uma declaração só vale com motivo ESCRITO. O piso não é decorativo: "pendente",
 * "ok", "ver depois" e o próprio nome do arquivo cabem em menos de 40 caracteres,
 * e nenhum deles diz por quê. Motivo vazio é recusado por construção — se o
 * `assert` só cobrasse a existência da chave, `motivo: ""` passaria.
 */
export const PISO_DO_MOTIVO = 40;

/** Os dois únicos tipos legítimos de declaração. */
export const TIPOS = Object.freeze({
  /** Nunca houve SQL para escrever: lápide de migration substituída, nota de história. */
  DOCUMENTACAO: "documentacao",
  /** HAVIA SQL para escrever e ele não está aqui. Dívida medida, com teto. */
  DIVIDA: "divida",
});

/**
 * Teto da dívida, congelado em 2026-07-29 depois de varrer as 167 migrations.
 *
 * Só `20260711040000_atlas_v3_foundation.sql` está nesta condição: ele diz
 * documentar um esquema aplicado a OUTRO projeto Supabase (pvvdfqbkqhfifylzgbkq)
 * e não traz uma linha do esquema. É a raiz do drift já medido — banco vivo com
 * 23 tabelas contra 167 migrations.
 *
 * O teto é o ponto do arquivo: a dívida existente fica VISÍVEL e NOMEADA, e
 * qualquer migration vazia NOVA reprova na hora. Baixar este número quando a
 * dívida for paga; nunca subir para acomodar arquivo novo.
 */
export const TETO_DE_DIVIDA = 1;

/**
 * Fica em `supabase/`, não em `supabase/migrations/`: a pasta de migrations é
 * varrida pelo CLI e por esta própria varredura — um arquivo que não é migration
 * não mora entre elas.
 */
export function caminhoDasDeclaracoes(raiz) {
  return path.join(raiz, "supabase", "declaracoes-sem-sql.json");
}

export function leDeclaracoes(raiz) {
  const arquivo = caminhoDasDeclaracoes(raiz);
  if (!fs.existsSync(arquivo)) return [];
  return JSON.parse(fs.readFileSync(arquivo, "utf8"));
}

/**
 * Varre um diretório de migrations e devolve o que ele tem de vazio.
 *
 * `.down.sql` entra na varredura junto com o resto: um rollback que não desfaz
 * nada é a mesma mentira, e ele é chamado no pior momento possível.
 */
export function varreMigrations(diretorio) {
  const arquivos = fs
    .readdirSync(diretorio)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  const vazias = [];
  for (const nome of arquivos) {
    const texto = fs.readFileSync(path.join(diretorio, nome), "utf8");
    if (ehSomenteComentario(texto)) vazias.push(nome);
  }
  return { total: arquivos.length, arquivos, vazias };
}

/**
 * O veredito completo, para o contrato asserir e para qualquer portão reusar.
 *
 * Quatro modos de falha, e o terceiro é o que impede a lista de declarações de
 * virar cobertor:
 *   naoDeclaradas   — vazia sem declaração. O defeito original.
 *   motivoInsuficiente — declarada com motivo vazio/curto demais. Álibi não é motivo.
 *   declaracoesObsoletas — declarada mas o arquivo TEM SQL (ou não existe mais).
 *                     Sem isto, quem consertasse a migration deixaria a
 *                     declaração para trás e ela viraria licença permanente
 *                     para esvaziar aquele arquivo de novo.
 *   dividaAcimaDoTeto — dívida nova entrando pela porta da frente.
 */
export function veredito(raiz) {
  const diretorio = path.join(raiz, "supabase", "migrations");
  const { total, vazias } = varreMigrations(diretorio);
  const declaracoes = leDeclaracoes(raiz);

  const porArquivo = new Map(declaracoes.map((d) => [d.arquivo, d]));

  const naoDeclaradas = vazias.filter((nome) => !porArquivo.has(nome));

  const motivoInsuficiente = declaracoes
    .filter((d) => typeof d.motivo !== "string" || d.motivo.trim().length < PISO_DO_MOTIVO)
    .map((d) => d.arquivo);

  const tipoInvalido = declaracoes
    .filter((d) => d.tipo !== TIPOS.DOCUMENTACAO && d.tipo !== TIPOS.DIVIDA)
    .map((d) => d.arquivo);

  const declaracoesObsoletas = declaracoes
    .filter((d) => {
      const caminho = path.join(diretorio, d.arquivo);
      if (!fs.existsSync(caminho)) return true;
      return !ehSomenteComentario(fs.readFileSync(caminho, "utf8"));
    })
    .map((d) => d.arquivo);

  const divida = declaracoes.filter((d) => d.tipo === TIPOS.DIVIDA).map((d) => d.arquivo);

  return {
    total,
    vazias,
    naoDeclaradas,
    motivoInsuficiente,
    tipoInvalido,
    declaracoesObsoletas,
    divida,
    dividaAcimaDoTeto: divida.length > TETO_DE_DIVIDA,
  };
}
