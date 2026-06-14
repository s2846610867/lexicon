/* 精读 · Lexicon —— 静态版,无后端。
   文章数据从 ./data/articles/*.json 拉取,点词本地查 word_dict,
   加入生词本写 localStorage(复用 lexicon_my_words,与「生词本」tab 共享)。
*/
(function () {
  "use strict";

  var ARTICLES_BASE = "./data/articles/";
  var STORAGE_KEY = "lexicon_my_words";

  var listView = document.getElementById("list-view");
  var detailView = document.getElementById("detail-view");
  var articleList = document.getElementById("article-list");
  var detailBody = document.getElementById("detail-body");
  var backBtn = document.getElementById("back-btn");
  var cardHost = document.getElementById("word-card-host");

  var currentArticle = null;
  var activeWordEl = null;

  function todayStr() { return new Date().toISOString().slice(0, 10); }

  function unescapeNewlines(s) {
    return String(s == null ? "" : s).replace(/\\r/g, "").replace(/\\n/g, "\n");
  }

  // ---------- 文章列表 ----------
  function loadList() {
    fetch(ARTICLES_BASE + "index.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(renderList)
      .catch(function () {
        articleList.innerHTML = '<div class="notice">还没有文章。</div>';
      });
  }

  function renderList(items) {
    articleList.innerHTML = "";
    if (!items || !items.length) {
      articleList.innerHTML = '<div class="notice">还没有文章。</div>';
      return;
    }
    items.forEach(function (a) {
      var card = document.createElement("button");
      card.className = "art-card";
      var t = document.createElement("div");
      t.className = "art-card__title"; t.textContent = a.title_en;
      var cn = document.createElement("div");
      cn.className = "art-card__cn"; cn.textContent = a.title_cn;
      var meta = document.createElement("div");
      meta.className = "art-card__meta";
      var bits = [];
      if (a.category) bits.push(a.category);
      if (a.year) bits.push(a.year);
      bits.push(a.word_count + " 词");
      meta.textContent = bits.join("  ·  ");
      card.appendChild(t); card.appendChild(cn); card.appendChild(meta);
      card.addEventListener("click", function () { openArticle(a.id); });
      articleList.appendChild(card);
    });
  }

  // ---------- 文章详情 ----------
  function openArticle(id) {
    fetch(ARTICLES_BASE + id + ".json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (art) {
        currentArticle = art;
        renderDetail(art);
        listView.hidden = true;
        detailView.hidden = false;
        window.scrollTo(0, 0);
      })
      .catch(function () {
        detailBody.innerHTML = '<div class="notice">文章加载失败,请重试。</div>';
        listView.hidden = true;
        detailView.hidden = false;
      });
  }

  function renderDetail(art) {
    closeCard();
    detailBody.innerHTML = "";

    var title = document.createElement("div");
    title.className = "detail-title"; title.textContent = art.title_en;
    var cn = document.createElement("div");
    cn.className = "detail-cn"; cn.textContent = art.title_cn;
    var meta = document.createElement("div");
    meta.className = "detail-meta";
    var bits = [];
    if (art.category) bits.push(art.category);
    if (art.year) bits.push(art.year);
    bits.push(art.word_count + " 词");
    meta.textContent = bits.join("  ·  ");
    detailBody.appendChild(title);
    detailBody.appendChild(cn);
    detailBody.appendChild(meta);

    art.paragraphs.forEach(function (p, pi) {
      var para = document.createElement("div");
      para.className = "para";

      var en = document.createElement("p");
      en.className = "para__en";
      renderWords(p.en, pi, en);
      para.appendChild(en);

      var toggle = document.createElement("button");
      toggle.className = "para__toggle";
      toggle.textContent = "显示翻译 ▾";
      var cnEl = document.createElement("div");
      cnEl.className = "para__cn"; cnEl.textContent = p.cn; cnEl.hidden = true;
      toggle.addEventListener("click", function () {
        cnEl.hidden = !cnEl.hidden;
        toggle.textContent = cnEl.hidden ? "显示翻译 ▾" : "收起翻译 ▴";
      });
      para.appendChild(toggle);
      para.appendChild(cnEl);

      detailBody.appendChild(para);
    });
  }

  // 把英文按词切分:奇数段是单词,包成可点 span;其余原样(标点/空格)
  function renderWords(enText, paraIndex, container) {
    var parts = enText.split(/([A-Za-z]+(?:'[A-Za-z]+)?)/);
    parts.forEach(function (part, i) {
      if (i % 2 === 1) {
        var span = document.createElement("span");
        span.className = "rw";
        span.textContent = part;
        span.dataset.pi = paraIndex;
        span.addEventListener("click", function () { onWordClick(span); });
        container.appendChild(span);
      } else if (part) {
        container.appendChild(document.createTextNode(part));
      }
    });
  }

  // ---------- 词卡 ----------
  function onWordClick(span) {
    if (activeWordEl) activeWordEl.classList.remove("is-active");
    activeWordEl = span;
    span.classList.add("is-active");

    var token = span.textContent.toLowerCase();
    var entry = currentArticle.word_dict[token] || null;
    var pi = parseInt(span.dataset.pi, 10);
    var sentence = sentenceContaining(currentArticle.paragraphs[pi].en, span.textContent);
    showCard(entry, span.textContent, sentence);
  }

  function sentenceContaining(paraEn, surface) {
    var sents = paraEn.match(/[^.!?]+[.!?]*/g) || [paraEn];
    var lw = surface.toLowerCase();
    for (var i = 0; i < sents.length; i++) {
      if (sents[i].toLowerCase().indexOf(lw) !== -1) return sents[i].trim();
    }
    return paraEn.trim();
  }

  function showCard(entry, surface, sentence) {
    cardHost.innerHTML = "";
    var card = document.createElement("div");
    card.className = "word-card";

    var head = document.createElement("div");
    head.className = "word-card__head";
    var w = document.createElement("span");
    w.className = "word-card__word";
    w.textContent = entry ? entry.word : surface;
    head.appendChild(w);
    if (entry && entry.phonetic) {
      var phon = document.createElement("span");
      phon.className = "word-card__phon";
      phon.textContent = "/" + entry.phonetic + "/";
      head.appendChild(phon);
    }
    var close = document.createElement("button");
    close.className = "word-card__close"; close.textContent = "✕";
    close.addEventListener("click", closeCard);
    head.appendChild(close);
    card.appendChild(head);

    var meaning = document.createElement("div");
    meaning.className = "word-card__meaning";
    if (entry) {
      meaning.textContent = unescapeNewlines(entry.meaning);
    } else {
      meaning.className += " word-card__missing";
      meaning.textContent = "词库未收录这个词";
    }
    card.appendChild(meaning);

    var actions = document.createElement("div");
    actions.className = "word-card__actions";
    var playWordStr = entry ? entry.word : surface;
    actions.appendChild(makePlayBtn(playWordStr, 1, "英"));
    actions.appendChild(makePlayBtn(playWordStr, 2, "美"));

    if (entry) {
      var add = document.createElement("button");
      add.className = "word-card__add";
      add.textContent = "加入生词本";
      add.addEventListener("click", function () {
        var res = addToWordbook(entry.word, sentence);
        if (res === "ok") { add.textContent = "✓ 已加入"; add.disabled = true; }
        else if (res === "exists") { add.textContent = "已在生词本"; add.disabled = true; }
      });
      actions.appendChild(add);
    }
    card.appendChild(actions);

    cardHost.appendChild(card);
  }

  function closeCard() {
    cardHost.innerHTML = "";
    if (activeWordEl) { activeWordEl.classList.remove("is-active"); activeWordEl = null; }
  }

  function makePlayBtn(word, type, label) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "play";
    b.textContent = label;
    b.addEventListener("click", function () { playWord(word, b, type); });
    return b;
  }

  function playWord(word, btn, type) {
    var t = type === 1 ? 1 : 2;
    var url = "https://dict.youdao.com/dictvoice?audio=" + encodeURIComponent(word) + "&type=" + t;
    var audio = new Audio(url);
    btn.classList.add("is-playing");
    var clear = function () { btn.classList.remove("is-playing"); };
    audio.addEventListener("ended", clear);
    audio.addEventListener("error", clear);
    audio.play().catch(clear);
  }

  function addToWordbook(baseWord, sentence) {
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
    var exists = arr.some(function (it) {
      return (it.word || "").toLowerCase() === baseWord.toLowerCase();
    });
    if (exists) return "exists";
    arr.unshift({
      word: baseWord,
      context: sentence || null,
      source: "精读·" + (currentArticle ? currentArticle.title_cn : ""),
      added_date: todayStr(),
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    return "ok";
  }

  // ---------- 返回 + 启动 ----------
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      detailView.hidden = true;
      listView.hidden = false;
      closeCard();
      window.scrollTo(0, 0);
    });
  }

  loadList();
})();
