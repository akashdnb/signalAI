import { expect, test, type Page } from "@playwright/test";

const tenantId = "reliability-tenant";
const campaignId = "reliability-campaign";
const tenantPath = `/tenants/${tenantId}`;
const campaignPath = `${tenantPath}/campaigns/${campaignId}`;

const campaign = {
  id: campaignId,
  tenantId,
  name: "Reliability journey",
  description: "A journey used by automation reliability tests.",
  keywords: ["price"],
  enabled: false,
  published: false,
  replyMode: "rule_based",
  replyTemplates: [],
  defaultReplyTemplate: "Thanks — here are the details.",
  ctaLink: "https://example.com/details",
  targetMediaIds: [],
  replyChannel: "dm",
  triggerSource: "message",
  tone: "friendly",
  language: "en",
  useKnowledgeBase: false,
  createdAt: "2026-10-16T10:00:00.000Z",
  updatedAt: "2026-10-16T10:00:00.000Z",
};

const graph = {
  version: 3,
  nodes: [
    {
      id: "trigger-node",
      type: "trigger",
      position: { x: 215, y: 80 },
      data: {},
      parentGroupId: null,
      collapsed: false,
    },
    {
      id: "message-node",
      type: "message",
      position: { x: 470, y: 110 },
      data: { text: "Thanks — here are the details." },
      parentGroupId: null,
      collapsed: false,
    },
    {
      id: "handoff-node",
      type: "human_handoff",
      position: { x: 770, y: 260 },
      data: {},
      parentGroupId: null,
      collapsed: false,
    },
  ],
  edges: [
    {
      id: "trigger-message",
      sourceNodeId: "trigger-node",
      targetNodeId: "message-node",
      label: null,
      condition: null,
    },
    {
      id: "message-handoff",
      sourceNodeId: "message-node",
      targetNodeId: "handoff-node",
      label: null,
      condition: null,
    },
  ],
};

async function mockAutomationApi(page: Page) {
  await page.addInitScript(({ id }) => {
    localStorage.setItem(
      "signalai.session",
      JSON.stringify({ tenantId: id, token: "reliability-token", email: "creator@example.com" }),
    );
  }, { id: tenantId });

  await page.route("http://localhost:3000/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    let data: unknown = [];

    if (path === tenantPath && method === "GET") {
      data = { id: tenantId, name: "Reliability Workspace", billingStatus: "none", industry: "creator" };
    } else if (path === `${tenantPath}/account` && method === "GET") {
      data = { connected: false, status: "healthy" };
    } else if (path === `${tenantPath}/connected-accounts` && method === "GET") {
      data = { accounts: [] };
    } else if (path === `${campaignPath}` && method === "GET") {
      data = campaign;
    } else if (path === `${campaignPath}/builder` && method === "GET") {
      data = graph;
    } else if (path === `${campaignPath}/milestones` && method === "GET") {
      data = [];
    } else if (path === `${tenantPath}/field-definitions` && method === "GET") {
      data = { fieldDefinitions: [] };
    } else if (path === `${tenantPath}/observed-media` && method === "GET") {
      data = [];
    } else if (path === `${campaignPath}/connected-accounts` && method === "GET") {
      data = { accounts: [] };
    } else if (path === `${tenantPath}/members` && method === "GET") {
      data = [{ userId: "reliability-owner", email: "creator@example.com", role: "owner" }];
    } else if (path === `${tenantPath}/campaigns` && method === "GET") {
      data = { items: [campaign], page: 1, pageSize: 10, total: 1, totalPages: 1 };
    } else if (path === `${campaignPath}/journey/published` && method === "GET") {
      data = null;
    } else if (path === `${campaignPath}/preview` && method === "POST") {
      data = {
        ruleBased: { matched: true, text: campaign.defaultReplyTemplate },
        aiGenerated: { text: campaign.defaultReplyTemplate },
      };
    } else if (path === `${campaignPath}/milestones` && method === "PUT") {
      data = [];
    } else if (path === `${campaignPath}/builder` && method === "PUT") {
      data = { ...graph, version: graph.version + 1 };
    } else if (path === `${campaignPath}/journey/publish` && method === "POST") {
      data = {
        id: "published-reliability",
        tenantId,
        campaignId,
        version: graph.version,
        graph,
        createdAt: "2026-10-16T10:00:00.000Z",
        publishedAt: "2026-10-16T10:00:00.000Z",
      };
    } else if (path === `${campaignPath}/reply-config` && method === "PUT") {
      data = campaign;
    } else if (path === `${campaignPath}/reply-config` && method === "PATCH") {
      data = campaign;
    } else if (path === `${campaignPath}/enabled` && method === "PATCH") {
      data = campaign;
    } else {
      data = [];
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
  });
}

async function openBuilder(page: Page) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockAutomationApi(page);
  await page.goto(`/dashboard/${tenantId}/automation/journeys/${campaignId}`);
  await expect(page.getByRole("tab", { name: "Flow" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Save journey" })).toBeVisible();
}

test.describe("automation reliability release gates", () => {
  test("graph changes stay local until Save journey is clicked", async ({ page }) => {
    await openBuilder(page);
    let saveRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "PUT" && request.url().endsWith(`${campaignPath}/builder`)) saveRequests += 1;
    });

    await page.getByRole("button", { name: "Add goal" }).click();
    await page.getByRole("button", { name: "Add goal" }).click();
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    expect(saveRequests).toBe(0);

    await page.getByRole("button", { name: "Save journey" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    expect(saveRequests).toBe(1);
  });

  test("failed save keeps the journey dirty and preserves the local draft", async ({ page }) => {
    await openBuilder(page);
    await page.route(`http://localhost:3000${campaignPath}/builder`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Temporary save outage" }),
      });
    });

    await page.getByRole("button", { name: "Add goal" }).click();
    await page.getByRole("button", { name: "Save journey" }).click();
    await expect(page.getByText("Temporary save outage")).toBeVisible();
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save journey" })).toBeEnabled();
  });

  test("stale-version save exposes a safe recovery path without overwriting local changes", async ({ page }) => {
    await openBuilder(page);
    await page.route(`http://localhost:3000${campaignPath}/builder`, async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "journey version conflict", currentVersion: 8 }),
      });
    });

    await page.getByRole("button", { name: "Add goal" }).click();
    await page.getByRole("button", { name: "Save journey" }).click();
    await page.getByRole("button", { name: "Review version conflict" }).click();
    const conflict = page.getByRole("dialog", { name: "Journey changed elsewhere" });
    await expect(conflict).toContainText("server is on version v8");
    await expect(conflict).toContainText("local edits are still here");
    await conflict.getByRole("button", { name: "Keep my draft" }).click();
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();
  });

  test("dirty navigation can be cancelled or discarded without losing the draft before the user chooses", async ({ page }) => {
    await openBuilder(page);
    await page.getByRole("button", { name: "Add goal" }).click();
    await page.getByRole("button", { name: "← Back to automations" }).click();

    const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByRole("tab", { name: "Flow" })).toBeVisible();
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "← Back to automations" }).click();
    await page.getByRole("dialog", { name: "Unsaved changes" }).getByRole("button", { name: "Discard changes" }).click();
    await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  });

  test("Setup changes are also protected and can be saved while navigating away", async ({ page }) => {
    await openBuilder(page);
    await page.getByRole("tab", { name: "Setup" }).click();
    const cta = page.getByRole("textbox", { name: "CTA link (HTTPS URL)" });
    await cta.fill("https://example.com/new-details");

    await page.getByRole("button", { name: "← Back to automations" }).click();
    const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
    await expect(dialog).toContainText("Setup settings use separate save controls");
    await dialog.getByRole("button", { name: "Save changes and continue" }).click();
    await expect(page.getByRole("heading", { name: "Automations" })).toBeVisible();
  });

  test("preview and sample walkthrough never publish the journey", async ({ page }) => {
    await openBuilder(page);
    let publishRequests = 0;
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().endsWith(`${campaignPath}/journey/publish`)) publishRequests += 1;
    });

    await page.getByRole("button", { name: "Preview" }).click();
    await expect(page.getByRole("dialog", { name: "Preview conversation" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByRole("button", { name: "Sample walkthrough" }).click();
    const walkthrough = page.getByRole("dialog", { name: /Walk through a sample/ });
    await expect(walkthrough).toContainText("not a live Instagram test");
    await walkthrough.getByRole("button", { name: "Start sample walkthrough" }).click();
    await expect(walkthrough).toContainText("Thanks — here are the details.");
    expect(publishRequests).toBe(0);
  });

  test("publish failure exposes validation blockers and leaves the saved draft intact", async ({ page }) => {
    await openBuilder(page);
    await page.route(`http://localhost:3000${campaignPath}/journey/publish`, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "journey validation failed",
          details: [
            { code: "INVALID_TRIGGER_COUNT", message: "Journey must contain exactly one trigger node." },
            { code: "NO_TERMINAL_NODE", message: "Journey must contain at least one terminal node." },
          ],
        }),
      });
    });

    await page.getByRole("button", { name: "Publish", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Publish automation" });
    await dialog.getByRole("button", { name: "Publish draft", exact: true }).click();
    await expect(dialog).toContainText("Journey must contain exactly one trigger node.");
    await expect(dialog).toContainText("Journey must contain at least one terminal node.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });
});
