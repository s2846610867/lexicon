# 每日记忆功能 · 设计文档

日期:2026-06-11
范围:仅静态版(lexicon-static / GitHub Pages),Flask 电脑版不动。

## 目标

用户每天把一批要记的词(图片形式,含单词 + 中文释义)发给 Claude,
Claude 读图、从 ECDICT 补全音标,写入数据文件并推送 GitHub。
网页上按日期分组展示,默认显示最新一天。

## 不做的事(YAGNI)

- 不做打卡、复习提醒、记忆曲线
- 不做网页端的"添加今日词汇"输入框(导入只走 Claude 这条路)
- Flask 版不加此功能

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

新增 `data/daily.json`,结构:

```json
{
  "2026-06-11": [
    { "word": "improvement", "phonetic": "ɪmˈpruːvmənt", "translation": "n.改进,改善" }
  ]
}
```

- 键为 ISO 日期(内部),界面显示时转成 `6.11` 样式
- 释义以用户图片中的为准;音标由 ECDICT(english-vocab-web/ecdict.csv)查询补全,
  查不到则留空(界面上空音标不显示,与现有逻辑一致)
- 同一个词允许出现在多个日期

## 日常导入流程(约定)

1. 用户发当天词汇表图片
2. Claude 读图得到 word + translation,查 ECDICT 补 phonetic
3. 追加写入 daily.json 对应日期键
4. git commit + push,GitHub Pages 自动更新(约 1-2 分钟生效)
5. 导入后向用户报告词数和抽查结果

## 首批数据

2026-06-11,25 个词:improvement, therapy, coordinate, license, utter, pump,
architect, stream, disease, divorce, guideline, generate, baggage, formation,
drawer, bind, fog, architecture, tension, tour, sunlight, hire, corrupt,
succession, reputation(释义按用户图片)。

## 技术要点

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
  不会触碰 daily.json)
- 移动端适配:日期条横向滚动,不换行
