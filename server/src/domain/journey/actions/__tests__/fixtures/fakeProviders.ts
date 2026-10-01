import type {
  ActionLinkHandler,
  HandoffHandler,
  MessageSender,
  MessageSendRequest,
} from "../../types.js";

export class FakeMessageSender implements MessageSender {
  readonly requests: MessageSendRequest[] = [];
  shouldFail = false;

  async send(request: MessageSendRequest): Promise<void> {
    this.requests.push(request);

    if (this.shouldFail) {
      throw new Error("fake message provider failure");
    }
  }
}

export class FakeHandoffHandler implements HandoffHandler {
  readonly requests: MessageSendRequest[] = [];
  shouldFail = false;

  async handoff(request: MessageSendRequest): Promise<void> {
    this.requests.push(request);

    if (this.shouldFail) {
      throw new Error("fake handoff provider failure");
    }
  }
}

export class FakeActionLinkHandler implements ActionLinkHandler {
  readonly requests: MessageSendRequest[] = [];
  shouldFail = false;

  async open(request: MessageSendRequest): Promise<void> {
    this.requests.push(request);

    if (this.shouldFail) {
      throw new Error("fake action link provider failure");
    }
  }
}
