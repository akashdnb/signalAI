import express from "express";
import { healthRouter } from "./routes/health.js";
import { legalRouter } from "./routes/legal.js";
import { dataDeletionRouter } from "./routes/dataDeletion.js";

export function createApp() {
  const app = express();

  // Meta's Data Deletion Callback posts form-encoded, not JSON.
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());

  app.use(healthRouter);
  app.use(legalRouter);
  app.use(dataDeletionRouter);

  return app;
}
