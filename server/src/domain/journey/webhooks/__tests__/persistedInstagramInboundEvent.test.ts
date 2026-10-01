import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  processPersistedInstagramInboundEvent,
} from "../processInstagramMessage.js";

describe(
  "processPersistedInstagramInboundEvent",
  () => {
    it(
      "does not replay a terminal processed event",
      async () => {
        const pool = {
          query: vi.fn(
            async (
              sql: string,
            ) => {
              if (
                sql.includes(
                  "from instagram_inbound_events",
                )
              ) {
                return {
                  rowCount: 1,
                  rows: [
                    {
                      id: "event-1",
                      tenant_id:
                        "tenant-1",
                      instagram_account_id:
                        "account-1",
                      provider_event_id:
                        "provider-1",
                      instagram_user_id:
                        "user-1",
                      event_type:
                        "message",
                      message_text:
                        "hello",
                      event_at:
                        new Date().toISOString(),
                      payload: {},
                      journey_execution_id:
                        "execution-1",
                      status:
                        "processed",
                      created_at:
                        new Date().toISOString(),
                      processed_at:
                        new Date().toISOString(),
                    },
                  ],
                };
              }

              return {
                rowCount: 0,
                rows: [],
              };
            },
          ),
          connect: vi.fn(),
        } as any;

        const runtime = {
          resumeFromEvent:
            vi.fn(),
        } as any;

        const result =
          await processPersistedInstagramInboundEvent(
            {
              pool,
              runtime,
            },
            "event-1",
          );

        expect(result).toEqual({
          providerEventId:
            "provider-1",
          duplicate: true,
          status: "processed",
          executionId:
            "execution-1",
        });

        expect(
          runtime.resumeFromEvent,
        ).not.toHaveBeenCalled();
      },
    );
  },
);
