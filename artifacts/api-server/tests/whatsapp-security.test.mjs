import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { normalizePhone, parseStockCommand, signatureIsValid, verifyBusinessConnection } from "../src/lib/whatsapp-security.ts";

test("stock commands accept explicit non-negative integer updates only", () => {
  assert.deepEqual(parseStockCommand("ADD BATCH-1 12"), { operation: "add", batchNumber: "BATCH-1", quantity: 12 });
  assert.deepEqual(parseStockCommand(" stock MILK/2 0 "), { operation: "set", batchNumber: "MILK/2", quantity: 0 });
  for (const command of ["ADD X -1", "SET X 1.5", "SET X 1e3", "ADD X 1000000000000", "DELETE X 1", "SET X 4 trailing"]) {
    assert.equal(parseStockCommand(command), null, command);
  }
  assert.equal(normalizePhone("+974 5555-1234"), "97455551234");
});

test("webhook signatures bind the original bytes to the configured secret", () => {
  const body = Buffer.from('{"entry":[]}');
  const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
  assert.equal(signatureIsValid(body, signature, "test-secret"), true);
  assert.equal(signatureIsValid(Buffer.from('{"entry":[1]}'), signature, "test-secret"), false);
  assert.equal(signatureIsValid(body, signature, "another-secret"), false);
  for (const bad of [undefined, "sha256=x", "sha256=" + "z".repeat(64), "sha256=" + "0".repeat(62)]) {
    assert.equal(signatureIsValid(body, bad, "test-secret"), false);
  }
  assert.equal(signatureIsValid(body, signature, undefined), false);
});

const input = { phoneNumber: "+974 5555 1234", phoneNumberId: "123", wabaId: "456", accessToken: "test-not-a-real-token" };
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

test("Meta verification confirms account ownership and subscribes the app", async () => {
  const calls = [];
  await verifyBusinessConnection(input, async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.headers.Authorization, `Bearer ${input.accessToken}`);
    return calls.length === 1 ? json({ data: [{ id: "123", display_phone_number: "+97455551234" }] }) : json({ success: true });
  });
  assert.match(calls[0].url, /\/456\/phone_numbers\?/);
  assert.match(calls[1].url, /\/456\/subscribed_apps$/);
  assert.equal(calls[1].method, "POST");
});

test("wrong account or mismatched phone is rejected before subscribing", async () => {
  for (const data of [[], [{ id: "different", display_phone_number: input.phoneNumber }], [{ id: "123", display_phone_number: "+97400000000" }]]) {
    let calls = 0;
    await assert.rejects(verifyBusinessConnection(input, async () => { calls++; return json({ data }); }));
    assert.equal(calls, 1);
  }
});

test("Meta failures are explicit and do not leak response text or tokens", async () => {
  await assert.rejects(verifyBusinessConnection(input, async () => json({ error: { message: input.accessToken } }, 403)), error => {
    assert.match(error.message, /token or its permissions/);
    assert.equal(error.message.includes(input.accessToken), false);
    return true;
  });
  await assert.rejects(verifyBusinessConnection({ ...input, wabaId: "../me" }), /only digits/);
});
