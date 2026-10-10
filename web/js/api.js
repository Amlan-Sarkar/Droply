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

  // ---------------- WEBSOCKET BRIDGE ----------------
  initWebSocket() {
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

  // ---------------- REST APIS ----------------
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
    return this.request('/api/detect-platform', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  async analyzeUrl(url) {
    return this.request('/api/analyze', {
      method: 'POST',
      body: JSON.stringify({ url })
    });
  }

  async startDownload(payload) {
    return this.request('/api/download', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async batchParse(text) {
    return this.request('/api/batch/parse', {
      method: 'POST',
      body: JSON.stringify({ text })
    });
  }

  async batchEnqueue(payload) {
    return this.request('/api/batch/enqueue', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getTasks() {
    return this.request('/api/tasks');
  }

  async cancelTask(taskId) {
    return this.request(`/api/tasks/${taskId}/cancel`, { method: 'POST' });
  }

  async retryTask(taskId) {
    return this.request(`/api/tasks/${taskId}/retry`, { method: 'POST' });
  }

  async removeTask(taskId) {
    return this.request(`/api/tasks/${taskId}`, { method: 'DELETE' });
  }

  async clearFinishedTasks() {
    return this.request('/api/tasks/clear-finished', { method: 'POST' });
  }

  async getHistory() {
    return this.request('/api/history');
  }

  async deleteHistoryItem(id, deleteFile = false) {
    return this.request(`/api/history/${id}?delete_file=${deleteFile}`, { method: 'DELETE' });
  }

  async clearHistory() {
    return this.request('/api/history/clear', { method: 'POST' });
  }

  async getSettings() {
    return this.request('/api/settings');
  }

  async updateSettings(settings) {
    return this.request('/api/settings', {
      method: 'POST',
      body: JSON.stringify({ settings })
    });
  }

  async browseFolder() {
    return this.request('/api/browse-folder', { method: 'POST' });
  }

  async openFolder(path = null) {
    return this.request('/api/open-folder', {
      method: 'POST',
      body: JSON.stringify({ path })
    });
  }

  async revealFile(filePath) {
    return this.request('/api/reveal-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath })
    });
  }

  async openFile(filePath) {
    return this.request('/api/open-file', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath })
    });
  }

  async getSystemStatus() {
    return this.request('/api/system/status');
  }
}

const api = new DroplyAPI();
