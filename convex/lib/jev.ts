// Reading Jev's yes-or-no answers. A Noul is the probability that a statement is true;
// near 0.5 the model is saying it doesn't know, not that the answer is "a bit yes". So
// a yes needs 0.7, a no 0.3, and everything between is unsure, which code treats as
// "don't act on it". (TypeSafe's own starting points; tune per question with real data.)

export type NoulAnswer = { probability?: number } | undefined
export type Noul = "yes" | "no" | "unsure"

export const yesFrom = 0.7
export const noUpTo = 0.3

export const readNoul = (answer: NoulAnswer): Noul => {
  const p = answer?.probability
  if (p === undefined) return "unsure"
  return p >= yesFrom ? "yes" : p <= noUpTo ? "no" : "unsure"
}
