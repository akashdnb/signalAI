import type { Pool } from "pg";

import {
  decryptCredential,
  encryptCredential,
} from "../../lib/credentials/encryption.js";

export interface InstagramAccount {
  id: string;
  tenantId: string;
  instagramUserId: string;
}

export interface SaveInstagramAccountInput {
  id: string;
  tenantId: string;
  instagramUserId: string;
  accessToken: string;
}

export class InstagramAccountRepository {
  constructor(private readonly pool: Pool) {}

  async save(
    input: SaveInstagramAccountInput,
  ): Promise<InstagramAccount> {
    const encryptedToken = encryptCredential(
      input.accessToken,
    );

    const result = await this.pool.query(
      `
        insert into instagram_accounts (
          id,
          tenant_id,
          instagram_user_id,
          access_token_encrypted
        )
        values ($1, $2, $3, $4)
        on conflict (tenant_id, instagram_user_id)
        do update set
          access_token_encrypted = excluded.access_token_encrypted,
          updated_at = now()
        returning
          id,
          tenant_id,
          instagram_user_id
      `,
      [
        input.id,
        input.tenantId,
        input.instagramUserId,
        encryptedToken,
      ],
    );

    return {
      id: result.rows[0].id,
      tenantId: result.rows[0].tenant_id,
      instagramUserId: result.rows[0].instagram_user_id,
    };
  }

  async getForTenant(
    tenantId: string,
    instagramUserId: string,
  ): Promise<{
    account: InstagramAccount;
    accessToken: string;
  } | null> {
    const result = await this.pool.query(
      `
        select
          id,
          tenant_id,
          instagram_user_id,
          access_token_encrypted
        from instagram_accounts
        where tenant_id = $1
          and instagram_user_id = $2
        limit 1
      `,
      [tenantId, instagramUserId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      account: {
        id: row.id,
        tenantId: row.tenant_id,
        instagramUserId: row.instagram_user_id,
      },
      accessToken: decryptCredential(
        row.access_token_encrypted,
      ),
    };
  }
}
