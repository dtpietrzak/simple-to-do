// IndexedDB-backed list logic. No DOM here so it can be tested in Node.
export const LISTS = ["later", "month", "week"];
export const PAGES = [...LISTS, "history"];
export const LABELS = { later: "Later", month: "Month", week: "Week", history: "History" };

/** Neighbouring list in Later → Month → Week order, or null at the ends. dir: +1 | -1 */
export function neighbor(list, dir) {
  const i = LISTS.indexOf(list);
  if (i < 0) return null;
  return LISTS[i + dir] ?? null;
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

// Item shape: { id, text, list: "later"|"month"|"week"|"history", order, completedAt?, from? }
// `order` sorts newest-first inside a list. History is sorted by completedAt.
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
    async add(text, list) {
      text = String(text ?? "").trim();
      if (!text || !LISTS.includes(list)) return null;
      const item = { id: newId(), text, list, order: nextOrder() };
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
    /** Check off: goes to History remembering only when it was done and where it came from. */
    check(id) {
      return mutate(id, (it) =>
        it.list === "history" ? it : { id: it.id, text: it.text, order: it.order, list: "history", from: it.list, completedAt: now() }
      );
    },
    /** Uncheck in History: returns to the list it came from. */
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
