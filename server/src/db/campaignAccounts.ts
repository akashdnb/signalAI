import type { Pool, PoolClient } from "pg";

export interface CampaignInstagramAccountBinding {
  campaignId: string;
  accountId: string;
  instagramAccountId: string;
  enabled: boolean;
}

type Queryable = Pool | PoolClient;

function mapRow(row: Record<string, unknown>): CampaignInstagramAccountBinding {
  return {
    campaignId: String(row.campaign_id),
    accountId: String(row.meta_token_id),
    instagramAccountId: String(row.instagram_account_id),
    enabled: Boolean(row.enabled),
  };
}

export async function listCampaignInstagramAccounts(
  pool: Queryable,
  tenantId: string,
  campaignId: string,
): Promise<CampaignInstagramAccountBinding[]> {
  const result = await pool.query(
    `select cia.campaign_id,
            cia.meta_token_id,
            cia.enabled,
            mt.instagram_account_id
       from campaign_instagram_accounts cia
       join campaigns c on c.id = cia.campaign_id
       join meta_tokens mt on mt.id = cia.meta_token_id
      where cia.campaign_id = $1
        and c.tenant_id = $2
        and mt.tenant_id = $2
      order by mt.created_at asc`,
    [campaignId, tenantId],
  );

  return result.rows.map(mapRow);
}

export async function attachCampaignToInstagramAccount(
  pool: Queryable,
  tenantId: string,
  campaignId: string,
  accountId: string,
): Promise<CampaignInstagramAccountBinding> {
  const result = await pool.query(
    `insert into campaign_instagram_accounts (campaign_id, meta_token_id)
     select c.id, mt.id
       from campaigns c
       join meta_tokens mt on mt.tenant_id = c.tenant_id
      where c.id = $1
        and c.tenant_id = $3
        and mt.id = $2
        and mt.tenant_id = $3
        and mt.status = 'healthy'
     on conflict (campaign_id, meta_token_id)
     do update set enabled = true, updated_at = now()
     returning campaign_id, meta_token_id, enabled`,
    [campaignId, accountId, tenantId],
  );

  if (!result.rows[0]) {
    throw new Error("campaign or healthy Instagram account not found in tenant");
  }

  const row = await pool.query(
    `select cia.campaign_id, cia.meta_token_id, cia.enabled, mt.instagram_account_id
       from campaign_instagram_accounts cia
       join campaigns c on c.id = cia.campaign_id
       join meta_tokens mt on mt.id = cia.meta_token_id
      where cia.campaign_id = $1
        and cia.meta_token_id = $2
        and c.tenant_id = $3
        and mt.tenant_id = $3`,
    [campaignId, accountId, tenantId],
  );

  return mapRow(row.rows[0]);
}

export async function detachCampaignFromInstagramAccount(
  pool: Queryable,
  tenantId: string,
  campaignId: string,
  accountId: string,
): Promise<boolean> {
  const result = await pool.query(
    `delete from campaign_instagram_accounts cia
      using campaigns c, meta_tokens mt
      where cia.campaign_id = $1
        and cia.meta_token_id = $2
        and c.id = cia.campaign_id
        and mt.id = cia.meta_token_id
        and c.tenant_id = $3
        and mt.tenant_id = $3`,
    [campaignId, accountId, tenantId],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function listCampaignsForInstagramAccount(
  pool: Queryable,
  tenantId: string,
  accountId: string,
): Promise<string[]> {
  const result = await pool.query<{ campaign_id: string }>(
    `select cia.campaign_id
       from campaign_instagram_accounts cia
       join campaigns c on c.id = cia.campaign_id
       join meta_tokens mt on mt.id = cia.meta_token_id
      where c.tenant_id = $1
        and mt.id = $2
        and mt.tenant_id = $1
        and mt.status = 'healthy'
        and cia.enabled = true
      order by c.created_at asc`,
    [tenantId, accountId],
  );

  return result.rows.map((row) => row.campaign_id);
}
