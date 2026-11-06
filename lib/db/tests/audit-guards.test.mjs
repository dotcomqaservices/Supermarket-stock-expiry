import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

test("audit records reject updates and deletes; tenant foreign keys remain enforced", async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const { rows: [store] } = await client.query(`INSERT INTO stores
      (name,branch_label,address,contact_name,contact_phone,contact_email,whatsapp_phone)
      VALUES ('Audit guard test','test','Test address','Test admin','+97400000000','audit@example.invalid','+97400000000') RETURNING id`);
    const { rows: [audit] } = await client.query(`INSERT INTO audit_logs
      (store_id,action,target_type,target_label,actor_user_id,actor_name)
      VALUES ($1,'staff.created','staff','Test staff','test-admin','Test admin') RETURNING id`, [store.id]);
    for (const statement of ["UPDATE audit_logs SET actor_name='changed' WHERE id=$1", "DELETE FROM audit_logs WHERE id=$1"]) {
      await client.query("SAVEPOINT guard_check");
      await assert.rejects(client.query(statement, [audit.id]), error => error.code === "42501");
      await client.query("ROLLBACK TO SAVEPOINT guard_check");
    }
    const { rows: [unchanged] } = await client.query("SELECT actor_name FROM audit_logs WHERE id=$1", [audit.id]);
    assert.equal(unchanged.actor_name, "Test admin");
    await client.query("SAVEPOINT fk_check");
    await assert.rejects(client.query(`INSERT INTO audit_logs
      (store_id,action,target_type,target_label,actor_user_id,actor_name)
      VALUES ('00000000-0000-0000-0000-000000000000','test','test','test','test','test')`), error => error.code === "23503");
    await client.query("ROLLBACK TO SAVEPOINT fk_check");
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});
