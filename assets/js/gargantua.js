// Luca 個人網站 — 可拖動的卡岡圖雅黑洞 + 文字吞噬（相對論物理強化版）
// 改寫自 Argon 產生的 luca_13_ei52.html（Canvas 2D、零依賴）。
// 黑洞平時停在 hero 右側的 #bh-dock，滑鼠／手指可以把它拖著走；
// 靠近頁面文字時具備三個相對論物理效果：
//   1. 義大利麵化（Spaghettification）：字元沿黑洞徑向被拉長、切向壓縮並朝黑洞旋轉，最後拉成細線消失。
//   2. 重力透鏡（Gravitational Lensing）：黑洞周圍的 #stars 星光與頁面線條受引力彎折，產生愛因斯坦環與彎曲光弧。
//   3. 時間膨脹（Time Dilation）：越靠近事件視界，字元移動、旋轉、形變速度越慢，在視界邊緣近乎凍結後才紅移消失。
// 「Luca.」標題字元有果凍彈性物理，黑洞靠近時會被拉扯變形。
// 右上角 ↺ 重置按鈕可以把文字與黑洞位置、尺寸全部復原。
// 星空由 main.js 的 #stars 畫布提供，不在這裡重畫。

(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var isReducedMotion = prefersReducedMotion.matches;

  /* =========================================================
   * 1. 將可吞噬文字拆分為單字元 (.bh-char)
   * ========================================================= */
  var charRecords = [];

  function tokenizeSwallableElements() {
    var elements = document.querySelectorAll(".swallable-text");
    elements.forEach(function (el) {
      if (el.closest('[data-bh-immune="true"]')) return;
      var text = el.textContent;
      el.textContent = "";
      var frag = document.createDocumentFragment();

      for (var i = 0; i < text.length; i++) {
        var ch = text[i];
        if (ch === " " || ch === "\n") {
          frag.appendChild(document.createTextNode(ch));
          continue;
        }
        var span = document.createElement("span");
        span.className = "bh-char";
        span.textContent = ch;
        frag.appendChild(span);
        charRecords.push({
          el: span,
          swallowed: false,
          swallowDone: false,
          swallowPhase: 0,     // 0 -> 1：進入事件視界後的凍結與終端拉絲進度
          captureAngle: 0,     // 被捕獲瞬間相對於黑洞的極角 (rad)
          captureRadius: 0,    // 被捕獲瞬間相對於黑洞的半徑 (px)
          cx: 0,
          cy: 0,
          // 當前動畫狀態（受時間膨脹因子控制推進速度）
          tx: 0,
          ty: 0,
          radialAngle: 0,      // 黑洞至字元的徑向角度 (deg)
          glyphRot: 0,         // 字元本體補償／朝向旋轉角 (deg)
          scaleRadial: 1,      // 沿黑洞徑向拉伸倍率
          scaleTangential: 1,  // 垂直於徑向的切向壓縮倍率
          redshift: 0,         // 引力紅移程度 (0 -> 1)
          opacity: 1,
          active: false,
          isResetting: false
        });
      }
      el.appendChild(frag);
    });
  }

  // 批次讀取字元原始中心座標（避免逐一讀寫 style 造成 Layout Thrashing）
  function updateCharPositions() {
    var savedTransforms = [];
    var i, rec;

    for (i = 0; i < charRecords.length; i++) {
      rec = charRecords[i];
      if (rec.swallowDone) continue;
      if (rec.el.style.transform) {
        savedTransforms[i] = rec.el.style.transform;
        rec.el.style.transform = "";
      }
    }

    for (i = 0; i < charRecords.length; i++) {
      rec = charRecords[i];
      if (rec.swallowDone) continue;
      var rect = rec.el.getBoundingClientRect();
      rec.cx = rect.left + rect.width * 0.5;
      rec.cy = rect.top + rect.height * 0.5;
    }

    for (i = 0; i < charRecords.length; i++) {
      if (savedTransforms[i]) {
        charRecords[i].el.style.transform = savedTransforms[i];
      }
    }
  }

  tokenizeSwallableElements();

  /* =========================================================
   * 2. Luca. 果凍彈性物理引擎 (Jelly Spring Physics)
   * ========================================================= */
  var lucaCharNodes = Array.prototype.slice.call(document.querySelectorAll(".luca-char"));
  var lucaJellyStates = lucaCharNodes.map(function (el, idx) {
    return {
      el: el,
      idx: idx,
      cx: 0,
      cy: 0,
      // 當前形變狀態
      dx: 0,
      dy: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      rot: 0,
      // 彈簧速度
      vx: 0,
      vy: 0,
      vsx: 0,
      vsy: 0,
      vskew: 0,
      vrot: 0
    };
  });

  function updateLucaCenters() {
    for (var i = 0; i < lucaJellyStates.length; i++) {
      var st = lucaJellyStates[i];
      var prev = st.el.style.transform;
      st.el.style.transform = "";
      var r = st.el.getBoundingClientRect();
      st.el.style.transform = prev;
      st.cx = r.left + r.width * 0.5;
      st.cy = r.top + r.height * 0.5;
    }
  }

  function stepLucaJellyPhysics(t) {
    var jellyRadius = 185 * bhScale; // 黑洞觸發果凍形變的感應半徑（跟著黑洞長大）
    var stiffness = 0.16;  // 彈簧剛性（越低越軟 Q）
    var damping = 0.78;    // 阻尼（保留明顯的果凍回彈震盪）

    for (var i = 0; i < lucaJellyStates.length; i++) {
      var st = lucaJellyStates[i];
      var rx = bhPos.x - st.cx;
      var ry = bhPos.y - st.cy;
      var dist = Math.hypot(rx, ry);

      var targetDx = 0;
      var targetDy = 0;
      var targetSx = 1;
      var targetSy = 1;
      var targetSkew = 0;
      var targetRot = 0;

      if (dist < jellyRadius) {
        var p = Math.pow(1 - dist / jellyRadius, 1.35);
        var angle = Math.atan2(ry, rx);
        // 連續果凍波動相位
        var wave = Math.sin(t * 0.016 - st.idx * 0.85);
        var cosW = Math.cos(t * 0.014 - st.idx * 0.7);

        // 被黑洞引力拉動與擠壓的果凍變形（體積守恆：拉寬時壓扁，拉高時變瘦）
        var stretch = p * 0.46 * wave;
        targetSx = 1 + stretch + p * 0.18 * Math.abs(Math.cos(angle));
        targetSy = Math.max(0.52, 1 / targetSx + p * 0.14 * cosW);

        // 朝黑洞方向產生軟 Q 拉扯與搖晃
        targetDx = Math.cos(angle) * p * 14 + wave * p * 6;
        targetDy = Math.sin(angle) * p * 14 + cosW * p * 6;
        targetSkew = wave * p * 22;
        targetRot = cosW * p * 14;
      }

      // 二階彈簧阻尼積分 (Spring-Damper Integration)
      st.vx = (st.vx + (targetDx - st.dx) * stiffness) * damping;
      st.vy = (st.vy + (targetDy - st.dy) * stiffness) * damping;
      st.vsx = (st.vsx + (targetSx - st.scaleX) * stiffness) * damping;
      st.vsy = (st.vsy + (targetSy - st.scaleY) * stiffness) * damping;
      st.vskew = (st.vskew + (targetSkew - st.skewX) * stiffness) * damping;
      st.vrot = (st.vrot + (targetRot - st.rot) * stiffness) * damping;

      st.dx += st.vx;
      st.dy += st.vy;
      st.scaleX += st.vsx;
      st.scaleY += st.vsy;
      st.skewX += st.vskew;
      st.rot += st.vrot;

      var isSettled =
        Math.abs(st.dx) < 0.05 &&
        Math.abs(st.dy) < 0.05 &&
        Math.abs(st.scaleX - 1) < 0.002 &&
        Math.abs(st.scaleY - 1) < 0.002 &&
        Math.abs(st.skewX) < 0.05 &&
        Math.abs(st.rot) < 0.05;

      if (isSettled && dist >= jellyRadius) {
        st.el.style.transform = "";
      } else {
        st.el.style.transform =
          "translate(" + st.dx.toFixed(2) + "px, " + st.dy.toFixed(2) + "px) " +
          "rotate(" + st.rot.toFixed(2) + "deg) " +
          "skewX(" + st.skewX.toFixed(2) + "deg) " +
          "scale(" + st.scaleX.toFixed(3) + ", " + st.scaleY.toFixed(3) + ")";
      }
    }
  }

  /* =========================================================
   * 3. 卡岡圖雅黑洞 Canvas 渲染 + 【效果 2：重力透鏡 Gravitational Lensing】
   * ========================================================= */
  var bhWrapper = document.getElementById("gargantua-wrapper");
  var bhDock = document.getElementById("bh-dock");
  var bhCanvas = document.getElementById("gargantua-canvas");
  if (!bhWrapper || !bhDock || !bhCanvas) return;
  var ctx = bhCanvas.getContext("2d");

  var accretionFlash = 0;
  var absorptionParticles = [];

  var diskStreaks = [];
  for (var si = 0; si < 54; si++) {
    diskStreaks.push({
      angle: Math.random() * Math.PI * 2,
      radiusNorm: 0.36 + Math.random() * 0.44,
      speed: 0.007 + Math.random() * 0.012,
      arcLen: 0.25 + Math.random() * 0.55,
      width: 1.0 + Math.random() * 2.0,
      alpha: 0.22 + Math.random() * 0.52
    });
  }

  /* ---------------------------------------------------------
   * 【效果 2：重力透鏡 (Gravitational Lensing)】資料與輔助函式
   * 包含：
   *   (A) #stars 畫布即時透鏡環帶取樣扭曲 + 外露可呼叫的透鏡函式
   *   (B) 視窗座標錨定之背景星點，依愛因斯坦透鏡方程計算主像／次像彎折星光弧
   *   (C) 頁面線條（hr、區塊邊框、分隔線）與背景空間測地線之引力彎折渲染
   * --------------------------------------------------------- */
  var starsCanvas = document.getElementById("stars");
  var viewportLensStars = [];
  var ambientLensArcs = [];
  var pageLineSegments = [];

  // 產生黑洞周圍常駐的微光彎折星弧（呼應卡岡圖雅上下透鏡光環）
  for (var li = 0; li < 20; li++) {
    ambientLensArcs.push({
      angle: (li / 20) * Math.PI * 2 + Math.random() * 0.3,
      radiusFactor: 1.22 + (li % 5) * 0.24 + Math.random() * 0.14,
      speed: (li % 2 === 0 ? 1 : -1) * (0.0018 + Math.random() * 0.0028),
      baseSpan: 0.22 + Math.random() * 0.38,
      width: 0.7 + Math.random() * 1.1,
      alpha: 0.16 + Math.random() * 0.28,
      tint: li % 3 === 0 ? "210, 232, 255" : (li % 3 === 1 ? "255, 236, 200" : "255, 210, 145")
    });
  }

  // 建立錨定於視窗座標的背景星場，當拖動黑洞經過時會產生動態愛因斯坦環與雙像星弧
  function initViewportLensStars() {
    viewportLensStars.length = 0;
    var vw = Math.max(window.innerWidth || 1280, 320);
    var vh = Math.max(window.innerHeight || 800, 320);
    var cols = 12;
    var rows = 8;
    var cellW = vw / cols;
    var cellH = vh / rows;

    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        // 使用固定偽隨機分布讓星點自然散落於整個視窗
        var seed = (r * 31 + c * 17 + 13) % 97;
        var sx = (c + 0.15 + (seed / 97) * 0.7) * cellW;
        var sy = (r + 0.15 + (((seed * 23) % 97) / 97) * 0.7) * cellH;
        viewportLensStars.push({
          x: sx,
          y: sy,
          size: 0.8 + (seed % 5) * 0.28,
          alpha: 0.35 + (seed % 7) * 0.08,
          phase: seed * 0.15,
          rgb: seed % 3 === 0 ? "215, 235, 255" : (seed % 3 === 1 ? "255, 244, 222" : "255, 216, 162")
        });
      }
    }
  }

  // 掃描頁面上可見的線條與區塊邊框（hr、divider、卡片／區塊邊框），供重力透鏡彎折使用
  function scanPageLines() {
    pageLineSegments.length = 0;
    var candidates = document.querySelectorAll(
      "hr, .divider, .line, [class*='line'], [class*='divider'], [class*='border'], header, nav, section, footer, article, .card, [class*='card']"
    );

    candidates.forEach(function (el) {
      if (el === bhWrapper || el === bhDock || bhWrapper.contains(el)) return;
      var rect = el.getBoundingClientRect();
      if (rect.width < 4 && rect.height < 4) return;
      if (rect.bottom < -100 || rect.top > window.innerHeight + 100) return;

      var style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return;

      // 1. 若元素本身是水平細線（如 <hr> 或高度 <= 3px 的分隔線）
      if (el.tagName === "HR" || (rect.height <= 3 && rect.width > 24)) {
        var lineColor = style.borderTopColor || style.backgroundColor || "rgba(255, 255, 255, 0.22)";
        if (lineColor === "rgba(0, 0, 0, 0)" || lineColor === "transparent") {
          lineColor = "rgba(255, 230, 190, 0.28)";
        }
        pageLineSegments.push({
          x1: rect.left,
          y1: rect.top + rect.height * 0.5,
          x2: rect.right,
          y2: rect.top + rect.height * 0.5,
          color: lineColor,
          width: Math.max(1, Math.min(2.5, rect.height || parseFloat(style.borderTopWidth) || 1))
        });
        return;
      }

      // 2. 擷取具有可見邊框 (border-top / bottom / left / right) 的區塊邊緣線段
      var bt = parseFloat(style.borderTopWidth) || 0;
      var bb = parseFloat(style.borderBottomWidth) || 0;
      var bl = parseFloat(style.borderLeftWidth) || 0;
      var br = parseFloat(style.borderRightWidth) || 0;

      if (bt > 0 && bt <= 4 && style.borderTopStyle !== "none") {
        pageLineSegments.push({
          x1: rect.left, y1: rect.top, x2: rect.right, y2: rect.top,
          color: style.borderTopColor, width: bt
        });
      }
      if (bb > 0 && bb <= 4 && style.borderBottomStyle !== "none") {
        pageLineSegments.push({
          x1: rect.left, y1: rect.bottom, x2: rect.right, y2: rect.bottom,
          color: style.borderBottomColor, width: bb
        });
      }
      if (bl > 0 && bl <= 4 && style.borderLeftStyle !== "none") {
        pageLineSegments.push({
          x1: rect.left, y1: rect.top, x2: rect.left, y2: rect.bottom,
          color: style.borderLeftColor, width: bl
        });
      }
      if (br > 0 && br <= 4 && style.borderRightStyle !== "none") {
        pageLineSegments.push({
          x1: rect.right, y1: rect.top, x2: rect.right, y2: rect.bottom,
          color: style.borderRightColor, width: br
        });
      }
    });
  }

  // 將視窗座標點 (px, py) 轉換為經重力透鏡偏折後的黑洞畫布局部座標 (相對於畫布中心 cx, cy)
  function deflectCanvasPoint(localX, localY, einsteinR, minR, maxR) {
    var r = Math.hypot(localX, localY);
    if (r >= maxR || r < 0.001) return { x: localX, y: localY, factor: 0 };

    // 接近事件視界的光線會被推往愛因斯坦環外側，平滑衰減至 maxR
    var safeR = Math.max(r, minR);
    var falloff = Math.pow(1 - r / maxR, 1.5);
    var push = (einsteinR * einsteinR / safeR) * 0.58 * falloff;
    // 若點落於光子環內側，強制推至光子環外緣以形成繞射彎弧
    var targetR = Math.max(r + push, minR * (1 + 0.18 * falloff));
    var scale = targetR / r;

    return {
      x: localX * scale,
      y: localY * scale,
      factor: falloff
    };
  }

  // (A) 取樣 #stars 畫布並在黑洞周圍繪製同心環帶重力透鏡扭曲
  function drawStarsCanvasLensing(targetCtx, cx, cy, coreR, canvasPerCss) {
    if (!starsCanvas) starsCanvas = document.getElementById("stars");
    if (!starsCanvas || !starsCanvas.width || !starsCanvas.height) return;

    var sRect = starsCanvas.getBoundingClientRect();
    if (sRect.width <= 0 || sRect.height <= 0) return;

    var scaleX = starsCanvas.width / sRect.width;
    var scaleY = starsCanvas.height / sRect.height;
    var srcCenterX = (bhPos.x - sRect.left) * scaleX;
    var srcCenterY = (bhPos.y - sRect.top) * scaleY;

    // 分 4 層同心透鏡環帶，越往內環徑向放大與切向旋轉（參考系拖曳）越明顯
    var rings = [
      { inner: 1.08, outer: 1.42, mag: 1.48, twist: -0.18, alpha: 0.65 },
      { inner: 1.38, outer: 1.82, mag: 1.28, twist: -0.10, alpha: 0.50 },
      { inner: 1.76, outer: 2.30, mag: 1.15, twist: -0.05, alpha: 0.35 },
      { inner: 2.22, outer: 2.95, mag: 1.06, twist: -0.02, alpha: 0.22 }
    ];

    var patchRadiusCanvas = coreR * 3.0;
    var patchRadiusCss = patchRadiusCanvas / canvasPerCss;
    var srcRadiusX = patchRadiusCss * scaleX;
    var srcRadiusY = patchRadiusCss * scaleY;

    if (
      srcCenterX + srcRadiusX < 0 ||
      srcCenterX - srcRadiusX > starsCanvas.width ||
      srcCenterY + srcRadiusY < 0 ||
      srcCenterY - srcRadiusY > starsCanvas.height
    ) {
      return;
    }

    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.globalCompositeOperation = "screen";

    for (var i = 0; i < rings.length; i++) {
      var rg = rings[i];
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.arc(0, 0, coreR * rg.outer, 0, Math.PI * 2);
      targetCtx.arc(0, 0, coreR * rg.inner, 0, Math.PI * 2, true);
      targetCtx.clip();

      targetCtx.rotate(rg.twist);
      targetCtx.scale(rg.mag, rg.mag);
      targetCtx.globalAlpha = rg.alpha;

      try {
        targetCtx.drawImage(
          starsCanvas,
          srcCenterX - srcRadiusX,
          srcCenterY - srcRadiusY,
          srcRadiusX * 2,
          srcRadiusY * 2,
          -patchRadiusCanvas,
          -patchRadiusCanvas,
          patchRadiusCanvas * 2,
          patchRadiusCanvas * 2
        );
      } catch (err) {
        // 忽略極端情況下的畫布越界錯誤
      }
      targetCtx.restore();
    }

    targetCtx.restore();
  }

  // (B) 繪製愛因斯坦環與背景星點的相對論雙像彎折星光弧
  function drawEinsteinStarlightArcs(targetCtx, cx, cy, coreR, canvasPerCss, timeSec) {
    var einsteinR = coreR * 1.48;     // 愛因斯坦半徑 theta_E
    var maxLensR = coreR * 3.32;      // 重力透鏡外緣感應半徑
    var horizonEdgeR = coreR * 1.06;  // 光子環外緣

    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.globalCompositeOperation = "lighter";
    targetCtx.lineCap = "round";

    // 1. 愛因斯坦環微光暈圈（呼應卡岡圖雅光環的引力透鏡基調）
    var ringGrad = targetCtx.createRadialGradient(0, 0, coreR * 1.05, 0, 0, coreR * 2.55);
    ringGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    ringGrad.addColorStop(0.18, "rgba(215, 235, 255, " + (0.11 + accretionFlash * 0.08) + ")");
    ringGrad.addColorStop(0.36, "rgba(255, 224, 168, " + (0.14 + accretionFlash * 0.1) + ")");
    ringGrad.addColorStop(0.68, "rgba(230, 155, 75, 0.04)");
    ringGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    targetCtx.fillStyle = ringGrad;
    targetCtx.beginPath();
    targetCtx.arc(0, 0, coreR * 2.55, 0, Math.PI * 2);
    targetCtx.fill();

    // 2. 常駐環繞的彎折星光絲（即使黑洞靜止也能清楚看見星光繞行彎折）
    for (var a = 0; a < ambientLensArcs.length; a++) {
      var arc = ambientLensArcs[a];
      if (!isReducedMotion) {
        arc.angle += arc.speed * (1 + accretionFlash * 0.8);
      }
      var r = coreR * arc.radiusFactor;
      var proximity = Math.max(0, 1 - Math.abs(r - einsteinR) / (coreR * 1.4));
      var span = arc.baseSpan * (1 + proximity * 0.95);
      var alpha = arc.alpha * (0.65 + 0.35 * Math.sin(timeSec * 1.8 + a)) * (1 + proximity * 0.45);

      targetCtx.strokeStyle = "rgba(" + arc.tint + ", " + Math.min(0.85, alpha).toFixed(3) + ")";
      targetCtx.lineWidth = arc.width * (1 + proximity * 0.35);
      targetCtx.beginPath();
      targetCtx.arc(0, 0, r, arc.angle - span * 0.5, arc.angle + span * 0.5);
      targetCtx.stroke();
    }

    // 3. 視窗背景星點之相對論重力透鏡雙像方程：
    //    theta_+ = 0.5 * (beta + sqrt(beta^2 + 4 * theta_E^2))  [外側主像弧]
    //    theta_- = 0.5 * (sqrt(beta^2 + 4 * theta_E^2) - beta)  [對側次像弧]
    for (var s = 0; s < viewportLensStars.length; s++) {
      var st = viewportLensStars[s];
      var bx = (st.x - bhPos.x) * canvasPerCss;
      var by = (st.y - bhPos.y) * canvasPerCss;
      var beta = Math.hypot(bx, by);

      if (beta >= maxLensR) continue;

      var phi = Math.atan2(by, bx);
      var disc = Math.sqrt(beta * beta + 4 * einsteinR * einsteinR);
      var thetaPlus = 0.5 * (beta + disc);
      var thetaMinus = 0.5 * (disc - beta);

      var edgeFade = Math.pow(1 - beta / maxLensR, 1.2);
      var alignFactor = einsteinR / Math.max(beta, coreR * 0.18);
      var twinkle = 0.78 + 0.22 * Math.sin(timeSec * 2.4 + st.phase);

      // 主像（Primary Image）：隨距離靠近被推往愛因斯坦環外側，並沿切向拉長為圓弧
      if (thetaPlus < maxLensR) {
        var arcSpanPlus = Math.min(Math.PI * 0.72, 0.06 + (einsteinR * einsteinR) / (beta * beta + einsteinR * 0.55 * einsteinR) * 0.85);
        var alphaPlus = Math.min(0.95, st.alpha * twinkle * (0.45 + edgeFade * 0.9));
        targetCtx.strokeStyle = "rgba(" + st.rgb + ", " + alphaPlus.toFixed(3) + ")";
        targetCtx.lineWidth = st.size * (1 + Math.min(1.2, alignFactor * 0.32));
        targetCtx.beginPath();
        targetCtx.arc(0, 0, thetaPlus, phi - arcSpanPlus * 0.5, phi + arcSpanPlus * 0.5);
        targetCtx.stroke();
      }

      // 次像（Secondary Counter-Image）：出現在黑洞正對面 (phi + PI)，貼近光子環與愛因斯坦環之間快速掠過
      if (thetaMinus > horizonEdgeR && thetaMinus < einsteinR * 1.02) {
        var arcSpanMinus = Math.min(Math.PI * 0.55, 0.08 + alignFactor * 0.22);
        var alphaMinus = Math.min(0.78, st.alpha * twinkle * edgeFade * 0.82);
        targetCtx.strokeStyle = "rgba(255, 224, 175, " + alphaMinus.toFixed(3) + ")";
        targetCtx.lineWidth = Math.max(0.7, st.size * 0.85);
        targetCtx.beginPath();
        targetCtx.arc(0, 0, thetaMinus, phi + Math.PI - arcSpanMinus * 0.5, phi + Math.PI + arcSpanMinus * 0.5);
        targetCtx.stroke();
      }
    }

    targetCtx.restore();
  }

  // (C) 繪製頁面線條（DOM 邊框／分隔線）與背景空間測地線的重力彎折
  function drawLensedPageLines(targetCtx, cx, cy, coreR, canvasPerCss) {
    var einsteinR = coreR * 1.48;
    var maxLensR = coreR * 3.25;
    var minLensR = coreR * 1.06;

    targetCtx.save();
    targetCtx.translate(cx, cy);
    targetCtx.lineCap = "round";
    targetCtx.lineJoin = "round";

    // 1. 空間測地線光學折射網格（僅在黑洞透鏡場內因光線偏折而顯現的細微基準線）
    var gridSpacingCss = 64;
    var radiusCss = maxLensR / canvasPerCss;
    var startX = Math.floor((bhPos.x - radiusCss) / gridSpacingCss) * gridSpacingCss;
    var endX = bhPos.x + radiusCss;
    var startY = Math.floor((bhPos.y - radiusCss) / gridSpacingCss) * gridSpacingCss;
    var endY = bhPos.y + radiusCss;
    var steps = 28;
    var gx, gy, s, t, px, py, defPt;

    targetCtx.lineWidth = 0.85;
    targetCtx.strokeStyle = "rgba(255, 220, 168, 0.11)";

    // 水平測地線彎折
    for (gy = startY; gy <= endY; gy += gridSpacingCss) {
      var localY = (gy - bhPos.y) * canvasPerCss;
      if (Math.abs(localY) >= maxLensR * 0.92) continue;
      var xSpan = Math.sqrt(Math.max(0, maxLensR * maxLensR - localY * localY));
      targetCtx.beginPath();
      for (s = 0; s <= steps; s++) {
        t = (s / steps) * 2 - 1;
        px = t * xSpan;
        defPt = deflectCanvasPoint(px, localY, einsteinR, minLensR, maxLensR);
        if (s === 0) targetCtx.moveTo(defPt.x, defPt.y);
        else targetCtx.lineTo(defPt.x, defPt.y);
      }
      targetCtx.stroke();
    }

    // 垂直測地線彎折
    for (gx = startX; gx <= endX; gx += gridSpacingCss) {
      var localX = (gx - bhPos.x) * canvasPerCss;
      if (Math.abs(localX) >= maxLensR * 0.92) continue;
      var ySpan = Math.sqrt(Math.max(0, maxLensR * maxLensR - localX * localX));
      targetCtx.beginPath();
      for (s = 0; s <= steps; s++) {
        t = (s / steps) * 2 - 1;
        py = t * ySpan;
        defPt = deflectCanvasPoint(localX, py, einsteinR, minLensR, maxLensR);
        if (s === 0) targetCtx.moveTo(defPt.x, defPt.y);
        else targetCtx.lineTo(defPt.x, defPt.y);
      }
      targetCtx.stroke();
    }

    // 2. 頁面實際 DOM 線條（<hr>、區塊邊框、分隔線）靠近黑洞時的彎折渲染
    for (var i = 0; i < pageLineSegments.length; i++) {
      var seg = pageLineSegments[i];
      var lx1 = (seg.x1 - bhPos.x) * canvasPerCss;
      var ly1 = (seg.y1 - bhPos.y) * canvasPerCss;
      var lx2 = (seg.x2 - bhPos.x) * canvasPerCss;
      var ly2 = (seg.y2 - bhPos.y) * canvasPerCss;

      var dx = lx2 - lx1;
      var dy = ly2 - ly1;
      var lenSq = dx * dx + dy * dy;
      if (lenSq < 1) continue;

      // 計算線段到黑洞中心的最短距離
      var proj = Math.max(0, Math.min(1, (-lx1 * dx - ly1 * dy) / lenSq));
      var nearX = lx1 + proj * dx;
      var nearY = ly1 + proj * dy;
      var minDist = Math.hypot(nearX, nearY);
      if (minDist >= maxLensR) continue;

      // 僅取線段在透鏡半徑範圍內的區段進行細分彎折
      var segLen = Math.sqrt(lenSq);
      var ux = dx / segLen;
      var uy = dy / segLen;
      var halfChord = Math.sqrt(Math.max(0, maxLensR * maxLensR - minDist * minDist));
      var midT = proj * segLen;
      var tStart = Math.max(0, midT - halfChord);
      var tEnd = Math.min(segLen, midT + halfChord);
      if (tEnd <= tStart) continue;

      // 先以深色背景微遮罩淡化底下原本筆直的線段，避免雙重線條感
      targetCtx.save();
      targetCtx.strokeStyle = "rgba(6, 7, 12, 0.72)";
      targetCtx.lineWidth = seg.width * canvasPerCss + 3;
      targetCtx.beginPath();
      targetCtx.moveTo(lx1 + ux * tStart, ly1 + uy * tStart);
      targetCtx.lineTo(lx1 + ux * tEnd, ly1 + uy * tEnd);
      targetCtx.stroke();
      targetCtx.restore();

      // 繪製受黑洞重力偏折後的彎曲線段
      var subSteps = 26;
      targetCtx.save();
      targetCtx.strokeStyle = seg.color || "rgba(255, 226, 180, 0.55)";
      targetCtx.shadowColor = "rgba(255, 205, 130, 0.45)";
      targetCtx.shadowBlur = 6;
      targetCtx.lineWidth = Math.max(1.2, seg.width * canvasPerCss * 1.15);
      targetCtx.beginPath();

      for (var k = 0; k <= subSteps; k++) {
        var curT = tStart + (tEnd - tStart) * (k / subSteps);
        var sx = lx1 + ux * curT;
        var sy = ly1 + uy * curT;
        var warped = deflectCanvasPoint(sx, sy, einsteinR, minLensR, maxLensR);
        if (k === 0) targetCtx.moveTo(warped.x, warped.y);
        else targetCtx.lineTo(warped.x, warped.y);
      }
      targetCtx.stroke();
      targetCtx.restore();
    }

    targetCtx.restore();
  }

  // 外露給外部（如 main.js 的 #stars 畫布）可選擇性呼叫的重力透鏡扭曲函式
  window.applyGargantuaLensingToStars = function (targetCanvasOrCtx) {
    var targetCtx =
      targetCanvasOrCtx && typeof targetCanvasOrCtx.getContext === "function"
        ? targetCanvasOrCtx.getContext("2d")
        : targetCanvasOrCtx;
    if (!targetCtx || !targetCtx.canvas) return;

    var rect = targetCtx.canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    var ratio = targetCtx.canvas.width / rect.width;
    var localCx = (bhPos.x - rect.left) * ratio;
    var localCy = (bhPos.y - rect.top) * ratio;
    var wrapperW = bhWrapper.offsetWidth || bhBaseSize * bhScale;
    var localCoreR = wrapperW * 0.145 * ratio;

    drawEinsteinStarlightArcs(targetCtx, localCx, localCy, localCoreR, ratio, performance.now() * 0.001);
  };

  function spawnAbsorptionParticle(fromX, fromY, bhX, bhY) {
    var angle = Math.atan2(fromY - bhY, fromX - bhX);
    var dist = Math.min(120, Math.hypot(fromX - bhX, fromY - bhY));
    absorptionParticles.push({
      angle: angle,
      radius: Math.max(34, dist),
      alpha: 0.95,
      size: 2.0 + Math.random() * 1.8
    });
  }

  function drawGargantua(timestamp) {
    var w = bhCanvas.width;
    var h = bhCanvas.height;
    var cx = w * 0.5;
    var cy = h * 0.5;
    var coreR = w * 0.145;
    var tilt = -0.21;
    var timeSec = (timestamp || 0) * 0.001;
    var wrapperCssW = bhWrapper.offsetWidth || bhBaseSize * bhScale || 240;
    var canvasPerCss = w / wrapperCssW;

    ctx.clearRect(0, 0, w, h);
    accretionFlash *= 0.91;

    // Layer 0 (新增): 重力透鏡層（#stars 星空扭曲、愛因斯坦環彎折星光弧、頁面線條彎折）
    drawStarsCanvasLensing(ctx, cx, cy, coreR, canvasPerCss);
    drawLensedPageLines(ctx, cx, cy, coreR, canvasPerCss);
    drawEinsteinStarlightArcs(ctx, cx, cy, coreR, canvasPerCss, timeSec);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tilt);

    // Layer 1: 外圍琥珀光暈
    var outerGlowR = coreR * (3.15 + accretionFlash * 0.45);
    var outerGrad = ctx.createRadialGradient(0, 0, coreR * 0.8, 0, 0, outerGlowR);
    outerGrad.addColorStop(0, "rgba(255, 200, 120, " + (0.36 + accretionFlash * 0.3) + ")");
    outerGrad.addColorStop(0.42, "rgba(232, 148, 64, " + (0.16 + accretionFlash * 0.15) + ")");
    outerGrad.addColorStop(0.75, "rgba(160, 75, 25, 0.04)");
    outerGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, outerGlowR, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: 上下引力透鏡彎折光弧
    for (var d = 0; d < 2; d++) {
      var dir = d === 0 ? -1 : 1;
      ctx.save();
      ctx.scale(1.18, 0.92);
      var lensGrad = ctx.createRadialGradient(0, dir * coreR * 0.14, coreR * 0.9, 0, 0, coreR * 1.66);
      lensGrad.addColorStop(0, "rgba(0,0,0,0)");
      lensGrad.addColorStop(0.56, "rgba(255, 205, 130, " + (0.5 + accretionFlash * 0.25) + ")");
      lensGrad.addColorStop(0.75, "rgba(224, 122, 44, 0.16)");
      lensGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = lensGrad;
      ctx.beginPath();
      ctx.arc(0, 0, coreR * 1.64, dir === -1 ? Math.PI * 1.08 : 0.08 * Math.PI, dir === -1 ? Math.PI * 1.92 : 0.92 * Math.PI);
      ctx.fill();
      ctx.restore();
    }

    // Layer 3: 背側吸積盤
    ctx.save();
    ctx.scale(1, 0.27);
    var backDiskGrad = ctx.createRadialGradient(-coreR * 0.35, 0, coreR * 1.05, 0, 0, coreR * 3.0);
    backDiskGrad.addColorStop(0, "#fff6df");
    backDiskGrad.addColorStop(0.24, "#ffd084");
    backDiskGrad.addColorStop(0.58, "#d97b29");
    backDiskGrad.addColorStop(0.88, "rgba(130, 50, 12, 0.16)");
    backDiskGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = backDiskGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 3.0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer 4: 事件視界與光子環
    ctx.save();
    ctx.shadowColor = "rgba(255, 222, 158, " + (0.82 + accretionFlash * 0.15) + ")";
    ctx.shadowBlur = 14 + accretionFlash * 14;
    ctx.strokeStyle = "rgba(255, 242, 210, " + (0.9 + accretionFlash * 0.1) + ")";
    ctx.lineWidth = 2.0 + accretionFlash * 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 1.02, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#020307";
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer 5: 前景吸積盤與流光紋理
    ctx.save();
    ctx.scale(1, 0.25);
    var frontDiskGrad = ctx.createRadialGradient(-coreR * 0.45, 0, coreR * 0.95, 0, 0, coreR * 3.1);
    frontDiskGrad.addColorStop(0, "rgba(255, 250, 235, " + (0.95 + accretionFlash * 0.05) + ")");
    frontDiskGrad.addColorStop(0.22, "#ffd488");
    frontDiskGrad.addColorStop(0.52, "#e38832");
    frontDiskGrad.addColorStop(0.82, "rgba(145, 55, 14, 0.2)");
    frontDiskGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = frontDiskGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreR * 3.1, 0, Math.PI);
    ctx.arc(0, 0, coreR * 0.98, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();

    for (var i = 0; i < diskStreaks.length; i++) {
      var st = diskStreaks[i];
      st.angle += st.speed * (1 + accretionFlash * 1.5);
      var r = coreR * (1.15 + st.radiusNorm * 1.82);
      var sinA = Math.sin(st.angle);
      if (sinA < -0.15 && r * 0.25 < coreR * 0.92) continue;
      var doppler = 0.65 - Math.cos(st.angle) * 0.35;
      ctx.strokeStyle = "rgba(255, 232, 185, " + Math.min(0.92, st.alpha * doppler + accretionFlash * 0.2) + ")";
      ctx.lineWidth = st.width;
      ctx.beginPath();
      ctx.arc(0, 0, r, st.angle, st.angle + st.arcLen);
      ctx.stroke();
    }
    ctx.restore();

    // Layer 6: 吸入粒子
    for (var j = absorptionParticles.length - 1; j >= 0; j--) {
      var p = absorptionParticles[j];
      p.angle += 0.22;
      p.radius *= 0.85;
      p.alpha *= 0.91;
      if (p.radius < coreR * 0.95 || p.alpha < 0.05) {
        absorptionParticles.splice(j, 1);
        continue;
      }
      var px = Math.cos(p.angle) * p.radius;
      var py = Math.sin(p.angle) * p.radius * 0.55;
      ctx.fillStyle = "rgba(255, 230, 168, " + p.alpha + ")";
      ctx.beginPath();
      ctx.arc(px, py, p.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /* =========================================================
   * 4. 黑洞定位、拖曳、文字吞噬判定 +
   *    【效果 1：義大利麵化 Spaghettification】+
   *    【效果 3：時間膨脹 Time Dilation】
   * ========================================================= */
  var bhPos = { x: 0, y: 0 };
  var isDragging = false;
  var hasDetachedFromDock = false;
  var dragOffset = { x: 0, y: 0 };

  /* 黑洞成長：每吞一個字就長大一點（越吃越大），重置時縮回原尺寸 */
  var swallowedCount = 0;
  var bhScale = 1;
  var bhBaseSize = 240;

  function updateBhBaseSize() {
    var dockW = bhDock.offsetWidth;
    if (dockW > 0) bhBaseSize = dockW;
  }

  function applyBhSize() {
    var size = Math.round(bhBaseSize * bhScale);
    bhWrapper.style.width = size + "px";
    bhWrapper.style.height = size + "px";
    applyBhPosition();
  }

  function growBlackHole() {
    swallowedCount++;
    /* 遞減成長：越吃長越慢，上限約 2.4 倍 */
    bhScale = 1 + 1.4 * (1 - Math.exp(-swallowedCount / 55));
    applyBhSize();
  }

  function syncToDock() {
    if (hasDetachedFromDock || isDragging) return;
    var rect = bhDock.getBoundingClientRect();
    bhPos.x = rect.left + rect.width * 0.5;
    bhPos.y = rect.top + rect.height * 0.5;
    applyBhPosition();
  }

  function applyBhPosition() {
    var w = bhWrapper.offsetWidth || 240;
    var h = bhWrapper.offsetHeight || 240;
    bhWrapper.style.left = (bhPos.x - w * 0.5) + "px";
    bhWrapper.style.top = (bhPos.y - h * 0.5) + "px";
  }

  function refreshAllCoordinates() {
    updateBhBaseSize();
    updateCharPositions();
    updateLucaCenters();
    initViewportLensStars();
    scanPageLines();
    if (!hasDetachedFromDock && !isDragging) {
      syncToDock();
    }
  }

  window.addEventListener("resize", refreshAllCoordinates);
  window.addEventListener("scroll", function () {
    updateCharPositions();
    updateLucaCenters();
    scanPageLines();
    if (!hasDetachedFromDock && !isDragging) {
      syncToDock();
    } else if (isDragging) {
      evaluateTextSwallowing();
    }
  }, { passive: true });

  updateBhBaseSize();
  syncToDock();
  initViewportLensStars();
  requestAnimationFrame(function () {
    updateBhBaseSize();
    syncToDock();
    updateCharPositions();
    updateLucaCenters();
    scanPageLines();
  });
  window.addEventListener("load", refreshAllCoordinates);

  /* ---------------------------------------------------------
   * 【效果 3：時間膨脹 (Time Dilation)】時間因子計算函式
   * 越靠近事件視界 (horizonR)，時間因子越趨近於 0（慢動作至近乎凍結）；
   * 遠離黑洞（>= pullR）時恢復為 1.0。
   * --------------------------------------------------------- */
  function computeTimeDilationFactor(dist, horizonR, pullR) {
    if (dist >= pullR) return 1.0;
    if (dist <= horizonR) return 0.035;
    var norm = (dist - horizonR) / Math.max(1, pullR - horizonR);
    // 類比廣義相對論引力時間膨脹曲線，越接近事件視界時間流逝越慢
    return 0.035 + 0.965 * Math.pow(norm, 1.38);
  }

  // 計算最短角度差（避免角度跨越 +-180 度時發生 360 度翻轉）
  function shortestAngleDeltaDeg(fromDeg, toDeg) {
    var diff = ((toDeg - fromDeg + 540) % 360) - 180;
    return diff;
  }

  // 依據引力紅移程度 (0 -> 1) 回傳字元顏色（由琥珀金漸變至深紅移色）
  function computeRedshiftColor(redshift) {
    if (redshift <= 0.12) return "";
    var t = Math.min(1, (redshift - 0.12) / 0.88);
    var r = 255;
    var g = Math.round(215 - t * 145);
    var b = Math.round(142 - t * 118);
    return "rgb(" + r + ", " + g + ", " + b + ")";
  }

  // 捕獲字元進入事件視界（觸發吸積盤閃光、吸入粒子、黑洞長大，並啟動視界時間凍結與義大利麵化拉絲消失）
  function captureCharIntoHorizon(rec, curX, curY) {
    rec.swallowed = true;
    rec.swallowDone = false;
    rec.swallowPhase = 0;
    rec.active = true;
    rec.el.classList.add("swallowed");
    rec.el.style.transition = "none";

    var relX = curX - bhPos.x;
    var relY = curY - bhPos.y;
    rec.captureAngle = Math.atan2(relY, relX);
    rec.captureRadius = Math.max(24 * bhScale, Math.min(44 * bhScale, Math.hypot(relX, relY)));

    accretionFlash = Math.min(1, accretionFlash + 0.3);
    spawnAbsorptionParticle(curX, curY, bhPos.x, bhPos.y);
    growBlackHole();
  }

  /* ---------------------------------------------------------
   * 【效果 1：義大利麵化 (Spaghettification)】與
   * 【效果 3：時間膨脹 (Time Dilation)】逐幀物理更新引擎
   * --------------------------------------------------------- */
  function stepCharPhysics(dtSec) {
    var canInteractWithText = hasDetachedFromDock || isDragging;
    var pullRadius = 165 * bhScale;
    var swallowRadius = 38 * bhScale;

    for (var i = 0; i < charRecords.length; i++) {
      var rec = charRecords[i];
      if (rec.isResetting || rec.swallowDone) continue;

      // -------------------------------------------------------
      // 階段 B：已跨過事件視界（在視界邊緣慢動作凍結 -> 拉長成細線紅移消失）
      // -------------------------------------------------------
      if (rec.swallowed) {
        // 前半段 (0 ~ 0.55)：因極端時間膨脹，字元在事件視界邊緣呈現近乎凍結的慢動作；
        // 後半段 (0.55 ~ 1.0)：沿徑向被極度拉長成細絲 (scaleRadial -> 8.5, scaleTangential -> 0.015) 並淡出消失
        var phaseTimeFactor = rec.swallowPhase < 0.55
          ? 0.055 + rec.swallowPhase * 0.12
          : 0.16 + (rec.swallowPhase - 0.55) * 1.45;

        rec.swallowPhase += dtSec * 8.5 * phaseTimeFactor;

        if (rec.swallowPhase >= 1) {
          rec.swallowPhase = 1;
          rec.swallowDone = true;
          rec.el.style.opacity = "0";
          continue;
        }

        var p = rec.swallowPhase;
        var horizonRimR = 34 * bhScale;
        var currentR;

        if (p < 0.55) {
          // 視界邊緣時間膨脹滯留期：極緩慢貼近視界光環，並微幅參考系拖曳旋轉
          var freezeProgress = p / 0.55;
          currentR = rec.captureRadius * (1 - freezeProgress * 0.18) + horizonRimR * (freezeProgress * 0.18);
          rec.captureAngle += dtSec * 0.35 * (0.12 + 0.15 * freezeProgress);
          rec.scaleRadial = 3.8 + freezeProgress * 1.6;
          rec.scaleTangential = Math.max(0.06, 0.15 - freezeProgress * 0.08);
          rec.opacity = 0.92 - freezeProgress * 0.14;
          rec.redshift = 0.68 + freezeProgress * 0.25;
        } else {
          // 終端義大利麵化消失期：沿黑洞徑向拉成極細長絲並墜入視界，完全不使用 scale(0)
          var streakProgress = (p - 0.55) / 0.45;
          var easeIn = streakProgress * streakProgress;
          currentR = horizonRimR * (1 - easeIn * 0.72);
          rec.captureAngle += dtSec * (0.6 + easeIn * 2.6);
          rec.scaleRadial = 5.4 + easeIn * 3.2; // 徑向拉長至 8.6 倍
          rec.scaleTangential = Math.max(0.015, 0.07 * (1 - easeIn * 0.82)); // 切向壓扁成細線
          rec.opacity = Math.max(0, 0.78 * (1 - easeIn));
          rec.redshift = 0.93 + easeIn * 0.07;
        }

        // 字元世界座標錨定於事件視界邊緣
        var worldX = bhPos.x + Math.cos(rec.captureAngle) * currentR;
        var worldY = bhPos.y + Math.sin(rec.captureAngle) * currentR;
        rec.tx = worldX - rec.cx;
        rec.ty = worldY - rec.cy;

        // 徑向角度永遠指向黑洞中心，使拉伸方向嚴格沿著黑洞半徑
        var toBhAngleDeg = (Math.atan2(bhPos.y - worldY, bhPos.x - worldX) * 180) / Math.PI;
        rec.radialAngle = toBhAngleDeg;
        rec.glyphRot = 0; // 字元已完全轉向黑洞徑向

        rec.el.style.transition = "none";
        rec.el.style.opacity = rec.opacity.toFixed(3);
        rec.el.style.color = computeRedshiftColor(rec.redshift);
        rec.el.style.transform =
          "translate(" + rec.tx.toFixed(2) + "px, " + rec.ty.toFixed(2) + "px) " +
          "rotate(" + rec.radialAngle.toFixed(2) + "deg) " +
          "scale(" + rec.scaleRadial.toFixed(3) + ", " + rec.scaleTangential.toFixed(3) + ")";
        continue;
      }

      // -------------------------------------------------------
      // 階段 A：事件視界外的引力拉扯、義大利麵化與時間膨脹
      // -------------------------------------------------------
      var dx0 = bhPos.x - rec.cx;
      var dy0 = bhPos.y - rec.cy;
      var restDist = Math.hypot(dx0, dy0);

      var curX = rec.cx + rec.tx;
      var curY = rec.cy + rec.ty;
      var dxCur = bhPos.x - curX;
      var dyCur = bhPos.y - curY;
      var effDist = Math.hypot(dxCur, dyCur);

      if (canInteractWithText && (restDist < swallowRadius || effDist < swallowRadius * 0.92)) {
        captureCharIntoHorizon(rec, curX, curY);
        continue;
      }

      if (canInteractWithText && restDist < pullRadius) {
        rec.active = true;

        // 越靠近事件視界，潮汐拉伸越劇烈
        var normProximity = 1 - (restDist - swallowRadius) / Math.max(1, pullRadius - swallowRadius);
        var pullFactor = Math.pow(Math.max(0, Math.min(1, normProximity)), 1.48);

        // 黑洞中心至字元當前位置的徑向角 (deg)
        var targetRadialDeg = (Math.atan2(dyCur, dxCur) * 180) / Math.PI;

        // 目標位移：朝黑洞中心拉近（停在事件視界外緣）
        var maxPullDist = Math.max(0, restDist - swallowRadius * 0.88);
        var pullMove = maxPullDist * pullFactor * 0.76;
        var restAngleRad = Math.atan2(dy0, dx0);
        var targetTx = Math.cos(restAngleRad) * pullMove;
        var targetTy = Math.sin(restAngleRad) * pullMove;

        // 【效果 1：義大利麵化】沿「黑洞—字元」徑向拉長 (targetScaleRadial > 1)、垂直切向壓縮 (targetScaleTangential < 1)
        var targetScaleRadial = 1 + Math.pow(pullFactor, 1.15) * 3.1;
        var targetScaleTangential = Math.max(0.14, 1 / (1 + Math.pow(pullFactor, 1.1) * 2.75));

        // 目標旋轉：遠處時字元保持正立 (radialAngle + glyphRot = 0)，越靠近黑洞越轉向黑洞徑向
        var targetGlyphRot = -targetRadialDeg * (1 - pullFactor);

        // 【效果 3：時間膨脹】距離事件視界越近，timeFactor 越趨近於 0，所有動畫速度同步變慢
        var timeFactor = computeTimeDilationFactor(effDist, swallowRadius, pullRadius);
        var stepRate = 1 - Math.exp(-18.0 * timeFactor * dtSec);

        // 初始化未變形字元的徑向角基準，避免剛進入拉扯圈時角度跳動
        if (Math.abs(rec.scaleRadial - 1) < 0.005 && Math.abs(rec.tx) < 0.1 && Math.abs(rec.ty) < 0.1) {
          rec.radialAngle = targetRadialDeg;
          rec.glyphRot = -targetRadialDeg;
        }

        rec.tx += (targetTx - rec.tx) * stepRate;
        rec.ty += (targetTy - rec.ty) * stepRate;
        rec.scaleRadial += (targetScaleRadial - rec.scaleRadial) * stepRate;
        rec.scaleTangential += (targetScaleTangential - rec.scaleTangential) * stepRate;
        // 角度穩定保護：字元離黑洞中心太近時，atan2 的徑向角對微小位移極度敏感，
        // 每幀追逐會讓旋轉來回跳動、看起來閃爍；太近時凍結角度（反正即將被捕獲）。
        if (effDist > 8) {
          rec.radialAngle += shortestAngleDeltaDeg(rec.radialAngle, targetRadialDeg) * Math.min(1, stepRate * 1.35);
        }
        rec.glyphRot += shortestAngleDeltaDeg(rec.glyphRot, targetGlyphRot) * stepRate;
        rec.redshift += (pullFactor - rec.redshift) * stepRate;

        rec.el.style.transition = "none";
        rec.el.style.color = computeRedshiftColor(rec.redshift);
        rec.el.style.transform =
          "translate(" + rec.tx.toFixed(2) + "px, " + rec.ty.toFixed(2) + "px) " +
          "rotate(" + rec.radialAngle.toFixed(2) + "deg) " +
          "scale(" + rec.scaleRadial.toFixed(3) + ", " + rec.scaleTangential.toFixed(3) + ") " +
          "rotate(" + rec.glyphRot.toFixed(2) + "deg)";
      } else if (rec.active) {
        // 黑洞離開後，字元平滑回彈恢復原狀（遠離黑洞時 timeFactor -> 1，恢復正常速度）
        var relaxRate = 1 - Math.exp(-14.0 * dtSec);
        rec.tx *= 1 - relaxRate;
        rec.ty *= 1 - relaxRate;
        rec.scaleRadial += (1 - rec.scaleRadial) * relaxRate;
        rec.scaleTangential += (1 - rec.scaleTangential) * relaxRate;
        rec.glyphRot += shortestAngleDeltaDeg(rec.glyphRot, -rec.radialAngle) * relaxRate;
        rec.redshift *= 1 - relaxRate;

        var isRestored =
          Math.abs(rec.tx) < 0.08 &&
          Math.abs(rec.ty) < 0.08 &&
          Math.abs(rec.scaleRadial - 1) < 0.004 &&
          Math.abs(rec.scaleTangential - 1) < 0.004;

        if (isRestored) {
          rec.tx = 0;
          rec.ty = 0;
          rec.scaleRadial = 1;
          rec.scaleTangential = 1;
          rec.radialAngle = 0;
          rec.glyphRot = 0;
          rec.redshift = 0;
          rec.active = false;
          rec.el.style.transform = "";
          rec.el.style.color = "";
        } else {
          rec.el.style.transition = "none";
          rec.el.style.color = computeRedshiftColor(rec.redshift);
          rec.el.style.transform =
            "translate(" + rec.tx.toFixed(2) + "px, " + rec.ty.toFixed(2) + "px) " +
            "rotate(" + rec.radialAngle.toFixed(2) + "deg) " +
            "scale(" + rec.scaleRadial.toFixed(3) + ", " + rec.scaleTangential.toFixed(3) + ") " +
            "rotate(" + rec.glyphRot.toFixed(2) + "deg)";
        }
      }
    }
  }

  // 供拖曳與捲動事件即時觸發一次吞噬與拉扯推進
  // 注意：字元物理唯一的驅動來源是主動畫迴圈 animate() 裡的 stepCharPhysics(dtSec)。
  // 這裡刻意不再呼叫 stepCharPhysics，因為 pointermove／scroll 若也推進物理，
  // 同一幀內物理會被推進兩次（事件一次＋迴圈一次），且 dt 不一致，
  // 造成黑洞附近字元的 transform 每幀來回跳動、看起來一直閃爍。
  // 迴圈每幀都會讀到最新的 bhPos，拖曳反應只差不到一幀（約 16ms），人眼感覺不到。
  function evaluateTextSwallowing() {
  }

  // 給 Luca. 字元注入一次明顯的果凍衝擊波（當黑洞貼近移動時）
  function injectJellyImpulse() {
    var impulseRadius = 175 * bhScale;
    for (var i = 0; i < lucaJellyStates.length; i++) {
      var st = lucaJellyStates[i];
      var dx = st.cx - bhPos.x;
      var dy = st.cy - bhPos.y;
      var dist = Math.hypot(dx, dy);
      if (dist < impulseRadius) {
        var strength = (1 - dist / impulseRadius) * 0.14;
        st.vsx += (Math.random() - 0.45) * strength;
        st.vsy -= (Math.random() - 0.45) * strength;
        st.vskew += (Math.random() - 0.5) * strength * 45;
      }
    }
  }

  // 重置按鈕邏輯：安靜復原所有文字與黑洞位置（黑洞也縮回原尺寸）
  function resetAll() {
    for (var i = 0; i < charRecords.length; i++) {
      var rec = charRecords[i];
      rec.swallowed = false;
      rec.swallowDone = false;
      rec.swallowPhase = 0;
      rec.tx = 0;
      rec.ty = 0;
      rec.radialAngle = 0;
      rec.glyphRot = 0;
      rec.scaleRadial = 1;
      rec.scaleTangential = 1;
      rec.redshift = 0;
      rec.opacity = 1;
      rec.active = false;
      rec.isResetting = true;

      rec.el.classList.remove("swallowed");
      rec.el.style.transition = "transform 0.4s ease, opacity 0.35s ease, color 0.25s ease";
      rec.el.style.transform = "";
      rec.el.style.opacity = "1";
      rec.el.style.color = "";
    }

    swallowedCount = 0;
    bhScale = 1;
    updateBhBaseSize();
    applyBhSize();

    hasDetachedFromDock = false;
    bhWrapper.style.transition = "left 0.45s cubic-bezier(0.22, 1, 0.36, 1), top 0.45s cubic-bezier(0.22, 1, 0.36, 1)";
    syncToDock();
    setTimeout(function () {
      for (var j = 0; j < charRecords.length; j++) {
        charRecords[j].isResetting = false;
        charRecords[j].el.style.transition = "";
      }
      bhWrapper.style.transition = "";
      refreshAllCoordinates();
      if (isReducedMotion) drawGargantua(0);
    }, 460);
  }

  var resetBtn = document.getElementById("reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", resetAll);

  // 綁定黑洞拖曳事件（只在真的點到黑洞可見範圍內才開始拖，
  // 避免 wrapper 方形透明角落被誤觸：黑洞長大後方形角落會變很大。
  // 黑洞可見形狀是橫向吸積盤（寬）＋縱向黑盤與透鏡弧（窄），
  // 用橢圓貼合可見範圍，淡到看不見的光暈外緣也不會誤觸。
  // 命中中心直接用 wrapper 實際渲染位置算，不用 bhPos，避免座標不同步）
  bhWrapper.addEventListener("pointerdown", function (e) {
    refreshAllCoordinates();
    var rect = bhWrapper.getBoundingClientRect();
    var cx = rect.left + rect.width * 0.5;
    var cy = rect.top + rect.height * 0.5;
    var rx = rect.width * 0.45;
    var ry = rect.height * 0.28;
    var nx = (e.clientX - cx) / rx;
    var ny = (e.clientY - cy) / ry;
    if (nx * nx + ny * ny > 1) return;
    e.preventDefault();
    isDragging = true;
    hasDetachedFromDock = true;
    bhWrapper.style.transition = "";
    bhWrapper.setPointerCapture(e.pointerId);

    dragOffset.x = e.clientX - bhPos.x;
    dragOffset.y = e.clientY - bhPos.y;
  });

  bhWrapper.addEventListener("pointermove", function (e) {
    if (!isDragging) return;
    bhPos.x = e.clientX - dragOffset.x;
    bhPos.y = e.clientY - dragOffset.y;
    applyBhPosition();
    evaluateTextSwallowing();
    injectJellyImpulse();
    if (isReducedMotion) drawGargantua(performance.now());
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
  }

  bhWrapper.addEventListener("pointerup", endDrag);
  bhWrapper.addEventListener("pointercancel", endDrag);

  /* =========================================================
   * 5. 主動畫迴圈（黑洞渲染 + 重力透鏡 + 義大利麵化與時間膨脹 + 果凍物理）
   * ========================================================= */
  var animationFrameId = null;
  var lastFrameTime = 0;

  function animate(timestamp) {
    var now = timestamp || performance.now();
    var dtSec = lastFrameTime ? Math.min(0.05, (now - lastFrameTime) * 0.001) : 0.016;
    lastFrameTime = now;

    drawGargantua(now);
    stepCharPhysics(dtSec);
    stepLucaJellyPhysics(now);

    if (!isReducedMotion) animationFrameId = requestAnimationFrame(animate);
  }

  function startLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    lastFrameTime = 0;
    if (isReducedMotion) {
      // 減少動態：只畫一幀靜態黑洞與重力透鏡，標題不果凍
      drawGargantua(0);
    } else {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  prefersReducedMotion.addEventListener("change", function (e) {
    isReducedMotion = e.matches;
    startLoop();
  });

  startLoop();
})();