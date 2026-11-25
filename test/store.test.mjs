import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import { openDb, createStore, neighbor, MISC, normalizeCategory, categoryOf, categoriesOf, groupByCategory } from "../public/store.js";

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


test("normalizeCategory trims; empty and Misc are no category", () => {
  assert.equal(normalizeCategory("  Work  "), "Work");
  assert.equal(normalizeCategory(""), "");
  assert.equal(normalizeCategory("   "), "");
  assert.equal(normalizeCategory(null), "");
  assert.equal(normalizeCategory("Misc"), "");
  assert.equal(normalizeCategory("misc"), "");
  assert.equal(categoryOf({}), MISC);
  assert.equal(categoryOf({ category: "  " }), MISC);
  assert.equal(categoryOf({ category: "Home" }), "Home");
});

test("add stores optional category; whitespace/Misc omitted", async () => {
  const s = await fresh();
  const a = await s.add("milk", "later", "  Groceries  ");
  const b = await s.add("idle", "later");
  const c = await s.add("other", "later", "Misc");
  assert.equal(a.category, "Groceries");
  assert.equal(b.category, undefined);
  assert.equal(c.category, undefined);
  assert.equal((await s.list("later")).find((i) => i.text === "milk").category, "Groceries");
});

test("category survives move, check and uncheck", async () => {
  const s = await fresh();
  const a = await s.add("oil change", "later", "Car");
  await s.move(a.id, "week");
  assert.equal((await s.list("week"))[0].category, "Car");
  await s.check(a.id);
  const [h] = await s.list("history");
  assert.equal(h.category, "Car");
  assert.equal(h.from, "week");
  await s.uncheck(a.id);
  const [back] = await s.list("week");
  assert.equal(back.category, "Car");
  assert.equal(back.completedAt, undefined);
  assert.equal(back.from, undefined);
});

test("setCategory updates or clears; categories() is unique across lists + history", async () => {
  const s = await fresh();
  const a = await s.add("x", "later", "Work");
  await s.add("y", "month", "Home");
  const z = await s.add("z", "week", "work"); // same as Work, different case
  await s.check(z.id);
  assert.deepEqual(await s.categories(), ["Home", "Work"]);
  await s.setCategory(a.id, "  Errands  ");
  assert.equal((await s.list("later"))[0].category, "Errands");
  await s.setCategory(a.id, "  ");
  assert.equal((await s.list("later"))[0].category, undefined);
});

test("groupByCategory: named A–Z, Misc last, input order kept, case-insensitive", () => {
  const items = [
    { text: "n1", category: "Work" },
    { text: "m1" },
    { text: "n2", category: "work" },
    { text: "h1", category: "Home" },
    { text: "m2", category: "  " },
  ];
  const groups = groupByCategory(items);
  assert.deepEqual(groups.map((g) => g.name), ["Home", "Work", "Misc"]);
  assert.deepEqual(groups[1].items.map((i) => i.text), ["n1", "n2"]);
  assert.deepEqual(groups[2].items.map((i) => i.text), ["m1", "m2"]);
  assert.deepEqual(categoriesOf(items), ["Home", "Work"]);
  assert.deepEqual(groupByCategory([{ text: "only" }]).map((g) => g.name), ["Misc"]);
});
