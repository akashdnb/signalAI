import type { JourneyAction } from "../../../db/journeyActions.js";
import type { JourneyExecutionContext } from "../../../db/journeyExecutions.js";
import type {
  JourneyActionExecution,
  JourneyActionHandler,
} from "./types.js";

export class ActionDispatcher {
  private readonly handlers = new Map<
    JourneyAction["actionType"],
    JourneyActionHandler
  >();

  constructor(handlers: JourneyActionHandler[]) {
    for (const handler of handlers) {
      if (this.handlers.has(handler.type)) {
        throw new Error(
          `Duplicate journey action handler: ${handler.type}`,
        );
      }

      this.handlers.set(handler.type, handler);
    }
  }

  async dispatch(
    action: JourneyAction,
    execution: JourneyExecutionContext,
  ): Promise<void> {
    const handler = this.handlers.get(action.actionType);

    if (!handler) {
      throw new Error(
        `No journey action handler registered for ${action.actionType}`,
      );
    }

    const input: JourneyActionExecution = {
      action,
      execution,
      idempotencyKey: action.id,
    };

    await handler.execute(input);
  }
}
