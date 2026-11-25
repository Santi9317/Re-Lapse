/**
 * A browser with no booth cookie shares one open booth. Dropping the cookie
 * does not open another. Bringing that open booth back gives this browser its
 * own id. A phone that already has an id keeps it.
 */
export type BoothKind = "keep" | "share" | "claim";

export function boothKind(presented: boolean, open: boolean, known: boolean): BoothKind {
  if (presented && open) return "claim";
  if (presented && known) return "keep";
  return "share";
}
