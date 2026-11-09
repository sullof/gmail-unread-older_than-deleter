/*
 * Pannello su Gmail: seleziona la pagina della ricerca aperta e la sposta
 * nel Cestino, attende 5 secondi, ripete. Non elimina in modo definitivo.
 */
(() => {
  if (globalThis.__gmailCestino) return;
  globalThis.__gmailCestino = true;

  function t(key, substitutions) {
    const message = chrome.i18n.getMessage(key, substitutions || []);
    return message || key;
  }

  const PAUSE_MS = 5000;
  const MAX_MISSES = 3;
  const BLOCKED_TOKENS = [
    "in:trash",
    "in:spam",
    "in:sent",
    "in:draft",
    "in:drafts",
    "is:starred",
    "is:important",
  ];

  const state = {
    running: false,
    collapsed: false,
    stickyStatus: false,
    status: t("checkingSearch"),
    query: "",
    batches: 0,
    rows: 0,
    misses: 0,
  };

  let generation = 0;
  const ui = {};

  function tokensOf(query) {
    return query.toLowerCase().split(/\s+/).filter(Boolean);
  }

  function olderThanDays(tokens) {
    const token = tokens.find((part) => /^older_than:\d+[dmy]$/.test(part));
    if (!token) return 0;
    const match = token.match(/^older_than:(\d+)([dmy])$/);
    const amount = Number(match[1]);
    if (match[2] === "m") return amount * 30;
    if (match[2] === "y") return amount * 365;
    return amount;
  }

  function queryFromHash() {
    const hash = location.hash;
    const marker = "#search/";
    const at = hash.indexOf(marker);
    if (at === -1) return "";
    let raw = hash.slice(at + marker.length);
    const cut = raw.search(/[?&]/);
    if (cut !== -1) raw = raw.slice(0, cut);
    try {
      return decodeURIComponent(raw.replace(/\+/g, " ")).trim();
    } catch {
      return raw.replace(/\+/g, " ").trim();
    }
  }

  function inputQuery() {
    const inputs = [...document.querySelectorAll('input[name="q"]')];
    const input = inputs.find(visible) || inputs[0];
    return input?.value?.trim() || "";
  }

  function dangerousView() {
    return /^#(trash|spam|sent|drafts|starred|imp|important)(\/|$|\?)/.test(
      location.hash.toLowerCase(),
    );
  }

  function blockReason() {
    if (dangerousView()) return t("dangerousView");
    if (!location.hash.toLowerCase().includes("#search/")) return t("needSearch");
    const query = queryFromHash();
    const tokens = tokensOf(query);
    if (!tokens.includes("is:unread") || tokens.includes("-is:unread")) return t("missingUnread");
    if (olderThanDays(tokens) < 90) return t("needOlderThan");
    const blocked = BLOCKED_TOKENS.find((token) => tokens.includes(token));
    if (blocked) return t("blockedToken", [blocked]);
    const typed = inputQuery();
    if (typed && typed !== query) {
      const typedTokens = tokensOf(typed);
      const typedBlocked = BLOCKED_TOKENS.find((token) => typedTokens.includes(token));
      if (
        !typedTokens.includes("is:unread") ||
        typedTokens.includes("-is:unread") ||
        olderThanDays(typedTokens) < 90 ||
        typedBlocked
      ) {
        return t("queryMismatch");
      }
    }
    return "";
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findRows() {
    const main = document.querySelector('[role="main"]') || document.body;
    const seen = new Set();
    const rows = [];
    for (const row of main.querySelectorAll('tr.zA, tr[role="row"]')) {
      if (seen.has(row) || !visible(row) || row.closest("[gh='tm']")) continue;
      if (!row.querySelector('[role="checkbox"]')) continue;
      seen.add(row);
      rows.push(row);
    }
    return rows;
  }

  function rowKey(row) {
    const carrier = row.matches("[data-legacy-thread-id], [data-thread-id]")
      ? row
      : row.querySelector("[data-legacy-thread-id], [data-thread-id]");
    return (
      carrier?.getAttribute("data-legacy-thread-id") ||
      carrier?.getAttribute("data-thread-id") ||
      row.getAttribute("id") ||
      row.innerText.slice(0, 120)
    );
  }

  function signature(rows) {
    return rows.map(rowKey).join("|");
  }

  function rowCheckbox(row) {
    return row.querySelector('[role="checkbox"]');
  }

  function countCheckedRows() {
    return findRows().filter((row) => rowCheckbox(row)?.getAttribute("aria-checked") === "true").length;
  }

  function isLoading() {
    return [...document.querySelectorAll('[role="progressbar"]')].some(visible);
  }

  function listLooksEmpty() {
    const main = document.querySelector('[role="main"]');
    const text = main?.innerText || "";
    return /no (messages|conversations) matched|did not match any|nessun\w* (messaggio|conversazione)|non ha trovato|non corrisponde/i.test(
      text,
    );
  }

  function dialogOpen() {
    return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(visible);
  }

  function findListToolbar() {
    const toolbars = [...document.querySelectorAll("[gh='tm']")].filter(visible);
    if (!toolbars.length) return null;
    const rows = findRows();
    if (!rows.length) return toolbars[0];
    const rowTop = rows[0].getBoundingClientRect().top;
    const above = toolbars.filter((toolbar) => toolbar.getBoundingClientRect().bottom <= rowTop + 8);
    const pool = above.length ? above : toolbars;
    pool.sort((a, b) => {
      const da = Math.abs(rowTop - a.getBoundingClientRect().bottom);
      const db = Math.abs(rowTop - b.getBoundingClientRect().bottom);
      return da - db;
    });
    return pool[0];
  }

  function geometricCandidates(root, selector) {
    if (!root) return [];
    const rows = findRows();
    const rowTop = rows[0]?.getBoundingClientRect().top ?? 240;
    return [...root.querySelectorAll(selector)].filter((el) => {
      if (!visible(el) || el.closest("tr")) return false;
      const top = el.getBoundingClientRect().top;
      return top < rowTop && rowTop - top < 180;
    });
  }

  function findSelectCheckbox() {
    const pick = (root) => {
      const boxes = geometricCandidates(root, '[role="checkbox"]');
      boxes.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      return boxes[0] || null;
    };
    return pick(findListToolbar()) || pick(document.querySelector('[role="main"]'));
  }

  function isTrashButton(el) {
    const label = (el.getAttribute("aria-label") || el.getAttribute("data-tooltip") || "").trim();
    return label === "Delete" || label === "Elimina";
  }

  function findDeleteButton() {
    const pick = (root) => geometricCandidates(root, '[role="button"]').find(isTrashButton) || null;
    return pick(findListToolbar()) || pick(document.querySelector('[role="main"]'));
  }

  function realClick(el) {
    if (!el || !el.isConnected) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
    }
    const next = el.getBoundingClientRect();
    const x = next.left + Math.min(next.width / 2, 16);
    const y = next.top + next.height / 2;
    const base = (buttons) => ({
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      button: 0,
      buttons,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      width: 1,
      height: 1,
      pressure: buttons ? 0.5 : 0,
    });
    el.dispatchEvent(new PointerEvent("pointerover", base(0)));
    el.dispatchEvent(new MouseEvent("mouseover", base(0)));
    el.dispatchEvent(new PointerEvent("pointermove", base(0)));
    el.dispatchEvent(new MouseEvent("mousemove", base(0)));
    el.dispatchEvent(new PointerEvent("pointerdown", base(1)));
    el.dispatchEvent(new MouseEvent("mousedown", base(1)));
    el.dispatchEvent(new PointerEvent("pointerup", base(0)));
    el.dispatchEvent(new MouseEvent("mouseup", base(0)));
    el.dispatchEvent(new MouseEvent("click", { ...base(0), detail: 1 }));
  }

  function clickMenuAllIfOpen() {
    for (const menu of [...document.querySelectorAll('[role="menu"]')].filter(visible)) {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      const labels = items.map((item) => item.textContent.trim().toLowerCase());
      const english = labels.includes("all") && labels.includes("none") && labels.includes("read");
      const italian = labels.includes("tutti") && labels.includes("nessuno");
      if (!english && !italian) continue;
      const all = items.find((item) => /^(all|tutti)$/i.test(item.textContent.trim()));
      if (!all) continue;
      realClick(all);
      return true;
    }
    return false;
  }

  function alive(gen) {
    return gen === generation;
  }

  function sleep(ms, gen) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (!alive(gen) || Date.now() - started >= ms) {
          resolve();
          return;
        }
        setTimeout(tick, 100);
      };
      setTimeout(tick, Math.min(100, ms));
    });
  }

  async function waitWhileHidden(gen) {
    while (alive(gen) && document.hidden) {
      state.status = t("pausedHidden");
      render();
      await sleep(500, gen);
    }
  }

  async function selectPage(gen) {
    const total = findRows().length;
    if (!total) return 0;
    if (countCheckedRows() === total) return total;

    const checkbox = findSelectCheckbox();
    if (checkbox && checkbox.getAttribute("aria-checked") !== "true") {
      realClick(checkbox);
      await sleep(500, gen);
    }
    if (clickMenuAllIfOpen()) await sleep(400, gen);

    if (countCheckedRows() === 0 && alive(gen)) {
      const again = findSelectCheckbox();
      if (again && again.getAttribute("aria-checked") !== "true") {
        realClick(again);
        await sleep(500, gen);
      }
    }
    if (clickMenuAllIfOpen()) await sleep(300, gen);
    if (countCheckedRows() === findRows().length && countCheckedRows() > 0) return countCheckedRows();

    for (const row of findRows()) {
      if (!alive(gen)) return 0;
      const checkbox = rowCheckbox(row);
      if (checkbox && checkbox.getAttribute("aria-checked") !== "true") {
        realClick(checkbox);
        await sleep(40, gen);
      }
    }
    await sleep(300, gen);
    return countCheckedRows();
  }

  async function settle(before, gen) {
    const deadline = Date.now() + 10000;
    while (alive(gen) && Date.now() < deadline) {
      const rows = findRows();
      if (rows.length === 0) return "empty";
      if (signature(rows) !== before) return "next";
      await sleep(400, gen);
    }
    if (!alive(gen)) return "stopped";
    const rows = findRows();
    if (rows.length === 0) return "empty";
    return signature(rows) !== before ? "next" : "same";
  }

  function finish(message) {
    generation += 1;
    state.running = false;
    state.stickyStatus = true;
    state.status = message;
    render();
  }

  function miss(gen, reasonKey) {
    state.misses += 1;
    const reason = t(reasonKey);
    if (state.misses >= MAX_MISSES) {
      finish(t("stoppedAfterTries", [reason, String(MAX_MISSES)]));
      return false;
    }
    state.status = t("retrying", [reason, String(state.misses), String(MAX_MISSES)]);
    render();
    console.info("[gmail-cestino]", state.status);
    return alive(gen);
  }

  async function loop(gen) {
    let emptyPasses = 0;
    while (alive(gen)) {
      await waitWhileHidden(gen);
      if (!alive(gen)) return;

      const reason = blockReason();
      state.query = queryFromHash();
      if (reason) {
        finish(t("stoppedBecause", [reason]));
        return;
      }
      if (dialogOpen()) {
        finish(t("dialogOpen"));
        return;
      }

      state.status = t("lookingForRows");
      render();
      const rows = findRows();
      if (!rows.length) {
        emptyPasses += 1;
        const limit = isLoading() ? 20 : 8;
        if ((listLooksEmpty() && emptyPasses >= 2) || emptyPasses >= limit) {
          finish(t("finished", [String(state.batches), String(state.rows)]));
          return;
        }
        state.status = t("waitingForList");
        render();
        await sleep(1000, gen);
        continue;
      }
      emptyPasses = 0;

      const before = signature(rows);
      state.status = t("selectingRows", [String(rows.length)]);
      render();
      const selected = await selectPage(gen);
      if (!alive(gen)) return;
      if (!selected) {
        if (!miss(gen, "cannotSelect")) return;
        await sleep(PAUSE_MS, gen);
        continue;
      }

      await sleep(400, gen);
      if (!alive(gen)) return;
      if (dialogOpen()) {
        finish(t("dialogBeforeDelete"));
        return;
      }

      const trash = findDeleteButton();
      const selectedNow = countCheckedRows();
      if (!trash || selectedNow === 0) {
        if (!miss(gen, "noDeleteButton")) return;
        await sleep(PAUSE_MS, gen);
        continue;
      }

      state.status = t("trashing", [String(selectedNow)]);
      render();
      console.info("[gmail-cestino]", state.status, state.query);
      realClick(trash);
      state.batches += 1;
      state.rows += selectedNow;
      state.status = t("waitingFive");
      render();
      await sleep(PAUSE_MS, gen);
      if (!alive(gen)) return;

      const outcome = await settle(before, gen);
      if (!alive(gen) || outcome === "stopped") return;
      if (outcome === "same") {
        state.batches = Math.max(0, state.batches - 1);
        state.rows = Math.max(0, state.rows - selectedNow);
        if (!miss(gen, "listUnchanged")) return;
        continue;
      }
      state.misses = 0;
    }
  }

  function onStart() {
    if (state.running) return;
    const reason = blockReason();
    state.query = queryFromHash();
    if (reason) {
      state.stickyStatus = true;
      state.status = reason;
      render();
      return;
    }
    const accepted = confirm(t("confirm", [state.query]));
    if (!accepted) return;

    state.running = true;
    state.stickyStatus = false;
    state.misses = 0;
    state.batches = 0;
    state.rows = 0;
    state.status = t("started");
    const gen = ++generation;
    render();
    void loop(gen);
  }

  function onStop() {
    if (!state.running) return;
    finish(t("stoppedManual"));
  }

  function render() {
    if (!ui.panel) return;
    const reason = blockReason();
    const safe = reason === "";
    state.query = queryFromHash();
    ui.panel.hidden = state.collapsed;
    ui.pill.hidden = !state.collapsed;
    ui.query.textContent = state.query || "—";
    ui.status.textContent = state.status;
    ui.counts.textContent = t("counts", [String(state.batches), String(state.rows)]);
    ui.start.disabled = state.running || !safe;
    ui.stop.disabled = !state.running;
    ui.pill.textContent = state.running ? t("pillRunning", [String(state.rows)]) : t("pillIdle");
  }

  function mount() {
    if (document.getElementById("gmail-cestino-host")) return;
    const host = document.createElement("div");
    host.id = "gmail-cestino-host";
    host.style.setProperty("position", "fixed", "important");
    host.style.setProperty("right", "16px", "important");
    host.style.setProperty("bottom", "16px", "important");
    host.style.setProperty("z-index", "2147483647", "important");
    host.style.setProperty("width", "auto", "important");
    host.style.setProperty("pointer-events", "none", "important");
    for (const type of ["mousedown", "mouseup", "click", "pointerdown", "pointerup"]) {
      host.addEventListener(type, (event) => event.stopPropagation());
    }

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        * { box-sizing: border-box; }
        button, div { font: 13px/1.4 ui-sans-serif, system-ui, sans-serif; }
        .panel {
          width: 300px;
          pointer-events: auto;
          background: #fff;
          color: #202124;
          border: 1px solid #dadce0;
          border-radius: 12px;
          box-shadow: 0 8px 28px rgba(32, 33, 36, 0.18);
          padding: 12px;
        }
        .head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        h2 { margin: 0; font-size: 14px; font-weight: 650; }
        .link {
          border: 0; background: transparent; color: #1a73e8; padding: 0; cursor: pointer;
        }
        .query {
          margin-top: 8px;
          background: #f1f3f4;
          border-radius: 8px;
          padding: 6px 8px;
          word-break: break-word;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 12px;
        }
        .status { margin-top: 8px; min-height: 2.8em; }
        .counts { color: #5f6368; }
        .actions { display: flex; gap: 8px; margin-top: 10px; }
        .actions button {
          flex: 1;
          border: 0;
          border-radius: 8px;
          padding: 8px 10px;
          cursor: pointer;
        }
        .actions button:disabled { opacity: 0.45; cursor: default; }
        .start { background: #1a73e8; color: #fff; }
        .stop { background: #fce8e6; color: #c5221f; }
        .note { margin: 8px 0 0; color: #5f6368; font-size: 12px; }
        .pill {
          pointer-events: auto;
          border: 0;
          border-radius: 999px;
          background: #1a73e8;
          color: #fff;
          padding: 8px 12px;
          cursor: pointer;
          box-shadow: 0 6px 18px rgba(26, 115, 232, 0.28);
        }
      </style>
      <div class="panel" id="panel">
        <div class="head">
          <h2 id="title"></h2>
          <button class="link" id="hide" type="button"></button>
        </div>
        <div class="query" id="query"></div>
        <div class="status" id="status"></div>
        <div class="counts" id="counts"></div>
        <div class="actions">
          <button class="start" id="start" type="button"></button>
          <button class="stop" id="stop" type="button"></button>
        </div>
        <p class="note" id="note"></p>
      </div>
      <button class="pill" id="pill" type="button" hidden></button>
    `;
    document.documentElement.appendChild(host);

    ui.panel = shadow.getElementById("panel");
    ui.pill = shadow.getElementById("pill");
    ui.query = shadow.getElementById("query");
    ui.status = shadow.getElementById("status");
    ui.counts = shadow.getElementById("counts");
    ui.start = shadow.getElementById("start");
    ui.stop = shadow.getElementById("stop");
    shadow.getElementById("title").textContent = t("title");
    shadow.getElementById("hide").textContent = t("hide");
    shadow.getElementById("note").textContent = t("note");
    ui.start.textContent = t("start");
    ui.stop.textContent = t("stop");
    shadow.getElementById("start").addEventListener("click", onStart);
    shadow.getElementById("stop").addEventListener("click", onStop);
    shadow.getElementById("hide").addEventListener("click", () => {
      state.collapsed = true;
      render();
    });
    shadow.getElementById("pill").addEventListener("click", () => {
      state.collapsed = false;
      render();
    });
    render();
  }

  function tick() {
    if (!document.getElementById("gmail-cestino-host")) mount();
    if (!state.running && !state.stickyStatus) {
      const reason = blockReason();
      state.status = reason || t("ready");
    }
    render();
  }

  mount();
  setInterval(tick, 1000);
})();
