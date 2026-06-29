/* cost.js — DOM wiring for the MiracleWS Cost Simulator.
   Pure model functions live in cost-model.js (selfHostedResult, serversFor, DEFAULTS).
   This file: read inputs → build workload/box/assumptions → render results.
*/

(function () {
  "use strict";

  // ── Helpers ──────────────────────────────────────────────────────────────

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function fmt(n) {
    return n.toLocaleString("en-US");
  }

  function fmtDollar(n) {
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    return "$" + fmt(Math.round(n));
  }

  function fmtKB(kb) {
    if (kb < 1) return (kb * 1024).toFixed(1) + " B";
    if (kb < 1024) return kb.toFixed(2) + " KB";
    return (kb / 1024).toFixed(2) + " MB";
  }

  function parseNum(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback;
    var v = parseFloat(el.value);
    return isFinite(v) && v >= 0 ? v : fallback;
  }

  function parseIntNum(id, fallback) {
    var el = document.getElementById(id);
    if (!el) return fallback;
    var v = parseInt(el.value, 10);
    return isFinite(v) && v > 0 ? v : fallback;
  }

  function setVal(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // ── Bootstrap selects from DEFAULTS ──────────────────────────────────────

  function populateStackSelect() {
    var sel = document.getElementById("input-stack");
    if (!sel) return;
    Object.keys(DEFAULTS.stacks).forEach(function (key) {
      if (key === "miraclews") return; // MiracleWS is always the "after" side
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = DEFAULTS.stacks[key].label;
      if (key === "tungstenite") opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function populatePresetSelect() {
    var sel = document.getElementById("input-preset");
    if (!sel) return;
    Object.keys(DEFAULTS.boxes).forEach(function (key) {
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = DEFAULTS.boxes[key].label;
      if (key === DEFAULTS.defaultBox) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function applyPreset(key) {
    var b = DEFAULTS.boxes[key];
    if (!b) return;
    var vcpu = document.getElementById("input-vcpu");
    var ram  = document.getElementById("input-ram");
    var price = document.getElementById("input-price");
    if (vcpu)  vcpu.value  = b.vcpu;
    if (ram)   ram.value   = b.ramGB;
    if (price) price.value = b.priceMo;
  }

  // ── Assumptions panel: build stack rows ──────────────────────────────────

  function makeEl(tag, props) {
    var el = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) { el[k] = props[k]; });
    return el;
  }

  function buildAssumptionStacks() {
    var container = document.getElementById("assumptions-stacks");
    if (!container) return;
    // Clear without innerHTML
    while (container.firstChild) container.removeChild(container.firstChild);

    Object.keys(DEFAULTS.stacks).forEach(function (key) {
      var s = DEFAULTS.stacks[key];

      var row = makeEl("div", { className: "assumption-stack-row" });

      // Name + tag badge
      var nameDiv = makeEl("div", { className: "assumption-stack-row__name" });
      nameDiv.appendChild(makeEl("span", { textContent: s.label }));
      var tagSpan = makeEl("span", { className: "tag tag--" + s.tag, textContent: s.tag });
      nameDiv.appendChild(tagSpan);
      row.appendChild(nameDiv);

      // Userspace field
      var usDiv = makeEl("div", { className: "assumption-field" });
      var usLabel = makeEl("label", {
        className: "assumption-field__label",
        htmlFor: "a-us-" + key,
        textContent: "Userspace KB/conn",
      });
      var usInput = makeEl("input");
      usInput.type = "number"; usInput.id = "a-us-" + key;
      usInput.dataset.stack = key; usInput.dataset.field = "userspaceKB";
      usInput.value = s.userspaceKB; usInput.step = "0.01"; usInput.min = "0";
      usDiv.appendChild(usLabel);
      usDiv.appendChild(usInput);
      row.appendChild(usDiv);

      // Throughput field
      var tpDiv = makeEl("div", { className: "assumption-field" });
      var tpLabel = makeEl("label", {
        className: "assumption-field__label",
        htmlFor: "a-tp-" + key,
        textContent: "Throughput Mps",
      });
      var tpInput = makeEl("input");
      tpInput.type = "number"; tpInput.id = "a-tp-" + key;
      tpInput.dataset.stack = key; tpInput.dataset.field = "throughputMps";
      tpInput.value = s.throughputMps; tpInput.step = "0.01"; tpInput.min = "0.01";
      tpDiv.appendChild(tpLabel);
      tpDiv.appendChild(tpInput);
      row.appendChild(tpDiv);

      container.appendChild(row);
    });
  }

  // ── Read live assumptions (deep-clone DEFAULTS, overlay edited fields) ────

  function readAssumptions() {
    var a = deepClone(DEFAULTS);

    // Global fields
    var kernelFloorKB = parseNum("a-kernelFloorKB", a.kernelFloorKB);
    var rustlsKB      = parseNum("a-rustlsKB", a.rustlsKB);
    var usableRamFrac = parseNum("a-usableRamFrac", a.usableRamFrac);
    var benchCores    = parseIntNum("a-benchCores", a.benchCores);

    a.kernelFloorKB  = kernelFloorKB;
    a.rustlsKB       = rustlsKB;
    a.usableRamFrac  = Math.min(Math.max(usableRamFrac, 0.01), 1);
    a.benchCores     = benchCores;

    // Per-stack fields
    Object.keys(a.stacks).forEach(function (key) {
      var usEl = document.getElementById("a-us-" + key);
      var tpEl = document.getElementById("a-tp-" + key);
      if (usEl) {
        var v = parseFloat(usEl.value);
        if (isFinite(v) && v >= 0) a.stacks[key].userspaceKB = v;
      }
      if (tpEl) {
        var v2 = parseFloat(tpEl.value);
        if (isFinite(v2) && v2 > 0) a.stacks[key].throughputMps = v2;
      }
    });

    return a;
  }

  // ── Read workload ─────────────────────────────────────────────────────────

  function readWorkload() {
    return {
      conns:         Math.max(0, parseNum("input-conns", 1000000)),
      messagesPerSec: Math.max(0, parseNum("input-msgs", 10000)),
      fanout:        Math.max(1, parseIntNum("input-fanout", 1)),
      tlsInProcess:  document.getElementById("input-tls")
                       ? document.getElementById("input-tls").checked
                       : false,
    };
  }

  // ── Read box ─────────────────────────────────────────────────────────────

  function readBox() {
    return {
      vcpu:    Math.max(1, parseIntNum("input-vcpu", 16)),
      ramGB:   Math.max(1, parseNum("input-ram", 64)),
      priceMo: Math.max(1, parseNum("input-price", 375)),
    };
  }

  // ── Render one card ───────────────────────────────────────────────────────

  function renderCard(prefix, stackKey, result, assumptions, workload) {
    var s = assumptions.stacks[stackKey];
    var us   = s.userspaceKB;
    var kern = assumptions.kernelFloorKB;
    var tls  = workload.tlsInProcess ? assumptions.rustlsKB : 0;

    setVal(prefix + "-servers",  result.servers > 0 ? fmt(result.servers) : "0");
    setVal(prefix + "-monthly",  fmtDollar(result.monthly));
    setVal(prefix + "-us",       fmtKB(us));
    setVal(prefix + "-kern",     fmtKB(kern));
    setVal(prefix + "-total",    fmtKB(result.perConnKB));

    // TLS row visibility
    var tlsRow = document.getElementById(prefix + "-tls-row");
    var tlsVal = document.getElementById(prefix + "-tls-val");
    if (tlsRow) tlsRow.style.display = workload.tlsInProcess ? "" : "none";
    if (tlsVal) tlsVal.textContent = fmtKB(tls);

    // Bound badge
    var badge = document.getElementById(prefix + "-badge");
    if (badge) {
      badge.textContent = result.bound;
      badge.className = "result-card__bound-badge result-card__bound-badge--" + result.bound.toLowerCase();
    }
  }

  // ── Update disclaimer kernel hint ─────────────────────────────────────────

  function updateDisclaimer(assumptions) {
    var el = document.getElementById("disc-kern");
    if (el) el.textContent = fmtKB(assumptions.kernelFloorKB);
  }

  // ── Render saving headline ────────────────────────────────────────────────

  function renderHeadline(currentResult, mwsResult) {
    var el   = document.getElementById("saving-headline-text");
    var wrap = document.getElementById("saving-headline");
    if (!el || !wrap) return;

    // Clear previous content
    while (el.firstChild) el.removeChild(el.firstChild);

    var fromServers = currentResult.servers;
    var toServers   = mwsResult.servers;
    var savingMo    = currentResult.monthly - mwsResult.monthly;
    var savingYr    = savingMo * 12;
    var pct         = fromServers > 0 ? Math.round((1 - toServers / fromServers) * 100) : 0;

    // Helper: append a text node
    function txt(str) { el.appendChild(document.createTextNode(str)); }
    // Helper: append an accent <span>
    function accent(str) {
      var s = document.createElement("span");
      s.className = "accent";
      s.textContent = str;
      el.appendChild(s);
    }

    function plural(n) { return n === 1 ? "server" : "servers"; }

    if (fromServers === 0 && toServers === 0) {
      txt("Enter a workload to compute a comparison.");
      wrap.className = "saving-headline saving-headline--nosave";
      return;
    }

    if (savingMo <= 0 || fromServers <= toServers) {
      accent(fmt(fromServers));
      txt(" " + plural(fromServers) + " → ");
      accent(fmt(toServers));
      txt(" " + plural(toServers) + " · no cost saving at this workload");
      wrap.className = "saving-headline saving-headline--nosave";
      return;
    }

    accent(fmt(fromServers));
    txt(" → ");
    accent(fmt(toServers));
    txt(" " + plural(toServers) + " · save ");
    accent(fmtDollar(savingMo) + "/mo");
    txt(" (");
    accent(fmtDollar(savingYr) + "/yr");
    txt(" · ");
    accent(pct + "%");
    txt(")");
    wrap.className = "saving-headline";
  }

  // ── Update card title for current stack ──────────────────────────────────

  function updateCardTitle(stackKey, assumptions) {
    var nameEl = document.getElementById("card-current-name");
    if (nameEl && assumptions.stacks[stackKey]) {
      nameEl.textContent = assumptions.stacks[stackKey].label;
    }
  }

  // ── Central recompute + render ────────────────────────────────────────────

  function compute() {
    var assumptions = readAssumptions();
    var workload    = readWorkload();
    var box         = readBox();

    var stackSel = document.getElementById("input-stack");
    var stackKey = stackSel ? stackSel.value : "tungstenite";

    var currentResult = selfHostedResult(stackKey,    workload, assumptions, box);
    var mwsResult     = selfHostedResult("miraclews", workload, assumptions, box);

    updateCardTitle(stackKey, assumptions);
    renderCard("card-current", stackKey,    currentResult, assumptions, workload);
    renderCard("card-mws",     "miraclews", mwsResult,     assumptions, workload);
    renderHeadline(currentResult, mwsResult);
    updateDisclaimer(assumptions);
  }

  // ── Global assumption fields initial fill ────────────────────────────────

  function fillGlobalAssumptionFields() {
    var fields = {
      "a-kernelFloorKB":  DEFAULTS.kernelFloorKB,
      "a-rustlsKB":       DEFAULTS.rustlsKB,
      "a-usableRamFrac":  DEFAULTS.usableRamFrac,
      "a-benchCores":     DEFAULTS.benchCores,
    };
    Object.keys(fields).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = fields[id];
    });
  }

  // ── Reset to defaults ─────────────────────────────────────────────────────

  function resetToDefaults() {
    // Workload
    document.getElementById("input-conns").value  = 1000000;
    document.getElementById("input-msgs").value   = 1200000;
    document.getElementById("input-fanout").value  = 1;
    document.getElementById("input-tls").checked  = false;

    // Stack
    var stackSel = document.getElementById("input-stack");
    if (stackSel) stackSel.value = "tungstenite";

    // Preset + box fields
    var presetSel = document.getElementById("input-preset");
    if (presetSel) presetSel.value = DEFAULTS.defaultBox;
    applyPreset(DEFAULTS.defaultBox);

    // Global assumption fields
    fillGlobalAssumptionFields();

    // Per-stack assumption fields
    Object.keys(DEFAULTS.stacks).forEach(function (key) {
      var s = DEFAULTS.stacks[key];
      var usEl = document.getElementById("a-us-" + key);
      var tpEl = document.getElementById("a-tp-" + key);
      if (usEl) usEl.value = s.userspaceKB;
      if (tpEl) tpEl.value = s.throughputMps;
    });

    compute();
  }

  // ── Wire up event listeners ───────────────────────────────────────────────

  function wireListeners() {
    var ids = [
      "input-conns", "input-msgs", "input-fanout", "input-payload",
      "input-tls", "input-stack",
      "input-vcpu", "input-ram", "input-price",
      "a-kernelFloorKB", "a-rustlsKB", "a-usableRamFrac", "a-benchCores",
    ];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("input", compute);
    });

    // Box preset change — repopulate editable fields
    var presetSel = document.getElementById("input-preset");
    if (presetSel) {
      presetSel.addEventListener("change", function () {
        applyPreset(presetSel.value);
        compute();
      });
    }

    // Per-stack assumption inputs (added dynamically)
    var assumptionsPanel = document.getElementById("assumptions-panel");
    if (assumptionsPanel) {
      assumptionsPanel.addEventListener("input", function (e) {
        if (e.target.matches("[data-stack]")) compute();
      });
    }

    // Reset button
    var resetBtn = document.getElementById("btn-reset");
    if (resetBtn) resetBtn.addEventListener("click", resetToDefaults);
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    populateStackSelect();
    populatePresetSelect();
    applyPreset(DEFAULTS.defaultBox);
    fillGlobalAssumptionFields();
    buildAssumptionStacks();
    wireListeners();
    compute(); // initial render with defaults
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
