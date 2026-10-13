# 研究筆記：市場、Arc 生態、同類機制，以及 Tallypay 該怎麼定位

整理日期：2026-10-13。三份研究（Circle Arc 現況、穩定幣支付與對帳市場、其他鏈已上線的對帳機制）的綜合。每一項數字後面都有來源；標 **[未驗證]** 的是只有二手來源或原始文件抓不到的。

---

## 1. Circle Arc 現在到底在哪裡

### 1.1 時間線

| 日期 | 事件 | 來源 |
|---|---|---|
| 2025-08-12 | Circle 宣布 Arc：「為穩定幣金融打造的開放 L1」 | [Circle](https://www.circle.com/blog/introducing-arc-an-open-layer-1-blockchain-purpose-built-for-stablecoin-finance) |
| 2025-10-28 | 公開測試網（chain 5042002） | [Arc](https://www.arc.io/blog/circle-launches-arc-public-testnet) |
| 2026-06-18 | Transaction Memos 上測試網 | [Arc](https://www.arc.io/blog/arc-transaction-memos-structured-context-for-onchain-transactions) |
| 2026-08-05 | 公布創始驗證者；私有主網已有 100+ 建設者 | [Circle](https://www.circle.com/pressroom/circle-announces-founding-validator-cohort-and-major-integrations-for-arc-ahead-of-september-16-mainnet-launch) |
| **2026-09-16** | **公開主網上線**（chain 5042） | [Circle](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet) |
| 2026-09-22 | StableFX 上主網 | [Arc](https://www.arc.io/blog/stablefx-is-live-on-arc-always-on-fx-is-here) |
| 2026-09-16 → 10-14 | Arc Microgrants 收件 | [DoraHacks](https://dorahacks.io/hackathon/arc-microgrants) |

### 1.2 主網上線時的狀態

- 驗證者：BlackRock、DTCC、Galaxy、ICE、Mastercard、MoneyGram、SBI、渣打、住友、Visa、Worldpay，加上 Circle。目前是 PoA，「探索 2027 年轉 PoS」。
- 技術：Malachite BFT 共識 + Reth 執行；USDC 當 gas（原生 18 位小數、ERC-20 介面 6 位小數）；亞秒確定性最終確認；EIP-7708（每筆原生轉帳都發 Transfer 事件）。
- 上線即有：CCTP、Gateway、StableFX、CPN「原生整合」；USDC、EURC、cirBTC、USYC、BUIDL 等資產。
- 還沒上線：隱私（APS，文件寫「尚未提供」）、Stablecoin Services（跨幣結算、paymaster 付 gas）。
- 用量：DefiLlama TVL 約 5.57 億美元（10/13），九成九集中在 Morpho、Aave、Uniswap；第一天 783 萬筆交易但 USDC 轉帳只有約 62 萬筆，八成 DEX 量來自 meme 幣發射台（第三方分析）。**意思是：主網上真正的「支付」用量還很小，這一點不要誇大。**

### 1.3 Circle 自己怎麼說 Memo 是做什麼的

這對我們最重要，因為它等於官方替 Tallypay 背書：

- Arc 部落格：memo 讓「付款、撥款與更廣泛的金融活動更容易追蹤、對帳、連接到下游系統」，由「跑會計、報表、營運的鏈下系統」消費。舉例：**PSP 撥款**「在批次裡每筆轉帳附上唯一撥款參考」、金融科技營運「把存提款對回正確的使用者、帳戶、流程」。[來源](https://www.arc.io/blog/arc-transaction-memos-structured-context-for-onchain-transactions)
- 社群文章列的用途：「穩定幣付款對帳」、「批次撥款」、「存提款歸屬」、「使用者與帳戶對應」、「需要結構化上下文的報表與營運流程」。[來源](https://community.arc.io/home/blogs/arc-transaction-memos-structured-transaction-context-for-financial-workflows-on-arc-2026-06-18)
- 文件沒有規定 memoData 的格式（「在你的應用內一致地編碼」），也沒有大小限制。**這就是 tp1 存在的理由。**
- 限制：只能由 EOA 直接呼叫（ERC-4337、Safe、Circle 模組化錢包會 revert）；不能 STATICCALL / DELEGATECALL；內部呼叫失敗整筆 revert。
- 我們 10/13 用 `eth_getCode` 確認主網 `0x5294…e505` 有 1228 bytes 的程式碼、`Multicall3From` 有 3180 bytes，而且最近 9000 個區塊已經有人在發 Memo 事件。部落格和教學還寫「testnet」，所以文件落後於鏈。

### 1.4 Circle 自己怎麼說「對帳」

- Treasury Blueprint：「對帳可能需要多個團隊與系統」、要「超越試算表、批次電匯與人工對帳」。[來源](https://www.arc.io/blog/how-arc-supports-treasury-management-arc-blueprints)
- Cross-Border Blueprint：「鏈上結算把對帳從人工任務變成可程式化的任務」。[來源](https://www.arc.io/blog/how-arc-supports-cross-border-payments-arc-blueprints)
- 「Stablecoins Are an Additive Rail」：企業會把穩定幣嵌進既有系統，由 ERP 與 TMS「持有稽核與會計的位置」，點名 SAP、Kyriba。[來源](https://www.circle.com/current/stablecoins-are-an-additive-rail)
- CPN 路線圖把「對帳」列為尚待服務商填補的類別；Console 的報表儀表板是「規劃中」。[來源](https://www.circle.com/blog/cpn-momentum-and-upcoming-roadmap)
- Circle Mint 的對外格式是 **ISO 20022 camt.053 XML** 日報表（含 TransactionHash、CustomReferenceId 等）。[來源](https://developers.circle.com/circle-mint/references/camt053-statements)
- Request for Builders 的四個方向裡有「無國界薪資：付給十二個國家的四十個人要像一個簡單的流程」。[來源](https://www.arc.io/blog/the-unfinished-business-of-finance-machine-commerce-and-global-money) 我們的 demo 剛好是十二個國家的十二個賣家。

**結論：Circle 把「對帳」當成痛點反覆提、把 Memo 當成解法的原語、把 ERP 當成系統記錄，但自己沒有做「從 Memo 事件到 ERP 格式」這一段。這一段就是 Tallypay。**

### 1.5 黑客松與補助的訊號

- HackMoney 2026 Arc 賽道：155 隊，**97% 有 AI agent**；跨鏈「不再是差異化」；DevRel 特別點出「傳統金融搬上加密軌道」的作品（承包商付款、里程碑付款、薪資國庫）「引起企業真正的興趣」。[來源](https://www.arc.io/blog/meet-the-arc-track-winners-from-the-hackmoney-2026-hackathon-and-what-we-learned)
- ETHGlobal Cannes：**98% agent**。[來源](https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned)
- Microgrants 公開可見的參賽作品偏向打賞罐、分帳、paymaster、留言板。
- Circle Developer Grants（下一階）：5,000 到 100,000 美元、里程碑制；重點領域包含「**treasury management**」與 P2P 付款；要求「Arc 是價值流動或結算的核心」。[來源](https://www.circle.com/grant)
- 兩篇得獎文都沒有提到「對帳 / 會計」這個類別，代表沒人做，也代表審查員沒有既定的比較基準。

---

## 2. 市場：需求是真的嗎？多大？

### 2.1 真實支付量（不是交易所搬磚）

| 數字 | 說明 | 來源 |
|---|---|---|
| **3,900 億美元** | 2025 年真實穩定幣支付；**B2B 2,260 億（58%）**；B2C 撥款 110 億 | [McKinsey × Artemis](https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss) |
| B2B +733% YoY | 同上，二手引用 **[未驗證]** | [The Defiant](https://thedefiant.io/news/infrastructure/b2b-stablecoin-payments-grew-over-730-percent-yoy-in-2025) |
| 3,500–5,500 億 | BCG × Allium 的「真實經濟活動」估計；B2B 約四成、年增 65% | [BCG](https://www.bcg.com/assets/2026/white-paper-stablecoin-payments-truth-behind-numbers.pdf) |
| 1.79 兆 / 月 | Visa 調整後鏈上量（2026 年 6 月），**USDC 佔 67%** | [Visa / Allium](https://visaonchainanalytics.com/) |
| 147 億（年化） | Circle Payments Network 交易量，175 家機構（2026 Q2） | [Circle](https://www.circle.com/pressroom/circle-reports-second-quarter-2026-results) |

### 2.2 「付完之後」是障礙的證據

| 數字 | 說明 | 來源 |
|---|---|---|
| **70%** | 「如果有 ERP 整合會更願意採用穩定幣」；**38%** 把會計與稅務處理列為障礙；只有 **8–9% 的企業**在用（350 位受訪者，2025 年 9 月） | [EY-Parthenon](https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption) |
| ~40% | 美國中型企業 CFO 把「與既有財務系統整合」列為障礙；**88%** 收到穩定幣立刻換成美元 | [PYMNTS](https://www.pymnts.com/study_posts/waiting-for-certainty-why-most-cfos-are-holding-back-on-crypto-and-stablecoins/) |
| FASB 草案 | 2026-08-18 發布，11-19 截止意見：符合條件的穩定幣可列約當現金；所有企業要揭露約當現金的組成 | [Deloitte](https://dart.deloitte.com/USDART/home/publications/deloitte/heads-up/2026/fasb-proposes-enhancements-disclosures-cash-equivalents-clarifications-evaluation-certain-digital-as) |
| Stripe 自己承認 | 穩定幣金融帳戶文件寫「部分第三方會計整合不支援 USDC 交易，可以匯出 CSV」 | [Stripe](https://docs.stripe.com/crypto/stablecoin-financial-accounts) |
| Intuit × Circle | 2025-12 簽多年 USDC 合作（QuickBooks / TurboTax），截至 2026-10 還沒看到產品 | [The Block](https://www.theblock.co/post/383184/intuit-circle-usdc-stablecoin-payments-turbotax-quickbooks) |

注意：README 之前引用的「GDF Q1 2026」其實是 EY 2025 年 9 月調查的重新發表，不是新資料；已改為直接引 EY。

### 2.3 現在誰在做對帳、怎麼賣

- **企業級子帳本**：Bitwave（32 條鏈，文件 2025-09 更新，沒有 Arc；報價制，約 500 美元/月起）、Cryptio（150+ 鏈，Circle 是客戶；約 299–899 美元/月 + 5,000 美元導入費 **[未驗證]**）、Integral（不公開）。**沒有任何一家列出 Arc。**
- **中小企業**：Cryptoworth 99–1,000 美元/月；CoinLedger、Koinly 偏稅務。
- **付款端內建**：Request Finance（有 Xero/QBO 匯出，鏈：以太坊、Polygon、Arbitrum、OP、Base、Gnosis，無 Arc）、Loop、Coinbase Business（無 Arc）、BVNK（有真正的 Reconciliation API，但沒有分錄輸出，無 Arc；已被 Mastercard 收購）、Fireblocks Flow（「每筆交易端到端對帳」，Arc 支援未記載）。
- **會計師那邊**：QuickBooks 沒有原生加密功能（2024 年拿掉）；Xero 也沒有。實務作法是建一個 USDC 清算科目、把瀏覽器連結貼進附件、月底對錢包 CSV。Bitwave 自己說每月 5–50 筆撥款就是試算表崩潰的點。

### 2.4 Arc 上已經有的東西

- **付款業者**：Noah（CPN 成員、剛募 1,600 萬，有 webhook 與 reference 欄位，無對帳報表）、Cycles（移居 Arc，發票與清算，無 ERP 整合）、Copperx、BVNK、Bridge、Nium 在生態名錄裡，但**沒有任何一家公開宣布在 Arc 主網上線撥款**。名錄 ≠ 產品。
- **開源小工具（跟我們投同一個 microgrant）**：Ledgerline（MIT，批次撥款 + 自訂 PayoutAnchor 合約 + `arc-reconcile` CLI，**明寫「不是薪資或會計系統」**）、Arc Payrun、ArcFX、Snooper Bill。**沒有一個產出分錄或 Xero/QBO 匯入檔。**

---

## 3. 其他鏈上已上線的同類機制，與設計教訓

| 系統 | 機制 | 教訓 |
|---|---|---|
| **Stellar** | 交易 memo（28 bytes 文字 / uint64 / hash / return）；SEP-29 帳戶宣告「需要 memo」；SEP-31 由**收款方分配 memo**；muxed address 把 ID 放進地址 | 一筆交易一個 memo 在批次裡無法逐筆歸屬（Arc 的 Memo 沒這問題）；少 memo 是主要失敗模式，交易所靠人工補救；`MEMO_RETURN` 是退款連結的先例 |
| **XRPL** | destination tag + `RequireDest` 帳本強制 | 強制比建議有效；tag 太短又沒型別 |
| **Solana Pay** | 32-byte reference key 放進交易、驗證者索引、`getSignaturesForAddress` 找、`validateTransfer` 驗 | **找到 ≠ 驗證**（CVE-2022-35917 就是驗證多筆）；付款請求 URL 讓收款方分配 reference |
| **Tempo**（Stripe） | TIP-20 `transferWithMemo`，32-byte indexed memo；Goldsky 有對帳管線範例 | memo 進代幣標準所以可 `eth_getLogs` 過濾；32 bytes 逼你把真實參考雜湊掉；`Transfer` + `TransferWithMemo` 雙事件會重複計算；Goldsky 模型沒有 duplicate 狀態；ISO 20022「相容」只有二手來源 **[未驗證]** |
| **Request Network** | 加鹽的 paymentReference、代理合約發事件、餘額 = 同 reference 付款總和 | 不可連結性；分期付款天生支援 |
| **Coinbase Commerce / Base Commerce Payments** | 鏈上 intent id + 冪等（「一個 intent 只能付一次」）+ 期限 | 冪等鍵要在送出前強制 |
| **Modern Treasury** | 1:1 / 1:many / many:1、金額容差、多候選就人工 | 意圖比對只在唯一候選時自動配 |
| **銀行 ISO 20022** | `EndToEndId` 全程不變、`PmtInfId` 批次、camt.053/054 對帳檔、UETR 追蹤 | 欄位名直接沿用，ERP 不用翻譯；Circle Mint 已用 camt.053 |
| **Plaid** | pending → posted 用刪除 + 新增處理 | Arc 確定性最終確認讓這問題消失，可以立刻入帳 |

**Arc 的位置**：只有 Tempo（代幣原生 bytes32）和 Arc（包裝合約，bytes32 id + 任意 bytes 內容 + callDataHash 綁定）在協定層提供參考；Arc 的比 Tempo 更有結構空間。Plasma、Stable、Codex 都沒有找到對應機制。

---

## 4. 對 Tallypay 的結論

### 4.1 定位（一句話）

「Circle 說 Memo 是為了對帳、ERP 是系統記錄；Tallypay 就是 Memo 事件到 ERP 之間那一段，開源，兩個方向都做。」

### 4.2 需求放大，但要誠實

- 可以大聲講的：EY 70% / 38%、McKinsey B2B 2,260 億、PYMNTS 88% 立刻換美元（所以一定要對回法幣帳本）、FASB 要揭露約當現金組成、Circle 自己的 Blueprint 與「additive rail」原話。
- 不要講的：Arc 主網支付量（還很小）、「ISO 20022 相容」這種行銷詞（我們是「欄位名與長度限制沿用 ISO 20022」，這句可以驗證）。
- 最有說服力的差異化：Arc 上既有的工具都停在收據；企業級工具不支援 Arc；Circle 自己沒做這段。

### 4.3 這一輪因此做的改動

| 研究發現 | 改動 |
|---|---|
| 用 MetaMask「Send」的原生 USDC 只會發 EIP-7708 事件；demo 錢包一天 14 筆入帳裡 10 筆是原生轉帳，舊版完全看不到 | 讀取器同時讀兩種事件並去重；原生轉帳標示 `native` |
| B2B 是最大一塊；「這筆收款是哪張發票」是收款方的同一個問題 | 引擎支援 `direction: "in"`；分錄對應應收科目；demo 加入兩張發票與一筆未記錄的收款 |
| Stellar SEP-31、Solana Pay：由收款方分配識別碼 | 「Request a payment」連結，付款方打開即預填，memo 帶上收款方的發票號 |
| Coinbase Commerce 的冪等、Bithumb 重複撥款事件、薪資重複核准 | 送出前用錨點 memoId 查鏈上有沒有同 id 的批次；同批次內同收款人同金額警告 |
| Modern Treasury 的 variance、Goldsky 的 short_paid | 短付 / 超付精確到金額 |
| FASB 揭露、稽核要 roll-forward | 期初 + 收入 − 支出 − 手續費 = 期末，對鏈上餘額驗證 |
| Circle Mint 用 camt.053；QuickBooks 沒有加密功能但吃 CSV | 新增 camt.054 XML 與 QBO 分錄 CSV 匯出 |
| 公開 RPC 對突發請求回 429 | 每個區塊段最多兩個請求同時進行 |
| Request Network 加鹽、Ledgerline 加鹽 | 規格書保留 `tp1s` 加鹽變體與退款 / 分期欄位（未實作，誠實標示） |

### 4.4 刻意不做的事

- 自訂合約（含 memo_required 註冊表）：違背「只用 Arc 原語」的定位；SEP-29 式的宣告可以之後用 ERC-7xxx 風格紀錄做。
- 多鏈：Arc 單鏈、USDC 單資產，是我們的優勢不是限制。
- 即時 Xero / QBO API 同步：實務上會計師就是匯 CSV；留在路線圖。
- AI agent 功能：97–98% 的作品都在做，而且真實用量極小。

### 4.5 名稱

「TallyPay」在孟加拉有同名的無現金支付品牌，美國有信用卡 app「Tally」，印度有會計軟體 Tally Solutions。審查時搜尋會看到別人，但不影響資格。要不要改名是你的決定；改名成本在投稿前還很低。

---

## 5. 主要來源

Circle / Arc：[主網新聞稿](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet) · [Memo 部落格](https://www.arc.io/blog/arc-transaction-memos-structured-context-for-onchain-transactions) · [Memo 文件](https://docs.arc.io/arc/concepts/transaction-memos) · [批次交易](https://docs.arc.io/arc/concepts/batched-transactions) · [EVM 差異](https://docs.arc.io/arc/references/evm-differences) · [Treasury Blueprint](https://www.arc.io/blog/how-arc-supports-treasury-management-arc-blueprints) · [Additive Rail](https://www.circle.com/current/stablecoins-are-an-additive-rail) · [CPN 路線圖](https://www.circle.com/blog/cpn-momentum-and-upcoming-roadmap) · [camt.053](https://developers.circle.com/circle-mint/references/camt053-statements) · [Request for Builders](https://www.arc.io/blog/the-unfinished-business-of-finance-machine-commerce-and-global-money) · [HackMoney 回顧](https://www.arc.io/blog/meet-the-arc-track-winners-from-the-hackmoney-2026-hackathon-and-what-we-learned) · [Developer Grants](https://www.circle.com/grant) · [Microgrants](https://dorahacks.io/hackathon/arc-microgrants/detail)

市場：[EY-Parthenon](https://www.ey.com/en_us/insights/financial-services/cost-savings-and-speed-drive-stablecoin-adoption) · [McKinsey](https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss) · [BCG](https://www.bcg.com/assets/2026/white-paper-stablecoin-payments-truth-behind-numbers.pdf) · [PYMNTS](https://www.pymnts.com/study_posts/waiting-for-certainty-why-most-cfos-are-holding-back-on-crypto-and-stablecoins/) · [FASB / Deloitte](https://dart.deloitte.com/USDART/home/publications/deloitte/heads-up/2026/fasb-proposes-enhancements-disclosures-cash-equivalents-clarifications-evaluation-certain-digital-as) · [Bitwave 鏈清單](https://docs.bitwave.io/docs/blockchains) · [BVNK Reconciliation API](https://docs.bvnk.com/bvnk/reconciliation/reconcile-transactions/) · [Stripe 穩定幣帳戶](https://docs.stripe.com/crypto/stablecoin-financial-accounts) · [Ledgerline](https://github.com/hms1499/ledgerline)

先例：[SEP-29](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md) · [SEP-31](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0031.md) · [XRPL RequireDest](https://xrpl.org/docs/tutorials/compliance-features/require-destination-tags) · [Solana Pay spec](https://docs.solanapay.com/spec) · [CVE-2022-35917](https://cveawg.mitre.org/api/cve/CVE-2022-35917) · [Tempo memo（經 Chainstack）](https://docs.chainstack.com/docs/tempo-tutorial-first-payment-app) · [Goldsky 對帳](https://docs.goldsky.com/solutions/real-time-reconciliation) · [Request Network](https://docs.request.network/advanced/protocol-overview/how-payment-networks-work) · [Coinbase Commerce 協定](https://github.com/coinbase/commerce-onchain-payment-protocol) · [Modern Treasury 規則](https://docs.moderntreasury.com/payments/docs/defining-reconciliation-rules)
