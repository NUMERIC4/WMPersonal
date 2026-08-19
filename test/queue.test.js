import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { queueFetch, selectNextQueuedRequest } from "../backend/queue.js";

test("queue selector moves high priority ahead of waiting low priority", () => {
  const now = Date.now();
  const queue = [
    { priority: "low", enqueuedAt: now },
    { priority: "normal", enqueuedAt: now },
    { priority: "high", enqueuedAt: now },
  ];

  assert.equal(selectNextQueuedRequest(queue, now), 2);
});

test("queue selector prevents permanent low-priority starvation", () => {
  const now = Date.now();
  const queue = [
    { priority: "high", enqueuedAt: now },
    { priority: "low", enqueuedAt: now - 31000 },
  ];

  assert.equal(selectNextQueuedRequest(queue, now), 1);
});

test("queueFetch rejects a request that hangs instead of waiting forever", async () => {
  const server = http.createServer(() => {});
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const { port } = server.address();
    const result = await Promise.race([
      queueFetch(`http://127.0.0.1:${port}/slow`, { timeoutMs: 250 }).then(
        () => ({ ok: true }),
        (error) => ({ ok: false, error })
      ),
      new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: new Error("did_not_reject") }), 800)),
    ]);

    assert.equal(result.ok, false, "expected the hung request to fail fast");
    assert.ok(result.error instanceof Error);
    assert.match(result.error.message, /timed out|timeout|abort|AbortError/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
