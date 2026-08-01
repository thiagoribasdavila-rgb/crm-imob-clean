/**
 * Contrato da NAVEGAÇÃO POR PAPEL — a barra lateral não oferece o que o papel
 * não alcança.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ──────────────────────────────────────────────
 *
 * Até 2026-07-29 a única guarda dessa regra era `check-final-navigation.mjs`
 * exigindo o LITERAL `visibleItems` em `components/atlas/sidebar.tsx` — o nome da
 * variável que guardava a lista filtrada.
 *
 * A reescrita da barra ("barra lateral: some o cromo, ficam os destinos") removeu
 * a variável. A guarda ficou vermelha e **ninguém viu por 8 dias**, porque ela é
 * um dos 143 checks que nenhum agregado chama — medido hoje: 223 checks, só 80
 * alcançados por `release:prebuild-check`/`validate`/`verify`/`test:real`.
 *
 * Conferido antes de reapontar: a barra continua chamando
 * `getAtlasNavigationForIdentity` (que filtra por `canAccessAtlasItem`) e não
 * referencia o catálogo cru `atlasNavigation` em lugar nenhum. Ou seja: a
 * propriedade nunca caiu, só o nome saiu de baixo dela.
 *
 * ── E POR QUE ELE EXECUTA EM VEZ DE PROCURAR TEXTO ───────────────────────────
 *
 * Cobrar um nome de variável é asserção fraca: `const visibleItems = items`
 * satisfaria a guarda antiga sem filtrar nada, e o corretor passaria a ver os
 * destinos da diretoria. Aqui a regra é CHAMADA, com identidades de verdade, e
 * comparada nos dois sentidos.
 *
 * Os números não são fixados de propósito — destino novo no catálogo não deve
 * quebrar este contrato. O que é fixado são as RELAÇÕES entre os conjuntos.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  getAtlasNavigationForIdentity,
  getAtlasMobileNavigationForIdentity,
  atlasNavigation,
} from "../../lib/atlas/navigation.ts";

const CORRETOR = { role: "broker", accessRole: "broker" };
const DIRETOR = { role: "director", accessRole: "director" };

const ids = (itens) => new Set(itens.map((i) => i.id));

test("o filtro por papel realmente restringe — corretor vê menos que diretor", () => {
  const doCorretor = getAtlasNavigationForIdentity(CORRETOR);
  const doDiretor = getAtlasNavigationForIdentity(DIRETOR);

  assert.ok(doCorretor.length > 0,
    "corretor sem destino nenhum é filtro bom demais: a barra vazia esconde o produto");
  assert.ok(
    doCorretor.length < doDiretor.length,
    `corretor recebe ${doCorretor.length} destinos e diretor ${doDiretor.length} — ` +
      "iguais significa que o filtro não filtra, e o corretor passa a ver a diretoria",
  );
});

test("e não há inversão: todo destino do corretor também é do diretor", () => {
  // O outro lado. Sem isto, um catálogo que dá ao corretor destinos EXCLUSIVOS
  // passaria no teste acima só por ter uma lista mais curta.
  const doDiretor = ids(getAtlasNavigationForIdentity(DIRETOR));
  for (const item of getAtlasNavigationForIdentity(CORRETOR)) {
    assert.ok(doDiretor.has(item.id),
      `"${item.id}" aparece para o corretor e não para o diretor — a hierarquia está invertida`);
  }
});

test("existe destino que só a liderança alcança", () => {
  const doCorretor = ids(getAtlasNavigationForIdentity(CORRETOR));
  const soDaLideranca = getAtlasNavigationForIdentity(DIRETOR).filter((i) => !doCorretor.has(i.id));
  assert.ok(soDaLideranca.length > 0,
    "nenhum destino é exclusivo da liderança — então o papel não muda nada e a regra é decorativa");
});

test("o catálogo cru é maior que qualquer papel — ninguém recebe tudo por acidente", () => {
  /**
   * `atlasNavigation` é a lista sem filtro. Se algum papel receber o catálogo
   * inteiro, é sinal de que `canAccessAtlasItem` deixou de recortar (por exemplo
   * se um item perder `roles`/`accessRoles` e cair no caso permissivo).
   */
  assert.ok(
    getAtlasNavigationForIdentity(DIRETOR).length <= atlasNavigation.length,
    "papel recebendo mais que o catálogo é impossível — o filtro está inventando destino",
  );
  assert.ok(
    getAtlasNavigationForIdentity(CORRETOR).length < atlasNavigation.length,
    "corretor recebendo o catálogo inteiro é o vazamento que esta regra existe para impedir",
  );
});

test("a navegação do celular obedece a mesma régua", () => {
  // Duas superfícies para a mesma decisão é a classe de defeito dominante deste
  // repositório. O dock do celular sai do MESMO catálogo e do mesmo filtro; se
  // um dia divergir, é aqui que aparece.
  const doCorretor = getAtlasMobileNavigationForIdentity(CORRETOR);
  const doDiretor = getAtlasMobileNavigationForIdentity(DIRETOR);
  assert.ok(doCorretor.length > 0, "dock vazio no celular deixa o corretor sem navegação");
  assert.ok(
    doCorretor.length <= doDiretor.length,
    "no celular o corretor recebe MAIS destinos que o diretor — as duas superfícies divergiram",
  );
  const idsDesktop = ids(getAtlasNavigationForIdentity(CORRETOR));
  for (const item of doCorretor) {
    assert.ok(idsDesktop.has(item.id),
      `"${item.id}" está no dock do corretor e não na barra dele — o celular abre porta que o desktop fecha`);
  }
});
