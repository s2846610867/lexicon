/* 配色主题开关 —— 静态站独有。
   在 <html> 上设 data-theme,样式变量(style.css 里的 [data-theme] 块)随之切换。
   选择存 localStorage(lexicon_theme),刷新/换页保持;开关 UI 自带样式,自包含。
*/
(function () {
  "use strict";

  var THEMES = [
    { id: "ink-green",  name: "暖纸·墨绿", dot: "#1f6b47" },
    { id: "night",      name: "夜读·靛蓝", dot: "#8aa6ff" },
    { id: "terracotta", name: "赤陶·暖橘", dot: "#c2562f" },
    { id: "celadon",    name: "青瓷·湖蓝", dot: "#1f8a7a" }
  ];
  var KEY = "lexicon_theme";
  var DEFAULT = "ink-green";

  function current() {
    var t = null;
    try { t = localStorage.getItem(KEY); } catch (e) {}
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === t) return t;
    return DEFAULT;
  }
  function apply(id) { document.documentElement.setAttribute("data-theme", id); }
  function save(id) { try { localStorage.setItem(KEY, id); } catch (e) {} }

  apply(current());   // 兜底再应用一次(<head> 内联脚本已先应用,防闪烁)

  function injectStyles() {
    if (document.getElementById("theme-switch-style")) return;
    var css =
      ".masthead { position: relative; }" +
      ".theme-switch { position: absolute; top: 28px; right: 0; z-index: 6;" +
        " display: flex; gap: 8px; align-items: center; }" +
      ".theme-dot { appearance: none; width: 16px; height: 16px; border-radius: 50%;" +
        " border: 0; padding: 0; cursor: pointer; outline: none;" +
        " box-shadow: 0 0 0 1px rgba(0,0,0,0.12);" +
        " transition: transform 0.15s ease; }" +
      ".theme-dot:hover { transform: scale(1.18); }" +
      ".theme-dot.is-active { box-shadow: 0 0 0 2px var(--paper), 0 0 0 3.5px var(--accent); }" +
      "@media (max-width: 560px) { .theme-switch { top: 24px; } }";
    var s = document.createElement("style");
    s.id = "theme-switch-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function render() {
    var host = document.getElementById("theme-switch");
    if (!host) return;
    injectStyles();
    host.innerHTML = "";
    var cur = current();
    THEMES.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "theme-dot" + (t.id === cur ? " is-active" : "");
      b.style.background = t.dot;
      b.title = t.name;
      b.setAttribute("aria-label", "切换配色:" + t.name);
      b.addEventListener("click", function () {
        apply(t.id); save(t.id); render();
      });
      host.appendChild(b);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
