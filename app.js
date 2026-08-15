/* ==================================================================
   2026 Draft Board
   State lives in localStorage under STORAGE_KEY. No backend, no build step.
================================================================== */

const STORAGE_KEY = "ff-draft-board-v1";
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

  const posTiers = {};
  POSITIONS.forEach(pos => {
    const players = PLAYER_DATA.filter(p => p.pos === pos)
      .sort((a, b) => a.posRank - b.posRank);
    const tiers = [];
    let curTier = null;
    let curTierNum = null;
    players.forEach(p => {
      if (p.tier !== curTierNum) {
        curTierNum = p.tier;
        curTier = [];
        tiers.push(curTier);
      }
      curTier.push(p.id);
    });
    posTiers[pos] = tiers;
  });

  return { draftedIds: [], overallOrder, posTiers };
}

function loadState() {
  const fallback = buildDefaultState();
  let raw;
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (e) {
    return fallback;
  }
  if (!raw || !Array.isArray(raw.overallOrder) || !raw.posTiers) return fallback;

  // Sanity check: saved state must reference the same player set we have now.
  const savedIds = new Set(raw.overallOrder);
  const currentIds = new Set(PLAYER_DATA.map(p => p.id));
  if (savedIds.size !== currentIds.size) return fallback;
  for (const id of savedIds) if (!currentIds.has(id)) return fallback;

  return {
    draftedIds: Array.isArray(raw.draftedIds) ? raw.draftedIds : [],
    overallOrder: raw.overallOrder,
    posTiers: raw.posTiers,
  };
}

let state = loadState();
let draftedSet = new Set(state.draftedIds);

function persist() {
  state.draftedIds = [...draftedSet];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function toggleDrafted(id) {
  if (draftedSet.has(id)) draftedSet.delete(id);
  else draftedSet.add(id);
  persist();
  updateDraftedCounter();
  // Just toggle the relevant DOM nodes rather than a full re-render.
  document.querySelectorAll(`[data-id="${id}"]`).forEach(el => {
    el.classList.toggle("drafted", draftedSet.has(id));
  });
}

function updateDraftedCounter() {
  document.getElementById("draftedCounter").textContent =
    `${draftedSet.size} / ${PLAYER_DATA.length} drafted`;
}

// ------------------------------------------------------------------
// Overall view
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
      <span class="pick-val">${p.pick}</span>
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
      // Renumber rank badges without a full rebuild.
      list.querySelectorAll(".player-row").forEach((el, i) => {
        el.querySelector(".rank-num").textContent = i + 1;
      });
    },
  });

  applySearchFilter();
}

// ------------------------------------------------------------------
// Position view
// ------------------------------------------------------------------
function tierGapRatio(pos, tierIdx) {
  // Rough visual weight for the tier divider: bigger ADP jump from the
  // previous tier's last player to this tier's first player = bolder line.
  const tiers = state.posTiers[pos];
  if (tierIdx === 0) return 0;
  const prevTier = tiers[tierIdx - 1];
  const curTier = tiers[tierIdx];
  if (!prevTier.length || !curTier.length) return 0;
  const prevLast = playersById[prevTier[prevTier.length - 1]];
  const curFirst = playersById[curTier[0]];
  if (!prevLast || !curFirst) return 0;
  const gap = curFirst.adp - prevLast.adp;

  // Normalize against the biggest gap seen in this position so the
  // boldest divider in each column always reads as "the big cliff."
  let maxGap = 1;
  for (let i = 1; i < tiers.length; i++) {
    const a = tiers[i - 1], b = tiers[i];
    if (!a.length || !b.length) continue;
    const g = playersById[b[0]].adp - playersById[a[a.length - 1]].adp;
    if (g > maxGap) maxGap = g;
  }
  return Math.max(0, Math.min(1, gap / maxGap));
}

function renderPositionView() {
  const wrap = document.getElementById("posColumns");
  wrap.innerHTML = "";

  POSITIONS.forEach(pos => {
    const col = document.createElement("div");
    col.className = "pos-column";
    col.dataset.pos = pos;

    const total = state.posTiers[pos].reduce((n, t) => n + t.length, 0);
    col.innerHTML = `
      <div class="pos-column-head ${pos}">
        <span class="pos-label">${pos}</span>
        <span class="pos-count">${total} players</span>
      </div>
      <div class="pos-column-body"></div>
    `;
    const body = col.querySelector(".pos-column-body");

    state.posTiers[pos].forEach((tierIds, tierIdx) => {
      const block = document.createElement("div");
      block.className = "tier-block";

      const ratio = tierGapRatio(pos, tierIdx);
      const lineH = tierIdx === 0 ? 1 : 1 + Math.round(ratio * 3);
      const lineColor = tierIdx === 0 ? "var(--line)" : `rgba(232,184,75,${0.25 + ratio * 0.55})`;
      const glow = ratio > 0.5 ? `0 0 8px rgba(232,184,75,${ratio * 0.4})` : "none";

      const divider = document.createElement("div");
      divider.className = "tier-divider";
      divider.style.setProperty("--line-h", lineH + "px");
      divider.style.setProperty("--line-color", lineColor);
      divider.style.setProperty("--line-glow", glow);
      divider.innerHTML = `
        <span class="tier-num">${tierIdx + 1}</span>
        <span class="tier-line"></span>
        <span class="tier-label">Tier ${tierIdx + 1}</span>
        <button class="remove-tier-btn" title="Remove empty tier" style="${tierIds.length ? "display:none;" : ""}">✕</button>
      `;
      divider.querySelector(".remove-tier-btn").addEventListener("click", () => {
        state.posTiers[pos].splice(tierIdx, 1);
        persist();
        renderPositionView();
      });
      block.appendChild(divider);

      const ul = document.createElement("ul");
      ul.className = "tier-players";
      ul.dataset.pos = pos;
      ul.dataset.tierIdx = tierIdx;
      tierIds.forEach(id => {
        const p = playersById[id];
        if (!p) return;
        const li = document.createElement("li");
        li.className = "pos-card" + (draftedSet.has(id) ? " drafted" : "");
        li.dataset.id = id;
        li.innerHTML = `
          <span class="drag-handle" title="Drag to move">⠿</span>
          <span class="chk">${checkmarkSVG()}</span>
          <span class="pos-card-info">
            <div class="pos-card-name">${p.name}</div>
            <div class="pos-card-meta">${p.team} · ADP ${p.adp} · ${p.pick}</div>
          </span>
        `;
        li.addEventListener("click", (e) => {
          if (e.target.closest(".drag-handle")) return;
          toggleDrafted(id);
        });
        ul.appendChild(li);
      });
      block.appendChild(ul);
      body.appendChild(block);

      Sortable.create(ul, {
        group: `pos-${pos}`,
        handle: ".drag-handle",
        animation: 150,
        ghostClass: "sortable-ghost",
        chosenClass: "sortable-chosen",
        emptyInsertThreshold: 20,
        onSort: () => syncPosTiersFromDOM(pos, body),
      });
    });

    const addBtn = document.createElement("button");
    addBtn.className = "add-tier-btn";
    addBtn.textContent = "+ Add tier";
    addBtn.addEventListener("click", () => {
      state.posTiers[pos].push([]);
      persist();
      renderPositionView();
    });
    body.appendChild(addBtn);

    wrap.appendChild(col);
  });

  applySearchFilter();
}

function syncPosTiersFromDOM(pos, bodyEl) {
  const lists = bodyEl.querySelectorAll(`.tier-players[data-pos="${pos}"]`);
  const tiers = [...lists].map(ul => [...ul.querySelectorAll(".pos-card")].map(el => el.dataset.id));
  state.posTiers[pos] = tiers;
  persist();
  renderPositionView();
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
  state = buildDefaultState();
  draftedSet = new Set();
  persist();
  updateDraftedCounter();
  renderOverall();
  renderPositionView();
});

// ------------------------------------------------------------------
// Boot
// ------------------------------------------------------------------
updateDraftedCounter();
renderOverall();
renderPositionView();
