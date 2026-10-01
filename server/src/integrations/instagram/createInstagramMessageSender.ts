import type { Pool } from "pg";

import type { MessageSender } from "../../domain/journey/actions/types.js";
import {
  InstagramMessageSender,
} from "./instagramMessageSender.js";
import {
  MetaInstagramApiClient,
  type InstagramHttpClient,
} from "./client.js";
import {
  InstagramAccountRepository,
} from "./instagramAccounts.js";

export class InstagramAccountNotFoundError extends Error {
  constructor(
    readonly tenantId: string,
    readonly instagramUserId: string,
  ) {
    super(
      `Instagram account not found for tenant ${tenantId} and user ${instagramUserId}`,
    );

    this.name = "InstagramAccountNotFoundError";
  }
}

export interface CreateInstagramMessageSenderDependencies {
  pool: Pool;
  http: InstagramHttpClient;
  graphApiBaseUrl: string;
}

export async function createInstagramMessageSender(
  dependencies: CreateInstagramMessageSenderDependencies,
  tenantId: string,
  instagramUserId: string,
): Promise<MessageSender> {
  const repository = new InstagramAccountRepository(
    dependencies.pool,
  );

  const account = await repository.getForTenant(
    tenantId,
    instagramUserId,
  );

  if (!account) {
    throw new InstagramAccountNotFoundError(
      tenantId,
      instagramUserId,
    );
  }

  const client = new MetaInstagramApiClient(
    dependencies.http,
    dependencies.graphApiBaseUrl,
  );

  return new InstagramMessageSender(
    client,
    {
      accessToken: account.accessToken,
    },
  );
}
