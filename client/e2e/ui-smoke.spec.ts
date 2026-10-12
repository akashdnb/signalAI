import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const tenantId = "smoke-tenant";
const tenantPath = `/tenants/${tenantId}`;
const leadFixture = {
  id: "smoke-lead",
  tenantId,
  customerId: null,
  instagramUserId: "ig-user-smoke",
  username: "smoke_creator_handle_example_01",
  lastEventType: "message",
  lastMessagePreview: "Can you share pricing?",
  unread: true,
  activeMilestoneId: null,
  lastInboundAt: "2026-10-10T10:00:00.000Z",
  windowOpenUntil: "2026-10-11T10:00:00.000Z",
  createdAt: "2026-10-10T09:00:00.000Z",
  pipelineStage: "new",
  ownerUserId: "smoke-owner",
  handoffStatus: "ai",
};

async function mockTenantApi(
  page: Page,
  options: {
    failFirstLeadsLoad?: boolean;
    failFirstTimelineLoad?: boolean;
    unknownUsername?: boolean;
    journeyEditor?: boolean;
    automationList?: boolean;
    publishedCampaign?: boolean;
  } = {},
) {
  const activeLead = options.unknownUsername
    ? { ...leadFixture, username: null }
    : leadFixture;
  const campaignFixture = {
    id: "smoke-campaign",
    tenantId,
    name: "Product enquiry journey",
    description: null,
    keywords: ["price"],
    enabled: false,
    published: options.publishedCampaign ?? false,
    replyMode: "ai_generated",
    replyTemplates: [],
    defaultReplyTemplate: "Here's the information you asked for.",
    ctaLink: "https://example.com/details",
    targetMediaIds: ["post-card"],
    replyChannel: "dm",
    triggerSource: "message",
    tone: "friendly",
    language: "en",
    useKnowledgeBase: false,
    createdAt: "2026-10-10T09:00:00.000Z",
    updatedAt: "2026-10-10T09:00:00.000Z",
  };
  const mediaFixture = {
    mediaId: "post-card",
    commentCount: 3,
    lastSeenAt: "2026-10-10T10:00:00.000Z",
    caption: "A sample product post",
    mediaType: "IMAGE",
    thumbnailUrl: "https://cdn.example.com/post-card.jpg",
    permalink: "https://instagram.com/p/example",
    postedAt: "2026-10-01T10:00:00.000Z",
  };
  // React Strict Mode intentionally mounts effects twice in development.
  // Fail both initial attempts so the active effect sees the error; Retry is
  // then the next request and must succeed.
  let failedLeadsLoadCount = 0;
  let failedTimelineLoadCount = 0;
  await page.route("http://localhost:3000/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (
      options.failFirstLeadsLoad &&
      path === `${tenantPath}/leads` &&
      !url.searchParams.has("unread") &&
      failedLeadsLoadCount < 2
    ) {
      failedLeadsLoadCount += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary test outage" }),
      });
      return;
    }

    if (
      options.failFirstTimelineLoad &&
      path === `${tenantPath}/leads/smoke-lead/timeline` &&
      failedTimelineLoadCount < 2
    ) {
      failedTimelineLoadCount += 1;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary timeline outage" }),
      });
      return;
    }

    let data: unknown = [];

    if (path === tenantPath) {
      data = {
        id: tenantId,
        name: "Smoke Workspace",
        billingStatus: "none",
        industry: "creator",
      };
    } else if (path === `${tenantPath}/account`) {
      data = { connected: false, status: "healthy" };
    } else if (path === `${tenantPath}/connected-accounts`) {
      data = { accounts: [] };
    } else if (path === `${tenantPath}/usage`) {
      data = {
        planTier: "trial",
        planTierLabel: "Trial",
        cycleStart: "2026-10-01T00:00:00.000Z",
        trialEndsAt: null,
        isTrialExpired: false,
        isEntitled: true,
        tokens: {
          used: 0,
          allowance: 10000,
          overage: 0,
          estimatedOverageCostUsd: 0,
          nearingLimit: false,
        },
        dms: { sent: 0, allowance: 100, nearingLimit: false },
      };
    } else if (path === `${tenantPath}/billing`) {
      data = {
        billingStatus: "none",
        billingConfigured: false,
        planTier: "trial",
        planTierLabel: "Trial",
        quotas: { dmsPerMonth: 100, connectedAccounts: 1, campaigns: 5, tokenAllowance: 10000 },
        trialEndsAt: null,
        availableTiers: [],
      };
    } else if (path === `${tenantPath}/analytics`) {
      data = { commentsReceived: 0, dmsSent: 0, dmFailures: 0, uniqueLeads: 0 };
    } else if (path === `${tenantPath}/analytics/funnel`) {
      data = {
        stages: [
          { key: "comments", label: "Comments", count: 0 },
          { key: "dms", label: "DMs", count: 0 },
          { key: "leads", label: "Leads", count: 0 },
          { key: "qualified", label: "Qualified", count: 0 },
          { key: "meeting", label: "Meetings", count: 0 },
          { key: "won", label: "Won", count: 0 },
        ],
        openWithNoOutcome: 0,
      };
    } else if (path === `${tenantPath}/analytics/revenue`) {
      data = [];
    } else if (path === `${tenantPath}/analytics/timeseries`) {
      data = [];
    } else if (path === `${tenantPath}/analytics/top-posts`) {
      data = [];
    } else if (path === `${tenantPath}/analytics/top-keywords`) {
      data = [];
    } else if (path === `${tenantPath}/observed-media`) {
      data = options.journeyEditor ? [mediaFixture] : [];
    } else if (path === `${tenantPath}/field-definitions`) {
      data = { fieldDefinitions: [] };
    } else if (path === `${tenantPath}/campaigns`) {
      data = options.automationList
        ? { items: [campaignFixture], page: 1, pageSize: 10, total: 1, totalPages: 1 }
        : [];
    } else if (path === `${tenantPath}/campaigns/smoke-campaign`) {
      data = campaignFixture;
    } else if (path === `${tenantPath}/campaigns/smoke-campaign/builder`) {
      data = { nodes: [], edges: [], version: 0 };
    } else if (path === `${tenantPath}/campaigns/smoke-campaign/milestones`) {
      data = [];
    } else if (path === `${tenantPath}/campaigns/smoke-campaign/connected-accounts`) {
      data = { accounts: [] };
    } else if (path === `${tenantPath}/members`) {
      data = [{ userId: "smoke-owner", email: "owner@example.com", role: "owner" }];
    } else if (path === `${tenantPath}/leads`) {
      data = [activeLead];
    } else if (path === `${tenantPath}/leads/smoke-lead`) {
      data = activeLead;
    } else if (path === `${tenantPath}/leads/smoke-lead/timeline`) {
      data = {
        entries: [{
          kind: "event",
          occurredAt: "2026-10-10T10:00:00.000Z",
          eventType: "message",
          text: "Can you share pricing?",
          username: activeLead.username,
          matchedKeyword: null,
        }],
        hasMore: false,
        nextCursor: null,
      };
    } else if (path === `${tenantPath}/leads/smoke-lead/captured-facts`) {
      data = { facts: {} };
    } else if (path === `${tenantPath}/leads/smoke-lead/intelligence`) {
      data = null;
    } else if (path === `${tenantPath}/leads/smoke-lead/intelligence/history`) {
      data = [];
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });

  await page.addInitScript(({ tenantId: storageTenantId }) => {
    localStorage.setItem(
      "signalai.session",
      JSON.stringify({ tenantId: storageTenantId, token: "smoke-token", email: "owner@example.com" }),
    );
  }, { tenantId });
}

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.content,
    `Unexpected horizontal overflow: content ${dimensions.content}px > viewport ${dimensions.viewport}px`,
  ).toBeLessThanOrEqual(dimensions.viewport + 1);
}

const operationalRoutes = [
  { path: "/dashboard/smoke-tenant/leads", heading: "Leads" },
  { path: "/dashboard/smoke-tenant/inbox", heading: "Inbox" },
  { path: "/dashboard/smoke-tenant/content", heading: "Content" },
  { path: "/dashboard/smoke-tenant/analytics", heading: "Analytics" },
  { path: "/dashboard/smoke-tenant/team", heading: "Team" },
  { path: "/dashboard/smoke-tenant/integrations", heading: "Integrations" },
];

test.describe("responsive route smoke checks", () => {
  for (const route of operationalRoutes) {
    test(`${route.heading} fits a mobile viewport`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await mockTenantApi(page);
      await page.goto(route.path);
      await expect(page.locator("h1")).toContainText(route.heading);
      await expectNoHorizontalOverflow(page);
    });
  }

  test("login and documentation render without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Turn Instagram enquiries into/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.goto("/docs/introduction");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Automation tabs are keyboard-accessible and always reference the active panel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page);
    await page.goto("/dashboard/smoke-tenant/automation");

    const myAutomations = page.getByRole("tab", { name: "My automations" });
    const templates = page.getByRole("tab", { name: "Start from a template" });
    const panel = page.locator("#automation-tabpanel");

    await expect(myAutomations).toHaveAttribute("aria-selected", "true");
    await myAutomations.focus();
    await page.keyboard.press("ArrowRight");
    await expect(templates).toBeFocused();
    await expect(templates).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("aria-labelledby", "automation-tab-templates");
    await expect(page.getByRole("heading", { name: "What do you want to automate?" })).toBeVisible();

    await page.keyboard.press("ArrowLeft");
    await expect(myAutomations).toBeFocused();
    await expect(myAutomations).toHaveAttribute("aria-selected", "true");
    await expect(panel).toHaveAttribute("aria-labelledby", "automation-tab-journeys");
    await expectNoHorizontalOverflow(page);
  });

  test("automation list actions are keyboard-dismissable without making the table row a button", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page, { automationList: true });
    await page.goto("/dashboard/smoke-tenant/automation");

    const title = page.getByRole("button", { name: "Product enquiry journey" });
    await expect(title).toBeVisible();
    const row = page.getByRole("row", { name: /Product enquiry journey/ });
    await expect(row).not.toHaveAttribute("role", "button");
    await expect(row.getByText("Draft", { exact: true })).toBeVisible();

    const actions = page.getByRole("button", { name: "Actions for Product enquiry journey" });
    await actions.click();
    await expect(actions).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("Escape");
    await expect(actions).toHaveAttribute("aria-expanded", "false");
    await expect(actions).toBeFocused();
  });

  test("automation filters fit a tablet viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await mockTenantApi(page, { automationList: true });
    await page.goto("/dashboard/smoke-tenant/automation");
    await expect(page.getByRole("heading", { name: /My automations/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("single activation requires explicit confirmation before enabling a published automation", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page, { automationList: true, publishedCampaign: true });
    let activationRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/campaigns/smoke-campaign/enabled")) activationRequests += 1;
    });
    await page.goto("/dashboard/smoke-tenant/automation");

    await page.getByRole("button", { name: "Actions for Product enquiry journey" }).click();
    await page.getByRole("button", { name: "Activate automation" }).click();
    const dialog = page.getByRole("dialog", { name: "Activate automation?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("real Instagram conversations");
    expect(activationRequests).toBe(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(activationRequests).toBe(0);
  });

  test("bulk activation requires confirmation and explains live-reply impact", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page, { automationList: true, publishedCampaign: true });
    let activationRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes("/campaigns/smoke-campaign/enabled")) activationRequests += 1;
    });
    await page.goto("/dashboard/smoke-tenant/automation");

    await page.getByRole("checkbox", { name: "Select Product enquiry journey" }).check();
    await page.getByRole("button", { name: "Activate", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Activate selected automations?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Activating 1 published automation");
    await expect(dialog).toContainText("real Instagram conversations");
    expect(activationRequests).toBe(0);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    expect(activationRequests).toBe(0);
  });

  test("Inbox opens a conversation without overflowing the mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page, { failFirstTimelineLoad: true });
    await page.goto("/dashboard/smoke-tenant/inbox");
    const leadButton = page.getByRole("button", { name: /smoke_creator_handle_example_01/ });
    await expect(leadButton).toBeVisible();
    await leadButton.click();
    const retryMessages = page.getByRole("button", { name: "Retry loading messages" });
    await expect(retryMessages).toBeVisible();
    await retryMessages.click();
    await expect(
      page.locator(".timeline-entry").filter({ hasText: "Can you share pricing?" }).first(),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("Lead detail tabs support arrow-key navigation and activation", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page);
    await page.goto("/dashboard/smoke-tenant/leads/smoke-lead");
    await expect(page.locator("h1")).toContainText("smoke_creator_handle_example_01");

    const overview = page.getByRole("tab", { name: "Overview" });
    await overview.focus();
    await page.keyboard.press("ArrowRight");
    const conversation = page.getByRole("tab", { name: "Conversation" });
    await expect(conversation).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tabpanel")).toContainText("Can you share pricing?");
    await expectNoHorizontalOverflow(page);
  });

  test("unresolved Instagram usernames have a clear fallback across lead surfaces", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page, { unknownUsername: true });

    await page.goto("/dashboard/smoke-tenant/leads");
    await expect(page.getByText("Instagram user", { exact: true })).toBeVisible();
    await expect(page.getByText("Username unavailable", { exact: true })).toBeVisible();

    await page.goto("/dashboard/smoke-tenant/inbox");
    await expect(page.getByRole("button", { name: /Instagram user/ })).toBeVisible();
    await expect(page.getByText(/Username unavailable/).first()).toBeVisible();

    await page.goto("/dashboard/smoke-tenant/leads/smoke-lead");
    await expect(page.locator("h1")).toContainText("Instagram user");
    await expect(page.getByText(/Instagram hasn't provided a username for this lead yet/)).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test("automation Setup previews CTA cards and explains non-HTTPS fallback", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page, { journeyEditor: true });
    await page.goto("/dashboard/smoke-tenant/automation/journeys/smoke-campaign");

    const setupTab = page.getByRole("tab", { name: "Setup" });
    await expect(setupTab).toBeVisible();
    await setupTab.click();

    const ctaInput = page.getByRole("textbox", { name: "CTA link (HTTPS URL)" });
    await expect(ctaInput).toHaveValue("https://example.com/details");
    await expect(ctaInput).toHaveCSS("display", "block");
    await expect(page.getByText("Image card", { exact: true })).toBeVisible();

    const aiPreferences = page.getByRole("button", { name: "AI reply preferences" });
    const toneSelect = aiPreferences.locator("xpath=..").locator("select").first();
    await expect(aiPreferences).toHaveAttribute("aria-expanded", "false");
    await aiPreferences.click();
    await expect(aiPreferences).toHaveAttribute("aria-expanded", "true");
    await expect(toneSelect).toBeVisible();
    await aiPreferences.click();
    await expect(aiPreferences).toHaveAttribute("aria-expanded", "false");
    await expect(toneSelect).toBeHidden();

    const ctaHelp = page.getByText(/An HTTPS link becomes an Instagram button/);
    const ctaBox = await ctaInput.boundingBox();
    const helpBox = await ctaHelp.boundingBox();
    expect(ctaBox).not.toBeNull();
    expect(helpBox).not.toBeNull();
    expect(helpBox!.y).toBeGreaterThan(ctaBox!.y + ctaBox!.height);
    await expect(page.locator('img[src="https://cdn.example.com/post-card.jpg"]').first()).toBeVisible();
    await expect(page.getByRole("link", { name: /View details/ }).last()).toHaveAttribute(
      "href",
      "https://example.com/details",
    );

    await ctaInput.fill("http://example.com/details");
    await expect(page.getByText("Text only", { exact: true })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Interactive Instagram CTAs require a valid HTTPS URL" })).toBeVisible();
  });

  test("Automation Setup accordions are interactive on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page, { journeyEditor: true });
    await page.goto("/dashboard/smoke-tenant/automation/journeys/smoke-campaign");

    const setupTab = page.getByRole("tab", { name: "Setup" });
    await expect(setupTab).toBeVisible();
    await setupTab.click();

    const aiPreferences = page.getByRole("button", { name: "AI reply preferences" });
    const toneSelect = aiPreferences.locator("xpath=..").locator("select").first();
    await expect(aiPreferences).toHaveAttribute("aria-expanded", "false");
    await aiPreferences.click();
    await expect(aiPreferences).toHaveAttribute("aria-expanded", "true");
    await expect(toneSelect).toBeVisible();
    await aiPreferences.click();
    await expect(aiPreferences).toHaveAttribute("aria-expanded", "false");
    await expect(toneSelect).toBeHidden();

    const postTargeting = page.getByRole("button", { name: "Which posts should it respond to?" });
    await postTargeting.click();
    await expect(page.getByText("Choose which posts and Reels can start this automation.")).toBeVisible();

    const conversationGoals = page.getByRole("button", { name: "Conversation goals" });
    await conversationGoals.click();
    await expect(page.getByRole("button", { name: "+ Add goal" })).toBeVisible();

    // The inert Danger Zone / Delete placeholder was removed from Setup.
    await expect(page.getByRole("button", { name: /Danger Zone|Delete journey/ })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
  });

  test("builder tabs activate with arrow keys and keep the selected panel in sync", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page, { journeyEditor: true });
    await page.goto("/dashboard/smoke-tenant/automation/journeys/smoke-campaign");

    const flowTab = page.getByRole("tab", { name: "Flow" });
    const setupTab = page.getByRole("tab", { name: "Setup" });
    await expect(flowTab).toHaveAttribute("aria-selected", "true");
    await flowTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(setupTab).toBeFocused();
    await expect(setupTab).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#journey-tabpanel")).toHaveAttribute("aria-labelledby", "journey-tab-details");
  });

  test("builder actions explain why an unpublished draft cannot be activated", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page);
    await page.goto("/dashboard/smoke-tenant/automation/journeys/smoke-campaign");

    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "More actions" }).click();
    const activate = page.getByRole("button", { name: "Publish before activating" });
    await expect(activate).toBeVisible();
    await expect(activate).toBeDisabled();
  });

  test("Leads recovers from a temporary list failure through Retry", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page, { failFirstLeadsLoad: true });
    await page.goto("/dashboard/smoke-tenant/leads");

    const alert = page.getByRole("alert");
    await expect(alert).toContainText("Temporary test outage");
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.locator("tbody")).toContainText("smoke_creator_handle_example_01");
    await expectNoHorizontalOverflow(page);
  });

  test("mobile navigation exposes modal state and closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockTenantApi(page);
    await page.goto("/dashboard/smoke-tenant/leads");

    const openMenu = page.getByRole("button", { name: "Open menu" });
    await openMenu.click();
    await expect(openMenu).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("dialog", { name: "Primary navigation" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(openMenu).toHaveAttribute("aria-expanded", "false");
    await expectNoHorizontalOverflow(page);
  });

  test("Leads has no critical axe accessibility violations", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockTenantApi(page);
    await page.goto("/dashboard/smoke-tenant/leads");
    await expect(page.getByRole("heading", { name: "Leads", exact: true })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const critical = results.violations.filter((violation) => violation.impact === "critical");
    expect(
      critical.map((violation) => ({
        id: violation.id,
        description: violation.description,
        nodes: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  });
});
