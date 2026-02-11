/* ========================================
   潮成実 歌まとめサイト - 曲追加スクリプト
   ======================================== */

// 今日の日付をデフォルトに設定
document.getElementById('date').valueAsDate = new Date();

// 前回のコラボ相手をlocalStorageから復元
const savedCollab = localStorage.getItem('lastCollabWith');
if (savedCollab) {
  document.getElementById('collabWith').value = savedCollab;
}

// 現在のIDを取得（実際にはsongs.jsonから読み込んで最大値+1にする）
let nextId = 1;

// 曲名→アーティストのマッピング（既存データから学習）
let songArtistMap = {};
let allArtists = new Set();
let allTitles = new Set();

// 初期化時に既存データからIDとマッピングを取得
fetch('data/songs.json')
  .then(res => res.json())
  .then(data => {
    if (data.songs && data.songs.length > 0) {
      nextId = Math.max(...data.songs.map(s => s.id)) + 1;

      // 曲名→アーティストのマッピングを構築
      data.songs.forEach(song => {
        const titleLower = song.title.toLowerCase();
        // artistが配列の場合に対応
        const artists = Array.isArray(song.artist) ? song.artist : [song.artist];
        const artistStr = artists.join(', ');

        if (!songArtistMap[titleLower]) {
          songArtistMap[titleLower] = [];
        }
        if (!songArtistMap[titleLower].includes(artistStr)) {
          songArtistMap[titleLower].push(artistStr);
        }
        // 個々のアーティストも候補に追加
        artists.forEach(a => allArtists.add(a));
        allTitles.add(song.title);
      });

      // 曲名候補を設定
      updateTitleSuggestions();
      // アーティスト候補を設定
      updateArtistSuggestions();
    }
  })
  .catch(() => {
    nextId = 1;
  });

// 曲名候補を更新
function updateTitleSuggestions() {
  const datalist = document.getElementById('titleSuggestions');
  datalist.innerHTML = '';
  allTitles.forEach(title => {
    const option = document.createElement('option');
    option.value = title;
    datalist.appendChild(option);
  });
}

// アーティスト候補を更新
function updateArtistSuggestions() {
  const datalist = document.getElementById('artistSuggestions');
  datalist.innerHTML = '';
  allArtists.forEach(artist => {
    const option = document.createElement('option');
    option.value = artist;
    datalist.appendChild(option);
  });
}

// 曲名入力時にアーティストを予測
document.getElementById('title').addEventListener('input', function () {
  const title = this.value.trim().toLowerCase();
  const hintEl = document.getElementById('artistHint');
  const artistInput = document.getElementById('artist');

  if (songArtistMap[title] && songArtistMap[title].length > 0) {
    const artists = songArtistMap[title];
    hintEl.textContent = '💡 過去のデータ: ' + artists.join(', ');
    hintEl.style.display = 'block';

    // アーティスト欄が空なら自動入力
    if (!artistInput.value.trim()) {
      artistInput.value = artists[0];
    }
  } else {
    hintEl.style.display = 'none';
  }
});

// YouTube URL解析
let fetchTimeout = null;
const youtubeUrlInput = document.getElementById('youtubeUrl');

function handleYoutubeUrl() {
  const url = youtubeUrlInput.value.trim();
  const result = parseYoutubeUrl(url);

  if (result.videoId) {
    document.getElementById('videoId').value = result.videoId;
    document.getElementById('timestamp').value = result.timestamp;
    updateTimestampDisplay(result.timestamp);

    // 日付を自動取得（デバウンス処理）
    clearTimeout(fetchTimeout);
    fetchTimeout = setTimeout(() => fetchVideoInfo(url), 500);
  }
}

youtubeUrlInput.addEventListener('input', handleYoutubeUrl);
youtubeUrlInput.addEventListener('paste', function () {
  // pasteイベントは値が反映される前に発火するので少し待つ
  setTimeout(handleYoutubeUrl, 100);
});

// 動画情報をサーバーから取得して日付を自動入力
async function fetchVideoInfo(url) {
  const dateInput = document.getElementById('date');
  const statusEl = document.getElementById('statusMessage');

  try {
    statusEl.textContent = '📡 日付取得中...';
    statusEl.style.color = '#666';

    const res = await fetch('/api/video-info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();

    if (data.success && data.uploadDate) {
      dateInput.value = data.uploadDate;
      statusEl.textContent = '✅ 日付を自動入力しました';
      statusEl.style.color = 'green';
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } else {
      statusEl.textContent = '⚠️ 日付取得できず';
      statusEl.style.color = 'orange';
    }
  } catch (e) {
    console.error('動画情報取得エラー:', e);
    statusEl.textContent = '';
  }
}

// タイムスタンプ手動変更時
document.getElementById('timestamp').addEventListener('input', function () {
  updateTimestampDisplay(parseInt(this.value) || 0);
});

// タイムスタンプ表示を更新
function updateTimestampDisplay(seconds) {
  const display = document.getElementById('timestampDisplay');
  if (seconds <= 0) {
    display.textContent = '0:00';
    return;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    display.textContent = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  } else {
    display.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }
}

// YouTube URL解析関数
function parseYoutubeUrl(url) {
  let videoId = '';
  let timestamp = 0;

  try {
    // 短縮URL: https://youtu.be/VIDEO_ID?t=SECONDS (list等の余計なパラメータを無視)
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) {
      videoId = shortMatch[1];
      const timeMatch = url.match(/[?&]t=(\d+)s?/);
      if (timeMatch) {
        timestamp = parseInt(timeMatch[1]) || 0;
      }
      return { videoId, timestamp };
    }

    // 通常URL: https://www.youtube.com/watch?v=VIDEO_ID&t=SECONDSs
    const longMatch = url.match(/youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]+)/);
    if (longMatch) {
      videoId = longMatch[1];

      // タイムスタンプを探す（t=123 または t=123s）
      const timeMatch = url.match(/[?&]t=(\d+)s?/);
      if (timeMatch) {
        timestamp = parseInt(timeMatch[1]) || 0;
      }
      return { videoId, timestamp };
    }

    // Shorts URL: https://www.youtube.com/shorts/VIDEO_ID
    const shortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      videoId = shortsMatch[1];
      return { videoId, timestamp };
    }

    // 動画IDのみの場合
    const idOnly = url.match(/^([a-zA-Z0-9_-]{11})$/);
    if (idOnly) {
      videoId = idOnly[1];
      return { videoId, timestamp };
    }
  } catch (e) {
    console.error('URL解析エラー:', e);
  }

  return { videoId, timestamp };
}

// 追加履歴
const addedSongs = [];

// 曲を追加（サーバーに送信）
async function addSong() {
  const title = document.getElementById('title').value.trim();
  const artist = document.getElementById('artist').value.trim();
  const type = document.getElementById('type').value;
  const date = document.getElementById('date').value;
  const videoId = document.getElementById('videoId').value.trim();
  const timestamp = parseInt(document.getElementById('timestamp').value) || 0;
  const collabWithStr = document.getElementById('collabWith').value.trim();
  const notes = document.getElementById('notes').value.trim();

  // バリデーション
  if (!title || !artist || !date || !videoId) {
    showStatus('必須項目を入力してください', 'error');
    return;
  }

  // コラボ相手を配列に変換
  const collabWith = collabWithStr
    ? collabWithStr.split(',').map(s => s.trim()).filter(s => s)
    : [];

  // アーティストを配列に変換
  const artistArray = artist.split(',').map(s => s.trim()).filter(s => s);

  const songData = {
    title: title,
    artist: artistArray,
    type: type,
    date: date,
    videoId: videoId,
    timestamp: timestamp,
    collabWith: collabWith,
    notes: notes
  };

  // ボタンを無効化
  const btn = document.getElementById('addBtn');
  btn.disabled = true;
  btn.textContent = '追加中...';

  try {
    const response = await fetch('/api/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(songData)
    });

    const result = await response.json();

    if (result.success) {
      showStatus(`✓ 追加しました (ID: ${result.id})`, 'success');

      // コラボ相手をlocalStorageに保存
      localStorage.setItem('lastCollabWith', collabWithStr);

      // 履歴に追加
      addedSongs.unshift({ ...songData, id: result.id });
      updateHistory();

      // 候補リストを更新
      allTitles.add(title);
      // 個々のアーティストを候補に追加
      artistArray.forEach(a => allArtists.add(a));
      const titleLower = title.toLowerCase();
      if (!songArtistMap[titleLower]) {
        songArtistMap[titleLower] = [];
      }
      if (!songArtistMap[titleLower].includes(artist)) {
        songArtistMap[titleLower].push(artist);
      }
      updateTitleSuggestions();
      updateArtistSuggestions();

      // フォームをクリア（日付とタイプは維持）
      document.getElementById('title').value = '';
      document.getElementById('artist').value = '';
      document.getElementById('youtubeUrl').value = '';
      document.getElementById('videoId').value = '';
      document.getElementById('timestamp').value = '0';
      document.getElementById('timestampDisplay').textContent = '0:00';
      // collabWithは保持する（連続追加時に便利）
      document.getElementById('notes').value = '';
      document.getElementById('artistHint').style.display = 'none';

      // 曲名にフォーカス
      document.getElementById('title').focus();
    } else {
      showStatus('エラー: ' + result.message, 'error');
    }
  } catch (e) {
    showStatus('サーバーエラー: ' + e.message, 'error');
  }

  btn.disabled = false;
  btn.textContent = '追加';
}

// ステータスメッセージを表示
function showStatus(message, type) {
  const el = document.getElementById('statusMessage');
  el.textContent = message;
  el.style.color = type === 'error' ? '#c62828' : '#2e7d32';
  setTimeout(() => { el.textContent = ''; }, 5000);
}

// 履歴を更新
function updateHistory() {
  const container = document.getElementById('historyList');
  const area = document.getElementById('historyArea');

  if (addedSongs.length === 0) {
    area.style.display = 'none';
    return;
  }

  area.style.display = 'block';
  container.innerHTML = addedSongs.map(song => `
    <div style="padding: 0.5rem 0; border-bottom: 1px solid #eee; font-size: 0.85rem;">
      <strong>${escapeHtml(song.title)}</strong> - ${formatArtist(song.artist)}
      <span style="color: #888; margin-left: 0.5rem;">(ID: ${song.id})</span>
    </div>
  `).join('');
}

// アーティストをフォーマット（配列対応）
function formatArtist(artist) {
  if (Array.isArray(artist)) {
    return artist.map(a => escapeHtml(a)).join(' / ');
  }
  return escapeHtml(artist || '');
}

// HTMLエスケープ
function escapeHtml(str) {
  if (!str) return '';
  if (typeof str !== 'string') return String(str);
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function clearForm() {
  document.getElementById('title').value = '';
  document.getElementById('artist').value = '';
  document.getElementById('type').value = 'video';
  document.getElementById('date').valueAsDate = new Date();
  document.getElementById('youtubeUrl').value = '';
  document.getElementById('videoId').value = '';
  document.getElementById('timestamp').value = '0';
  document.getElementById('timestampDisplay').textContent = '0:00';
  document.getElementById('collabWith').value = '';
  document.getElementById('notes').value = '';
  document.getElementById('artistHint').style.display = 'none';
}

// 時間変換ヘルパー
function openTimestampHelper() {
  document.getElementById('timestampHelper').style.display = 'block';
}

function closeTimestampHelper() {
  document.getElementById('timestampHelper').style.display = 'none';
}

function applyTimestamp() {
  const hours = parseInt(document.getElementById('helpHours').value) || 0;
  const minutes = parseInt(document.getElementById('helpMinutes').value) || 0;
  const seconds = parseInt(document.getElementById('helpSeconds').value) || 0;
  const totalSeconds = hours * 3600 + minutes * 60 + seconds;
  document.getElementById('timestamp').value = totalSeconds;
  updateTimestampDisplay(totalSeconds);
  closeTimestampHelper();
}
