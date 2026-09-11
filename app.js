// UI controller - wires the VehicleData model (model.js) and repository data (data.js) to the DOM.
"use strict";

const STORAGE_KEY = "wsvb.vehicles.v1";

const state = {
  vehicles: [],
  selectedId: null,
};

let persistTimer = null;

// File System Access API lets us remember where a vehicle was saved and
// overwrite that same file on subsequent saves, instead of the browser
// silently downloading "Name (1).json" duplicates. Only available in
// Chromium browsers over a secure context (https, or http://localhost -
// NOT a plain LAN http:// address). Falls back to a normal download
// everywhere else (Safari, iOS, LAN access).
const supportsFileSystemAccess = typeof window.showSaveFilePicker === "function";
const fileHandles = new Map(); // vehicle.id -> { json?: FileSystemFileHandle, wsv?: FileSystemFileHandle }

// ---------------------------------------------------------------------------
// Feature table definitions
// ---------------------------------------------------------------------------
const OPERATIONS_FEATURES = [
  { key: "Control", label: "Control [+Pilot] [+Drive]", aiField: "aiControlLevel", crewField: "crewControlLevel", cpProp: "cpCostControl", mkProp: "mkControl", noteFn: () => "", advancedTrait: "Advanced Controls" },
  { key: "EW", label: "Electronic Warfare [+Warfare]", aiField: "aiEWLevel", crewField: "crewEWLevel", cpProp: "cpCostEW", mkProp: "mkEW", noteFn: () => "", advancedTrait: "Advanced Electronic Warfare" },
  { key: "Gunner", label: "Gunner [+Ranged Weapon]", aiField: "aiGunnerLevel", crewField: "crewGunnerLevel", cpProp: "cpCostGunner", mkProp: "mkGunner", noteFn: () => "", advancedTrait: "Advanced Gunnery" },
  { key: "Nav", label: "Navigation [+Navigation]", aiField: "aiNavLevel", crewField: "crewNavLevel", cpProp: "cpCostNav", mkProp: "mkNav", noteFn: () => "", advancedTrait: "Advanced Navigation" },
  { key: "Research", label: "Research [+Science]", aiField: "aiResearchLevel", crewField: "crewResearchLevel", cpProp: "cpCostResearch", mkProp: "mkResearch", noteFn: () => "", advancedTrait: "Advanced Research" },
  { key: "Security", label: "Security [+Warfare]", aiField: "aiSecurityLevel", crewField: "crewSecurityLevel", cpProp: "cpCostSecurity", mkProp: "mkSecurity", noteFn: () => "", advancedTrait: "Advanced Security" },
  { key: "Sensors", label: "Sensors [+Science]", aiField: "aiSensorsLevel", crewField: "crewSensorsLevel", cpProp: "cpCostSensors", mkProp: "mkSensors", noteFn: (v) => "Bonus/Range: " + fmtG(v.sb), advancedTrait: "Advanced Sensors" },
];

const PLATFORM_FEATURES = [
  { key: "Armor", label: "Armor & Shields", levelField: "levelArmor", bonusField: "bonusArmor", cpProp: "cpCostArmor", mkProp: "mkArmor", noteFn: () => "" },
  { key: "BC", label: "Berthing Compartment", levelField: "levelBC", bonusField: "bonusBC", cpProp: "cpCostBC", mkProp: "mkBC", noteFn: (v) => fmtG(v.totalPassengers) + " Passengers" },
  { key: "CH", label: "Cargo Hold", levelField: "levelCH", bonusField: "bonusCH", cpProp: "cpCostCH", mkProp: "mkCH", noteFn: (v) => fmtN0(v.totalCargoUnits) + " Cargo Units" },
  { key: "DC", label: "Damage Control", levelField: "levelDC", bonusField: "bonusDC", cpProp: "cpCostDC", mkProp: "mkDC", noteFn: (v) => fmtG(v.hpRepaired) + " HP Repaired" },
  { key: "GH", label: "Gravitic Harpoon", levelField: "levelGH", bonusField: "bonusGH", cpProp: "cpCostGH", mkProp: "mkGH", noteFn: (v) => "Range: " + fmtG(v.mkGH) },
  { key: "HS", label: "Hangar Space", levelField: "levelHS", bonusField: "bonusHS", cpProp: "cpCostHS", mkProp: "mkHS", noteFn: (v) => fmtG(v.hangarSpaceTons) + " tons" },
  { key: "Hpress", label: "Hydrostatic Pressure", levelField: "levelHpress", bonusField: "bonusHpress", cpProp: "cpCostHpress", mkProp: "mkHpress", noteFn: (v) => fmtG(v.atms) + " atms" },
  { key: "OD", label: "Operating Duration", levelField: "levelOD", bonusField: "bonusOD", cpProp: "cpCostOD", mkProp: "mkOD", noteFn: (v) => fmtG(v.od) + " day" },
  { key: "QT", label: "Quantum Telegraph (TL6+)", levelField: "levelQT", bonusField: "bonusQT", cpProp: "cpCostQT", mkProp: "mkQT", noteFn: (v) => fmtG(v.qtRange) + " ly" },
  { key: "RP", label: "Reactor Power", levelField: "levelRP", bonusField: "bonusRP", cpProp: "cpCostRP", mkProp: "mkRP", noteFn: () => "" },
  { key: "Stealth", label: "Stealth", levelField: "levelStealth", bonusField: "bonusStealth", cpProp: "cpCostStealth", mkProp: "mkStealth", noteFn: () => "" },
  { key: "Thrust", label: "Thrust", levelField: "levelThrust", bonusField: "bonusThrust", cpProp: "cpCostThrust", mkProp: "mkThrust", noteFn: () => "" },
  { key: "Warp", label: "Warp Speed (TL5+)", levelField: "levelWarp", bonusField: "bonusWarp", cpProp: "cpCostWarp", mkProp: "mkWarp", noteFn: (v) => fmtG(v.warpSpeed) + " LY/Day" },
];

const ENUM_SELECTS = [
  { id: "fCompartmentalization", enumName: "Compartmentalization", field: "compartmentalizationSelected" },
  { id: "fFrameStrength", enumName: "FrameStrength", field: "frameStrengthSelected" },
  { id: "fEnvPrimary", enumName: "EnvironmentalInterface", field: "environmentalInterfacePrimary" },
  { id: "fEnvSecondary", enumName: "EnvironmentalInterface", field: "environmentalInterfaceSecondary" },
  { id: "fEnvTertiary", enumName: "EnvironmentalInterface", field: "environmentalInterfaceTertiary" },
  { id: "fInterfaceOptions", enumName: "InterfaceOptions", field: "interfaceOption" },
  { id: "fCrewClass", enumName: "CrewClasses", field: "crewClass" },
  { id: "fTransportType", enumName: "TransportTypes", field: "transportType" },
  { id: "fPassengerClass", enumName: "PassengerClasses", field: "passengerClass" },
  { id: "fCapitalWeaponType", enumName: "CapitalWeaponSystemTypes", field: "capitalWeaponSystemType" },
  { id: "fStandardWeaponType", enumName: "StandardWeaponSystemTypes", field: "standardWeaponSystemType" },
  { id: "fMissileWeaponType", enumName: "MissileWeaponSystemTypes", field: "missileWeaponSystemType" },
  { id: "fSlugWeaponType", enumName: "SlugThrowerWeaponSystemTypes", field: "slugThrowerWeaponSystemType" },
];

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function el(id) { return document.getElementById(id); }

function init() {
  state.vehicles = loadPersisted();

  populateEnumSelects();
  buildFeatureTable(el("operationsTable"), OPERATIONS_FEATURES, "op");
  buildFeatureTable(el("platformTable"), PLATFORM_FEATURES, "pl");

  bindToolbar();
  bindTabs();
  bindInfoFields();
  bindTraitsAndBoutique();
  enhanceNumberInputs();
  initTouchScrollbars();

  renderVehicleList();
  if (state.vehicles.length > 0) {
    selectVehicle(state.vehicles[0].id);
  } else {
    showEmptyState();
  }
}

function populateEnumSelects() {
  for (const cfg of ENUM_SELECTS) {
    const select = el(cfg.id);
    select.innerHTML = "";
    for (const value of ENUMS[cfg.enumName]) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      select.appendChild(opt);
    }
    select.addEventListener("change", () => {
      const vehicle = getSelectedVehicle();
      if (!vehicle) return;
      vehicle[cfg.field] = select.value;
      onVehicleChanged(vehicle);
    });
  }
}

// ---------------------------------------------------------------------------
// Sortable Traits / Boutique Services repository & selected tables
// (ported from WSHB's Archetype Ability picker: sortable columns, sticky
// header, dimmed "(owned)" rows, key-based selection that survives re-sorts).
// ---------------------------------------------------------------------------
function escHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sortRows(rows, sortState) {
  const { key, dir } = sortState;
  return [...rows].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (typeof av === "string" || typeof bv === "string") { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
}

function buildSortableHeadHtml(columns, sortState) {
  return `<thead><tr>${columns.map((c) => {
    const arrow = c.key === sortState.key ? (sortState.dir === 1 ? " ▲" : " ▼") : "";
    return `<th class="sortable" data-sort-key="${c.key}">${escHtml(c.label)}${arrow}</th>`;
  }).join("")}</tr></thead>`;
}

const TRAIT_REPO_COLUMNS = [
  { key: "traitName", label: "Name" },
  { key: "prerequisite", label: "Prereq" },
  { key: "cost", label: "Cost" },
];
const traitRepoSort = { key: "traitName", dir: 1 };
let selectedTraitRepoKey = null;

const TRAIT_SELECTED_COLUMNS = [
  { key: "traitName", label: "Name" },
  { key: "prerequisite", label: "Prereq" },
  { key: "cost", label: "Cost" },
];
const traitSelectedSort = { key: "traitName", dir: 1 };
let selectedTraitSelKey = null;

const BOUTIQUE_REPO_COLUMNS = [
  { key: "boutiqueServiceName", label: "Name" },
  { key: "cost", label: "Cost" },
];
const boutiqueRepoSort = { key: "boutiqueServiceName", dir: 1 };
let selectedBoutiqueRepoKey = null;

const BOUTIQUE_SELECTED_COLUMNS = [
  { key: "boutiqueServiceName", label: "Name" },
  { key: "cost", label: "Cost" },
];
const boutiqueSelectedSort = { key: "boutiqueServiceName", dir: 1 };
let selectedBoutiqueSelKey = null;

function getTraitRepoRows(vehicle) {
  const level = toInt(el("fTraitLevel").value) || 1;
  return TRAITS_REPOSITORY.map((t) => {
    const preview = new Trait({ ...t, selectedLevel: level });
    const owned = !!vehicle && vehicle.selectedTraits.some((s) => s.traitName === t.traitName);
    return { traitName: t.traitName, prerequisite: t.prerequisite, cost: vehicle ? preview.costTrait(vehicle) : 0, owned };
  });
}

function renderTraitsRepository(vehicle) {
  const rows = sortRows(getTraitRepoRows(vehicle), traitRepoSort);
  const table = el("traitsRepositoryTable");
  table.innerHTML = buildSortableHeadHtml(TRAIT_REPO_COLUMNS, traitRepoSort) + "<tbody></tbody>";
  const tbody = table.querySelector("tbody");

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="listbox-empty">No traits found.</td></tr>`;
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "repo-row" + (row.owned ? " repo-row-owned" : "") + (row.traitName === selectedTraitRepoKey ? " selected" : "");
    tr.dataset.key = row.traitName;
    tr.innerHTML =
      `<td>${escHtml(row.traitName)}${row.owned ? " (owned)" : ""}</td>` +
      `<td class="feature-notes">${escHtml(row.prerequisite)}</td>` +
      `<td class="readonly-cell">${fmtG(row.cost)}</td>`;
    tbody.appendChild(tr);
  }
}

function getSelectedTraitRows(vehicle) {
  return vehicle.selectedTraits.map((t) => ({
    traitName: t.traitName,
    prerequisite: t.prerequisite,
    cost: t.costTrait(vehicle),
    level: t.selectedLevel,
  }));
}

function renderSelectedTraits(vehicle) {
  const rows = sortRows(getSelectedTraitRows(vehicle), traitSelectedSort);
  const table = el("traitsSelectedTable");
  table.innerHTML = buildSortableHeadHtml(TRAIT_SELECTED_COLUMNS, traitSelectedSort) + "<tbody></tbody>";
  const tbody = table.querySelector("tbody");

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" class="listbox-empty">No traits selected yet.</td></tr>`;
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "repo-row" + (row.traitName === selectedTraitSelKey ? " selected" : "");
    tr.dataset.key = row.traitName;
    const nameLabel = row.level > 1 ? `${row.traitName} (Lvl ${row.level})` : row.traitName;
    tr.innerHTML =
      `<td>${escHtml(nameLabel)}</td>` +
      `<td class="feature-notes">${escHtml(row.prerequisite)}</td>` +
      `<td class="readonly-cell">${fmtG(row.cost)}</td>`;
    tbody.appendChild(tr);
  }
}

function getBoutiqueRepoRows(vehicle) {
  return BOUTIQUE_SERVICES_REPOSITORY.map((b) => {
    const preview = new BoutiqueService(b);
    const owned = !!vehicle && vehicle.selectedBoutiqueServices.some((s) => s.boutiqueServiceName === b.boutiqueServiceName);
    return { boutiqueServiceName: b.boutiqueServiceName, cost: vehicle ? preview.costBoutiqueService(vehicle) : 0, owned };
  });
}

function renderBoutiqueRepository(vehicle) {
  const rows = sortRows(getBoutiqueRepoRows(vehicle), boutiqueRepoSort);
  const table = el("boutiqueRepositoryTable");
  table.innerHTML = buildSortableHeadHtml(BOUTIQUE_REPO_COLUMNS, boutiqueRepoSort) + "<tbody></tbody>";
  const tbody = table.querySelector("tbody");

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" class="listbox-empty">No boutique services found.</td></tr>`;
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "repo-row" + (row.owned ? " repo-row-owned" : "") + (row.boutiqueServiceName === selectedBoutiqueRepoKey ? " selected" : "");
    tr.dataset.key = row.boutiqueServiceName;
    tr.innerHTML =
      `<td>${escHtml(row.boutiqueServiceName)}${row.owned ? " (owned)" : ""}</td>` +
      `<td class="readonly-cell">${fmtG(row.cost)}</td>`;
    tbody.appendChild(tr);
  }
}

function getSelectedBoutiqueRows(vehicle) {
  return vehicle.selectedBoutiqueServices.map((b) => ({
    boutiqueServiceName: b.boutiqueServiceName,
    cost: b.costBoutiqueService(vehicle),
  }));
}

function renderSelectedBoutique(vehicle) {
  const rows = sortRows(getSelectedBoutiqueRows(vehicle), boutiqueSelectedSort);
  const table = el("boutiqueSelectedTable");
  table.innerHTML = buildSortableHeadHtml(BOUTIQUE_SELECTED_COLUMNS, boutiqueSelectedSort) + "<tbody></tbody>";
  const tbody = table.querySelector("tbody");

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" class="listbox-empty">No boutique services selected yet.</td></tr>`;
    return;
  }
  for (const row of rows) {
    const tr = document.createElement("tr");
    tr.className = "repo-row" + (row.boutiqueServiceName === selectedBoutiqueSelKey ? " selected" : "");
    tr.dataset.key = row.boutiqueServiceName;
    tr.innerHTML =
      `<td>${escHtml(row.boutiqueServiceName)}</td>` +
      `<td class="readonly-cell">${fmtG(row.cost)}</td>`;
    tbody.appendChild(tr);
  }
}

// ---------------------------------------------------------------------------
// Feature table construction
// ---------------------------------------------------------------------------
function buildFeatureTable(table, defs, prefix) {
  const isOps = prefix === "op";
  table.innerHTML = `<thead><tr>
    <th>Feature</th>
    <th>${isOps ? "AI Level" : "Level"}</th>
    <th>${isOps ? "Crew Score" : "Bonus"}</th>
    <th class="col-readonly">Mk</th>
    <th class="col-readonly">Cost</th>
    <th class="col-readonly">Tons</th>
    <th>Notes</th>
  </tr></thead><tbody></tbody>`;
  const tbody = table.querySelector("tbody");

  for (const def of defs) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="feature-name">${def.label}</td>
      <td><input type="number" min="0" step="1" id="${prefix}-${def.key}-a"></td>
      <td><input type="number" min="0" step="1" id="${prefix}-${def.key}-b"></td>
      <td class="readonly-cell" id="${prefix}-${def.key}-mk">0</td>
      <td class="readonly-cell" id="${prefix}-${def.key}-cp">0</td>
      <td class="readonly-cell" id="${prefix}-${def.key}-tons">0</td>
      <td class="feature-notes" id="${prefix}-${def.key}-note"></td>
    `;
    tbody.appendChild(tr);

    const fieldA = isOps ? def.aiField : def.levelField;
    const fieldB = isOps ? def.crewField : def.bonusField;

    el(`${prefix}-${def.key}-a`).addEventListener("input", (e) => {
      const vehicle = getSelectedVehicle();
      if (!vehicle) return;
      vehicle[fieldA] = toInt(e.target.value);
      onVehicleChanged(vehicle);
    });
    el(`${prefix}-${def.key}-b`).addEventListener("input", (e) => {
      const vehicle = getSelectedVehicle();
      if (!vehicle) return;
      vehicle[fieldB] = toInt(e.target.value);
      onVehicleChanged(vehicle);
    });
  }
}

function toInt(value) {
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}
function toFloat(value) {
  const n = parseFloat(value);
  return Number.isNaN(n) ? 0 : n;
}

// ---------------------------------------------------------------------------
// Spinner buttons on every number field (iOS Safari never shows native
// up/down arrows on <input type="number">, and desktop's default ones are
// small/inconsistent - so we replace them with our own everywhere).
// ---------------------------------------------------------------------------
function enhanceNumberInputs(root = document) {
  const inputs = root.querySelectorAll('input[type="number"]:not(.spinner-enhanced)');
  inputs.forEach((input) => {
    input.classList.add("spinner-enhanced");

    const wrap = document.createElement("div");
    wrap.className = "spinner-wrap";
    input.parentNode.insertBefore(wrap, input);

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "spin-btn spin-minus";
    minus.textContent = "−";
    minus.setAttribute("aria-label", "Decrease");
    minus.tabIndex = -1;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "spin-btn spin-plus";
    plus.textContent = "+";
    plus.setAttribute("aria-label", "Increase");
    plus.tabIndex = -1;

    wrap.appendChild(minus);
    wrap.appendChild(input);
    wrap.appendChild(plus);

    const step = () => parseFloat(input.step) || 1;
    const applyDelta = (delta) => {
      let current = parseFloat(input.value);
      if (Number.isNaN(current)) current = input.min !== "" ? parseFloat(input.min) : 0;
      let next = current + delta;
      if (input.min !== "") next = Math.max(next, parseFloat(input.min));
      if (input.max !== "") next = Math.min(next, parseFloat(input.max));
      input.value = next;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    minus.addEventListener("click", () => applyDelta(-step()));
    plus.addEventListener("click", () => applyDelta(step()));
  });
}

// ---------------------------------------------------------------------------
// Touch-device scroll indicator. iOS Safari never supports ::-webkit-scrollbar
// theming (macOS Safari does, iOS doesn't), so its native scrollbar stays a
// thin auto-hiding hairline no CSS can recolor. On touch-only devices (no
// hover capability) we overlay our own always-visible colored thumb; desktop
// keeps the native (already themed) scrollbar untouched to avoid a doubled-up
// scrollbar look.
// ---------------------------------------------------------------------------
function initTouchScrollbars() {
  if (!window.matchMedia("(hover: none)").matches) return;

  const targets = document.querySelectorAll(".sidebar, .editor, .summary-panel, .listbox");
  targets.forEach(setupTouchScrollbar);
}

const TOUCH_SCROLLBAR_BTN_SPACE = 34; // px reserved at each end of the track for the up/down buttons

function setupTouchScrollbar(el) {
  const track = document.createElement("div");
  track.className = "touch-scrollbar-track";
  const thumb = document.createElement("div");
  thumb.className = "touch-scrollbar-thumb";
  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "touch-scroll-btn touch-scroll-up";
  upBtn.textContent = "▲";
  upBtn.setAttribute("aria-label", "Scroll up");
  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "touch-scroll-btn touch-scroll-down";
  downBtn.textContent = "▼";
  downBtn.setAttribute("aria-label", "Scroll down");
  track.appendChild(thumb);
  track.appendChild(upBtn);
  track.appendChild(downBtn);
  // Must be the FIRST child: a sticky element only pins at `top` once its
  // normal-flow position would scroll past it, so appending after all the
  // (much taller) content would leave it sitting off-screen at the bottom
  // until the view was scrolled nearly to the end.
  el.insertBefore(track, el.firstChild);

  const update = () => {
    const { scrollTop, scrollHeight, clientHeight } = el;
    const overflowing = scrollHeight > clientHeight + 1;
    track.style.display = overflowing ? "block" : "none";
    if (!overflowing) return;
    const maxScroll = scrollHeight - clientHeight;
    const trackSpan = Math.max(clientHeight - TOUCH_SCROLLBAR_BTN_SPACE * 2, 20);
    const thumbPx = Math.max((clientHeight / scrollHeight) * trackSpan, 20);
    const maxTravel = trackSpan - thumbPx;
    const frac = maxScroll > 0 ? scrollTop / maxScroll : 0;
    thumb.style.height = thumbPx + "px";
    thumb.style.top = (TOUCH_SCROLLBAR_BTN_SPACE + frac * maxTravel) + "px";
    downBtn.style.top = (clientHeight - 30) + "px";
    upBtn.disabled = scrollTop <= 0;
    downBtn.disabled = scrollTop >= maxScroll - 1;
  };

  const scrollStep = (dir) => {
    el.scrollBy({ top: dir * Math.min(el.clientHeight * 0.7, 240), behavior: "smooth" });
  };
  upBtn.addEventListener("click", () => scrollStep(-1));
  downBtn.addEventListener("click", () => scrollStep(1));

  el.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(el);
  new MutationObserver(update).observe(el, { childList: true, subtree: true });

  let dragging = false, startY = 0, startScrollTop = 0;
  thumb.addEventListener("touchstart", (e) => {
    dragging = true;
    startY = e.touches[0].clientY;
    startScrollTop = el.scrollTop;
    e.preventDefault();
  }, { passive: false });
  thumb.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const deltaY = e.touches[0].clientY - startY;
    const thumbPx = thumb.offsetHeight;
    const trackSpan = Math.max(el.clientHeight - TOUCH_SCROLLBAR_BTN_SPACE * 2, 20);
    const maxTravel = trackSpan - thumbPx;
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxTravel > 0) el.scrollTop = startScrollTop + (deltaY / maxTravel) * maxScroll;
    e.preventDefault();
  }, { passive: false });
  thumb.addEventListener("touchend", () => { dragging = false; });

  update();
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------
function bindToolbar() {
  el("btnNew").addEventListener("click", createNewVehicle);

  el("btnOpen").addEventListener("click", () => el("fileOpenInput").click());
  el("fileOpenInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      await importFile(file);
    }
    e.target.value = "";
    renderVehicleList();
    schedulePersist();
  });

  el("btnOpenFolder").addEventListener("click", () => el("folderOpenInput").click());
  el("folderOpenInput").addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []).filter((f) => /\.(wsv|json)$/i.test(f.name));
    e.target.value = "";
    if (files.length === 0) {
      alert("No .wsv or .json vehicle files were found in that folder.");
      return;
    }

    const before = state.vehicles.length;
    const failedNames = [];
    for (const file of files) {
      const result = await importFile(file, { select: false, quiet: true });
      if (!result) failedNames.push(file.webkitRelativePath || file.name);
    }
    const imported = state.vehicles.length - before;

    renderVehicleList();
    if (state.vehicles.length > 0) selectVehicle(state.vehicles[state.vehicles.length - 1].id);
    schedulePersist();

    let summary = `Imported ${imported} vehicle${imported === 1 ? "" : "s"} from ${files.length} file${files.length === 1 ? "" : "s"}.`;
    if (failedNames.length > 0) {
      summary += `\n\n${failedNames.length} file${failedNames.length === 1 ? "" : "s"} failed (see browser console for details):\n` +
        failedNames.slice(0, 10).join("\n") + (failedNames.length > 10 ? `\n...and ${failedNames.length - 10} more` : "");
    }
    alert(summary);
  });

  el("btnClone").addEventListener("click", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle is currently selected to clone."); return; }
    const clone = vehicle.clone();
    state.vehicles.push(clone);
    renderVehicleList();
    selectVehicle(clone.id);
    schedulePersist();
  });

  el("btnSaveAs").addEventListener("click", async () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle is currently selected."); return; }
    const saved = await saveVehicleToFile(vehicle, false);
    if (!saved) return; // user cancelled the picker
    vehicle.dirty = false;
    renderVehicleList();
  });

  el("btnSaveAsWsv").addEventListener("click", async () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle is currently selected."); return; }
    const saved = await saveVehicleToFile(vehicle, true);
    if (!saved) return; // user cancelled the picker
    vehicle.dirty = false;
    renderVehicleList();
  });

  el("btnSaveAll").addEventListener("click", () => {
    state.vehicles.forEach((v, i) => {
      setTimeout(() => { downloadVehicle(v); v.dirty = false; renderVehicleList(); }, i * 300);
    });
  });

  el("btnClose").addEventListener("click", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle is currently selected."); return; }
    if (vehicle.dirty) {
      const proceed = confirm(`"${vehicle.vehicleTitle}" has unsaved changes.\n\nClose anyway? (It will remain in your browser's autosave until you close it - this just removes it from the open list.)`);
      if (!proceed) return;
    }
    const idx = state.vehicles.findIndex((v) => v.id === vehicle.id);
    state.vehicles.splice(idx, 1);
    fileHandles.delete(vehicle.id);
    renderVehicleList();
    if (state.vehicles.length > 0) {
      selectVehicle(state.vehicles[Math.max(0, idx - 1)].id);
    } else {
      state.selectedId = null;
      showEmptyState();
    }
    schedulePersist();
  });
}

function createNewVehicle() {
  const vehicle = VehicleData.createNew();
  state.vehicles.push(vehicle);
  renderVehicleList();
  selectVehicle(vehicle.id);
  schedulePersist();
}

// Saves a vehicle as .json (isWsv=false) or .wsv (isWsv=true). When the
// File System Access API is available, the first save prompts for a
// location and remembers the file handle; every save after that (for this
// vehicle, this format, this session) writes straight to that same file -
// a real overwrite, not a new "(1)"-suffixed download. Returns false only
// if the user cancelled the save-location picker; true otherwise (including
// the plain-download fallback path, which always "succeeds").
async function saveVehicleToFile(vehicle, isWsv) {
  const content = isWsv ? vehicle.toWsvXml() : JSON.stringify(vehicle.toJSON(), null, 2);
  const mime = isWsv ? "application/xml" : "application/json";
  const ext = isWsv ? "wsv" : "json";
  const suggestedName = sanitizeFilename(vehicle.vehicleTitle) + "." + ext;

  if (supportsFileSystemAccess) {
    const handleKey = isWsv ? "wsv" : "json";
    if (!fileHandles.has(vehicle.id)) fileHandles.set(vehicle.id, {});
    const store = fileHandles.get(vehicle.id);

    try {
      let handle = store[handleKey];

      if (handle) {
        const havePermission =
          (await handle.queryPermission({ mode: "readwrite" })) === "granted" ||
          (await handle.requestPermission({ mode: "readwrite" })) === "granted";
        if (!havePermission) handle = null; // permission revoked - fall through to re-pick
      }

      if (!handle) {
        handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{
            description: isWsv ? "WSVB legacy vehicle file" : "WSVB vehicle file",
            accept: { [mime]: ["." + ext] },
          }],
        });
        store[handleKey] = handle;
      }

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return true;
    } catch (err) {
      if (err.name === "AbortError") return false; // user cancelled the picker
      console.error("File System Access save failed, falling back to plain download", err);
      // fall through to the classic download below
    }
  }

  downloadBlob(content, mime, suggestedName);
  return true;
}

function downloadBlob(content, mime, filename) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadVehicle(vehicle) {
  downloadBlob(JSON.stringify(vehicle.toJSON(), null, 2), "application/json", sanitizeFilename(vehicle.vehicleTitle) + ".json");
}

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

async function importFile(file, { select = true, quiet = false } = {}) {
  const name = file.name || "";
  const isWsv = /\.wsv$/i.test(name);
  const isJson = /\.json$/i.test(name);
  if (!isWsv && !isJson) return null; // ignore unrelated files (e.g. when importing a whole folder)

  try {
    const text = await file.text();

    if (isWsv) {
      const vehicle = VehicleData.fromWsvXml(text);
      state.vehicles.push(vehicle);
      if (select) selectVehicle(vehicle.id);
      return vehicle;
    }

    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    let last = null;
    for (const item of items) {
      const vehicle = VehicleData.fromJSON(item);
      vehicle.dirty = false;
      state.vehicles.push(vehicle);
      last = vehicle;
    }
    if (last && select) selectVehicle(last.id);
    return last;
  } catch (err) {
    console.error(`Error opening ${name}:`, err);
    if (!quiet) alert(`Error opening ${name}:\n${err.message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vehicle list / selection
// ---------------------------------------------------------------------------
function getSelectedVehicle() {
  return state.vehicles.find((v) => v.id === state.selectedId) || null;
}

function renderVehicleList() {
  const list = el("vehicleList");
  list.innerHTML = "";
  for (const vehicle of state.vehicles) {
    const li = document.createElement("li");
    const line1 = document.createElement("div");
    line1.className = "vehicle-list-line1";
    line1.textContent = vehicle.vehicleTitleLine1;
    const line2 = document.createElement("div");
    line2.className = "vehicle-list-line2";
    line2.textContent = vehicle.vehicleTitleLine2;
    if (vehicle.dirty) {
      const dot = document.createElement("span");
      dot.className = "dirty-dot";
      dot.textContent = "●";
      line1.appendChild(dot);
    }
    li.appendChild(line1);
    li.appendChild(line2);
    if (vehicle.id === state.selectedId) li.classList.add("selected");
    li.addEventListener("click", () => selectVehicle(vehicle.id));
    list.appendChild(li);
  }
}

function selectVehicle(id) {
  state.selectedId = id;
  const vehicle = getSelectedVehicle();
  if (!vehicle) { showEmptyState(); return; }
  showEditor();
  fillFormFromVehicle(vehicle);
  updateComputedUI(vehicle);
  renderVehicleList();
}

function showEmptyState() {
  el("emptyState").hidden = false;
  el("editorBody").hidden = true;
  el("summaryPanel").hidden = true;
}
function showEditor() {
  el("emptyState").hidden = true;
  el("editorBody").hidden = false;
  el("summaryPanel").hidden = false;
  el("editorSection").scrollTop = 0;
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function bindTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      el("tab-" + btn.dataset.tab).classList.add("active");
    });
  });
}

// ---------------------------------------------------------------------------
// Info tab bindings
// ---------------------------------------------------------------------------
function bindInfoFields() {
  el("fVehicleName").addEventListener("input", (e) => withVehicle((v) => { v.vehicleName = e.target.value; }));
  el("fVehicleClass").addEventListener("input", (e) => withVehicle((v) => { v.vehicleClass = e.target.value; }));
  el("fVehicleMission").addEventListener("input", (e) => withVehicle((v) => { v.vehicleMission = e.target.value; }));
  el("fTier").addEventListener("input", (e) => withVehicle((v) => { v.tier = toInt(e.target.value); }));
  el("fTL").addEventListener("input", (e) => withVehicle((v) => { v.tl = toInt(e.target.value); }));
  el("fActualMaxTons").addEventListener("input", (e) => withVehicle((v) => { v.actualMaxTons = toFloat(e.target.value); }));

  el("btnUseRecommendedTons").addEventListener("click", () => withVehicle((v) => {
    v.actualMaxTons = v.tonsRecommended;
    el("fActualMaxTons").value = v.actualMaxTons;
  }));

  el("fVTOLATOL").addEventListener("change", (e) => withVehicle((v) => { v.vtolAtol = e.target.checked; }));
  el("fIncludesLifeSupport").addEventListener("change", (e) => withVehicle((v) => { v.includesLifeSupport = e.target.checked; }));

  el("fCapitalMk").addEventListener("input", (e) => withVehicle((v) => { v.capitalMk = toInt(e.target.value); }));
  el("fStandardMk").addEventListener("input", (e) => withVehicle((v) => { v.standardMk = toInt(e.target.value); }));
  el("fMissileMk").addEventListener("input", (e) => withVehicle((v) => { v.missileMk = toInt(e.target.value); }));
  el("fSlugMk").addEventListener("input", (e) => withVehicle((v) => { v.slugMk = toInt(e.target.value); }));

  el("fVehicleDescription").addEventListener("input", (e) => withVehicle((v) => { v.vehicleDescription = e.target.value; }));
}

function withVehicle(fn) {
  const vehicle = getSelectedVehicle();
  if (!vehicle) return;
  fn(vehicle);
  onVehicleChanged(vehicle);
}

// ---------------------------------------------------------------------------
// Traits & Boutique Services
// ---------------------------------------------------------------------------
function bindTraitsAndBoutique() {
  el("traitsRepositoryTable").addEventListener("click", (e) => {
    const vehicle = getSelectedVehicle();
    const th = e.target.closest("th.sortable");
    if (th) {
      const key = th.dataset.sortKey;
      if (traitRepoSort.key === key) traitRepoSort.dir *= -1;
      else { traitRepoSort.key = key; traitRepoSort.dir = 1; }
      renderTraitsRepository(vehicle);
      return;
    }
    const tr = e.target.closest("tr.repo-row");
    if (!tr || !vehicle) return;
    selectedTraitRepoKey = tr.dataset.key;
    renderTraitsRepository(vehicle);
    showTraitRepoInfo(vehicle, selectedTraitRepoKey);
  });

  el("fTraitLevel").addEventListener("input", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) return;
    renderTraitsRepository(vehicle);
    if (selectedTraitRepoKey) showTraitRepoInfo(vehicle, selectedTraitRepoKey);
  });

  el("btnAddTrait").addEventListener("click", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle selected."); return; }
    if (!selectedTraitRepoKey) { alert("Select a trait from the repository first."); return; }
    const repoTrait = TRAITS_REPOSITORY.find((t) => t.traitName === selectedTraitRepoKey);
    if (!repoTrait) return;
    if (vehicle.selectedTraits.some((s) => s.traitName === repoTrait.traitName)) {
      alert(`${repoTrait.traitName} has already been added.`);
      return;
    }
    const level = toInt(el("fTraitLevel").value) || 1;
    vehicle.selectedTraits.push(new Trait({ ...repoTrait, selectedLevel: level }));
    onVehicleChanged(vehicle);
  });

  el("traitsSelectedTable").addEventListener("click", (e) => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) return;
    const th = e.target.closest("th.sortable");
    if (th) {
      const key = th.dataset.sortKey;
      if (traitSelectedSort.key === key) traitSelectedSort.dir *= -1;
      else { traitSelectedSort.key = key; traitSelectedSort.dir = 1; }
      renderSelectedTraits(vehicle);
      return;
    }
    const tr = e.target.closest("tr.repo-row");
    if (!tr) return;
    selectedTraitSelKey = tr.dataset.key;
    renderSelectedTraits(vehicle);
    showSelectedTraitInfo(vehicle, selectedTraitSelKey);
  });

  el("btnRemoveTrait").addEventListener("click", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle selected."); return; }
    if (!selectedTraitSelKey) { alert("Select a trait to remove."); return; }
    const idx = vehicle.selectedTraits.findIndex((t) => t.traitName === selectedTraitSelKey);
    if (idx === -1) { alert("Select a trait to remove."); return; }
    vehicle.selectedTraits.splice(idx, 1);
    selectedTraitSelKey = null;
    onVehicleChanged(vehicle);
  });

  el("boutiqueRepositoryTable").addEventListener("click", (e) => {
    const vehicle = getSelectedVehicle();
    const th = e.target.closest("th.sortable");
    if (th) {
      const key = th.dataset.sortKey;
      if (boutiqueRepoSort.key === key) boutiqueRepoSort.dir *= -1;
      else { boutiqueRepoSort.key = key; boutiqueRepoSort.dir = 1; }
      renderBoutiqueRepository(vehicle);
      return;
    }
    const tr = e.target.closest("tr.repo-row");
    if (!tr || !vehicle) return;
    selectedBoutiqueRepoKey = tr.dataset.key;
    renderBoutiqueRepository(vehicle);
    showBoutiqueRepoInfo(vehicle, selectedBoutiqueRepoKey);
  });

  el("btnAddBoutique").addEventListener("click", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle selected."); return; }
    if (!selectedBoutiqueRepoKey) { alert("Select a Boutique Service from the repository first."); return; }
    const repoService = BOUTIQUE_SERVICES_REPOSITORY.find((b) => b.boutiqueServiceName === selectedBoutiqueRepoKey);
    if (!repoService) return;
    if (vehicle.selectedBoutiqueServices.some((s) => s.boutiqueServiceName === repoService.boutiqueServiceName)) {
      alert(`${repoService.boutiqueServiceName} has already been added.`);
      return;
    }
    vehicle.selectedBoutiqueServices.push(new BoutiqueService(repoService));
    onVehicleChanged(vehicle);
  });

  el("boutiqueSelectedTable").addEventListener("click", (e) => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) return;
    const th = e.target.closest("th.sortable");
    if (th) {
      const key = th.dataset.sortKey;
      if (boutiqueSelectedSort.key === key) boutiqueSelectedSort.dir *= -1;
      else { boutiqueSelectedSort.key = key; boutiqueSelectedSort.dir = 1; }
      renderSelectedBoutique(vehicle);
      return;
    }
    const tr = e.target.closest("tr.repo-row");
    if (!tr) return;
    selectedBoutiqueSelKey = tr.dataset.key;
    renderSelectedBoutique(vehicle);
    showSelectedBoutiqueInfo(vehicle, selectedBoutiqueSelKey);
  });

  el("btnRemoveBoutique").addEventListener("click", () => {
    const vehicle = getSelectedVehicle();
    if (!vehicle) { alert("No vehicle selected."); return; }
    if (!selectedBoutiqueSelKey) { alert("Select a Boutique Service to remove."); return; }
    const idx = vehicle.selectedBoutiqueServices.findIndex((b) => b.boutiqueServiceName === selectedBoutiqueSelKey);
    if (idx === -1) { alert("Select a Boutique Service to remove."); return; }
    vehicle.selectedBoutiqueServices.splice(idx, 1);
    selectedBoutiqueSelKey = null;
    onVehicleChanged(vehicle);
  });
}

function showTraitRepoInfo(vehicle, key) {
  const repoTrait = TRAITS_REPOSITORY.find((t) => t.traitName === key);
  if (!repoTrait) return;
  const level = toInt(el("fTraitLevel").value) || 1;
  const preview = new Trait({ ...repoTrait, selectedLevel: level });
  el("traitInformation").textContent =
    `${repoTrait.traitName}\n` +
    `CP to Buy: ${preview.costTrait(vehicle)}\n` +
    `Max Level: ${repoTrait.maxLevel}\n` +
    `Prerequisites: ${repoTrait.prerequisite}\n` +
    `Note: ${repoTrait.note}`;
}

function showSelectedTraitInfo(vehicle, key) {
  const trait = vehicle.selectedTraits.find((t) => t.traitName === key);
  if (!trait) return;
  el("traitInformation").textContent =
    `${trait.traitName}\n` +
    `Selected Level: ${trait.selectedLevel}\n` +
    `CP: ${trait.costTrait(vehicle)}\n` +
    `Max Level: ${trait.maxLevel}\n` +
    `Prerequisites: ${trait.prerequisite}\n` +
    `Note: ${trait.note}`;
  el("fTraitLevel").value = trait.selectedLevel;
}

function showBoutiqueRepoInfo(vehicle, key) {
  const repoService = BOUTIQUE_SERVICES_REPOSITORY.find((b) => b.boutiqueServiceName === key);
  if (!repoService) return;
  const preview = new BoutiqueService(repoService);
  el("boutiqueInformation").textContent =
    `${repoService.boutiqueServiceName}\n` +
    `CP to Buy: ${preview.costBoutiqueService(vehicle)}\n` +
    `Note: ${repoService.note}`;
}

function showSelectedBoutiqueInfo(vehicle, key) {
  const service = vehicle.selectedBoutiqueServices.find((s) => s.boutiqueServiceName === key);
  if (!service) return;
  el("boutiqueInformation").textContent =
    `${service.boutiqueServiceName}\n` +
    `CP: ${service.costBoutiqueService(vehicle)}\n` +
    `Note: ${service.note}`;
}

// ---------------------------------------------------------------------------
// Fill form from vehicle (on selection change only - never during typing)
// ---------------------------------------------------------------------------
function fillFormFromVehicle(vehicle) {
  el("fVehicleName").value = vehicle.vehicleName;
  el("fVehicleClass").value = vehicle.vehicleClass;
  el("fVehicleMission").value = vehicle.vehicleMission;
  el("fTier").value = vehicle.tier;
  el("fTL").value = vehicle.tl;
  el("fActualMaxTons").value = vehicle.actualMaxTons;

  for (const cfg of ENUM_SELECTS) {
    el(cfg.id).value = vehicle[cfg.field];
  }

  el("fVTOLATOL").checked = vehicle.vtolAtol;
  el("fIncludesLifeSupport").checked = vehicle.includesLifeSupport;

  el("fCapitalMk").value = vehicle.capitalMk;
  el("fStandardMk").value = vehicle.standardMk;
  el("fMissileMk").value = vehicle.missileMk;
  el("fSlugMk").value = vehicle.slugMk;

  for (const def of OPERATIONS_FEATURES) {
    el(`op-${def.key}-a`).value = vehicle[def.aiField];
    el(`op-${def.key}-b`).value = vehicle[def.crewField];
  }
  for (const def of PLATFORM_FEATURES) {
    el(`pl-${def.key}-a`).value = vehicle[def.levelField];
    el(`pl-${def.key}-b`).value = vehicle[def.bonusField];
  }

  el("fVehicleDescription").value = vehicle.vehicleDescription;
  el("traitInformation").textContent = "";
  el("boutiqueInformation").textContent = "";
  selectedTraitRepoKey = null;
  selectedTraitSelKey = null;
  selectedBoutiqueRepoKey = null;
  selectedBoutiqueSelKey = null;
  renderTraitsRepository(vehicle);
  renderSelectedTraits(vehicle);
  renderBoutiqueRepository(vehicle);
  renderSelectedBoutique(vehicle);
}

// ---------------------------------------------------------------------------
// Recompute + repaint everything derived (called after every field change)
// ---------------------------------------------------------------------------
function onVehicleChanged(vehicle) {
  vehicle.dirty = true;
  updateComputedUI(vehicle);
  renderVehicleList();
  schedulePersist();
}

function updateComputedUI(vehicle) {
  el("lRecommendedMaxTons").textContent = "Recommended Volume: " + fmtN0(vehicle.tonsRecommended);
  el("lBuildTons").textContent = "Build Tons: " + formatTons(vehicle.buildTons);

  for (const def of OPERATIONS_FEATURES) {
    const hasAdvantage = vehicle.getTraitSelectedLevel(def.advancedTrait) > 0;
    el(`op-${def.key}-mk`).textContent = dashIfZero(fmtG(vehicle[def.mkProp])) + (hasAdvantage ? "A" : "");
    el(`op-${def.key}-cp`).textContent = dashIfZero(fmtG(vehicle[def.cpProp]));
    el(`op-${def.key}-tons`).textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle[def.cpProp])));
    el(`op-${def.key}-note`).textContent = def.noteFn(vehicle);
  }
  for (const def of PLATFORM_FEATURES) {
    el(`pl-${def.key}-mk`).textContent = dashIfZero(fmtG(vehicle[def.mkProp]));
    el(`pl-${def.key}-cp`).textContent = dashIfZero(fmtG(vehicle[def.cpProp]));
    el(`pl-${def.key}-tons`).textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle[def.cpProp])));
    el(`pl-${def.key}-note`).textContent = def.noteFn(vehicle);
  }

  el("wCapital").textContent = `AB ${fmtG(vehicle.capitalAttackBonus)} | Range ${fmtG(vehicle.capitalRange)} | Damage ${fmtG(vehicle.capitalDamage)}`;
  el("wStandard").textContent = `AB ${fmtG(vehicle.standardAttackBonus)} | Range ${fmtG(vehicle.standardRange)} | Damage ${fmtG(vehicle.standardDamage)}`;
  el("wMissile").textContent = `AB ${fmtG(vehicle.missileAttackBonus)} | Range ${fmtG(vehicle.missileRange)} | Damage ${fmtG(vehicle.missileDamage)}`;
  el("wSlug").textContent = `AB ${fmtG(vehicle.slugAttackBonus)} | Range ${fmtG(vehicle.slugRange)} | Damage ${fmtG(vehicle.slugDamage)}`;

  const weaponsCP = vehicle.cpCostWeaponCapital + vehicle.cpCostWeaponStandard + vehicle.cpCostWeaponMissiles + vehicle.cpCostWeaponSlug;
  const totalFeatureTons =
    OPERATIONS_FEATURES.reduce((sum, def) => sum + vehicle.getFeatureTons(vehicle[def.cpProp]), 0) +
    PLATFORM_FEATURES.reduce((sum, def) => sum + vehicle.getFeatureTons(vehicle[def.cpProp]), 0);
  const totalWeaponTons =
    vehicle.getFeatureTons(vehicle.cpCostWeaponCapital) + vehicle.getFeatureTons(vehicle.cpCostWeaponStandard) +
    vehicle.getFeatureTons(vehicle.cpCostWeaponMissiles) + vehicle.getFeatureTons(vehicle.cpCostWeaponSlug);

  const traitsCP = vehicle.sumSelectedTraitsBaseCP();
  const boutiqueCP = vehicle.sumSelectedBoutiqueServicesBaseCP();

  el("sMaxCP").textContent = dashIfZero(fmtG(vehicle.cpMax));
  el("sMaxTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle.cpMax)));
  el("sUnspentCP").textContent = dashIfZero(fmtG(vehicle.unspentCP));
  el("sUnspentTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle.unspentCP)));
  el("sUnspentCP").classList.toggle("value-negative", vehicle.unspentCP < 0);
  el("sUnspentCP").classList.toggle("value-positive", vehicle.unspentCP > 0);
  el("sFeaturesCP").textContent = dashIfZero(fmtG(vehicle.cpCostTotalFeatures));
  el("sWeaponsCP").textContent = dashIfZero(fmtG(weaponsCP));
  el("sTraitsCP").textContent = dashIfZero(fmtG(traitsCP));
  el("sTraitsTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(traitsCP)));
  el("sBoutiqueCP").textContent = dashIfZero(fmtG(boutiqueCP));
  el("sBoutiqueTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(boutiqueCP)));
  el("sEnvironmentalCP").textContent = dashIfZero(fmtG(vehicle.cpCostEnvironmental));
  el("sEnvironmentalTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle.cpCostEnvironmental)));
  el("sInterfaceOptionCP").textContent = dashIfZero(fmtG(vehicle.cpCostInterfaceOptions));
  el("sInterfaceOptionTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle.cpCostInterfaceOptions)));
  el("sTotalFeatureTons").textContent = dashIfZero(fmtN0(totalFeatureTons));
  el("sTotalWeaponTons").textContent = dashIfZero(fmtN0(totalWeaponTons));
  el("sFrameStrengthLabel").textContent = `Frame Strength (${vehicle.frameStrengthSelected})`;
  el("sFrameStrengthCP").textContent = dashIfZero(fmtG(vehicle.cpCostFrameStrength));
  el("sFrameStrengthTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle.cpCostFrameStrength)));
  el("sCompartmentalizationLabel").textContent = `Compartmentalization (${vehicle.compartmentalizationSelected})`;
  el("sCompartmentalizationCP").textContent = dashIfZero(fmtG(vehicle.cpCostCompartmentalization));
  el("sCompartmentalizationTons").textContent = dashIfZero(fmtN0(vehicle.getFeatureTons(vehicle.cpCostCompartmentalization)));

  el("statisticsBlock").innerHTML = vehicle.statisticsHTML;

  // Cost columns in these tables depend on vehicle.tier (Traits) and can
  // change from any field edit, not just ones made on their own tab.
  renderTraitsRepository(vehicle);
  renderSelectedTraits(vehicle);
  renderBoutiqueRepository(vehicle);
  renderSelectedBoutique(vehicle);
}

// Renders a literal "0" as a dash so a sea of zero rows doesn't bury the
// non-zero values. Only used for plain numeric CP/Mk/Tons cells, never for
// negative numbers (those stay visible - they're meaningful, e.g. unspent CP).
function dashIfZero(value) {
  const s = typeof value === "number" ? String(value) : value;
  return s === "0" ? "–" : s;
}

function formatTons(tons) {
  if (tons >= 100) return fmtN0(tons);
  if (tons >= 10) return fmtN1(tons);
  return fmtN2(tons);
}

// ---------------------------------------------------------------------------
// Persistence (localStorage autosave)
// ---------------------------------------------------------------------------
function loadPersisted() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return data.map((d) => VehicleData.fromJSON(d));
  } catch (err) {
    console.error("Failed to load autosaved vehicles", err);
    return [];
  }
}

function schedulePersist() {
  el("autosaveStatus").textContent = "Saving...";
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 400);
}

function persist() {
  const data = state.vehicles.map((v) => v.toJSON());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  const now = new Date();
  el("autosaveStatus").textContent = "Saved locally at " + now.toLocaleTimeString();
}

window.addEventListener("beforeunload", (e) => {
  if (state.vehicles.some((v) => v.dirty)) {
    persist();
  }
});

document.addEventListener("DOMContentLoaded", init);
