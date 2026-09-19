import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { connectStartUrl } from "../api";

const ERROR_MESSAGES: Record<string, string> = {
  missing_params: "Instagram didn't send back what we needed. Please try connecting again.",
  invalid_state: "That connection link expired or was tampered with. Please start again.",
  session_mismatch: "We couldn't verify this was the same browser that started the connection. Please try again.",
  already_used: "This connection link was already used. Please start a new one.",
  connection_failed: "We couldn't complete the connection with Instagram. Please try again in a moment.",
};

export function ConnectPage() {
  const [searchParams] = useSearchParams();
  const [tenantName, setTenantName] = useState("");
  const error = searchParams.get("error");

  function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantName.trim()) return;
    window.location.href = connectStartUrl(tenantName.trim());
  }

  return (
    <div className="page page-narrow">
      <h1>Connect your Instagram</h1>
      <p className="muted">
        signalAI turns comments and DMs into leads automatically. Connect your Instagram professional account to get
        started — no credit card needed yet.
      </p>

      {error && (
        <div className="banner banner-error">{ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}</div>
      )}

      <form onSubmit={handleConnect} className="card">
        <label htmlFor="tenantName">What should we call your account?</label>
        <input
          id="tenantName"
          type="text"
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          placeholder="e.g. Your brand or creator name"
          required
        />
        <button type="submit" className="btn-primary" disabled={!tenantName.trim()}>
          Connect Instagram
        </button>
      </form>

      <p className="muted small">
        You'll be redirected to Instagram to authorize signalAI to read comments and send DMs on your behalf.
      </p>
    </div>
  );
}
