"""
潮成実 歌まとめサイト - ローカルサーバー
曲の追加API付き
"""

import json
import os
import sys
import re
import shutil
import threading
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import parse_qs
import yt_dlp

PORT = 3000
DATA_FILE = 'data/songs.json'
BACKUP_FILE = DATA_FILE + '.bak'
data_lock = threading.Lock()

def backup_data():
    """保存前にバックアップを作成（1世代）"""
    if os.path.exists(DATA_FILE):
        shutil.copy2(DATA_FILE, BACKUP_FILE)

class SongHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        # 通常のログ出力
        sys.stderr.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format % args))

    def handle_one_request(self):
        try:
            super().handle_one_request()
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            # クライアントが接続を切断した場合は無視
            pass

    def do_POST(self):
        if self.path == '/api/add':
            self.handle_add_song()
        elif self.path == '/api/update':
            self.handle_update_song()
        elif self.path == '/api/delete':
            self.handle_delete_song()
        elif self.path == '/api/video-info':
            self.handle_video_info()
        elif self.path == '/api/batch-update-titles':
            self.handle_batch_update_titles()
        else:
            self.send_error(404, 'Not Found')

    def get_stream_title_for_video(self, video_id, existing_songs):
        """既存データから streamTitle を取得、なければ yt-dlp で取得"""
        # 既存の曲から同じvideoIdのstreamTitleを探す
        for song in existing_songs:
            if song.get('videoId') == video_id and song.get('streamTitle'):
                return song['streamTitle']
        
        # なければ yt-dlp で取得
        try:
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
                return info.get('title', '')
        except Exception:
            return ''

    def _validate_song(self, song, require_all=True):
        """曲データのバリデーション"""
        errors = []
        if require_all:
            for field in ('title', 'artist', 'date', 'videoId'):
                if not song.get(field):
                    errors.append(f'{field} は必須です')
        # videoId の形式チェック（英数字・ハイフン・アンダースコアのみ）
        video_id = song.get('videoId', '')
        if video_id and not re.match(r'^[a-zA-Z0-9_-]+$', video_id):
            errors.append('videoId の形式が不正です')
        # date の形式チェック
        date_val = song.get('date', '')
        if date_val and not re.match(r'^\d{4}-\d{2}-\d{2}$', date_val):
            errors.append('date は YYYY-MM-DD 形式で指定してください')
        # type のチェック
        valid_types = ('video', 'utawaku', 'shorts', 'external')
        if song.get('type') and song['type'] not in valid_types:
            errors.append(f'type は {valid_types} のいずれかを指定してください')
        if errors:
            raise ValueError('、'.join(errors))

    def handle_add_song(self):
        try:
            # リクエストボディを読み取り
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            new_song = json.loads(post_data.decode('utf-8'))

            # バリデーション
            self._validate_song(new_song)

            with data_lock:
                # 既存データを読み込み
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 新しいIDを割り当て
                if data['songs']:
                    max_id = max(song['id'] for song in data['songs'])
                    new_song['id'] = max_id + 1
                else:
                    new_song['id'] = 1

                # streamTitle が未設定の場合、自動取得
                if not new_song.get('streamTitle') and new_song.get('videoId'):
                    new_song['streamTitle'] = self.get_stream_title_for_video(
                        new_song['videoId'], data['songs']
                    )

                # 曲を追加
                data['songs'].append(new_song)

                # ファイルに保存
                backup_data()
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

            # 成功レスポンス
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': True, 'id': new_song['id'], 'message': '追加しました'}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': False, 'message': str(e)}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def handle_update_song(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            updated_song = json.loads(post_data.decode('utf-8'))
            song_id = updated_song.get('id')

            if not song_id:
                raise ValueError('IDが指定されていません')

            # バリデーション
            self._validate_song(updated_song)

            with data_lock:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 該当IDの曲を更新
                found = False
                for i, song in enumerate(data['songs']):
                    if song['id'] == song_id:
                        # streamTitle を保持または再取得
                        old_video_id = song.get('videoId')
                        new_video_id = updated_song.get('videoId')
                        
                        if new_video_id and new_video_id == old_video_id:
                            updated_song['streamTitle'] = song.get('streamTitle', '')
                        elif new_video_id and new_video_id != old_video_id:
                            updated_song['streamTitle'] = self.get_stream_title_for_video(
                                new_video_id, data['songs']
                            )
                        
                        data['songs'][i] = updated_song
                        found = True
                        break

                if not found:
                    raise ValueError(f'ID {song_id} の曲が見つかりません')

                backup_data()
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': True, 'message': '更新しました'}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': False, 'message': str(e)}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def handle_delete_song(self):
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8'))
            song_id = req.get('id')

            if not song_id:
                raise ValueError('IDが指定されていません')

            with data_lock:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # 該当IDの曲を削除
                original_len = len(data['songs'])
                data['songs'] = [s for s in data['songs'] if s['id'] != song_id]

                if len(data['songs']) == original_len:
                    raise ValueError(f'ID {song_id} の曲が見つかりません')

                backup_data()
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': True, 'message': '削除しました'}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': False, 'message': str(e)}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def handle_video_info(self):
        """YouTube動画のアップロード日を取得"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            req = json.loads(post_data.decode('utf-8'))
            url = req.get('url', '')

            # URLからvideo IDを抽出
            video_id = None
            short_match = re.search(r'youtu\.be/([a-zA-Z0-9_-]+)', url)
            long_match = re.search(r'youtube\.com/watch\?.*v=([a-zA-Z0-9_-]+)', url)
            shorts_match = re.search(r'youtube\.com/shorts/([a-zA-Z0-9_-]+)', url)
            if short_match:
                video_id = short_match.group(1)
            elif long_match:
                video_id = long_match.group(1)
            elif shorts_match:
                video_id = shorts_match.group(1)
            elif re.match(r'^[a-zA-Z0-9_-]{11}$', url):
                video_id = url

            if not video_id:
                raise ValueError('有効なYouTube URLではありません')

            # yt-dlpで情報取得
            ydl_opts = {
                'quiet': True,
                'no_warnings': True,
                'extract_flat': False,
            }
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)

            # release_dateを優先、なければupload_dateを使用（タイムゾーンずれ対策）
            date_str = info.get('release_date') or info.get('upload_date', '')  # YYYYMMDD形式
            upload_date = ''
            if date_str:
                # YYYY-MM-DD形式に変換
                upload_date = f'{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}'

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'success': True,
                'videoId': video_id,
                'title': info.get('title', ''),
                'uploadDate': upload_date,
                'channel': info.get('channel', '')
            }
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': False, 'message': str(e)}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def handle_batch_update_titles(self):
        """既存データにstreamTitleを一括追加"""
        try:
            with data_lock:
                with open(DATA_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)

                # videoIdごとにグループ化してタイトルを取得
                video_ids = set()
                for song in data['songs']:
                    if song.get('videoId') and not song.get('streamTitle'):
                        video_ids.add(song['videoId'])

                print(f"取得対象: {len(video_ids)} 件の動画")
                
                # キャッシュ用
                title_cache = {}
                updated_count = 0
                
                for i, video_id in enumerate(video_ids):
                    print(f"取得中 [{i+1}/{len(video_ids)}]: {video_id}")
                    try:
                        ydl_opts = {
                            'quiet': True,
                            'no_warnings': True,
                            'extract_flat': False,
                        }
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(f'https://www.youtube.com/watch?v={video_id}', download=False)
                            title_cache[video_id] = info.get('title', '')
                    except Exception as e:
                        print(f"  エラー: {e}")
                        title_cache[video_id] = ''

                # データ更新
                for song in data['songs']:
                    video_id = song.get('videoId')
                    if video_id and not song.get('streamTitle'):
                        if video_id in title_cache and title_cache[video_id]:
                            song['streamTitle'] = title_cache[video_id]
                            updated_count += 1

                # 保存
                backup_data()
                with open(DATA_FILE, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {
                'success': True,
                'message': f'{updated_count} 曲を更新しました',
                'videosProcessed': len(video_ids)
            }
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            response = {'success': False, 'message': str(e)}
            self.wfile.write(json.dumps(response, ensure_ascii=False).encode('utf-8'))

    def end_headers(self):
        # CORSヘッダー（ローカル開発用）
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('', PORT), SongHandler)
    print(f'サーバー起動: http://localhost:{PORT}')
    print('終了するには Ctrl+C を押してください')
    server.serve_forever()
