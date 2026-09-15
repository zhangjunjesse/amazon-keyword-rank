# 收费系统一次性配置清单

> 目标：**付款 → 自动发码 → 扩展内粘贴激活 → 解锁 Pro**，全程自动化，你只做下面这一次性配置。
> 流程：海外走 Lemon Squeezy（$19.9），国内走面包多卡密（¥49），扩展按用户语言自动显示对应价格与购买入口。

## 0. 你需要知道的三个文件/位置

| 项 | 位置 | 说明 |
|---|---|---|
| 激活码生成器 | `tools/keygen.mjs` | 零依赖 Node 脚本，生成/签发/验证激活码 |
| **私钥（命根子）** | `C:\Users\Administrator\Desktop\dsh-workspace\space-1\pro-license-keys\license-private.pem` | **不要提交到 git、不要发给任何人**。丢了 = 已发出的所有卡密失效 |
| 公钥（已内置扩展） | `background/service-worker.js` 里 `PRO_PUBLIC_KEY` | 重新生成密钥对时需同步更新 |

---

## 1. 海外渠道：Lemon Squeezy（约 10 分钟）

1. 注册 https://app.lemonsqueezy.com （用你的邮箱；它负责收款、代缴税、发激活码）
2. **Stores → Create a store**（名字随意，如 "Amazon Rank Tools"）
3. **Products → Create a product**：
   - Name: `Amazon Keyword Rank Tracker Pro`
   - Price: `19.9 USD`，类型选 **One-time（一次性）**
   - 类别选 Software → **License keys 会自动开启**（LS 会为每笔订单自动生成激活码并随付款邮件发给买家）
4. 复制该商品的 **checkout URL**（形如 `https://xxx.lemonsqueezy.com/checkout/buy/xxxx`）
5. 把这个 URL 填到扩展里：`popup/popup.js` 顶部 `PAYMENT.intl.url`（同时改 `PAYMENT.intl.price` 若价格有变）
6. 可选：在 Product 里上传 logo；在 LS 后台设置退款政策（默认支持 30 天内自动退款）

**验证**：你自己买一个测试码 → 在扩展 Pro 面板粘贴 → 应提示"Pro 已激活（Lemon Squeezy）"。

## 2. 国内渠道：面包多（约 15 分钟）

面包多（mianbaoduo.com）是专门卖数字商品/卡密的平台：**不需要淘宝店、不需要营业执照**，买家微信/支付宝付款后**自动发放一个未使用的卡密**。

1. 注册 https://mianbaoduo.com （手机号即可）
2. 实名认证（个人即可，收款到你的支付宝/微信/银行卡）
3. **发布商品**：
   - 类型：**数字商品 / 卡密类**（选"自动发货"，商品内容选"卡密/兑换码"）
   - 标题：`Amazon 关键词排名查询器 Pro 激活码`
   - 价格：`49 元`
   - 商品描述：粘贴激活说明（扩展内 Pro 面板粘贴即可激活；如有问题可联系）
4. 生成一批卡密（在你电脑上）：
   ```
   cd amazon-rank-tracker\tools
   node keygen.mjs issue --private "C:\Users\Administrator\Desktop\dsh-workspace\space-1\pro-license-keys\license-private.pem" --count 200 --out keys.txt
   ```
   得到 `keys.txt`（每行一个 `ARTK-…` 激活码）
5. 把 `keys.txt` 的内容**上传到面包多的卡密库存**（发布商品后按平台指引导入）
6. 复制商品链接，填到 `popup/popup.js` 顶部 `PAYMENT.zh.url`

**验证**：让一个朋友买一个（或自己买一个）→ 自动收到卡密 → 扩展里粘贴 → 应提示"Pro 已激活（国内卡密）"。

**补货**：卡密卖完后再跑一次 `keygen issue` 生成新的一批导入即可（每月约 5 分钟）。

## 3. 定价（已按你的要求：国内便宜、海外贵）

| 渠道 | 价格 | 支付方式 | 发码 |
|---|---|---|---|
| 海外（Lemon Squeezy） | $19.9 一次性 | 国际信用卡 | 自动（邮件+页面） |
| 国内（面包多） | ¥49 一次性 | 微信 / 支付宝 | 自动（卡密） |

扩展会按用户浏览器语言自动展示对应渠道：中文界面 → 国内价；其他 → 国际价。

## 4. 常见问题

**私钥丢了怎么办？**
重新生成密钥对：`node keygen.mjs gen-keypair --out <目录>` → 把新公钥填进 `background/service-worker.js` 的 `PRO_PUBLIC_KEY` → **已发出的旧卡密全部失效**，需要重新给用户发新码。所以私钥务必备份（U 盘/密码管理器）。

**用户要求退款？**
Lemon Squeezy：买家直接走平台自助退款。面包多：联系你或平台客服，平台支持退款后回收卡密。

**激活码被多人共用？**
- 自有卡密：一个码激活一次即绑定本机（存本地），换设备需重新激活（v1 不做多设备限制，够用）
- Lemon Squeezy：平台自带实例管理，可设置单码最多激活设备数

**免费版限制是多少？**
≤3 关键词 / ≤10 ASIN / 仅第 1 页。Pro 解锁：无限关键词、最多 3 页、全部功能。

## 5. 上线检查清单

- [ ] LS 商品建好，checkout URL 填入 `PAYMENT.intl.url`
- [ ] 面包多商品建好，卡密导入，链接填入 `PAYMENT.zh.url`
- [ ] 测试：海外码 + 国内码各激活一次，均成功
- [ ] 测试：免费版被裁剪时弹窗有提示
- [ ] 隐私政策已更新（激活码校验披露）并发布到 GitHub Pages
- [ ] 商店描述可加一句 "Pro upgrade via license key"
