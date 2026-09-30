import { useState } from "react";
import { api, type Campaign, type Milestone } from "../../api";
import { BottomSheet } from "../BottomSheet";

type ChatMessage = { from: "user" | "bot" | "system"; text: string };

/**
 * A client-side walkthrough of the milestone sequence, not a write path —
 * there's no API to simulate-advance a real lead's captured facts, so this
 * dialog is explicit about being a test, not a real conversation. The first
 * reply is the one real call here (api.preview), same as the Preview dialog.
 */
export function TestJourneyDialog({
  tenantId,
  campaign,
  milestones,
  onClose,
}: {
  tenantId: string;
  campaign: Campaign;
  milestones: Milestone[];
  onClose: () => void;
}) {
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [milestoneIndex, setMilestoneIndex] = useState(0);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function handleStart() {
    setStarted(true);
    setSending(true);
    const sample = campaign.keywords[0] ?? "price";
    setMessages([
      { from: "system", text: `Trigger matched — comment/DM containing "${sample}"` },
      { from: "user", text: `Hey, can you share the ${sample}?` },
    ]);
    try {
      const result = await api.preview(tenantId, campaign.id, `Hey, can you share the ${sample}?`);
      const reply = campaign.replyMode === "ai_generated" ? result.aiGenerated.text : result.ruleBased.text;
      setMessages((prev) => [...prev, { from: "bot", text: reply }]);
      if (milestones.length > 0) {
        setMessages((prev) => [...prev, { from: "system", text: `Milestone 1: ${milestones[0]!.goalDescription}` }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { from: "system", text: err instanceof Error ? err.message : "Couldn't generate a reply" }]);
    } finally {
      setSending(false);
    }
  }

  function handleAdvance(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    const current = milestones[milestoneIndex];
    const next: ChatMessage[] = [{ from: "user", text: input.trim() }];
    if (current) {
      next.push({ from: "system", text: `Captured "${input.trim()}" for ${current.goalDescription}` });
    }
    const nextIndex = milestoneIndex + 1;
    const nextMilestone = milestones[nextIndex];
    if (nextMilestone) {
      next.push({ from: "bot", text: `Got it! ${nextMilestone.goalDescription}?` });
      next.push({ from: "system", text: `Milestone ${nextIndex + 1}: ${nextMilestone.goalDescription}` });
      setMilestoneIndex(nextIndex);
    } else {
      next.push({ from: "system", text: "Journey complete — this lead would now move to the next action." });
    }
    setMessages((prev) => [...prev, ...next]);
    setInput("");
  }

  const finished = started && milestoneIndex >= milestones.length - 1 && milestones.length > 0 && messages.some((m) => m.text.includes("Journey complete"));

  return (
    <BottomSheet title={`Test Journey — ${campaign.name}`} onClose={onClose} maxWidth={520}>
      <p className="muted small mt-0">
        Simulates the full sequence (trigger → reply → milestones). This doesn't affect any real lead.
      </p>

      {!started ? (
        <button type="button" className="btn-primary" onClick={handleStart}>
          Start test
        </button>
      ) : (
        <>
          <div className="mb-3 flex max-h-64 flex-col gap-2 overflow-y-auto rounded-xl border border-line p-3">
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.from === "system"
                    ? "text-center text-xs text-subtle"
                    : m.from === "user"
                      ? "ml-auto max-w-[80%] rounded-lg bg-chip px-3 py-1.5 text-sm text-ink"
                      : "mr-auto max-w-[80%] rounded-lg border border-line px-3 py-1.5 text-sm text-ink"
                }
              >
                {m.text}
              </div>
            ))}
            {sending && <div className="text-center text-xs text-subtle">Generating…</div>}
          </div>

          {!finished ? (
            <form onSubmit={handleAdvance} className="inline-form">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Reply as the lead…"
                disabled={sending}
              />
              <button type="submit" className="btn-primary" disabled={sending || !input.trim()}>
                Send
              </button>
            </form>
          ) : (
            <div className="banner banner-ok">Test complete.</div>
          )}
        </>
      )}
    </BottomSheet>
  );
}
