-- Up Migration
update campaign_instagram_accounts cia
   set enabled = (mt.status = 'healthy'),
       updated_at = now()
  from meta_tokens mt
 where cia.meta_token_id = mt.id;

-- Down Migration
-- No rollback: this migration synchronizes derived binding state with the
-- durable account health state, and restoring the previous values would be
-- unsafe after a disconnect or token health transition.
