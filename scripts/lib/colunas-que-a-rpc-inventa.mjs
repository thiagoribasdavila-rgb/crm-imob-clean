/**
 * DETECTOR: função do banco que escreve em coluna que não existe.
 *
 * `activities.title` matou 7 escritas no lado TypeScript e o repositório ganhou
 * um contrato para isso (`tests/contracts/activities-sem-title.test.mjs`). Mas
 * aquele contrato varre `app/` e `lib/` — e METADE das escritas do CRM não mora
 * lá: mora em função plpgsql. O plpgsql NÃO valida o corpo na criação, então
 * `insert into public.activities(... title ...)` entra no banco sem um pio e só
 * estoura em 42703 na primeira chamada real. Medido em produção em 02/08/2026:
 * `activities` tinha 481 linhas, todas de `pipeline_stage_changed` — a única
 * função já corrigida. As outras nove somavam ZERO.
 *
 * Este módulo é puro e sem I/O de rede: recebe o texto das migrations e o mapa
 * de colunas reais, e devolve as violações. Ele existe separado do teste para
 * poder ser CHAMADO contra entradas sintéticas — asserção que lê o próprio
 * fonte do detector sobrevive a mutação, como este repositório já aprendeu.
 */

/** Reduz o SQL a algo comparável: sem comentários de linha, minúsculo, sem quebras. */
export function normalizarSql(sql) {
  return String(sql ?? "")
    .split("\n")
    .map((linha) => linha.replace(/--.*$/, ""))
    .join("\n")
    .toLowerCase();
}

/**
 * Definições de função presentes no texto, na ordem em que aparecem.
 * Devolve `{ nome, corpo }` — `corpo` vai do `create or replace` até o `$$;`.
 */
export function definicoesDeFuncao(sql) {
  const texto = normalizarSql(sql);
  const saida = [];
  const abertura = /create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/g;
  let m;
  while ((m = abertura.exec(texto)) !== null) {
    const fim = texto.indexOf("$$;", m.index);
    saida.push({ nome: m[1], corpo: texto.slice(m.index, fim === -1 ? texto.length : fim + 3) });
  }
  return saida;
}

/** Colunas escritas por um corpo de função, por tabela: inserts e `set coluna=`. */
export function colunasEscritas(corpo) {
  const escritas = [];
  for (const m of corpo.matchAll(/insert\s+into\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)/g)) {
    for (const bruta of m[2].split(",")) {
      const coluna = bruta.trim();
      if (/^[a-z0-9_]+$/.test(coluna)) escritas.push({ tabela: m[1], coluna, forma: "insert" });
    }
  }
  for (const m of corpo.matchAll(/update\s+public\.([a-z0-9_]+)\s+set\s+([a-z0-9_]+)\s*=/g)) {
    escritas.push({ tabela: m[1], coluna: m[2], forma: "update" });
  }
  return escritas;
}

/**
 * Violações da DEFINIÇÃO EFETIVA de cada função — a última que o repositório
 * aplica, não a primeira. Reaplicar as migrations em ordem é o que o banco faz;
 * conferir qualquer outra coisa mediria um repositório que não existe.
 *
 * `colunasReais` é `{ tabela: [coluna, ...] }`. Tabela ausente do mapa é
 * ignorada de propósito: este detector responde "a coluna existe?", e sobre
 * tabela não mapeada ele não sabe — e não sabendo, não acusa.
 */
export function violacoesEfetivas(arquivos, colunasReais) {
  const efetiva = new Map();
  for (const { arquivo, sql } of arquivos) {
    for (const def of definicoesDeFuncao(sql)) efetiva.set(def.nome, { ...def, arquivo });
  }
  const violacoes = [];
  for (const { nome, corpo, arquivo } of efetiva.values()) {
    for (const escrita of colunasEscritas(corpo)) {
      const colunas = colunasReais[escrita.tabela];
      if (!colunas) continue;
      if (!colunas.includes(escrita.coluna)) violacoes.push({ funcao: nome, arquivo, ...escrita });
    }
  }
  return violacoes.sort((a, b) => `${a.funcao}${a.tabela}${a.coluna}`.localeCompare(`${b.funcao}${b.tabela}${b.coluna}`));
}
