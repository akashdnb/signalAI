import { Router } from "express";

export const legalRouter = Router();

// DRAFT CONTENT — reflects the actual data flows this system implements
// (per docs/signalAI_roadmap.md Platform Foundations), but has not been
// reviewed by counsel. Do not submit for App Review until it has been.
legalRouter.get("/privacy", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><title>Privacy Policy</title></head><body>
<h1>Privacy Policy</h1>
<p><em>Draft — pending legal review before App Review submission.</em></p>
<h2>What we collect</h2>
<p>When you connect your Instagram professional account, we store your access
token (encrypted), and the comments and direct messages our automation
processes on your behalf, tied to the lead who sent them.</p>
<h2>How we use it</h2>
<p>To match comments against your configured triggers, generate replies, and
show you the resulting leads and analytics.</p>
<h2>Deletion</h2>
<p>You or Meta may request deletion of a user's data at any time via our
Data Deletion Callback. We scrub the personal content of that user's record
while retaining anonymized structural data needed for billing and analytics
integrity.</p>
</body></html>`);
});

legalRouter.get("/terms", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html><head><title>Terms of Service</title></head><body>
<h1>Terms of Service</h1>
<p><em>Draft — pending legal review before App Review submission.</em></p>
<p>By connecting an Instagram professional account, you authorize signalAI to
process comments and direct messages on that account in order to run the
automations you configure.</p>
</body></html>`);
});
