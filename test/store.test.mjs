import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { openDb, createStore, neighbor } from "../public/store.js";

let n = 0;
const fresh = async () => {
  let t = 1000;
  return createStore(await openDb(indexedDB, "t" + n++), () => (t += 10));
};

test("neighbor order Later → Month → Week", () => {
  assert.equal(neighbor("later", 1), "month");
  assert.equal(neighbor("month", 1), "week");
  assert.equal(neighbor("week", 1), null);
  assert.equal(neighbor("later", -1), null);
  assert.equal(neighbor("week", -1), "month");
  assert.equal(neighbor("history", 1), null);
});

test("add trims, rejects empty / bad list, newest first", async () => {
  const s = await fresh();
  assert.equal(await s.add("   ", "later"), null);
  assert.equal(await s.add("x", "history"), null);
  await s.add("  a ", "later");
  await s.add("b", "later");
  assert.deepEqual((await s.list("later")).map((i) => i.text), ["b", "a"]);
});

test("move swaps lists and tops the target", async () => {
  const s = await fresh();
  const a = await s.add("a", "later");
  await s.add("b", "month");
  await s.move(a.id, "month");
  assert.equal((await s.list("later")).length, 0);
  assert.deepEqual((await s.list("month")).map((i) => i.text), ["a", "b"]);
});

test("check → history stores completedAt + from only; uncheck returns it", async () => {
  const s = await fresh();
  const a = await s.add("a", "week");
  await s.check(a.id);
  assert.equal((await s.list("week")).length, 0);
  const [h] = await s.list("history");
  assert.equal(h.from, "week");
  assert.equal(typeof h.completedAt, "number");
  await s.uncheck(a.id);
  assert.equal((await s.list("history")).length, 0);
  const [back] = await s.list("week");
  assert.equal(back.text, "a");
  assert.equal(back.completedAt, undefined);
  assert.equal(back.from, undefined);
});

test("history newest completion first; move ignores history items; remove works", async () => {
  const s = await fresh();
  const a = await s.add("a", "later");
  const b = await s.add("b", "later");
  await s.check(a.id);
  await s.check(b.id);
  assert.deepEqual((await s.list("history")).map((i) => i.text), ["b", "a"]);
  await s.move(a.id, "week");
  assert.equal((await s.list("week")).length, 0);
  await s.remove(a.id);
  assert.equal((await s.all()).length, 1);
});

test("data persists across reopen", async () => {
  const name = "persist" + n++;
  let s = createStore(await openDb(indexedDB, name));
  await s.add("keep me", "month");
  s = createStore(await openDb(indexedDB, name));
  assert.equal((await s.list("month"))[0].text, "keep me");
});
