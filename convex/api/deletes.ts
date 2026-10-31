// Registers `internal.api.deletes.*`. Definitions live in ../features/deletes.
import { deletesApi } from "../features/deletes/internal"

export const { nextBatch, deleteBatch, restartIfStuck } = deletesApi
