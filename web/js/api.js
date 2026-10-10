/**
 * Droply Client API & WebSocket Manager
 */

class DroplyAPI {
  constructor() {
    this.baseUrl = window.location.origin;
    this.ws = null;
    this.listeners = {};
    this.initWebSocket();
  }

  // ---------------- EVENT DISPATCHER ----------------
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(cb => {
        try { cb(data); } catch (e) { console.error("Listener error:", e); }
      });
    }
  }

  isNativeMobile() {
    return typeof window.DroplyAndroid !== 'undefined' ||
           Boolean(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DroplyIOS);
  }

  // ---------------- WEBSOCKET BRIDGE ----------------
  initWebSocket() {
    if (window.location.protocol === 'file:' || this.isNativeMobile()) {
      // Setup Native Mobile Event Bridge Listeners
      window.addEventListener('droply_progress', (e) => {
        const d = e.detail;
        this.emit("task_progress", {
          task: {
            id: 'native_active',
            status: d.status || 'downloading',
            progress_percent: d.progress_percent || 0,
            downloaded_bytes: d.downloaded_bytes || 0,
            total_bytes: d.total_bytes || 0,
            downloaded_str: d.downloaded_str || '0 B',
            total_str: d.total_str || '0 B',
            speed_str: d.speed_str || '0 B/s',
            eta_str: d.eta_str || '--:--'
          }
        });
      });

      window.addEventListener('droply_completed', (e) => {
        this.emit("task_completed", {
          task: {
            id: 'native_active',
            status: 'completed',
            file_path: 'Downloads/Droply',
            progress_percent: 100
          }
        });
      });

      window.addEventListener('droply_error', (e) => {
        const d = e.detail;
        this.emit("task_error", {
          task: {
            id: 'native_active',
            status: 'error',
            error_message: d.error || 'Download failed on device.'
          }
        });
      });
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("Droply WebSocket connected");
        this.emit("ws_connected");
      };

      this.ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.emit(payload.event, payload);
          this.emit("any_event", payload);
        } catch (e) {
          console.error("WS Parse error:", e);
        }
      };

      this.ws.onclose = () => {
        console.log("Droply WebSocket disconnected, retrying in 2s...");
        setTimeout(() => this.initWebSocket(), 2000);
      };

      this.ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };
    } catch (e) {
      console.error("WS init exception:", e);
      setTimeout(() => this.initWebSocket(), 3000);
    }
  }

  // ---------------- REST & NATIVE APIS ----------------
  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const resp = await fetch(url, { ...options, headers });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.detail || data.error_friendly || 'API Request failed');
      err.data = data;
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  async detectPlatform(url) {
    if (this.isNativeMobile()) {
      const u = url.toLowerCase();
      let platform = 'Unknown';
      if (u.includes('youtube.com') || u.includes('youtu.be')) platform = 'YouTube';
      else if (u.includes('tiktok.com')) platform = 'TikTok';
      else if (u.includes('twitter.com') || u.includes('x.com')) platform = 'Twitter / X';
      else if (u.includes('instagram.com')) platform = 'Instagram';
      else if (u.includes('reddit.com')) platform = 'Reddit';
      else if (u.includes('vimeo.com')) platform = 'Vimeo';
      else if (u.includes('soundcloud.com')) platform = 'SoundCloud';
      return { valid: true, platform };
    }
    return this.request('/api/detect-platform', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  async analyzeUrl(url) {
    // Native Android Engine
    if (typeof window.DroplyAndroid !== 'undefined') {
      return new Promise((resolve, reject) => {
        const handler = (e) => {
          window.removeEventListener('droply_analyzed', handler);
          if (e.detail && e.detail.error) {
            reject(new Error(e.detail.error));
          } else {
            resolve(e.detail);
          }
        };
        window.addEventListener('droply_analyzed', handler);
        window.DroplyAndroid.analyzeUrl(url);
      });
    }

    // Native iOS Engine
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DroplyIOS) {
      return new Promise((resolve, reject) => {
        const handler = (e) => {
          window.removeEventListener('droply_analyzed', handler);
          if (e.detail && e.detail.error) {
            reject(new Error(e.detail.error));
          } else {
            resolve(e.detail);
          }
        };
        window.addEventListener('droply_analyzed', handler);
        window.webkit.messageHandlers.DroplyIOS.postMessage({ action: 'analyze', url });
      });
    }

    return this.request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  async startDownload(payload) {
    // Native Android Engine
    if (typeof window.DroplyAndroid !== 'undefined') {
      window.DroplyAndroid.startDownload(
        payload.url,
        payload.format_id || 'best',
        Boolean(payload.is_audio),
        payload.audio_format || 'mp3',
        payload.title || ''
      );
      return {
        id: 'native_active',
        status: 'downloading',
        title: payload.title || 'Downloading media...',
        url: payload.url,
        progress_percent: 0
      };
    }

    // Native iOS Engine
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DroplyIOS) {
      window.webkit.messageHandlers.DroplyIOS.postMessage({
        action: 'download',
        url: payload.url,
        format_id: payload.format_id || 'best',
        is_audio: Boolean(payload.is_audio),
        audio_format: payload.audio_format || 'mp3',
        title: payload.title || ''
      });
      return {
        id: 'native_active',
        status: 'downloading',
        title: payload.title || 'Downloading media...',
        url: payload.url,
        progress_percent: 0
      };
    }

    return this.request('/api/download', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async batchParse(text) {
    if (this.isNativeMobile()) {
      const urls = text.match(/https?:\/\/[^\s,;"'<>]+/g) || [];
      const unique = Array.from(new Set(urls));
      return {
        total: unique.length,
        items: unique.map(u => ({ url: u, platform: 'Web Media' }))
      };
    }
    return this.request('/api/batch/parse', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  async batchEnqueue(payload) {
    if (this.isNativeMobile()) {
      return { enqueued: payload.urls.length, tasks: [] };
    }
    return this.request('/api/batch/enqueue', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getTasks() {
    if (this.isNativeMobile()) return [];
    return this.request('/api/tasks');
  }

  async cancelTask(taskId) {
    if (this.isNativeMobile()) return { success: true };
    return this.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }

  async retryTask(taskId) {
    if (this.isNativeMobile()) return { success: true };
    return this.request(`/api/tasks/${taskId}/retry`, { method: 'POST' });
  }

  async removeTask(taskId) {
    if (this.isNativeMobile()) return { success: true };
    return this.request(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }

  async clearFinishedTasks() {
    if (this.isNativeMobile()) return { success: true };
    return this.request('/api/tasks/clear-finished', { method: 'POST' });
  }

  async getHistory() {
    if (this.isNativeMobile()) return [];
    return this.request('/api/history');
  }

  async deleteHistoryItem(id, deleteFile = false) {
    if (this.isNativeMobile()) return { success: true };
    return this.request(`/api/history/${id}?delete_file=${deleteFile}`, { method: 'DELETE' });
  }

  async clearHistory() {
    if (this.isNativeMobile()) return { success: true };
    return this.request('/api/history/clear', { method: 'POST' });
  }

  async getSettings() {
    if (this.isNativeMobile()) return { download_dir: 'Downloads/Droply' };
    return this.request('/api/settings');
  }

  async updateSettings(settings) {
    if (this.isNativeMobile()) return settings;
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ settings })
    });
  }

  async browseFolder() {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined') {
        window.DroplyAndroid.openDownloadFolder();
      }
      return { folder: 'Downloads/Droply', updated: true };
    }
    return this.request('/api/browse-folder', { method: 'POST' });
  }

  async openFolder(path = null) {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined') {
        window.DroplyAndroid.openDownloadFolder();
      }
      return { success: true, path: 'Downloads/Droply' };
    }
    return this.request('/api/open-folder', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  async revealFile(filePath) {
    if (this.isNativeMobile()) {
      return { success: true };
    }
    return this.request('/api/reveal-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath })
    });
  }

  async openFile(filePath) {
    if (this.isNativeMobile()) {
      return { success: true };
    }
    return this.request('/api/open-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath })
    });
  }

  async getSystemStatus() {
    if (this.isNativeMobile()) {
      return {
        ffmpeg_ready: true,
        ffmpeg_path: 'Native Mobile FFmpegKit',
        ytdlp_version: 'Embedded Mobile',
        default_dir: 'Downloads/Droply',
        python_version: '3.11'
      };
    }
    return this.request('/api/system/status');
  }
}

const api = new DroplyAPI();

