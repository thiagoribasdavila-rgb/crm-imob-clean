export function LoadingState({ rows = 3 }: { rows?: number }) {
  return (
    <div className="atlas-loading-state" role="status" aria-label="Carregando">
      {Array.from({ length: rows }, (_, index) => (
        <span key={index} className="atlas-loading-row" />
      ))}
    </div>
  );
}
