-- Append-only guarantees for history / audit tables.
-- Rows can be INSERTed and read; UPDATE and DELETE raise an error.
-- (TRUNCATE is statement-level and is restricted through DB grants in production.)
CREATE OR REPLACE FUNCTION forbid_append_only_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only (% not allowed)', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER sensitive_access_logs_append_only BEFORE UPDATE OR DELETE ON sensitive_access_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER order_status_history_append_only BEFORE UPDATE OR DELETE ON order_status_history
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
CREATE TRIGGER delivery_status_history_append_only BEFORE UPDATE OR DELETE ON delivery_status_history
  FOR EACH ROW EXECUTE FUNCTION forbid_append_only_mutation();
--> statement-breakpoint
-- Latitude / longitude sanity checks for every geo-located table.
ALTER TABLE addresses ADD CONSTRAINT addresses_lat_lng_chk
  CHECK ((latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
--> statement-breakpoint
ALTER TABLE pharmacies ADD CONSTRAINT pharmacies_lat_lng_chk
  CHECK ((latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180));
--> statement-breakpoint
ALTER TABLE drivers ADD CONSTRAINT drivers_lat_lng_chk
  CHECK ((current_latitude IS NULL OR current_latitude BETWEEN -90 AND 90) AND (current_longitude IS NULL OR current_longitude BETWEEN -180 AND 180));
