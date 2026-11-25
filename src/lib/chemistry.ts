import type { Chemistry } from "@/lib/types";

export type ExtraChemistry = "daylight" | "night";

export function isExtraChemistry(value: Chemistry | null): value is ExtraChemistry {
  return value === "daylight" || value === "night";
}

/**
 * Daylight and Night are the extra baths. Tapping the one already
 * chosen clears it, so an accidental tap can be undone. Tapping the
 * other one replaces the choice.
 */
export function nextChemistry(current: Chemistry | null, tapped: ExtraChemistry): Chemistry | null {
  return current === tapped ? null : tapped;
}

/** With neither extra bath chosen, the print uses the ordinary bath. */
export function developBath(chemistry: Chemistry | null): Chemistry {
  return isExtraChemistry(chemistry) ? chemistry : "default";
}

/**
 * A held null is a clear waiting to be saved. A missing hold means
 * the screen should show whatever the lab last stored.
 */
export function heldChemistry(
  pending: { has(id: string): boolean; get(id: string): Chemistry | null | undefined },
  id: string,
  saved: Chemistry | null,
): Chemistry | null {
  if (!pending.has(id)) return saved;
  return pending.get(id) ?? null;
}
