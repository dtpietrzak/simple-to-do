// IndexedDB-backed list logic. No DOM here so it can be tested in Node.
export const LISTS = ["later", "month", "week"];
export const PAGES = [...LISTS, "history"];
export const LABELS = { later: "Later", month: "Month", week: "Week", history: "History" };
export const MISC = "Misc";

/** Neighbouring list in Later → Month → Week order, or null at the ends. dir: +1 | -1 */
export function neighbor(list, dir) {
  const i = LISTS.indexOf(list);
  if (i < 0) return null;
  return LISTS[i + dir] ?? null;
}

/** Trim; empty or "misc" (any case) means no category. */
export function normalizeCategory(category) {
  const c = String(category ?? "").trim();
  return c && c.toLowerCase() !== "misc" ? c : "";
}

export function categoryOf(it) {
  return normalizeCategory(it?.category) || MISC;
}

/** Distinct named categories (case-insensitive, first-seen spelling), A–Z. */
export function categoriesOf(items) {
  const seen = new Map();
  for (const it of items) {
    const c = normalizeCategory(it?.category);
    if (!c) continue;
    const k = c.toLowerCase();
    if (!seen.has(k)) seen.set(k, c);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Group items by category, keeping input order within each group. Named A–Z, Misc last. */
export function groupByCategory(items) {
  const groups = new Map();
  const labels = new Map();
  for (const it of items) {
    const raw = normalizeCategory(it?.category);
    const key = raw ? raw.toLowerCase() : "\0misc";
    if (!groups.has(key)) {
      groups.set(key, []);
      labels.set(key, raw || MISC);
    }
    groups.get(key).push(it);
  }
  const keys = [...groups.keys()]
    .filter((k) => k !== "\0misc")
    .sort((a, b) => labels.get(a).localeCompare(labels.get(b), undefined, { sensitivity: "base" }));
  if (groups.has("\0misc")) keys.push("\0misc");
  return keys.map((k) => ({ name: labels.get(k), items: groups.get(k) }));
}

const STORE = "items";

export function openDb(idb = globalThis.indexedDB, name = "simple-to-do") {
  return new Promise((resolve, reject) => {
    const req = idb.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      const s = db.createObjectStore(STORE, { keyPath: "id" });
      s.createIndex("list", "list");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const newId = () =>
  globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);

const withCategory = (item, category) => {
  const cat = normalizeCategory(category);
  if (cat) item.category = cat;
  else delete item.category;
  return item;
};

// Item shape: { id, text, list: "later"|"month"|"week"|"history", order, category?, completedAt?, from? }
// `category` is omitted when unset (shown as Misc). `order` sorts newest-first inside a list.
// History is sorted by completedAt. category is kept through moves, check and uncheck.
export function createStore(db, now = () => Date.now()) {
  let lastOrder = 0;
  const nextOrder = () => (lastOrder = Math.max(now(), lastOrder + 1));

  async function mutate(id, fn) {
    const tx = db.transaction(STORE, "readwrite");
    const os = tx.objectStore(STORE);
    const item = await wrap(os.get(id));
    if (item) {
      const next = fn(item);
      if (next) os.put(next);
      else os.delete(id);
    }
    await done(tx);
    return item;
  }

  return {
    async all() {
      return wrap(db.transaction(STORE).objectStore(STORE).getAll());
    },
    async list(name) {
      const items = await wrap(db.transaction(STORE).objectStore(STORE).index("list").getAll(name));
      return name === "history"
        ? items.sort((a, b) => b.completedAt - a.completedAt)
        : items.sort((a, b) => b.order - a.order);
    },
    async categories() {
      return categoriesOf(await this.all());
    },
    async add(text, list, category) {
      text = String(text ?? "").trim();
      if (!text || !LISTS.includes(list)) return null;
      const item = withCategory({ id: newId(), text, list, order: nextOrder() }, category);
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).add(item);
      await done(tx);
      return item;
    },
    /** Move an item between Later / Month / Week; it lands at the top of the target. */
    move(id, list) {
      if (!LISTS.includes(list)) return Promise.resolve();
      return mutate(id, (it) => (it.list === "history" || it.list === list ? it : { ...it, list, order: nextOrder() }));
    },
    setCategory(id, category) {
      return mutate(id, (it) => withCategory({ ...it }, category));
    },
    /** Check off: goes to History remembering when it was done, where it came from, and its category. */
    check(id) {
      return mutate(id, (it) => {
        if (it.list === "history") return it;
        return withCategory(
          { id: it.id, text: it.text, order: it.order, list: "history", from: it.list, completedAt: now() },
          it.category
        );
      });
    },
    /** Uncheck in History: returns to the list it came from, category intact. */
    uncheck(id) {
      return mutate(id, (it) => {
        if (it.list !== "history") return it;
        const { completedAt, from, ...rest } = it;
        return { ...rest, list: LISTS.includes(from) ? from : "later" };
      });
    },
    remove(id) {
      return mutate(id, () => null);
    },
  };
}
