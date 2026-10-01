import type { Pool, PoolClient } from "pg";
import type { BuilderGraph } from "./journeyGraph.js";

export interface PublishedJourney {
  id: string;
  tenantId: string;
  campaignId: string;
  version: number;
  graph: BuilderGraph;
  createdAt: string;
  publishedAt: string;
}

interface PublishedJourneyRow {
  id: string;
  tenant_id: string;
  campaign_id: string;
  version: number;
  graph: BuilderGraph;
  created_at: string;
  published_at: string;
}

function toPublishedJourney(row: PublishedJourneyRow): PublishedJourney {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    campaignId: row.campaign_id,
    version: row.version,
    graph: row.graph,
    createdAt: row.created_at,
    publishedAt: row.published_at,
  };
}

export async function getLatestPublishedJourneyWithClient(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
): Promise<PublishedJourney | null> {
  const result = await client.query<PublishedJourneyRow>(
    `select *
       from campaign_journey_versions
      where tenant_id = $1
        and campaign_id = $2
      order by version desc
      limit 1`,
    [tenantId, campaignId],
  );

  return result.rows[0]
    ? toPublishedJourney(result.rows[0])
    : null;
}

export async function getPublishedJourneyWithClient(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
  version: number,
): Promise<PublishedJourney | null> {
  const result = await client.query<PublishedJourneyRow>(
    `select *
       from campaign_journey_versions
      where tenant_id = $1
        and campaign_id = $2
        and version = $3`,
    [tenantId, campaignId, version],
  );

  return result.rows[0]
    ? toPublishedJourney(result.rows[0])
    : null;
}

export async function getPublishedJourney(
  pool: Pool,
  tenantId: string,
  campaignId: string,
  version: number,
): Promise<PublishedJourney | null> {
  const result = await pool.query<PublishedJourneyRow>(
    `select *
       from campaign_journey_versions
      where tenant_id = $1
        and campaign_id = $2
        and version = $3`,
    [tenantId, campaignId, version],
  );

  return result.rows[0]
    ? toPublishedJourney(result.rows[0])
    : null;
}

export async function createPublishedJourneyWithClient(
  client: PoolClient,
  tenantId: string,
  campaignId: string,
  graph: BuilderGraph,
): Promise<PublishedJourney> {
  const latest = await client.query<{ version: number }>(
    `select version
       from campaign_journey_versions
      where tenant_id = $1
        and campaign_id = $2
      order by version desc
      limit 1
      for update`,
    [tenantId, campaignId],
  );

  const version = (latest.rows[0]?.version ?? 0) + 1;

  const result = await client.query<PublishedJourneyRow>(
    `insert into campaign_journey_versions (
       tenant_id,
       campaign_id,
       version,
       graph
     )
     values ($1, $2, $3, $4)
     returning *`,
    [tenantId, campaignId, version, graph],
  );

  return toPublishedJourney(result.rows[0]!);
}
