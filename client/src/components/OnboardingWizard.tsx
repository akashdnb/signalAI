import { useEffect, useState, type ComponentType } from "react";
import { api, INDUSTRY_LABEL, type AccountHealth, type TenantIndustry, type TenantSummary } from "../api";
import { KnowledgeBasePanel } from "./KnowledgeBasePanel";
import {
  BookIcon,
  CheckCircleIcon,
  CompassIcon,
  HomeIcon,
  SettingsIcon,
  ShoppingBagIcon,
  SparkleIcon,
  TeamIcon,
} from "./icons";

const INDUSTRIES = Object.keys(INDUSTRY_LABEL) as TenantIndustry[];

interface OnboardingWizardProps {
  tenantId: string;
  /** Fired once the industry step's save succeeds — the caller (AppShell) patches its own tenant state and latches the wizard open through step 3, since tenant.industry being non-null would otherwise end the wizard immediately. */
  onIndustryApplied: (tenant: TenantSummary) => void;
  onFinish: () => void;
}

const STEP_LABELS = ["Connect", "Business", "Setup"];

function Stepper({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center">
      {STEP_LABELS.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        return (
          <div key={label} className={`flex items-center ${i < STEP_LABELS.length - 1 ? "flex-1" : ""}`}>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  done || current ? "bg-accent text-white" : "bg-chip text-subtle"
                }`}
              >
                {done ? <CheckCircleIcon className="h-4 w-4" /> : n}
              </span>
              <span className={`text-sm font-medium ${done || current ? "text-ink" : "text-subtle"}`}>{label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <div className={`mx-3 h-px flex-1 ${done ? "bg-accent" : "bg-line"}`} />}
          </div>
        );
      })}
    </div>
  );
}

const CONNECT_CHECKLIST = [
  "Respond to comments & DMs automatically",
  "AI qualifies leads through natural conversation",
  "No password sharing — secure OAuth",
  "Disconnect anytime from Settings",
];

/** Static illustration only — no real account data (this runs before any Instagram account is connected). */
function ConnectPreview() {
  return (
    <div className="hidden rounded-2xl border border-line bg-canvas p-5 md:block">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-8 w-8 shrink-0 rounded-full bg-chip" />
        <div>
          <div className="text-sm font-semibold text-ink">yourbusiness</div>
          <div className="text-xs text-subtle">Instagram Business</div>
        </div>
      </div>
      <div className="mb-3 aspect-video rounded-lg bg-chip" />
      <div className="rounded-xl bg-chip p-3 text-sm text-ink">
        <span className="font-semibold text-accent">signalAI</span> Thanks for your interest! What are you looking
        for?
      </div>
    </div>
  );
}

function ConnectStep({ tenantId, onNext }: { tenantId: string; onNext: () => void }) {
  const [account, setAccount] = useState<AccountHealth | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAccountHealth(tenantId).then(setAccount).catch(() => setAccount({ connected: false }));
  }, [tenantId]);

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await api.startInstagramConnect(tenantId);
      window.location.href = url;
    } catch (err) {
      setConnecting(false);
      setError(err instanceof Error ? err.message : "Couldn't start the Instagram connection");
    }
  }

  return (
    <div className="card grid gap-8 md:grid-cols-2">
      <div>
        <h2 className="mt-0">Connect your Instagram Business account</h2>
        <p className="muted">signalAI replies to comments and DMs on your connected Instagram account.</p>
        {error && <div className="banner banner-error">{error}</div>}

        <ul className="my-5 list-none space-y-3 p-0">
          {CONNECT_CHECKLIST.map((item) => (
            <li key={item} className="flex items-center gap-3 text-sm text-ink">
              <CheckCircleIcon className="h-5 w-5 shrink-0 text-accent" />
              {item}
            </li>
          ))}
        </ul>

        {account?.connected ? (
          <div className="banner banner-ok">Instagram connected.</div>
        ) : (
          <button className="btn-primary" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Redirecting to Instagram…" : "Connect Instagram"}
          </button>
        )}
        <div className="button-row mt-4">
          {account?.connected ? (
            <button className="btn-primary" onClick={onNext}>
              Continue
            </button>
          ) : (
            <button className="btn-secondary" onClick={onNext}>
              Skip for now
            </button>
          )}
        </div>
      </div>

      <ConnectPreview />
    </div>
  );
}

const INDUSTRY_META: Record<TenantIndustry, { icon: ComponentType<{ className?: string }>; description: string }> = {
  real_estate: { icon: HomeIcon, description: "Property enquiries, site visits, and project info." },
  ecommerce: { icon: ShoppingBagIcon, description: "Product questions, order status, and catalog links." },
  education: { icon: BookIcon, description: "Course enquiries, admissions, and batch info." },
  creator: { icon: SparkleIcon, description: "Fan DMs, collabs, and content questions." },
  coach: { icon: CompassIcon, description: "Program enquiries, bookings, and client FAQs." },
  agency: { icon: TeamIcon, description: "Manage replies across multiple client accounts." },
  other: { icon: SettingsIcon, description: "A custom setup for anything else." },
};

function IndustryStep({
  tenantId,
  onApplied,
}: {
  tenantId: string;
  onApplied: (tenant: TenantSummary) => void;
}) {
  const [applying, setApplying] = useState<TenantIndustry | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(industry: TenantIndustry) {
    setApplying(industry);
    setError(null);
    try {
      const tenant = await api.applyIndustry(tenantId, industry);
      onApplied(tenant);
    } catch (err) {
      setApplying(null);
      setError(err instanceof Error ? err.message : "Failed to save your business type");
    }
  }

  return (
    <div className="card">
      <h2 className="mt-0">What kind of business are you?</h2>
      <p className="muted">We'll set up starter fields and a starter campaign to match — you can change anything later.</p>
      {error && <div className="banner banner-error">{error}</div>}

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INDUSTRIES.map((industry) => {
          const { icon: Icon, description } = INDUSTRY_META[industry];
          return (
            <button
              key={industry}
              type="button"
              disabled={applying !== null}
              onClick={() => choose(industry)}
              className="flex flex-col items-start gap-2 rounded-xl border border-line bg-card p-4 text-left transition-colors hover:bg-chip disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-chip text-accent">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-ink">
                {applying === industry ? "Saving…" : INDUSTRY_LABEL[industry]}
              </span>
              <span className="text-xs text-subtle">{description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function OnboardingWizard({ tenantId, onIndustryApplied, onFinish }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);

  return (
    <div className="page">
      <h1>Let's get you set up</h1>
      <Stepper step={step} />

      {step === 1 && <ConnectStep tenantId={tenantId} onNext={() => setStep(2)} />}

      {step === 2 && (
        <IndustryStep
          tenantId={tenantId}
          onApplied={(tenant) => {
            onIndustryApplied(tenant);
            setStep(3);
          }}
        />
      )}

      {step === 3 && (
        <div className="card">
          <h2 className="mt-0">Add your knowledge base</h2>
          <p className="muted">
            Upload a pricing sheet, FAQ, or brochure — signalAI grounds its replies in these documents. You can skip
            this and add documents later from Settings.
          </p>
          <KnowledgeBasePanel tenantId={tenantId} />
          <button className="btn-primary" onClick={onFinish} style={{ marginTop: "1rem" }}>
            Finish
          </button>
        </div>
      )}
    </div>
  );
}
