-- Up Migration
-- Replaces the magic-link redirect flow (1758240000022) with an email OTP:
-- a 6-digit code entered on the same page, no top-level browser navigation
-- and no fragment-in-URL session handoff. `magic_link_tokens` is left in
-- place, unread by any code after this change lands — expand/contract
-- (see docs/reviews.md R15-02): dropping it in THIS migration would run
-- during Render's staged rollout overlap, while the previous deploy's code
-- is still reading it. Drop it in a later, follow-up migration once this
-- deploy is confirmed live.
--
-- `attempt_count` is what magic_link_tokens never needed: a magic-link
-- token has 256 bits of entropy, so guessing one is not a real attack.
-- A 6-digit code has only 1,000,000 values, so the verify endpoint itself
-- needs a per-code attempt cap independent of the request-rate limit
-- (which only limits how many codes get ISSUED, not how many guesses a
-- held code can absorb).
create table email_otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  ip text,
  attempt_count int not null default 0,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);
create index email_otp_codes_email_created_idx on email_otp_codes (email, created_at);
create index email_otp_codes_ip_created_idx on email_otp_codes (ip, created_at);

-- Down Migration
drop table email_otp_codes;
