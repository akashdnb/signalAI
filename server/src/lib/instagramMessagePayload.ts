export type InstagramMessageButton =
  | { type: "web_url"; title: string; url: string }
  | { type: "postback"; title: string; payload: string };

export interface InstagramQuickReply {
  title: string;
  payload: string;
}

export interface InstagramCard {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  buttons?: InstagramMessageButton[];
}

export type InstagramMessagePresentation =
  | { type: "text" }
  | { type: "buttons"; buttons: InstagramMessageButton[] }
  | { type: "card"; card: InstagramCard }
  | { type: "gallery"; cards: InstagramCard[] }
  | { type: "quick_replies"; replies: InstagramQuickReply[] };

export interface InstagramRichMessageOptions {
  /** Explicit campaign CTA. Never inferred from generated text. */
  ctaUrl?: string;
  /** Publicly reachable image URL for a Generic Template card. */
  imageUrl?: string;
  /** Generic Template headline (maximum 80 characters). */
  title?: string;
  /** Generic Template subtitle (maximum 80 characters). */
  subtitle?: string;
  /** CTA label (maximum 20 characters). */
  buttonTitle?: string;
  /** Explicit presentation selected by the automation/message composer. */
  presentation?: InstagramMessagePresentation;
}

export type InstagramMessagePayload =
  | { text: string; quick_replies?: InstagramQuickReplyPayload[] }
  | {
      attachment: {
        type: "template";
        payload:
          | {
              template_type: "button";
              text: string;
              buttons: InstagramMessageButtonPayload[];
            }
          | {
              template_type: "generic";
              elements: InstagramGenericElement[];
            };
      };
    };

type InstagramMessageButtonPayload =
  | { type: "web_url"; url: string; title: string }
  | { type: "postback"; payload: string; title: string };

interface InstagramGenericElement {
  title: string;
  image_url?: string;
  subtitle?: string;
  default_action?: { type: "web_url"; url: string };
  buttons?: InstagramMessageButtonPayload[];
}

interface InstagramQuickReplyPayload {
  content_type: "text";
  title: string;
  payload: string;
}

export const INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX = "signalai:node:";

const BUTTON_TEMPLATE_TEXT_LIMIT = 640;
const GENERIC_TEMPLATE_TITLE_LIMIT = 80;
const GENERIC_TEMPLATE_SUBTITLE_LIMIT = 80;
const MAX_BUTTON_TITLE_LENGTH = 20;
const MAX_BUTTONS = 3;
const MAX_GALLERY_CARDS = 10;
const MAX_QUICK_REPLIES = 13;
const MAX_INTERACTION_PAYLOAD_LENGTH = 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Build a safe node-target payload for a button/quick reply wired to a journey edge. */
export function buildJourneyNodePayload(nodeId: string): string {
  const target = nodeId.trim();
  if (!target || target.length > 200 || /[\r\n]/.test(target)) {
    throw new Error("A valid journey node id is required");
  }
  return `${INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX}${target}`;
}

function fallbackToText(body: string, reason: string): InstagramMessagePayload {
  // Falling back to an empty text message is not a safe recovery path. It
  // usually means a structured-only message was malformed, so fail closed.
  if (!body) throw new Error(`Invalid Instagram message presentation: ${reason}`);
  return { text: body };
}

function normalizeButton(value: unknown): InstagramMessageButtonPayload | null {
  if (!isRecord(value) || (value.type !== "web_url" && value.type !== "postback")) {
    return null;
  }

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (!title || title.length > MAX_BUTTON_TITLE_LENGTH) return null;

  if (value.type === "web_url") {
    return isHttpsUrl(value.url)
      ? { type: "web_url", url: value.url, title }
      : null;
  }

  const payload = typeof value.payload === "string" ? value.payload.trim() : "";
  return payload && payload.length <= MAX_INTERACTION_PAYLOAD_LENGTH
    ? { type: "postback", payload, title }
    : null;
}

/**
 * Invalid or excess buttons invalidate the presentation instead of being
 * silently dropped; users must see the same actions they configured.
 */
function normalizeButtons(
  values: unknown,
  allowEmpty = false,
): InstagramMessageButtonPayload[] | null {
  if (values === undefined && allowEmpty) return [];
  if (!Array.isArray(values)) return allowEmpty ? [] : null;
  if ((!allowEmpty && values.length === 0) || values.length > MAX_BUTTONS) return null;

  const buttons = values.map(normalizeButton);
  if (buttons.some((button) => button === null)) return null;
  return buttons as InstagramMessageButtonPayload[];
}

function normalizeCard(value: unknown): InstagramGenericElement | null {
  if (!isRecord(value)) return null;

  const title = typeof value.title === "string" ? value.title.trim() : "";
  const subtitle = typeof value.subtitle === "string" ? value.subtitle.trim() : undefined;
  if (!title || title.length > GENERIC_TEMPLATE_TITLE_LIMIT) return null;
  if (subtitle && subtitle.length > GENERIC_TEMPLATE_SUBTITLE_LIMIT) return null;

  let imageUrl: string | undefined;
  if (value.imageUrl !== undefined) {
    if (!isHttpsUrl(value.imageUrl)) return null;
    imageUrl = value.imageUrl;
  }

  const buttons = normalizeButtons(value.buttons, true);
  if (buttons === null) return null;
  const defaultAction = buttons.find((button) => button.type === "web_url");

  return {
    title,
    ...(imageUrl ? { image_url: imageUrl } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(defaultAction && defaultAction.type === "web_url"
      ? { default_action: { type: "web_url" as const, url: defaultAction.url } }
      : {}),
    ...(buttons.length ? { buttons } : {}),
  };
}

function buildQuickReplies(value: unknown): InstagramQuickReplyPayload[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_QUICK_REPLIES) {
    return null;
  }

  const replies: InstagramQuickReplyPayload[] = [];
  for (const item of value) {
    if (!isRecord(item)) return null;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const payload = typeof item.payload === "string" ? item.payload.trim() : "";
    if (
      !title ||
      title.length > MAX_BUTTON_TITLE_LENGTH ||
      !payload ||
      payload.length > MAX_INTERACTION_PAYLOAD_LENGTH
    ) {
      return null;
    }
    replies.push({ content_type: "text", title, payload });
  }
  return replies;
}

function isJourneyTargetPayload(payload: string): boolean {
  return payload.startsWith(INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX) &&
    payload.slice(INSTAGRAM_JOURNEY_NODE_PAYLOAD_PREFIX.length).length > 0;
}

function buildLegacyPresentation(
  text: string,
  options: InstagramRichMessageOptions,
): InstagramMessagePresentation {
  const body = text.trim();
  const ctaUrl = isHttpsUrl(options.ctaUrl) ? options.ctaUrl : undefined;
  if (!ctaUrl) return { type: "text" };

  const requestedButtonTitle = options.buttonTitle?.trim();
  const buttonTitle =
    requestedButtonTitle && requestedButtonTitle.length <= MAX_BUTTON_TITLE_LENGTH
      ? requestedButtonTitle
      : "View details";

  if (
    isHttpsUrl(options.imageUrl) &&
    (options.subtitle?.trim() ?? body).length <= GENERIC_TEMPLATE_SUBTITLE_LIMIT &&
    (options.title?.trim() ?? "Learn more").length <= GENERIC_TEMPLATE_TITLE_LIMIT
  ) {
    return {
      type: "card",
      card: {
        title: options.title?.trim() || "Learn more",
        ...(options.subtitle?.trim() || body
          ? { subtitle: options.subtitle?.trim() || body }
          : {}),
        imageUrl: options.imageUrl,
        buttons: [{ type: "web_url", url: ctaUrl, title: buttonTitle }],
      },
    };
  }

  return {
    type: "buttons",
    buttons: [{ type: "web_url", url: ctaUrl, title: buttonTitle }],
  };
}

/**
 * Converts an explicit presentation to Meta's Send API shape.
 *
 * The composer never infers buttons from a URL in AI-generated copy. Limits
 * are validated as a whole: invalid buttons/cards/replies are not silently
 * removed or truncated. When structured output cannot preserve the authored
 * text, the full plain-text body is used instead.
 */
export function buildInstagramMessagePayload(
  text: string,
  options: InstagramRichMessageOptions = {},
): InstagramMessagePayload {
  const body = typeof text === "string" ? text.trim() : "";
  const presentation = options.presentation ?? buildLegacyPresentation(body, options);

  if (!isRecord(presentation) || typeof presentation.type !== "string") {
    return fallbackToText(body, "presentation must specify a type");
  }

  if (presentation.type === "text") {
    return { text: body };
  }

  if (presentation.type === "quick_replies") {
    const replies = buildQuickReplies(presentation.replies);
    return replies
      ? { text: body, quick_replies: replies }
      : fallbackToText(body, "quick replies exceed limits or contain invalid values");
  }

  if (presentation.type === "buttons") {
    const buttons = normalizeButtons(presentation.buttons);
    if (!body || body.length > BUTTON_TEMPLATE_TEXT_LIMIT || !buttons) {
      return fallbackToText(body, "button template requires text (maximum 640 characters) and 1–3 valid buttons");
    }
    return {
      attachment: {
        type: "template",
        payload: { template_type: "button", text: body, buttons },
      },
    };
  }

  if (presentation.type === "card") {
    const card = isRecord(presentation.card) ? presentation.card : null;
    if (!card) return fallbackToText(body, "card is missing");
    const subtitle = typeof card.subtitle === "string" ? card.subtitle.trim() : "";
    // A Generic Template has no separate lead-in text field. Preserve the
    // authored message by using it as the subtitle only when it fits and no
    // subtitle was configured; otherwise fall back instead of discarding it.
    if (body && !subtitle && body.length <= GENERIC_TEMPLATE_SUBTITLE_LIMIT) {
      card.subtitle = body;
    } else if (body && subtitle !== body) {
      return fallbackToText(body, "card cannot preserve a separate text body");
    }

    const element = normalizeCard(card);
    return element
      ? {
          attachment: {
            type: "template",
            payload: { template_type: "generic", elements: [element] },
          },
        }
      : fallbackToText(body, "card fields exceed Instagram limits or contain invalid values");
  }

  if (presentation.type === "gallery") {
    if (!Array.isArray(presentation.cards) || presentation.cards.length === 0 ||
        presentation.cards.length > MAX_GALLERY_CARDS) {
      return fallbackToText(body, "gallery must contain 1–10 cards");
    }
    // Gallery templates also have no separate caption. Do not drop an
    // independently authored text body.
    if (body) return fallbackToText(body, "gallery cannot preserve a separate text body");
    const elements = presentation.cards.map(normalizeCard);
    if (elements.some((card) => card === null)) {
      return fallbackToText(body, "gallery contains an invalid card");
    }
    return {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: elements as InstagramGenericElement[],
        },
      },
    };
  }

  return fallbackToText(body, "unsupported presentation type");
}

/** True when a presentation contains at least one payload capable of targeting a journey node. */
export function hasJourneyTargetInteraction(options: InstagramRichMessageOptions | undefined): boolean {
  const presentation = options?.presentation;
  if (!presentation || !isRecord(presentation)) return false;

  if (presentation.type === "quick_replies" && Array.isArray(presentation.replies)) {
    return presentation.replies.some((reply) =>
      isRecord(reply) && typeof reply.payload === "string" && isJourneyTargetPayload(reply.payload),
    );
  }

  const buttonGroups: unknown[] = [];
  if (presentation.type === "buttons") buttonGroups.push(presentation.buttons);
  if (presentation.type === "card" && isRecord(presentation.card)) buttonGroups.push(presentation.card.buttons);
  if (presentation.type === "gallery" && Array.isArray(presentation.cards)) {
    for (const card of presentation.cards) {
      if (isRecord(card)) buttonGroups.push(card.buttons);
    }
  }

  return buttonGroups.some((group) =>
    Array.isArray(group) && group.some((button) =>
      isRecord(button) && button.type === "postback" &&
      typeof button.payload === "string" && isJourneyTargetPayload(button.payload),
    ),
  );
}
