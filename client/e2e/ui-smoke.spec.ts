import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const tenantId = "smoke-tenant";
const tenantPath = `/tenants/${tenantId}`;

async function mockTenantApi(page: Page) {
  await page.route("http://localhost:3000/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
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
      data = [];
    } else if (path === `${tenantPath}/members`) {
      data = [{ userId: "smoke-owner", email: "owner@example.com", role: "owner" }];
    } else if (path === `${tenantPath}/leads`) {
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
      await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
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
