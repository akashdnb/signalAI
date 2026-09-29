import { useEffect, useState } from "react";
import { api, INDUSTRY_LABEL, type AccountHealth, type TenantIndustry, type TenantSummary } from "../api";
import { KnowledgeBasePanel } from "./KnowledgeBasePanel";

const INDUSTRIES = Object.keys(INDUSTRY_LABEL) as TenantIndustry[];

interface OnboardingWizardProps {
  tenantId: string;
  /** Fired once the industry step's save succeeds — the caller (AppShell) patches its own tenant state and latches the wizard open through step 3, since tenant.industry being non-null would otherwise end the wizard immediately. */
  onIndustryApplied: (tenant: TenantSummary) => void;
  onFinish: () => void;
}

const STEPS = ["Connect Instagram", "Choose your business type", "Add your knowledge base"];

function StepHeader({ step }: { step: number }) {
  return (
    <div className="button-row">
      {STEPS.map((label, i) => (
        <span key={label} className={i + 1 === step ? "pill pill-ok" : "pill"} style={{ marginLeft: i === 0 ? 0 : undefined }}>
          {i + 1}. {label}
        </span>
      ))}
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
    <section className="card">
      <h2>Connect your Instagram Business account</h2>
      <p className="muted">signalAI replies to comments and DMs on your connected Instagram account.</p>
      {error && <div className="banner banner-error">{error}</div>}
      {account?.connected ? (
        <div className="banner banner-ok">Instagram connected.</div>
      ) : (
        <button className="btn-primary" onClick={handleConnect} disabled={connecting}>
          {connecting ? "Redirecting to Instagram…" : "Connect Instagram"}
        </button>
      )}
      <div className="button-row" style={{ marginTop: "1rem" }}>
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
    </section>
  );
}

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
    <section className="card">
      <h2>What kind of business are you?</h2>
      <p className="muted">We'll set up starter fields and a starter campaign to match — you can change anything later.</p>
      {error && <div className="banner banner-error">{error}</div>}
      <div className="stat-grid">
        {INDUSTRIES.map((industry) => (
          <button
            key={industry}
            type="button"
            className="btn-secondary"
            disabled={applying !== null}
            onClick={() => choose(industry)}
            style={{ padding: "1rem" }}
          >
            {applying === industry ? "Saving…" : INDUSTRY_LABEL[industry]}
          </button>
        ))}
      </div>
    </section>
  );
}

export function OnboardingWizard({ tenantId, onIndustryApplied, onFinish }: OnboardingWizardProps) {
  const [step, setStep] = useState(1);

  return (
    <div className="page">
      <h1>Let's get you set up</h1>
      <StepHeader step={step} />

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
        <section className="card">
          <h2>Add your knowledge base</h2>
          <p className="muted">
            Upload a pricing sheet, FAQ, or brochure — signalAI grounds its replies in these documents. You can skip
            this and add documents later from Settings.
          </p>
          <KnowledgeBasePanel tenantId={tenantId} />
          <button className="btn-primary" onClick={onFinish} style={{ marginTop: "1rem" }}>
            Finish
          </button>
        </section>
      )}
    </div>
  );
}
