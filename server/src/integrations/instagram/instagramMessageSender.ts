import type {
  MessageSender,
  MessageSendRequest,
} from "../../domain/journey/actions/types.js";

import type {
  InstagramApiClient,
} from "./client.js";

function readText(
  payload: Record<string, unknown>,
): string | null {
  if (typeof payload.text === "string") {
    return payload.text;
  }

  const data = payload.data;

  if (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>).text === "string"
  ) {
    return (data as Record<string, unknown>).text as string;
  }

  return null;
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
    });
  }
}
