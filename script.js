(function () {
  "use strict";

  try {
    sessionStorage.removeItem("zzlove_site_unlock_v1");
  } catch (e) {}

  var SLOT_COUNT = 52;
  /** 相册图多次重试后仍失败则用内联 SVG，避免裂图 */
  var PHOTO_RETRY_MAX = 8;
  var PHOTO_FALLBACK =
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect fill="#ffe8f3" width="128" height="128"/><path fill="#e85a9c" d="M64 96c-24-18-36-32-36-48 0-12 10-22 22-22 7 0 14 4 18 10 4-6 11-10 18-10 12 0 22 10 22 22 0 16-12 30-36 48z"/></svg>'
    );

  /**
   * 相册路径：相对地址原样交给浏览器解析（与页面地址一致），避免错误的 new URL 拼成 /images/… 丢仓库子路径。
   * 仅绝对地址 / data / blob 保持原样。
   */
  function resolvePhotoUrl(rel) {
    if (!rel || typeof rel !== "string") return rel;
    var t = rel.trim();
    if (/^https?:\/\//i.test(t) || t.indexOf("data:") === 0 || t.indexOf("blob:") === 0) return t;
    return t;
  }

  /**
   * 爱心格 / 浮层：同一 URL 重试（绝不加 ?wretry，很多静态站会把带查询的路径判 404）。
   * 须先把 img 挂进 document，否则 isConnected 为 false 不会赋值 src。
   * onLoadEnd(img) 在成功解码后调用（含占位图）。
   */
  function wireReliablePhoto(img, baseUrl, onLoadEnd, opts) {
    opts = opts || {};
    img._wireGen = (img._wireGen || 0) + 1;
    var wireGen = img._wireGen;
    var attempt = 0;
    img.loading = "eager";
    img.decoding = opts.decoding || "async";

    function alive() {
      return img._wireGen === wireGen;
    }

    function cleanup() {
      img.onload = null;
      img.onerror = null;
    }

    function finish() {
      cleanup();
      if (onLoadEnd && alive() && img.isConnected) onLoadEnd(img);
    }

    function applySrc() {
      if (!alive() || !img.isConnected) return;
      attempt++;
      img.src = baseUrl;
    }

    img.onload = function () {
      if (!alive()) return;
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        img.onerror();
        return;
      }
      finish();
    };

    img.onerror = function () {
      if (!alive()) return;
      if (attempt >= PHOTO_RETRY_MAX) {
        cleanup();
        if (!alive() || !img.isConnected) return;
        img.src = PHOTO_FALLBACK;
        img.onload = function () {
          if (!alive()) return;
          img.onload = null;
          if (onLoadEnd && img.isConnected) onLoadEnd(img);
        };
        img.onerror = function () {
          if (!alive()) return;
          img.onerror = null;
          if (onLoadEnd && img.isConnected) onLoadEnd(img);
        };
        return;
      }
      var delay = 100 + attempt * 70;
      setTimeout(function () {
        if (!alive() || !img.isConnected) return;
        img.removeAttribute("src");
        try {
          void img.offsetWidth;
        } catch (e) {}
        applySrc();
      }, delay);
    };

    applySrc();
  }

  /** 由 photo-manifest.js 的 window.__WALL_PHOTOS__ 顺序对应爱心格子编号 1→52 */
  function buildPhotoBySlot() {
    var list = typeof window !== "undefined" ? window.__WALL_PHOTOS__ : null;
    var map = {};
    if (!list || !list.length) return map;
    var i;
    var max = Math.min(SLOT_COUNT, list.length);
    for (i = 0; i < max; i++) {
      map[i + 1] = resolvePhotoUrl(list[i]);
    }
    return map;
  }
  var PHOTO_BY_SLOT = buildPhotoBySlot();
  var SITE_PASSWORD = "txh1314";
  /** 仅本次打开页面有效；刷新或重新打开都要再输密码 */
  var gateOkThisLoad = false;
  /** 顺序播放：播完上一首自动下一首；循环整张列表 */
  var BGM_PLAYLIST = [
    { src: "audio/bgm.mp3", title: "稳稳的幸福" },
    { src: "audio/ni-yidingyao-xingfu.mp3", title: "你一定要幸福" }
  ];
  var bgmTrackIndex = 0;
  /** 预加载「下一首」进 HTTP 缓存，减轻切歌解码卡顿 */
  var bgmPreloadAudio = null;

  /** 随机浮层：与 CSS transition 一致（约 0.22s 进/出） */
  var FLOAT_PHOTO_TRANS_MS = 220;
  var FLOAT_PHOTO_HOLD_MS = 520;
  var floatPhotoTimer = null;
  var floatPhotoRunning = false;
  var lastFloatPhotoUrl = "";

  function getWallPhotoUrls() {
    var out = [];
    var i;
    for (i = 1; i <= SLOT_COUNT; i++) {
      if (PHOTO_BY_SLOT[i]) out.push(PHOTO_BY_SLOT[i]);
    }
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

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  /** 随机位置避开右上角黑胶区域，避免被挡；同时 z-index 已高于播放器 */
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
    var wrap = document.getElementById("phonographWrap");
    var pr = wrap && wrap.getBoundingClientRect ? wrap.getBoundingClientRect() : null;
    var avoid = 14;
    var px = pr ? pr.left - avoid : 0;
    var py = pr ? pr.top - avoid : 0;
    var pw = pr ? pr.width + avoid * 2 : 0;
    var ph = pr ? pr.height + avoid * 2 : 0;
    var left = pad;
    var top = pad;
    var tries;
    for (tries = 0; tries < 48; tries++) {
      left = pad + Math.random() * Math.max(0, maxLeft - pad);
      top = pad + Math.random() * Math.max(0, maxTop - pad);
      if (!pr || !pw || !ph || !rectsOverlap(left, top, rectW, rectH, px, py, pw, ph)) {
        break;
      }
    }
    img.style.left = Math.round(left) + "px";
    img.style.top = Math.round(top) + "px";
  }

  function stopFloatPhotos() {
    floatPhotoRunning = false;
    clearFloatPhotoTimer();
    var layer = document.getElementById("floatPhotoLayer");
    var img = document.getElementById("floatPhotoSpot");
    if (img) {
      img._wireGen = (img._wireGen || 0) + 1;
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

    wireReliablePhoto(img, url, function () {
      if (!floatPhotoRunning || !gateOkThisLoad) return;
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
          scheduleFloatPhotoStep(runFloatPhotoCycle, 140);
        }, FLOAT_PHOTO_TRANS_MS);
      }, FLOAT_PHOTO_TRANS_MS + FLOAT_PHOTO_HOLD_MS);
    });
  }

  function startFloatPhotos() {
    if (!gateOkThisLoad) return;
    if (floatPhotoRunning) return;
    var layer = document.getElementById("floatPhotoLayer");
    if (!layer || !getWallPhotoUrls().length) return;
    floatPhotoRunning = true;
    layer.classList.remove("is-hidden");
    layer.setAttribute("aria-hidden", "false");
    scheduleFloatPhotoStep(runFloatPhotoCycle, 80);
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

  function disposeBgmPreload() {
    if (!bgmPreloadAudio) return;
    try {
      bgmPreloadAudio.pause();
      bgmPreloadAudio.removeAttribute("src");
      bgmPreloadAudio.load();
    } catch (e) {}
    bgmPreloadAudio = null;
  }

  function resolvedAssetUrl(pathRel) {
    try {
      return new URL(pathRel, window.location.href).href;
    } catch (e) {
      return pathRel;
    }
  }

  function audioSrcEquals(aEl, pathRel) {
    var want = resolvedAssetUrl(pathRel);
    var cur = String(aEl.currentSrc || aEl.src || "");
    if (!cur) return false;
    if (cur === want) return true;
    try {
      return new URL(cur, window.location.href).href === want;
    } catch (e) {
      return false;
    }
  }

  function primeBgmPreloadFollowing() {
    disposeBgmPreload();
    if (!BGM_PLAYLIST.length || BGM_PLAYLIST.length < 2) return;
    var nextI = (bgmTrackIndex + 1) % BGM_PLAYLIST.length;
    var t = BGM_PLAYLIST[nextI];
    if (!t || !t.src) return;
    try {
      bgmPreloadAudio = new Audio(t.src);
      bgmPreloadAudio.preload = "auto";
      bgmPreloadAudio.load();
    } catch (e) {
      bgmPreloadAudio = null;
    }
  }

  function applyBgmTrack(index) {
    var a = getBgm();
    if (!a || !BGM_PLAYLIST.length) return;
    var n = BGM_PLAYLIST.length;
    bgmTrackIndex = ((index % n) + n) % n;
    var t = BGM_PLAYLIST[bgmTrackIndex];
    a.pause();
    a.loop = false;
    if (!audioSrcEquals(a, t.src)) {
      a.src = t.src;
      a.load();
    }
    var titleEl = document.getElementById("bgmTrackTitle");
    if (titleEl) titleEl.textContent = t.title;
    primeBgmPreloadFollowing();
  }

  /** 已通过密码进入站内后调用：须紧跟用户手势（提交密码）同步调用，否则浏览器会拦截自动播放。不再重复 load 第一首，避免打断 play。 */
  function tryPlayBgmAfterUnlock() {
    var a = getBgm();
    if (!a || !gateOkThisLoad) return;
    a.volume = BGM_VOLUME;
    a.loop = false;
    if (bgmTrackIndex !== 0) {
      applyBgmTrack(0);
    } else {
      primeBgmPreloadFollowing();
    }

    function kickPlay() {
      var p = a.play();
      if (p !== undefined && p.then) {
        p.then(syncPhonoUi).catch(function () {
          var once = function () {
            a.removeEventListener("canplaythrough", once);
            a.play().then(syncPhonoUi).catch(syncPhonoUi);
          };
          a.addEventListener("canplaythrough", once);
          if (a.readyState >= 3) {
            try {
              once();
            } catch (e) {}
          }
        });
      } else {
        syncPhonoUi();
      }
    }

    kickPlay();
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
    var prev = document.getElementById("bgmPrev");
    var next = document.getElementById("bgmNext");
    var sw = document.getElementById("bgmSwitch");
    if (!a) return;
    a.volume = BGM_VOLUME;
    a.loop = false;
    applyBgmTrack(0);
    a.addEventListener("play", syncPhonoUi);
    a.addEventListener("pause", syncPhonoUi);
    a.addEventListener("ended", function () {
      if (!gateOkThisLoad) return;
      if (!BGM_PLAYLIST.length) return;
      var nxt = (bgmTrackIndex + 1) % BGM_PLAYLIST.length;
      requestAnimationFrame(function () {
        applyBgmTrack(nxt);
        var p = a.play();
        if (p !== undefined && p.then) {
          p.then(syncPhonoUi).catch(syncPhonoUi);
        } else {
          syncPhonoUi();
        }
      });
    });

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

    function afterTrackJump(wasPlaying) {
      if (wasPlaying && gateOkThisLoad) {
        a.play().then(syncPhonoUi).catch(syncPhonoUi);
      } else {
        syncPhonoUi();
      }
    }

    function onPrev(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var wasPlaying = !a.paused;
      applyBgmTrack(bgmTrackIndex - 1);
      afterTrackJump(wasPlaying);
    }

    function onNext(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var wasPlaying = !a.paused;
      applyBgmTrack(bgmTrackIndex + 1);
      afterTrackJump(wasPlaying);
    }

    function onSwitch(ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (BGM_PLAYLIST.length < 2) return;
      var wasPlaying = !a.paused;
      var idx = BGM_PLAYLIST.length === 2 ? 1 - bgmTrackIndex : (bgmTrackIndex + 1) % BGM_PLAYLIST.length;
      applyBgmTrack(idx);
      afterTrackJump(wasPlaying);
    }

    if (prev) prev.addEventListener("click", onPrev);
    if (next) next.addEventListener("click", onNext);
    if (sw) sw.addEventListener("click", onSwitch);

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

    PHOTO_BY_SLOT = buildPhotoBySlot();

    var site = document.getElementById("siteBody");
    if (site) void site.offsetWidth;

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
      var img = null;
      if (src) {
        cell.classList.add("has-photo");
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", "第 " + slotNum + " 格照片");
        img = document.createElement("img");
        img.alt = "恋爱相册第 " + slotNum + " 张";
        cell.appendChild(img);
      } else {
        cell.setAttribute("role", "img");
        cell.setAttribute("aria-label", "第 " + slotNum + " 格相册位");
        var label = document.createElement("span");
        label.textContent = String(slotNum);
        cell.appendChild(label);
      }
      grid.appendChild(cell);
      if (src) {
        wireReliablePhoto(img, src, null);
      }
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
        tryPlayBgmAfterUnlock();
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            var sb = document.getElementById("siteBody");
            if (sb) void sb.offsetWidth;
            renderHeartGrid();
            startFloatPhotos();
          });
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
