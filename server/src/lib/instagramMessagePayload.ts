export interface InstagramRichMessageOptions {
  /** Explicit campaign CTA. Never inferred from the generated text. */
  ctaUrl?: string;
  /** Publicly reachable image URL for Meta's Generic Template card. */
  imageUrl?: string;
  /** Card headline. Generic Template titles are capped at 80 characters. */
  title?: string;
  /** Card description. Generic Template subtitles are capped at 80 characters. */
  subtitle?: string;
  /** CTA label shown on the button. */
  buttonTitle?: string;
}

export type InstagramMessagePayload =
  | { text: string }
  | {
      attachment: {
        type: "template";
        payload:
          | {
              template_type: "button";
              text: string;
              buttons: Array<{
                type: "web_url";
                url: string;
                title: string;
              }>;
            }
          | {
              template_type: "generic";
              elements: Array<{
                title: string;
                image_url?: string;
                subtitle?: string;
                default_action?: {
                  type: "web_url";
                  url: string;
                };
                buttons?: Array<{
                  type: "web_url";
                  url: string;
                  title: string;
                }>;
              }>;
            };
      };
    };

const BUTTON_TEMPLATE_TEXT_LIMIT = 640;
const GENERIC_TEMPLATE_TITLE_LIMIT = 80;
const GENERIC_TEMPLATE_SUBTITLE_LIMIT = 80;
const MAX_BUTTON_TITLE_LENGTH = 20;

function isHttpsUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https:\/\//i.test(value);
}

/**
 * Builds the structured Instagram payload from explicit presentation data.
 *
 * The CTA is deliberately passed as metadata instead of being discovered by
 * parsing the generated message. This prevents a normal URL produced by an
 * AI reply from unexpectedly becoming a "View details" button.
 *
 * When an image is available, use Meta's Generic Template (the card-style
 * message). If the Generic Template's 80-character title/subtitle limits
 * would require changing the copy, fall back to the Button Template when
 * possible, and finally to plain text for messages over 640 characters.
 */
export function buildInstagramMessagePayload(
  text: string,
  options: InstagramRichMessageOptions = {},
): InstagramMessagePayload {
  const body = text.trim();
  const ctaUrl = isHttpsUrl(options.ctaUrl) ? options.ctaUrl : undefined;

  if (!ctaUrl) return { text: body };

  const requestedButtonTitle = options.buttonTitle?.trim();
  const buttonTitle =
    requestedButtonTitle && requestedButtonTitle.length <= MAX_BUTTON_TITLE_LENGTH
      ? requestedButtonTitle
      : "View details";

  if (isHttpsUrl(options.imageUrl)) {
    const title = options.title?.trim() || "Learn more";
    const subtitle = options.subtitle?.trim() || body;

    if (
      title.length <= GENERIC_TEMPLATE_TITLE_LIMIT &&
      subtitle.length <= GENERIC_TEMPLATE_SUBTITLE_LIMIT
    ) {
      return {
        attachment: {
          type: "template",
          payload: {
            template_type: "generic",
            elements: [
              {
                title,
                image_url: options.imageUrl,
                subtitle: subtitle || undefined,
                default_action: {
                  type: "web_url",
                  url: ctaUrl,
                },
                buttons: [
                  {
                    type: "web_url",
                    url: ctaUrl,
                    title: buttonTitle,
                  },
                ],
              },
            ],
          },
        },
      };
    }
  }

  if (!body || body.length > BUTTON_TEMPLATE_TEXT_LIMIT) {
    return { text: body };
  }

  return {
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: body,
        buttons: [
          {
            type: "web_url",
            url: ctaUrl,
            title: buttonTitle,
          },
        ],
      },
    },
  };
}
