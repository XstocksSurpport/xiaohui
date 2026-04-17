(function () {
  "use strict";

  try {
    sessionStorage.removeItem("zzlove_site_unlock_v1");
  } catch (e) {}

  var SLOT_COUNT = 52;
  /** 由 photo-manifest.js 的 window.__WALL_PHOTOS__ 顺序对应爱心格子编号 1→52 */
  function buildPhotoBySlot() {
    var list = typeof window !== "undefined" ? window.__WALL_PHOTOS__ : null;
    var map = {};
    if (!list || !list.length) return map;
    var i;
    var max = Math.min(SLOT_COUNT, list.length);
    for (i = 0; i < max; i++) {
      map[i + 1] = list[i];
    }
    return map;
  }
  var PHOTO_BY_SLOT = buildPhotoBySlot();
  var SITE_PASSWORD = "txh1314";
  /** 仅本次打开页面有效；刷新或重新打开都要再输密码 */
  var gateOkThisLoad = false;
  /** 背景音乐文件；若有可直接播放的 mp3 直链，可改成完整 https://… 地址 */
  var BGM_SRC = "audio/bgm.mp3";

  function getBgm() {
    return document.getElementById("bgm");
  }

  function getPhonoWrap() {
    return document.getElementById("phonographWrap");
  }

  function syncPhonoUi() {
    var a = getBgm();
    var wrap = getPhonoWrap();
    var btn = document.getElementById("phonographBtn");
    if (!a || !wrap) return;
    var on = !a.paused;
    wrap.classList.toggle("is-playing", on);
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  /** 在用户点击等手势回调里调用，尽量满足浏览器自动播放策略 */
  function tryPlayBgmInGesture() {
    var a = getBgm();
    if (!a) return;
    a.volume = 0.82;
    a.play().then(syncPhonoUi).catch(syncPhonoUi);
  }

  function setupBgm() {
    var a = getBgm();
    var btn = document.getElementById("phonographBtn");
    if (!a || !btn) return;
    if (BGM_SRC) {
      a.src = BGM_SRC;
    }
    a.addEventListener("play", syncPhonoUi);
    a.addEventListener("pause", syncPhonoUi);
    a.addEventListener("ended", syncPhonoUi);
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (a.paused) {
        tryPlayBgmInGesture();
      } else {
        a.pause();
        syncPhonoUi();
      }
    });
  }

  function heartPoint(t) {
    var x = 16 * Math.pow(Math.sin(t), 3);
    var y =
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t);
    return { x: x, y: -y };
  }

  function buildHeartSlots(count) {
    var points = [];
    var i;
    for (i = 0; i < count; i++) {
      var t = (i / count) * Math.PI * 2;
      points.push(heartPoint(t));
    }

    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    for (i = 0; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      maxX = Math.max(maxX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxY = Math.max(maxY, points[i].y);
    }

    var padPct = 6;
    var span = 100 - 2 * padPct;
    var norm = [];
    for (i = 0; i < points.length; i++) {
      var nx = (points[i].x - minX) / (maxX - minX);
      var ny = (points[i].y - minY) / (maxY - minY);
      norm.push({
        x: padPct + nx * span,
        y: padPct + ny * span,
      });
    }
    return norm;
  }

  function renderHeartGrid() {
    var grid = document.getElementById("heartGrid");
    if (!grid) return;

    var positions = buildHeartSlots(SLOT_COUNT);
    var iw = window.innerWidth || document.documentElement.clientWidth;
    var narrow = iw <= 540;
    var w = grid.getBoundingClientRect().width;
    if (!w || w < 48) {
      w = Math.min(iw * (narrow ? 0.9 : 0.8), narrow ? 420 : 360);
    }
    var slotRatio = narrow ? 0.13 : 0.105;
    var slotMin = narrow ? 34 : 28;
    var slot = Math.max(slotMin, Math.round(w * slotRatio));

    grid.style.setProperty("--slot-size", slot + "px");

    grid.innerHTML = "";
    var n;
    for (n = 0; n < SLOT_COUNT; n++) {
      var cell = document.createElement("div");
      cell.className = "photo-slot";
      cell.style.setProperty("--x", positions[n].x + "%");
      cell.style.setProperty("--y", positions[n].y + "%");
      var slotNum = n + 1;
      var src = PHOTO_BY_SLOT[slotNum];
      if (src) {
        cell.classList.add("has-photo");
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", "第 " + slotNum + " 格照片");
        var img = document.createElement("img");
        img.src = src;
        img.alt = "恋爱相册第 " + slotNum + " 张";
        img.loading = "lazy";
        img.decoding = "async";
        cell.appendChild(img);
      } else {
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", "第 " + slotNum + " 格相册位");
        var label = document.createElement("span");
        label.textContent = String(slotNum);
        cell.appendChild(label);
      }
      grid.appendChild(cell);
    }
  }

  function showGate() {
    var gate = document.getElementById("gateOverlay");
    var input = document.getElementById("gateInput");
    if (!gate) return;
    gate.classList.remove("is-hidden");
    document.body.classList.add("gate-active");
    if (input) {
      input.value = "";
      setTimeout(function () {
        input.focus();
      }, 80);
    }
  }

  function hideGate() {
    var gate = document.getElementById("gateOverlay");
    if (gate) gate.classList.add("is-hidden");
    document.body.classList.remove("gate-active");
  }

  function unlockSiteBody() {
    var el = document.getElementById("siteBody");
    if (!el) return;
    el.classList.remove("site-body--locked");
    el.removeAttribute("aria-hidden");
  }

  function lockSiteBody() {
    var el = document.getElementById("siteBody");
    if (!el) return;
    el.classList.add("site-body--locked");
    el.setAttribute("aria-hidden", "true");
  }

  function setupGate() {
    var form = document.getElementById("gateForm");
    var input = document.getElementById("gateInput");
    var err = document.getElementById("gateError");
    var panel = document.getElementById("gatePanel");
    if (!form || !input) return;

    function showErr(show) {
      if (!err) return;
      if (show) err.classList.remove("is-hidden");
      else err.classList.add("is-hidden");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      showErr(false);
      var val = (input.value || "").trim();
      if (val === SITE_PASSWORD) {
        gateOkThisLoad = true;
        unlockSiteBody();
        hideGate();
        tryPlayBgmInGesture();
        requestAnimationFrame(function () {
          renderHeartGrid();
        });
        return;
      }
      showErr(true);
      if (panel) {
        panel.classList.remove("gate-panel--shake");
        void panel.offsetWidth;
        panel.classList.add("gate-panel--shake");
      }
    });
  }

  function setupLetter() {
    var overlay = document.getElementById("letterOverlay");
    var closeBtn = document.getElementById("letterClose");
    if (!overlay || !closeBtn) return;

    function dismissLetter() {
      overlay.classList.add("is-hidden");
      tryPlayBgmInGesture();
      if (gateOkThisLoad) {
        unlockSiteBody();
        hideGate();
        requestAnimationFrame(function () {
          renderHeartGrid();
        });
        return;
      }
      showGate();
    }

    closeBtn.addEventListener("click", dismissLetter);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) dismissLetter();
    });
  }

  lockSiteBody();

  setupGate();
  setupLetter();
  setupBgm();

  var resizeTimer;
  window.addEventListener(
    "resize",
    function () {
      if (!gateOkThisLoad) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderHeartGrid, 120);
    },
    { passive: true }
  );
})();
