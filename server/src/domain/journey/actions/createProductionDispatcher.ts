import type { Pool } from "pg";

import { config } from "../../../config.js";
import {
  getDecryptedToken,
  getSoleConnectedAccount,
} from "../../../db/tokens.js";

import {
  MetaInstagramApiClient,
  type InstagramHttpClient,
} from "../../../integrations/instagram/client.js";

import {
  InstagramMessageSender,
} from "../../../integrations/instagram/instagramMessageSender.js";

import { SendMessageHandler } from "./handlers/sendMessageHandler.js";
import { ActionDispatcher } from "./dispatcher.js";
import type {
  MessageSender,
  MessageSendRequest,
} from "./types.js";

const FETCH_TIMEOUT_MS = 10_000;

function createFetchHttpClient(): InstagramHttpClient {
  return {
    async post(url, options) {
      const response = await fetch(url, {
        method: "POST",
        headers: options.headers,
        body:
          options.body === undefined
            ? undefined
            : JSON.stringify(options.body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      return {
        status: response.status,
        json: () => response.json(),
      };
    },
  };
}

class TenantAwareInstagramMessageSender
  implements MessageSender
{
  private readonly client: MetaInstagramApiClient;

  constructor(
    private readonly dependencies: {
      pool: Pool;
      http: InstagramHttpClient;
      graphApiBaseUrl: string;
      tokenKeyring?: Map<string, Buffer>;
    },
  ) {
    this.client = new MetaInstagramApiClient(
      dependencies.http,
      dependencies.graphApiBaseUrl,
    );
  }

  async send(
    request: MessageSendRequest,
  ): Promise<void> {
    const account =
      await getSoleConnectedAccount(
        this.dependencies.pool,
        request.tenantId,
      );

    if (!account) {
      throw new Error(
        `No connected Instagram account for tenant ${request.tenantId}`,
      );
    }

    const keyring =
      this.dependencies.tokenKeyring ??
      config.tokenKeyring;

    const accessToken =
      await getDecryptedToken(
        this.dependencies.pool,
        keyring,
        request.tenantId,
        account.instagramAccountId,
      );

    if (!accessToken) {
      throw new Error(
        `Instagram access token not found for tenant ${request.tenantId} and account ${account.instagramAccountId}`,
      );
    }

    const sender =
      new InstagramMessageSender(
        this.client,
        {
          accessToken,
        },
      );

    await sender.send(request);
  }
}

export interface CreateProductionJourneyActionDispatcherDependencies {
  pool: Pool;
  http?: InstagramHttpClient;
  graphApiBaseUrl?: string;
  tokenKeyring?: Map<string, Buffer>;
}

export function createProductionJourneyActionDispatcher(
  dependencies: CreateProductionJourneyActionDispatcherDependencies,
): ActionDispatcher {
  const sender =
    new TenantAwareInstagramMessageSender({
      pool: dependencies.pool,
      http:
        dependencies.http ??
        createFetchHttpClient(),
      graphApiBaseUrl:
        dependencies.graphApiBaseUrl ??
        config.instagramGraphApiBaseUrl,
      tokenKeyring:
        dependencies.tokenKeyring,
    });

  return new ActionDispatcher([
    new SendMessageHandler(sender),
  ]);
}
