import { pool } from "./index";

/** Audit events cannot be edited, deleted, cascaded away, or truncated. */
export async function ensureAuditImmutability(): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION ai_stock_reject_audit_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'Audit records are immutable' USING ERRCODE = '42501';
    END;
    $$;
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'audit_logs_immutable') THEN
        CREATE TRIGGER audit_logs_immutable
          BEFORE UPDATE OR DELETE OR TRUNCATE ON audit_logs
          FOR EACH STATEMENT EXECUTE FUNCTION ai_stock_reject_audit_mutation();
      END IF;
    END;
    $$;
  `);
}
