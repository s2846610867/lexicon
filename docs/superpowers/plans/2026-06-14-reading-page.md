# 精读阅读页(静态预烤版)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Lexicon 静态站加一个「精读」页:打开一篇英文文章,每个词可点→弹词卡(音标+英美发音+释义+加入生词本),每段可折叠中文翻译;手机电脑通吃。

**Architecture:** 离线在 english-vocab-web 用 build_article.py 把文章源文件烤成带 word_dict 的静态 JSON(分词→lemminflect 词形还原→批量查 words.db),输出到 lexicon-static/data/articles/。静态站新增独立页 reading.html + reading.js:fetch 文章 JSON,前端把正文按词切分包成可点 span,点词本地查 word_dict 弹卡,"加入生词本"写 localStorage(复用现有 lexicon_my_words 格式,自动进「生词本」tab)。词形还原只在构建时跑,浏览器不需要。

**Tech Stack:** Python 3 + lemminflect + SQLite(构建期);原生 JS ES5 风格 + 静态 HTML/CSS(运行期,与现有静态站一致)。本项目无测试框架,沿用 daily-memory 计划的做法:命令行 -c 校验 + preview 浏览器校验。

**关键路径:**
- 构建端:`/Users/chonghaohao/Desktop/claudecodecli/memorizewords/english-vocab-web/`(有 venv + words.db)
- 静态站:`/Users/chonghaohao/Desktop/claudecodecli/memorizewords/lexicon-static/`(git remote = github.com/s2846610867/lexicon)
- Python:`english-vocab-web/venv/bin/python`
- 设计来源:`~/Downloads/Lexicon精读页_完整报告.md`(第四章按 Flask 写,本计划改为静态预烤;思路同每日记忆)

**数据事实(已核对):**
- words.db 有 words 表(basic/cet4/cet6)和 ecdict 表(77 万词条),音标为单条字符串(如 `ә'sistәnt`,无 //)。
- 词形还原有必要:`studies` 音标空,还原成 `study` 才完整。
- 静态站生词本:localStorage key `lexicon_my_words`,每项 `{word, context, source, added_date}`。
- style.css 由 build_static.py 从 Flask 版同步覆盖——所以阅读页样式**写在 reading.html 内联 `<style>`**(自包含,不碰被同步的 style.css)。

---

### Task 1: 第一篇文章源文件

**Files:**
- Create: `english-vocab-web/articles/ai-assistants.src.json`

- [ ] **Step 1: 写文章源文件**(普通短文 + 中文翻译,故意含变形词 assistants/mistakes/tools/students 测词形还原)

```json
{
  "id": "ai-assistants",
  "title_en": "AI Assistants in Daily Life",
  "title_cn": "日常生活中的 AI 助手",
  "category": "科技",
  "year": 2026,
  "paragraphs": [
    {
      "en": "In 2026, artificial intelligence assistants have become a normal part of daily life. Many people talk to them every morning. They ask about the weather, the news, and their plans for the day.",
      "cn": "2026年,人工智能助手已经成为日常生活中很平常的一部分。许多人每天早上都和它们说话。他们询问天气、新闻,以及当天的计划。"
    },
    {
      "en": "These assistants can do many things. They set alarms, send messages, and answer difficult questions. Some students use them to study English and to check their writing.",
      "cn": "这些助手能做很多事。它们设置闹钟、发送消息、回答难题。一些学生用它们来学习英语、检查自己的写作。"
    },
    {
      "en": "However, the assistants are not perfect. They sometimes make mistakes, and they do not always understand what we mean. People still need to think carefully and decide for themselves.",
      "cn": "然而,这些助手并不完美。它们有时会犯错,也并不总能理解我们的意思。人们仍然需要仔细思考,自己做决定。"
    },
    {
      "en": "In the future, these tools will probably become even more helpful. But the most important skill is still our own ability to learn, to read, and to understand the world.",
      "cn": "未来,这些工具可能会变得更有帮助。但最重要的能力,依然是我们自己学习、阅读和理解世界的能力。"
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
cd english-vocab-web && git add articles/ai-assistants.src.json && git commit -m "精读:第一篇文章源(AI 助手)"
```

---

### Task 2: build_article.py 构建脚本

**Files:**
- Create: `english-vocab-web/build_article.py`

- [ ] **Step 1: 安装 lemminflect(仅构建期需要)**

Run: `cd english-vocab-web && ./venv/bin/pip install lemminflect`
Expected: `Successfully installed lemminflect-0.2.3 numpy-...`

- [ ] **Step 2: 写 build_article.py**

```python
#!/usr/bin/env python3
"""把一篇文章源文件烤成静态精读 JSON(含 word_dict),输出到 lexicon-static/data/articles/。

用法:
  ./venv/bin/python build_article.py articles/ai-assistants.src.json

流程:分词 → 词形还原(lemminflect) → 批量查 words.db → 生成 word_dict
     → 写 data/articles/<id>.json + 更新 data/articles/index.json
词形还原只在这里(构建期)跑,浏览器端不需要任何库。
"""
import json
import os
import re
import sqlite3
import sys

import lemminflect

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "words.db")
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "lexicon-static", "data", "articles"))

WORD_RE = re.compile(r"[A-Za-z]+(?:'[A-Za-z]+)?")  # 单词(含 don't)


def lookup(conn, word):
    """words 表优先、再 ecdict;返回 {word, phonetic, meaning} 或 None。"""
    w = word.lower()
    r = conn.execute(
        "SELECT word, phonetic, translation FROM words WHERE word=? LIMIT 1", (w,)
    ).fetchone()
    if not r:
        r = conn.execute(
            "SELECT word, phonetic, translation FROM ecdict WHERE word=?", (w,)
        ).fetchone()
    if not r:
        return None
    return {"word": r[0], "phonetic": (r[1] or "").strip(), "meaning": (r[2] or "").strip()}


def resolve(conn, token):
    """先查原词;原词缺音标或释义,就试词形还原后的候选词。返回 entry 或 None。"""
    t = token.lower()
    e = lookup(conn, t)
    if e and e["phonetic"] and e["meaning"]:
        return e
    cands = []
    for lemmas in lemminflect.getAllLemmas(t).values():
        cands.extend(lemmas)
    for c in dict.fromkeys(cands):          # 去重保序
        if c.lower() == t:
            continue
        e2 = lookup(conn, c)
        if e2 and e2["meaning"]:
            return e2
    return e                                # 退而求其次:原词的部分结果(可能为 None)


def build(src_path):
    with open(src_path, encoding="utf-8") as f:
        art = json.load(f)
    if not os.path.exists(DB_PATH):
        sys.exit(f"✗ 找不到 {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)

    tokens = set()
    word_count = 0
    for p in art["paragraphs"]:
        found = WORD_RE.findall(p["en"])
        word_count += len(found)
        for tk in found:
            tokens.add(tk.lower())

    word_dict = {}
    missing = []
    for tk in sorted(tokens):
        e = resolve(conn, tk)
        if e and e["meaning"]:
            word_dict[tk] = e
        else:
            missing.append(tk)
    conn.close()

    out = {
        "id": art["id"],
        "title_en": art["title_en"],
        "title_cn": art["title_cn"],
        "category": art.get("category", ""),
        "year": art.get("year", ""),
        "word_count": word_count,
        "paragraphs": art["paragraphs"],
        "word_dict": word_dict,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, art["id"] + ".json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    index_path = os.path.join(OUT_DIR, "index.json")
    index = []
    if os.path.exists(index_path):
        with open(index_path, encoding="utf-8") as f:
            index = json.load(f)
    index = [a for a in index if a["id"] != art["id"]]
    index.append({
        "id": art["id"], "title_en": art["title_en"], "title_cn": art["title_cn"],
        "category": art.get("category", ""), "year": art.get("year", ""),
        "word_count": word_count,
    })
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✓ {art['id']}: {word_count} 词,word_dict {len(word_dict)} 条,未收录 {len(missing)} 个")
    if missing:
        print("  未收录:", ", ".join(missing[:20]))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("用法: build_article.py <article.src.json>")
    build(sys.argv[1])
```

- [ ] **Step 3: 构建第一篇并校验**

Run: `cd english-vocab-web && ./venv/bin/python build_article.py articles/ai-assistants.src.json`
Expected: `✓ ai-assistants: <约120> 词,word_dict <N> 条,未收录 <少量> 个`

Run（验证词形还原:assistants→assistant、mistakes→mistake 都查到原形释义）:
```
./venv/bin/python -c "
import json
d = json.load(open('../lexicon-static/data/articles/ai-assistants.json'))
print('标题:', d['title_en'], '| 段落:', len(d['paragraphs']), '| 词典条目:', len(d['word_dict']))
for t in ['assistants','mistakes','tools','students','studies']:
    e = d['word_dict'].get(t)
    print(f'  {t:10}', '→', (e['word']+' /'+e['phonetic']+'/ '+e['meaning'][:18]) if e else '未收录')
"
```
Expected: assistants→assistant、mistakes→mistake、tools→tool、students→student 都能查到原形,带音标和释义。

Run: `cat ../lexicon-static/data/articles/index.json`
Expected: `[{"id":"ai-assistants","title_en":"AI Assistants in Daily Life",...}]`

- [ ] **Step 4: Commit(构建脚本 + 生成数据分开两个仓库)**

```bash
cd english-vocab-web && git add build_article.py && git commit -m "精读:文章构建脚本 build_article.py(词形还原+批量查词)"
cd ../lexicon-static && git add data/articles/ && git commit -m "精读:生成首篇文章 JSON(ai-assistants)"
```

---

### Task 3: reading.html 骨架 + 文章列表

**Files:**
- Create: `lexicon-static/reading.html`
- Create: `lexicon-static/static/reading.js`

- [ ] **Step 1: 写 reading.html**(自包含,样式内联;字体/配色变量复用 style.css)

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>精读 · Lexicon</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link
    href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Newsreader:opsz,wght@6..72,400;6..72,500&family=JetBrains+Mono:wght@400&family=Noto+Serif+SC:wght@400;500&display=swap"
    rel="stylesheet"
  />
  <link rel="stylesheet" href="./static/style.css" />
  <style>
    /* ===== 精读页专属样式(自包含,不依赖 build_static 同步) ===== */
    .reading-top { display: flex; align-items: baseline; gap: 14px; margin-top: 8px; }
    .reading-top a { font-family: "JetBrains Mono", monospace; font-size: 0.8rem;
      color: var(--muted); text-decoration: none; }
    .reading-top a:hover { color: var(--ink); }

    /* 文章列表 */
    .art-list { margin-top: 20px; display: flex; flex-direction: column; gap: 2px; }
    .art-card {
      appearance: none; border: 0; background: none; cursor: pointer; text-align: left;
      width: 100%; padding: 16px 0; border-bottom: 1px solid var(--hair);
      display: block; transition: opacity 0.2s ease;
    }
    .art-card:hover { opacity: 0.65; }
    .art-card__title { font-family: "Newsreader", serif; font-size: 1.15rem; color: var(--ink); }
    .art-card__cn { font-family: "Noto Serif SC", serif; font-size: 0.9rem; color: var(--trans); margin-top: 2px; }
    .art-card__meta { font-family: "JetBrains Mono", monospace; font-size: 0.72rem;
      color: var(--muted); margin-top: 6px; letter-spacing: 0.04em; }

    /* 文章详情 */
    #detail-view { margin-top: 14px; }
    .detail-back { appearance: none; border: 0; background: none; cursor: pointer;
      font-family: "JetBrains Mono", monospace; font-size: 0.8rem; color: var(--muted); padding: 4px 0; }
    .detail-back:hover { color: var(--ink); }
    .detail-title { font-family: "Newsreader", serif; font-size: 1.5rem; color: var(--ink); margin-top: 10px; }
    .detail-cn { font-family: "Noto Serif SC", serif; font-size: 1rem; color: var(--trans); margin-top: 4px; }
    .detail-meta { font-family: "JetBrains Mono", monospace; font-size: 0.72rem; color: var(--muted);
      margin-top: 8px; letter-spacing: 0.04em; }

    .para { margin-top: 26px; }
    .para__en { font-family: "Newsreader", serif; font-size: 1.15rem; line-height: 1.9; color: var(--ink); }
    .rw { cursor: pointer; border-radius: 3px; transition: background 0.12s ease; }
    .rw:hover { background: var(--hair); }
    .rw.is-active { background: var(--ink); color: var(--paper); }
    .para__toggle { appearance: none; border: 0; background: none; cursor: pointer; margin-top: 8px;
      font-family: "JetBrains Mono", monospace; font-size: 0.74rem; color: var(--muted); padding: 2px 0; }
    .para__toggle:hover { color: var(--ink); }
    .para__cn { font-family: "Noto Serif SC", serif; font-size: 0.96rem; line-height: 1.8;
      color: var(--trans); margin-top: 8px; padding-left: 12px; border-left: 2px solid var(--hair); }

    /* 词卡(底部浮层) */
    .word-card {
      position: fixed; left: 0; right: 0; bottom: 0; z-index: 50;
      max-width: 720px; margin: 0 auto; background: var(--paper);
      border-top: 1px solid var(--ink); box-shadow: 0 -8px 30px rgba(22,21,15,0.10);
      padding: 18px 24px 22px; animation: cardup 0.18s ease both;
    }
    @keyframes cardup { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
    .word-card__head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .word-card__word { font-family: "Fraunces", serif; font-size: 1.5rem; color: var(--ink); }
    .word-card__phon { font-family: "JetBrains Mono", monospace; font-size: 0.9rem; color: var(--phon); }
    .word-card__close { margin-left: auto; appearance: none; border: 0; background: none; cursor: pointer;
      font-family: "JetBrains Mono", monospace; font-size: 1rem; color: var(--muted); }
    .word-card__meaning { font-family: "Newsreader","Noto Serif SC",serif; font-size: 1rem; line-height: 1.7;
      color: var(--trans); margin-top: 10px; white-space: pre-line; }
    .word-card__actions { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
    .play { appearance: none; cursor: pointer; border: 1px solid var(--hair); background: none;
      font-family: "JetBrains Mono", monospace; font-size: 0.75rem; color: var(--trans);
      padding: 5px 12px; border-radius: 999px; }
    .play:hover { border-color: var(--ink); color: var(--ink); }
    .play.is-playing { background: var(--ink); color: var(--paper); }
    .word-card__add { appearance: none; cursor: pointer; border: 1px solid var(--ink); background: var(--ink);
      color: var(--paper); font-family: "JetBrains Mono", monospace; font-size: 0.75rem;
      padding: 6px 14px; border-radius: 999px; margin-left: auto; }
    .word-card__add:disabled { opacity: 0.5; cursor: default; }
    .word-card__missing { color: var(--muted); font-style: italic; }
  </style>
</head>
<body>
  <div class="grain" aria-hidden="true"></div>

  <header class="masthead">
    <div class="mark">
      <span class="mark__en">Lexicon</span>
      <span class="mark__cn">精读</span>
    </div>
    <div class="reading-top">
      <a href="./index.html">← 返回词库</a>
    </div>
  </header>

  <main id="list-view">
    <div class="art-list" id="article-list"></div>
  </main>

  <main id="detail-view" hidden>
    <button class="detail-back" id="back-btn">← 文章列表</button>
    <div id="detail-body"></div>
  </main>

  <div id="word-card-host"></div>

  <script src="./static/reading.js"></script>
</body>
</html>
```

- [ ] **Step 2: 写 reading.js — 列表部分**(详情/词卡在后续 Task 追加到同文件)

```js
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

  // 占位:Task 4 实现
  function openArticle(id) { /* TODO Task 4 */ }

  if (backBtn) {
    backBtn.addEventListener("click", function () {
      detailView.hidden = true;
      listView.hidden = false;
      closeCard();
      window.scrollTo(0, 0);
    });
  }
  function closeCard() { cardHost.innerHTML = ""; if (activeWordEl) { activeWordEl.classList.remove("is-active"); activeWordEl = null; } }

  // ---------- 启动 ----------
  loadList();
})();
```

- [ ] **Step 3: 起静态服务器,浏览器校验列表**

用 preview(lexicon-static,端口 8910)打开 `http://localhost:8910/reading.html`:
1. 顶部「Lexicon 精读」+「← 返回词库」链接
2. 列表出现一张卡片:标题 "AI Assistants in Daily Life" + 中文 + "科技 · 2026 · 约120 词"
3. 控制台无报错(preview_console_logs level=error)

- [ ] **Step 4: Commit**

```bash
cd lexicon-static && git add reading.html static/reading.js && git commit -m "精读:页面骨架 + 文章列表"
```

---

### Task 4: 文章详情 — 段落渲染、切词、折叠翻译

**Files:**
- Modify: `lexicon-static/static/reading.js`(替换 openArticle 占位实现,新增渲染函数)

- [ ] **Step 1: 在 reading.js 中,把 `function openArticle(id) { /* TODO Task 4 */ }` 整段替换为:**

```js
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

  // 占位:Task 5 实现词卡
  function onWordClick(span) { /* TODO Task 5 */ }
```

- [ ] **Step 2: 浏览器校验详情与折叠**

preview 打开 reading.html → 点列表卡片:
1. 进入详情,显示标题/中文/元信息 + 四段正文
2. 每段下方有「显示翻译 ▾」,点击展开该段中文、变「收起翻译 ▴」,再点收起
3. 正文单词 hover 有浅灰底(可点的视觉提示),标点不可点
4. 「← 文章列表」能返回列表

- [ ] **Step 3: Commit**

```bash
cd lexicon-static && git add static/reading.js && git commit -m "精读:文章详情渲染 + 切词 + 折叠翻译"
```

---

### Task 5: 词卡 — 音标、英美发音、释义、加入生词本

**Files:**
- Modify: `lexicon-static/static/reading.js`(替换 onWordClick 占位,新增词卡/发音/生词本函数)

- [ ] **Step 1: 把 `function onWordClick(span) { /* TODO Task 5 */ }` 整段替换为:**

```js
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

  function unescapeNewlines(s) {
    return String(s == null ? "" : s).replace(/\\r/g, "").replace(/\\n/g, "\n");
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
```

- [ ] **Step 2: 浏览器校验词卡全链路**

preview 打开 reading.html → 进文章:
1. 点 `assistants` → 底部弹词卡,标题显示原形 **assistant**,有音标、释义、英/美按钮
2. 点「美」按钮变深色播放态(发音走有道,本地静音也能看到状态变化)
3. 点 `assistants` 的词卡里「加入生词本」→ 变「✓ 已加入」;再点同词 → 「已在生词本」
4. 点一个生造的不可能词(若有)或标点附近,验证未收录时显示「词库未收录这个词」、无"加入"按钮
5. 用 preview_eval 读 localStorage 确认写入格式:
   ```
   JSON.parse(localStorage.getItem("lexicon_my_words"))[0]
   ```
   应是 `{word:"assistant", context:"...句子...", source:"精读·日常生活中的 AI 助手", added_date:"2026-06-14"}`

- [ ] **Step 3: 校验与「生词本」tab 打通**

preview 打开 `http://localhost:8910/index.html` → 点「生词本」tab:
应能看到刚加入的 assistant,带例句(context)和来源「精读·…」。
(说明:reading.html 与 index.html 同源,共享同一个 localStorage。)

- [ ] **Step 4: Commit**

```bash
cd lexicon-static && git add static/reading.js && git commit -m "精读:词卡(音标/英美发音/释义)+ 加入生词本"
```

---

### Task 6: 入口互链 + 移动端校验 + 上线

**Files:**
- Modify: `lexicon-static/index.html`(masthead 副标题处加一个「精读」入口链接)

- [ ] **Step 1: index.html 的 masthead 里,在 `<p class="masthead__sub">…</p>` 之后加一个入口链接**

把:
```html
    <p class="masthead__sub">基础 1000 · 四级 · 六级 · 英 / 美双发音</p>
  </header>
```
改成:
```html
    <p class="masthead__sub">基础 1000 · 四级 · 六级 · 英 / 美双发音</p>
    <p class="masthead__sub"><a href="./reading.html" style="color:var(--ink);text-decoration:underline;text-underline-offset:3px;">📖 进入精读 →</a></p>
  </header>
```

- [ ] **Step 2: 桌面 + 移动端浏览器回归**

preview(8910):
1. index.html:masthead 出现「📖 进入精读 →」,点击跳到 reading.html;原有 5 个 tab(含每日记忆)无回归
2. reading.html:`preview_resize` 切 mobile(375)→ 文章正文不溢出、词卡贴底铺满、可点词、折叠正常
3. `preview_console_logs` level=error:reading.html 与 index.html 均无报错

- [ ] **Step 3: 上线 + 线上校验**

```bash
cd lexicon-static && git add index.html && git commit -m "精读:词库首页加精读入口" && git push
```
等 1-2 分钟,Run:
`curl -s "https://s2846610867.github.io/lexicon/data/articles/index.json" | head -c 120`
Expected: `[{"id":"ai-assistants",...}]`
再 Run:`curl -s -o /dev/null -w "%{http_code}" "https://s2846610867.github.io/lexicon/reading.html"`
Expected: `200`

- [ ] **Step 4: 向用户汇报**:线上精读页地址、第一篇文章、点词/发音/加生词本验证结果、以后加文章的流程(写 src.json → build_article.py → push)

---

## 验收标准(对齐报告 4.4)

- [ ] 能打开一篇文章,正文正常分段显示
- [ ] 正文每个词可点击,点了弹出词卡
- [ ] 词卡有音标、释义、英/美发音
- [ ] 点变形词(assistants)能查到原形(assistant)释义
- [ ] 点「加入生词本」,词进入 localStorage,能在「生词本」tab 看到
- [ ] 每段可折叠/展开中文翻译
- [ ] 手机电脑通吃(静态站,GitHub Pages)

## 以后加文章的流程(存记忆)

1. 写一篇 `english-vocab-web/articles/<id>.src.json`(英文段落 + 中文翻译)
2. `./venv/bin/python build_article.py articles/<id>.src.json`
3. `cd ../lexicon-static && git add data/articles && git commit && git push`
