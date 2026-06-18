/* 词库 · Lexicon —— 静态版前端逻辑(GitHub Pages,无后端)
   数据从 ./data/*.json 拉取,生词本存 localStorage,
   发音直连有道公网音频接口(英 type=1 / 美 type=2)。
   练习 tab 只占位提示,真功能在 Flask 电脑版。
*/

(function () {
  "use strict";

  var list = document.getElementById("list");
  var search = document.getElementById("search");
  var countEl = document.getElementById("count");
  var foot = document.getElementById("foot");
  var sentinel = document.getElementById("sentinel");
  var ink = document.querySelector(".tabs__ink");
  var searchbar = document.querySelector(".searchbar");
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));

  var importPanel = document.getElementById("import-panel");
  var importToggle = document.getElementById("import-toggle");
  var importBody = document.getElementById("import-body");
  var importInput = document.getElementById("import-input");
  var importSubmit = document.getElementById("import-submit");
  var importResult = document.getElementById("import-result");
  var importArrow = importToggle
    ? importToggle.querySelector(".import-panel__toggle-arrow")
    : null;
  var practicePanel = document.getElementById("practice-panel");
  var daybar = document.getElementById("daybar");
  var dailyTitle = document.getElementById("daily-title");
  var nc1Select = document.getElementById("nc1-lesson");

  var DEFAULT_PLACEHOLDER = "键入字母,实时过滤……";
  var MY_PLACEHOLDER = "搜单词或原句……";
  var PAGE_SIZE = 100;
  var DATA_BASE = "./data/";              // 相对路径,GitHub Pages 子路径友好
  var STATIC_SECTIONS = ["basic", "cet4", "cet6"];
  var STORAGE_KEY = "lexicon_my_words";

  var dataCache = {};   // { basic: [...], cet4: [...], cet6: [...] }
  var lookup = {};      // { word_lower: {phonetic, translation, tag} } 用于生词本查询

  var state = {
    section: tabs[0].dataset.section,
    q: "",
    offset: 0,
    total: 0,
    loading: false,
    filtered: [],       // 当前 section 经搜索过滤后的全量结果
    dailyDate: "",      // 每日记忆当前选中的日期(ISO)
    nc1Lesson: "",      // 新概念一当前选中的课次
  };

  // ---------- 文本规整 ----------
  function unescapeNewlines(s) {
    return String(s == null ? "" : s).replace(/\\r/g, "").replace(/\\n/g, "\n");
  }
  function collapseNewlines(s) {
    return String(s == null ? "" : s).replace(/\\r/g, "").replace(/\\n/g, " / ");
  }

  // ---------- 数据加载 ----------
  function ensureLoaded(section) {
    if (dataCache[section]) return Promise.resolve(dataCache[section]);
    return fetch(DATA_BASE + section + ".json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        dataCache[section] = data;
        rebuildLookup();
        return data;
      });
  }

  function rebuildLookup() {
    var L = {};
    STATIC_SECTIONS.forEach(function (sec) {
      if (!dataCache[sec]) return;
      dataCache[sec].forEach(function (w) {
        var key = (w.word || "").toLowerCase();
        if (!key || L[key]) return;
        L[key] = {
          phonetic: w.phonetic || "",
          translation: w.translation || "",
          tag: w.tag || "",
        };
      });
    });
    lookup = L;
  }

  // ---------- 每日记忆 ----------
  function fmtDay(iso) {            // "2026-06-11" -> "6.11"
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[1], 10) + "." + parseInt(p[2], 10);
  }

  function ensureDailyLoaded() {
    if (dataCache.daily) return Promise.resolve(dataCache.daily);
    // 每日记忆每天更新:加时间戳绕过浏览器/手机缓存,保证总能拿到最新一天
    return fetch(DATA_BASE + "daily.json?t=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        dataCache.daily = data && typeof data === "object" ? data : {};
        return dataCache.daily;
      });
  }

  function dailyDates() {
    return Object.keys(dataCache.daily || {}).sort().reverse();
  }

  function renderDaybar() {
    if (!daybar) return;
    daybar.innerHTML = "";
    dailyDates().forEach(function (d) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "daybar__chip" + (d === state.dailyDate ? " is-active" : "");
      chip.textContent = fmtDay(d);
      chip.addEventListener("click", function () {
        if (state.dailyDate === d) return;
        state.dailyDate = d;
        renderDaybar();
        updateDailyTitle();
        fetchPage(true);
      });
      daybar.appendChild(chip);
    });
  }

  function updateDailyTitle() {
    if (!dailyTitle) return;
    dailyTitle.textContent = state.dailyDate
      ? fmtDay(state.dailyDate) + " 需记词汇"
      : "";
  }

  // ---------- 新概念一(按课分组,选课下拉) ----------
  function ensureNc1Loaded() {
    if (dataCache.nc1) return Promise.resolve(dataCache.nc1);
    return fetch(DATA_BASE + "nc1.json")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        dataCache.nc1 = data && typeof data === "object" ? data : {};
        return dataCache.nc1;
      });
  }

  function nc1Lessons() {
    return Object.keys(dataCache.nc1 || {});   // 保留课次顺序(Lesson 1-2 在前)
  }

  function renderNc1Select() {
    if (!nc1Select) return;
    nc1Select.innerHTML = "";
    nc1Lessons().forEach(function (l) {
      var o = document.createElement("option");
      o.value = l;
      o.textContent = l;
      if (l === state.nc1Lesson) o.selected = true;
      nc1Select.appendChild(o);
    });
    nc1Select.value = state.nc1Lesson;   // 显式设定,避免浏览器恢复旧选值
  }

  function enterNc1() {
    ensureNc1Loaded()
      .then(function () {
        var lessons = nc1Lessons();
        if (!state.nc1Lesson || lessons.indexOf(state.nc1Lesson) === -1) {
          state.nc1Lesson = lessons[0] || "";
        }
        renderNc1Select();
        fetchPage(true);
      })
      .catch(function () {
        list.innerHTML = '<div class="notice">数据加载失败,请刷新重试。</div>';
        foot.textContent = "";
      });
  }

  if (nc1Select) {
    nc1Select.addEventListener("change", function () {
      state.nc1Lesson = nc1Select.value;
      fetchPage(true);
    });
  }

  // ---------- 生词本 localStorage ----------
  function loadMyWords() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }
  function saveMyWords(arr) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function importMyWords(items) {
    var current = loadMyWords();
    var exist = {};
    current.forEach(function (it) { exist[(it.word || "").toLowerCase()] = true; });
    var imported = 0, skipped = 0, not_found = [];
    var today = new Date().toISOString().slice(0, 10);
    items.forEach(function (it) {
      var word = (it.word || "").trim().toLowerCase();
      if (!word) { skipped++; return; }
      if (exist[word]) { skipped++; return; }
      current.unshift({
        word: word,
        context: ((it.context || "") + "").trim() || null,
        source: ((it.source || "") + "").trim() || null,
        added_date: today,
      });
      exist[word] = true;
      imported++;
      if (!lookup[word]) not_found.push(word);
    });
    saveMyWords(current);
    return { imported: imported, skipped: skipped, not_found: not_found };
  }

  function removeMyWord(word) {
    var key = (word || "").toLowerCase();
    var filtered = loadMyWords().filter(function (it) {
      return (it.word || "").toLowerCase() !== key;
    });
    saveMyWords(filtered);
  }

  function searchMyWords(q) {
    var all = loadMyWords();
    if (!q) return all;
    var lq = q.toLowerCase();
    return all.filter(function (it) {
      var w = (it.word || "").toLowerCase();
      var c = (it.context || "").toLowerCase();
      return w.indexOf(lq) !== -1 || c.indexOf(lq) !== -1;
    });
  }

  // ---------- 渲染 ----------
  function makePlayBtn(word, type, label, accentLabel) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "play play--" + (type === 1 ? "uk" : "us");
    b.textContent = label;
    b.setAttribute("aria-label", "播放 " + word + " 的" + accentLabel);
    b.addEventListener("click", function () { playWord(word, b, type); });
    return b;
  }

  function renderEntry(w) {
    var isMy = state.section === "my";
    var el = document.createElement("article");
    el.className = isMy ? "entry entry--my" : "entry";

    var head = document.createElement("div");
    head.className = "entry__head";
    var word = document.createElement("span");
    word.className = "entry__word";
    word.textContent = w.word;
    head.appendChild(word);
    if (w.phonetic) {
      var phon = document.createElement("span");
      phon.className = "entry__phon";
      phon.textContent = "/" + w.phonetic + "/";
      head.appendChild(phon);
    }

    var trans = document.createElement("div");
    trans.className = "entry__trans";
    if (isMy && w.in_ecdict === 0) {
      trans.classList.add("entry__trans--missing");
      trans.textContent = "词库未收录(基础 1000 / 四级 / 六级 之外)";
    } else {
      trans.textContent = unescapeNewlines(w.translation);
    }

    var playGroup = document.createElement("div");
    playGroup.className = "play-group";
    playGroup.appendChild(makePlayBtn(w.word, 1, "英", "英音"));
    playGroup.appendChild(makePlayBtn(w.word, 2, "美", "美音"));

    el.appendChild(head);
    el.appendChild(trans);
    el.appendChild(playGroup);

    if (isMy) {
      if (w.context) {
        var ctx = document.createElement("blockquote");
        ctx.className = "entry__context";
        ctx.textContent = w.context;
        el.appendChild(ctx);
      }
      var metaParts = [];
      if (w.source) metaParts.push(w.source);
      if (w.added_date) metaParts.push(w.added_date);
      if (metaParts.length) {
        var meta = document.createElement("div");
        meta.className = "entry__meta";
        meta.textContent = metaParts.join("  ·  ");
        el.appendChild(meta);
      }
      // 删除按钮
      var del = document.createElement("button");
      del.type = "button";
      del.className = "entry__del";
      del.textContent = "删除";
      del.setAttribute("aria-label", "从生词本删除 " + w.word);
      del.addEventListener("click", function () {
        if (!confirm("从生词本删除 \"" + w.word + "\"?")) return;
        removeMyWord(w.word);
        fetchPage(true);
      });
      el.appendChild(del);
    }

    return el;
  }

  function playWord(word, btn, type) {
    var t = type === 1 ? 1 : 2;
    var url =
      "https://dict.youdao.com/dictvoice?audio=" +
      encodeURIComponent(word) +
      "&type=" + t;
    var audio = new Audio(url);
    btn.classList.add("is-playing");
    var clear = function () { btn.classList.remove("is-playing"); };
    audio.addEventListener("ended", clear);
    audio.addEventListener("error", clear);
    audio.play().catch(clear);
  }

  // 当前 section 取过滤后的列表(客户端分页)
  function computeFiltered() {
    if (state.section === "daily") {
      var dayWords = (dataCache.daily || {})[state.dailyDate] || [];
      if (!state.q) return dayWords;
      var dlq = state.q.toLowerCase();
      return dayWords.filter(function (w) {
        return (w.word || "").toLowerCase().indexOf(dlq) !== -1;
      });
    }
    if (state.section === "nc1") {
      var lessonWords = (dataCache.nc1 || {})[state.nc1Lesson] || [];
      if (!state.q) return lessonWords;
      var nlq = state.q.toLowerCase();
      return lessonWords.filter(function (w) {
        return (w.word || "").toLowerCase().indexOf(nlq) !== -1;
      });
    }
    if (state.section === "my") {
      var rows = searchMyWords(state.q);
      // 用 lookup 补音标/释义
      return rows.map(function (it) {
        var key = (it.word || "").toLowerCase();
        var hit = lookup[key];
        return {
          word: it.word,
          phonetic: hit ? hit.phonetic : "",
          translation: hit ? hit.translation : "",
          context: it.context || "",
          source: it.source || "",
          added_date: it.added_date || "",
          in_ecdict: hit ? 1 : 0,
        };
      });
    }
    var all = dataCache[state.section] || [];
    if (!state.q) return all;
    var lq = state.q.toLowerCase();
    return all.filter(function (w) {
      return (w.word || "").toLowerCase().indexOf(lq) !== -1;
    });
  }

  function fetchPage(reset) {
    if (state.section === "practice") return;
    if (state.loading) return;

    if (reset) {
      state.offset = 0;
      list.innerHTML = "";
      state.filtered = computeFiltered();
      state.total = state.filtered.length;
    }

    if (state.offset >= state.total) {
      finishFoot();
      return;
    }

    state.loading = true;
    foot.textContent = "······";

    var slice = state.filtered.slice(state.offset, state.offset + PAGE_SIZE);
    var frag = document.createDocumentFragment();
    slice.forEach(function (w) { frag.appendChild(renderEntry(w)); });
    list.appendChild(frag);
    state.offset += slice.length;

    updateCount();
    if (state.total === 0) {
      var emptyHint = "没有匹配的词。";
      if (state.section === "my") {
        emptyHint = '生词本还是空的。点上方"导入生词"粘贴 JSON。';
      } else if (state.section === "daily" && dailyDates().length === 0) {
        emptyHint = "还没有每日词汇。把当天的词表发给 Claude 导入。";
      } else if (state.section === "nc1" && nc1Lessons().length === 0) {
        emptyHint = "新概念一词库加载失败,请刷新重试。";
      }
      list.innerHTML = '<div class="notice">' + emptyHint + "</div>";
      foot.textContent = "";
    } else {
      finishFoot();
    }
    state.loading = false;
  }

  function finishFoot() {
    if (state.offset >= state.total) {
      foot.textContent = state.total === 0 ? "" : "— 到底了 · 共 " + state.total + " 词 —";
    } else {
      foot.textContent = "";
    }
  }

  function updateCount() {
    var unit = state.q ? "匹配" : "词";
    countEl.textContent = state.total + " " + unit;
  }

  // ---------- 板块 UI 显隐 ----------
  function moveInk(tab) {
    ink.style.width = tab.offsetWidth + "px";
    ink.style.transform = "translateX(" + tab.offsetLeft + "px)";
  }

  function applySectionUI() {
    var isMy = state.section === "my";
    var isPractice = state.section === "practice";
    var isDaily = state.section === "daily";
    var isNc1 = state.section === "nc1";
    if (daybar) daybar.hidden = !isDaily;
    if (dailyTitle) dailyTitle.hidden = !isDaily;
    if (nc1Select) nc1Select.hidden = !isNc1;
    if (importPanel) importPanel.hidden = !isMy;
    if (practicePanel) practicePanel.hidden = !isPractice;
    if (searchbar) searchbar.hidden = isPractice;
    if (list) list.hidden = isPractice;
    if (sentinel) sentinel.hidden = isPractice;
    if (foot) foot.hidden = isPractice;
    search.placeholder = isMy ? MY_PLACEHOLDER : DEFAULT_PLACEHOLDER;
    if (importResult) {
      importResult.hidden = true;
      importResult.textContent = "";
      importResult.className = "import-panel__result";
    }
  }

  // ---------- 导入面板折叠 ----------
  if (importToggle) {
    importToggle.addEventListener("click", function () {
      var expanded = importToggle.getAttribute("aria-expanded") === "true";
      var next = !expanded;
      importToggle.setAttribute("aria-expanded", next ? "true" : "false");
      importBody.hidden = !next;
      if (importArrow) importArrow.textContent = next ? "▴" : "▾";
    });
  }

  // ---------- 导入按钮:粘 JSON → localStorage ----------
  function showResult(text, kind) {
    if (!importResult) return;
    importResult.hidden = false;
    importResult.textContent = text;
    importResult.className = "import-panel__result is-" + (kind || "info");
  }

  if (importSubmit) {
    importSubmit.addEventListener("click", function () {
      var raw = (importInput.value || "").trim();
      if (!raw) {
        showResult("请先粘贴 JSON。", "error");
        return;
      }
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        showResult("JSON 格式不合法:" + e.message, "error");
        return;
      }
      if (!Array.isArray(parsed)) {
        showResult("根 JSON 必须是数组,例如 [{\"word\": \"…\"}]", "error");
        return;
      }
      for (var i = 0; i < parsed.length; i++) {
        if (typeof parsed[i] !== "object" || parsed[i] === null) {
          showResult("第 " + (i + 1) + " 个元素不是对象", "error");
          return;
        }
        if (typeof parsed[i].word !== "string" || !parsed[i].word.trim()) {
          showResult("第 " + (i + 1) + " 个元素缺少有效的 word 字段", "error");
          return;
        }
      }

      var res = importMyWords(parsed);
      var parts = ["成功 " + res.imported + " 条", "跳过 " + res.skipped + " 条"];
      if (res.not_found && res.not_found.length) {
        parts.push("词库外 " + res.not_found.length + " 条:" +
          res.not_found.slice(0, 8).join(", ") +
          (res.not_found.length > 8 ? " …" : ""));
      }
      showResult(parts.join(" · "), res.imported > 0 ? "ok" : "info");
      if (res.imported > 0) {
        importInput.value = "";
        if (state.section === "my") fetchPage(true);
      }
    });
  }

  // ---------- 板块切换 ----------
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      if (tab.classList.contains("is-active")) return;
      tabs.forEach(function (t) { t.classList.remove("is-active"); });
      tab.classList.add("is-active");
      moveInk(tab);
      state.section = tab.dataset.section;
      search.value = "";
      state.q = "";
      applySectionUI();

      if (state.section === "practice") return;       // 占位提示,无数据
      if (state.section === "daily") {
        ensureDailyLoaded()
          .then(function () {
            var dates = dailyDates();
            if (!state.dailyDate || dates.indexOf(state.dailyDate) === -1) {
              state.dailyDate = dates[0] || "";
            }
            renderDaybar();
            updateDailyTitle();
            fetchPage(true);
          })
          .catch(function () {
            list.innerHTML = '<div class="notice">数据加载失败,请刷新重试。</div>';
            foot.textContent = "";
          });
        return;
      }
      if (state.section === "nc1") { enterNc1(); return; }
      if (state.section === "my") { fetchPage(true); return; }
      // 静态板块:可能未加载完,先 ensureLoaded 再渲染
      ensureLoaded(state.section).then(function () { fetchPage(true); })
        .catch(function () {
          list.innerHTML = '<div class="notice">数据加载失败,请刷新重试。</div>';
          foot.textContent = "";
        });
    });
  });

  // ---------- 实时搜索(防抖) ----------
  var debounce;
  search.addEventListener("input", function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () {
      state.q = search.value.trim();
      fetchPage(true);
    }, 200);
  });

  // ---------- 滚动加载 ----------
  var io = new IntersectionObserver(
    function (entries) {
      if (entries[0].isIntersecting) fetchPage(false);
    },
    { rootMargin: "400px" }
  );
  io.observe(sentinel);

  // ---------- 启动 ----------
  window.addEventListener("load", function () { moveInk(tabs[0]); });
  moveInk(tabs[0]);
  applySectionUI();

  // 首屏:默认板块 = 新概念一(第一个 tab),渲染它;
  // 后台并行拉 basic/cet4/cet6 让生词本 lookup 完整(不渲染)
  if (state.section === "nc1") {
    enterNc1();
  } else {
    ensureLoaded(state.section).then(function () { fetchPage(true); })
      .catch(function () {
        list.innerHTML = '<div class="notice">数据加载失败,请刷新页面重试。</div>';
        foot.textContent = "";
      });
  }
  ensureLoaded("basic").catch(function () { /* 静默,仅影响生词本 lookup */ });
  ensureLoaded("cet4").catch(function () { /* 同上 */ });
  ensureLoaded("cet6").catch(function () { /* 同上 */ });
})();
