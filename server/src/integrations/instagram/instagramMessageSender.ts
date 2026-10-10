import type { Pool } from "pg";

import type {
  MessageSender,
  MessageSendRequest,
} from "../../domain/journey/actions/types.js";

import type {
  InstagramApiClient,
} from "./client.js";

import type {
  InstagramMessagePresentation,
  InstagramRichMessageOptions,
} from "../../lib/instagramMessagePayload.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readData(payload: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(payload.data) ? payload.data : null;
}

function readText(payload: Record<string, unknown>): string | null {
  if (typeof payload.text === "string") return payload.text;
  const data = readData(payload);
  return data && typeof data.text === "string" ? data.text : null;
}

function readRichMessage(payload: Record<string, unknown>): InstagramRichMessageOptions | undefined {
  const data = readData(payload);
  const rich = isRecord(payload.richMessage)
    ? payload.richMessage
    : data && isRecord(data.richMessage)
      ? data.richMessage
      : null;
  if (!rich) return undefined;

  const options: InstagramRichMessageOptions = {};
  if (typeof rich.ctaUrl === "string") options.ctaUrl = rich.ctaUrl;
  if (typeof rich.imageUrl === "string") options.imageUrl = rich.imageUrl;
  if (typeof rich.title === "string") options.title = rich.title;
  if (typeof rich.subtitle === "string") options.subtitle = rich.subtitle;
  if (typeof rich.buttonTitle === "string") options.buttonTitle = rich.buttonTitle;
  if (isRecord(rich.presentation)) {
    // The payload composer validates this untrusted persisted JSON before
    // sending; this cast preserves the discriminated type at the API edge.
    options.presentation = rich.presentation as InstagramMessagePresentation;
  }

  return Object.keys(options).length > 0 ? options : undefined;
}

function allowsEmptyBody(options: InstagramRichMessageOptions | undefined): boolean {
  if (!options) return false;
  const presentation = options.presentation;
  if (presentation?.type === "card" || presentation?.type === "gallery") return true;

  // Backward-compatible card metadata becomes a Generic Template without
  // requiring a separate text body.
  return typeof options.ctaUrl === "string" &&
    typeof options.imageUrl === "string" &&
    options.imageUrl.length > 0;
}

interface JourneyCampaignPresentation {
  ctaUrl: string | null;
  title: string | null;
  thumbnailUrl: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function readCampaignPresentation(
  pool: Pool,
  tenantId: string,
  executionId: string,
): Promise<JourneyCampaignPresentation | null> {
  if (!UUID_RE.test(executionId)) return null;

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
    ? { ctaUrl: row.cta_link, title: row.name, thumbnailUrl: row.thumbnail_url }
    : null;
}

function mergePresentation(
  explicit: InstagramRichMessageOptions | undefined,
  campaign: JourneyCampaignPresentation | null,
): InstagramRichMessageOptions | undefined {
  // An explicit presentation is authoritative. Campaign metadata must never
  // replace a card/gallery/quick-reply/targetable-button definition.
  if (explicit?.presentation || explicit?.ctaUrl || explicit?.imageUrl) return explicit;
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

export class InstagramMessageSender implements MessageSender {
  constructor(
    private readonly client: InstagramApiClient,
    private readonly config: InstagramMessageSenderConfig,
    private readonly pool?: Pool,
  ) {}

  async send(request: MessageSendRequest): Promise<void> {
    const text = readText(request.payload);
    const explicitRichMessage = readRichMessage(request.payload);
    const allowsEmpty = allowsEmptyBody(explicitRichMessage);

    if ((typeof text !== "string" || text.trim().length === 0) && !allowsEmpty) {
      throw new Error(
        "SEND_MESSAGE action requires non-empty text or a valid card/gallery presentation",
      );
    }

    const campaignPresentation =
      explicitRichMessage?.presentation ||
      explicitRichMessage?.ctaUrl ||
      explicitRichMessage?.imageUrl ||
      !this.pool
        ? null
        : await readCampaignPresentation(this.pool, request.tenantId, request.executionId);

    const richMessage = mergePresentation(explicitRichMessage, campaignPresentation);
    const sendRequest = {
      accessToken: this.config.accessToken,
      recipientId: request.subjectKey,
      text: typeof text === "string" ? text.trim() : "",
      idempotencyKey: request.idempotencyKey,
      ...(richMessage ? { richMessage } : {}),
    };

    await this.client.sendMessage(sendRequest);
  }
}
