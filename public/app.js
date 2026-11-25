import { LISTS, PAGES, LABELS, neighbor, openDb, createStore } from "./store.js";

const $ = (id) => document.getElementById(id);
const listEl = $("list"), titleEl = $("title");
const addDialog = $("addDialog"), addInput = $("addInput"), addForm = $("addForm");
const menuDialog = $("menuDialog"), menuBody = $("menuBody");
const COLORS = { later: "var(--later)", month: "var(--month)", week: "var(--week)" };

let store;
let page = "later";

const currentPage = () => {
  const h = location.hash.slice(1);
  return PAGES.includes(h) ? h : "later";
};

// ---------- rendering ----------
const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function renderItem(it) {
  const isHistory = it.list === "history";
  const wrap = el("div", "item" + (isHistory ? " done" : ""));
  wrap.dataset.id = it.id;
  wrap.dataset.list = it.list;

  if (!isHistory) {
    const next = neighbor(it.list, 1), prev = neighbor(it.list, -1);
    if (next) { const h = el("div", "hint right", `${LABELS[next]} →`); h.style.background = COLORS[next]; wrap.append(h); }
    if (prev) { const h = el("div", "hint left", `← ${LABELS[prev]}`); h.style.background = COLORS[prev]; wrap.append(h); }
  }

  const card = el("div", "card");
  const box = el("label", "check");
  const cb = el("input");
  cb.type = "checkbox";
  cb.checked = isHistory;
  cb.setAttribute("aria-label", isHistory ? `Uncheck ${it.text}` : `Complete ${it.text}`);
  cb.addEventListener("change", () => toggle(it, wrap));
  box.append(cb);

  const text = el("div", "text");
  text.append(document.createTextNode(it.text));
  if (isHistory) {
    const meta = el("span", "meta");
    meta.append(document.createTextNode(fmt.format(new Date(it.completedAt)) + " · from "));
    meta.append(el("span", "badge " + it.from, LABELS[it.from] ?? it.from));
    text.append(meta);
  }

  const more = el("button", "more", "⋯");
  more.type = "button";
  more.setAttribute("aria-label", "More options");
  more.addEventListener("click", () => openMenu(it));

  card.append(box, text, more);
  wrap.append(card);
  if (!isHistory) attachSwipe(wrap, card, it);
  return wrap;
}

async function render() {
  page = currentPage();
  titleEl.textContent = LABELS[page];
  document.title = `${LABELS[page]} · simple-to-do`;
  document.querySelectorAll(".tabs a").forEach((a) => {
    if (a.dataset.page === page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const items = await store.list(page);
  if (page !== currentPage()) return; // navigated away while loading
  listEl.replaceChildren();
  if (!items.length) {
    listEl.append(el("div", "empty", page === "history" ? "Nothing completed yet." : "Nothing here. Tap + to add something."));
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((it) => frag.append(renderItem(it)));
  listEl.append(frag);
}

let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) { t = el("div", "toast"); t.setAttribute("role", "status"); document.body.append(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

// ---------- actions ----------
function leave(wrap) {
  wrap.style.maxHeight = wrap.offsetHeight + "px";
  void wrap.offsetHeight;
  wrap.classList.add("leaving");
  return new Promise((r) => setTimeout(r, 330));
}

async function toggle(it, wrap) {
  if (it.list === "history") await store.uncheck(it.id);
  else await store.check(it.id);
  await leave(wrap);
  render();
}

async function moveTo(it, list, wrap) {
  await store.move(it.id, list);
  if (wrap) await leave(wrap);
  render();
  toast(`Moved to ${LABELS[list]}`);
}

function openMenu(it) {
  if (menuDialog.open) return;
  menuBody.replaceChildren(el("h2", null, it.text));
  if (it.list !== "history") {
    for (const l of LISTS) {
      if (l === it.list) continue;
      const b = el("button", "opt", `Move to ${LABELS[l]}`);
      b.type = "button";
      b.addEventListener("click", () => { menuDialog.close(); moveTo(it, l, listEl.querySelector(`[data-id="${it.id}"]`)); });
      menuBody.append(b);
    }
  }
  const del = el("button", "opt danger", "Delete");
  del.type = "button";
  del.addEventListener("click", async () => { menuDialog.close(); await store.remove(it.id); render(); });
  const cancel = el("button", "opt", "Cancel");
  cancel.type = "button";
  cancel.addEventListener("click", () => menuDialog.close());
  menuBody.append(del, cancel);
  menuDialog.showModal();
}

// ---------- swipe / drag (touch + mouse via pointer events) ----------
function attachSwipe(wrap, card, it) {
  const next = neighbor(it.list, 1), prev = neighbor(it.list, -1);
  const hintR = wrap.querySelector(".hint.right"), hintL = wrap.querySelector(".hint.left");
  let sx = 0, sy = 0, id = null, dragging = false, pressTimer = null, dx = 0;

  const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null; };
  const reset = () => {
    cancelPress();
    id = null; dragging = false; dx = 0;
    wrap.classList.remove("dragging");
    card.style.transform = "";
    if (hintR) hintR.style.opacity = 0;
    if (hintL) hintL.style.opacity = 0;
  };

  card.addEventListener("pointerdown", (e) => {
    if (id !== null || (e.button !== undefined && e.button > 0)) return;
    if (e.target.closest(".check, .more")) return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = 0;
    pressTimer = setTimeout(() => { pressTimer = null; const was = id; reset(); if (was !== null) openMenu(it); }, 550);
  });

  card.addEventListener("pointermove", (e) => {
    if (e.pointerId !== id) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!dragging) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) { reset(); return; } // vertical scroll
      if (Math.abs(mx) < 8) return;
      dragging = true;
      cancelPress();
      wrap.classList.add("dragging");
      try { card.setPointerCapture(id); } catch {}
    }
    const allowed = mx > 0 ? next : prev;
    dx = allowed ? mx : Math.sign(mx) * Math.min(Math.abs(mx) * 0.25, 28); // rubber band at the ends
    card.style.transform = `translateX(${dx}px)`;
    const p = allowed ? Math.min(Math.abs(mx) / 80, 1) : 0;
    if (hintR) hintR.style.opacity = mx > 0 ? 0.35 + 0.65 * p : 0;
    if (hintL) hintL.style.opacity = mx < 0 ? 0.35 + 0.65 * p : 0;
  });

  const end = (e) => {
    if (e.pointerId !== id) return;
    const wasDragging = dragging, mx = dx;
    const target = mx > 0 ? next : mx < 0 ? prev : null;
    const threshold = Math.max(80, wrap.offsetWidth * 0.3);
    if (wasDragging && e.type === "pointerup" && target && Math.abs(mx) >= threshold) {
      cancelPress(); id = null; dragging = false;
      wrap.classList.remove("dragging");
      card.style.transform = `translateX(${Math.sign(mx) * wrap.offsetWidth}px)`;
      setTimeout(() => moveTo(it, target, wrap), 150);
    } else reset();
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
  card.addEventListener("lostpointercapture", (e) => { if (e.pointerId === id && !dragging) reset(); });
  card.addEventListener("contextmenu", (e) => { e.preventDefault(); reset(); openMenu(it); });
}

// ---------- add modal ----------
function openAdd() {
  addInput.value = "";
  addDialog.showModal();
  addInput.focus();
}
$("add").addEventListener("click", openAdd);
$("addCancel").addEventListener("click", () => addDialog.close());
addDialog.addEventListener("click", (e) => { if (e.target === addDialog) addDialog.close(); });
menuDialog.addEventListener("click", (e) => { if (e.target === menuDialog) menuDialog.close(); });
addForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = addInput.value.trim();
  if (!text) { addInput.focus(); return; }
  const list = page === "history" ? "later" : page;
  await store.add(text, list);
  addDialog.close();
  if (page === "history") toast("Added to Later");
  render();
});

// ---------- boot ----------
async function boot() {
  store = createStore(await openDb());
  addEventListener("hashchange", render);
  await render();
  navigator.storage?.persist?.().catch(() => {});
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
boot();
