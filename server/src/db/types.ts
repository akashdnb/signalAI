import type { Pool, PoolClient } from "pg";

/** Accepts either a pool or a checked-out client, so repository functions work unchanged inside a caller's transaction. */
export type Queryable = Pool | PoolClient;
