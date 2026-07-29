/**
 * Estado "nenhuma ficha aberta" do slot.
 *
 * Sem este arquivo, recarregar `/leads/:id` devolve 404 — o Next não sabe o
 * que pôr no slot paralelo numa carga do zero, e a tela em branco parece perda
 * de dado para quem está usando.
 */
export default function SemFicha() {
  return null;
}
