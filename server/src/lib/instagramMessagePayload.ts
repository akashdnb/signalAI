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

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : value.slice(0, maxLength).trimEnd();
}

/**
 * Builds the structured Instagram payload from explicit presentation data.
 *
 * The CTA is deliberately passed as metadata instead of being discovered by
 * parsing the generated message. This prevents a normal URL produced by an
 * AI reply from unexpectedly becoming a "View details" button.
 *
 * When an image is available, use Meta's Generic Template (the card-style
 * message). Otherwise use the Button Template. If the structured template
 * limits would require truncating user/AI copy, fall back to the original
 * plain-text payload rather than silently changing the message.
 */
export function buildInstagramMessagePayload(
  text: string,
  options: InstagramRichMessageOptions = {},
): InstagramMessagePayload {
  const body = text.trim();
  const ctaUrl = isHttpsUrl(options.ctaUrl) ? options.ctaUrl : undefined;

  if (!ctaUrl) return { text: body };

  const buttonTitle = truncate(
    options.buttonTitle?.trim() || "View details",
    MAX_BUTTON_TITLE_LENGTH,
  );

  if (!buttonTitle) return { text: body };

  if (isHttpsUrl(options.imageUrl)) {
    const title = truncate(
      options.title?.trim() || "Learn more",
      GENERIC_TEMPLATE_TITLE_LIMIT,
    );
    const subtitle = truncate(
      options.subtitle?.trim() || body,
      GENERIC_TEMPLATE_SUBTITLE_LIMIT,
    );

    if (!title) return { text: body };

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
