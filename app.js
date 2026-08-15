/* ==================================================================
   2026 Draft Board
   Source of truth: state.overallOrder (array of player ids).
   The Overall tab is the only place ranks change — drag a row to move it.
   The By Position tab derives each column's player order by filtering
   overallOrder, and the ONLY thing draggable there is the tier-divider
   lines (state.tierBreaks), which are index cut-points into that order.
   Everything persists to localStorage. No backend.
================================================================== */

const STORAGE_KEY = "ff-draft-board-v2";
const LEGACY_STORAGE_KEY = "ff-draft-board-v1"; // for a soft migration, drafted marks + order only
const POSITIONS = ["QB", "RB", "WR", "TE"];
const ESPN_FLAG_THRESHOLD = 6; // ADP-point gap before we flag a mismatch

const playersById = Object.fromEntries(PLAYER_DATA.map(p => [p.id, p]));

// ------------------------------------------------------------------
// Default state, derived fresh from data.js
// ------------------------------------------------------------------
function buildDefaultState() {
  const overallOrder = [...PLAYER_DATA]
    .sort((a, b) => a.overallRank - b.overallRank)
    .map(p => p.id);

  const tierBreaks = {};
  POSITIONS.forEach(pos => {
    const list = PLAYER_DATA.filter(p => p.pos === pos).sort((a, b) => a.posRank - b.posRank);
    const breaks = [];
    for (let i = 1; i < list.length; i++) {
      if (list[i].tier !== list[i - 1].tier) breaks.push(i);
    }
    tierBreaks[pos] = breaks;
  });

  return { draftedIds: [], overallOrder, tierBreaks, teams: 10 };
}

function validOverallOrder(order) {
  if (!Array.isArray(order)) return false;
  const a = new Set(order);
  const b = new Set(PLAYER_DATA.map(p => p.id));
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

function loadState() {
  const fresh = buildDefaultState();

  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (raw && validOverallOrder(raw.overallOrder) && raw.tierBreaks) {
      return {
        draftedIds: Array.isArray(raw.draftedIds) ? raw.draftedIds : [],
        overallOrder: raw.overallOrder,
        tierBreaks: raw.tierBreaks,
        teams: raw.teams === 12 ? 12 : 10,
      };
    }
  } catch (e) { /* fall through */ }

  // Soft migration from the previous version of the board: carry over
  // drafted marks and overall order if we can, but tiers are a new
  // concept (index cut-points instead of per-tier id lists) so those
  // reset to the default breakdown.
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy && validOverallOrder(legacy.overallOrder)) {
      return {
        draftedIds: Array.isArray(legacy.draftedIds) ? legacy.draftedIds : [],
        overallOrder: legacy.overallOrder,
        tierBreaks: fresh.tierBreaks,
        teams: 10,
      };
    }
  } catch (e) { /* fall through */ }

  return fresh;
}

let state = loadState();
let draftedSet = new Set(state.draftedIds);

function persist() {
  state.draftedIds = [...draftedSet];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function posOrderIds(pos) {
  return state.overallOrder.filter(id => playersById[id] && playersById[id].pos === pos);
}

// ------------------------------------------------------------------
// Small helpers
// ------------------------------------------------------------------
function checkmarkSVG() {
  return '<svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6.2L4.8 9L10 3" stroke="#0b0f14" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function espnFlagHTML(p) {
  if (p.espnGap >= ESPN_FLAG_THRESHOLD) {
    return `<span class="espn-flag value" title="ESPN ADP is ${p.espnGap} picks later than Yahoo/Sleeper avg — likely value">ESPN ▼ value</span>`;
  }
  if (p.espnGap <= -ESPN_FLAG_THRESHOLD) {
    return `<span class="espn-flag risk" title="ESPN ADP is ${Math.abs(p.espnGap)} picks earlier than Yahoo/Sleeper avg — reach risk">ESPN ▲ reach</span>`;
  }
  return "";
}

function roundPick(adp, teams) {
  const overall = Math.max(1, Math.round(adp));
  const rnd = Math.floor((overall - 1) / teams) + 1;
  const pickInRound = ((overall - 1) % teams) + 1;
  return `${rnd}.${String(pickInRound).padStart(2, "0")}`;
}

function toggleDrafted(id) {
  if (draftedSet.has(id)) draftedSet.delete(id);
  else draftedSet.add(id);
  persist();
  updateDraftedCounter();
  // Drafted state is shared across both tabs — update every matching node,
  // whether it's currently visible or not.
  document.querySelectorAll(`[data-id="${id}"]`).forEach(el => {
    el.classList.toggle("drafted", draftedSet.has(id));
  });
}

function updateDraftedCounter() {
  document.getElementById("draftedCounter").textContent =
    `${draftedSet.size} / ${PLAYER_DATA.length} drafted`;
}

// ------------------------------------------------------------------
// Overall view — the only place ranks change
// ------------------------------------------------------------------
function renderOverall() {
  const list = document.getElementById("overallList");
  list.innerHTML = "";

  state.overallOrder.forEach((id, idx) => {
    const p = playersById[id];
    if (!p) return;
    const li = document.createElement("li");
    li.className = "player-row" + (draftedSet.has(id) ? " drafted" : "");
    li.dataset.id = id;
    li.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <span class="chk">${checkmarkSVG()}</span>
      <span class="rank-num">${idx + 1}</span>
      <span class="player-name-wrap">
        <span class="player-name">${p.name}</span>
        <span class="player-team">${p.team}</span>
      </span>
      <span class="pos-chip ${p.pos}">${p.pos}</span>
      <span class="pick-val">${roundPick(p.adp, state.teams)}</span>
      <span class="adp-val">${p.adp}</span>
      ${espnFlagHTML(p)}
    `;
    li.addEventListener("click", (e) => {
      if (e.target.closest(".drag-handle")) return;
      toggleDrafted(id);
    });
    list.appendChild(li);
  });

  Sortable.create(list, {
    handle: ".drag-handle",
    animation: 150,
    ghostClass: "sortable-ghost",
    chosenClass: "sortable-chosen",
    onEnd: () => {
      const ids = [...list.querySelectorAll(".player-row")].map(el => el.dataset.id);
      state.overallOrder = ids;
      persist();
      list.querySelectorAll(".player-row").forEach((el, i) => {
        el.querySelector(".rank-num").textContent = i + 1;
      });
      // Rank changes here are the source of truth for the position tab too.
      renderPositionView();
    },
  });

  applySearchFilter();
}

// ------------------------------------------------------------------
// Position view — order is derived from Overall; only tier lines move
// ------------------------------------------------------------------
function tierBoundsForPos(pos) {
  const ids = posOrderIds(pos);
  const raw = (state.tierBreaks[pos] || []).filter(i => i > 0 && i < ids.length);
  const breaks = [...new Set(raw)].sort((a, b) => a - b);
  const bounds = [0, ...breaks, ids.length]; // consecutive pairs = tier ranges
  return { ids, breaks, bounds };
}

function gapRatioForBoundary(ids, bounds, tierIdx) {
  // Visual weight of the divider above tier `tierIdx`: bigger ADP jump
  // between the last player of the previous tier and the first player of
  // this one = bolder / brighter line. Normalized against the biggest
  // jump in the column so the boldest line always reads as "the cliff."
  if (tierIdx === 0) return 0;
  const prevLast = playersById[ids[bounds[tierIdx] - 1]];
  const curFirst = playersById[ids[bounds[tierIdx]]];
  if (!prevLast || !curFirst) return 0;
  const gap = curFirst.adp - prevLast.adp;

  let maxGap = 1;
  for (let i = 1; i < bounds.length - 1; i++) {
    const a = playersById[ids[bounds[i] - 1]];
    const b = playersById[ids[bounds[i]]];
    if (!a || !b) continue;
    const g = b.adp - a.adp;
    if (g > maxGap) maxGap = g;
  }
  return Math.max(0, Math.min(1, gap / maxGap));
}

function renderPositionView() {
  const wrap = document.getElementById("posColumns");
  wrap.innerHTML = "";

  POSITIONS.forEach(pos => {
    const { ids, breaks, bounds } = tierBoundsForPos(pos);

    const col = document.createElement("div");
    col.className = "pos-column";
    col.dataset.pos = pos;
    col.innerHTML = `
      <div class="pos-column-head ${pos}">
        <span class="pos-label">${pos}</span>
        <span class="pos-count">${ids.length} players</span>
      </div>
      <div class="pos-column-body"></div>
    `;
    const body = col.querySelector(".pos-column-body");

    for (let t = 0; t < bounds.length - 1; t++) {
      const start = bounds[t];
      const end = bounds[t + 1];
      const isDraggable = t > 0; // the top of tier 1 is fixed, not a real boundary

      const block = document.createElement("div");
      block.className = "tier-block";

      const ratio = gapRatioForBoundary(ids, bounds, t);
      const lineH = t === 0 ? 1 : 1 + Math.round(ratio * 3);
      const lineColor = t === 0 ? "var(--line)" : `rgba(232,184,75,${0.25 + ratio * 0.55})`;
      const glow = ratio > 0.5 ? `0 0 8px rgba(232,184,75,${ratio * 0.4})` : "none";

      const divider = document.createElement("div");
      divider.className = "tier-divider" + (isDraggable ? " draggable" : "");
      divider.style.setProperty("--line-h", lineH + "px");
      divider.style.setProperty("--line-color", lineColor);
      divider.style.setProperty("--line-glow", glow);
      divider.innerHTML = `
        ${isDraggable ? '<span class="divider-handle" title="Drag to move this tier line">⠿</span>' : '<span class="divider-handle-spacer"></span>'}
        <span class="tier-num">${t + 1}</span>
        <span class="tier-line"></span>
        <span class="tier-label">Tier ${t + 1}</span>
        ${isDraggable ? '<button class="remove-tier-btn" title="Remove this tier line">✕</button>' : ""}
      `;
      if (isDraggable) {
        divider.querySelector(".remove-tier-btn").addEventListener("click", () => {
          state.tierBreaks[pos] = (state.tierBreaks[pos] || []).filter(b => b !== start);
          persist();
          renderPositionView();
        });
        const handle = divider.querySelector(".divider-handle");
        handle.addEventListener("pointerdown", (e) => startDividerDrag(e, pos, start, handle, body));
      }
      block.appendChild(divider);

      const ul = document.createElement("ul");
      ul.className = "tier-players";
      for (let i = start; i < end; i++) {
        const id = ids[i];
        const p = playersById[id];
        if (!p) continue;
        const li = document.createElement("li");
        li.className = "pos-card" + (draftedSet.has(id) ? " drafted" : "");
        li.dataset.id = id;
        li.innerHTML = `
          <span class="chk">${checkmarkSVG()}</span>
          <span class="pos-card-info">
            <div class="pos-card-name">${p.name}</div>
            <div class="pos-card-meta">${p.team} · ADP ${p.adp} · ${roundPick(p.adp, state.teams)}</div>
          </span>
        `;
        li.addEventListener("click", () => toggleDrafted(id));
        ul.appendChild(li);
      }
      block.appendChild(ul);
      body.appendChild(block);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "add-tier-btn";
    addBtn.textContent = "+ Add tier line";
    addBtn.addEventListener("click", () => {
      // Split the largest current tier in half.
      let bestIdx = -1, bestSize = 1;
      for (let i = 0; i < bounds.length - 1; i++) {
        const size = bounds[i + 1] - bounds[i];
        if (size > bestSize) { bestSize = size; bestIdx = i; }
      }
      if (bestIdx === -1) return; // every tier already has just 1 player
      const newBreak = bounds[bestIdx] + Math.floor(bestSize / 2);
      state.tierBreaks[pos] = [...(state.tierBreaks[pos] || []), newBreak];
      persist();
      renderPositionView();
    });
    body.appendChild(addBtn);

    wrap.appendChild(col);
  });

  applySearchFilter();
}

// ------------------------------------------------------------------
// Dragging a tier line: pointer-based, snaps to gaps between player rows
// ------------------------------------------------------------------
function startDividerDrag(e, pos, originalBreak, handleEl, columnBodyEl) {
  e.preventDefault();
  handleEl.setPointerCapture(e.pointerId);

  const ids = posOrderIds(pos);
  const otherBreaks = new Set((state.tierBreaks[pos] || []).filter(b => b !== originalBreak));
  const rows = [...columnBodyEl.querySelectorAll(".pos-card")];
  if (rows.length !== ids.length) return; // stale DOM guard

  // Every index from 1..N-1 is a candidate gap, except ones already
  // occupied by a different tier line.
  const candidates = [];
  for (let i = 1; i < ids.length; i++) {
    if (!otherBreaks.has(i)) candidates.push(i);
  }
  if (!candidates.length) return;

  const bodyRect = columnBodyEl.getBoundingClientRect();
  const gapY = candidates.map(i => {
    const above = rows[i - 1].getBoundingClientRect();
    const below = rows[i].getBoundingClientRect();
    return (above.bottom + below.top) / 2;
  });

  const indicator = document.createElement("div");
  indicator.className = "tier-drop-indicator";
  columnBodyEl.appendChild(indicator);
  columnBodyEl.classList.add("tier-dragging");

  let current = originalBreak;

  function nearestCandidate(clientY) {
    let best = 0, bestDist = Infinity;
    gapY.forEach((y, k) => {
      const d = Math.abs(clientY - y);
      if (d < bestDist) { bestDist = d; best = k; }
    });
    return candidates[best];
  }

  function positionIndicator(idx) {
    const k = candidates.indexOf(idx);
    const y = gapY[k] - bodyRect.top;
    indicator.style.top = `${y}px`;
  }
  positionIndicator(current);

  function onMove(ev) {
    current = nearestCandidate(ev.clientY);
    positionIndicator(current);
  }

  function onUp() {
    handleEl.removeEventListener("pointermove", onMove);
    handleEl.removeEventListener("pointerup", onUp);
    handleEl.removeEventListener("pointercancel", onUp);
    indicator.remove();
    columnBodyEl.classList.remove("tier-dragging");

    if (current !== originalBreak) {
      const arr = (state.tierBreaks[pos] || []).filter(b => b !== originalBreak);
      arr.push(current);
      state.tierBreaks[pos] = arr;
      persist();
    }
    renderPositionView();
  }

  handleEl.addEventListener("pointermove", onMove);
  handleEl.addEventListener("pointerup", onUp);
  handleEl.addEventListener("pointercancel", onUp);
}

// ------------------------------------------------------------------
// View toggle
// ------------------------------------------------------------------
function setView(view) {
  document.querySelectorAll(".toggle-btn").forEach(b => {
    const active = b.dataset.view === view;
    b.classList.toggle("active", active);
    b.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.getElementById("overallView").classList.toggle("active", view === "overall");
  document.getElementById("positionView").classList.toggle("active", view === "position");
}

document.querySelectorAll(".toggle-btn").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

// ------------------------------------------------------------------
// League size (10 vs 12 team) — only affects the derived Round.Pick
// display; ADP, order, and tiers are unaffected.
// ------------------------------------------------------------------
function setTeams(n) {
  state.teams = n;
  persist();
  document.querySelectorAll(".league-btn").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.teams) === n);
  });
  document.getElementById("leagueSubtitle").textContent = `${n}-team`;
  renderOverall();
  renderPositionView();
}

document.querySelectorAll(".league-btn").forEach(btn => {
  btn.addEventListener("click", () => setTeams(Number(btn.dataset.teams)));
});

// ------------------------------------------------------------------
// Search
// ------------------------------------------------------------------
function applySearchFilter() {
  const q = document.getElementById("searchBox").value.trim().toLowerCase();
  document.querySelectorAll(".player-row, .pos-card").forEach(el => {
    const p = playersById[el.dataset.id];
    const match = !q || (p && (p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q)));
    el.classList.toggle("is-hidden", !match);
  });
}
document.getElementById("searchBox").addEventListener("input", applySearchFilter);

// ------------------------------------------------------------------
// Reset
// ------------------------------------------------------------------
document.getElementById("resetBtn").addEventListener("click", () => {
  if (!confirm("Reset the board? This clears all drafted marks and restores the original order and tiers.")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  state = buildDefaultState();
  draftedSet = new Set();
  persist();
  updateDraftedCounter();
  document.querySelectorAll(".league-btn").forEach(b => {
    b.classList.toggle("active", Number(b.dataset.teams) === state.teams);
  });
  document.getElementById("leagueSubtitle").textContent = `${state.teams}-team`;
  renderOverall();
  renderPositionView();
});

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
document.querySelectorAll(".league-btn").forEach(b => {
  b.classList.toggle("active", Number(b.dataset.teams) === state.teams);
});
document.getElementById("leagueSubtitle").textContent = `${state.teams}-team`;
updateDraftedCounter();
renderOverall();
renderPositionView();
