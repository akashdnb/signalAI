import type {
  ActionLinkHandler,
  HandoffHandler,
  MessageSender,
} from "./types.js";

import { ActionDispatcher } from "./dispatcher.js";
import { SendMessageHandler } from "./handlers/sendMessageHandler.js";

export interface JourneyActionDispatcherDependencies {
  messageSender: MessageSender;
  handoffHandler: HandoffHandler;
  actionLinkHandler: ActionLinkHandler;
}

export function createJourneyActionDispatcher(
  dependencies: JourneyActionDispatcherDependencies,
): ActionDispatcher {
  return new ActionDispatcher([
    new SendMessageHandler(dependencies.messageSender),
  ]);
}
