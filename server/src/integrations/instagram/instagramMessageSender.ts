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

export interface InstagramMessageSenderConfig {
  accessToken: string;
}

export class InstagramMessageSender
  implements MessageSender
{
  constructor(
    private readonly client: InstagramApiClient,
    private readonly config: InstagramMessageSenderConfig,
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

    await this.client.sendMessage({
      accessToken:
        this.config.accessToken,
      recipientId:
        request.subjectKey,
      text: text.trim(),
      idempotencyKey:
        request.idempotencyKey,
      richMessage: readRichMessage(request.payload),
    });
  }
}
