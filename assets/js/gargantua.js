// Luca 個人網站 — 輕量版卡岡圖雅 Hero 背景
// 改寫自 Argon 產生的 gargantua-hero.html（Canvas 2D、零依賴）。
// 只畫黑洞本體與吸積盤；星空由全站的 #stars 畫布提供，不在這裡重畫。
// 畫布置於 hero 內（absolute），尺寸跟著 hero 走，不是跟著視窗。

(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  var canvas = document.getElementById("gargantua-canvas");
  if (!hero || !canvas) return;
  var ctx = canvas.getContext("2d", { alpha: false });

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var isReducedMotion = prefersReducedMotion.matches;

  var width = 0;
  var height = 0;
  var dpr = 1;
  var time = 0;
  var animationFrameId = null;

  // 滑鼠視差（目標與當前平滑位置）
  var mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };

  // 吸積盤光絲
  var diskStreaks = [];

  // 黑洞幾何（相對於 hero 尺寸）
  var bh = { x: 0, y: 0, radius: 0, tilt: -0.21 };

  function initDiskStreaks() {
    diskStreaks = [];
    var streakCount = 42;
    for (var i = 0; i < streakCount; i++) {
      diskStreaks.push({
        rNorm: Math.pow(Math.random(), 1.4),
        angle: Math.random() * Math.PI * 2,
        length: 0.35 + Math.random() * 0.9,
        speed: (0.12 + Math.random() * 0.18) * (0.45 / (0.25 + Math.random())),
        alpha: 0.12 + Math.random() * 0.28,
        width: 0.6 + Math.random() * 1.6,
        isHot: Math.random() > 0.65
      });
    }
  }

  // 依 hero 尺寸調整畫布與黑洞位置
  function handleResize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = hero.getBoundingClientRect();
    width = Math.max(1, Math.round(rect.width));
    height = Math.max(1, Math.round(rect.height));

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    var isMobile = window.innerWidth <= 768;
    var isTablet = window.innerWidth > 768 && window.innerWidth <= 1024;

    if (isMobile) {
      // 手機：黑洞縮小，放右上方，避開標題與按鈕
      bh.x = width * 0.72;
      bh.y = height * 0.24;
      bh.radius = Math.max(42, Math.min(Math.min(width, height) * 0.14, 68));
    } else if (isTablet) {
      bh.x = width * 0.68;
      bh.y = height * 0.44;
      bh.radius = Math.min(width, height) * 0.135;
    } else {
      // 桌面：黑洞放右側偏中，左側留給文字
      bh.x = width * 0.68;
      bh.y = height * 0.48;
      bh.radius = Math.max(85, Math.min(Math.min(width, height) * 0.145, 155));
    }

    if (isReducedMotion) renderScene(0);
  }

  // 繪製卡岡圖雅黑洞（6 層渲染法，沿用 Argon 的做法）
  function drawGargantua(t) {
    var R = bh.radius;
    var breathe = isReducedMotion ? 1 : (0.94 + 0.06 * Math.sin(t * 1.1));

    ctx.save();
    ctx.translate(bh.x + mouse.x, bh.y + mouse.y);
    ctx.rotate(bh.tilt);

    // Layer 1: 遠景深空環境光暈
    var ambientRadius = R * 4.2;
    var ambientGrad = ctx.createRadialGradient(0, 0, R * 0.8, 0, 0, ambientRadius);
    ambientGrad.addColorStop(0, "rgba(226, 166, 61, " + (0.18 * breathe) + ")");
    ambientGrad.addColorStop(0.35, "rgba(255, 123, 0, " + (0.07 * breathe) + ")");
    ambientGrad.addColorStop(0.7, "rgba(140, 55, 10, " + (0.02 * breathe) + ")");
    ambientGrad.addColorStop(1, "rgba(4, 6, 12, 0)");
    ctx.fillStyle = ambientGrad;
    ctx.beginPath();
    ctx.arc(0, 0, ambientRadius, 0, Math.PI * 2);
    ctx.fill();

    // Layer 2: 重力透鏡彎折光帶（盤面後方在黑洞上下形成拱形亮帶）
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.save();
    ctx.scale(1.18, 1.0);
    var lensedGrad = ctx.createRadialGradient(0, 0, R * 0.96, 0, 0, R * 1.68);
    lensedGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    lensedGrad.addColorStop(0.05, "rgba(255, 230, 175, " + (0.42 * breathe) + ")");
    lensedGrad.addColorStop(0.22, "rgba(226, 166, 61, " + (0.28 * breathe) + ")");
    lensedGrad.addColorStop(0.55, "rgba(255, 123, 0, " + (0.09 * breathe) + ")");
    lensedGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = lensedGrad;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.68, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    for (var i = 0; i < 16; i++) {
      var streak = diskStreaks[i];
      var currentAngle = streak.angle + t * streak.speed * 0.7;
      var wave = Math.sin(currentAngle);
      var archRadiusX = R * (1.08 + streak.rNorm * 0.42);
      var archRadiusY = R * (1.03 + streak.rNorm * 0.34);
      ctx.strokeStyle = streak.isHot
        ? "rgba(255, 225, 165, " + (streak.alpha * 0.35 * breathe) + ")"
        : "rgba(226, 166, 61, " + (streak.alpha * 0.3 * breathe) + ")";
      ctx.lineWidth = streak.width * 1.1;
      ctx.beginPath();
      ctx.ellipse(0, 0, archRadiusX, archRadiusY, 0, Math.PI * 1.12 + wave * 0.18, Math.PI * 1.88 + wave * 0.18);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, archRadiusX * 0.98, archRadiusY * 0.95, 0, Math.PI * 0.15 - wave * 0.15, Math.PI * 0.85 - wave * 0.15);
      ctx.stroke();
    }
    ctx.restore();

    // Layer 3: 主吸積盤（壓扁的水平橢圓）
    var diskScaleY = 0.23;
    var diskOuterR = R * 3.55;
    ctx.save();
    ctx.scale(1.0, diskScaleY);
    var diskBaseGrad = ctx.createRadialGradient(0, 0, R * 0.95, 0, 0, diskOuterR);
    diskBaseGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    diskBaseGrad.addColorStop(0.03, "rgba(255, 240, 200, " + (0.72 * breathe) + ")");
    diskBaseGrad.addColorStop(0.14, "rgba(226, 166, 61, " + (0.58 * breathe) + ")");
    diskBaseGrad.addColorStop(0.38, "rgba(255, 123, 0, " + (0.28 * breathe) + ")");
    diskBaseGrad.addColorStop(0.68, "rgba(160, 55, 10, " + (0.08 * breathe) + ")");
    diskBaseGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = diskBaseGrad;
    ctx.beginPath();
    ctx.arc(0, 0, diskOuterR, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    for (var j = 0; j < diskStreaks.length; j++) {
      var s = diskStreaks[j];
      var r = R * 1.08 + s.rNorm * (diskOuterR * 0.85 - R * 1.08);
      var ang = s.angle + t * s.speed;
      var radialFade = Math.pow(1 - s.rNorm, 1.3);
      var finalAlpha = s.alpha * radialFade * breathe;
      if (finalAlpha > 0.01) {
        ctx.strokeStyle = s.isHot
          ? "rgba(255, 228, 170, " + finalAlpha + ")"
          : "rgba(226, 166, 61, " + finalAlpha + ")";
        ctx.lineWidth = s.width * 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, r, ang, ang + s.length);
        ctx.stroke();
      }
    }

    // 都卜勒集束效應：左側較亮、右側略暗
    ctx.globalCompositeOperation = "source-over";
    var dopplerGrad = ctx.createLinearGradient(-diskOuterR, 0, diskOuterR, 0);
    dopplerGrad.addColorStop(0, "rgba(255, 210, 130, " + (0.12 * breathe) + ")");
    dopplerGrad.addColorStop(0.35, "rgba(226, 166, 61, " + (0.08 * breathe) + ")");
    dopplerGrad.addColorStop(0.65, "rgba(4, 6, 12, 0.15)");
    dopplerGrad.addColorStop(1, "rgba(4, 6, 12, 0.35)");
    ctx.fillStyle = dopplerGrad;
    ctx.beginPath();
    ctx.arc(0, 0, diskOuterR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer 4: 黑洞本體與光子環
    ctx.fillStyle = "#020307";
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill();

    var photonGrad = ctx.createLinearGradient(-R, -R * 0.3, R, R * 0.3);
    photonGrad.addColorStop(0, "rgba(255, 242, 210, " + (0.88 * breathe) + ")");
    photonGrad.addColorStop(0.5, "rgba(226, 166, 61, " + (0.65 * breathe) + ")");
    photonGrad.addColorStop(1, "rgba(255, 123, 0, " + (0.35 * breathe) + ")");
    ctx.strokeStyle = photonGrad;
    ctx.lineWidth = Math.max(1.2, R * 0.018);
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.005, 0, Math.PI * 2);
    ctx.stroke();

    // Layer 5: 前景吸積盤橫越帶（近端盤面橫越黑洞前方）
    ctx.save();
    ctx.beginPath();
    ctx.rect(-diskOuterR * 1.1, -R * 0.02, diskOuterR * 2.2, diskOuterR);
    ctx.clip();
    ctx.scale(1.0, diskScaleY);
    var frontGrad = ctx.createRadialGradient(0, 0, R * 0.96, 0, 0, diskOuterR * 0.95);
    frontGrad.addColorStop(0, "rgba(0, 0, 0, 0)");
    frontGrad.addColorStop(0.025, "rgba(255, 245, 215, " + (0.85 * breathe) + ")");
    frontGrad.addColorStop(0.12, "rgba(226, 166, 61, " + (0.68 * breathe) + ")");
    frontGrad.addColorStop(0.35, "rgba(255, 123, 0, " + (0.32 * breathe) + ")");
    frontGrad.addColorStop(0.65, "rgba(160, 55, 10, " + (0.08 * breathe) + ")");
    frontGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = frontGrad;
    ctx.beginPath();
    ctx.arc(0, 0, diskOuterR * 0.95, 0, Math.PI);
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    for (var k = 0; k < diskStreaks.length; k++) {
      var s2 = diskStreaks[k];
      var r2 = R * 1.04 + s2.rNorm * (diskOuterR * 0.8 - R * 1.04);
      var ang2 = (s2.angle + t * s2.speed) % (Math.PI * 2);
      var fade2 = Math.pow(1 - s2.rNorm, 1.35);
      var alpha2 = s2.alpha * fade2 * 1.15 * breathe;
      if (alpha2 > 0.01) {
        ctx.strokeStyle = s2.isHot
          ? "rgba(255, 235, 185, " + alpha2 + ")"
          : "rgba(226, 166, 61, " + alpha2 + ")";
        ctx.lineWidth = s2.width * 2.0;
        ctx.beginPath();
        ctx.arc(0, 0, r2, ang2, ang2 + s2.length);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Layer 6: 前景盤面與黑洞交界的微暗吸光邊緣
    ctx.save();
    ctx.scale(1.0, diskScaleY);
    ctx.strokeStyle = "rgba(4, 6, 12, 0.45)";
    ctx.lineWidth = R * 0.06;
    ctx.beginPath();
    ctx.arc(0, 0, R * 1.01, 0.08 * Math.PI, 0.92 * Math.PI);
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function renderScene(timestamp) {
    time = timestamp * 0.00055;
    mouse.x += (mouse.targetX - mouse.x) * 0.04;
    mouse.y += (mouse.targetY - mouse.y) * 0.04;
    ctx.fillStyle = "#04060c";
    ctx.fillRect(0, 0, width, height);
    drawGargantua(time);
  }

  function animate(timestamp) {
    renderScene(timestamp);
    if (!isReducedMotion) animationFrameId = requestAnimationFrame(animate);
  }

  function startLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (isReducedMotion) {
      mouse.targetX = 0; mouse.targetY = 0; mouse.x = 0; mouse.y = 0;
      renderScene(0);
    } else {
      animationFrameId = requestAnimationFrame(animate);
    }
  }

  // 滑鼠視差（幅度小，沉穩不暈）
  window.addEventListener("mousemove", function (e) {
    if (isReducedMotion) return;
    var normX = (e.clientX / window.innerWidth) - 0.5;
    var normY = (e.clientY / window.innerHeight) - 0.5;
    mouse.targetX = normX * 26;
    mouse.targetY = normY * 18;
  }, { passive: true });

  // hero 尺寸變化時重算（字體載入、視窗縮放都會觸發）
  if ("ResizeObserver" in window) {
    new ResizeObserver(handleResize).observe(hero);
  }
  window.addEventListener("resize", handleResize, { passive: true });

  prefersReducedMotion.addEventListener("change", function (e) {
    isReducedMotion = e.matches;
    startLoop();
  });

  initDiskStreaks();
  handleResize();
  startLoop();
})();
