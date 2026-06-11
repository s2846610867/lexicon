# 每日记忆功能 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Flask 版和静态版各加一个「每日记忆」tab,按日期分组展示用户每天提供的词汇;数据单一来源 words.db 的 daily_words 表,由 build_static.py 导出 daily.json 给静态版。

**Architecture:** 新增命令行脚本 import_daily.py 写入 daily_words 表(查 ecdict 补音标,同日重复导入=整体替换);Flask 加 /api/daily 接口一次性返回全部日期分组数据;静态版 fetch data/daily.json。两版前端各自加日期标签条(chips)+ 标题("6.11 需记词汇"),复用现有词条卡片渲染和有道发音。样式改在 Flask 版 style.css(源头),build_static.py 同步。

**Tech Stack:** Python 3 / Flask / SQLite / 原生 JS(ES5 风格,与现有代码一致)。本项目无测试框架,每步用命令行 / 浏览器实际验证。

**关键路径:**
- Flask 版根目录:`/Users/chonghaohao/Desktop/claudecodecli/memorizewords/english-vocab-web/`
- 静态版根目录:`/Users/chonghaohao/Desktop/claudecodecli/memorizewords/lexicon-static/`
- Python 解释器:`english-vocab-web/venv/bin/python`
- 静态版是 git 仓库(origin = github.com/s2846610867/lexicon);Flask 版也是本地 git 仓库,无远程

---

### Task 1: import_daily.py 导入脚本 + 首批 6.11 数据

**Files:**
- Create: `english-vocab-web/import_daily.py`
- Create: `english-vocab-web/imports/2026-06-11.txt`

- [ ] **Step 1: 写词表文件 `imports/2026-06-11.txt`**(25 词,来自用户截图,释义原样保留)

```
improvement|n.改进,改善
therapy|n.治疗
coordinate|v.协调
license|n./v.许可,执照
utter|a.完全的;v.说
pump|n.泵;v.(用泵)抽(水)
architect|n.建筑师
stream|n.溪流
disease|n.疾病
divorce|n./v.离婚
guideline|n.指导方针
generate|v.发生,产生
baggage|n.行李
formation|n.形成,构成
drawer|n.抽屉
bind|v.捆绑;装订
fog|n.雾
architecture|n.建筑学,建筑
tension|n.紧张,不安
tour|n.旅行
sunlight|n.日光,阳光
hire|n./v.雇用
corrupt|a.腐败的
succession|n.连续;继任,继承
reputation|n.名声
```

- [ ] **Step 2: 写 `import_daily.py`**

```python
#!/usr/bin/env python3
"""每日记忆导入:把一批 "word|translation" 写入 daily_words 表。

用法:
  ./venv/bin/python import_daily.py 2026-06-11 imports/2026-06-11.txt

- 文件每行一条:word|translation(竖线分隔;空行和 # 开头的行忽略)
- 音标自动查 ecdict 表,查不到留空并在结果里报告
- 同一天重复导入 = 整体替换该日数据(先删后插)
- 导入完成后记得跑 build_static.py 同步静态版
"""
import datetime
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "words.db")


def ensure_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_words (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            day         TEXT NOT NULL,
            word        TEXT NOT NULL,
            phonetic    TEXT,
            translation TEXT NOT NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_words (day)")


def parse_lines(text):
    items = []
    for i, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "|" not in line:
            sys.exit(f"✗ 第 {i} 行缺少竖线分隔:{line}")
        word, translation = line.split("|", 1)
        word = word.strip()
        translation = translation.strip()
        if not word or not translation:
            sys.exit(f"✗ 第 {i} 行 word 或 translation 为空:{line}")
        items.append((word, translation))
    return items


def main():
    if len(sys.argv) != 3:
        sys.exit("用法: import_daily.py <YYYY-MM-DD> <词表文件>")
    try:
        day = datetime.date.fromisoformat(sys.argv[1]).isoformat()
    except ValueError:
        sys.exit(f"✗ 日期格式不对(要 YYYY-MM-DD):{sys.argv[1]}")
    path = sys.argv[2]
    if not os.path.exists(path):
        sys.exit(f"✗ 找不到词表文件:{path}")
    with open(path, encoding="utf-8") as f:
        items = parse_lines(f.read())
    if not items:
        sys.exit("✗ 词表为空")
    if not os.path.exists(DB_PATH):
        sys.exit(f"✗ 找不到 {DB_PATH}")

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    ensure_table(cur)

    replaced = cur.execute(
        "SELECT COUNT(*) FROM daily_words WHERE day = ?", (day,)
    ).fetchone()[0]
    cur.execute("DELETE FROM daily_words WHERE day = ?", (day,))

    no_phonetic = []
    for word, translation in items:
        row = cur.execute(
            "SELECT phonetic FROM ecdict WHERE word = ?", (word.lower(),)
        ).fetchone()
        phonetic = (row[0] or "").strip() if row else ""
        if not phonetic:
            no_phonetic.append(word)
        cur.execute(
            "INSERT INTO daily_words (day, word, phonetic, translation) VALUES (?, ?, ?, ?)",
            (day, word, phonetic, translation),
        )
    conn.commit()
    conn.close()

    print(f"✓ {day} 导入 {len(items)} 词" + (f"(替换了原有 {replaced} 词)" if replaced else ""))
    if no_phonetic:
        print(f"  缺音标 {len(no_phonetic)} 个:{', '.join(no_phonetic)}")
    print("  下一步: ./venv/bin/python build_static.py 同步静态版")


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: 运行导入并验证**

Run: `cd english-vocab-web && ./venv/bin/python import_daily.py 2026-06-11 imports/2026-06-11.txt`
Expected: `✓ 2026-06-11 导入 25 词`(可能附带缺音标报告)

Run: `./venv/bin/python -c "import sqlite3; c=sqlite3.connect('words.db'); print(c.execute('SELECT COUNT(*), MIN(word), MAX(word) FROM daily_words WHERE day=\"2026-06-11\"').fetchone()); print(c.execute('SELECT word, phonetic, translation FROM daily_words LIMIT 3').fetchall())"`
Expected: 第一行 `(25, ...)`;第二行能看到 improvement 等词带音标和释义

- [ ] **Step 4: 再跑一次导入,验证"同日替换不堆积"**

Run: 同 Step 3 第一条命令
Expected: `✓ 2026-06-11 导入 25 词(替换了原有 25 词)`,再查 COUNT 仍是 25

- [ ] **Step 5: Commit(Flask 仓库)**

```bash
cd english-vocab-web && git add import_daily.py imports/ && git commit -m "新增每日记忆导入脚本 import_daily.py + 6.11 首批词表"
```

---

### Task 2: Flask 后端 — daily_words 建表 + /api/daily 接口

**Files:**
- Modify: `english-vocab-web/app.py`(SECTIONS 约 26-33 行;init 函数约 49-73 行;新路由加在 api_my_words 之前约 131 行处)

- [ ] **Step 1: SECTIONS 加 daily(顺序:六级之后、生词本之前)**

```python
SECTIONS = {
    "basic": "基础 1000",
    "cet4": "四级",
    "cet6": "六级",
    "daily": "每日记忆",
    "my": "生词本",
    "practice": "练习",
}
```

- [ ] **Step 2: 启动建表。在 `init_my_words_table()` 函数之后、`init_my_words_table()` 调用语句之前加:**

```python
def init_daily_words_table():
    """启动时建 daily_words 表(每日记忆,数据由 import_daily.py 写入)。"""
    if not os.path.exists(DB_PATH):
        return
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_words (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            day         TEXT NOT NULL,
            word        TEXT NOT NULL,
            phonetic    TEXT,
            translation TEXT NOT NULL
        )
        """
    )
    cur.execute("CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_words (day)")
    conn.commit()
    conn.close()
```

并把启动调用改成两行:

```python
init_my_words_table()
init_daily_words_table()
```

- [ ] **Step 3: 新增 /api/daily 路由(放在「生词本」分隔注释块之前):**

```python
@app.route("/api/daily")
def api_daily():
    """每日记忆:一次性返回全部日期分组数据(每天词量小,不分页)。"""
    if not os.path.exists(DB_PATH):
        return jsonify({"days": {}, "db_missing": True})
    conn = get_db()
    rows = conn.execute(
        """SELECT day, word, phonetic, translation FROM daily_words
           ORDER BY day DESC, id"""
    ).fetchall()
    conn.close()
    days = {}
    for r in rows:
        days.setdefault(r["day"], []).append(
            {
                "word": r["word"],
                "phonetic": r["phonetic"] or "",
                "translation": r["translation"] or "",
            }
        )
    return jsonify({"days": days})
```

- [ ] **Step 4: 启动 Flask 验证接口**

Run: `cd english-vocab-web && ./venv/bin/python app.py &`(后台),然后
`curl -s http://localhost:5001/api/daily | head -c 300`
Expected: JSON 含 `"days":{"2026-06-11":[{...improvement...}`,共 25 项

- [ ] **Step 5: Commit**

```bash
cd english-vocab-web && git add app.py && git commit -m "每日记忆:daily_words 建表 + /api/daily 接口 + SECTIONS 加 tab"
```

---

### Task 3: build_static.py 导出 daily.json

**Files:**
- Modify: `english-vocab-web/build_static.py`(`copy_style()` 函数后加新函数;`main()` 里加调用)

- [ ] **Step 1: 加 `export_daily()` 函数(放在 `copy_style()` 之后):**

```python
def export_daily():
    """daily_words → data/daily.json。表不存在则导出空对象,保证静态版 fetch 不 404。"""
    days = {}
    if os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        has = cur.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='daily_words'"
        ).fetchone()
        if has:
            for r in cur.execute(
                "SELECT day, word, phonetic, translation FROM daily_words ORDER BY day, id"
            ):
                days.setdefault(r["day"], []).append(
                    {
                        "word": r["word"],
                        "phonetic": r["phonetic"] or "",
                        "translation": r["translation"] or "",
                    }
                )
        conn.close()
    out_path = os.path.join(OUT_DATA, "daily.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(days, f, ensure_ascii=False, separators=(",", ":"))
    return out_path, len(days), os.path.getsize(out_path)
```

- [ ] **Step 2: `main()` 里、「同步 style.css」段之前加:**

```python
    print("\n== 导出每日记忆 JSON ==")
    daily_path, n_days, daily_size = export_daily()
    print(f"  {n_days} 天  {daily_size/1024:>7.1f} KB  → {os.path.relpath(daily_path, OUT_DIR)}")
```

- [ ] **Step 3: 运行并验证**

Run: `cd english-vocab-web && ./venv/bin/python build_static.py`
Expected: 输出含 `== 导出每日记忆 JSON ==` 和 `1 天`;basic/cet4/cet6 三行照旧

Run: `head -c 200 ../lexicon-static/data/daily.json`
Expected: `{"2026-06-11":[{"word":"improvement",...`

- [ ] **Step 4: Commit(Flask 仓库)**

```bash
cd english-vocab-web && git add build_static.py && git commit -m "build_static.py 增加 daily.json 导出"
```

---

### Task 4: 日期条样式(Flask 版 style.css = 源头)

**Files:**
- Modify: `english-vocab-web/static/style.css`(文件末尾追加)

- [ ] **Step 1: 追加样式(配色全部用现有 CSS 变量,与极简纸质风一致):**

```css
/* ============================================================
   每日记忆:日期标签条 + 标题
   ============================================================ */
.daybar {
  display: flex;
  gap: 6px;
  margin-top: 18px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 4px;
}
.daybar::-webkit-scrollbar { display: none; }
.daybar__chip {
  appearance: none;
  border: 1px solid var(--hair);
  background: none;
  cursor: pointer;
  font-family: "JetBrains Mono", monospace;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  color: var(--muted);
  padding: 5px 12px;
  border-radius: 999px;
  white-space: nowrap;
  flex: 0 0 auto;
  transition: color 0.2s ease, border-color 0.2s ease;
}
.daybar__chip:hover { color: var(--trans); border-color: var(--trans); }
.daybar__chip.is-active {
  color: var(--paper);
  background: var(--ink);
  border-color: var(--ink);
}
.daily-title {
  margin-top: 14px;
  font-family: "Newsreader", "Noto Serif SC", serif;
  font-size: 0.95rem;
  color: var(--trans);
}
```

- [ ] **Step 2: 同步到静态版**

Run: `cd english-vocab-web && ./venv/bin/python build_static.py`
Expected: style.css 行 KB 数比之前略增;`grep -c daybar ../lexicon-static/static/style.css` 输出 ≥ 4

- [ ] **Step 3: Commit(Flask 仓库)**

```bash
cd english-vocab-web && git add static/style.css && git commit -m "每日记忆:日期条样式"
```

---

### Task 5: Flask 版前端(templates/index.html + static/app.js)

**Files:**
- Modify: `english-vocab-web/templates/index.html`(searchbar 之后、import-panel 之前)
- Modify: `english-vocab-web/static/app.js`

tab 按钮不用改 HTML——Jinja 循环 SECTIONS 自动多出「每日记忆」。

- [ ] **Step 1: index.html 在 `</div>`(searchbar 结束,约 47 行)之后插入:**

```html
  <nav class="daybar" id="daybar" hidden aria-label="选择日期"></nav>
  <div class="daily-title" id="daily-title" hidden></div>
```

- [ ] **Step 2: app.js — DOM 引用与缓存。在 `var practiceState = ...`(约 38 行)之后加:**

```js
  // 每日记忆相关 DOM + 缓存
  var daybar = document.getElementById("daybar");
  var dailyTitle = document.getElementById("daily-title");
  var dailyCache = null;   // { "2026-06-11": [ {word, phonetic, translation}, ... ] }
```

并在 `state` 对象里加一个字段(`loading: false,` 之后):

```js
    dailyDate: "",
```

- [ ] **Step 3: app.js — 每日记忆工具函数。在 `apiUrl()` 函数之前加:**

```js
  // ---------- 每日记忆 ----------
  function fmtDay(iso) {            // "2026-06-11" -> "6.11"
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[1], 10) + "." + parseInt(p[2], 10);
  }

  function ensureDailyLoaded() {
    if (dailyCache) return Promise.resolve(dailyCache);
    return fetch("/api/daily")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        dailyCache = data.days || {};
        return dailyCache;
      });
  }

  function dailyDates() {
    return Object.keys(dailyCache || {}).sort().reverse();
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
        renderDailyList();
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

  function renderDailyList() {
    list.innerHTML = "";
    var words = (dailyCache || {})[state.dailyDate] || [];
    if (state.q) {
      var lq = state.q.toLowerCase();
      words = words.filter(function (w) {
        return (w.word || "").toLowerCase().indexOf(lq) !== -1;
      });
    }
    state.total = words.length;
    updateCount();
    if (!words.length) {
      var hint = dailyDates().length === 0
        ? "还没有每日词汇。把当天的词表发给 Claude 导入。"
        : "没有匹配的词。";
      list.innerHTML = '<div class="notice">' + hint + "</div>";
      foot.textContent = "";
      return;
    }
    var frag = document.createDocumentFragment();
    words.forEach(function (w) { frag.appendChild(renderEntry(w)); });
    list.appendChild(frag);
    foot.textContent = "— 到底了 · 共 " + words.length + " 词 —";
  }
```

- [ ] **Step 4: app.js — fetchPage 开头(`if (state.section === "practice") return;` 之后)加:**

```js
    if (state.section === "daily") {     // 每日记忆:全量已缓存,直接渲染
      if (reset) renderDailyList();
      return;
    }
```

- [ ] **Step 5: app.js — applySectionUI 里(`var isPractice = ...` 之后)加:**

```js
    var isDaily = state.section === "daily";
    if (daybar) daybar.hidden = !isDaily;
    if (dailyTitle) dailyTitle.hidden = !isDaily;
```

- [ ] **Step 6: app.js — tab 切换处理。把现有 `applySectionUI(); fetchPage(true);` 两行之间插入 daily 分支,改成:**

```js
      applySectionUI();
      if (state.section === "daily") {
        ensureDailyLoaded()
          .then(function () {
            var dates = dailyDates();
            if (!state.dailyDate || dates.indexOf(state.dailyDate) === -1) {
              state.dailyDate = dates[0] || "";
            }
            renderDaybar();
            updateDailyTitle();
            renderDailyList();
          })
          .catch(function () {
            list.innerHTML = '<div class="notice">加载失败,请重试。</div>';
            foot.textContent = "";
          });
        return;
      }
      fetchPage(true);
```

- [ ] **Step 7: app.js — 搜索框防抖回调里 `fetchPage(true);` 之前加 daily 分支,改成:**

```js
      state.q = search.value.trim();
      if (state.section === "daily") { renderDailyList(); return; }
      fetchPage(true);
```

- [ ] **Step 8: 浏览器验证(Flask 版)**

启动 Flask(若未启动),用 preview 工具打开 http://localhost:5001:
1. tab 栏出现「每日记忆」,位置在六级和生词本之间
2. 点击后出现日期 chip「6.11」(选中态深底白字)+ 标题「6.11 需记词汇」+ 25 个词条卡片
3. 词条有音标、释义,点「英」「美」能放音
4. 搜索框输 `arch` → 只剩 architect / architecture,计数变 "2 匹配"
5. 切到基础 1000 再切回,一切正常;基础/四级/六级/生词本/练习无回归

- [ ] **Step 9: Commit**

```bash
cd english-vocab-web && git add templates/index.html static/app.js && git commit -m "Flask 版每日记忆 tab:日期条 + 当日词列表"
```

---

### Task 6: 静态版前端(index.html + static/app.js)

**Files:**
- Modify: `lexicon-static/index.html`
- Modify: `lexicon-static/static/app.js`

- [ ] **Step 1: index.html — tabs 里六级之后加按钮:**

```html
    <button class="tab" role="tab" data-section="daily">每日记忆</button>
```

- [ ] **Step 2: index.html — searchbar 结束的 `</div>` 之后加:**

```html
  <nav class="daybar" id="daybar" hidden aria-label="选择日期"></nav>
  <div class="daily-title" id="daily-title" hidden></div>
```

- [ ] **Step 3: app.js — DOM 引用。`var practicePanel = ...` 之后加:**

```js
  var daybar = document.getElementById("daybar");
  var dailyTitle = document.getElementById("daily-title");
```

`state` 对象里(`filtered: [],` 之后)加:

```js
    dailyDate: "",
```

- [ ] **Step 4: app.js — 每日记忆函数。`rebuildLookup()` 函数之后加:**

```js
  // ---------- 每日记忆 ----------
  function fmtDay(iso) {            // "2026-06-11" -> "6.11"
    var p = String(iso || "").split("-");
    if (p.length !== 3) return iso;
    return parseInt(p[1], 10) + "." + parseInt(p[2], 10);
  }

  function ensureDailyLoaded() {
    if (dataCache.daily) return Promise.resolve(dataCache.daily);
    return fetch(DATA_BASE + "daily.json")
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
```

- [ ] **Step 5: app.js — computeFiltered 开头(`if (state.section === "my")` 之前)加 daily 分支:**

```js
    if (state.section === "daily") {
      var dayWords = (dataCache.daily || {})[state.dailyDate] || [];
      if (!state.q) return dayWords;
      var dlq = state.q.toLowerCase();
      return dayWords.filter(function (w) {
        return (w.word || "").toLowerCase().indexOf(dlq) !== -1;
      });
    }
```

- [ ] **Step 6: app.js — fetchPage 空列表提示改成三分支。把:**

```js
      var emptyHint = state.section === "my"
        ? '生词本还是空的。点上方"导入生词"粘贴 JSON。'
        : "没有匹配的词。";
```

改成:

```js
      var emptyHint = "没有匹配的词。";
      if (state.section === "my") {
        emptyHint = '生词本还是空的。点上方"导入生词"粘贴 JSON。';
      } else if (state.section === "daily" && dailyDates().length === 0) {
        emptyHint = "还没有每日词汇。把当天的词表发给 Claude 导入。";
      }
```

- [ ] **Step 7: app.js — applySectionUI 里(`var isPractice = ...` 之后)加:**

```js
    var isDaily = state.section === "daily";
    if (daybar) daybar.hidden = !isDaily;
    if (dailyTitle) dailyTitle.hidden = !isDaily;
```

- [ ] **Step 8: app.js — tab 切换。在 `if (state.section === "my") { fetchPage(true); return; }` 之前加:**

```js
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
```

- [ ] **Step 9: 本地起静态服务器验证**

Run: `cd lexicon-static && python3 -m http.server 8910 &`,preview 打开 http://localhost:8910:
1. 「每日记忆」tab 在六级和生词本之间,下划线游标动画正常
2. 点击 → 「6.11」chip 选中 + 「6.11 需记词汇」标题 + 25 词 + 右上角 "25 词"
3. 发音按钮可用;搜 `arch` 剩 2 条
4. 缩窄窗口(390px 宽)验证手机布局:日期条不换行可横滑,卡片不溢出
5. 其他 tab 无回归
验证完 kill 掉 http.server

- [ ] **Step 10: Commit(静态版仓库,先不 push)**

```bash
cd lexicon-static && git add index.html static/app.js static/style.css data/daily.json && git commit -m "新增每日记忆 tab:按日期分组展示每日词汇"
```

---

### Task 7: 收尾 — README 更新 + push 上线 + 线上验证

**Files:**
- Modify: `lexicon-static/README.md`

- [ ] **Step 1: README「功能」清单加一条(生词本那行之后):**

```markdown
- 每日记忆:按日期分组的"今日需记词汇",数据走 Claude 导入(import_daily.py → build_static.py)
```

目录结构图 data/ 下加一行:

```
    └── daily.json      # 每日记忆,键=日期
```

- [ ] **Step 2: Commit + push**

```bash
cd lexicon-static && git add README.md && git commit -m "README:每日记忆说明" && git push
```

- [ ] **Step 3: 线上验证(等 1-2 分钟)**

Run: `curl -s "https://s2846610867.github.io/lexicon/data/daily.json" | head -c 120`
Expected: `{"2026-06-11":[{"word":"improvement"...`(若 404 等 1 分钟重试)

- [ ] **Step 4: 向用户报告**:上线网址、25 词已导入、缺音标的词(如有)、以后每天发图即可
