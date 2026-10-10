import type { Pool } from "pg";

import type {
  MessageSender,
  MessageSendRequest,
} from "../../domain/journey/actions/types.js";

import type {
  InstagramApiClient,
} from "./client.js";

import type {
  InstagramRichMessageOptions,
} from "../../lib/instagramMessagePayload.js";

function readData(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (typeof payload.data === "object" && payload.data !== null) {
    return payload.data as Record<string, unknown>;
  }

  return null;
}

function readText(
  payload: Record<string, unknown>,
): string | null {
  if (typeof payload.text === "string") {
    return payload.text;
  }

  const data = readData(payload);
  return data && typeof data.text === "string" ? data.text : null;
}

function readRichMessage(
  payload: Record<string, unknown>,
): InstagramRichMessageOptions | undefined {
  const data = readData(payload);
  if (!data) return undefined;

  const rich = data.richMessage;
  if (typeof rich !== "object" || rich === null) return undefined;

  const value = rich as Record<string, unknown>;
  const options: InstagramRichMessageOptions = {};

  if (typeof value.ctaUrl === "string") options.ctaUrl = value.ctaUrl;
  if (typeof value.imageUrl === "string") options.imageUrl = value.imageUrl;
  if (typeof value.title === "string") options.title = value.title;
  if (typeof value.subtitle === "string") options.subtitle = value.subtitle;
  if (typeof value.buttonTitle === "string") options.buttonTitle = value.buttonTitle;

  return Object.keys(options).length > 0 ? options : undefined;
}

interface JourneyCampaignPresentation {
  ctaUrl: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

async function readCampaignPresentation(
  pool: Pool,
  tenantId: string,
  executionId: string,
): Promise<JourneyCampaignPresentation | null> {
  const result = await pool.query<{
    cta_link: string | null;
    name: string;
    thumbnail_url: string | null;
  }>(
    `
      select
        c.cta_link,
        c.name,
        (
          select m.thumbnail_url
          from media_metadata m
          where m.tenant_id = c.tenant_id
            and m.media_id = any(c.target_media_ids)
            and m.thumbnail_url is not null
          order by array_position(c.target_media_ids, m.media_id)
          limit 1
        ) as thumbnail_url
      from journey_executions e
      join campaigns c
        on c.id = e.campaign_id
       and c.tenant_id = e.tenant_id
      where e.id = $1
        and e.tenant_id = $2
      limit 1
    `,
    [executionId, tenantId],
  );

  const row = result.rows[0];
  return row
    ? {
        ctaUrl: row.cta_link,
        title: row.name,
        thumbnailUrl: row.thumbnail_url,
      }
    : null;
}

function mergePresentation(
  explicit: InstagramRichMessageOptions | undefined,
  campaign: JourneyCampaignPresentation | null,
): InstagramRichMessageOptions | undefined {
  if (explicit?.ctaUrl || explicit?.imageUrl) return explicit;
  if (!campaign?.ctaUrl) return explicit;

  return {
    ctaUrl: campaign.ctaUrl,
    imageUrl: campaign.thumbnailUrl ?? undefined,
    title: campaign.title ?? undefined,
  };
}

export interface InstagramMessageSenderConfig {
  accessToken: string;
}

export class InstagramMessageSender
  implements MessageSender
{
  constructor(
    private readonly client: InstagramApiClient,
    private readonly config: InstagramMessageSenderConfig,
    private readonly pool?: Pool,
  ) {}

  async send(
    request: MessageSendRequest,
  ): Promise<void> {
    const text =
      readText(request.payload);

    if (
      typeof text !== "string" ||
      text.trim().length === 0
    ) {
      throw new Error(
        "SEND_MESSAGE action requires a non-empty text payload",
      );
    }

    const explicitRichMessage = readRichMessage(request.payload);
    const campaignPresentation = explicitRichMessage?.ctaUrl || !this.pool
      ? null
      : await readCampaignPresentation(
          this.pool,
          request.tenantId,
          request.executionId,
        );
    const richMessage = mergePresentation(
      explicitRichMessage,
      campaignPresentation,
    );

    const sendRequest = {
      accessToken: this.config.accessToken,
      recipientId: request.subjectKey,
      text: text.trim(),
      idempotencyKey: request.idempotencyKey,
      ...(richMessage ? { richMessage } : {}),
    };

    await this.client.sendMessage(sendRequest);
  }
}
