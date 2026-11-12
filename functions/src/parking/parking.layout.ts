/**
 * Floor plan of one level (identical on B4 and B5), 35 bays:
 *   Row A 001-010 (north wall) | drive aisle 1
 *   Row B 011-018 + LIFT       | back-to-back island, lift core at its east end
 *   Row C 019-026 + LIFT LOBBY |
 *   drive aisle 2 | Row D 027-035 + ramp (south wall)
 * Distances are mock survey figures: metres walked from the bay to the lift lobby.
 */
const METRES_PER_BAY = 5;
const ROWS: Array<{ from: number; to: number; base: number }> = [
  { from: 1, to: 10, base: 14 }, // across aisle 1 from the lift
  { from: 11, to: 18, base: 6 }, // same island as the lift
  { from: 19, to: 26, base: 5 }, // opens onto the lift lobby
  { from: 27, to: 35, base: 13 }, // across aisle 2
];
const SPECIAL: Record<number, number> = {};

/** Walking distance in metres from bay number `n` to the lift lobby. */
export function liftDistance(n: number): number {
  if (SPECIAL[n] !== undefined) return SPECIAL[n];
  for (const r of ROWS) if (n >= r.from && n <= r.to) return r.base + (r.to - n) * METRES_PER_BAY;
  return 99;
}
