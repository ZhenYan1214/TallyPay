# Tieout 專案規劃書

> Arc 上的對帳層：讓 Arc 上的 USDC 金流，自動對到帳本、抓出異常、變成會計分錄。
>
> 最後更新：2026-10-13 · 狀態：測試網功能全部完成；第二、三輪審查修正完成（含市場與生態研究，見 `docs/RESEARCH.md`）；等待主網部署

---

## 目錄

1. [專案一句話](#1-專案一句話)
2. [背景](#2-背景)
3. [題目發想過程](#3-題目發想過程)
4. [最終定位](#4-最終定位)
5. [功能設計](#5-功能設計)
6. [系統架構](#6-系統架構)
7. [關鍵技術決策](#7-關鍵技術決策)
8. [在 Arc 上驗證到的技術細節](#8-在-arc-上驗證到的技術細節)
9. [Demo 情境：PromptBazaar](#9-demo-情境promptbazaar)
10. [目前進度與驗證證據](#10-目前進度與驗證證據)
11. [剩餘工作與投稿清單](#11-剩餘工作與投稿清單)
12. [風險與限制](#12-風險與限制)
13. [未來路線圖](#13-未來路線圖)
14. [參考資料](#14-參考資料)

---

## 1. 專案一句話

**Tieout：Arc 的對帳層。不管錢是誰付的、用什麼錢包付的，都能自動對到帳單、抓出異常、變成會計分錄。**

- 不搬錢、不碰私鑰，只做「錢付出去之後」的事
- 只用 Arc 原生功能（`Memo`、`Multicall3From`），沒有自訂合約
- 網站是純前端，對帳在使用者的瀏覽器裡完成

---

## 2. 背景

### 2.1 Circle 與 Arc

| 項目 | 內容 |
|---|---|
| Circle | USDC 發行商，美國上市公司（NYSE: CRCL） |
| Arc | Circle 推出的 Layer 1 區塊鏈，2026/9/16 主網上線 |
| 定位 | 「網路的經濟作業系統」：付款、外匯、代幣化資產、AI Agent 經濟 |
| 特色 | USDC 付手續費、不到一秒的確定性最終確認、相容 EVM、可選隱私（開發中）、許可制驗證者 |
| 驗證者 | BlackRock、DTCC、Visa、Mastercard、ICE、Standard Chartered、SBI 等 |
| 生態 | 上線首日有 100+ 應用、100+ 機構；Uniswap、Aave、Morpho、Chainlink 等 |

### 2.2 Arc Microgrants（目標投稿）

| 項目 | 內容 |
|---|---|
| 平台 | DoraHacks |
| 獎金 | 20 個名額 × 500 USDC（總共 10,000 USDC） |
| 截止 | **2026/10/14 23:59 ET（台灣時間 10/15 早上 11:59）** |
| 審核 | 收到就審，所有結果 10/21 前公布 |
| 必要條件 | 主網上線且能運作、公開 repo、專案說明、公開個人檔案（GitHub、X 或 Farcaster） |
| 不收 | 設計稿、簡報、只在測試網跑的專案、跟 Arc 無關的專案 |
| 評分 | 跟 Arc 的相關性、技術可信度、作品品質、是否值得繼續做（「潛力比用戶數重要」） |
| 性質 | 不是排名競賽，是有名額限制的補助；入選者可以進一步申請 Circle Grant Program |

### 2.3 為什麼市場上有那麼多條鏈（背景知識）

- **技術取捨**：去中心化、安全、速度三者難以兼顧，每條鏈做了不同的選擇
- **L1 / L2**：L1 是獨立的鏈；L2 建在以太坊上，借用以太坊的安全性
- **相容 EVM**：以太坊的工具和合約可以直接搬過來用，是新鏈搶開發者最快的方式
- **商業動機**：收手續費、發幣、掌握平台。Circle 推出 Arc，就是從「在別人的鏈上開店」變成「自己當房東」

---

## 3. 題目發想過程

### 3.1 研究方法

為了找出「真的被需要、還沒人做好、跟 Arc 完全契合」的方向，我們做了五輪研究：

1. **Arc 官方資料**：三場 Arc 黑客松的得獎與入圍作品、主網上線的生態名單、Circle Ventures 的投資方向
2. **其他穩定幣鏈**：Tempo（Stripe）、Plasma、Stable、Codex 的生態與真實用量
3. **各鏈真正有人在用的付款應用**：匯款、商家收款、發薪、B2B、金融卡、AI 付款
4. **其他鏈黑客松得獎作品的後續**：哪些長成公司、哪些消失
5. **AI Agent 付款生態**：x402、MPP、ACP 的真實用量與灌水程度

### 3.2 研究的關鍵發現

**真實的穩定幣付款其實很小**
- 鏈上帳面交易量約 46 兆美元，真正用在付款的只有約 3,900 億（全球付款的 0.02%），其中 B2B 佔 58%

**真正有產品市場契合的**

| 類型 | 代表 | 成功原因 |
|---|---|---|
| 新興市場美元存取 | MiniPay（1,800 萬錢包）、委內瑞拉 USDT | 當地貨幣崩潰 |
| 跨境 B2B | Bitso Business（年化 820 億美元）、BVNK、Conduit | 中小企業拿不到美元 |
| 穩定幣金融卡 | RedotPay、ether.fi Cash | 商家不用改變 |
| 後台結算 | Félix Pago、Credible | 用戶看不到區塊鏈 |

**失敗或停滯的**

| 類型 | 證據 |
|---|---|
| 已開發國家商家收款 | Shopify + Base 累計約 170 萬美元；MoonPay Commerce 掉約 80% |
| AI Agent 付款 | 真實 Agent 消費每月約 5,000～11,000 美元；八成以上是灌水 |
| 社群付款 | Base App 的社交功能收掉 |
| 獎勵驅動的資金 | Plasma 存款從 63.5 億掉到 14 億；Stable 從 7 億掉到 2,400 萬 |

**Arc 黑客松的現況**
- HackMoney 有 97%、Cannes 有 98% 的作品是 AI Agent，**嚴重飽和**

**反覆出現、沒人解決的缺口**
1. 會計、稅務、ERP 對帳（EY 訪問 350 位高階主管：70% 說「能接 ERP 就會更快採用」）
2. 轉錯地址與地址投毒
3. 推送式付款的退款與爭議處理
4. 誠實、中立的付款數據
5. 企業 AI 支出的預算、歸屬與對帳

### 3.3 候選方向與淘汰原因

| 候選 | 結論 | 原因 |
|---|---|---|
| AI Agent 付款工具 | ❌ 淘汰 | 九成以上作品都在做；真實用量極小 |
| 跨幣別請款工具 | ❌ 淘汰 | Arc 上已經有 Cycles Pay（募資 640 萬美元）、Copperx |
| 發薪、付款工具 | ❌ 淘汰 | Noah、Superfluid、Circle Mint Payouts、Bridge、BVNK 已經在做 |
| 物聯網付款 | ❌ 淘汰 | Pairpoint 已在 Arc 生態；需要硬體與場地 |
| 機密薪資 | ⏸ 延後 | Arc 的隱私功能還沒上線 |
| Zoneless 搬到 Arc | ⚠️ 參考 | 需求真實，但是別人的專案 |
| **對帳與會計層** | ✅ **採用** | 需求證據最強、Arc 上空白、契合度最高 |

### 3.4 「對帳工具」為什麼市場上做不好？

**不是沒有，是分成三種，各有問題：**

| 類型 | 代表 | 問題 |
|---|---|---|
| 企業級 | Bitwave、Cryptio | 太貴：每月約 300～450 美元，再加 2,500～5,000 美元導入費 |
| 平價版 | CoinLedger、Integral、Cryptoworth | 針對多鏈、多幣種的一般加密資產 |
| 付款工具內建 | Request Finance、Coinbase Business | 不支援 Arc |

**一般加密會計難在哪？** 多鏈資料格式不一致、DeFi 交易複雜、幣價波動要算損益、gas 用 ETH 付（每付一次 gas 就是處分一次加密資產）。

**在 Arc 上，這些難題大多消失：** 單一鏈、主要是 USDC、gas 也是 USDC。FASB 在 2026 年 8 月也提出草案，符合條件的穩定幣可以列為約當現金。

**單獨當產品的弱點（誠實評估）：**
- Arc 才上線一個月，用 Arc 收付款的企業還很少
- 對帳是「功能」不是「產品」，大廠要支援一條新的 EVM 鏈成本很低
- 賣給財務長需要會計專業，銷售週期長

**結論：** 作為 Microgrant 作品、開源公共財、履歷作品、Circle Grant 起點，勝算很高。商業化前需要找到真實用戶驗證。

### 3.5 模擬 Circle 團隊審查與修正

**第一版（付款 + 記帳工具）可能被打槍的原因：**
- 「這跟 Circle Mint Payouts、Bridge 有什麼不同？」
- 「Arc 原生就有 `Multicall3From`，為什麼自己寫批次合約？」
- 「Memo 只支援一般錢包（EOA），企業都用 Safe、Fireblocks」

**修正後：**

| 修改 | 內容 |
|---|---|
| ① 重新定位 | 從「付款工具」改成「Arc 的對帳層」，付款只是示範情境 |
| ② 不重造輪子 | 改用 Arc 原生的 `Multicall3From` + `Memo` |
| ③ 補設計硬傷 | 加入「意圖比對」，沒有 Memo 的錢包也能對帳 |
| ④ 公共財 | Memo 格式採 ISO 20022 欄位命名，定位成提案 |
| ⑤ 縮小範圍 | 聚焦對帳，P0、P1、P2 分級 |
| ⑥ 誠實標示 | 分錄標示「範本，需會計師確認」；說明是模擬情境 |
| ⑦ 隱私 | 身份資料只存在付款方自己的帳本，不上鏈 |

**模擬審查結論：** 修正後很可能進入入選名單，前提是執行品質到位。

### 3.6 第二輪模擬審查（2026-10-13）與修正

把自己當成 Circle Arc 審查員，用官方四個評分項目（Arc 相關性、技術可信度、作品品質、值不值得繼續做）重看一次，找出「會質疑、會懷疑、不會喜歡」的地方，逐項修掉：

| 審查員會問的問題 | 修正 |
|---|---|
| 「repo 拉下來 build 得起來嗎？」 | lockfile 沒收錄 web workspace，`npm ci` 會失敗。重新產生 lockfile；CI 加上 `typecheck` |
| 「`npm audit` 有 critical？」 | 來自 vitest 2.x 的開發相依。升級到 vitest 5 + vite 8，現在 0 個漏洞 |
| 「Memo 的 `memoId` 有 index，你有用到嗎？」 | 新增 **Verify** 頁：只憑 `EndToEndId` 就查到付款，並用 `callDataHash` 證明 memo 屬於那筆轉帳 |
| 「公開 RPC 掛了，demo 就是空白？」 | demo 附帶鏈上掃描快照（`*.activity.json`）。即時掃描失敗時自動改用快照，畫面明確標示，連結仍指向真實瀏覽器 |
| 「我要點幾下才看得到結果？」 | 首頁按鈕直接載入並執行 demo（`#/console?demo`）；結果上方有「這個 demo 在示範什麼」面板，每個情境附真實交易連結 |
| 「Pay 頁預設測試網，是不是 testnet-only？」 | Pay、Reconcile、Verify 全部預設主網 |
| 「為什麼用 JSON 不用 ABI 編碼？錨點那筆 0 元自轉帳是什麼？」 | README 新增「審查員會問的設計決策」一節；gas 實測表證明 memo 不是成本重點 |
| 「這和 Circle Mint 報表、Bitwave 有什麼不同？」 | README 新增比較表，以及 Stellar memo、Solana Pay reference、Tempo TIP-20 memo 三個已上線先例 |
| 「memo 格式只是你們自己的東西？」 | 獨立規格書 `docs/MEMO_SPEC.md`，含 ISO 20022 對應、memoId 推導、連結規則、版本策略 |
| 「投稿說明要寫什麼？」 | `docs/SUBMISSION.md`：表單欄位文字、90 秒影片腳本、投稿前檢查清單、常見質疑的回答 |
| 「git 只有一個 commit？」 | 後續修改拆成有意義的 commit |

### 3.7 第三輪：市場、Arc 生態與同類機制研究後的修正（2026-10-13）

派了三個研究代理分別查 Circle Arc 現況與路線、穩定幣支付與對帳市場、其他鏈上已上線的同類機制，完整整理在 `docs/RESEARCH.md`。幾個改變做法的發現：

| 發現 | 影響 | 改動 |
|---|---|---|
| Circle 自己把 Memo 定位為「穩定幣付款對帳」、「批次撥款」的原語，並說 ERP 是系統記錄；但 Circle 沒做「Memo 事件 → ERP 格式」這一段 | 定位可以直接用 Circle 的原話 | README、投稿稿改以 Circle 原話開場 |
| 用錢包直接「Send」的原生 USDC 只發 EIP-7708 事件；demo 錢包一天 14 筆入帳裡 10 筆是原生轉帳，舊版完全看不到 | 審查員用 MetaMask 測一定踩到 | 讀取器同時讀 ERC-20 與系統事件並去重 |
| 真實支付量 B2B 佔 58%；「這筆收款是哪張發票」是收款方的同一個問題 | 只做付款方太窄 | 引擎支援應收（`direction: "in"`）、請款連結、應收分錄 |
| Coinbase Commerce 的冪等、交易所重複撥款事件 | 重複送出批次會付兩次 | 送出前查鏈上同 id 錨點；同批次重複收款人警告 |
| FASB 要揭露約當現金組成；稽核要 roll-forward | 只列交易不夠 | 期初 + 收入 − 支出 − 手續費 = 期末，對鏈上餘額驗證 |
| Circle Mint 用 camt.053；QuickBooks 吃 CSV 但沒有加密功能 | 匯出格式要對準既有系統 | 新增 camt.054 XML、QBO 分錄 CSV |
| 公開 RPC 對突發請求回 429 | 掃描可能失敗 | 每段最多兩個請求並行 |
| Ledgerline 等開源工具已在 Arc 主網投同一個 microgrant，但都停在收據、不產分錄 | 差異化要放在會計輸出與雙向對帳 | 投稿稿與 README 的比較表 |
| Memo 合約主網部署狀態文件未寫明 | 若主網沒有，demo 會失敗 | 用 `eth_getCode` 確認主網兩個合約都在，且已有人使用 |

---

## 4. 最終定位

### 4.1 價值主張

> 其他付款工具只負責「把錢送到」，記帳是你家的事；Tieout 讓錢付出去的同時，帳就已經記好了。

### 4.2 跟生態的關係：互補，不是競爭

```
           付款方式（任何一種都可以）
  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  │ Tieout 批次 │ Circle Mint  │ Noah / Cycles │ Safe / 手動  │
  └──────┬───────┴──────┬───────┴──────┬───────┴──────┬───────┘
         └──────────────┴───────┬──────┴──────────────┘
                                ▼
                     Arc 鏈上的 USDC 金流
                                ▼
                    ┌───────────────────────┐
                    │  Tieout 對帳層       │
                    │  Memo 比對 + 意圖比對   │
                    └───────────┬───────────┘
                                ▼
              對帳報表 · 會計分錄 · Xero 匯入檔
```

### 4.3 目標使用者

- 付款給大量海外接案者、創作者的小型平台（素材市集、AI 提示詞市集、聯盟行銷）
- 外包工作室、遊戲工作室
- 這些平台的會計人員或會計師事務所

---

## 5. 功能設計

### 5.1 六個步驟

| 步驟 | 做什麼 | 用到的 Arc 功能 |
|---|---|---|
| **① 標記** | 每筆付款附上 ISO 20022 格式的 Memo | `Memo` 合約 |
| **② 批次與錨定** | 一筆交易付完整批；第一個呼叫錨定帳本雜湊 | `Multicall3From` |
| **③ 對帳** | 讀取錢包活動，跟帳本比對 | 公開 RPC、事件紀錄 |
| **④ 請款** | 收款方產生付款請求連結，付款方打開即預填，memo 帶上收款方的發票號 | `Memo`（由付款方的 EOA 發出） |
| **⑤ 查驗** | 只憑 `EndToEndId` 在鏈上找到付款，並驗證 memo 屬於那筆轉帳 | `Memo` 事件的 indexed `memoId`、`callDataHash` |
| **⑥ 入帳** | 產生複式分錄與餘額滾算，匯出 CSV、Xero、QuickBooks、camt.054 | USDC gas（手續費是美元費用）、歷史 `balanceOf` |

### 5.2 六種對帳狀態

| 狀態 | 意義 | 分錄處理 |
|---|---|---|
| `matched` 已對上 | Memo、收款人、金額、幣種都一致 | 借：應付付款 / 貸：USDC 錢包 |
| `matched_by_intent` 依意圖比對 | 沒有 Memo，但收款人、金額、幣種吻合 | 同上 |
| `mismatch` 不符 | Memo 指向某筆帳，但細節不同 | 借：暫記款 / 貸：USDC 錢包 |
| `missing` 未付款 | 帳本有，鏈上沒有 | 不入帳 |
| `duplicate` 重複 | 同一筆付了兩次 | 借：暫記款 |
| `unexpected` 不明支出 / 不明收入 | 鏈上有，帳本沒有（兩個方向都會抓） | 支出：借暫記款；收入：貸暫記款 |

每一筆都標示方向（money out / money in）。應收（`direction: "in"`）對上時：借 USDC 錢包、貸應收帳款。短付、超付會標出精確差額。另外有兩個整體檢查：錨點驗證（5.3）與餘額滾算（期初 + 收入 − 支出 − 手續費 = 鏈上期末，差額就是掃描沒解釋到的錢）。

### 5.3 錨點驗證

- 批次交易的第一個呼叫寫入 `NbOfTxs`（筆數）、`CtrlSum`（總額）、`LedgerHash`（帳本雜湊）
- 驗證時，只跟「同一筆交易裡實際付出的那幾筆」比對，所以另外付款或暫緩的項目不會造成誤判
- 帳本事後被修改時，能**精準指出**是哪一筆、改了什麼，例如：`S04 edited after anchoring (amount 0.15 → 0.135)`

### 5.4 Memo 格式（tp1）

```text
tp1:{"EndToEndId":"PB-202610-ELLE-S04","PmtInfId":"PB-202610-ELLE","Purp":"COMM","CdtrRef":"STMT-202610-S04"}
tp1-run:{"PmtInfId":"PB-202610-ELLE","NbOfTxs":10,"CtrlSum":"1.367","LedgerHash":"0x…"}
```

| 欄位 | ISO 20022 意義 | 限制 |
|---|---|---|
| `EndToEndId` | 端對端識別碼，每筆唯一 | Max35Text |
| `PmtInfId` | 付款批次識別碼 | Max35Text |
| `Purp` | 付款用途代碼（COMM 佣金、SUPP 供應商、SALA 薪資） | 4 個大寫字母 |
| `CdtrRef` | 收款方參考號（例如發票號碼） | Max35Text |
| `Ustrd` | 非結構化備註 | Max140Text |

- `memoId = keccak256("tp1:" + EndToEndId)`：持有帳本的人可以直接用 memoId 查詢
- `LedgerHash`：排序後的 `EndToEndId|recipient|amountUnits|token` 取 keccak256
- **Memo 只放識別碼，絕不放姓名、Email 等個人資料**

---

## 6. 系統架構

### 6.1 專案結構

```
Circle_arc/
├── packages/
│   ├── sdk/        @tieout/sdk    網路設定、ABI、Memo 編解碼、帳本雜湊、批次組裝、鏈上讀取（ERC-20 + EIP-7708）、memoId 查詢、掃描快照
│   └── recon/      @tieout/recon  對帳引擎（雙向、差額、餘額滾算）、錨點驗證、分錄產生、CSV / Xero / QBO / camt.054 匯出
├── apps/
│   └── web/        @tieout/web    純前端網站：Overview、Reconcile、Verify、Pay a run、Request a payment
├── scripts/                         命令列工具：技術驗證、示範情境、對帳、gas 報告、快照、回收、測試錢包
├── docs/                            本規劃書、Memo 規格書（MEMO_SPEC.md）、投稿稿（SUBMISSION.md）、研究筆記（RESEARCH.md）
└── .github/workflows/pages.yml      推上 GitHub 自動測試、建置、部署
```

### 6.2 資料流

```
付款方的帳本（CSV / JSON，含收款人姓名等私密資料，不上鏈）
        │
        │ ① buildPayoutRun()
        ▼
Multicall3From.aggregate3([
   Memo.memo(USDC, transfer(付款方, 0), 錨點)    ← 帳本雜湊錨點
   Memo.memo(USDC, transfer(收款人1, 金額), Memo1)
   Memo.memo(USDC, transfer(收款人2, 金額), Memo2) ...
])  ── 由付款方自己的錢包簽名送出
        │
        ▼
Arc 鏈上事件：USDC Transfer + Memo（含 callDataHash）
        │
        │ ② observeAccount()：分段查詢事件、用 callDataHash 把 Memo 對到轉帳
        ▼
AccountActivity { transfers, anchors, fees }
        │
        │ ③ reconcile()：第一輪 Memo 比對 → 第二輪意圖比對 → 剩下的歸為異常
        ▼
ReconReport { items, anchors, summary }
        │
        │ ④ buildJournal() → journalCsv() / xeroManualJournalCsv()
        ▼
對帳報表 CSV · 通用分錄 CSV · Xero 匯入檔
```

### 6.3 技術選型

| 層 | 技術 | 原因 |
|---|---|---|
| 語言 | TypeScript | 前後端共用 SDK |
| 鏈互動 | viem | 型別安全、輕量 |
| 前端 | Vite + React + Tailwind v4 | 靜態網站，可部署在任何地方 |
| 測試 | Vitest 5 | 29 個單元測試；`npm audit` 0 個漏洞 |
| 命令列 | tsx | 直接執行 TypeScript |
| 部署 | GitHub Pages + Actions | 只需要 GitHub 帳號 |
| 授權 | Apache-2.0 | — |

---

## 7. 關鍵技術決策

| 決策 | 選擇 | 原因 |
|---|---|---|
| 要不要寫自訂合約？ | **不寫** | Arc 原生的 `Memo` + `Multicall3From` 已經足夠；證明我們懂 Arc |
| 要不要後端伺服器？ | **不要** | Arc RPC 開放 CORS，瀏覽器可以直接讀；帳本不離開使用者的電腦 |
| 私鑰放哪？ | **使用者自己的錢包** | 網站只送交易請求，由錢包簽名 |
| Memo 怎麼對到轉帳？ | **callDataHash** | Memo 事件記錄了它包裝的呼叫的雜湊；重算 `keccak256(transfer(to, value))` 就能精準配對，批次裡有幾筆都行 |
| 沒有 Memo 的錢包怎麼辦？ | **意圖比對** | 依收款人、幣種、金額配對，最舊的優先 |
| 錨點跟誰比對？ | **同一筆交易內的付款** | 避免另外付款或暫緩的項目造成誤判 |
| 手續費怎麼入帳？ | **每日彙總一筆** | 單筆手續費只有零點幾分錢 |
| Xero 匯出怎麼捨入？ | **整數運算、絕對值四捨五入** | 避免借貸不平衡（JS 的 Math.round 遇負數 .5 會出錯） |
| Memo 為什麼用 JSON 不用 ABI 編碼？ | **JSON** | 瀏覽器和稽核檔案直接可讀、不需工具解碼、欄位名一對一對應 ISO 20022；實測成本差異很小，規格書保留 `tp2:` 前綴給二進位版本 |
| 錨點為什麼包一筆 0 元自轉帳？ | **必要的載體** | `Memo` 一定要包一個內部呼叫；`transfer(payer, 0)` 是最便宜又無害的，讀取端會過濾掉 |
| RPC 掛掉怎麼辦？ | **快照備援** | demo 附帶同一區塊範圍的掃描快照；即時掃描失敗才用，畫面明確標示 |
| 原生 USDC 轉帳看不到怎麼辦？ | **同時讀 EIP-7708 系統事件** | 同一筆交易若有 ERC-20 事件就丟掉系統事件，否則視為原生轉帳並標示 |
| 收款方要不要做？ | **要** | B2B 是最大一塊；同一個引擎加 `direction: "in"`；請款連結讓付款方的 memo 帶上收款方的發票號 |
| 怎麼防重複付款？ | **錨點當冪等鍵** | 送出前用 `runAnchorMemoId(PmtInfId)` 查鏈上；同錢包已錨定就拒送 |
| 怎麼證明沒漏掉錢？ | **餘額滾算** | 公開 RPC 有歷史 `balanceOf`；期初 + 收入 − 支出 − 手續費 必須等於期末 |
| 介面語言 | **英文** | 評審是 Circle 國際團隊；README 附中文簡介 |

---

## 8. 在 Arc 上驗證到的技術細節

這些都是用真實測試網交易驗證過的：

| 發現 | 影響 |
|---|---|
| `Memo` 包在 `Multicall3From` 裡可以正常運作，Memo 事件的 `sender` 和 USDC 轉帳的 `from` 都是付款方錢包 | 批次 + Memo 的架構成立 |
| **每筆 USDC 轉帳會發出兩個 Transfer 事件**：USDC 合約 `0x3600…`（6 位小數），以及系統地址 `0xffff…fffe`（18 位小數，EIP-7708） | 只讀 USDC 合約的事件，避免重複計算 |
| 公開 RPC 的 `eth_getLogs` 一次最多約 10,000 個區塊 | 查詢要分段（每段 9,000） |
| 主網約每秒 2 個區塊 | 10,000 個區塊約 85 分鐘 |
| `maxFeePerGas` 低於 20 gwei 的交易會被默默丟棄 | 一律設成至少 20 gwei |
| Arc RPC 開放 CORS | 網站可以做成純前端 |
| 公開 RPC 不支援 `debug_traceCall`、`eth_simulateV1` | 只能用真實測試網交易驗證事件 |
| 原生 USDC 18 位小數、ERC-20 介面 6 位小數，同一筆餘額 | 一律用 ERC-20 介面，以 6 位小數記帳 |
| Memo 只接受 EOA 直接呼叫 | 智能合約錢包要靠意圖比對 |
| 批次裡一筆帶 Memo 的付款（含攤提的錨點）約 64,000 gas；單獨一筆純轉帳約 74,000 gas | Memo 不是成本重點，批次攤掉基本費才是；一筆帶 Memo 的付款比純轉帳便宜 13% |
| 原生 USDC 轉帳（錢包的 Send）只發系統位址 `0xffff…fffe` 的 Transfer 事件，不經過 `0x3600` 合約 | 只讀代幣合約事件會漏掉所有錢包直接轉帳；demo 錢包一天 14 筆入帳裡 10 筆是這種 |
| 公開 RPC 支援歷史 `balanceOf`（指定區塊） | 不需要 archive node 就能做餘額滾算 |
| 公開 RPC 對突發並行請求回 HTTP 429 | 每段最多兩個請求並行 |
| 主網 `0x5294…e505`（Memo）與 `0x522f…47D0`（Multicall3From）都有程式碼，最近 9000 個區塊已有 Memo 事件 | 文件還寫 testnet，但主網可用 |

---

## 9. Demo 情境：PromptBazaar

**虛構的 AI 提示詞市集，付款給 12 個國家的 12 位賣家。市集是模擬的，但所有交易都是真實的 Arc 交易。**

| 賣家 | 情境 | 預期結果 |
|---|---|---|
| 10 位賣家 | 批次付款 + Memo + 錨點 | ✅ 已對上 |
| 賣家 07 | 用一般轉帳付款，沒有 Memo（模擬 Safe 錢包） | 🔵 依意圖比對 |
| 賣家 12 | 暫緩付款 | ⏳ 未付款 |
| 賣家 04 | 付款後帳本金額被修改 | ⚠️ 不符，錨點精準指出被改的那一筆 |
| （不明地址） | 錢包轉出一筆帳本沒有的錢 | 🔴 不明支出 |

- 金額是真實但很小的數字（總共約 1.5 USDC），以節省成本
- 收款錢包是從付款方私鑰推導出來的，示範完可以用回收腳本把錢收回

---

## 10. 目前進度與驗證證據

### 10.1 已完成

| 項目 | 狀態 |
|---|---|
| SDK：Memo 編解碼、帳本雜湊、批次組裝、鏈上讀取 | ✅ |
| 對帳引擎：六種狀態 + 錨點驗證（精準指出被改的項目） | ✅ |
| 會計輸出：複式分錄、通用 CSV、Xero 匯入檔 | ✅ |
| 網站：Overview、Reconcile、Verify、Pay a run、Request a payment | ✅ |
| 雙向對帳：應收、原生轉帳、短付超付差額、餘額滾算 | ✅（測試網實測：滾算差額 0） |
| 重複付款防呆：錨點冪等查詢、批次內重複警告 | ✅ |
| 匯出：Xero、QuickBooks、camt.054 XML | ✅ |
| Reconcile：首頁一鍵自動執行 demo、情境導覽面板、RPC 失敗時改用快照 | ✅ |
| Verify：憑 `EndToEndId` 查鏈上 memo，`callDataHash` 連結到轉帳 | ✅（測試網實測） |
| 命令列：技術驗證、示範情境、對帳、gas 報告、快照、資金回收、測試錢包 | ✅ |
| 單元測試 29 個；`npm audit` 0 個漏洞；CI 跑 typecheck + test + build | ✅ 全部通過 |
| README（英文 + 中文簡介）、Memo 規格書、投稿稿、研究筆記、Apache-2.0 授權 | ✅ |
| GitHub Pages 自動部署流程 | ✅（尚未推送） |

### 10.2 測試網驗證紀錄

| 驗證 | 交易 | 結果 |
|---|---|---|
| 技術驗證：批次 + Memo | [0xd1033e…1865](https://explorer.testnet.arc.io/tx/0xd1033e597ec4ef74b1118356d6a14dcc61fcb09d0ad34fdec0ef3a7d8baf1865) | 付款人歸屬正確；3 筆共 0.0038 USDC 手續費 |
| PromptBazaar 批次付款 | [0x1bafdd…8223](https://explorer.testnet.arc.io/tx/0x1bafdd8cd30f3ec603c6402f64eb0b21242ca71d12fcf11c31694b3d69388223) | 10 筆 + 錨點 |
| 賣家 07 無 Memo 付款 | [0x0a9565…a677](https://explorer.testnet.arc.io/tx/0x0a956504ca24596100442f995ab573775df9eda6222d1dd92f5167da6e19a677) | 依意圖比對成功 |
| 不明支出 | [0x555e71…09b6](https://explorer.testnet.arc.io/tx/0x555e713a9e2862ae1e40cf36d6e96f244d46d46d5fcc83059dbf446b65d509b6) | 正確標為不明支出 |
| 網站付款頁端到端 | [0x68ecda…95b5](https://explorer.testnet.arc.io/tx/0x68ecda0a35eb12403c5e987459b9e1a02a68d712457e17b93bbec549521f95b5) | 3 筆全部對上，錨點驗證通過 |

**PromptBazaar 對帳結果（命令列與網站一致）：**

```
預期 1.52 USDC · 已結算 1.295 · 異常 0.195
9 已對上 · 1 依意圖比對 · 1 不符 · 1 未付款 · 1 不明支出
錨點：PB-202610-ELLE-S04 edited after anchoring (amount 0.15 → 0.135)
手續費：0.0166 USDC（3 筆交易）
```

**gas 實測（`npm run gas`，測試網，21 gwei）：**

| 交易 | 內容 | gas | 手續費 (USDC) | 每筆付款 (USDC) |
|---|---|---:|---:|---:|
| 0x1bafdd…8223 | 批次：10 筆帶 Memo 的付款 + 錨點 | 642,626 | 0.013495 | 0.001350 |
| 0x0a9565…a677 | 單筆純轉帳，沒有 Memo | 73,950 | 0.001553 | 0.001553 |

### 10.3 開發中修掉的問題

| 問題 | 修正 |
|---|---|
| 錨點驗證時，另外付款或暫緩的項目造成「筆數不符」的雜訊 | 改成只跟同一筆交易內的付款比對，並指出被改的項目 |
| Xero 匯出遇到半分錢（0.045）時借貸不平衡 | 改用整數運算，對絕對值四捨五入 |
| 地址大小寫（checksum）不同導致比對失敗 | 一律忽略大小寫比對 |
| 回收腳本遇到空錢包時估算手續費失敗 | 先檢查餘額 |

---

## 11. 剩餘工作與投稿清單

### 11.1 測試網

- [x] 第二輪模擬審查的修正（見 3.6）
- [x] 第三輪研究後的修正（見 3.7）
- [ ] 測試網 demo 重跑一次，讓 demo 資料包含三個收款情境（需要測試網私鑰；主網跑的時候會自然包含）
- [x] 投稿說明與展示影片腳本（`docs/SUBMISSION.md`）
- [ ] EURC 付款與匯率入帳（延後，不影響評分）
- [ ] 手機版面檢查（延後）

### 11.2 主網（使用者確認後再進行）

- [ ] 在 `.env` 填入 `MAINNET_PRIVATE_KEY`，Arc 主網錢包準備至少 2 USDC
- [ ] 執行 `npm run demo -- --network=arc-mainnet`
- [ ] 執行 `npm run snapshot -- apps/web/public/demo/promptbazaar-arc-mainnet.json`（快照備援）
- [ ] 執行 `npm run gas -- apps/web/public/demo/promptbazaar-arc-mainnet.json`，把表格貼進 README「What it costs」
- [ ] 網站會自動優先使用主網示範資料；確認首頁按鈕一鍵跑通
- [ ] 示範完執行 `npm run sweep -- --network=arc-mainnet` 回收資金（可等審查期過後）

### 11.3 發布

- [x] 修改拆成有意義的 git commit（本機）
- [ ] 推送到 GitHub 公開 repo（remote 已設定）
- [ ] 在 repo 設定裡開啟 GitHub Pages（Source：GitHub Actions）
- [ ] README 補上網站網址與主網交易連結

### 11.4 DoraHacks 投稿

- [ ] 主網上可以打開的網站連結
- [ ] 公開 repo 連結
- [ ] 專案說明（做什麼、用 Arc 做什麼）：`docs/SUBMISSION.md` 已寫好，填入連結即可
- [ ] 公開個人檔案（GitHub、X 或 Farcaster）：確認有頭像、名字、釘選這個 repo
- [ ] 截止：台灣時間 10/15（四）早上 11:59

---

## 12. 風險與限制

| 風險 / 限制 | 說明 | 對策 |
|---|---|---|
| 沒有真實用戶 | 純 Demo、模擬情境 | 誠實說明；需求引用真實數據 |
| Memo 只支援 EOA | 智能合約錢包無法附 Memo | 意圖比對補位 |
| 意圖比對的歧義 | 多筆相同收款人、相同金額時可能配錯 | 未來加入到期日、發票資訊 |
| 瀏覽器掃描範圍 | 單次最多 20 萬個區塊（主網約 28 小時） | 長期要接索引器（Goldsky、The Graph、Envio） |
| EURC 入帳 | 需要匯率才能記入美元帳本 | 開發中 |
| 會計正確性 | 穩定幣的會計分類仍在變動 | 分錄標示為範本，需會計師確認 |
| Xero 限制 | 手動分錄不能用銀行科目和系統應付科目 | 文件說明科目設定方式 |
| 大廠競爭 | Bitwave、Request 可能支援 Arc | 專注 Arc、中小企業、開源 |
| Memo 標準分裂 | Circle 可能推出官方格式 | 定位成提案，SDK 可切換 |
| 公開 RPC 限流 | 突發請求回 429 | 每段最多兩個請求並行；快照備援 |
| 同名 | 孟加拉有 TallyPay 支付品牌、美國有 Tally 信用卡 app | 不影響資格；是否改名由使用者決定 |
| 同賽道的開源工具 | Ledgerline 等已在主網，但不產分錄 | 差異化放在會計輸出、雙向對帳、不用自訂合約 |

---

## 13. 未來路線圖

| 階段 | 內容 |
|---|---|
| 短期 | 接 Arc 上付款業者的 webhook；Xero、QuickBooks 直接 API 同步（OAuth）；EURC 與在地穩定幣的匯率紀錄 |
| 短期 | `tp1.1`：加鹽 memoId 變體、退款參考 `RtrRef`、分期 `InstlmtNb` |
| 中期 | 接收 Arc 上付款業者（Noah、Cycles 等）的 webhook，自動對帳 |
| 中期 | 接索引器，支援長時間範圍與多錢包 |
| 長期 | Arc 隱私功能上線後，支援 view key 稽核：稽核人員可以驗證付款，帳本不必公開 |
| 長期 | 企業 AI 支出的彙總與歸屬：把大量奈米支付彙總成可入帳的費用 |
| 補助路線 | Arc Microgrant → Circle Grant Program（開源 SDK 作為生態公共財） |

---

## 14. 參考資料

### Arc / Circle
- [Arc Microgrants（DoraHacks）](https://dorahacks.io/hackathon/arc-microgrants/detail)
- [Circle：Arc 主網上線新聞稿](https://www.circle.com/pressroom/circle-launches-arc-mainnet-an-economic-operating-system-for-the-internet)
- [Arc 文件：Transaction Memos](https://docs.arc.io/arc/concepts/transaction-memos)
- [Arc 文件：Batched Transactions](https://docs.arc.io/arc/concepts/batched-transactions)
- [Arc 文件：EVM Differences](https://docs.arc.io/arc/references/evm-differences)
- [Arc 文件：Contract Addresses](https://docs.arc.io/arc/references/contract-addresses)
- [Arc 生態目錄](https://www.arc.io/ecosystem)
- [HackMoney 2026 Arc 賽道得獎作品](https://www.arc.io/blog/meet-the-arc-track-winners-from-the-hackmoney-2026-hackathon-and-what-we-learned)
- [ETHGlobal Cannes Arc 賽道得獎作品](https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned)
- [Circle Ventures：Arc Builders Fund](https://www.circle.com/blog/introducing-the-arc-builders-fund)
- [Circle Mint：Stablecoin Payouts](https://developers.circle.com/circle-mint/concepts/stablecoin-payins-and-payouts.md)

### 市場與需求
- [McKinsey：Stablecoins in payments](https://www.mckinsey.com/industries/financial-services/our-insights/stablecoins-in-payments-what-the-raw-transaction-numbers-miss)
- [a16z：State of Crypto 2025](https://a16zcrypto.com/posts/article/state-of-crypto-report-2025/)
- [GDF Digital Finance Forum Q1 2026（EY 調查）](https://www.gdf.io/wp-content/uploads/2026/06/Digital-Finance-Forum-Readout-Q1_2026.pdf)
- [Bitwave：穩定幣付款對帳指南](https://www.bitwave.io/blog/real-time-reconciliation-reporting-for-stablecoin-payouts-2025-guide)
- [FitSmallBusiness：加密會計軟體比較](https://fitsmallbusiness.com/best-cryptocurrency-accounting-software/)
- [CPA Practice Advisor：FASB 穩定幣約當現金草案](https://www.cpapracticeadvisor.com/?p=188734)
- [Bitquery：x402 稽核](https://bitquery.io/investigations/x402-ai-agent-payments-audit)
- [Colosseum：Request for Products](https://blog.colosseum.com/request-for-products/)

### 參考專案
- [Cycles（Arc 上的 B2B 清算）](https://cycles.money/blog/cycles-is-moving-to-arc)
- [Zoneless（開源 Stripe Connect 替代品）](https://github.com/zonelessdev/zoneless)
- [Request Finance](https://prnewswire.co.uk/news-releases/request-finance-hits-1-billion-in-bill-payments-secures-strategic-funding-to-scale-stablecoins--fiat-finance-302405878.html)
- [ApprovalMax：Xero 手動分錄 CSV 格式](https://support.approvalmax.com/en/articles/414429-how-to-upload-a-manual-journal-to-approvalmax)
