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

  /** 随机浮层：进/出各约 0.4s + 中间约 3.2s ≈ 整段 4s */
  var FLOAT_PHOTO_TRANS_MS = 400;
  var FLOAT_PHOTO_HOLD_MS = 3200;
  var floatPhotoTimer = null;
  var floatPhotoRunning = false;
  var lastFloatPhotoUrl = "";

  function getWallPhotoUrls() {
    var list = typeof window !== "undefined" ? window.__WALL_PHOTOS__ : null;
    if (!list || !list.length) return [];
    var max = Math.min(SLOT_COUNT, list.length);
    var out = [];
    var i;
    for (i = 0; i < max; i++) out.push(list[i]);
    return out;
  }

  function pickRandomWallPhotoUrl() {
    var urls = getWallPhotoUrls();
    if (!urls.length) return "";
    var url;
    var tries = 0;
    do {
      url = urls[Math.floor(Math.random() * urls.length)];
      tries++;
    } while (url === lastFloatPhotoUrl && urls.length > 1 && tries < 10);
    lastFloatPhotoUrl = url;
    return url;
  }

  function clearFloatPhotoTimer() {
    if (floatPhotoTimer) {
      clearTimeout(floatPhotoTimer);
      floatPhotoTimer = null;
    }
  }

  function layoutFloatPhotoSpot(img) {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var pad = Math.max(12, Math.min(24, vw * 0.02));
    var safeTop =
      typeof window !== "undefined" && window.visualViewport
        ? window.visualViewport.offsetTop
        : 0;
    pad += Math.min(8, safeTop);
    var nw = img.naturalWidth || 400;
    var nh = img.naturalHeight || 300;
    var maxW = vw * 0.34;
    var maxH = vh * 0.34;
    var scale = Math.min(maxW / nw, maxH / nh, 1);
    var rectW = Math.round(nw * scale);
    var rectH = Math.round(nh * scale);
    img.style.width = rectW + "px";
    img.style.height = rectH + "px";
    var maxLeft = Math.max(pad, vw - rectW - pad);
    var maxTop = Math.max(pad, vh - rectH - pad);
    var left = pad + Math.random() * Math.max(0, maxLeft - pad);
    var top = pad + Math.random() * Math.max(0, maxTop - pad);
    img.style.left = Math.round(left) + "px";
    img.style.top = Math.round(top) + "px";
  }

  function stopFloatPhotos() {
    floatPhotoRunning = false;
    clearFloatPhotoTimer();
    var layer = document.getElementById("floatPhotoLayer");
    var img = document.getElementById("floatPhotoSpot");
    if (img) {
      img.onload = null;
      img.onerror = null;
      img.classList.remove("float-photo-img--in", "float-photo-img--out");
      img.removeAttribute("src");
    }
    if (layer) {
      layer.classList.add("is-hidden");
      layer.setAttribute("aria-hidden", "true");
    }
  }

  function scheduleFloatPhotoStep(fn, ms) {
    clearFloatPhotoTimer();
    floatPhotoTimer = setTimeout(function () {
      floatPhotoTimer = null;
      fn();
    }, ms);
  }

  function runFloatPhotoCycle() {
    if (!gateOkThisLoad || !floatPhotoRunning) return;
    var layer = document.getElementById("floatPhotoLayer");
    var img = document.getElementById("floatPhotoSpot");
    if (!layer || !img) return;

    var url = pickRandomWallPhotoUrl();
    if (!url) {
      scheduleFloatPhotoStep(runFloatPhotoCycle, 1600);
      return;
    }

    img.classList.remove("float-photo-img--in", "float-photo-img--out");

    img.onload = function () {
      img.onload = null;
      img.onerror = null;
      layoutFloatPhotoSpot(img);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (!floatPhotoRunning || !gateOkThisLoad) return;
          img.classList.add("float-photo-img--in");
        });
      });

      scheduleFloatPhotoStep(function () {
        if (!floatPhotoRunning || !gateOkThisLoad) return;
        img.classList.remove("float-photo-img--in");
        img.classList.add("float-photo-img--out");
        scheduleFloatPhotoStep(function () {
          if (!floatPhotoRunning || !gateOkThisLoad) return;
          img.classList.remove("float-photo-img--in", "float-photo-img--out");
          img.removeAttribute("src");
          scheduleFloatPhotoStep(runFloatPhotoCycle, 180);
        }, FLOAT_PHOTO_TRANS_MS);
      }, FLOAT_PHOTO_TRANS_MS + FLOAT_PHOTO_HOLD_MS);
    };

    img.onerror = function () {
      img.onload = null;
      img.onerror = null;
      scheduleFloatPhotoStep(runFloatPhotoCycle, 900);
    };

    img.src = url;
  }

  function startFloatPhotos() {
    if (!gateOkThisLoad) return;
    if (floatPhotoRunning) return;
    var layer = document.getElementById("floatPhotoLayer");
    if (!layer || !getWallPhotoUrls().length) return;
    floatPhotoRunning = true;
    layer.classList.remove("is-hidden");
    layer.setAttribute("aria-hidden", "false");
    scheduleFloatPhotoStep(runFloatPhotoCycle, 320);
  }

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
    var pp = document.getElementById("vinylPlayCenter");
    if (!a || !wrap) return;
    var on = !a.paused;
    wrap.classList.toggle("is-playing", on);
    if (btn) btn.setAttribute("aria-pressed", on ? "true" : "false");
    if (pp) pp.textContent = on ? "\u23f8" : "\u25b6";
  }

  var BGM_VOLUME = 0.7;

  /** 已通过密码进入站内后调用：默认音量 70%，循环由 audio loop 负责 */
  function tryPlayBgmAfterUnlock() {
    var a = getBgm();
    if (!a || !gateOkThisLoad) return;
    a.volume = BGM_VOLUME;
    a.loop = true;
    a.play().then(syncPhonoUi).catch(syncPhonoUi);
  }

  /** 站内用户手动继续播放 */
  function tryPlayBgmManual() {
    var a = getBgm();
    if (!a || !gateOkThisLoad) return;
    a.volume = BGM_VOLUME;
    a.play().then(syncPhonoUi).catch(syncPhonoUi);
  }

  function setupBgm() {
    var a = getBgm();
    var disc = document.getElementById("phonographBtn");
    var pp = document.getElementById("vinylPlayCenter");
    var rew = document.getElementById("bgmRew");
    var fwd = document.getElementById("bgmFwd");
    if (!a) return;
    if (BGM_SRC) {
      a.src = BGM_SRC;
    }
    a.volume = BGM_VOLUME;
    a.loop = true;
    a.addEventListener("play", syncPhonoUi);
    a.addEventListener("pause", syncPhonoUi);
    a.addEventListener("ended", syncPhonoUi);

    function toggleBgm(ev) {
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (a.paused) {
        tryPlayBgmManual();
      } else {
        a.pause();
        syncPhonoUi();
      }
    }

    if (disc) disc.addEventListener("click", toggleBgm);
    if (pp) pp.addEventListener("click", toggleBgm);

    function seekBy(sec) {
      return function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!a.duration || isNaN(a.duration)) return;
        a.currentTime = Math.max(0, Math.min(a.duration, a.currentTime + sec));
      };
    }
    if (rew) rew.addEventListener("click", seekBy(-8));
    if (fwd) fwd.addEventListener("click", seekBy(8));

    syncPhonoUi();
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
        requestAnimationFrame(function () {
          tryPlayBgmAfterUnlock();
          renderHeartGrid();
          startFloatPhotos();
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

  function setupFlowerGift() {
    var modal = document.getElementById("flowerModal");
    var openBtn = document.getElementById("btnFlowerGift");
    var back = document.getElementById("flowerModalBack");
    var backdrop = document.getElementById("flowerModalBackdrop");
    var stepPick = document.getElementById("flowerModalStepPick");
    var stepAli = document.getElementById("flowerModalStepAlipay");
    var err = document.getElementById("flowerModalErr");
    var like = document.getElementById("flowerBtnLike");
    var dislike = document.getElementById("flowerBtnDislike");
    var ok = document.getElementById("flowerBtnAlipayOk");
    if (!modal || !openBtn || !stepPick || !stepAli || !err) return;

    function resetFlowerModal() {
      stepPick.classList.remove("is-hidden");
      stepAli.classList.add("is-hidden");
      err.classList.add("is-hidden");
      err.textContent = "";
    }

    function openFlowerModal() {
      if (!gateOkThisLoad) return;
      resetFlowerModal();
      modal.classList.remove("is-hidden");
      document.body.classList.add("flower-modal-open");
    }

    function closeFlowerModal() {
      modal.classList.add("is-hidden");
      document.body.classList.remove("flower-modal-open");
      resetFlowerModal();
    }

    openBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openFlowerModal();
    });

    if (back) back.addEventListener("click", closeFlowerModal);
    if (backdrop) backdrop.addEventListener("click", closeFlowerModal);

    if (dislike) {
      dislike.addEventListener("click", function () {
        err.textContent = "错误，请重新选择";
        err.classList.remove("is-hidden");
      });
    }

    if (like) {
      like.addEventListener("click", function () {
        err.classList.add("is-hidden");
        err.textContent = "";
        stepPick.classList.add("is-hidden");
        stepAli.classList.remove("is-hidden");
      });
    }

    if (ok) ok.addEventListener("click", closeFlowerModal);
  }

  lockSiteBody();

  setupGate();
  setupLetter();
  setupBgm();
  setupFlowerGift();

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
