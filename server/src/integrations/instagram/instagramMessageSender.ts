import type {
  MessageSender,
  MessageSendRequest,
} from "../../domain/journey/actions/types.js";

import type {
  InstagramApiClient,
} from "./client.js";

export interface InstagramMessageSenderConfig {
  accessToken: string;
}

export class InstagramMessageSender implements MessageSender {
  constructor(
    private readonly client: InstagramApiClient,
    private readonly config: InstagramMessageSenderConfig,
  ) {}

  async send(request: MessageSendRequest): Promise<void> {
    const text = request.payload.text;

    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error(
        "SEND_MESSAGE action requires a non-empty text payload",
      );
    }

    await this.client.sendMessage({
      accessToken: this.config.accessToken,
      recipientId: request.subjectKey,
      text,
      idempotencyKey: request.idempotencyKey,
    });
  }
}
