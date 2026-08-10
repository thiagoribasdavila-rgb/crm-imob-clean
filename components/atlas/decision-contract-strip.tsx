import type { ScreenDecisionContract } from "@/lib/ui/screen-decision-contract";

type DecisionContractStripProps = {
  contract: ScreenDecisionContract;
  currentDecision?: string;
};

export function DecisionContractStrip({ contract, currentDecision }: DecisionContractStripProps) {
  return (
    <section className="atlas-decision-contract" aria-label="Contrato da decisão atual" data-decision-role={contract.role}>
      <div className="atlas-decision-contract-primary">
        <span>Decisão desta tela</span>
        <strong>{currentDecision || contract.decision}</strong>
      </div>
      <dl>
        <div><dt>Responsável</dt><dd>{contract.owner}</dd></div>
        <div><dt>Prazo</dt><dd>{contract.deadline}</dd></div>
        <div><dt>Resultado esperado</dt><dd>{contract.expectedResult}</dd></div>
        <div><dt>Comprovação</dt><dd>{contract.evidence}</dd></div>
      </dl>
    </section>
  );
}
