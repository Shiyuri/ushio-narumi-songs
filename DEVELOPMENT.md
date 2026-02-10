# 潮成実 歌まとめサイト — 開発ドキュメント

## Status Snapshot

<!-- Agent間引き継ぎ用の圧縮ステータス。詳細は各セクション参照。 -->
<!-- 更新タイミング: ENTRIES/SZ=曲追加時, STATE=コミット時, TS=上記いずれか更新時 -->
<!-- STACK/ACCESS/DECLINED等=構成変更時のみ -->

```
TS:2026-02-10|ST:uta|T:vtuber-song-db|V:1|FILES:10|LOC:21500
STACK:html+css+js|py-httpserver:3000|yt-dlp
DATA:songs.json|ENTRIES:1776|REM_EST:~370|TOTAL_EST:~2150|SZ:750KB
SCH:{title,artist[],type,date,videoId,timestamp,collabWith[],notes,id,streamTitle}
ACCESS:RO|RW:localhost|DEPLOY:gh-pages|FLOW:local>commit>push
COMPLETED:review*5,mobile,modal-css,cache,pagetitle,tagcolor,bugfix*5,table-view,scroll-search-toggle,font-unify,auto-backup,infinite-scroll
DECLINED:ogp,footer,stats,pushstate,streamtitle-search,song-sort
STATE:v1@7e96294|NEXT:song-entry(remaining~370songs)
```

---

## プロジェクト概要

VTuber「潮成実（うしお なるみ）」の歌唱楽曲をまとめたファンサイト。
歌枠・MV・ショート・外部コラボ等の楽曲を検索・閲覧できる。

- **種別**: 静的ファンサイト（非公式）
- **技術スタック**: HTML / CSS / JavaScript（バニラ、フレームワークなし）
- **開発用バックエンド**: Python `http.server`（ポート 3000）+ yt-dlp
- **データ**: `data/songs.json`（フラット JSON）

---

## ファイル構成

```
├── index.html          # メインページ（曲一覧・検索・編集モーダル）
├── list.html           # 一覧表（ソート可能なフラットテーブル）
├── add.html            # 曲追加フォーム（ローカル専用）
├── server.py           # 開発用サーバー（CRUD API + yt-dlp）
├── DEVELOPMENT.md      # このファイル
├── css/
│   └── style.css       # 全体のスタイル
├── js/
│   ├── app.js          # メインスクリプト（検索・フィルタ・レンダリング・編集）
│   └── add.js          # 曲追加スクリプト（URL解析・オートコンプリート）
└── data/
    └── songs.json      # 楽曲データベース
```

---

## 公開方針

### ホスティング

- **GitHub Pages** を予定（静的ホスティング、API不要）
- 代替候補: Cloudflare Pages, Netlify（いずれも同等、要件に差なし）

### 運用フロー（A案 採用）

```
ローカルで server.py + add.html を使って曲を追加
  ↓ songs.json が更新される
  ↓ git commit & push
  ↓ GitHub Pages が自動反映
```

- add.html / server.py は**公開しない**（ローカルツールとして使用）
- 公開サイトは**閲覧専用**

### 公開時のデプロイ対象

| ファイル | デプロイ | 備考 |
|----------|----------|------|
| index.html | ✅ | 閲覧専用モードで自動動作 |
| list.html | ✅ | シンプル表示ページ |
| css/style.css | ✅ | |
| js/app.js | ✅ | READ_ONLY フラグで自動切替 |
| data/songs.json | ✅ | |
| add.html | ❌ | ローカル専用 |
| js/add.js | ❌ | ローカル専用 |
| server.py | ❌ | ローカル専用 |

### READ_ONLY モード（実装済み）

```js
const READ_ONLY = !location.hostname.match(/^(localhost|127\.0\.0\.1)$/);
```

- ローカル → 自動で編集可能
- 公開サイト → 自動で閲覧専用（編集/削除ボタン非表示、「曲を追加」リンク非表示、編集モーダル非表示）
- git push 時にコード変更は**一切不要**

---

## データ仕様

### songs.json 構造

```json
{
  "title": "曲名",
  "artist": ["アーティスト名"],
  "type": "utawaku | video | shorts | external",
  "date": "YYYY-MM-DD",
  "videoId": "YouTube動画ID",
  "timestamp": 0,
  "collabWith": ["コラボ相手"],
  "notes": "備考",
  "id": 1,
  "streamTitle": "配信タイトル"
}
```

### データ規模（2026年2月時点）

| 項目 | 値 |
|------|-----|
| 曲数 | 約 1,289 曲（全体の約 3/5） |
| ファイルサイズ | 518 KB |
| 1曲あたり | 約 0.4 KB |
| 更新頻度 | 週 2〜3 回、1回あたり約 10 曲 |

### サイズ予測

- 全量完了時: 約 2,150 曲 → 約 860 KB
- 年間増加: +520 曲 → +208 KB
- 5年後でも約 2 MB（問題なし。分割・gzip 等の対策は不要）

---

## API エンドポイント（ローカル server.py のみ）

| メソッド | パス | 用途 |
|----------|------|------|
| POST | `/api/add` | 曲追加 |
| POST | `/api/update` | 曲編集 |
| POST | `/api/delete` | 曲削除 |
| GET | `/api/video-info?url=...` | yt-dlp で YouTube メタデータ取得 |
| POST | `/api/batch-update-titles` | streamTitle 一括更新 |

---

## コードレビュー対応履歴

### 第1回レビュー（16件）

| # | 内容 | 対応 |
|---|------|------|
| 1 | `updateClearButton` 未定義エラー | ✅ `updateClearButtons` に統合 |
| 2 | `loadSongs` のエラーハンドリング不足 | ✅ try-catch 追加 |
| 3 | videoId の `filterByVideoId` で `allSongs` 参照 | ✅ `filteredSongs` 連携に修正 |
| 4 | CSS で重複 `.timestamp` 定義 | ✅ 重複削除 |
| 5 | 削除確認でモーダル内容が壊れる | ✅ `savedModalContent` で復元 |
| 6 | XSS 対策なし | ✅ `escapeHtml()` 追加 |
| 7 | サーバー側バリデーションなし | ✅ `_validate_song()` 追加 |
| 8 | ファイルロックなし | ✅ `threading.Lock` 追加 |
| 9 | add.html のインラインスクリプト肥大 | ✅ `js/add.js` に分離 |
| 10 | fetchVideoInfo の重複呼び出し | 現状維持（実害少） |
| 11 | フォントの不整合 | ✅ LINE Seed JP + Inter に統一 |
| 12 | キャッシュバスター不統一 | ✅ `?v=2` に統一 |
| 13 | 曲名ソートなし | ❌ 除外（配信グループが崩れる） |
| 14 | streamTitle 検索 | ❌ 除外（アーティスト名が多数ヒットし実用性低い） |
| 15 | itemsPerPage 過多 | ✅ 100 に削減 |
| 16 | CSS disclaimer margin | ✅ 修正 |

### 第2回提案（8件）

| # | 内容 | 対応 |
|---|------|------|
| 1 | URL ステート保持 | ✅ `replaceState` で実装 |
| 2 | filterByTitle 完全一致 | 現状維持（部分一致が実用的） |
| 3 | 統計表示 | ❌ 除外（ユーザー判断） |
| 4 | videoIdCountMap 事前計算 | ✅ 実装済み |
| 5 | 日付ソート最適化 | ✅ 文字列比較に変更 |
| 6 | batch-update のロック修正 | ✅ インデントバグ修正 |
| 7 | favicon | 将来対応 |
| 8 | add.html の閉じタグ修正 | ✅ 修正済み |

### 第3回提案（5件）

| # | 内容 | 対応 |
|---|------|------|
| 1 | `formatDate` 最適化 | ✅ `new Date()` → 文字列 split |
| 2 | pushState vs replaceState | 現状維持（replaceState） |
| 3 | 歌枠 t=0 に再生ボタン | ✅ 全曲に ▶ リンク表示 |
| 4 | 編集モーダルに streamTitle | ✅ フィールド追加 |
| 5 | 時間→秒変換ツール配置移動 | ✅ タイムスタンプ横に移動 |

### 公開対応

| # | 内容 | 対応 |
|---|------|------|
| 1 | READ_ONLY モード | ✅ URL ベース自動判定で実装 |

### 第4回 モバイル対応レビュー（10件）

| # | 内容 | 対応 |
|---|------|------|
| 1 | メディアクエリ散在（6箇所） | ✅ 1箇所に統合 |
| 2 | 曲名が操作ボタンに重なる | ✅ `padding-right: 80px`（READ_ONLY）/ `170px`（管理時）|
| 3 | 「もっと読み込む」ボタン幅 | ✅ モバイルで `width: 100%` |
| 4 | フィルターselect高さ不足 | ✅ `height: 44px` に拡大 |
| 5 | モーダル横はみ出し | ✅ `box-sizing: border-box` 確認済み |
| 6 | フォントサイズ小 | 現状維持（14px で十分） |
| 7 | 配信ヘッダー長い | 現状維持（折り返しで対応） |
| 8 | フィルター固定表示 | ❌ 除外（スクロールで十分） |
| 9 | タップ領域小 | 現状維持（44px 確保済み） |
| 10 | 横スクロール発生 | ✅ `overflow-x: hidden` 確認済み |

### 第5回 仕上げ（v1 確定前）

| # | 内容 | 対応 |
|---|------|------|
| 1 | ローディングスピナー | ✅ 曲一覧読み込み中にスピナー表示 |
| 2 | `<meta name="description">` | ✅ index.html に追加 |
| 3 | モーダル CSS 統合 | ✅ `display:none` + `.modal-active` で `display:flex`（classList 切替）|
| 4 | `admin-only` クラス修正 | ✅ モーダルに `class="modal admin-only"` 追加 |
| 5 | fetch に `cache: 'no-cache'` | ✅ 公開環境でのキャッシュ問題対策 |
| 6 | 動的ページタイトル | ✅ `updatePageTitle()` — 検索・フィルタ条件をタイトルに反映 |
| 7 | タグ色の差別化 | ✅ shorts タグを赤→オレンジ (`#e67e22`) に変更 |
| 8 | 配信ヘッダー左ボーダー | ✅ 削除（シンプル化） |
| 9 | ナビゲーション非表示 | ✅ READ_ONLY 時は `<nav>` 全体を非表示 |
| 10 | キャッシュバスター更新 | ✅ `?v=2` → `?v=3` |

### バグ修正

| # | 内容 | 原因 | 対応 |
|---|------|------|------|
| 1 | 無限リロード（1回目） | `history.replaceState` が Simple Browser で連鎖 | ✅ URL 比較ガード追加 |
| 2 | 無限リロード（2回目） | app.js 347行目テンプレートリテラルのバッククォート位置ずれ | ✅ バッククォート修正 |
| 3 | onclick 二重エスケープ | `escapeHtml(escapeForJs(...))` で文字化け | ✅ `escapeForJs()` のみに修正 |
| 4 | `--color-accent` 未定義 | CSS 変数が存在しない | ✅ `--color-primary` に修正 |

---

## 既知の設計判断

- **replaceState を採用**: pushState はページ遷移操作が壊れるリスクあり
- **songs.json 分割不要**: 5年後でも 2 MB 程度。gzip 転送で実質数百 KB
- **streamTitle 検索は実装しない**: 配信タイトルにアーティスト名等が含まれ、ノイズが多すぎる
- **曲名ソートは実装しない**: 配信ごとのグループ表示が崩壊する
- **OGP メタタグは不要**: 「質実剛健なサイトで行こう」— シンプルな description のみ
- **フッターは不要**: 必要な情報は disclaimer で十分
- **統計表示は不要**: ユーザー判断で除外

---

## ブランチ運用

| ブランチ | 用途 | 運用 |
|----------|------|------|
| `main` | 公開 + 日常作業 | songs.json 追加は直接 commit & push |
| `feat/*` | コード変更時のみ | 機能追加・CSS 変更等。完了後 main にマージして削除 |

- GitHub Pages は `main` からデプロイ
- 曲データ追加（日常作業）は `main` 直接。ブランチ不要
- コードに手を入れるときだけ `feat/xxx` で分離

---

## ローカル開発

```bash
# Python 仮想環境（Windows）
cd C:\uta
.venv\Scripts\activate

# サーバー起動
python server.py
# → http://localhost:3000

# 依存: yt-dlp（YouTube メタデータ取得用）
pip install yt-dlp
```
