/**
 * O CADASTRO QUE O CORRETOR PREENCHE DE SI MESMO.
 *
 * ── O que estava pronto e nunca foi usado ─────────────────────────────────
 *
 * Medido em 03/08/2026: `profiles` já tinha `avatar_url`, `phone`, `creci` e
 * `bio`; o bucket `profile-avatars` existia desde 22/07, público, com política
 * de envio por pasta do próprio usuário. E o resultado era:
 *
 *     26 perfis · 0 com foto · 0 com telefone · 0 com CRECI · 0 com bio
 *     0 arquivos no bucket
 *
 * As colunas e o bucket foram criados e NUNCA escritos, porque a tela de perfil
 * (179 linhas) editava só o nome e a senha. Infraestrutura inteira parada por
 * falta de um formulário — a forma mais cara de "construído e nunca ligado",
 * porque tudo parecia pronto.
 *
 * ── Por que validar aqui, e não no formulário ────────────────────────────
 *
 * A tela grava direto no Supabase pelo cliente (política `profiles_update_self`).
 * Não há rota no meio para validar. Então ou a regra vive num módulo puro e
 * testável, ou vive espalhada em `onChange` — e a segunda opção é como um CRECI
 * com espaço no fim vira um CRECI diferente do mesmo CRECI.
 *
 * PURO: sem rede, sem banco, sem React.
 */

/** Tipos que o navegador e o bucket aceitam, e que a ficha sabe desenhar. */
export const TIPOS_DE_IMAGEM_ACEITOS = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * 2 MB. Foto de perfil é exibida em 40px na barra e 96px na ficha — acima disso
 * é banda gasta para pixel que ninguém vê, e o corretor tira a foto do celular,
 * onde o arquivo chega fácil a 5 MB.
 */
export const TAMANHO_MAXIMO_DA_FOTO = 2 * 1024 * 1024;

/** A bio aparece no portal do incorporador; acima disso vira texto que ninguém lê. */
export const LIMITE_DA_BIO = 280;

export type Recusa = { ok: false; campo: string; mensagem: string };
export type Aceite<T> = { ok: true; valor: T };

/**
 * Telefone brasileiro, normalizado para dígitos.
 *
 * Guarda só dígitos porque a base já tem o mesmo número em três formatações, e
 * é assim que a regra de contato único deixa passar duplicata. Aceita 10 (fixo
 * com DDD) ou 11 (celular com nono dígito).
 */
export function validarTelefone(bruto: unknown): Aceite<string | null> | Recusa {
  const digitos = String(bruto ?? "").replace(/\D/g, "");
  if (!digitos) return { ok: true, valor: null };
  const semPais = digitos.startsWith("55") && digitos.length > 11 ? digitos.slice(2) : digitos;
  if (semPais.length !== 10 && semPais.length !== 11) {
    return { ok: false, campo: "phone", mensagem: "Telefone com DDD: 10 dígitos para fixo, 11 para celular." };
  }
  if (semPais.length === 11 && semPais[2] !== "9") {
    return { ok: false, campo: "phone", mensagem: "Celular com 11 dígitos precisa começar com 9 depois do DDD." };
  }
  return { ok: true, valor: semPais };
}

/** `(11) 98765-4321` — só para MOSTRAR. O que se guarda são os dígitos. */
export function formatarTelefone(digitos: string | null | undefined): string {
  const d = String(digitos ?? "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

/**
 * CRECI: número e UF. O corretor escreve de mil formas ("123456-F/SP",
 * "creci 123456 sp"), e sem normalizar o mesmo registro vira vários.
 */
export function validarCreci(bruto: unknown): Aceite<string | null> | Recusa {
  const texto = String(bruto ?? "").trim();
  if (!texto) return { ok: true, valor: null };
  const numero = (texto.match(/\d{3,7}/) ?? [])[0];
  const uf = (texto.toUpperCase().match(/\b(A[CLPM]|BA|CE|DF|ES|GO|M[AGST]|P[ABEIR]|R[JNOSR]|S[CEP]|TO)\b/) ?? [])[0];
  if (!numero) return { ok: false, campo: "creci", mensagem: "Informe o número do CRECI (3 a 7 dígitos)." };
  if (!uf) return { ok: false, campo: "creci", mensagem: "Informe a UF do CRECI. Exemplo: 123456-SP." };
  return { ok: true, valor: `${numero}-${uf}` };
}

export function validarBio(bruto: unknown): Aceite<string | null> | Recusa {
  const texto = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (!texto) return { ok: true, valor: null };
  if (texto.length > LIMITE_DA_BIO) {
    return { ok: false, campo: "bio", mensagem: `A apresentação passa de ${LIMITE_DA_BIO} caracteres (${texto.length}).` };
  }
  return { ok: true, valor: texto };
}

export function validarNomeCompleto(bruto: unknown): Aceite<string> | Recusa {
  const texto = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (texto.length < 3) return { ok: false, campo: "full_name", mensagem: "Escreva o nome completo." };
  if (!texto.includes(" ")) return { ok: false, campo: "full_name", mensagem: "Nome e sobrenome — é o que a lead vê." };
  return { ok: true, valor: texto };
}

/** Confere a FOTO antes de subir: recusar depois do upload gasta banda à toa. */
export function validarFoto(arquivo: { type?: string; size?: number; name?: string } | null | undefined): Aceite<true> | Recusa {
  if (!arquivo) return { ok: false, campo: "avatar", mensagem: "Escolha uma imagem." };
  const tipo = String(arquivo.type ?? "").toLowerCase();
  if (!(TIPOS_DE_IMAGEM_ACEITOS as readonly string[]).includes(tipo)) {
    return { ok: false, campo: "avatar", mensagem: "A foto precisa ser JPG, PNG ou WEBP." };
  }
  const tamanho = Number(arquivo.size ?? 0);
  if (!tamanho) return { ok: false, campo: "avatar", mensagem: "O arquivo está vazio." };
  if (tamanho > TAMANHO_MAXIMO_DA_FOTO) {
    return {
      ok: false,
      campo: "avatar",
      mensagem: `A foto tem ${(tamanho / 1024 / 1024).toFixed(1)} MB e o limite é 2 MB. Foto de celular costuma passar — reduza antes de enviar.`,
    };
  }
  return { ok: true, valor: true };
}

/**
 * O caminho do arquivo no bucket.
 *
 * A PASTA PRECISA SER O ID DO USUÁRIO: a política de envio exige
 * `storage.foldername(name)[1] = auth.uid()`. Qualquer outro caminho é recusado
 * pelo banco, e o erro que volta ("new row violates row-level security") não
 * diz nada sobre pasta — por isso o caminho se monta aqui, uma vez.
 *
 * Nome fixo `avatar.<ext>`: trocar a foto SUBSTITUI, em vez de acumular um
 * arquivo por troca dentro da pasta de cada pessoa.
 */
export function caminhoDaFoto(userId: string, tipoMime: string): string {
  const extensao = tipoMime === "image/png" ? "png" : tipoMime === "image/webp" ? "webp" : "jpg";
  return `${userId}/avatar.${extensao}`;
}

export type CadastroDoCorretor = {
  full_name: string;
  name: string;
  phone: string | null;
  creci: string | null;
  bio: string | null;
};

/**
 * Valida o cadastro inteiro e devolve o que gravar — ou a PRIMEIRA recusa.
 *
 * Uma recusa por vez, e com o campo nomeado: uma lista de cinco erros de uma vez
 * faz a pessoa consertar tudo errado ao mesmo tempo e desistir.
 */
export function validarCadastro(entrada: {
  fullName: unknown; phone: unknown; creci: unknown; bio: unknown;
}): Aceite<CadastroDoCorretor> | Recusa {
  const nome = validarNomeCompleto(entrada.fullName);
  if (!nome.ok) return nome;
  const telefone = validarTelefone(entrada.phone);
  if (!telefone.ok) return telefone;
  const creci = validarCreci(entrada.creci);
  if (!creci.ok) return creci;
  const bio = validarBio(entrada.bio);
  if (!bio.ok) return bio;

  return {
    ok: true,
    valor: {
      full_name: nome.valor,
      // `name` e `full_name` convivem nesta base, e metade das telas lê uma,
      // metade a outra. Gravar as duas com o MESMO valor é o que impede o
      // corretor de ter dois nomes conforme a tela.
      name: nome.valor,
      phone: telefone.valor,
      creci: creci.valor,
      bio: bio.valor,
    },
  };
}
