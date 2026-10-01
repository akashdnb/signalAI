import type {
  JourneyActionExecution,
  JourneyActionHandler,
} from "../types.js";

import type { MessageSender } from "../types.js";

export class SendMessageHandler implements JourneyActionHandler {
  readonly type = "SEND_MESSAGE" as const;

  constructor(private readonly messageSender: MessageSender) {}

  async execute(input: JourneyActionExecution): Promise<void> {
    await this.messageSender.send({
      idempotencyKey: input.idempotencyKey,
      tenantId: input.execution.tenantId,
      subjectKey: input.execution.subjectKey,
      executionId: input.execution.executionId,
      actionId: input.action.id,
      payload: input.action.payload,
    });
  }
}
