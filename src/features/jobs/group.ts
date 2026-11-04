type Posting = { company: string; evidence: { boardId: string | null } }

const sameCompany = (a: Posting, b: Posting) =>
  a.company === b.company && a.evidence.boardId === b.evidence.boardId

export const companyRuns = <T extends Posting>(roles: T[][]) => {
  const runs: T[][][] = []
  for (const role of roles) {
    const run = runs.at(-1)
    if (run && sameCompany(run[0]![0]!, role[0]!)) run.push(role)
    else runs.push([role])
  }
  return runs
}
