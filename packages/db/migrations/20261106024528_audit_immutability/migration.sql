-- Historical audit rows outlive their parents; only expired rows may be purged.
CREATE FUNCTION audit_logs_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_purge', true) = 'on'
     AND OLD.expires_at <= transaction_timestamp() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_logs are append-only; only expired rows may be purged'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
--> statement-breakpoint
ALTER TABLE rate_limit_buckets SET UNLOGGED;
--> statement-breakpoint
CREATE UNIQUE INDEX member_organization_user_unique ON member (organization_id, user_id);
