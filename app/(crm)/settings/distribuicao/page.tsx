"use client";

import { FilaDeAtendimentoPanel } from "@/components/atlas/FilaDeAtendimentoPanel";

/**
 * QUEM PARTICIPA DA FILA DE CADA PROJETO E DE CADA CAMPANHA.
 *
 * ── Esta tela tinha uma cópia da outra, e as duas divergiram ────────────────
 *
 * Até 2026-08-03 este arquivo carregava a própria lista de caixas de seleção
 * sobre `/api/v1/crm/elenco-de-distribuicao`, e `/distribution` carregava um
 * painel próprio sobre `/api/v1/crm/distribution`. Mesma decisão — quem recebe a
 * lead deste empreendimento — em duas telas, dois vocabulários e dois estados de
 * saúde: a de lá dava 400 a cada clique, e a daqui gravava certo mas não mostrava
 * ordem nenhuma, porque ordem ainda não existia.
 *
 * Agora as duas montam o MESMO componente. Divergir de novo passa a exigir
 * duplicar código de propósito, em vez de acontecer por descuido.
 *
 * A rota continua existindo porque é onde o menu de configurações aponta e onde
 * o gestor foi ensinado a procurar — quebrar o endereço para eliminar a cópia
 * cobraria da pessoa errada.
 */
export default function ElencoDeDistribuicao() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--atlas-texto-forte)]">Quem participa da fila</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--atlas-texto-fraco)]">
          A distribuição automática entrega a próxima lead a quem vem depois de quem recebeu por último.
          Aqui você decide <strong className="text-[var(--atlas-texto-medio)]">quem entra nesse rodízio</strong> e em que
          ordem, para cada empreendimento e cada campanha. A mesma fila aparece na tela de distribuição.
        </p>
      </header>
      <FilaDeAtendimentoPanel />
    </main>
  );
}
