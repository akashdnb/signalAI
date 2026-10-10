import { BotIcon, HandshakeIcon, InstagramMarkIcon, SendIcon } from "../icons";
import type { CampaignLanguage, CampaignTone, ReplyChannel, TriggerSource } from "../../api";

export type AutomationTemplate = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  keywords: string[];
  icon: typeof BotIcon;
  tone: "pink" | "blue" | "green" | "neutral";
  preset: {
    triggerSource: TriggerSource;
    replyChannel: ReplyChannel;
    replyMode: "rule_based" | "ai_generated";
    tone: CampaignTone;
    language: CampaignLanguage;
    defaultReplyTemplate: string;
    description: string;
    milestones?: Array<{ goalDescription: string; captureFields: string[] }>;
  };
};

const TEMPLATES: AutomationTemplate[] = [
  {
    id: "comment-to-dm",
    name: "Comment to DM",
    description: "Starts with a comment trigger and configures a DM reply workflow you can customize before publishing.",
    trigger: "Comment → DM",
    keywords: ["details", "info", "link"],
    icon: InstagramMarkIcon,
    tone: "pink",
    preset: {
      triggerSource: "comment",
      replyChannel: "dm",
      replyMode: "rule_based",
      tone: "friendly",
      language: "auto",
      defaultReplyTemplate: "Thanks for your comment! I’ll send you the details in DM.",
      description: "Starter preset for turning matching Instagram comments into DM conversations.",
    },
  },
  {
    id: "lead-qualification",
    name: "Lead Qualification",
    description: "Starts from a DM, enables AI replies, and adds qualification goals for intent and contact details.",
    trigger: "DM qualification",
    keywords: ["pricing", "demo", "interested"],
    icon: BotIcon,
    tone: "blue",
    preset: {
      triggerSource: "message",
      replyChannel: "dm",
      replyMode: "ai_generated",
      tone: "professional_and_friendly",
      language: "auto",
      defaultReplyTemplate: "Thanks for your interest! I’d love to learn a little more about what you’re looking for.",
      description: "Starter preset for qualifying inbound DM conversations and capturing lead details.",
      milestones: [
        { goalDescription: "Understand the lead's intent and need", captureFields: ["intent", "need"] },
        { goalDescription: "Capture contact details", captureFields: ["email", "phone"] },
      ],
    },
  },
  {
    id: "product-link",
    name: "Product Link",
    description: "Starts from matching comments and configures a DM-first product response with a clear next-action message.",
    trigger: "Comment → DM",
    keywords: ["buy", "shop", "price"],
    icon: SendIcon,
    tone: "green",
    preset: {
      triggerSource: "comment",
      replyChannel: "dm",
      replyMode: "rule_based",
      tone: "friendly",
      language: "auto",
      defaultReplyTemplate: "Absolutely — I’ll send you the product details in DM.",
      description: "Starter preset for product-intent comments. Add your product URL in the journey before publishing.",
    },
  },
  {
    id: "human-handoff",
    name: "Human Handoff",
    description: "Starts from DMs and prepares a qualification flow for conversations that should be reviewed by a person.",
    trigger: "DM qualification",
    keywords: ["help", "support", "agent"],
    icon: HandshakeIcon,
    tone: "neutral",
    preset: {
      triggerSource: "message",
      replyChannel: "dm",
      replyMode: "ai_generated",
      tone: "professional",
      language: "auto",
      defaultReplyTemplate: "I’ll make sure your request gets the right attention. Let me first understand what you need.",
      description: "Starter preset for preparing a DM qualification flow before adding your preferred handoff rule.",
      milestones: [
        { goalDescription: "Understand the request before handoff", captureFields: ["intent", "need"] },
      ],
    },
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
  disabled = false,
}: {
  onUse: (template: AutomationTemplate) => void;
  disabled?: boolean;
}) {
  return (
    <section className="mt-5" aria-labelledby="automation-templates-title" aria-busy={disabled}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <h2 id="automation-templates-title" className="m-0 text-xl font-semibold text-ink">Start with a preset</h2>
          <p className="muted mb-0 mt-1 text-sm">Create a configured draft, then customize it in the Builder before publishing.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {TEMPLATES.map((template) => {
          const Icon = template.icon;
          return (
            <article key={template.id} className="rounded-2xl border border-line bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${TONE_CLASS[template.tone]}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-chip px-2 py-1 text-[10px] font-bold text-subtle">{template.trigger}</span>
              </div>
              <h3 className="mt-4 mb-0 text-sm font-semibold text-ink">{template.name}</h3>
              <p className="muted mb-0 mt-1 min-h-[52px] text-xs leading-5">{template.description}</p>
              <button
                type="button"
                disabled={disabled}
                className="btn-primary mt-4 w-full justify-center disabled:cursor-wait disabled:opacity-60"
                onClick={() => onUse(template)}
              >
                {disabled ? "Creating…" : "Use preset"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
