-- Up Migration
-- R4-02 review fix: "single-use" was previously enforced client-side only
-- (clearing the cookie) — the server kept no record of a spent nonce, so
-- the same (state, cookie) pair, if captured by anyone holding both, was
-- still accepted repeatedly inside the state's 10-minute validity window.
create table spent_oauth_nonces (
  nonce text primary key,
  spent_at timestamptz not null default now()
);

-- Down Migration
drop table spent_oauth_nonces;
