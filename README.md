# Luca — 個人網站

純靜態網站，沒有建置步驟，可以直接部署到 Vercel 或 Cloudflare Pages。

## 檔案結構

```
portfolio/
├── index.html            首頁：hero、作品集、關於我、連結
├── blog/
│   ├── index.html        部落格首頁（文章列表）
│   ├── hsr-database.html 文章：hsr-database 的 Liquid Glass 改版
│   ├── gargantua.html    文章：做一個卡岡圖雅，放在瀏覽器裡
│   └── hyperion.html     文章：HYPERION 液態磁流體黑洞
├── assets/
│   ├── css/style.css     全部樣式（深空黑 + 星空 + 玻璃面板）
│   └── js/main.js        星空畫布 + 手機版導覽
└── README.md             本檔案
```

## 部署

**Vercel（Luca 選的，預計網址 luca.vercel.app）：**
- 方法一：Vercel 控制台 → Add New → Project → 匯入這個資料夾所在的 Git repo（Root Directory 設為 `portfolio/`，Framework 選 Other，不需要 Build Command）。
- 方法二：裝 Vercel CLI 後在 `portfolio/` 裡跑 `vercel`，照著提示走。

**Cloudflare Pages：**
- Cloudflare 控制台 → Workers & Pages → Create → Pages → 上傳這個資料夾（或連 Git repo，Build command 留空，Output directory 設為 `portfolio/`）。

部署後不需要任何設定，靜態檔案直接上線。

## 新增部落格文章

1. 複製一篇 `blog/*.html`，改標題跟內文（檔名用英文小寫加連字號，例如 `outer-wilds.html`）。
2. 在 `blog/index.html` 的 `<ul class="post-list">` 裡加一個 `<li class="post-item">`，照現有的格式填標題、簡介、連結。
3. 文章不寫日期——想加日期的話，在內文或列表裡自己補。

## 設計

- 深空黑底 + JS 畫布星空（會閃爍，尊重 `prefers-reduced-motion`）。
- 玻璃質感面板、暖金色點綴，標題用襯線體。
- 刻意不用線性漸層；手機優先，響應式。
- 沒有外部框架，CSS/JS 都在 `assets/` 裡。

## 取捨

- 作品集先只放 hsr-database 和 Discord 機器人（Luca 決定）。HYPERION、卡岡圖雅 3D、fate-book、relationship-timer、human 目前不放，HTML 檔也沒有複製進來。
- 部落格三篇文章仍寫了卡岡圖雅和 HYPERION（開站文章主題是原本就定好的），但文章裡沒有連到站內作品頁，因為那些頁面不存在。
- hsr-database 在 README 和 repo 裡都沒有寫正式上線網址，所以只連 GitHub repo。
- 沒有放 email，只有 GitHub（Ayaka-99）和 Discord（lance_508）。
