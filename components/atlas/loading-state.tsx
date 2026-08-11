import { ReliableState } from "./reliable-state";

export function LoadingState({ rows = 3 }: { rows?: number }) {
  return <ReliableState kind="loading" rows={rows} compact />;
}
