/**
 * A ficha do lead aberta A PARTIR da lista, sem desmontá-la.
 *
 * ── POR QUE A INTERCEPTAÇÃO MORA AQUI, E NÃO DENTRO DE `leads/` ──────────────
 *
 * A primeira tentativa foi `app/(crm)/leads/@ficha/(.)[id]`. Ela COMPILA, a
 * lâmina abre e a URL muda — mas medido no navegador: a lista remontava e
 * refazia 4 consultas por abertura, exatamente o custo que a lâmina existe
 * para eliminar.
 *
 * A causa é a árvore de rotas, não o CSS: `[id]` é FILHO de `leads`, então ao
 * navegar para `/leads/:id` o slot `children` daquele layout deixa de ser a
 * lista e passa a ser a própria ficha. Interceptar não impede isso — o
 * `children` segue a URL.
 *
 * Subindo a interceptação para o nível `(crm)`, o `children` continua sendo
 * `/leads` (a lista), porque `/leads` não é ancestral de nada que mudou. É
 * assim que o padrão funciona de verdade: o slot precisa viver ACIMA do ponto
 * em que a rota se ramifica.
 *
 * O componente é o mesmo da rota real: `LeadDetailPage` não recebe props (lê o
 * id de `useParams`) e o segmento `[id]` aqui é idêntico — um componente, dois
 * enquadramentos, nada duplicado para divergir depois.
 */
import LeadDetailPage from "../../../leads/[id]/page";
import { LeadLamina } from "@/components/crm/lead-lamina";

export default function FichaEmLamina() {
  return (
    <LeadLamina>
      <LeadDetailPage />
    </LeadLamina>
  );
}
