export interface InstagramSendMessageRequest {
  accessToken: string;
  recipientId: string;
  text: string;
  idempotencyKey: string;
}

export interface InstagramApiClient {
  sendMessage(
    request: InstagramSendMessageRequest,
  ): Promise<void>;
}

export interface InstagramHttpClient {
  post(
    url: string,
    options: {
      headers?: Record<string, string>;
      body?: unknown;
    },
  ): Promise<{
    status: number;
    json(): Promise<unknown>;
  }>;
}

export class MetaInstagramApiClient implements InstagramApiClient {
  constructor(
    private readonly http: InstagramHttpClient,
    private readonly graphApiBaseUrl: string,
  ) {}

  async sendMessage(
    request: InstagramSendMessageRequest,
  ): Promise<void> {
    const response = await this.http.post(
      `${this.graphApiBaseUrl}/me/messages`,
      {
        headers: {
          Authorization: `Bearer ${request.accessToken}`,
          "Content-Type": "application/json",
          "Idempotency-Key": request.idempotencyKey,
        },
        body: {
          recipient: {
            id: request.recipientId,
          },
          message: {
            text: request.text,
          },
        },
      },
    );

    if (response.status >= 200 && response.status < 300) {
      return;
    }

    let body: unknown;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    throw new InstagramApiError(
      `Instagram API returned HTTP ${response.status}`,
      response.status,
      body,
    );
  }
}

export class InstagramApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly responseBody: unknown,
  ) {
    super(message);
    this.name = "InstagramApiError";
  }

  get retryable(): boolean {
    return (
      this.status === 408 ||
      this.status === 429 ||
      this.status >= 500
    );
  }
}
