import type { JourneyAction } from "../../../db/journeyActions.js";
import type { JourneyExecutionContext } from "../../../db/journeyExecutions.js";

export interface JourneyActionExecution {
  action: JourneyAction;
  execution: JourneyExecutionContext;
  idempotencyKey: string;
}

export interface MessageSendRequest {
  idempotencyKey: string;
  tenantId: string;
  subjectKey: string;
  executionId: string;
  actionId: string;
  payload: Record<string, unknown>;
}

export interface HandoffRequest {
  idempotencyKey: string;
  tenantId: string;
  subjectKey: string;
  executionId: string;
  actionId: string;
  payload: Record<string, unknown>;
}

export interface ActionLinkRequest {
  idempotencyKey: string;
  tenantId: string;
  subjectKey: string;
  executionId: string;
  actionId: string;
  payload: Record<string, unknown>;
}

export interface MessageSender {
  send(request: MessageSendRequest): Promise<void>;
}

export interface HandoffHandler {
  handoff(request: HandoffRequest): Promise<void>;
}

export interface ActionLinkHandler {
  open(request: ActionLinkRequest): Promise<void>;
}

export interface JourneyActionHandler {
  readonly type: JourneyAction["actionType"];
  execute(input: JourneyActionExecution): Promise<void>;
}
