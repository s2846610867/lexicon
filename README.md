# Lexicon · 静态版

GitHub Pages 上的纯静态英语词库,手机在 4G / 国内任何网络下都能直接用。

🔗 https://s2846610867.github.io/lexicon/

## 功能

- 三个板块词库:**基础 1000 / 四级 / 六级**(数据来自 ECDICT)
- 实时搜索过滤、滚动加载分页
- 英 / 美双发音(有道公开音频接口,客户端直连)
- 生词本:本地 `localStorage` 增 / 删 / 搜 / JSON 粘贴导入,关浏览器数据仍在
- 练习 tab 是占位:批改功能需要后端 + DeepSeek,在电脑版 Flask 应用使用

## 跟电脑版 Flask 的关系

这个静态版是 Flask 版的**子集**(去掉了 DeepSeek 批改 + 生词本 LEFT JOIN ecdict 全量查询)。
两个版本的生词本数据结构**对齐**(`word / context / source`),可以互导。

源仓库 + 构建脚本在本地另一个目录:`english-vocab-web/`,其中 `build_static.py` 负责:
- 从 `words.db` 导出三个板块的 JSON 到 `lexicon-static/data/`
- 复制 `static/style.css` 到 `lexicon-static/static/style.css`

样式改动只在 Flask 版改一次,运行 `build_static.py` 同步即可。

## 目录结构

```
lexicon-static/
├── index.html          # 静态页(viewport meta + 五个 tab 骨架)
├── static/
│   ├── style.css       # 由 build_static.py 从 Flask 版同步
│   └── app.js          # 静态版独立维护(fetch ./data + localStorage)
└── data/
    ├── basic.json      # 1000 词
    ├── cet4.json       # 3849 词
    └── cet6.json       # 5407 词
```

## 部署

GitHub Pages 配置:Settings → Pages → Branch: `main`,Folder: `/ (root)`。

## 隐私

本仓库**只包含**词典内容 + 前端代码,没有任何 API key、密钥、token。
生词本数据存在用户浏览器的 localStorage,不上传服务器。
