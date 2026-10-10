import { BotIcon, HandshakeIcon, InstagramMarkIcon, SendIcon } from "../icons";

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  keywords: string[];
  icon: typeof BotIcon;
  tone: "pink" | "blue" | "green" | "neutral";
};

const TEMPLATES: AutomationTemplate[] = [
  {
    id: "comment-to-dm",
    name: "Comment to DM",
    description: "Reply to a post comment and move the conversation into DMs.",
    trigger: "Comment trigger",
    keywords: ["details", "info", "link"],
    icon: InstagramMarkIcon,
    tone: "pink",
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    description: "Start with a DM, collect intent, and capture lead details.",
    trigger: "DM trigger",
    keywords: ["pricing", "demo", "interested"],
    icon: BotIcon,
    tone: "blue",
  },
  {
    id: "product-link",
    name: "Product Link",
    description: "Send a polished product response with a clear next action.",
    trigger: "Comment + DM",
    keywords: ["buy", "shop", "price"],
    icon: SendIcon,
    tone: "green",
  },
  {
    id: "human-handoff",
    name: "Human Handoff",
    description: "Qualify the conversation and escalate high-intent leads to a person.",
    trigger: "DM trigger",
    keywords: ["help", "support", "agent"],
    icon: HandshakeIcon,
    tone: "neutral",
  },
];

const TONE_CLASS: Record<AutomationTemplate["tone"], string> = {
  pink: "bg-[#FCE7F3] text-[#DB2777]",
  blue: "bg-[#DBEAFE] text-[#2563EB]",
  green: "bg-[#DCFCE7] text-[#16A34A]",
  neutral: "bg-chip text-subtle",
};

export function AutomationTemplates({
  onUse,
}: {
  onUse: (template: AutomationTemplate) => void;
}) {
  return (
    <section className="mt-5" aria-labelledby="automation-templates-title">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="automation-templates-title" className="m-0 text-[18px] font-semibold tracking-[-0.01em] text-ink">
            Start from a template
          </h2>
          <p className="muted m-0 mt-1 text-[12px]">
            Proven journey patterns you can customize before publishing.
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <article
              key={template.id}
              className="group rounded-2xl border border-line bg-card p-4 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONE_CLASS[template.tone]}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-canvas px-2 py-1 text-[10px] font-semibold text-subtle">
                  {template.trigger}
                </span>
              </div>
              <h3 className="m-0 mt-4 text-[14px] font-semibold text-ink">{template.name}</h3>
              <p className="muted m-0 mt-1.5 min-h-[40px] text-[11px] leading-4">{template.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {template.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-md bg-chip px-2 py-1 text-[10px] font-medium text-subtle">
                    {keyword}
                  </span>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary mt-4 min-h-9 w-full text-xs font-semibold group-hover:border-accent/40 group-hover:text-accent"
                onClick={() => onUse(template)}
              >
                Use template
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
