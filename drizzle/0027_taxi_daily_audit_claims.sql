-- One on-demand taxi audit per Eastern calendar day, regardless of homepage traffic.
-- No cron job is added. Commissioner reruns are independent of this claim.
CREATE TABLE IF NOT EXISTS taxi_daily_audit_claims (
  day_et date PRIMARY KEY,
  claim_id varchar(36) NOT NULL,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status varchar(16) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'complete', 'failed'))
);
