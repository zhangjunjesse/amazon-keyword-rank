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

## 2. 国内渠道：淘宝虚拟商品自动发货（约 30 分钟 + 1000 元可退保证金）

淘宝是国内个人卖卡密最成熟的**全自动**方案：买家付款 → 系统自动发一个未使用的卡密。

### 2.1 开店（一次性）

1. 用已实名的支付宝登录淘宝 → 千牛卖家中心（seller.taobao.com）→ 免费开店 → **个人店**（身份证即可，无需营业执照）
2. 按提示完成开店流程（实名、绑定支付宝、开通店铺）

### 2.2 发布虚拟商品（核心步骤）

1. 千牛后台 → 商品 → 发布商品
2. 类目：搜索"激活码/卡密"或"软件"类目下的相关子类目（虚拟类目通常要求缴纳**保证金 ¥1000**，可退；新店可能先要交保证金和过淘宝规则考试）
3. 商品信息：
   - 标题（30 字内）：`亚马逊排名查询工具 Pro 版激活码 一次买断 永久使用`
   - 价格：`49` 元
   - 勾选 **自动发货**，发货内容类型选 **卡密/兑换码**，上传卡密文件（见 2.3）
   - 商品描述：粘贴下方的"激活说明"
4. 发布成功后，复制**商品链接**（电脑端详情页链接或手机端分享链接），发给开发人员填到 `popup/popup.js` 顶部 `PAYMENT.zh.url`

### 2.3 生成并上传卡密（已生成好第一批）

卡密文件已生成：`C:\Users\Administrator\Desktop\dsh-workspace\space-1\pro-license-keys\keys-batch-1.txt`（200 个 `ARTK-…` 码，每行一个，直接上传到淘宝自动发货库存）。

以后补货（卖完一批后）：
```
cd amazon-rank-tracker\tools
node keygen.mjs issue --private "C:\Users\Administrator\Desktop\dsh-workspace\space-1\pro-license-keys\license-private.pem" --count 200 --out keys-batch-2.txt
```

### 2.4 商品描述（激活说明，直接复制）

```
【虚拟商品 · 自动发货】付款后系统自动发送激活码到您的淘宝消息/订单页，无需等待。

使用方法：
1. 在 Chrome 商店或 GitHub 安装"Amazon 关键词排名查询器"扩展
2. 打开扩展 → Pro 面板 → 粘贴收到的激活码 → 点"激活"
3. 激活成功后解锁全部功能：无限关键词、多页扫描、Excel 导出

适用：亚马逊各站点（.com / .de / .co.jp 等 21 个站点）
性质：一次买断，永久使用
售后：激活有任何问题请联系卖家（虚拟商品，拍下即发货，不支持无理由退款）
```

**验证**：自己拍一件 → 自动收到卡密 → 扩展里粘贴 → 应提示"Pro 已激活（国内卡密）"。

## 3. 定价（已按你的要求：国内便宜、海外贵）

| 渠道 | 价格 | 支付方式 | 发码 |
|---|---|---|---|
| 海外（待定：Payhip/Gumroad） | $19.99 一次性 | 国际信用卡 | 自动 |
| 国内（淘宝） | ¥49 一次性 | 微信 / 支付宝 | 自动（卡密） |

扩展会按用户浏览器语言自动展示对应渠道：中文界面 → 国内价；其他 → 国际价。

## 4. 常见问题

**私钥丢了怎么办？**
重新生成密钥对：`node keygen.mjs gen-keypair --out <目录>` → 把新公钥填进 `background/service-worker.js` 的 `PRO_PUBLIC_KEY` → **已发出的旧卡密全部失效**，需要重新给用户发新码。所以私钥务必备份（U 盘/密码管理器）。

**用户要求退款？**
- 海外：买家走平台自助退款。
- 淘宝：虚拟商品默认不支持无理由退款（已在商品描述写明）；遇到纠纷走淘宝客服仲裁。

**激活码被多人共用？**
- 自有卡密：一个码激活一次即绑定本机（存本地），换设备需重新激活（v1 不做多设备限制，够用）

**免费版限制是多少？**
≤3 关键词 / ≤10 ASIN / 仅第 1 页。Pro 解锁：无限关键词、最多 3 页、全部功能。

## 5. 上线检查清单

- [ ] 淘宝商品建好、卡密导入自动发货库存，商品链接填入 `PAYMENT.zh.url`
- [ ] 海外渠道（Payhip/Gumroad 等）建好，链接填入 `PAYMENT.intl.url`（可选，可后补）
- [ ] 测试：国内码激活成功（扩展提示"Pro 已激活"）
- [ ] 测试：免费版被裁剪时弹窗有提示
- [ ] 隐私政策已更新（激活码校验披露）并发布到 GitHub Pages
- [ ] 商店描述可加一句 "Pro upgrade via license key"
