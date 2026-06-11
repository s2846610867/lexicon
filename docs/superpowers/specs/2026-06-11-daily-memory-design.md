# 每日记忆功能 · 设计文档

日期:2026-06-11
范围:静态版(lexicon-static / GitHub Pages)+ Flask 电脑版都加。
数据单一来源:words.db 新表 daily_words,build_static.py 导出 daily.json。

## 目标

用户每天把一批要记的词(图片形式,含单词 + 中文释义)发给 Claude,
Claude 读图、从 ECDICT 补全音标,写入数据文件并推送 GitHub。
网页上按日期分组展示,默认显示最新一天。

## 不做的事(YAGNI)

- 不做打卡、复习提醒、记忆曲线
- 不做网页端的"添加今日词汇"输入框(导入只走 Claude 这条路)

## 界面

- 新增 tab「每日记忆」,位置在「六级」和「生词本」之间:
  基础1000 · 四级 · 六级 · **每日记忆** · 生词本 · 练习
- 进入后,搜索框下方一行日期标签(chips),从新到旧排列,
  默认选中最新一天;日期多时横向滚动。显示格式 `6.11`。
- 标签下方为当天词汇列表,卡片样式与现有板块一致:
  单词 + 音标 + 中文释义 + 英/美发音按钮(有道音频接口)。
- 右上角词数显示当天词数(如 "25 词")。
- 搜索框在当前选中日期的词内实时过滤。
- 无数据时显示空状态提示。

## 数据

**单一来源**:english-vocab-web/words.db 新表 `daily_words`:

| 字段        | 类型    | 说明                       |
|-------------|---------|----------------------------|
| id          | INTEGER | 主键自增                   |
| day         | TEXT    | ISO 日期,如 `2026-06-11`  |
| word        | TEXT    | 单词                       |
| phonetic    | TEXT    | 音标(可空)               |
| translation | TEXT    | 中文释义(用户提供为准)   |

- build_static.py 增加导出:daily_words → lexicon-static/data/daily.json,
  结构 `{ "2026-06-11": [ {word, phonetic, translation}, ... ] }`
- Flask 版新增 `/api/daily` 接口,从 daily_words 读
- 界面显示日期转成 `6.11` 样式
- 释义以用户图片中的为准;音标由 ECDICT(words.db 内 ecdict 表)查询补全,
  查不到则留空(界面上空音标不显示,与现有逻辑一致)
- 同一个词允许出现在多个日期

## 日常导入流程(约定,存入 Claude 长期记忆)

用户发当天词汇表截图(含单词 + 中文释义),说"加到每日记忆":

1. Claude 读图得到 word + translation
2. 运行 english-vocab-web/import_daily.py(一次性写好的导入脚本):
   传入日期 + 词表,脚本查 ecdict 表补音标,插入 daily_words
3. 运行 build_static.py 同步 daily.json
4. lexicon-static 目录 git commit + push,GitHub Pages 约 1-2 分钟生效
5. 向用户报告:导入词数、缺音标的词、抽查结果
6. 日期默认为用户发图当天,用户另说日期则以用户为准;
   同日重复导入按"替换该日全部词汇"处理,避免重复堆积

## 首批数据

2026-06-11,25 个词:improvement, therapy, coordinate, license, utter, pump,
architect, stream, disease, divorce, guideline, generate, baggage, formation,
drawer, bind, fog, architecture, tension, tour, sunlight, hire, corrupt,
succession, reputation(释义按用户图片)。

## 技术要点

静态版:

- index.html:tabs 行加一个 button(data-section="daily"),
  加日期标签条容器(默认隐藏,仅 daily tab 显示)
- static/app.js:
  - daily.json 懒加载(进入 tab 才 fetch,与现有 ensureLoaded 模式一致)
  - 新增 state.dailyDate(当前选中日期)
  - 渲染日期 chips + 当日词列表,复用现有卡片渲染与分页逻辑
  - 搜索过滤范围 = 当前选中日期
- static/style.css:日期标签条样式。style.css 的源头在 Flask 版
  (english-vocab-web/static/style.css),由 build_static.py 同步覆盖到
  静态版——因此新样式写进 Flask 版的 style.css,跑一次 build_static.py
  同步过来(已确认该脚本只写 basic/cet4/cet6.json + style.css,
  不会触碰 daily.json;本次将其改为"额外导出 daily.json")
- 移动端适配:日期条横向滚动,不换行

Flask 版:

- app.py:建表 daily_words(随启动 init);新增 /api/daily 接口
  (返回全部日期分组数据,词量级小,无需分页参数)
- templates/index.html:加「每日记忆」tab + 日期条容器
- static/app.js(Flask 版):daily tab 渲染逻辑,与静态版同样的交互
- import_daily.py(新):命令行导入脚本,输入日期 + "word|translation"列表,
  查 ecdict 补音标,REPLACE 该日期数据
