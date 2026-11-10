// Luca 個人網站 — 星空背景 + 手機版導覽
// 純前端，無外部依賴。

(function () {
  "use strict";

  /* ── 捲動淡入：有 JS 才啟用 ── */
  document.documentElement.classList.add("js");
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }

  /* ── 星空畫布 ── */
  var canvas = document.getElementById("stars");
  if (canvas) {
    var ctx = canvas.getContext("2d");
    var stars = [];
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var DPR = Math.min(window.devicePixelRatio || 1, 1.5);

    function build() {
      var count = Math.round((window.innerWidth * window.innerHeight) / 9000);
      count = Math.max(60, Math.min(count, 220));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          r: (Math.random() * 1.1 + 0.3) * DPR,
          phase: Math.random() * Math.PI * 2,
          speed: 0.4 + Math.random() * 1.2,
          warm: Math.random() < 0.18 // 少數帶暖金色，像吸積盤的光
        });
      }
    }

    function resize() {
      canvas.width = window.innerWidth * DPR;
      canvas.height = window.innerHeight * DPR;
      canvas.style.width = window.innerWidth + "px";
      canvas.style.height = window.innerHeight + "px";
      build();
    }

    function draw(t) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i];
        var alpha = 0.35 + 0.65 * Math.abs(Math.sin((t / 1000) * st.speed + st.phase));
        ctx.globalAlpha = alpha;
        ctx.fillStyle = st.warm ? "#f2d5a0" : "#dfe8f5";
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (!reduced) requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(draw);
  }

  /* ── 手機版導覽開關 ── */
  var toggle = document.querySelector(".nav-toggle");
  var header = document.querySelector(".site-header");
  if (toggle && header) {
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    header.querySelectorAll(".site-nav a").forEach(function (link) {
      link.addEventListener("click", function () {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }
})();
