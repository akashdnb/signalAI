import type {
  ActionLinkHandler,
  HandoffHandler,
  JourneyActionExecution,
  JourneyActionHandler,
  MessageSender,
} from "./types.js";

function buildRequest(input: JourneyActionExecution) {
  return {
    tenantId: input.execution.tenantId,
    subjectKey: input.execution.subjectKey,
    executionId: input.execution.executionId,
    actionId: input.action.id,
    idempotencyKey: input.idempotencyKey,
    payload: input.action.payload,
  };
}

export class SendMessageActionHandler implements JourneyActionHandler {
  readonly type = "SEND_MESSAGE" as const;

  constructor(private readonly sender: MessageSender) {}

  async execute(input: JourneyActionExecution): Promise<void> {
    await this.sender.send(buildRequest(input));
  }
}

export class HandoffActionHandler implements JourneyActionHandler {
  readonly type = "HANDOFF" as const;

  constructor(private readonly handler: HandoffHandler) {}

  async execute(input: JourneyActionExecution): Promise<void> {
    await this.handler.handoff(buildRequest(input));
  }
}

export class OpenActionLinkHandler implements JourneyActionHandler {
  readonly type = "OPEN_ACTION_LINK" as const;

  constructor(private readonly handler: ActionLinkHandler) {}

  async execute(input: JourneyActionExecution): Promise<void> {
    await this.handler.open(buildRequest(input));
  }
}
