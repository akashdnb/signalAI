function required(name: string): string {
  const value = process.env[name] ?? "";
  if (!value) throw new Error(`Missing ${name} for capability connector boundary`);
  return value;
}

export const capabilityConfig = {
  get connectorsBaseUrl() {
    return (process.env.SIGNALAI_CONNECTORS_BASE_URL ?? "").replace(/\/+$/, "");
  },
  get serviceToken() {
    return required("SIGNALAI_SERVICE_TOKEN");
  },
  get connectorsRequestTimeoutMs() {
    return Number(process.env.SIGNALAI_CONNECTORS_TIMEOUT_MS ?? 15_000);
  },
};
