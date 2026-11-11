// Luca 個人網站 — 可拖動的卡岡圖雅黑洞 + 文字吞噬
// 改寫自 Argon 產生的 luca_13_ei52.html（Canvas 2D、零依賴）。
// 黑洞平時停在 hero 右側的 #bh-dock，滑鼠／手指可以把它拖著走；
// 靠近頁面文字時會先把字拉向黑洞、再吸進去（字元縮小旋轉消失，吸積盤閃一下）。
// 「Luca.」標題字元有果凍彈性物理，黑洞靠近時會被拉扯變形。
// 右上角 ↺ 重置按鈕可以把文字與黑洞位置全部復原。
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
          cx: 0,
          cy: 0
        });
      }
      el.appendChild(frag);
    });
  }

  function updateCharPositions() {
    for (var i = 0; i < charRecords.length; i++) {
      var rec = charRecords[i];
      if (rec.swallowed) continue;
      var prevTransform = rec.el.style.transform;
      rec.el.style.transform = "";
      var rect = rec.el.getBoundingClientRect();
      rec.el.style.transform = prevTransform;
      rec.cx = rect.left + rect.width * 0.5;
      rec.cy = rect.top + rect.height * 0.5;
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
   * 3. 卡岡圖雅黑洞 Canvas 渲染 (#gargantua-canvas)
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

  function drawGargantua() {
    var w = bhCanvas.width;
    var h = bhCanvas.height;
    var cx = w * 0.5;
    var cy = h * 0.5;
    var coreR = w * 0.145;
    var tilt = -0.21;

    ctx.clearRect(0, 0, w, h);
    accretionFlash *= 0.91;

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
   * 4. 黑洞定位、拖曳與文字吞噬判定
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
    if (!hasDetachedFromDock && !isDragging) {
      syncToDock();
    }
  }

  window.addEventListener("resize", refreshAllCoordinates);
  window.addEventListener("scroll", function () {
    updateCharPositions();
    updateLucaCenters();
    if (!hasDetachedFromDock && !isDragging) {
      syncToDock();
    } else if (isDragging) {
      evaluateTextSwallowing();
    }
  }, { passive: true });

  updateBhBaseSize();
  syncToDock();
  requestAnimationFrame(function () {
    updateBhBaseSize();
    syncToDock();
    updateCharPositions();
    updateLucaCenters();
  });
  window.addEventListener("load", refreshAllCoordinates);

  function evaluateTextSwallowing() {
    var pullRadius = 150 * bhScale;
    var swallowRadius = 38 * bhScale;

    for (var i = 0; i < charRecords.length; i++) {
      var rec = charRecords[i];
      if (rec.swallowed) continue;

      var dx = bhPos.x - rec.cx;
      var dy = bhPos.y - rec.cy;
      var dist = Math.hypot(dx, dy);

      if (dist < swallowRadius) {
        rec.swallowed = true;
        rec.el.classList.add("swallowed");
        rec.el.style.transition = "transform 0.2s ease-in, opacity 0.2s ease-in";
        rec.el.style.transform = "translate(" + dx + "px, " + dy + "px) scale(0) rotate(200deg)";
        rec.el.style.opacity = "0";

        accretionFlash = Math.min(1, accretionFlash + 0.3);
        spawnAbsorptionParticle(rec.cx, rec.cy, bhPos.x, bhPos.y);
        growBlackHole();
      } else if (dist < pullRadius) {
        var pullFactor = Math.pow(1 - (dist - swallowRadius) / (pullRadius - swallowRadius), 1.6);
        var angle = Math.atan2(dy, dx);
        var moveX = dx * pullFactor * 0.55;
        var moveY = dy * pullFactor * 0.55;
        var rotDeg = (angle * 180 / Math.PI) * pullFactor * 0.4;
        var scaleX = 1 + pullFactor * 0.42;
        var scaleY = Math.max(0.38, 1 - pullFactor * 0.48);

        rec.el.style.transition = "none";
        rec.el.style.transform = "translate(" + moveX.toFixed(1) + "px, " + moveY.toFixed(1) + "px) rotate(" + rotDeg.toFixed(1) + "deg) scale(" + scaleX.toFixed(2) + ", " + scaleY.toFixed(2) + ")";
        rec.el.style.color = pullFactor > 0.38 ? "#ffd28a" : "";
      } else if (rec.el.style.transform) {
        rec.el.style.transition = "transform 0.3s ease-out, color 0.2s ease";
        rec.el.style.transform = "";
        rec.el.style.color = "";
      }
    }
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
      bhWrapper.style.transition = "";
      refreshAllCoordinates();
    }, 460);
  }

  var resetBtn = document.getElementById("reset-btn");
  if (resetBtn) resetBtn.addEventListener("click", resetAll);

  // 綁定黑洞拖曳事件
  bhWrapper.addEventListener("pointerdown", function (e) {
    e.preventDefault();
    refreshAllCoordinates();
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
  });

  function endDrag() {
    if (!isDragging) return;
    isDragging = false;
  }

  bhWrapper.addEventListener("pointerup", endDrag);
  bhWrapper.addEventListener("pointercancel", endDrag);

  /* =========================================================
   * 5. 主動畫迴圈（黑洞旋轉 + 果凍物理）
   * ========================================================= */
  var animationFrameId = null;

  function animate(timestamp) {
    drawGargantua();
    stepLucaJellyPhysics(timestamp || 0);
    if (!isReducedMotion) animationFrameId = requestAnimationFrame(animate);
  }

  function startLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (isReducedMotion) {
      // 減少動態：只畫一幀靜態黑洞，標題不果凍
      drawGargantua();
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
