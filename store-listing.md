# Chrome Web Store 上架材料（Copy & Paste）

> 所有文案已按 CWS 要求写好，可直接复制到 https://chrome.google.com/webstore/devconsole 开发者后台。
> 上架步骤见文末「提交清单」。

---

## 1. 基础信息（Basic information）

| 字段 | 内容 |
|---|---|
| **Language** | English (United States)（默认市场；后续可加 Chinese 第二语言） |
| **Extension name** | `Amazon Keyword Rank Tracker` |
| **Summary（≤132 字符）** | `Batch-check how your ASINs rank in Amazon search results for any keywords. Organic vs sponsored positions, export to Excel.` |
| **Category** | `Shopping`（备选 `Productivity`） |

## 2. 详细描述（Detailed description）

> 以下为英文正式版（建议直接粘贴）。中文版附在本文件末尾。

```
Amazon Keyword Rank Tracker lets you find out where your products rank in Amazon search results — for many keywords and many ASINs at once.

WHY YOU NEED IT
Amazon sellers spend huge effort on keywords. But the only way to know if your listing actually shows up — and where — is to check the search results page. Doing this manually for dozens of keywords is tedious and error-prone. This extension automates the whole process in seconds.

WHAT IT DOES
• Paste your keywords (one per line) and your ASINs (one per line).
• Click Start. The extension opens each keyword's search page in background tabs (it uses your own logged-in browser session, so results match exactly what a real customer sees).
• See an instant results matrix: rows are your ASINs, columns are your keywords, cells are the rank positions.
• Sponsored (ad) placements are detected automatically and marked, so you know whether a position is an organic rank or a paid ad.
• Choose between "Total position" and "Organic position" views.
• Scan up to 3 pages of results, with cross-page de-duplication and minimum-rank merging.
• Export everything to Excel (.xlsx) with three sheets — Rank Summary (ASIN × keyword matrix), Full Details (rank, organic rank, ad flag, title, link), and Not-Found list. CSV export is also included.

WHY IT'S SAFE
• No data ever leaves your computer — all processing is local, and nothing is uploaded or shared.
• Queries run inside your own browser session using your existing Amazon cookies and login, exactly as if you typed the search yourself.
• Configurable delay between keywords reduces the risk of triggering Amazon's bot detection.
• Fully user-initiated: nothing runs in the background without your action.

SUPPORTED MARKETPLACES
amazon.com · amazon.co.uk · amazon.de · amazon.fr · amazon.it · amazon.es · amazon.co.jp · amazon.ca · amazon.com.mx · amazon.com.au · amazon.in · amazon.com.br · amazon.nl · amazon.se · amazon.pl · amazon.com.tr · amazon.sg · amazon.ae · amazon.sa · amazon.eg · amazon.co.th

PRIVACY
This extension does not collect, transmit, or store any personal data. All information you enter (keywords, ASINs) and all search results are processed locally on your device. See the Privacy Policy link for details.

Note: This tool is an independent utility for sellers to review their own public listings. Please follow Amazon's Terms of Service and use reasonable query frequency.
```

## 3. 权限说明（Permission justification — 审核表单必填）

Permission justification (为什么需要这些权限):

```
1. "tabs" permission — needed to read the URL of the active tab (to detect which Amazon marketplace the user is on, e.g. amazon.com vs amazon.co.jp) and to detect when a search page opened in a background tab has finished loading, and to detect Amazon's captcha redirects.

2. Host permissions for Amazon domains (e.g. https://www.amazon.com/*) — the extension opens Amazon search result pages in background tabs and reads the visible product list from the page in order to calculate rank positions. This only ever happens on pages the user asked for (via their keyword list), and only when the user clicks "Start".

3. chrome.storage — stores the in-progress job state locally (so a background task can resume after the browser suspends the service worker). Data is stored on-device only and is never transmitted.
```

Single purpose（单一用途声明）:

```
This extension's single purpose is to let Amazon sellers check where their product ASINs rank in Amazon search results for user-provided keywords. Every query is initiated by the user from the extension popup; the extension does not scrape, collect, or transmit any data, and does not perform any background activity without a user action.
```

## 4. 商店素材（Store listing assets）

| 素材 | 规格 | 位置 |
|---|---|---|
| 截图 1 | 1280×800 | `screenshots/01-input.png` |
| 截图 2 | 1280×800 | `screenshots/02-progress.png` |
| 截图 3 | 1280×800 | `screenshots/03-matrix.png` |
| 截图 4 | 1280×800 | `screenshots/04-detail.png` |
| 截图 5 | 1280×800 | `screenshots/05-export-excel.png` |
| 小图标 16 | `icons/icon16.png` | 已就绪 |
| 图标 128 | `icons/icon128.png` | 已就绪 |
| 小宣传图 440×280（可选） | 用 icon128 白底放大即可 | 未做 |
| 大宣传图 1400×560（可选） | 未做 | — |

**Privacy policy URL**（必填，二选一）：
- GitHub Pages（推荐，页面即本仓库 `privacy-policy.html`）：发布后填 `https://zhangjunjesse.github.io/amazon-keyword-rank/privacy-policy.html`
- 或临时用 raw 链接：`https://raw.githubusercontent.com/zhangjunjesse/amazon-keyword-rank/main/privacy-policy.html`

**启用 GitHub Pages 方法**：仓库 Settings → Pages → Source: Deploy from a branch → main / (root) → Save。等 1-2 分钟即可访问上述 URL。

## 5. 提交清单（提交前逐项打勾）

- [ ] 注册开发者账号（一次性 $5）：https://developer.chrome.com/docs/webstore/register
- [ ] 打包上传：`chrome://extensions` → 开发者模式 → 打包扩展程序 → 选 `amazon-rank-tracker` 目录，得到 `.crx` + `.pem`（pem 要保存好，以后更新用它签名）
- [ ] 填基础信息、详细描述（上方文案）
- [ ] 上传 5 张截图
- [ ] 填权限说明 + 单一用途声明
- [ ] 填隐私政策 URL（先启用 GitHub Pages）
- [ ] 声明"数据处理"：数据仅本地处理，无收集/无传输 → 商店会展示 "No data collected"
- [ ] 提交审核（首次 1-7 个工作日，常见驳回原因：权限理由不充分 → 用上方文案）
- [ ] 同步发布到 Edge Add-ons：https://partner.microsoft.com/dashboard/microsoftedge（可导入 CWS 包，免费）

---

## 中文版描述（供第二语言或国内渠道使用）

```
批量查询你的 ASIN 在亚马逊搜索结果中的排名。

把关键词和 ASIN 粘贴进弹窗，点一下开始：插件会在后台标签页逐个打开亚马逊搜索页（使用你自己的登录会话，结果与真实买家看到的一致），自动计算出每个 ASIN 在每个关键词下的排名位置，广告位自动识别标注，支持总排名/自然排名切换、最多扫描 3 页，一键导出 Excel（排名汇总 / 完整明细 / 未找到清单）或 CSV。

数据全程本地处理，不上传、不收集，安全合规。支持亚马逊全部主流站点。
```
