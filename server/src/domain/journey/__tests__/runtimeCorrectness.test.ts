import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { JourneyRuntime } from "../runtime.js";

/*
 * These tests are intentionally integration-oriented.
 *
 * They should run against the same test PostgreSQL instance used by
 * the existing journey publish/runtime integration tests.
 */

describe("journey runtime correctness", () => {
  it.skip(
    "processes the same event exactly once",
    async () => {
      /*
       * Arrange:
       *   execution waiting on a message action
       *
       * Act:
       *   call resumeFromEvent() twice with the same eventId
       *
       * Assert:
       *   first call advances
       *   second call returns duplicateEvent=true
       *   only one new node execution exists
       */
    },
  );

  it.skip(
    "serializes concurrent events for the same execution",
    async () => {
      /*
       * Arrange:
       *   execution waiting on a message
       *
       * Act:
       *   Promise.all([
       *     runtime.resumeFromEvent(event-A),
       *     runtime.resumeFromEvent(event-B),
       *   ])
       *
       * Assert:
       *   execution state is consistent
       *   no duplicate action/node transition exists
       *
       * IMPORTANT:
       * PostgreSQL FOR UPDATE on journey_executions is the
       * serialization mechanism.
       */
    },
  );

  it.skip(
    "prevents duplicate active executions under concurrent starts",
    async () => {
      /*
       * Promise.all([
       *   runtime.start(subject),
       *   runtime.start(subject),
       * ])
       *
       * Assert:
       *   exactly one active execution exists.
       *
       * The database partial unique index is the final guarantee.
       */
    },
  );

  it.skip(
    "keeps an execution pinned to the published version it started with",
    async () => {
      /*
       * Start against published v1.
       * Publish v2.
       * Resume v1 execution.
       *
       * Assert:
       *   runtime still reads v1.
       */
    },
  );
});
