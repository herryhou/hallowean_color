# COLOR ??%

單頁 Web App（繁中 UI、簡單英文為主）：活動用的「顏色佔比評分遊戲」。上傳正面 + 背面兩張照片，選定紅 / 黃 / 藍其中一色，App 會分割出人物、用固定標準算出該顏色佔全身的比例（0–100%），可留存結果並查看排行榜。

## 檔案結構

- `index.html` — 整個 App（HTML + CSS + JS 單檔，約 2600 行），無 build、無框架
- `assets/Tiger1.png`、`assets/Tiger2.png` — 測試照片
- `readme.md` — 本文件

## 設計風格

皮特·蒙德里安 / De Stijl：黑、白、紅 `#ED1C24`、黃 `#FFD800`、藍 `#1557E8`，粗黑框線格狀排版，無漸層。字型 Archivo Black（標題）+ Inter（內文），Google Fonts 載入。美術館編輯風。

## 使用流程

1. **首頁** — START 開始評分，或直接看 RANKING / ABOUT
2. **01 PHOTO** — 每側各可「TAKE PHOTO」（手機直接開後相機，`capture="environment"`）或「CHOOSE PHOTO」（相簿）。照片進入 9:16 裁切 modal：拖曳移動、滑桿縮放。正面 + 背面兩張都要
3. **02 CHECK** — 每張照片檢查：PHOTO LOADED / PERSON DETECTED / FULL BODY（人物是否佔滿畫面上下的替代判斷，非骨架偵測）。不合格會擋下並顯示「照片不完整，請重新拍攝」
4. **03 COLOR** — 選 RED 紅 / YELLOW 黃 / BLUE 藍
5. **04 ANALYZE** — START ANALYSIS 開始分析
6. **05 RESULT** — 分數動畫計數（900ms），公式 `(正面 + 背面) ÷ 2`，附 mask 視覺化（灰 = 人物但非目標色、黑 = 排除的背景、目標色 = 計入）。評語：≥80% 「GREAT!」+ 紅黃藍慶祝碎片動畫、≥50% 「NICE!」、<50% 「OHH...」+ 抖動
7. **06 SAVE** — 填名字 SAVE RESULT 留存，或 TRY AGAIN 重新評分（結果頁也有 CHANGE COLOR 可換色重算）
8. **RANKING** — 依顏色篩選排行榜，點進 detail 看完整結果；刪除需密碼（見下方）

## 評分標準 — COLOR_STANDARD_V3（單一真相來源）

`index.html` 內 `COLOR_STANDARD` 常數，版本字串 `COLOR_STANDARD_V3`。改範圍必須升版（V4…），舊結果保留當時版本。

- **人物分割**（雙模型）：
  - **主模型 RMBG-1.4**（Bria，Transformers.js 3.8.1 + ONNX，jsdelivr CDN）— 1024×1024 專業摳圖 matting 模型（~44MB，首次下載後瀏覽器快取），WebGPU 優先、失敗退 WASM，60 秒逾時。負責遮罩邊緣（髮絲、細肢）
  - **MediaPipe Image Segmenter**（Tasks Vision，`selfie_multiclass_256x256`，CPU delegate — GPU delegate 在 iOS Safari 會打亂類別順序）同時跑，三個用途：① 膚色類別（body-skin / face-skin）供皮膚規則用；② recall 修補 — RMBG 偶爾整塊漏掉穿著中的身體部位（抬起的手腳、手套、頭套），用「侵蝕 4px 後的 MediaPipe 內部區域」聯集回主遮罩（侵蝕把 MediaPipe 粗糙的 256×256 邊界帶削掉，邊界畫素仍由 RMBG 決定，不會把舊的混色邊界漂移問題帶回來）；③ RMBG 失敗時整張遮罩退回 MediaPipe
  - 只保留最大人物連通區塊，其他入鏡的人 / 東西一律當背景
  - **公平性規則**：兩個模型都載入失敗（如離線）→ 拒絕評分並顯示錯誤，**不**默默退回色彩啟發式分割（會讓背景色漏進分母、各紀錄不可比較）。結果頁 SEGMENTATION 欄標示來源：RMBG-1.4 / MEDIAPIPE / MIXED
- **色相判斷**（HSV）：
  - 🔴 RED：H 294°–360° 及 0°–20°
  - 🟡 YELLOW：H 35°–67°
  - 🔵 BLUE：H 180°–251°
  - 飽和度 `S ≥ 0.22`、明度 `V ≥ 0.12`（低於即不算，排除黑 / 白 / 灰）
- **皮膚規則**：臉 + 身體皮膚屬於人物（計入分母）。天然膚色（H 350°–50° 且 S < 0.62）不計分；塗色皮膚（高飽和）計分。藍色塗料不與膚色重疊
- **計分**：單張 = 目標色像素 ÷ 人物像素 × 100%。最終 = (正面 + 背面) ÷ 2，各佔 50%
- 分析解析度上限 1400px，CHECK 步驟用 480px 快速判斷

## 儲存

- `localStorage` key `colorpct_results_v1`，經 `storageManager` 抽象（未來可換 Supabase）
- 照片存檔前先降解析度 + 重新編碼，避免 base64 灌爆 localStorage 額度
- 刪除排行榜項目需密碼 `"0051"` — **明碼寫在 client 端 JS**，看原始碼即見。原型用，正式環境必須改伺服器端驗證

## 已知情況 / 限制

- RMBG-1.4（~44MB）、MediaPipe 模型（~16MB）與 Google Fonts 都需網路（模型下載後有瀏覽器快取）；完全離線時評分會被拒絕（MODEL_UNAVAILABLE，公平性規則，見上）
- TAKE PHOTO 的 `getUserMedia` / capture 行動版需 HTTPS 或 localhost
- 原始規格的「下載結果單張圖片檔」**未實作**（現只有留存 + 排行榜，無下載按鈕）
- `favicon.ico` 404，無害
