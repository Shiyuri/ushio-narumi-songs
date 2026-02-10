/* ========================================
   潮成実 歌まとめサイト - メインスクリプト
   ======================================== */

// 閲覧専用モード（ローカル以外では自動的に有効）
const READ_ONLY = !location.hostname.match(/^(localhost|127\.0\.0\.1)$/);

// 設定
const CONFIG = {
  itemsPerPage: 100,
  dataPath: 'data/songs.json'
};

// 状態管理
let allSongs = [];
let filteredSongs = [];
let displayedCount = 0;
let videoIdFilter = null;  // videoIdでのフィルタ状態
let savedModalContent = null;  // 削除確認時のモーダル復元用
let videoIdCountMap = {};  // videoId → 曲数のマップ（パフォーマンス用）

// 種類の表示名
const TYPE_LABELS = {
  video: '動画',
  utawaku: '歌枠',
  shorts: 'ショート',
  external: '外部チャンネル'
};

// 初期化
document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    await loadSongs();
    setupEventListeners();
    restoreFromUrl();
    applyFilters();
  } catch (error) {
    console.error('初期化エラー:', error);
    showError('データの読み込みに失敗しました');
  }
}

// データ読み込み
async function loadSongs() {
  const response = await fetch(CONFIG.dataPath, { cache: 'no-cache' });
  if (!response.ok) throw new Error('データ取得失敗');
  const data = await response.json();
  allSongs = data.songs || [];
  // videoId → 曲数マップを構築
  videoIdCountMap = {};
  allSongs.forEach(s => {
    videoIdCountMap[s.videoId] = (videoIdCountMap[s.videoId] || 0) + 1;
  });
  // 日付の新しい順にソート（YYYY-MM-DD形式なので文字列比較でOK）
  allSongs.sort((a, b) => b.date.localeCompare(a.date));
}

// イベントリスナー設定
function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortOrder = document.getElementById('sortOrder');
  const loadMoreBtn = document.getElementById('loadMoreBtn');

  if (searchInput) {
    searchInput.addEventListener('input', debounce(applyFilters, 200));
  }
  if (typeFilter) {
    typeFilter.addEventListener('change', applyFilters);
  }
  if (sortOrder) {
    sortOrder.addEventListener('change', applyFilters);
  }
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', loadMore);
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // '/' to focus search
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      searchInput?.focus();
    }
    // 'Escape' to clear filters
    if (e.key === 'Escape') {
      clearAllFilters();
    }
  });

  // スクロール監視（検索バー自動表示/非表示 + 無限スクロール）
  setupScrollHandlers();
}

// スクロール監視（モバイル検索バー自動表示/非表示 + 無限スクロール）
function setupScrollHandlers() {
  const searchArea = document.querySelector('.search-area');
  const isMobile = () => window.innerWidth <= 768;
  let lastScrollY = window.scrollY;
  let ticking = false;
  let loadingMore = false;

  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const currentY = window.scrollY;

      // モバイル: 検索エリア自動表示/非表示
      if (isMobile() && searchArea) {
        const delta = currentY - lastScrollY;
        if (delta > 10) {
          searchArea.classList.add('search-hidden');
        } else if (delta < -10) {
          searchArea.classList.remove('search-hidden');
        }
      }

      // 無限スクロール: ページ底から300px以内で次を読み込み
      const distanceToBottom = document.documentElement.scrollHeight - window.innerHeight - currentY;
      if (distanceToBottom < 300 && displayedCount < filteredSongs.length && !loadingMore) {
        loadingMore = true;
        loadMore();
        // DOM更新後にガード解除
        requestAnimationFrame(() => { loadingMore = false; });
      }

      lastScrollY = currentY;
      ticking = false;
    });
  }, { passive: true });
}

// フィルタ適用
function applyFilters() {
  const searchText = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const typeValue = document.getElementById('typeFilter')?.value || 'all';

  // モバイルでフィルタ操作時、検索エリアが隠れていたら表示する
  const searchArea = document.querySelector('.search-area');
  if (searchArea && searchArea.classList.contains('search-hidden')) {
    searchArea.classList.remove('search-hidden');
  }

  filteredSongs = allSongs.filter(song => {
    // videoIdフィルタ（配信全曲表示）
    if (videoIdFilter) {
      return song.videoId === videoIdFilter;
    }

    // 種類フィルタ
    if (typeValue !== 'all' && song.type !== typeValue) {
      return false;
    }

    // テキスト検索
    if (searchText) {
      // artistを配列として展開
      const artists = Array.isArray(song.artist) ? song.artist : [song.artist];
      const searchFields = [
        song.title,
        ...artists,
        song.notes,
        ...(song.collabWith || [])
      ].map(s => (s || '').toLowerCase());

      if (!searchFields.some(field => field.includes(searchText))) {
        return false;
      }
    }

    return true;
  });

  // ソート適用（YYYY-MM-DD形式なので文字列比較でOK）
  const sortValue = document.getElementById('sortOrder')?.value || 'date-desc';
  filteredSongs.sort((a, b) => {
    switch (sortValue) {
      case 'date-asc':
        return a.date.localeCompare(b.date);
      case 'date-desc':
      default:
        return b.date.localeCompare(a.date);
    }
  });

  displayedCount = 0;
  renderSongs(true);
  updateStats();
  updateClearButtons();
  updateUrl();
  updatePageTitle();
}

// クリアボタンの表示/非表示を更新
function updateClearButtons() {
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const clearAllBtn = document.getElementById('clearAllBtn');

  const hasSearch = searchInput && searchInput.value.trim() !== '';
  const hasTypeFilter = typeFilter && typeFilter.value !== 'all';
  const hasVideoIdFilter = videoIdFilter !== null;

  // 検索欄の×ボタン
  if (clearSearchBtn) {
    clearSearchBtn.style.display = hasSearch ? 'block' : 'none';
  }

  // クリアボタン（どちらかのフィルタが有効な場合に表示）
  if (clearAllBtn) {
    clearAllBtn.style.visibility = (hasSearch || hasTypeFilter || hasVideoIdFilter) ? 'visible' : 'hidden';
  }
}

// 検索をクリア
function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    applyFilters();
  }
}

// すべてのフィルタをクリア
function clearAllFilters() {
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');

  if (searchInput) searchInput.value = '';
  if (typeFilter) typeFilter.value = 'all';
  videoIdFilter = null;

  applyFilters();
  updateClearButtons();
}

// 配信単位でグルーピング
function groupSongsByStream(songs) {
  const groups = {};
  const orderedKeys = [];

  songs.forEach(song => {
    const key = song.videoId || 'unknown';
    if (!groups[key]) {
      groups[key] = {
        videoId: song.videoId,
        streamTitle: song.streamTitle || '(タイトル未取得)',
        date: song.date,
        type: song.type,
        songs: []
      };
      orderedKeys.push(key);
    }
    groups[key].songs.push(song);
  });

  // filteredSongsの順序を維持（既にソート済み）
  const sortedGroups = orderedKeys.map(key => groups[key]);

  sortedGroups.forEach(group => {
    group.songs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  });

  return sortedGroups;
}

// 曲一覧を描画（配信グループ単位、曲数でページネーション）
function renderSongs(reset = false) {
  const container = document.getElementById('songList');
  if (!container) return;

  if (reset) {
    container.innerHTML = '';
    displayedCount = 0;
  }

  if (filteredSongs.length === 0) {
    container.innerHTML = '<div class="no-results">該当する曲が見つかりません</div>';
    updateLoadMoreButton();
    return;
  }

  // 曲数ベースでページネーション
  const songsToShow = filteredSongs.slice(displayedCount, displayedCount + CONFIG.itemsPerPage);

  // 表示する曲を配信グループにまとめる
  const groupsToShow = groupSongsByStream(songsToShow);

  groupsToShow.forEach(group => {
    // 既存の同じvideoIdのセクションがあれば追加、なければ新規作成
    let existingSection = container.querySelector(`[data-video-id="${group.videoId}"]`);

    if (existingSection) {
      // 既存セクションに曲を追加
      group.songs.forEach(song => {
        existingSection.appendChild(createSongElement(song));
      });
    } else {
      // 新規セクション作成
      const section = createStreamCard(group);
      section.dataset.videoId = group.videoId;
      container.appendChild(section);
    }
  });

  displayedCount += songsToShow.length;
  updateLoadMoreButton();
}

// 配信セクションを作成（軽量なヘッダー + 曲リスト）
function createStreamCard(group) {
  const section = document.createElement('div');
  section.className = 'stream-section';

  const videoUrl = `https://www.youtube.com/watch?v=${group.videoId}`;

  // 配信全体の曲数を取得
  const totalSongsInStream = videoIdCountMap[group.videoId] || 0;
  const shownCount = group.songs.length;
  const songCountText = `${shownCount}/${totalSongsInStream} 曲`;

  // シンプルなヘッダー
  const header = document.createElement('div');
  header.className = 'stream-header';
  header.innerHTML = `
    <a href="${videoUrl}" target="_blank" rel="noopener" class="stream-title">${escapeHtml(group.streamTitle)}</a>
    <span class="stream-meta">
      <span class="tag tag-${group.type}" onclick="filterByType('${group.type}')">${TYPE_LABELS[group.type] || group.type}</span>
      <span class="stream-date">${formatDate(group.date)}</span>
      <span class="stream-song-count" onclick="filterByVideoId('${escapeForJs(group.videoId)}')" title="この配信の全曲を表示">${songCountText}</span>
    </span>
  `;
  section.appendChild(header);

  // 曲リスト（既存のスタイルそのまま）
  group.songs.forEach(song => {
    section.appendChild(createSongElement(song));
  });

  return section;
}

// 曲要素を作成
function createSongElement(song) {
  const div = document.createElement('div');
  div.className = 'song-item';
  div.dataset.id = song.id;

  const url = buildYouTubeUrl(song.videoId, song.timestamp);
  const timestampStr = formatTimestamp(song.timestamp);

  // コラボタグを生成
  let collabTags = '';
  if (song.collabWith && song.collabWith.length > 0) {
    collabTags = song.collabWith.map(name =>
      `<span class="tag tag-collab" onclick="searchByCollab('${escapeForJs(name)}')">${escapeHtml(name)}</span>`
    ).join('');
  }

  const acapellaTag = song.notes && song.notes.includes('アカペラ')
    ? '<span class="tag tag-acapella" onclick="filterByAcapella()">アカペラ</span>'
    : '';

  div.innerHTML = `
    <div class="song-info-left">
      <div class="song-title">
        <span onclick="filterByTitle('${escapeForJs(song.title)}')" class="clickable-title">${escapeHtml(song.title)}</span>
      </div>
      <div class="song-artist">
        ${formatArtist(song.artist)}
      </div>
      <div class="song-play-action">
        ${song.timestamp > 0
      ? `<a href="${url}" target="_blank" rel="noopener" class="timestamp timestamp-link"><span class="play-icon">▶</span>${timestampStr}</a>`
      : (song.videoId
        ? `<a href="https://www.youtube.com/watch?v=${encodeURIComponent(song.videoId)}" target="_blank" rel="noopener" class="timestamp timestamp-link"><span class="play-icon">▶</span>${(song.type === 'video' || song.type === 'shorts') ? '再生' : '配信'}</a>`
        : '')}
      </div>
    </div>

    <div class="song-info-right">
      <div class="song-date-time">
        <span class="date">${formatDate(song.date)}</span>
      </div>
      <div class="song-tags">
        ${song.type !== 'shorts' ? `<span class="tag tag-${song.type}" onclick="filterByType('${song.type}')">${TYPE_LABELS[song.type] || song.type}</span>` : ''}
        ${acapellaTag}
        ${collabTags}
      </div>
    </div>

    ${READ_ONLY ? '' : `<div class="song-actions">
      <button class="btn-icon" onclick="openEditModal(${song.id})">編集</button>
      <button class="btn-icon btn-delete" onclick="deleteSong(${song.id})">削除</button>
    </div>`}
  `;

  return div;
}

// もっと見る（無限スクロールから呼ばれる）
function loadMore() {
  renderSongs(false);
}

// もっと見るボタン更新（無限スクロールにより通常は非表示）
function updateLoadMoreButton() {
  const btn = document.getElementById('loadMoreBtn');
  if (!btn) return;
  // 無限スクロールがあるのでボタンは常に非表示
  btn.style.display = 'none';
}

// 統計更新
function updateStats() {
  const statsEl = document.getElementById('stats');
  if (!statsEl) return;
  statsEl.textContent = `${filteredSongs.length}/${allSongs.length} 曲`;
}

// ページタイトルにフィルタ状態を反映
const BASE_TITLE = '潮成実 歌まとめ';
function updatePageTitle() {
  const searchInput = document.getElementById('searchInput');
  const searchText = searchInput ? searchInput.value.trim() : '';

  let newTitle;
  if (videoIdFilter) {
    const firstSong = filteredSongs[0];
    const streamName = firstSong?.streamTitle || videoIdFilter;
    newTitle = `${streamName} - ${BASE_TITLE}`;
  } else if (searchText) {
    newTitle = `${searchText} - ${BASE_TITLE}`;
  } else {
    newTitle = BASE_TITLE;
  }

  if (document.title !== newTitle) {
    document.title = newTitle;
  }
}

// タグクリックで種類フィルタ
function filterByType(type) {
  const select = document.getElementById('typeFilter');
  if (select) {
    select.value = type;
    applyFilters();
  }
}

// 曲名で絞り込み
function filterByTitle(title) {
  const searchInput = document.getElementById('searchInput');
  // エスケープ文字が混ざっている可能性があるため、デコードしてからセット
  const decodedTitle = title.replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/'/g, "'"); // Changed &#039; to ' for direct replacement

  searchInput.value = decodedTitle;
  applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// コラボ相手で検索
function searchByCollab(name) {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = name;
    applyFilters();
  }
}

// 配信の全曲を表示（曲数クリック時）
function filterByVideoId(videoId) {
  // 検索・フィルタをクリア
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  if (searchInput) searchInput.value = '';
  if (typeFilter) typeFilter.value = 'all';

  // videoIdフィルタを設定
  videoIdFilter = videoId;

  applyFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// アカペラでフィルタ
function filterByAcapella() {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = 'アカペラ';
    applyFilters();
  }
}

// アーティストで検索
function searchByArtist(name) {
  const input = document.getElementById('searchInput');
  if (input) {
    input.value = name;
    applyFilters();
  }
}

// ========================================
// URL状態管理
// ========================================

// URLパラメータに検索状態を反映
function updateUrl() {
  const params = new URLSearchParams();
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortOrder = document.getElementById('sortOrder');

  if (videoIdFilter) {
    params.set('vid', videoIdFilter);
  } else {
    if (searchInput && searchInput.value.trim()) {
      params.set('q', searchInput.value.trim());
    }
    if (typeFilter && typeFilter.value !== 'all') {
      params.set('type', typeFilter.value);
    }
  }
  if (sortOrder && sortOrder.value !== 'date-desc') {
    params.set('sort', sortOrder.value);
  }

  const qs = params.toString();
  const newUrl = qs ? `${location.pathname}?${qs}` : location.pathname;
  // 現在と同じURLなら更新しない（Simple Browser等でのリロードループ防止）
  if (newUrl !== location.pathname + location.search) {
    history.replaceState(null, '', newUrl);
  }
}

// URLパラメータから検索状態を復元
function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const searchInput = document.getElementById('searchInput');
  const typeFilter = document.getElementById('typeFilter');
  const sortOrder = document.getElementById('sortOrder');

  if (params.has('vid')) {
    videoIdFilter = params.get('vid');
  } else {
    if (params.has('q') && searchInput) {
      searchInput.value = params.get('q');
    }
    if (params.has('type') && typeFilter) {
      typeFilter.value = params.get('type');
    }
  }
  if (params.has('sort') && sortOrder) {
    sortOrder.value = params.get('sort');
  }
}

// ========================================
// ユーティリティ関数
// ========================================

// アーティストをフォーマット（配列 → クリック可能なリンク）
function formatArtist(artist) {
  if (Array.isArray(artist)) {
    return artist.map(a =>
      `<span class="artist-link" onclick="searchByArtist('${escapeForJs(a)}')">${escapeHtml(a)}</span>`
    ).join(' / ');
  }
  if (artist) {
    return `<span class="artist-link" onclick="searchByArtist('${escapeForJs(artist)}')">${escapeHtml(artist)}</span>`;
  }
  return '';
}

// YouTube URL生成
function buildYouTubeUrl(videoId, timestamp) {
  let url = `https://www.youtube.com/watch?v=${videoId}`;
  if (timestamp && timestamp > 0) {
    url += `&t=${timestamp}s`;
  }
  return url;
}

// タイムスタンプをフォーマット（秒 → h:mm:ss）
function formatTimestamp(seconds) {
  if (!seconds || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 日付フォーマット
function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}/${m}/${d}`;
}

// HTMLエスケープ
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// JavaScriptの文字列リテラル用エスケープ（onclick等で使用）
function escapeForJs(str) {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

// デバウンス
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// エラー表示
function showError(message) {
  const container = document.getElementById('songList');
  if (container) {
    container.innerHTML = `<div class="no-results">${escapeHtml(message)}</div>`;
  }
}

// ========================================
// 編集・削除機能
// ========================================

// 編集モーダルを開く
function openEditModal(id) {
  const song = allSongs.find(s => s.id === id);
  if (!song) return;

  document.getElementById('editId').value = song.id;
  document.getElementById('editTitle').value = song.title;
  document.getElementById('editArtist').value = Array.isArray(song.artist) ? song.artist.join(', ') : song.artist;
  document.getElementById('editType').value = song.type;
  document.getElementById('editDate').value = song.date;
  document.getElementById('editVideoId').value = song.videoId;
  document.getElementById('editTimestamp').value = song.timestamp || 0;
  document.getElementById('editStreamTitle').value = song.streamTitle || '';
  document.getElementById('editCollabWith').value = (song.collabWith || []).join(', ');
  document.getElementById('editNotes').value = song.notes || '';

  document.getElementById('editModal').classList.add('modal-active');
}

// 編集モーダルを閉じる
function closeEditModal() {
  const modal = document.getElementById('editModal');
  modal.classList.remove('modal-active');

  // 削除確認で上書きした内容を復元
  if (savedModalContent) {
    modal.querySelector('.modal-content').innerHTML = savedModalContent;
    savedModalContent = null;
  }
}

// 編集を保存
async function saveEdit() {
  const id = parseInt(document.getElementById('editId').value);
  const artistStr = document.getElementById('editArtist').value.trim();
  const collabStr = document.getElementById('editCollabWith').value.trim();

  const songData = {
    id: id,
    title: document.getElementById('editTitle').value.trim(),
    artist: artistStr ? artistStr.split(',').map(s => s.trim()).filter(s => s) : [],
    type: document.getElementById('editType').value,
    date: document.getElementById('editDate').value,
    videoId: document.getElementById('editVideoId').value.trim(),
    timestamp: parseInt(document.getElementById('editTimestamp').value) || 0,
    streamTitle: document.getElementById('editStreamTitle').value.trim(),
    collabWith: collabStr ? collabStr.split(',').map(s => s.trim()).filter(s => s) : [],
    notes: document.getElementById('editNotes').value.trim()
  };

  try {
    const response = await fetch('/api/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(songData)
    });

    const result = await response.json();
    if (result.success) {
      closeEditModal();
      await loadSongs();
      applyFilters();
    } else {
      alert('エラー: ' + result.message);
    }
  } catch (e) {
    alert('サーバーエラー: ' + e.message);
  }
}

// 曲を削除
async function deleteSong(id) {
  const song = allSongs.find(s => s.id === id);
  if (!song) return;

  // 削除確認（confirmの代わりにカスタム確認）
  openDeleteConfirm(id, song.title);
}

// 削除確認モーダル
function openDeleteConfirm(id, title) {
  const modal = document.getElementById('editModal');
  const content = modal.querySelector('.modal-content');

  // 元の内容を保存してから上書き
  savedModalContent = content.innerHTML;
  content.innerHTML = `
    <h3>削除確認</h3>
    <p style="margin: 1rem 0;">「${escapeHtml(title)}」を削除しますか？</p>
    <div class="modal-buttons">
      <button class="btn btn-delete-confirm" onclick="confirmDelete(${id})">削除</button>
      <button class="btn btn-secondary" onclick="closeEditModal()">キャンセル</button>
    </div>
  `;

  modal.classList.add('modal-active');
}

// 削除実行
async function confirmDelete(id) {
  try {
    const response = await fetch('/api/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: id })
    });

    const result = await response.json();
    if (result.success) {
      // まずモーダルを閉じる
      closeEditModal();

      // ローカルデータからも削除して即座に反映
      allSongs = allSongs.filter(s => s.id !== id);
      applyFilters();

    } else {
      alert('エラー: ' + result.message);
    }
  } catch (e) {
    alert('サーバーエラー: ' + e.message);
  }
}

// モーダル外クリックで閉じる
document.addEventListener('click', function (e) {
  const modal = document.getElementById('editModal');
  if (e.target === modal) {
    closeEditModal();
  }
});
