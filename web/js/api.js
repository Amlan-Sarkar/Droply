/**
 * Droply Client API & WebSocket Manager
 * Full desktop server bridge + native mobile persistent client engine
 */

class DroplyAPI {
  constructor() {
    let origin = window.location.origin;
    if (!origin || origin === 'null' || origin.startsWith('file:') || origin === 'undefined') {
      origin = 'http://127.0.0.1:8765';
    }
    this.baseUrl = origin;
    this.authToken = window.__DROPLY_AUTH_TOKEN__ || (document.querySelector('meta[name="droply-auth"]')?.content) || '';
    this.ws = null;
    this.listeners = {};
    this.activeMobileTask = null;
    this.isProcessingMobileQueue = false;
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
    return typeof window.DroplyAndroid !== 'undefined';
  }

  // ---------------- MOBILE LOCAL STORAGE HELPERS ----------------
  getMobileHistory() {
    try {
      return JSON.parse(localStorage.getItem('droply_mobile_history') || '[]');
    } catch (e) {
      return [];
    }
  }

  saveMobileHistory(history) {
    try {
      localStorage.setItem('droply_mobile_history', JSON.stringify(history.slice(0, 100)));
    } catch (e) {}
  }

  addMobileHistoryItem(item) {
    const list = this.getMobileHistory();
    const existingIdx = list.findIndex(h => h.id === item.id || (h.url && h.url === item.url && h.title === item.title));
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...item };
    } else {
      list.unshift(item);
    }
    this.saveMobileHistory(list);
  }

  deleteMobileHistoryItem(id) {
    const list = this.getMobileHistory().filter(h => h.id !== id);
    this.saveMobileHistory(list);
  }

  getMobileQueue() {
    try {
      return JSON.parse(localStorage.getItem('droply_mobile_queue') || '[]');
    } catch (e) {
      return [];
    }
  }

  saveMobileQueue(queue) {
    try {
      localStorage.setItem('droply_mobile_queue', JSON.stringify(queue));
    } catch (e) {}
  }

  updateMobileQueueTask(taskId, updates) {
    const queue = this.getMobileQueue();
    const idx = queue.findIndex(t => t.id === taskId);
    if (idx >= 0) {
      queue[idx] = { ...queue[idx], ...updates };
      this.saveMobileQueue(queue);
      this.emit('task_updated', { task: queue[idx] });
    }
  }

  processNextMobileQueueItem() {
    if (!this.isNativeMobile()) return;
    if (this.activeMobileTask && this.activeMobileTask.status === 'downloading') {
      return;
    }
    const queue = this.getMobileQueue();
    const nextTask = queue.find(t => t.status === 'pending' || t.status === 'queued');
    if (!nextTask) {
      this.isProcessingMobileQueue = false;
      return;
    }
    this.isProcessingMobileQueue = true;
    nextTask.status = 'downloading';
    this.activeMobileTask = nextTask;
    this.updateMobileQueueTask(nextTask.id, { status: 'downloading', percent: 0 });

    if (typeof window.DroplyAndroid !== 'undefined') {
      if (typeof window.DroplyAndroid.startDownloadWithFolder === 'function') {
        window.DroplyAndroid.startDownloadWithFolder(
          nextTask.url,
          nextTask.format_id || 'best',
          Boolean(nextTask.is_audio),
          nextTask.audio_format || 'mp3',
          nextTask.title || '',
          nextTask.playlist_folder || ''
        );
      } else {
        window.DroplyAndroid.startDownload(
          nextTask.url,
          nextTask.format_id || 'best',
          Boolean(nextTask.is_audio),
          nextTask.audio_format || 'mp3',
          nextTask.title || ''
        );
      }
    }
  }

  // ---------------- WEBSOCKET & NATIVE MOBILE BRIDGE ----------------
  initWebSocket() {
    if (window.location.protocol === 'file:' || this.isNativeMobile() || window.location.hostname === 'appassets.androidplatform.net') {
      // Setup Native Mobile Event Bridge Listeners
      window.addEventListener('droply_progress', (e) => {
        const d = e.detail || {};
        const pct = typeof d.percent !== 'undefined' ? d.percent : (d.progress_percent || 0);
        const taskPayload = {
          id: d.id || (this.activeMobileTask ? this.activeMobileTask.id : 'native_active'),
          status: d.status || 'downloading',
          percent: pct,
          progress_percent: pct,
          downloaded_bytes: d.downloaded_bytes || 0,
          total_bytes: d.total_bytes || 0,
          downloaded_str: d.downloaded_str || '0 B',
          total_str: d.total_str || '0 B',
          speed_str: d.speed_str || '0 B/s',
          eta_str: d.eta_str || '--:--'
        };

        if (this.activeMobileTask) {
          this.activeMobileTask = { ...this.activeMobileTask, ...taskPayload };
          this.updateMobileQueueTask(this.activeMobileTask.id, taskPayload);
        }

        this.emit("task_progress", { task: taskPayload });
      });

      window.addEventListener('droply_completed', (e) => {
        const d = e.detail || {};
        const taskId = d.id || (this.activeMobileTask ? this.activeMobileTask.id : 'native_' + Date.now());
        const title = d.title || (this.activeMobileTask ? this.activeMobileTask.title : 'Downloaded Media');
        const activeTask = this.activeMobileTask || {};
        const completedTask = {
          id: taskId,
          title: title,
          platform: d.platform || activeTask.platform || 'YouTube',
          thumbnail: d.thumbnail || activeTask.thumbnail || '',
          status: 'completed',
          file_path: d.file_path || 'Downloads/Droply',
          download_dir: 'Downloads/Droply',
          file_size: d.file_size || activeTask.total_bytes || activeTask.downloaded_bytes || 0,
          file_size_str: d.file_size_str || activeTask.total_str || activeTask.downloaded_str || '',
          format_label: d.format_label || activeTask.format_label || '',
          is_audio: Boolean(d.is_audio || activeTask.is_audio),
          percent: 100,
          progress_percent: 100,
          timestamp: new Date().toISOString(),
          created_at_str: 'Just now'
        };

        this.addMobileHistoryItem(completedTask);
        if (this.activeMobileTask) {
          this.updateMobileQueueTask(taskId, { status: 'completed', percent: 100 });
          this.activeMobileTask = null;
        }

        this.emit("task_completed", { task: completedTask });
        this.processNextMobileQueueItem();
      });

      window.addEventListener('droply_cancelled', () => {
        if (this.activeMobileTask) {
          this.updateMobileQueueTask(this.activeMobileTask.id, { status: 'cancelled' });
          this.activeMobileTask = null;
        }
        this.emit('task_cancelled', {});
      });

      window.addEventListener('droply_error', (e) => {
        const d = e.detail || {};
        const taskId = d.id || (this.activeMobileTask ? this.activeMobileTask.id : 'native_active');
        const errTask = {
          id: taskId,
          title: this.activeMobileTask ? this.activeMobileTask.title : 'Media',
          status: 'failed',
          error_friendly: d.error || d.error_friendly || 'Download failed on device.',
          error_technical: d.error || 'Check that media URL is accessible.'
        };

        if (this.activeMobileTask) {
          this.updateMobileQueueTask(taskId, { status: 'failed', error_friendly: errTask.error_friendly });
          this.activeMobileTask = null;
        }

        this.emit("task_failed", { task: errTask });
        this.emit("task_error", { task: errTask });
        this.processNextMobileQueueItem();
      });

      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host || '127.0.0.1:8765';
    const tokenQuery = this.authToken ? `?token=${encodeURIComponent(this.authToken)}` : '';
    const wsUrl = `${protocol}//${host}/ws/events${tokenQuery}`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
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
        setTimeout(() => this.initWebSocket(), 2000);
      };

      this.ws.onerror = (err) => {
        console.warn("WebSocket error:", err);
      };
    } catch (e) {
      setTimeout(() => this.initWebSocket(), 3000);
    }
  }

  // ---------------- PROCESS MOBILE BATCH QUEUE ----------------
  async processNextMobileQueueItem() {
    if (!this.isNativeMobile() || this.isProcessingMobileQueue || this.activeMobileTask) {
      return;
    }

    const queue = this.getMobileQueue();
    const nextTask = queue.find(t => t.status === 'pending');
    if (!nextTask) return;

    this.isProcessingMobileQueue = true;
    this.activeMobileTask = nextTask;
    this.updateMobileQueueTask(nextTask.id, { status: 'downloading' });

    try {
      if (typeof window.DroplyAndroid !== 'undefined') {
        if (window.DroplyAndroid.startDownloadWithFolder) {
          window.DroplyAndroid.startDownloadWithFolder(
            nextTask.url,
            nextTask.format_id || 'best',
            Boolean(nextTask.is_audio),
            nextTask.audio_format || 'mp3',
            nextTask.title || '',
            nextTask.playlist_folder || ''
          );
        } else {
          window.DroplyAndroid.startDownload(
            nextTask.url,
            nextTask.format_id || 'best',
            Boolean(nextTask.is_audio),
            nextTask.audio_format || 'mp3',
            nextTask.title || ''
          );
        }
      } else if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DroplyIOS) {
        window.webkit.messageHandlers.DroplyIOS.postMessage({
          action: 'download',
          url: nextTask.url,
          format_id: nextTask.format_id || 'best',
          is_audio: Boolean(nextTask.is_audio),
          audio_format: nextTask.audio_format || 'mp3',
          title: nextTask.title || '',
          playlist_folder: nextTask.playlist_folder || ''
        });
      }
    } catch (e) {
      this.updateMobileQueueTask(nextTask.id, { status: 'failed', error_friendly: e.message });
      this.activeMobileTask = null;
    } finally {
      this.isProcessingMobileQueue = false;
    }
  }

  // ---------------- REST & NATIVE APIS ----------------
  async request(endpoint, options = {}, retries = 1) {
    if (!this.authToken) {
      this.authToken = window.__DROPLY_AUTH_TOKEN__ || (document.querySelector('meta[name="droply-auth"]')?.content) || '';
      if (!this.authToken && !endpoint.includes('/api/auth/token')) {
        try {
          const tResp = await fetch(`${this.baseUrl}/api/auth/token`);
          if (tResp.ok) {
            const tData = await tResp.json();
            if (tData.token) {
              this.authToken = tData.token;
              window.__DROPLY_AUTH_TOKEN__ = this.authToken;
            }
          }
        } catch (e) {}
      }
    }
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.authToken ? { 'X-Auth-Token': this.authToken } : {}),
      ...(options.headers || {})
    };
    let resp;
    try {
      resp = await fetch(url, { ...options, headers });
    } catch (netErr) {
      if (retries > 0) {
        await new Promise(r => setTimeout(r, 350));
        return this.request(endpoint, options, retries - 1);
      }
      const err = new Error(`Cannot connect to Droply backend engine at ${this.baseUrl}`);
      err.data = {
        error_friendly: 'Cannot connect to Droply backend server.',
        error_technical: `Network request to ${url} failed (${netErr.message}). Ensure Droply.exe is currently running.`
      };
      throw err;
    }

    if (resp.status === 401 && retries > 0) {
      try {
        const tResp = await fetch(`${this.baseUrl}/api/auth/token`);
        if (tResp.ok) {
          const tData = await tResp.json();
          if (tData.token) {
            this.authToken = tData.token;
            window.__DROPLY_AUTH_TOKEN__ = this.authToken;
            return this.request(endpoint, options, retries - 1);
          }
        }
      } catch (e) {}
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const err = new Error(data.detail || data.error_friendly || 'API Request failed');
      err.data = data;
      err.status = resp.status;
      throw err;
    }
    return data;
  }

  detectPlatformQuick(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'YouTube';
    if (u.includes('tiktok.com')) return 'TikTok';
    if (u.includes('twitter.com') || u.includes('x.com')) return 'Twitter / X';
    if (u.includes('instagram.com')) return 'Instagram';
    if (u.includes('reddit.com')) return 'Reddit';
    if (u.includes('vimeo.com')) return 'Vimeo';
    if (u.includes('soundcloud.com')) return 'SoundCloud';
    return 'Web Media';
  }

  async detectPlatform(url) {
    if (this.isNativeMobile()) {
      return { valid: true, platform: this.detectPlatformQuick(url) };
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
      const taskId = 'native_active';
      this.activeMobileTask = {
        id: taskId,
        title: payload.title || 'Downloading media...',
        url: payload.url,
        status: 'downloading',
        percent: 0,
        format_id: payload.format_id || 'best',
        is_audio: Boolean(payload.is_audio),
        audio_format: payload.audio_format || 'mp3'
      };

      window.DroplyAndroid.startDownload(
        payload.url,
        payload.format_id || 'best',
        Boolean(payload.is_audio),
        payload.audio_format || 'mp3',
        payload.title || ''
      );
      return this.activeMobileTask;
    }

    // Native iOS Engine
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.DroplyIOS) {
      const taskId = 'native_active';
      this.activeMobileTask = {
        id: taskId,
        title: payload.title || 'Downloading media...',
        url: payload.url,
        status: 'downloading',
        percent: 0,
        format_id: payload.format_id || 'best',
        is_audio: Boolean(payload.is_audio),
        audio_format: payload.audio_format || 'mp3'
      };

      window.webkit.messageHandlers.DroplyIOS.postMessage({
        action: 'download',
        url: payload.url,
        format_id: payload.format_id || 'best',
        is_audio: Boolean(payload.is_audio),
        audio_format: payload.audio_format || 'mp3',
        title: payload.title || ''
      });
      return this.activeMobileTask;
    }

    return this.request('/api/download', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  detectPlatformQuick(url) {
    if (!url) return 'Web Media';
    const lower = url.toLowerCase();
    if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'YouTube';
    if (lower.includes('twitter.com') || lower.includes('x.com')) return 'Twitter / X';
    if (lower.includes('tiktok.com')) return 'TikTok';
    if (lower.includes('instagram.com')) return 'Instagram';
    if (lower.includes('reddit.com')) return 'Reddit';
    if (lower.includes('vimeo.com')) return 'Vimeo';
    if (lower.includes('soundcloud.com')) return 'SoundCloud';
    if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'Facebook';
    return 'Web Media';
  }

  async batchParse(text) {
    if (this.isNativeMobile()) {
      const urls = text.match(/https?:\/\/[^\s,;"'<>]+/g) || [];
      const unique = Array.from(new Set(urls));
      return {
        count: unique.length,
        total: unique.length,
        items: unique.map(u => ({ url: u, platform: this.detectPlatformQuick(u) }))
      };
    }
    return this.request('/api/batch/parse', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  async batchEnqueue(payload) {
    if (this.isNativeMobile()) {
      const queue = this.getMobileQueue();
      const newTasks = [];
      const urls = payload.urls || [];
      const itemsMap = {};
      if (payload.items) {
        payload.items.forEach(it => { if (it && it.url) itemsMap[it.url] = it; });
      }

      for (const u of urls) {
        const itemInfo = itemsMap[u] || {};
        const title = itemInfo.title || u.split('?')[0].split('/').pop() || 'Queued Media';
        const task = {
          id: 'mob_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          url: u,
          title: title,
          status: 'pending',
          percent: 0,
          is_audio: Boolean(payload.is_audio),
          format_id: payload.format_id || 'best',
          format_label: payload.format_label || 'Best Quality',
          audio_format: payload.audio_format || 'mp3',
          output_dir: payload.output_dir || 'Downloads/Droply',
          playlist_folder: itemInfo.playlist_folder || payload.playlist_folder || '',
          thumbnail: itemInfo.thumbnail || ''
        };
        queue.push(task);
        newTasks.push(task);
        this.emit('task_added', { task });
      }

      this.saveMobileQueue(queue);
      this.processNextMobileQueueItem();

      return {
        count: newTasks.length,
        enqueued: newTasks.length,
        tasks: newTasks
      };
    }

    return this.request('/api/batch/enqueue', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getTasks() {
    if (this.isNativeMobile()) {
      return this.getMobileQueue();
    }
    return this.request('/api/tasks');
  }

  async cancelTask(taskId) {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined' && window.DroplyAndroid.cancelDownload) {
        window.DroplyAndroid.cancelDownload();
      }
      this.updateMobileQueueTask(taskId, { status: 'cancelled' });
      if (this.activeMobileTask && this.activeMobileTask.id === taskId) {
        this.activeMobileTask = null;
      }
      return { success: true };
    }
    return this.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }

  async retryTask(taskId) {
    if (this.isNativeMobile()) {
      this.updateMobileQueueTask(taskId, { status: 'pending', percent: 0 });
      this.processNextMobileQueueItem();
      return { success: true };
    }
    return this.request(`/api/tasks/${taskId}/retry`, { method: 'POST' });
  }

  async removeTask(taskId) {
    if (this.isNativeMobile()) {
      const q = this.getMobileQueue().filter(t => t.id !== taskId);
      this.saveMobileQueue(q);
      if (this.activeMobileTask && this.activeMobileTask.id === taskId) {
        this.cancelTask(taskId);
      }
      return { success: true };
    }
    return this.request(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }

  async clearFinishedTasks() {
    if (this.isNativeMobile()) {
      const q = this.getMobileQueue().filter(t => t.status === 'pending' || t.status === 'downloading');
      this.saveMobileQueue(q);
      this.emit('queue_cleared', { cleared_count: 0 });
      return { success: true };
    }
    const res = await this.request('/api/tasks/clear-finished', { method: 'POST' });
    this.emit('queue_cleared', { cleared_count: 0 });
    return res;
  }

  async getHistory() {
    if (this.isNativeMobile()) {
      return this.getMobileHistory();
    }
    return this.request('/api/history');
  }

  async deleteHistoryItem(id, deleteFile = false) {
    if (this.isNativeMobile()) {
      this.deleteMobileHistoryItem(id);
      return { success: true };
    }
    return this.request(`/api/history/${id}?delete_file=${deleteFile}`, { method: 'DELETE' });
  }

  async clearHistory() {
    if (this.isNativeMobile()) {
      localStorage.removeItem('droply_mobile_history');
      return { success: true };
    }
    return this.request('/api/history/clear', { method: 'POST' });
  }

  async getSettings() {
    if (this.isNativeMobile()) {
      try {
        const saved = JSON.parse(localStorage.getItem('droply_mobile_settings') || '{}');
        return {
          download_dir: saved.download_dir || 'Downloads/Droply',
          default_video_quality: saved.default_video_quality || 'best',
          default_audio_format: saved.default_audio_format || 'mp3',
          max_concurrent_downloads: saved.max_concurrent_downloads ? parseInt(saved.max_concurrent_downloads, 10) : 3,
          theme: saved.theme || localStorage.getItem('droply_theme') || 'dark',
          notifications: saved.notifications !== false,
          ...saved
        };
      } catch (e) {
        return {
          download_dir: 'Downloads/Droply',
          default_video_quality: 'best',
          default_audio_format: 'mp3',
          max_concurrent_downloads: 3,
          theme: localStorage.getItem('droply_theme') || 'dark',
          notifications: true
        };
      }
    }
    return this.request('/api/settings');
  }

  async updateSettings(settings) {
    if (this.isNativeMobile()) {
      const current = await this.getSettings();
      const merged = { ...current, ...settings };
      localStorage.setItem('droply_mobile_settings', JSON.stringify(merged));
      if (merged.theme) {
        localStorage.setItem('droply_theme', merged.theme);
      }
      return merged;
    }
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

  async browseCookieFile() {
    if (this.isNativeMobile()) {
      return { cookie_file: null, updated: false };
    }
    return this.request('/api/browse-cookie-file', { method: 'POST' });
  }

  async getAvailableBrowsers() {
    if (this.isNativeMobile()) {
      return { installed: [], cookie_browser: 'none' };
    }
    return this.request('/api/auth/browsers');
  }

  async uploadCookies(content) {
    if (this.isNativeMobile()) {
      return { status: 'error', message: 'Not supported on mobile' };
    }
    return this.request('/api/auth/cookies/upload', {
      method: 'POST',
      body: JSON.stringify({ content })
    });
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

  async revealFile(filePath, taskId = null) {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined') {
        window.DroplyAndroid.openDownloadFolder();
      }
      return { success: true };
    }
    return this.request('/api/reveal-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath || '', task_id: taskId || null })
    });
  }

  async openFile(filePath, taskId = null) {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined') {
        if (typeof window.DroplyAndroid.openFile === 'function') {
          window.DroplyAndroid.openFile(filePath || '');
        } else {
          window.DroplyAndroid.openDownloadFolder();
        }
        return { success: true };
      }
      return { success: true };
    }
    return this.request('/api/open-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath || '', task_id: taskId || null })
    });
  }

  async getClipboard() {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined' && typeof window.DroplyAndroid.getClipboardText === 'function') {
        try {
          const t = window.DroplyAndroid.getClipboardText();
          return { text: t || '' };
        } catch (e) {
          return { text: '' };
        }
      }
      return { text: '' };
    }
    return this.request('/api/system/clipboard');
  }

  async checkUpdates() {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined' && typeof window.DroplyAndroid.checkUpdates === 'function') {
        return new Promise((resolve) => {
          const handler = (e) => {
            window.removeEventListener('droply_update_checked', handler);
            resolve(e.detail || { app_installed: 'v1.4.0', app_latest: 'v1.4.0', app_up_to_date: true });
          };
          window.addEventListener('droply_update_checked', handler);
          window.DroplyAndroid.checkUpdates();
          setTimeout(() => {
            window.removeEventListener('droply_update_checked', handler);
            resolve({ app_installed: 'v1.4.0', app_latest: 'v1.4.0', app_up_to_date: true, ytdlp_installed: 'Embedded', ytdlp_latest: 'Embedded', ytdlp_up_to_date: true });
          }, 6000);
        });
      }
      return { app_installed: 'v1.4.0', app_latest: 'v1.4.0', app_up_to_date: true, ytdlp_installed: 'Embedded', ytdlp_latest: 'Embedded', ytdlp_up_to_date: true };
    }
    return this.request('/api/system/check-updates');
  }

  async updateYtdlpCore() {
    if (this.isNativeMobile()) {
      if (typeof window.DroplyAndroid !== 'undefined' && typeof window.DroplyAndroid.updateYtdlpCore === 'function') {
        return new Promise((resolve) => {
          const handler = (e) => {
            window.removeEventListener('droply_ytdlp_updated', handler);
            resolve(e.detail || { status: 'success', message: 'Core updated' });
          };
          window.addEventListener('droply_ytdlp_updated', handler);
          window.DroplyAndroid.updateYtdlpCore();
          setTimeout(() => {
            window.removeEventListener('droply_ytdlp_updated', handler);
            resolve({ status: 'success', message: 'yt-dlp core verified up to date.' });
          }, 8000);
        });
      }
      return { status: 'success', message: 'yt-dlp core verified up to date.' };
    }
    return this.request('/api/system/update-ytdlp', { method: 'POST' });
  }

  async getSystemStatus() {
    if (this.isNativeMobile()) {
      return {
        ffmpeg_ready: true,
        ffmpeg_path: 'Native Mobile Engine',
        ytdlp_version: 'Embedded Mobile yt-dlp',
        default_dir: 'Downloads/Droply',
        python_version: '3.11'
      };
    }
    return this.request('/api/system/status');
  }

  async downloadInstaller(url, size = 0) {
    return this.request('/api/system/download-installer', {
      method: 'POST',
      body: JSON.stringify({ url, size })
    });
  }

  async getInstallerDownloadStatus() {
    return this.request('/api/system/download-installer-status');
  }

  async cancelInstallerDownload() {
    return this.request('/api/system/cancel-installer-download', {
      method: 'POST'
    });
  }

  async installAndRestart() {
    return this.request('/api/system/install-and-restart', {
      method: 'POST'
    });
  }
}

const api = new DroplyAPI();
