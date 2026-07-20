-- 0029_call_review_rep_name.sql
-- Additive. The real sellers live in AmoCRM's "Menejer" custom field (a name),
-- not as app-user accounts. Store that name on a call review so the analyzer can
-- attribute a call to a real CRM seller without pre-provisioning users.
-- rep_user_id stays (optional) for when a review is tied to an app user.

ALTER TABLE call_reviews ADD COLUMN IF NOT EXISTS rep_name TEXT;

CREATE INDEX IF NOT EXISTS idx_call_reviews_rep_name ON call_reviews(rep_name);
