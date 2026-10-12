import { Link, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type Campaign,
  type FieldDefinition,
  type InstagramMessagePresentation,
  type Milestone,
} from "../../api";
import { BottomSheet } from "../BottomSheet";
import { CampaignEditor, type CampaignEditorHandle } from "../CampaignEditor";
import {
  ChevronDownIcon,
  DotsVerticalIcon,
  EyeIcon,
  FileTextIcon,
} from "../icons";
import { AnalyticsPanel } from "./AnalyticsPanel";
import {
  BuilderCanvas,
  type BuilderCanvasActions,
  type SelectedNode,
} from "./BuilderCanvas";
import { LeadsPanel } from "./LeadsPanel";
import { NodeInspectorDialog } from "./NodeInspectorDialog";
import { PreviewDialog } from "./PreviewDialog";
import { TestJourneyDialog } from "./TestJourneyDialog";
import type { JourneyAccountReadiness } from "../JourneyAccountsPanel";

type BuilderTab = "builder" | "details" | "analytics" | "leads";

const TABS: { key: BuilderTab; label: string }[] = [
  { key: "builder", label: "Flow" },
  { key: "details", label: "Setup" },
  { key: "analytics", label: "Results" },
  { key: "leads", label: "Leads" },
];

function describeCampaign(campaign: Campaign): string {
  if (campaign.description) return campaign.description;

  const count = campaign.keywords.length;
  const kind =
    campaign.triggerSource === "message"
      ? "a direct message"
      : campaign.triggerSource === "both"
        ? "a comment or direct message"
        : "a comment";
  const phraseCount = `${count} phrase${count === 1 ? "" : "s"}`;

  return `Starts when ${kind} mentions one of ${phraseCount}`;
}

function automationStatus(campaign: Campaign): { label: string; title: string; className: string } {
  if (!campaign.published) {
    return campaign.enabled
      ? {
          label: "Needs publishing",
          title: "This automation is not responding to Instagram conversations yet. Publish it to make it live.",
          className: "bg-[#FEF3C7] text-[#92400E]",
        }
      : {
          label: "Draft",
          title: "This is a draft and will not respond to Instagram conversations until published.",
          className: "bg-[#E2E8F0] text-[#475569]",
        };
  }

  return campaign.enabled
    ? {
        label: "Live",
        title: "This automation is published and running.",
        className: "bg-[#D1FAE5] text-[#047857]",
      }
    : {
        label: "Paused",
        title: "This automation is published but paused.",
        className: "bg-[#FEF3C7] text-[#92400E]",
      };
}

export function JourneyBuilder({
  tenantId,
  campaign,
  accountReadiness,
  startOnSetup = false,
  onChanged,
  onBack,
}: {
  tenantId: string;
  campaign: Campaign;
  accountReadiness: JourneyAccountReadiness;
  startOnSetup?: boolean;
  onChanged: () => Promise<void> | void;
  onBack: () => void;
}) {
  const [subTab, setSubTab] = useState<BuilderTab>(() => startOnSetup ? "details" : "builder");
  const subTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [milestones, setMilestonesState] = useState<Milestone[]>([]);
  const savedMilestonesRef = useRef<Milestone[]>([]);
  const milestonesLoadRequestRef = useRef(0);
  const [milestonesDirty, setMilestonesDirty] = useState(false);
  const [milestonesLoading, setMilestonesLoading] = useState(true);
  const [milestoneLoadError, setMilestoneLoadError] = useState<string | null>(null);
  const milestonesReady = !milestonesLoading && milestoneLoadError === null;
  const [fieldDefinitions, setFieldDefinitions] = useState<FieldDefinition[]>([]);
  const [selectedNode, setSelectedNode] = useState<SelectedNode>({ type: "trigger" });
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showTestJourney, setShowTestJourney] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [pendingTab, setPendingTab] = useState<BuilderTab | null>(null);
  const [builderVersion, setBuilderVersion] = useState<number | null>(null);
  const [builderSaveState, setBuilderSaveState] = useState<
    "saved" | "saving" | "unsaved"
  >("saved");
  const [canvasDirty, setCanvasDirty] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [unsavedDialogError, setUnsavedDialogError] = useState<string | null>(null);
  const navigate = useNavigate();
  const canvasActionsRef = useRef<BuilderCanvasActions | null>(null);
  const pendingActionRef = useRef<(() => void | Promise<void>) | null>(null);
  const restoringHistoryRef = useRef(false);
  const lastHistoryIndexRef = useRef<number | null>(
    typeof window.history.state?.idx === "number" ? window.history.state.idx : null,
  );
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const detailsRef = useRef<CampaignEditorHandle>(null);
  const journeyDirty = canvasDirty || milestonesDirty;

  useEffect(() => {
    if (!menuOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);

  const registerCanvasActions = useCallback((actions: BuilderCanvasActions | null) => {
    canvasActionsRef.current = actions;
  }, []);

  const requestNavigation = useCallback(
    (action: () => void | Promise<void>) => {
      if (!journeyDirty) {
        void action();
        return;
      }

      pendingActionRef.current = action;
      setUnsavedDialogError(null);
      setShowUnsavedDialog(true);
    },
    [journeyDirty],
  );

  async function saveCanvasDraft(): Promise<boolean> {
    if (!milestonesReady) {
      setUnsavedDialogError(
        milestoneLoadError ?? "Goals are still loading. Try saving again in a moment.",
      );
      return false;
    }
    const saved = await canvasActionsRef.current?.saveDraft(milestones);
    return saved === true;
  }

  function updateMilestoneDraft(next: Milestone[]) {
    setMilestonesState(next);
    const snapshot = (items: Milestone[]) =>
      items.map(({ id, goalDescription, captureFields }) => ({
        id,
        goalDescription,
        captureFields,
      }));
    setMilestonesDirty(
      JSON.stringify(snapshot(next)) !== JSON.stringify(snapshot(savedMilestonesRef.current)),
    );
  }

  const acceptSavedMilestones = useCallback((saved: Milestone[]) => {
    savedMilestonesRef.current = saved;
    setMilestonesState(saved);
    setMilestonesDirty(false);
  }, []);

  function keepEditing() {
    pendingActionRef.current = null;
    setUnsavedDialogError(null);
    setShowUnsavedDialog(false);
  }

  async function saveAndContinue() {
    const saved = await saveCanvasDraft();
    if (!saved) {
      setUnsavedDialogError("Couldn't save this automation. Your changes are still here; please try again.");
      return;
    }

    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setUnsavedDialogError(null);
    setShowUnsavedDialog(false);
    await action?.();
  }

  async function discardAndContinue() {
    canvasActionsRef.current?.discardDraft();
    setMilestonesState(savedMilestonesRef.current);
    setMilestonesDirty(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setUnsavedDialogError(null);
    setShowUnsavedDialog(false);
    await action?.();
  }

  useEffect(() => {
    if (!journeyDirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [journeyDirty]);

  // Guard browser back/forward within the SPA. Restore the current history
  // entry before opening the dialog; if the user confirms, navigate to the
  // destination captured from the blocked popstate instead.
  useEffect(() => {
    if (!journeyDirty) return;

    const interceptPopState = (event: PopStateEvent) => {
      const targetIndex =
        typeof event.state?.idx === "number" ? event.state.idx : null;

      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false;
        lastHistoryIndexRef.current = targetIndex;
        return;
      }

      const currentIndex = lastHistoryIndexRef.current;
      const historyDelta =
        targetIndex !== null && currentIndex !== null
          ? targetIndex - currentIndex
          : -1;

      // Stop BrowserRouter's own popstate listener before it changes routes
      // and unmounts this draft. Restore the current item in whichever
      // direction the browser moved; confirmed navigation replays that move.
      event.stopImmediatePropagation();
      restoringHistoryRef.current = true;
      if (historyDelta < 0) {
        window.history.forward();
      } else {
        window.history.back();
      }
      requestNavigation(() => window.history.go(historyDelta));
    };

    window.addEventListener("popstate", interceptPopState, true);
    return () => window.removeEventListener("popstate", interceptPopState, true);
  }, [journeyDirty, navigate, requestNavigation]);

  // BrowserRouter does not block SPA navigation by itself. Intercept ordinary
  // same-origin links while a canvas draft exists and resume navigation only
  // after the user explicitly saves or discards it.
  useEffect(() => {
    if (!journeyDirty) return;

    const interceptInternalLink = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const element =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      if (!(element instanceof HTMLAnchorElement)) return;
      if ((element.target && element.target !== "_self") || element.hasAttribute("download")) {
        return;
      }

      const targetUrl = new URL(element.href, window.location.href);
      if (targetUrl.origin !== window.location.origin) return;

      const currentUrl = new URL(window.location.href);
      if (
        targetUrl.pathname === currentUrl.pathname &&
        targetUrl.search === currentUrl.search &&
        targetUrl.hash === currentUrl.hash
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      requestNavigation(() =>
        navigate(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`),
      );
    };

    document.addEventListener("click", interceptInternalLink, true);
    return () => document.removeEventListener("click", interceptInternalLink, true);
  }, [journeyDirty, navigate, requestNavigation]);

  async function loadMilestones() {
    const requestId = ++milestonesLoadRequestRef.current;
    setMilestonesLoading(true);
    setMilestoneLoadError(null);

    try {
      const [ms, defs] = await Promise.all([
        api.listMilestones(tenantId, campaign.id),
        api.listFieldDefinitions(tenantId),
      ]);
      if (requestId !== milestonesLoadRequestRef.current) return;

      savedMilestonesRef.current = ms;
      setMilestonesState(ms);
      setMilestonesDirty(false);
      setFieldDefinitions(defs);
    } catch (error) {
      if (requestId !== milestonesLoadRequestRef.current) return;
      setMilestoneLoadError(
        error instanceof Error ? error.message : "Couldn't load the journey goals.",
      );
    } finally {
      if (requestId === milestonesLoadRequestRef.current) {
        setMilestonesLoading(false);
      }
    }
  }

  useEffect(() => {
    // Clear the previous campaign's semantic draft before fetching the next.
    savedMilestonesRef.current = [];
    setMilestonesState([]);
    setMilestonesDirty(false);
    setMilestonesLoading(true);
    setMilestoneLoadError(null);
    void loadMilestones();
    setSelectedNode({ type: "trigger" });
    setInspectorOpen(false);
    setMenuOpen(false);
    setBuilderVersion(null);
    setPublishError(null);

    return () => {
      milestonesLoadRequestRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, campaign.id]);

  function selectNode(node: SelectedNode) {
    setSelectedNode(node);
    setInspectorOpen(true);
  }

  const saveMessageConfiguration = useCallback(
    (config: { text: string; presentation?: InstagramMessagePresentation }): boolean => {
      const nodeId = selectedNode.type === "message" ? selectedNode.nodeId : undefined;
      const data = canvasActionsRef.current?.updateMessageConfiguration(nodeId, config);
      if (!data) return false;

      setSelectedNode((current) =>
        current.type === "message"
          ? { ...current, nodeId: current.nodeId ?? nodeId, data }
          : current,
      );
      return true;
    },
    [selectedNode],
  );

  function requestSubTabChange(next: BuilderTab) {
    if (subTab === "details" && detailsDirty && next !== "details") {
      setPendingTab(next);
      return;
    }

    requestNavigation(() => {
      if (subTab === "builder" && next !== "builder") setInspectorOpen(false);
      setSubTab(next);
    });
  }

  async function handleSaveMilestone(
    index: number,
    updates: { goalDescription: string; captureFields: string[] },
  ) {
    updateMilestoneDraft(
      milestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, ...updates } : milestone,
      ),
    );
  }

  async function handleAddMilestone() {
    const next = [
      ...milestones,
      {
        id: `draft-${crypto.randomUUID()}`,
        campaignId: campaign.id,
        ordinal: milestones.length,
        goalDescription: "New goal",
        captureFields: [],
      },
    ];

    canvasActionsRef.current?.stageMilestones(milestones, next);
    updateMilestoneDraft(next);
    selectNode({ type: "milestone", milestoneIndex: next.length - 1 });
  }

  async function handleRemoveMilestone(index: number) {
    const next = milestones.filter((_, milestoneIndex) => milestoneIndex !== index);
    if (next.length === 0) return;

    canvasActionsRef.current?.stageMilestones(milestones, next);
    updateMilestoneDraft(next);
    setInspectorOpen(false);
    setSelectedNode({ type: "trigger" });
  }

  async function handleReorderMilestone(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= milestones.length) return;

    const next = [...milestones];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);

    canvasActionsRef.current?.stageMilestones(milestones, next);
    updateMilestoneDraft(next);
    selectNode({ type: "milestone", milestoneIndex: target });
  }

  const canEnableAutomation =
    campaign.published === true &&
    accountReadiness.status === "ready" &&
    accountReadiness.healthyAssignedCount > 0;

  async function handleToggleEnabled() {
    if (!campaign.enabled && !canEnableAutomation) return;
    await api.setCampaignEnabled(tenantId, campaign.id, !campaign.enabled);
    setMenuOpen(false);
    await onChanged();
  }

  function requestPublish() {
    requestNavigation(() => {
      if (builderVersion === null) {
        setPublishError("The current version is still loading.");
        return;
      }

      setMenuOpen(false);
      setShowPublishConfirm(true);
    });
  }

  async function handlePublish() {
    if (builderVersion === null) return;

    setPublishing(true);
    setPublishError(null);

    try {
      await api.publishJourney(tenantId, campaign.id, builderVersion);
      setShowPublishConfirm(false);
      await onChanged();
    } catch (error) {
      setPublishError(
        error instanceof Error ? error.message : "Couldn't publish this journey",
      );
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <div className="automation-builder flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-card">
        <div className="relative border-b border-line px-4 pt-2.5 md:px-5">
          <div className="flex items-start justify-between gap-4">
            <button
              type="button"
              className="builder-toolbar-button mt-0.5 flex h-8 shrink-0 items-center rounded-lg px-2 text-[13px] font-medium text-ink hover:bg-chip"
              onClick={() => requestNavigation(onBack)}
            >
              ← Back to automations
            </button>

            <div className="flex shrink-0 items-center gap-1.5">
              {subTab === "builder" && builderVersion !== null && (
                <span className="toolbar-version hidden h-9 min-w-[76px] items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] lg:inline-flex">
                  <span className="font-semibold text-ink">v{builderVersion}</span>
                  <span aria-hidden="true" className="text-subtle">·</span>
                  <span
                    className={
                      builderSaveState === "saving"
                        ? "font-medium text-subtle"
                        : journeyDirty
                          ? "font-semibold text-[#B45309]"
                          : "font-semibold text-[#047857]"
                    }
                  >
                    {builderSaveState === "saving"
                      ? "Saving…"
                      : journeyDirty
                        ? "Unsaved"
                        : "Saved"}
                  </span>
                </span>
              )}

              {subTab === "builder" && (
                <button
                  type="button"
                  disabled={!journeyDirty || builderSaveState === "saving" || publishing || !milestonesReady}
                  className={`builder-toolbar-button flex h-9 items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                    journeyDirty
                      ? "bg-accent text-white shadow-sm hover:bg-accent-hover"
                      : "bg-chip text-subtle"
                  } disabled:cursor-not-allowed disabled:opacity-50`}
                  onClick={() => void saveCanvasDraft()}
                >
                  {builderSaveState === "saving" ? "Saving…" : milestonesLoading ? "Loading setup…" : "Save changes"}
                </button>
              )}

              <Link
                to="/docs/journey-builder"
                aria-label="Open automation flow documentation"
                className="builder-toolbar-button hidden h-9 min-w-[72px] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink lg:inline-flex"
              >
                <FileTextIcon className="h-4 w-4 shrink-0" />
                Docs
              </Link>

              <button
                type="button"
                className="builder-toolbar-button hidden h-9 min-w-[88px] items-center justify-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink md:inline-flex"
                onClick={() => setShowPreview(true)}
              >
                <EyeIcon className="h-4 w-4 shrink-0" />
                Preview
              </button>

              <button
                type="button"
                className="builder-toolbar-button hidden h-9 min-w-[112px] items-center justify-center rounded-lg bg-chip px-3 text-[13px] font-semibold text-ink md:inline-flex"
                onClick={() => setShowTestJourney(true)}
              >
                Sample walkthrough
              </button>

              <button
                type="button"
                disabled={publishing || builderVersion === null}
                className="builder-toolbar-button builder-publish-button hidden h-9 min-w-[108px] items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-semibold text-white shadow-sm disabled:opacity-50 md:inline-flex"
                onClick={() => requestPublish()}
              >
                {publishing ? "Publishing…" : "Publish"}
                <ChevronDownIcon className="h-4 w-4 shrink-0" />
              </button>

              <button
                ref={menuButtonRef}
                type="button"
                aria-label="More actions"
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? "journey-builder-actions" : undefined}
                className="builder-toolbar-button flex h-9 w-9 items-center justify-center rounded-lg text-subtle hover:bg-chip hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                onClick={() => setMenuOpen((value) => !value)}
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </button>

              {menuOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close actions"
                    tabIndex={-1}
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div id="journey-builder-actions" className="absolute right-5 top-12 z-50 w-48 rounded-xl border border-line bg-card p-1.5 shadow-xl">
                    <button
                      type="button"
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip md:hidden"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowPreview(true);
                      }}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip md:hidden"
                      onClick={() => {
                        setMenuOpen(false);
                        setShowTestJourney(true);
                      }}
                    >
                      Sample walkthrough
                    </button>
                    <button
                      type="button"
                      disabled={publishing || builderVersion === null}
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip disabled:opacity-40 md:hidden"
                      onClick={() => requestPublish()}
                    >
                      {publishing ? "Publishing…" : "Publish"}
                    </button>
                    <button
                      type="button"
                      disabled={publishing || (!campaign.enabled && !canEnableAutomation)}
                      title={
                        campaign.enabled
                          ? "Pause this published automation or turn off its draft state."
                          : !campaign.published
                            ? "Publish this automation before activating it."
                            : accountReadiness.status === "loading"
                              ? "Checking Instagram account readiness."
                              : accountReadiness.status === "error"
                                ? "Check the Instagram account status before activating."
                                : accountReadiness.healthyAssignedCount === 0
                                  ? "Assign at least one healthy Instagram account before activating."
                                  : "Activate this published automation."
                      }
                      className="flex w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-chip disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => void handleToggleEnabled()}
                    >
                      {campaign.enabled
                        ? "Pause automation"
                        : !campaign.published
                          ? "Publish before activating"
                          : accountReadiness.status === "loading"
                            ? "Checking account readiness…"
                            : accountReadiness.status === "error"
                              ? "Check account status first"
                              : accountReadiness.healthyAssignedCount === 0
                                ? "Assign an Instagram account first"
                                : "Activate automation"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="min-w-0 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-2.5">
              <h1 className="m-0 truncate text-[20px] font-semibold tracking-[-0.015em] text-ink">
                {campaign.name}
              </h1>

              <span
                title={automationStatus(campaign).title}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${automationStatus(campaign).className}`}
              >
                <span className="mr-1" aria-hidden="true">●</span>
                {automationStatus(campaign).label}
              </span>
            </div>

            <p className="muted m-0 mt-0.5 truncate text-[11px]">
              {describeCampaign(campaign)} · Updated{" "}
              {new Date(campaign.updatedAt).toLocaleDateString()}
            </p>
          </div>

          <div role="tablist" aria-label="Automation sections" className="mt-1.5 flex gap-5 overflow-x-auto md:gap-7">
            {TABS.map((tab, index) => {
              const selected = subTab === tab.key;
              return (
                <button
                  key={tab.key}
                  ref={(element) => { subTabRefs.current[index] = element; }}
                  id={`journey-tab-${tab.key}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="journey-tabpanel"
                  tabIndex={selected ? 0 : -1}
                  onKeyDown={(event) => {
                    let nextIndex: number | null = null;
                    if (event.key === "ArrowRight") nextIndex = (index + 1) % TABS.length;
                    if (event.key === "ArrowLeft") nextIndex = (index - 1 + TABS.length) % TABS.length;
                    if (event.key === "Home") nextIndex = 0;
                    if (event.key === "End") nextIndex = TABS.length - 1;
                    if (nextIndex !== null) {
                      event.preventDefault();
                      subTabRefs.current[nextIndex]?.focus();
                      // Automatic activation keeps the focused tab and its panel aligned.
                      requestSubTabChange(TABS[nextIndex]!.key);
                    }
                  }}
                  onClick={() => requestSubTabChange(tab.key)}
                  className={`relative -mb-px shrink-0 px-0 pb-2.5 pt-0.5 text-[13px] leading-5 transition-colors ${
                    selected ? "font-semibold text-ink" : "text-subtle hover:text-ink"
                  }`}
                >
                  {tab.label}
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-[-1px] left-0 h-[3px] rounded-full bg-accent transition-opacity ${
                      selected ? "w-full opacity-100" : "w-0 opacity-0"
                    }`}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {publishError && (
          <div className="banner banner-error mx-4 mt-3 md:mx-5" role="alert">{publishError}</div>
        )}

        {milestonesLoading && (
          <div className="mx-4 mt-3 flex items-center gap-2 text-xs text-subtle md:mx-5" role="status">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            Loading automation setup…
          </div>
        )}
        {milestoneLoadError && (
          <div className="banner banner-error mx-4 mt-3 flex items-center justify-between gap-3 md:mx-5" role="alert">
            <span>{milestoneLoadError}</span>
            <button
              type="button"
              className="shrink-0 font-semibold underline"
              onClick={() => void loadMilestones()}
            >
              Retry
            </button>
          </div>
        )}

        <div
          id="journey-tabpanel"
          role="tabpanel"
          aria-labelledby={`journey-tab-${subTab}`}
          tabIndex={0}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          {subTab === "builder" && (
            <BuilderCanvas
              tenantId={tenantId}
              campaign={campaign}
              milestones={milestones}
              selectedNode={selectedNode}
              onSelectNode={selectNode}
              onAddMilestone={() => void handleAddMilestone()}
              onRemoveMilestone={(index) => void handleRemoveMilestone(index)}
              onReorderMilestone={(index, direction) =>
                void handleReorderMilestone(index, direction)
              }
              onBuilderVersionChange={setBuilderVersion}
              onSaveStateChange={setBuilderSaveState}
              onCanvasDirtyChange={setCanvasDirty}
              onCanvasActionsChange={registerCanvasActions}
              onMilestonesSaved={acceptSavedMilestones}
            />
          )}

          {subTab === "details" && (
            <div className="py-4 md:h-full md:overflow-y-auto md:p-5">
              <CampaignEditor
                ref={detailsRef}
                tenantId={tenantId}
                campaign={campaign}
                onChanged={onChanged}
                onDirtyChange={setDetailsDirty}
              />
            </div>
          )}

          {subTab === "analytics" && (
            <div className="py-4 md:h-full md:overflow-y-auto md:p-5">
              <AnalyticsPanel tenantId={tenantId} campaign={campaign} />
            </div>
          )}

          {subTab === "leads" && (
            <div className="py-4 md:h-full md:overflow-y-auto md:p-5">
              <LeadsPanel tenantId={tenantId} campaign={campaign} />
            </div>
          )}

        </div>
      </div>

      <NodeInspectorDialog
        open={inspectorOpen && subTab === "builder"}
        tenantId={tenantId}
        campaign={campaign}
        milestones={milestones}
        fieldDefinitions={fieldDefinitions}
        selectedNode={selectedNode}
        onClose={() => setInspectorOpen(false)}
        onCampaignChanged={onChanged}
        onSaveMilestone={handleSaveMilestone}
        onFieldDefinitionsChanged={setFieldDefinitions}
        onSaveMessageConfiguration={saveMessageConfiguration}
      />

      {showPublishConfirm && (
        <BottomSheet
          title="Publish automation"
          onClose={() => {
            if (!publishing) setShowPublishConfirm(false);
          }}
        >
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-950">
            <p className="m-0 text-sm font-semibold">Publishing turns this automation on immediately.</p>
            <p className="m-0 mt-1 text-xs leading-5">
              After publishing, SignalAI can respond to real Instagram conversations that match this setup.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border border-line p-3.5">
            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Starts when</p>
              <p className="m-0 mt-1 text-sm text-ink">
                {campaign.triggerSource === "message"
                  ? "Someone sends a direct message"
                  : campaign.triggerSource === "both"
                    ? "Someone comments or sends a direct message"
                    : "Someone comments on a post or Reel"}
              </p>
            </div>

            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Matching words or phrases</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {campaign.keywords.length > 0 ? campaign.keywords.map((keyword) => (
                  <span key={keyword} className="rounded-md bg-chip px-2 py-1 text-xs font-medium text-ink">{keyword}</span>
                )) : <span className="text-sm text-err-ink">No phrases configured</span>}
              </div>
            </div>

            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Reply destination</p>
              <p className="m-0 mt-1 text-sm text-ink">
                {campaign.replyChannel === "dm"
                  ? "Private Instagram message"
                  : campaign.replyChannel === "comment"
                    ? "Public comment reply"
                    : "Public comment and private message"}
              </p>
            </div>

            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Link to share</p>
              {campaign.ctaLink?.trim() ? (
                <p className="m-0 mt-1 break-all text-sm text-ink">{campaign.ctaLink}</p>
              ) : (
                <>
                  <p className="m-0 mt-1 text-sm text-ink">No link configured</p>
                  <p className="muted m-0 mt-1 text-xs leading-5">
                    Optional. Add a product, booking or website link in Setup if this reply should direct people somewhere.
                  </p>
                </>
              )}
            </div>

            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Reply style</p>
              <p className="m-0 mt-1 text-sm text-ink">
                {campaign.replyMode === "ai_generated" ? "AI-generated replies" : "Prewritten replies"}
              </p>
              <p className="muted m-0 mt-1 text-xs">Fallback reply: {campaign.defaultReplyTemplate?.trim() || "Not configured"}</p>
            </div>

            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Instagram account</p>
              <p className="m-0 mt-1 text-sm text-ink">
                {accountReadiness.status === "loading"
                  ? "Checking connected accounts…"
                  : accountReadiness.status === "error"
                    ? "Could not verify connected accounts"
                    : accountReadiness.healthyAssignedCount > 0
                      ? `${accountReadiness.healthyAssignedCount} healthy account${accountReadiness.healthyAssignedCount === 1 ? "" : "s"} assigned`
                      : "No healthy account assigned"}
              </p>
              {accountReadiness.status === "ready" &&
                accountReadiness.healthyAssignedCount === 0 && (
                  <p className="m-0 mt-1 text-xs leading-5 text-amber-800">
                    Publishing will turn the automation on, but it cannot handle conversations until a healthy Instagram account is assigned.
                  </p>
                )}
              {accountReadiness.status === "ready" && accountReadiness.unavailableAssignedCount > 0 && (
                <p className="m-0 mt-1 text-xs leading-5 text-amber-800">
                  {accountReadiness.unavailableAssignedCount} assigned account{accountReadiness.unavailableAssignedCount === 1 ? " is" : "s are"} unavailable. Reconnect {accountReadiness.unavailableAssignedCount === 1 ? "it" : "them"} before expecting replies.
                </p>
              )}
            </div>

            <div>
              <p className="m-0 text-xs font-semibold text-subtle">Lead details</p>
              <p className="m-0 mt-1 text-sm text-ink">
                {milestones.length > 0
                  ? `Collects details across ${milestones.length} goal${milestones.length === 1 ? "" : "s"}`
                  : "No goal-based lead details configured yet"}
              </p>
            </div>
          </div>

          {accountReadiness.status === "error" && (
            <div className="banner banner-error mt-3" role="alert">
              Couldn't verify the connected Instagram accounts. Refresh the page and check account status before publishing.
            </div>
          )}
          {accountReadiness.status === "ready" && accountReadiness.healthyAssignedCount === 0 && (
            <div className="banner banner-error mt-3" role="alert">
              Assign at least one healthy Instagram account before publishing. You can keep saving this automation as a draft while you finish setup.
            </div>
          )}

          <p className="muted mt-3 text-xs leading-5">
            Version v{builderVersion ?? "—"} will become live. If this automation already has a live version, it stays active until this update is published.
          </p>

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="btn-secondary"
              disabled={publishing}
              onClick={() => setShowPublishConfirm(false)}
            >
              Cancel
            </button>

            <button
              type="button"
              className="btn-primary"
              disabled={
                publishing ||
                accountReadiness.status !== "ready" ||
                accountReadiness.healthyAssignedCount === 0
              }
              onClick={() => void handlePublish()}
            >
              {publishing
                ? "Publishing…"
                : accountReadiness.status !== "ready" || accountReadiness.healthyAssignedCount === 0
                  ? "Check Instagram account"
                  : "Publish and activate"}
            </button>
          </div>
        </BottomSheet>
      )}

      {showUnsavedDialog && (
        <BottomSheet
          title="Unsaved changes"
          onClose={keepEditing}
        >
          <p className="m-0 text-sm text-ink">
            You have unsaved automation changes. Save or discard them before continuing; unsaved changes will be lost if you continue without saving.
          </p>
          {unsavedDialogError && (
            <div className="banner banner-error mt-3">{unsavedDialogError}</div>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={keepEditing}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={() => void discardAndContinue()}
            >
              Discard changes
            </button>
            <button
              type="button"
              className="btn-primary min-h-11"
              onClick={() => void saveAndContinue()}
            >
              Save changes and continue
            </button>
          </div>
        </BottomSheet>
      )}

      {showPreview && (
        <PreviewDialog
          tenantId={tenantId}
          campaign={campaign}
          onClose={() => setShowPreview(false)}
        />
      )}

      {showTestJourney && (
        <TestJourneyDialog
          tenantId={tenantId}
          campaign={campaign}
          milestones={milestones}
          onClose={() => setShowTestJourney(false)}
        />
      )}

      {pendingTab && (
        <BottomSheet title="Unsaved changes" onClose={() => setPendingTab(null)}>
          <p className="muted mt-0">
            You have unsaved changes in Setup. What would you like to do?
          </p>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={() => setPendingTab(null)}
            >
              Keep editing
            </button>

            <button
              type="button"
              className="btn-secondary min-h-11"
              onClick={() => {
                detailsRef.current?.discard();
                setSubTab(pendingTab);
                setPendingTab(null);
              }}
            >
              Discard changes
            </button>

            <button
              type="button"
              className="btn-primary min-h-11"
              onClick={async () => {
                const ok = await detailsRef.current?.save();
                if (ok) {
                  setSubTab(pendingTab);
                  setPendingTab(null);
                }
              }}
            >
              Save changes
            </button>
          </div>
        </BottomSheet>
      )}
    </>
  );
}
