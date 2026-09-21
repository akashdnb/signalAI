# 2026-09-21 — Fix FK-violation in the customers backfill migration

`1758240000028_create-customers.sql` failed on Render's deploy:

```
error: insert or update on table "leads" violates foreign key constraint "leads_customer_id_fkey"
detail: Key (customer_id)=(...) is not present in table "customers".
```

## Root cause
The backfill ran `update leads set customer_id = gen_random_uuid() ...` **before**
inserting the matching rows into `customers`. The FK isn't deferrable, so it's
checked at the end of that UPDATE statement — which fails immediately, since no
`customers` row exists yet for the freshly generated id.

This wasn't caught locally because the first local test ran the migration against
an empty database (no pre-existing `leads` rows), so the backfill's `where
customer_id is null` matched zero rows and the buggy statement never actually
executed against real data.

## Fix
Reordered: insert into `customers` first, reusing each lead's own `id` as its
customer's `id` (sidesteps needing to correlate a freshly generated UUID back to
a specific lead, which `INSERT ... RETURNING` doesn't guarantee order-wise), then
update `leads.customer_id = id`.

## Verified this time
Built a scratch DB, ran migrations up to (not including) the customers migration,
manually inserted `tenants`/`leads` rows to simulate pre-existing production data,
then ran the fixed migration — backfill correctly linked all 3 leads to matching
customer rows, no orphans, no FK error. Down/up round-trip re-verified with data
present. Full suite (50 files / 355 tests) re-run clean against a fresh migrated DB.

Production was not left in a bad state — node-pg-migrate wraps each migration in
a transaction, so the failed deploy rolled back cleanly; the old build kept serving.
