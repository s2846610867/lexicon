/* ============================================================
   Lexicon · 点击迸火花(Click Spark,参考 React Bits)
   全站点击时,在指针处迸出一圈小火花再淡开。
   - 纯原生 JS,无依赖,自注入样式
   - 颜色跟随当前主题的 --accent
   - 尊重「减少动效」无障碍偏好(开启则完全不运行)
   ============================================================ */
(function () {
  var mq = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
  if (mq && mq.matches) return;

  var style = document.createElement("style");
  style.textContent =
    ".lx-spark{position:fixed;border-radius:50%;pointer-events:none;z-index:9999;" +
    "transform:translate(-50%,-50%);will-change:transform,opacity}" +
    "@keyframes lxSparkFly{0%{opacity:1}" +
    "100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy))) scale(0.2);opacity:0}}";
  document.head.appendChild(style);

  function spark(x, y) {
    var accent = getComputedStyle(document.documentElement)
      .getPropertyValue("--accent").trim() || "#1f6b47";
    var n = 10;
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span");
      s.className = "lx-spark";
      var ang = (Math.PI * 2 / n) * i + (Math.random() - 0.5) * 0.4;
      var dist = 20 + Math.random() * 16;
      var size = 3 + Math.random() * 3;
      s.style.left = x + "px";
      s.style.top = y + "px";
      s.style.width = size + "px";
      s.style.height = size + "px";
      s.style.background = accent;
      s.style.setProperty("--dx", Math.cos(ang) * dist + "px");
      s.style.setProperty("--dy", Math.sin(ang) * dist + "px");
      s.style.animation = "lxSparkFly " + (0.5 + Math.random() * 0.2) +
        "s cubic-bezier(0.2,0.7,0.2,1) forwards";
      document.body.appendChild(s);
      (function (el) { setTimeout(function () { el.remove(); }, 800); })(s);
    }
  }

  document.addEventListener("click", function (e) {
    // 忽略键盘触发的 click(如回车提交),避免在屏幕角落乱迸
    if (e.detail === 0 && e.clientX === 0 && e.clientY === 0) return;
    spark(e.clientX, e.clientY);
  }, { passive: true });
})();
