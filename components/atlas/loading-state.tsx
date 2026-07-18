export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div
      className="atlas-loading-state"
      data-loading-priority="detail"
      role="group"
      aria-busy="true"
      aria-label="Carregando detalhes desta área"
    >
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="atlas-loading-row" aria-hidden="true" />
      ))}
    </div>
  );
}
