type Posting = { company: string; evidence: { boardId: string | null } }

const sameCompany = (a: Posting, b: Posting) =>
  a.company === b.company && a.evidence.boardId === b.evidence.boardId

/** Groups of the same role, folded into runs of one company in a row, so a company that posted
 * several roles at once is one line. Only neighbors fold: the list stays in its order. */
export const companyRuns = <T extends Posting>(roles: T[][]) => {
  const runs: T[][][] = []
  for (const role of roles) {
    const run = runs.at(-1)
    if (run && sameCompany(run[0]![0]!, role[0]!)) run.push(role)
    else runs.push([role])
  }
  return runs
}
