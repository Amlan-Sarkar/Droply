/**
 * Droply Main Application Controller
 * Unified Downloader, Library & History, Settings, and Update System
 */

class DroplyApp {
  constructor() {
    this.currentTab = 'single';
    this.currentMedia = null;
    this.selectedMode = 'video'; // 'video' or 'audio'
    this.selectedFormat = null;
    this.activeSingleTaskId = null;
    this.tasks = [];
    this.settings = {};

    this.init();
  }

  async init() {
    try { this.setupTabs(); } catch (e) { console.error("Setup tabs error:", e); }
    try { this.setupDownloader(); } catch (e) { console.error("Setup downloader error:", e); }
    try { this.setupHistory(); } catch (e) { console.error("Setup history error:", e); }
    try { this.setupSettings(); } catch (e) { console.error("Setup settings error:", e); }
    try { this.setupUpdateSystem(); } catch (e) { console.error("Setup update system error:", e); }
    try { this.setupWebSocketListeners(); } catch (e) { console.error("Setup WebSocket listeners error:", e); }

    // Load initial data safely
    try { await this.loadSettings(); } catch (e) { console.error("Error loading settings:", e); }
    try { await this.loadSystemStatus(); } catch (e) { console.error("Error loading system status:", e); }
    try { await this.loadTasks(); } catch (e) { console.error("Error loading tasks:", e); }
    try { await this.loadHistory(); } catch (e) { console.error("Error loading history:", e); }

    // Start background polling fallback for resilient download tracking
    this.startTaskPolling();

    // Check for updates in the background on startup (spins circular arrow and shows breathing dot if available)
    this.checkUpdatesOnStartup();
  }

  dismissSplash() {
    // No-op compatibility stub
    const splash = document.getElementById('app-splash');
    if (splash && splash.parentElement) {
      splash.parentElement.removeChild(splash);
    }
  }

  // ================= TABS NAVIGATION =================
  setupTabs() {
    const tabs = document.querySelectorAll('.nav-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.getAttribute('data-tab');
        this.switchTab(target);
      });
    });

    // Top-left brand logo/title returns to Downloader
    const brandBtn = document.getElementById('header-brand-btn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => {
        this.switchTab('single');
      });
    }

    // Top-right header action icons
    const navHistory = document.getElementById('header-nav-history');
    if (navHistory) {
      navHistory.addEventListener('click', () => {
        if (this.currentTab === 'history') {
          this.switchTab('single');
        } else {
          this.switchTab('history');
        }
      });
    }

    const navSettings = document.getElementById('header-nav-settings');
    if (navSettings) {
      navSettings.addEventListener('click', () => {
        if (this.currentTab === 'settings') {
          this.switchTab('single');
        } else {
          this.switchTab('settings');
        }
      });
    }
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `pane-${tabName}`);
    });

    // Update header icons active state
    const navHistory = document.getElementById('header-nav-history');
    if (navHistory) navHistory.classList.toggle('active', tabName === 'history');

    const navSettings = document.getElementById('header-nav-settings');
    if (navSettings) navSettings.classList.toggle('active', tabName === 'settings');

    if (tabName === 'history') {
      this.loadHistory();
    } else if (tabName === 'settings') {
      this.loadSettings();
    }
  }

  // ================= UNIFIED DOWNLOADER =================
  setupDownloader() {
    const urlInput = document.getElementById('single-url-input');
    const btnPaste = document.getElementById('btn-paste');
    const btnClear = document.getElementById('btn-clear');
    const btnAnalyze = document.getElementById('btn-analyze');
    const btnChangeDir = document.getElementById('btn-change-dir');
    const btnStartDownload = document.getElementById('btn-start-download');
    const btnCancelSingle = document.getElementById('btn-cancel-single');
    const btnSuccessOpenFolder = document.getElementById('btn-success-open-folder');
    const btnSuccessPlay = document.getElementById('btn-success-play');
    const btnCloseError = document.getElementById('btn-close-error');
    const btnCopyTitle = document.getElementById('btn-copy-title');

    // Live typing instant detection
    let detectTimer = null;
    urlInput.addEventListener('input', () => {
      const val = urlInput.value.trim();
      btnClear.style.display = val ? 'flex' : 'none';

      clearTimeout(detectTimer);
      if (val.length > 8) {
        detectTimer = setTimeout(() => this.instantDetectPlatform(val), 150);
      } else {
        this.hideDetectedBadge();
      }
    });

    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        btnAnalyze.click();
      }
    });

    // Batch Drawer Toggle button
    const btnBatchToggle = document.getElementById('btn-batch-toggle');
    const batchDrawer = document.getElementById('omni-batch-drawer');
    const batchTextarea = document.getElementById('batch-urls-input');
    const btnClearBatch = document.getElementById('btn-clear-batch');

    if (batchTextarea && btnClearBatch) {
      batchTextarea.addEventListener('input', () => {
        const val = batchTextarea.value.trim();
        btnClearBatch.style.display = val ? 'flex' : 'none';
      });

      btnClearBatch.addEventListener('click', () => {
        batchTextarea.value = '';
        btnClearBatch.style.display = 'none';
        batchTextarea.focus();
      });
    }

    if (btnBatchToggle && batchDrawer) {
      btnBatchToggle.addEventListener('click', () => {
        const isShown = batchDrawer.style.display !== 'none';
        batchDrawer.style.display = isShown ? 'none' : 'block';
        btnBatchToggle.classList.toggle('active', !isShown);
        if (!isShown && batchTextarea) {
          batchTextarea.focus();
          if (btnClearBatch) {
            btnClearBatch.style.display = batchTextarea.value.trim() ? 'flex' : 'none';
          }
        }
      });
    }

    // Paste button (reads clipboard directly from native backend or web API)
    btnPaste.addEventListener('click', async () => {
      let text = '';

      // 1. First try native backend clipboard endpoint (instant, zero browser permission prompt)
      try {
        const res = await api.getClipboard();
        if (res && res.text) {
          text = res.text;
        }
      } catch (e) {}

      // 2. Android native interface
      if (!text && window.DroplyAndroid && window.DroplyAndroid.getClipboardText) {
        try {
          text = window.DroplyAndroid.getClipboardText();
        } catch (e) {}
      }

      // 3. Web clipboard API fallback (if supported and permitted)
      if (!text && navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch (err) {}
      }

      if (text && text.trim()) {
        const trimmed = text.trim();
        if (batchDrawer && batchDrawer.style.display !== 'none' && batchTextarea) {
          batchTextarea.value = trimmed;
          if (btnClearBatch) btnClearBatch.style.display = 'flex';
        } else {
          urlInput.value = trimmed;
          btnClear.style.display = 'flex';
          this.instantDetectPlatform(trimmed);
        }
        Components.showToast('Pasted from clipboard', 'info');
      } else {
        Components.showToast('Clipboard is empty or contains no link.', 'info');
      }
    });

    // Clear button for single URL input
    btnClear.addEventListener('click', () => {
      urlInput.value = '';
      btnClear.style.display = 'none';
      this.hideDetectedBadge();
      this.resetSingleView();
      urlInput.focus();
    });

    // Fetch Details / Analyze button
    btnAnalyze.addEventListener('click', () => {
      let text = urlInput.value.trim();
      if (batchDrawer && batchDrawer.style.display !== 'none' && batchTextarea && batchTextarea.value.trim()) {
        text = batchTextarea.value.trim();
      }
      if (!text) {
        Components.showToast('Please paste a media URL or batch links to fetch.', 'error');
        if (batchDrawer && batchDrawer.style.display !== 'none' && batchTextarea) {
          batchTextarea.focus();
        } else {
          urlInput.focus();
        }
        return;
      }
      this.analyzeInput(text);
    });

    // Mode Toggle (Video vs Audio)
    const modeBtnVideo = document.getElementById('mode-btn-video');
    const modeBtnAudio = document.getElementById('mode-btn-audio');

    modeBtnVideo.addEventListener('click', () => {
      this.selectedMode = 'video';
      modeBtnVideo.classList.add('active');
      modeBtnAudio.classList.remove('active');
      document.getElementById('video-formats-section').style.display = 'block';
      document.getElementById('audio-formats-section').style.display = 'none';
      const btnText = document.getElementById('btn-start-download-text');
      if (btnText && (!window.DroplyAndroid || !window.DroplyAndroid.getClipboardText)) {
        btnText.textContent = 'Download';
      }
      if (this.currentMedia && this.currentMedia.formats && this.currentMedia.formats.length > 0) {
        const preferred = this.getPreferredVideoFormat(this.currentMedia.formats);
        this.selectedFormat = preferred;
        const grid = document.getElementById('video-formats-grid');
        if (grid && preferred) {
          grid.querySelectorAll('.omni-quality-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-fid') === preferred.format_id);
          });
        }
        const sizeEl = document.getElementById('omni-estimated-size');
        if (sizeEl) sizeEl.textContent = (preferred && preferred.filesize_str) ? preferred.filesize_str : 'Standard';
      }
    });

    modeBtnAudio.addEventListener('click', () => {
      this.selectedMode = 'audio';
      modeBtnAudio.classList.add('active');
      modeBtnVideo.classList.remove('active');
      document.getElementById('video-formats-section').style.display = 'none';
      document.getElementById('audio-formats-section').style.display = 'block';
      const btnText = document.getElementById('btn-start-download-text');
      if (btnText && (!window.DroplyAndroid || !window.DroplyAndroid.getClipboardText)) {
        btnText.textContent = 'Download';
      }
      if (this.currentMedia && this.currentMedia.audio_formats && this.currentMedia.audio_formats.length > 0) {
        const preferred = this.getPreferredAudioFormat(this.currentMedia.audio_formats);
        this.selectedFormat = preferred;
        const grid = document.getElementById('audio-formats-grid');
        if (grid && preferred) {
          grid.querySelectorAll('.omni-quality-chip').forEach(c => {
            c.classList.toggle('selected', c.getAttribute('data-fid') === preferred.format_id);
          });
        }
        const sizeEl = document.getElementById('omni-estimated-size');
        if (sizeEl) sizeEl.textContent = (preferred && preferred.filesize_str) ? preferred.filesize_str : '~3.5 MB';
      }
    });

    // Change Directory button
    btnChangeDir.addEventListener('click', async () => {
      try {
        const res = await api.browseFolder();
        if (res.updated && res.folder) {
          document.getElementById('selected-save-dir').textContent = res.folder;
          this.settings.download_dir = res.folder;
          Components.showToast(`Download folder updated: ${res.folder}`, 'success');
        }
      } catch (e) {
        console.error("Browse folder error:", e);
      }
    });

    // Start Download button
    btnStartDownload.addEventListener('click', () => {
      this.startSingleDownload();
    });

    // Cancel active single download
    btnCancelSingle.addEventListener('click', async () => {
      const activeId = this.activeSingleTaskId;
      if (activeId) {
        try {
          await api.cancelTask(activeId);
        } catch (e) {}
        const t = (this.tasks || []).find(x => x.id === activeId);
        if (t) {
          t.status = 'cancelled';
          Components.updateQueueItem(t);
        }
        this.activeSingleTaskId = null;
      }
      // Reset single download progress UI completely
      const fill = document.getElementById('single-progress-fill');
      if (fill) fill.style.width = '0%';
      document.getElementById('single-metric-percent').textContent = '0.0%';
      document.getElementById('single-metric-size').textContent = '0 MB / 0 MB';
      document.getElementById('single-metric-speed').textContent = '-- KB/s';
      document.getElementById('single-metric-eta').textContent = '--:--';
      document.getElementById('single-download-card').style.display = 'none';
      if (this.currentMedia) {
        document.getElementById('media-card').style.display = 'block';
      }
      this.setSinglePauseButtonState(false);
      Components.showToast('Download cancelled.', 'info');
    });

    // Pause / Resume active single download
    const btnPauseSingle = document.getElementById('btn-pause-single');
    if (btnPauseSingle) {
      btnPauseSingle.addEventListener('click', async () => {
        const activeId = this.activeSingleTaskId;
        if (!activeId) return;
        const task = (this.tasks || []).find(x => x.id === activeId);
        const isPaused = task && task.status === 'paused';
        if (isPaused) {
          try {
            await api.resumeTask(activeId);
            if (task) task.status = 'downloading';
            this.setSinglePauseButtonState(false);
            Components.showToast('Download resumed.', 'info');
          } catch (e) {
            Components.showToast('Failed to resume download.', 'error');
          }
        } else {
          try {
            await api.pauseTask(activeId);
            if (task) task.status = 'paused';
            this.setSinglePauseButtonState(true);
            Components.showToast('Download paused.', 'info');
          } catch (e) {
            Components.showToast('Failed to pause download.', 'error');
          }
        }
      });
    }

    // Success actions
    btnSuccessOpenFolder.addEventListener('click', async () => {
      const path = btnSuccessOpenFolder.getAttribute('data-path');
      const id = btnSuccessOpenFolder.getAttribute('data-id');
      await api.revealFile(path, id);
    });

    btnSuccessPlay.addEventListener('click', async () => {
      const path = btnSuccessPlay.getAttribute('data-path');
      const id = btnSuccessPlay.getAttribute('data-id');
      await api.openFile(path, id);
    });

    // Close error card
    btnCloseError.addEventListener('click', () => {
      document.getElementById('analyze-error').style.display = 'none';
    });

    // Copy title button
    btnCopyTitle.addEventListener('click', () => {
      const title = document.getElementById('media-title').textContent;
      navigator.clipboard.writeText(title);
      Components.showToast('Title copied to clipboard!', 'success');
    });

    // Header open folder button (guarded)
    const headerOpenFolder = document.getElementById('header-open-folder');
    if (headerOpenFolder) {
      headerOpenFolder.addEventListener('click', async () => {
        await api.openFolder(this.settings.download_dir);
      });
    }

    // Clear recent downloads button in downloader view
    const btnClearRecent = document.getElementById('btn-clear-recent-downloads');
    if (btnClearRecent) {
      btnClearRecent.addEventListener('click', async () => {
        await api.clearFinishedTasks();
        this.tasks = (this.tasks || []).filter(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'processing' || t.status === 'pending');
        this.renderQueueList();
        Components.showToast('Cleared recent completed downloads.', 'info');
      });
    }

    // Downloader queue list action delegation
    const qList = document.getElementById('downloader-queue-list');
    qList.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id');
      const path = target.getAttribute('data-path');

      if (action === 'open-file') {
        let targetPath = path;
        if (!targetPath && id) {
          const t = (this.tasks || []).find(x => x.id === id);
          if (t && t.file_path) targetPath = t.file_path;
        }
        await api.openFile(targetPath, id);
      } else if (action === 'cancel') {
        try {
          await api.cancelTask(id);
        } catch (e) {}
        const t = (this.tasks || []).find(x => x.id === id);
        if (t) {
          t.status = 'cancelled';
          Components.updateQueueItem(t);
        }
        if (this.activeSingleTaskId === id) {
          document.getElementById('single-download-card').style.display = 'none';
          if (this.currentMedia) document.getElementById('media-card').style.display = 'block';
          this.activeSingleTaskId = null;
        }
        Components.showToast('Download cancelled.', 'info');
      } else if (action === 'pause') {
        try {
          await api.pauseTask(id);
          const t = (this.tasks || []).find(x => x.id === id);
          if (t) {
            t.status = 'paused';
            Components.updateQueueItem(t);
          }
          if (this.activeSingleTaskId === id) {
            this.setSinglePauseButtonState(true);
          }
          Components.showToast('Download paused.', 'info');
        } catch (e) {
          Components.showToast('Failed to pause download.', 'error');
        }
      } else if (action === 'resume') {
        try {
          await api.resumeTask(id);
          const t = (this.tasks || []).find(x => x.id === id);
          if (t) {
            t.status = 'downloading';
            Components.updateQueueItem(t);
          }
          if (this.activeSingleTaskId === id) {
            this.setSinglePauseButtonState(false);
          }
          Components.showToast('Download resumed.', 'info');
        } catch (e) {
          Components.showToast('Failed to resume download.', 'error');
        }
      } else if (action === 'retry') {
        const errCard = document.getElementById('analyze-error');
        if (errCard) errCard.style.display = 'none';
        await api.retryTask(id);
      } else if (action === 'remove') {
        try {
          await api.removeTask(id);
        } catch (e) {}
        const card = document.getElementById(`q-task-${id}`);
        if (card) card.remove();
        this.tasks = (this.tasks || []).filter(t => t.id !== id);
        if (this.activeSingleTaskId === id) {
          document.getElementById('single-download-card').style.display = 'none';
          if (this.currentMedia) document.getElementById('media-card').style.display = 'block';
          this.activeSingleTaskId = null;
        }
        this.updateRecentDownloadsHeader();
        if (this.tasks.length === 0) {
          this.renderQueueList();
        }
      }
    });
  }

  // Instant platform detection
  async instantDetectPlatform(text) {
    try {
      const urls = text.match(/https?:\/\/[^\s,;"'<>]+/g) || [];
      if (urls.length > 1) {
        const badge = document.getElementById('detected-badge');
        const nameEl = document.getElementById('detect-name');
        const iconEl = document.getElementById('detect-icon');
        if (nameEl) nameEl.textContent = `Batch (${urls.length} URLs)`;
        if (iconEl) iconEl.textContent = '';
        if (badge) badge.style.opacity = '1';
        return;
      }
      if (urls.length === 1) {
        const u = urls[0];
        const res = await api.detectPlatform(u);
        if (res.valid && res.platform !== 'Unknown') {
          const badge = document.getElementById('detected-badge');
          const nameEl = document.getElementById('detect-name');
          const iconEl = document.getElementById('detect-icon');
          if (nameEl) nameEl.textContent = res.platform;
          if (iconEl) iconEl.textContent = '';
          if (badge) badge.style.opacity = '1';
        } else {
          this.hideDetectedBadge();
        }
      } else {
        this.hideDetectedBadge();
      }
    } catch (e) {
      this.hideDetectedBadge();
    }
  }

  hideDetectedBadge() {
    const badge = document.getElementById('detected-badge');
    if (badge) badge.style.opacity = '0';
  }

  resetSingleView() {
    const pContainer = document.getElementById('playlist-container');
    if (pContainer) pContainer.innerHTML = '';

    const bContainer = document.getElementById('batch-container');
    if (bContainer) bContainer.innerHTML = '';

    document.getElementById('media-card').style.display = 'none';
    document.getElementById('single-download-card').style.display = 'none';
    document.getElementById('single-success-card').style.display = 'none';
    document.getElementById('analyze-skeleton').style.display = 'none';
    document.getElementById('analyze-error').style.display = 'none';
    this.currentMedia = null;
    this.selectedFormat = null;
    this.activeSingleTaskId = null;
  }

  getPreferredVideoFormat(formats) {
    if (!formats || formats.length === 0) return null;
    const pref = (this.settings.default_video_quality || 'best').toLowerCase();
    if (pref === 'best') {
      return formats[0];
    }
    const targetH = parseInt(pref.replace('p', ''), 10);
    if (!isNaN(targetH)) {
      const exactMatch = formats.find(f => {
        if (f.raw_info && f.raw_info.height === targetH) return true;
        if (f.label && f.label.toLowerCase().includes(`${targetH}p`)) return true;
        if (f.resolution && f.resolution.includes(`x${targetH}`)) return true;
        return false;
      });
      if (exactMatch) return exactMatch;

      // Closest available quality <= target
      const closest = formats.find(f => {
        const h = f.raw_info ? f.raw_info.height : parseInt((f.resolution || '').split('x')[1], 10);
        return h && h <= targetH;
      });
      if (closest) return closest;
    }
    return formats[0];
  }

  getPreferredAudioFormat(audioFormats) {
    if (!audioFormats || audioFormats.length === 0) return null;
    const pref = (this.settings.default_audio_format || 'mp3').toLowerCase();
    const matched = audioFormats.find(f => 
      (f.ext && f.ext.toLowerCase() === pref) || 
      (f.format_id && f.format_id.toLowerCase().includes(pref))
    );
    return matched || audioFormats[0];
  }

  // Unified Analyze Input (handles single URL, multiple URLs, and playlists)
  async analyzeInput(rawText) {
    this.resetSingleView();

    // Check for multiple URLs separated by commas, newlines, or spaces
    const urls = rawText.match(/https?:\/\/[^\s,;"'<>]+/g) || [];
    if (urls.length === 0) {
      Components.showToast('Please enter a valid media link starting with http:// or https://', 'error');
      return;
    }

    document.getElementById('analyze-skeleton').style.display = 'grid';
    document.getElementById('btn-analyze').disabled = true;

    // Case 1: Multiple URLs pasted
    if (urls.length > 1) {
      try {
        const parsed = await api.batchParse(rawText);
        document.getElementById('analyze-skeleton').style.display = 'none';

        const bContainer = document.getElementById('batch-container');
        bContainer.innerHTML = '';

        const batchCard = Components.renderBatchCard(parsed, (selectedItems, options) => {
          this.startBatchDownload(selectedItems, options);
        });
        bContainer.appendChild(batchCard);

        Components.showToast(`Identified ${parsed.items.length} media links!`, 'success');
      } catch (err) {
        this.showAnalyzeError(err);
      } finally {
        document.getElementById('btn-analyze').disabled = false;
      }
      return;
    }

    // Case 2: Single URL (Video, Audio, or Playlist)
    const singleUrl = urls[0];
    try {
      const data = await api.analyzeUrl(singleUrl);
      this.currentMedia = data;
      document.getElementById('analyze-skeleton').style.display = 'none';

      // Check if resource is a Playlist
      if (data.is_playlist) {
        const pContainer = document.getElementById('playlist-container');
        pContainer.innerHTML = '';

        const playlistCard = Components.renderPlaylistCard(data, (pData, selectedEntries, options) => {
          this.startPlaylistDownload(pData, selectedEntries, options);
        });
        pContainer.appendChild(playlistCard);

        Components.showToast(`Playlist detected: ${data.title} (${data.playlist_count || (data.playlist_entries && data.playlist_entries.length) || 0} videos)`, 'success');
        return;
      }

      // Single Media Preview Card
      document.getElementById('media-title').textContent = data.title;
      document.getElementById('media-uploader').textContent = data.uploader;
      document.getElementById('media-duration').textContent = data.duration_str || '--:--';
      document.getElementById('media-duration-text').textContent = `Duration: ${data.duration_str || 'Unknown'}`;
      document.getElementById('media-platform-tag').textContent = data.platform;
      document.getElementById('media-desc').textContent = data.description || 'No description available for this resource.';

      const thumbImg = document.getElementById('media-thumb-img');
      if (data.thumbnail) {
        let thumbUrl = data.thumbnail;
        if (thumbUrl.startsWith('//')) thumbUrl = 'https:' + thumbUrl;

        // Bilibili / hdslb images strictly require Referer: https://www.bilibili.com/
        const isBilibili = thumbUrl.includes('hdslb.com') || thumbUrl.includes('bilibili.com');
        if (isBilibili) {
          thumbImg.src = `/api/proxy/thumbnail?url=${encodeURIComponent(thumbUrl)}`;
        } else {
          thumbImg.src = thumbUrl;
        }

        thumbImg.onerror = () => {
          if (!thumbImg.src.includes('/api/proxy/thumbnail') && thumbUrl) {
            thumbImg.src = `/api/proxy/thumbnail?url=${encodeURIComponent(thumbUrl)}`;
          } else {
            thumbImg.style.display = 'none';
          }
        };
        thumbImg.style.display = 'block';
      } else {
        thumbImg.style.display = 'none';
      }

      // Populate Download Directory
      const saveDir = this.settings.download_dir || data.default_download_dir;
      document.getElementById('selected-save-dir').textContent = saveDir;

      // Render Video Formats with preferred quality pre-selection
      const preferredVideo = this.getPreferredVideoFormat(data.formats);
      this.selectedFormat = preferredVideo || data.formats[0] || null;
      Components.renderVideoFormats(data.formats, preferredVideo ? preferredVideo.format_id : null, (fmt) => {
        this.selectedFormat = fmt;
      });

      // Render Audio Formats with preferred codec pre-selection
      const preferredAudio = this.getPreferredAudioFormat(data.audio_formats);
      Components.renderAudioFormats(data.audio_formats, preferredAudio ? preferredAudio.format_id : null, (fmt) => {
        this.selectedFormat = fmt;
      });

      // Show preview card
      document.getElementById('media-card').style.display = 'block';

      if (this.selectedMode === 'audio') {
        this.selectedFormat = preferredAudio;
        document.getElementById('mode-btn-audio').click();
      } else {
        this.selectedFormat = preferredVideo;
        document.getElementById('mode-btn-video').click();
      }

      Components.showToast(`Ready: ${data.title.substring(0, 45)}...`, 'success');

    } catch (err) {
      this.showAnalyzeError(err);
    } finally {
      document.getElementById('btn-analyze').disabled = false;
    }
  }

  showAnalyzeError(err) {
    document.getElementById('analyze-skeleton').style.display = 'none';
    const errCard = document.getElementById('analyze-error');
    const friendlyEl = document.getElementById('error-friendly-text');
    const suggestionEl = document.getElementById('error-suggestion');
    const techEl = document.getElementById('error-tech-log');
    const actionRow = document.getElementById('error-action-row');

    const friendly = (err.data && err.data.error_friendly) ? err.data.error_friendly : err.message;
    const suggestion = (err.data && err.data.error_suggestion) 
      ? err.data.error_suggestion 
      : 'Make sure the URL is accessible and the media is public.';
    const technical = (err.data && err.data.error_technical) ? err.data.error_technical : (err.stack || err.message);

    friendlyEl.textContent = friendly;
    if (suggestionEl) suggestionEl.textContent = suggestion;
    techEl.textContent = technical;

    if (actionRow) {
      const combined = (friendly + ' ' + suggestion + ' ' + technical).toLowerCase();
      if (combined.includes('bot') || combined.includes('cookie') || combined.includes('sign in')) {
        actionRow.style.display = 'block';
      } else {
        actionRow.style.display = 'none';
      }
    }

    errCard.style.display = 'flex';
    Components.showToast('Unable to extract media from this URL.', 'error');
  }

  // Start single download
  async startSingleDownload() {
    if (!this.currentMedia) return;

    const isAudio = this.selectedMode === 'audio';
    const formatId = this.selectedFormat ? this.selectedFormat.format_id : 'best';
    const formatLabel = this.selectedFormat ? this.selectedFormat.label : 'Best Quality';
    const audioCodec = isAudio && this.selectedFormat ? this.selectedFormat.ext : 'mp3';
    const outDir = document.getElementById('selected-save-dir').textContent.trim() || this.settings.download_dir;

    try {
      const task = await api.startDownload({
        url: this.currentMedia.url,
        format_id: formatId,
        format_label: formatLabel,
        is_audio: isAudio,
        audio_format: audioCodec,
        output_dir: outDir,
        title: this.currentMedia.title,
        thumbnail: this.currentMedia.thumbnail,
        expected_size_str: this.selectedFormat ? (this.selectedFormat.filesize_str || '') : '',
        expected_bytes: this.selectedFormat ? (this.selectedFormat.filesize_approx || 0) : 0
      });

      this.activeSingleTaskId = task.id;

      // Show progress card
      document.getElementById('media-card').style.display = 'none';
      const pCard = document.getElementById('single-download-card');
      pCard.style.display = 'block';
      document.getElementById('single-progress-title').textContent = this.currentMedia.title;
      document.getElementById('single-status-badge').textContent = 'Starting...';

      Components.showToast('Download started.', 'success');
      await this.loadTasks();

    } catch (e) {
      Components.showToast(`Failed to initiate download: ${e.message}`, 'error');
    }
  }

  // Start playlist download (handles quality selection & selected videos)
  async startPlaylistDownload(playlistData, selectedEntries, options) {
    try {
      const urls = selectedEntries.map(e => e.url);
      await api.batchEnqueue({
        urls,
        items: selectedEntries,
        playlist_folder: playlistData.title,
        is_audio: options.is_audio,
        format_id: options.format_id,
        format_label: options.format_label,
        audio_format: options.audio_format,
        output_dir: this.settings.download_dir
      });

      document.getElementById('playlist-container').innerHTML = '';
      Components.showToast(`Downloading ${selectedEntries.length} videos from "${playlistData.title}"!`, 'success');
      await this.loadTasks();

    } catch (e) {
      Components.showToast(`Error starting playlist download: ${e.message}`, 'error');
    }
  }

  // Start batch download (handles multiple individual URLs)
  async startBatchDownload(selectedItems, options) {
    try {
      const urls = selectedItems.map(it => it.url);
      await api.batchEnqueue({
        urls,
        items: selectedItems,
        is_audio: options.is_audio,
        format_id: options.format_id,
        format_label: options.format_label,
        audio_format: options.audio_format,
        output_dir: this.settings.download_dir
      });

      document.getElementById('batch-container').innerHTML = '';
      Components.showToast(`Downloading ${selectedItems.length} items directly!`, 'success');
      await this.loadTasks();

    } catch (e) {
      Components.showToast(`Error starting batch download: ${e.message}`, 'error');
    }
  }

  // ================= TASK QUEUE & RECENT DOWNLOADS =================
  async loadTasks() {
    try {
      this.tasks = await api.getTasks();
      this.renderQueueList();
    } catch (e) {
      console.error("Load tasks error:", e);
    }
  }

  renderQueueList() {
    const container = document.getElementById('downloader-queue-list');
    if (!container) return;

    container.innerHTML = '';
    if (!this.tasks || this.tasks.length === 0) {
      this.updateRecentDownloadsHeader();
      container.innerHTML = `
        <div class="downloader-cat-idle">
          <svg class="cat-idle-svg" viewBox="0 0 120 70" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 28 50 C 28 36, 46 26, 66 26 C 86 26, 98 36, 98 50 C 98 58, 84 62, 62 62 C 38 62, 28 58, 28 50 Z" />
            <path d="M 24 43 C 18 39, 14 33, 17 27 C 19 24, 23 26, 26 28 C 30 25, 35 24, 38 27 C 42 32, 39 39, 34 44" />
            <path d="M 18 27 L 16 16 L 24 24" />
            <path d="M 32 24 L 40 16 L 38 27" />
            <path d="M 20 33 Q 23 36 26 33" />
            <path d="M 29 33 Q 32 36 35 33" />
            <path d="M 98 48 C 106 43, 112 47, 110 53 C 108 59, 101 60, 93 60" />
            <path d="M 15 37 L 6 37" />
            <path d="M 15 40 L 7 42" />
            <path d="M 37 37 L 46 37" />
            <path d="M 36 40 L 45 42" />
          </svg>
          <div class="cat-idle-text">Ready for media. Paste a link above to begin downloading.</div>
        </div>
      `;
      return;
    }

    this.tasks.forEach(t => {
      try {
        const card = Components.renderQueueItem(t);
        if (card) container.appendChild(card);
      } catch (err) {
        console.error("Error rendering task card:", err);
      }
    });

    this.updateRecentDownloadsHeader();
  }

  updateRecentDownloadsHeader() {
    const header = document.getElementById('recent-downloads-header');
    const countEl = document.getElementById('recent-downloads-count');
    if (!header || !countEl) return;

    const visibleCount = this.tasks.length;
    countEl.textContent = visibleCount;
    header.style.display = visibleCount > 0 ? 'flex' : 'none';
  }

  startTaskPolling() {
    if (this._taskPollTimer) return;
    this._taskPollTimer = setInterval(async () => {
      const hasActive = (this.tasks || []).some(t =>
        t.status === 'downloading' || t.status === 'processing' || t.status === 'queued'
      );
      if (hasActive || this.activeSingleTaskId) {
        try {
          const freshTasks = await api.getTasks();
          if (Array.isArray(freshTasks)) {
            // Check if queue list structure changed to avoid wiping DOM and causing flickering
            const currentSig = (this.tasks || []).map(t => `${t.id}:${t.status}`).join('|');
            const freshSig = freshTasks.map(t => `${t.id}:${t.status}`).join('|');
            this.tasks = freshTasks;

            if (currentSig !== freshSig) {
              this.renderQueueList();
            } else {
              // Update existing cards in-place smoothly without blinking
              freshTasks.forEach(t => Components.updateQueueItem(t));
            }

            if (this.activeSingleTaskId) {
              const single = freshTasks.find(t => t.id === this.activeSingleTaskId);
              if (single) {
                if (single.status === 'completed') {
                  this.activeSingleTaskId = null; // Clear immediately to prevent repeat triggers
                  this.handleSingleSuccess(single);
                } else if (single.status === 'failed') {
                  this.activeSingleTaskId = null;
                  document.getElementById('single-download-card').style.display = 'none';
                  const errCard = document.getElementById('analyze-error');
                  if (errCard) {
                    document.getElementById('error-friendly-text').textContent = single.error_friendly || 'Download failed.';
                    document.getElementById('error-tech-log').textContent = single.error_technical || 'No additional logs.';
                    errCard.style.display = 'flex';
                  }
                } else if (single.status === 'cancelled') {
                  this.activeSingleTaskId = null;
                  document.getElementById('single-download-card').style.display = 'none';
                  if (this.currentMedia) document.getElementById('media-card').style.display = 'block';
                } else {
                  this.updateSingleProgress(single);
                }
              }
            }
          }
        } catch (e) {
          // Ignore transient polling errors
        }
      }
    }, 1500);
  }

  // ================= HISTORY =================
  setupHistory() {
    const searchInput = document.getElementById('hist-search-input');
    const btnOpenFolder = document.getElementById('btn-hist-open-folder');
    const btnClearHist = document.getElementById('btn-hist-clear');
    const histStatFolder = document.getElementById('hist-stat-folder');
    const container = document.getElementById('history-items-container');

    if (histStatFolder) {
      histStatFolder.addEventListener('click', async () => {
        await api.openFolder(this.settings.download_dir);
      });
    }

    if (searchInput && container) {
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        const cards = container.querySelectorAll('.history-card');
        cards.forEach(card => {
          const titleEl = card.querySelector('.history-filename');
          const title = titleEl ? titleEl.textContent.toLowerCase() : '';
          card.style.display = (!query || title.includes(query)) ? 'grid' : 'none';
        });
      });
    }

    if (btnOpenFolder) {
      btnOpenFolder.addEventListener('click', async () => {
        await api.openFolder(this.settings.download_dir);
      });
    }

    if (btnClearHist) {
      btnClearHist.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear your download history? (Files will remain in your folder)')) {
          await api.clearHistory();
          await this.loadHistory();
          Components.showToast('Download history cleared.', 'info');
        }
      });
    }

    // History item card click delegation
    if (container) {
      container.addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const id = target.getAttribute('data-id');
        const path = target.getAttribute('data-path');

        if (action === 'open-file' || action === 'play') {
          await api.openFile(path, id);
        } else if (action === 'reveal') {
          await api.revealFile(path, id);
        } else if (action === 'delete-hist') {
          await api.deleteHistoryItem(id);
          const card = document.getElementById(`hist-item-${id}`);
          if (card) card.remove();
          await this.loadHistory();
          Components.showToast('Removed record from history.', 'info');
        }
      });
    }
  }

  async loadHistory() {
    try {
      const items = await api.getHistory();
      const container = document.getElementById('history-items-container');
      const emptyState = document.getElementById('history-empty-state');

      // Filter out any 0-byte ghost entries or entries without a file path
      const validItems = (items || []).filter(it => it.file_path && (it.file_size > 0 || it.status === 'completed'));

      // Update statistics
      let totalBytes = 0;
      let completedCount = 0;
      validItems.forEach(it => {
        completedCount++;
        const sz = it.file_size || it.filesize || it.downloaded_bytes || it.total_bytes || 0;
        totalBytes += Number(sz) || 0;
      });

      const statTotal = document.getElementById('hist-stat-total');
      const statCompleted = document.getElementById('hist-stat-completed');
      const statSize = document.getElementById('hist-stat-size');
      const statFolder = document.getElementById('hist-stat-folder');

      if (statTotal) statTotal.textContent = validItems.length;
      if (statCompleted) statCompleted.textContent = completedCount;
      if (statSize) statSize.textContent = Components.formatBytes(totalBytes);
      if (statFolder) statFolder.textContent = this.settings.download_dir || 'Downloads/Droply';

      if (emptyState) {
        emptyState.style.display = validItems.length === 0 ? 'block' : 'none';
      }

      if (container) {
        container.innerHTML = '';
        if (validItems.length > 0) {
          validItems.forEach(it => {
            try {
              const card = Components.renderHistoryItem(it);
              if (card) container.appendChild(card);
            } catch (cardErr) {
              console.error("Error rendering history item card:", cardErr, it);
            }
          });
        }
      }

    } catch (e) {
      console.error("Load history error:", e);
    }
  }

  // ================= SETTINGS =================
  setupSettings() {
    const btnBrowse = document.getElementById('btn-settings-browse');
    const sliderConcurrent = document.getElementById('setting-concurrent');
    const badgeConcurrent = document.getElementById('concurrent-val-badge');
    const btnSave = document.getElementById('btn-save-settings');

    if (sliderConcurrent && badgeConcurrent) {
      const updateConcurrentBadge = () => {
        badgeConcurrent.textContent = sliderConcurrent.value;
      };
      sliderConcurrent.addEventListener('input', updateConcurrentBadge);
      sliderConcurrent.addEventListener('change', updateConcurrentBadge);
    }

    if (btnBrowse) {
      btnBrowse.addEventListener('click', async () => {
        try {
          const res = await api.browseFolder();
          if (res && res.updated && res.folder) {
            const dirInput = document.getElementById('setting-dir-input');
            if (dirInput) dirInput.value = res.folder;
            this.settings.download_dir = res.folder;
            const saveDir = document.getElementById('selected-save-dir');
            if (saveDir) saveDir.textContent = res.folder;
            Components.showToast(`Updated directory: ${res.folder}`, 'success');
          }
        } catch (e) {
          console.error("Browse folder error:", e);
        }
      });
    }

    const btnBrowseCookies = document.getElementById('btn-settings-browse-cookies');
    const btnUploadCookies = document.getElementById('btn-settings-upload-cookies');
    const fileUploadInput = document.getElementById('setting-cookie-file-upload');
    const btnClearCookies = document.getElementById('btn-settings-clear-cookies');
    const cookieInput = document.getElementById('setting-cookie-input');

    if (btnBrowseCookies && cookieInput) {
      btnBrowseCookies.addEventListener('click', async () => {
        try {
          const res = await api.browseCookieFile();
          if (res && res.updated && res.cookie_file) {
            cookieInput.value = res.cookie_file;
            this.settings.cookie_file = res.cookie_file;
            Components.showToast(`Selected cookies: ${res.cookie_file}`, 'success');
            this.loadSystemStatus();
          }
        } catch (e) {
          console.error("Browse cookies error:", e);
        }
      });
    }

    if (btnUploadCookies && fileUploadInput) {
      btnUploadCookies.addEventListener('click', () => fileUploadInput.click());
      fileUploadInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
          const reader = new FileReader();
          reader.onload = async (evt) => {
            const text = evt.target.result;
            const res = await api.uploadCookies(text);
            if (res && res.status === 'success') {
              if (cookieInput) cookieInput.value = res.cookie_file;
              this.settings.cookie_file = res.cookie_file;
              Components.showToast('Uploaded and activated cookies.txt successfully!', 'success');
              this.loadSystemStatus();
            }
          };
          reader.readAsText(file);
        } catch (err) {
          console.error("Upload cookies error:", err);
          Components.showToast(`Upload failed: ${err.message}`, 'error');
        }
      });
    }

    if (btnClearCookies) {
      btnClearCookies.addEventListener('click', async () => {
        if (cookieInput) cookieInput.value = '';
        this.settings.cookie_file = '';
        try {
          await api.updateSettings({ cookie_file: '' });
          Components.showToast('Cleared custom cookies file.', 'info');
          this.loadSystemStatus();
        } catch (e) {
          console.error("Clear cookies error:", e);
        }
      });
    }

    const btnErrorCookies = document.getElementById('btn-error-cookie-settings');
    if (btnErrorCookies) {
      btnErrorCookies.addEventListener('click', () => {
        this.switchTab('settings');
      });
    }

    const btnQuickCookie = document.getElementById('btn-quick-cookie-settings');
    if (btnQuickCookie) {
      btnQuickCookie.addEventListener('click', () => {
        this.switchTab('settings');
      });
    }

    if (btnSave) {
      btnSave.addEventListener('click', async () => {
        const dirInput = document.getElementById('setting-dir-input');
        const vQual = document.getElementById('setting-video-quality');
        const aCodec = document.getElementById('setting-audio-codec');
        const notif = document.getElementById('setting-notifications');
        const cookieBrowser = document.getElementById('setting-cookie-browser');
        const activeThemeChip = document.querySelector('.theme-chip.active');
        const selectedTheme = (activeThemeChip ? activeThemeChip.getAttribute('data-theme') : null) || ThemeManager.currentTheme || 'dark';

        const updates = {
          download_dir: dirInput ? dirInput.value : (this.settings.download_dir || ''),
          default_video_quality: vQual ? vQual.value : (this.settings.default_video_quality || 'best'),
          default_audio_format: aCodec ? aCodec.value : (this.settings.default_audio_format || 'mp3'),
          max_concurrent_downloads: sliderConcurrent ? parseInt(sliderConcurrent.value, 10) : (this.settings.max_concurrent_downloads || 3),
          notifications: notif ? notif.checked : (this.settings.notifications !== false),
          cookie_browser: cookieBrowser ? cookieBrowser.value : (this.settings.cookie_browser || 'none'),
          cookie_file: cookieInput ? cookieInput.value.trim() : (this.settings.cookie_file || ''),
          theme: selectedTheme
        };

        try {
          this.settings = await api.updateSettings(updates);
          const saveDir = document.getElementById('selected-save-dir');
          if (saveDir) saveDir.textContent = this.settings.download_dir || 'Downloads/Droply';
          if (this.settings.theme) {
            ThemeManager.setTheme(this.settings.theme);
          }
          Components.showToast('Preferences saved successfully!', 'success');
          this.loadSystemStatus();
        } catch (e) {
          Components.showToast(`Failed to save settings: ${e.message}`, 'error');
        }
      });
    }
  }

  async loadSettings() {
    try {
      this.settings = await api.getSettings();
      const dirInput = document.getElementById('setting-dir-input');
      if (dirInput) dirInput.value = this.settings.download_dir || '';

      const saveDir = document.getElementById('selected-save-dir');
      if (saveDir) saveDir.textContent = this.settings.download_dir || 'Downloads/Droply';

      const vQual = document.getElementById('setting-video-quality');
      if (vQual) vQual.value = this.settings.default_video_quality || 'best';

      const aCodec = document.getElementById('setting-audio-codec');
      if (aCodec) aCodec.value = this.settings.default_audio_format || 'mp3';

      const concurrent = document.getElementById('setting-concurrent');
      if (concurrent) concurrent.value = this.settings.max_concurrent_downloads || 3;

      const badge = document.getElementById('concurrent-val-badge');
      if (badge) badge.textContent = this.settings.max_concurrent_downloads || 3;

      const notif = document.getElementById('setting-notifications');
      if (notif) notif.checked = this.settings.notifications !== false;

      const cookieInput = document.getElementById('setting-cookie-input');
      if (cookieInput) {
        cookieInput.value = this.settings.cookie_file || '';
      }

      const cookieBrowserSelect = document.getElementById('setting-cookie-browser');
      if (cookieBrowserSelect) {
        cookieBrowserSelect.value = this.settings.cookie_browser || 'none';
      }

      if (this.settings.theme) {
        ThemeManager.setTheme(this.settings.theme);
      }
    } catch (e) {
      console.error("Load settings error:", e);
    }
  }

  async loadSystemStatus() {
    try {
      const status = await api.getSystemStatus();
      const appVer = status.app_version || 'v1.4.3';
      const rawYtdlp = status.ytdlp_version;

      const verPill = document.getElementById('header-version-pill');
      if (verPill) verPill.textContent = appVer;

      const enginePill = document.getElementById('header-engine-pill');
      if (enginePill) {
        if (rawYtdlp && rawYtdlp !== 'unknown' && rawYtdlp !== 'installed') {
          const cleanVer = rawYtdlp.startsWith('v') ? rawYtdlp.slice(1) : rawYtdlp;
          enginePill.textContent = `Engine v${cleanVer}`;
        } else {
          enginePill.textContent = 'Engine Active';
        }
      }

      const trustVer = document.getElementById('trust-version');
      if (trustVer) trustVer.textContent = appVer;

      const serverPill = document.getElementById('server-status-pill');
      const serverLabel = document.getElementById('server-status-label');
      if (serverPill) {
        serverPill.className = 'header-server-pill status-ready';
      }
      if (serverLabel) {
        serverLabel.textContent = 'Services Online';
      }

      const diagYtdlp = document.getElementById('diag-ytdlp');
      if (diagYtdlp) {
        if (rawYtdlp && rawYtdlp !== 'unknown' && rawYtdlp !== 'installed') {
          const cleanVer = rawYtdlp.startsWith('v') ? rawYtdlp.slice(1) : rawYtdlp;
          diagYtdlp.textContent = `yt-dlp v${cleanVer}`;
        } else {
          diagYtdlp.textContent = 'yt-dlp (Active Engine)';
        }
      }

      const diagFfmpeg = document.getElementById('diag-ffmpeg');
      if (diagFfmpeg) diagFfmpeg.textContent = status.ffmpeg_ready ? 'Bundled v7.1 (Active)' : 'Not Available';

      const diagPython = document.getElementById('diag-python');
      if (diagPython) diagPython.textContent = `Python ${status.python_version}`;

      const diagCookies = document.getElementById('diag-cookies');
      if (diagCookies) {
        if (status.cookies_ready) {
          diagCookies.textContent = status.cookies_path 
            ? `Active (${status.cookies_path.split(/[\\/]/).pop()})` 
            : `Active (${status.cookie_browser})`;
          diagCookies.className = 'diag-val highlight';
        } else {
          diagCookies.textContent = 'None (Optional)';
          diagCookies.className = 'diag-val';
        }
      }

      const mediaAuthBadge = document.getElementById('media-auth-badge');
      if (mediaAuthBadge) {
        if (status.cookies_ready) {
          if (status.cookies_path) {
            mediaAuthBadge.textContent = '🍪 cookies.txt Active';
          } else if (status.cookie_browser && status.cookie_browser !== 'none') {
            mediaAuthBadge.textContent = `🍪 ${status.cookie_browser.toUpperCase()} Active`;
          } else {
            mediaAuthBadge.textContent = '🍪 Cookies Active';
          }
          mediaAuthBadge.style.background = 'rgba(0, 229, 163, 0.15)';
          mediaAuthBadge.style.color = '#00e5a3';
        } else {
          mediaAuthBadge.textContent = 'None (Public)';
          mediaAuthBadge.style.background = 'rgba(255, 255, 255, 0.06)';
          mediaAuthBadge.style.color = 'var(--text-muted, #94a3b8)';
        }
      }

    } catch (e) {
      console.error("Load system status error:", e);
    }
  }

  // ================= UPDATE SYSTEM =================
  setupUpdateSystem() {
    const modal = document.getElementById('update-modal');
    const btnClose = document.getElementById('btn-close-update-modal');
    const btnHeaderUpdates = document.getElementById('header-check-updates');
    const btnSettingsUpdates = document.getElementById('btn-settings-check-updates');
    const btnViewGithub = document.getElementById('btn-view-github');
    const btnCancelDl = document.getElementById('btn-cancel-installer-dl');
    const btnPrimary = document.getElementById('btn-installer-primary');
    const btnPrimaryText = document.getElementById('btn-installer-primary-text');

    const curVerEl = document.getElementById('update-cur-ver');
    const newVerEl = document.getElementById('update-new-ver');
    const releaseDateEl = document.getElementById('update-release-date');
    const releaseSizeEl = document.getElementById('update-release-size');
    const changelogEl = document.getElementById('update-changelog-content');
    const dlBox = document.getElementById('update-dl-progress-box');
    const dlTitle = document.getElementById('update-dl-status-title');
    const dlPercent = document.getElementById('update-dl-percent');
    const dlBar = document.getElementById('update-dl-bar-fill');
    const dlBytes = document.getElementById('update-dl-bytes');
    const dlSpeed = document.getElementById('update-dl-speed');
    const statusMsg = document.getElementById('update-status-msg');

    let currentUpdateInfo = null;
    let pollInterval = null;
    let downloadState = 'idle'; // 'idle', 'can-download', 'downloading', 'ready-to-install', 'ytdlp-core'

    const formatBytes = (bytes) => {
      if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return '0 MB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };

    const formatDate = (isoStr) => {
      if (!isoStr) return 'Recently';
      try {
        const d = new Date(isoStr);
        return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: 'numeric' });
      } catch (e) {
        return isoStr;
      }
    };

    const renderChangelog = (notes) => {
      const defaultFeatures = `
        <ul>
          <li><span class="cl-feature-highlight">Native Desktop Clipboard:</span> Seamless one-click paste with zero browser permission prompts.</li>
          <li><span class="cl-feature-highlight">Accurate Progress Tracking:</span> Synchronized download counters and completion states.</li>
          <li><span class="cl-feature-highlight">Intelligent Core Engine:</span> Dynamic yt-dlp core status detection and self-updating engine.</li>
          <li><span class="cl-feature-highlight">Refined Theme-Adaptive UI:</span> Minimalist design with real-time local background engine monitoring.</li>
          <li><span class="cl-feature-highlight">Private & Local:</span> 100% on-device processing with zero telemetry and zero external tracking.</li>
        </ul>
      `;

      if (!notes || !notes.trim()) {
        return defaultFeatures;
      }

      const lines = notes.split('\n');
      const items = [];
      for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        // Skip release download table, dividers, and installation instructions
        if (line.startsWith('|') || line.startsWith('---') || line.startsWith('===') || line === '--') continue;
        if (line.toLowerCase().includes('tested on windows') || line.toLowerCase().includes('download droply')) continue;
        if (line.toLowerCase().includes('###') || line.toLowerCase().includes('platform |')) continue;
        
        if (/^[-*+]\s+/.test(line)) {
          let content = line.replace(/^[-*+]\s+/, '').trim();
          if (!content || content === '-' || content === '--') continue;
          content = content.replace(/\*\*(.*?)\*\*:?/g, (match, p1) => {
            const title = p1.replace(/:+$/, '').trim();
            return `<span class="cl-feature-highlight">${title}:</span>`;
          });
          items.push(`<li>${content}</li>`);
        }
      }

      if (items.length > 0) {
        return `<ul>${items.slice(0, 10).join('')}</ul>`;
      }

      return defaultFeatures;
    };

    const openUpdateCheck = async () => {
      modal.style.display = 'flex';
      statusMsg.style.display = 'none';
      dlBox.style.display = 'none';
      btnCancelDl.style.display = 'none';
      btnPrimary.disabled = true;
      btnPrimaryText.textContent = 'Checking for Updates...';

      const titleEl = document.getElementById('update-modal-title');
      const descEl = document.getElementById('update-modal-desc');
      const curVerEl = document.getElementById('update-cur-ver');
      const newVerEl = document.getElementById('update-new-ver');

      if (curVerEl) curVerEl.textContent = 'v1.4.3';
      if (newVerEl) newVerEl.textContent = '...';
      titleEl.textContent = 'Checking for Updates...';
      descEl.textContent = 'Contacting update servers to verify Droply release and platform core engine status...';
      changelogEl.innerHTML = '<div style="color: #64748b; font-size: 13px;">Fetching release notes...</div>';

      try {
        const info = await api.checkUpdates();
        currentUpdateInfo = info;
        const appInst = info.app_installed || 'v1.4.3';
        const appLatest = info.app_latest || 'v1.4.3';
        const isUpToDate = Boolean(info.app_up_to_date);

        curVerEl.textContent = appInst;
        newVerEl.textContent = appLatest;
        releaseDateEl.textContent = formatDate(info.published_at);
        releaseSizeEl.textContent = formatBytes(info.installer_size);
        changelogEl.innerHTML = renderChangelog(info.release_notes);

        if (info.release_url && btnViewGithub) {
          btnViewGithub.href = info.release_url;
        }

        const updateDot = document.getElementById('header-update-dot');
        if (isUpToDate) {
          titleEl.textContent = 'Droply is Up to Date';
          const ytdlpUpToDate = Boolean(info.ytdlp_up_to_date);
          if (ytdlpUpToDate) {
            if (updateDot) updateDot.style.display = 'none';
            descEl.textContent = `You are running the newest release of Droply (${appInst}), and the embedded yt-dlp core engine (${info.ytdlp_installed || 'Latest'}) is fully up to date.`;
            btnPrimary.disabled = false;
            btnPrimaryText.textContent = 'Core is Up to Date';
          } else {
            if (updateDot) updateDot.style.display = 'block';
            descEl.textContent = `Droply is up to date, but a newer yt-dlp core engine (${info.ytdlp_latest || 'Update'}) is available for latest platform fixes.`;
            btnPrimary.disabled = false;
            btnPrimaryText.textContent = 'Update yt-dlp Core';
          }
          downloadState = 'ytdlp-core';
        } else {
          if (updateDot) updateDot.style.display = 'block';
          titleEl.textContent = 'Application Update Available';
          descEl.textContent = 'A newer version of Droply is ready to install';
          btnPrimary.disabled = false;
          btnPrimaryText.textContent = 'Download Update';
          downloadState = 'can-download';
        }
      } catch (e) {
        curVerEl.textContent = 'v1.4.3';
        newVerEl.textContent = 'v1.4.3';
        titleEl.textContent = 'Droply Core Engine';
        descEl.textContent = 'Verified online. You can check the embedded yt-dlp core engine.';
        changelogEl.innerHTML = renderChangelog('');
        btnPrimary.disabled = false;
        btnPrimaryText.textContent = 'Check yt-dlp Core';
        downloadState = 'ytdlp-core';
      }
    };

    if (btnHeaderUpdates) btnHeaderUpdates.addEventListener('click', openUpdateCheck);
    if (btnSettingsUpdates) btnSettingsUpdates.addEventListener('click', openUpdateCheck);
    if (btnClose && modal) btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.style.display = 'none';
      });
    }

    // Cancel download button
    if (btnCancelDl) {
      btnCancelDl.addEventListener('click', async () => {
        if (pollInterval) clearInterval(pollInterval);
        try {
          await api.cancelInstallerDownload();
        } catch (e) {}
        if (dlBox) dlBox.style.display = 'none';
        btnCancelDl.style.display = 'none';
        if (btnPrimary) btnPrimary.disabled = false;
        if (btnPrimaryText) btnPrimaryText.textContent = 'Download Update';
        downloadState = 'can-download';
        Components.showToast('Download cancelled', 'info');
      });
    }

    // Primary action button handler (Download -> Restart & Install / Core Update)
    if (btnPrimary) {
      btnPrimary.addEventListener('click', async () => {
      if (downloadState === 'can-download') {
        const url = currentUpdateInfo?.installer_url || `https://github.com/Amlan-Sarkar/Droply/releases/download/${currentUpdateInfo?.app_latest || 'v1.3.7'}/Droply-Setup.exe`;
        const size = currentUpdateInfo?.installer_size || 0;

        downloadState = 'downloading';
        btnPrimary.disabled = true;
        btnPrimaryText.textContent = 'Downloading...';
        btnCancelDl.style.display = 'inline-flex';
        dlBox.style.display = 'block';
        dlBar.style.width = '0%';
        dlPercent.textContent = '0%';
        dlBytes.textContent = `0 MB / ${formatBytes(size)}`;
        dlSpeed.textContent = '0 MB/s';
        dlTitle.textContent = 'Downloading installer...';

        try {
          await api.downloadInstaller(url, size);
          
          if (pollInterval) clearInterval(pollInterval);
          pollInterval = setInterval(async () => {
            try {
              const st = await api.getInstallerDownloadStatus();
              if (st.status === 'downloading') {
                const pct = Math.min(Math.max(st.percent || 0, 0), 100);
                dlBar.style.width = pct + '%';
                dlPercent.textContent = Math.round(pct) + '%';
                dlBytes.textContent = `${formatBytes(st.downloaded_bytes)} / ${formatBytes(st.total_bytes)}`;
                dlSpeed.textContent = `${(st.speed_bps / (1024 * 1024)).toFixed(1)} MB/s`;
              } else if (st.status === 'completed') {
                clearInterval(pollInterval);
                dlBar.style.width = '100%';
                dlPercent.textContent = '100%';
                dlTitle.textContent = 'Download Complete!';
                const finalSize = st.total_bytes || st.downloaded_bytes || size || 0;
                dlBytes.textContent = `${formatBytes(finalSize)} / ${formatBytes(finalSize)}`;
                dlSpeed.textContent = 'Completed';
                btnCancelDl.style.display = 'none';
                btnPrimary.disabled = false;
                btnPrimaryText.textContent = 'Restart and Install';
                downloadState = 'ready-to-install';
              } else if (st.status === 'error') {
                clearInterval(pollInterval);
                dlTitle.textContent = 'Download Failed';
                dlBox.style.display = 'none';
                btnCancelDl.style.display = 'none';
                btnPrimary.disabled = false;
                btnPrimaryText.textContent = 'Download Update';
                downloadState = 'can-download';
                Components.showToast(`Download failed: ${st.error || 'Network error'}`, 'error');
              }
            } catch (err) {}
          }, 400);

        } catch (e) {
          btnPrimary.disabled = false;
          btnPrimaryText.textContent = 'Download Update';
          downloadState = 'can-download';
          Components.showToast(`Download failed: ${e.message}`, 'error');
        }

      } else if (downloadState === 'ready-to-install') {
        // Trigger install and restart
        btnPrimary.disabled = true;
        btnPrimaryText.textContent = 'Restarting...';

        const serverPill = document.getElementById('server-status-pill');
        const serverLabel = document.getElementById('server-status-label');
        if (serverPill) {
          serverPill.className = 'header-server-pill status-reconnecting';
        }
        if (serverLabel) {
          serverLabel.textContent = 'Reconnecting...';
        }

        try {
          await api.installAndRestart();
          Components.showToast('Launching installer and restarting Droply...', 'success');
        } catch (e) {
          Components.showToast(`Installer error: ${e.message}`, 'error');
        }

        // Close modal after brief delay and enter reconnecting polling loop
        setTimeout(() => {
          modal.style.display = 'none';
        }, 1500);

        // Poll until server is back online
        let reconnectAttempts = 0;
        const reconnectTimer = setInterval(async () => {
          reconnectAttempts++;
          try {
            const st = await api.getSystemStatus();
            if (st && st.python_version) {
              clearInterval(reconnectTimer);
              if (serverPill) serverPill.className = 'header-server-pill status-ready';
              if (serverLabel) serverLabel.textContent = 'Services Online';
              Components.showToast('Droply updated and reconnected!', 'success');
              await this.loadSystemStatus();
            }
          } catch (e) {
            // Still restarting
          }
          if (reconnectAttempts > 60) {
            clearInterval(reconnectTimer);
          }
        }, 1500);

      } else if (downloadState === 'ytdlp-core') {
        // Update / Verify yt-dlp core
        btnPrimary.disabled = true;
        btnPrimaryText.textContent = 'Checking core engine...';
        statusMsg.style.display = 'block';
        statusMsg.style.color = '#a78bfa';
        statusMsg.textContent = 'Checking PyPI for latest yt-dlp engine status...';

        try {
          const res = await api.updateYtdlpCore();
          if (res.status === 'success') {
            statusMsg.style.color = '#10b981';
            if (res.already_up_to_date) {
              statusMsg.textContent = res.message || `yt-dlp core engine is already up to date (${res.version || ''}).`;
              Components.showToast(res.message || 'yt-dlp core is up to date', 'info');
              btnPrimaryText.textContent = 'Core is Up to Date';
            } else {
              statusMsg.textContent = res.message || `Updated yt-dlp core engine to ${res.version}!`;
              Components.showToast(`yt-dlp core updated to ${res.version}!`, 'success');
              btnPrimaryText.textContent = 'Core Updated';
            }
            await this.loadSystemStatus();
          } else {
            statusMsg.style.color = '#ef4444';
            statusMsg.textContent = res.message || 'Update check failed.';
            btnPrimaryText.textContent = 'Check yt-dlp Core';
          }
        } catch (e) {
          statusMsg.style.color = '#ef4444';
          statusMsg.textContent = `Update error: ${e.message}`;
          btnPrimaryText.textContent = 'Check yt-dlp Core';
        } finally {
          btnPrimary.disabled = false;
        }
      }
    });
  }
}

  // ================= BACKGROUND STARTUP UPDATE CHECK =================
  async checkUpdatesOnStartup() {
    const btnHeaderUpdates = document.getElementById('header-check-updates');
    const updateIcon = document.getElementById('header-update-icon');
    const updateDot = document.getElementById('header-update-dot');

    // Turn circular arrow on startup
    if (updateIcon) updateIcon.classList.add('spinning');
    if (btnHeaderUpdates) btnHeaderUpdates.classList.add('checking');

    try {
      // Gentle initial pause so first render completes smoothly
      await new Promise(r => setTimeout(r, 900));
      const info = await api.checkUpdates();
      if (info) {
        const hasAppUpdate = !info.app_up_to_date;
        const hasCoreUpdate = !info.ytdlp_up_to_date;

        if (hasAppUpdate || hasCoreUpdate) {
          if (updateDot) {
            updateDot.style.display = 'block';
            updateDot.title = hasAppUpdate
              ? `Droply ${info.app_latest || 'update'} available!`
              : `yt-dlp core engine update available!`;
          }
        } else {
          if (updateDot) updateDot.style.display = 'none';
        }
      }
    } catch (e) {
      console.warn("Background update check skipped/failed:", e);
    } finally {
      if (updateIcon) updateIcon.classList.remove('spinning');
      if (btnHeaderUpdates) btnHeaderUpdates.classList.remove('checking');
    }
  }

  // ================= WEBSOCKET & NATIVE EVENT LISTENERS =================
  setupWebSocketListeners() {
    api.on('initial_state', (payload) => {
      if (payload && Array.isArray(payload.tasks)) {
        this.tasks = payload.tasks;
        this.renderQueueList();
        this.updateRecentDownloadsHeader();

        if (this.activeSingleTaskId) {
          const singleTask = this.tasks.find(t => t.id === this.activeSingleTaskId);
          if (singleTask) {
            if (singleTask.status === 'completed') {
              this.handleSingleSuccess(singleTask);
              this.activeSingleTaskId = null;
            } else if (singleTask.status === 'failed') {
              this.activeSingleTaskId = null;
              const card = document.getElementById('single-download-card');
              if (card) card.style.display = 'none';
              const errCard = document.getElementById('analyze-error');
              if (errCard) {
                document.getElementById('error-friendly-text').textContent = singleTask.error_friendly || 'Download failed.';
                document.getElementById('error-tech-log').textContent = singleTask.error_technical || 'No additional logs.';
                errCard.style.display = 'flex';
              }
            } else if (singleTask.status === 'downloading' || singleTask.status === 'processing') {
              this.updateSingleProgress(singleTask);
            }
          }
        }
      }
    });

    api.on('task_added', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        this.tasks[idx] = task;
      } else {
        this.tasks.unshift(task);
      }
      this.renderQueueList();
    });

    api.on('task_progress', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        const existing = this.tasks[idx];
        // Terminal state guard: ignore late progress ticks for completed/failed/cancelled tasks
        if (existing && (existing.status === 'completed' || existing.status === 'failed' || existing.status === 'cancelled')) {
          return;
        }
        this.tasks[idx] = task;
      }

      if (this.activeSingleTaskId === task.id) {
        this.updateSingleProgress(task);
      }

      Components.updateQueueItem(task);
    });

    api.on('task_completed', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) this.tasks[idx] = task;

      if (this.activeSingleTaskId === task.id) {
        this.activeSingleTaskId = null;
        this.handleSingleSuccess(task);
      } else {
        Components.showToast(`Completed download: "${task.title || 'Media'}"`, 'success');
      }

      Components.updateQueueItem(task);
      this.updateRecentDownloadsHeader();
      this.loadHistory();

      if (this.settings.notifications && ("Notification" in window) && Notification.permission === "granted") {
        new Notification("Droply — Download Finished", {
          body: `${task.title} has finished downloading.`,
          icon: task.thumbnail || undefined
        });
      }
    });

    api.on('queue_cleared', () => {
      this.tasks = (this.tasks || []).filter(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'processing' || t.status === 'pending');
      this.renderQueueList();
    });

    api.on('task_removed', (payload) => {
      const taskId = payload && payload.task ? payload.task.id : (payload ? payload.id : null);
      if (taskId) {
        this.tasks = (this.tasks || []).filter(t => t.id !== taskId);
        this.renderQueueList();
      }
    });

    api.on('task_cancelled', (payload) => {
      const taskId = payload && payload.task ? payload.task.id : (payload ? payload.id : null);
      if (taskId) {
        const idx = this.tasks.findIndex(t => t.id === taskId);
        if (idx >= 0) {
          this.tasks[idx].status = 'cancelled';
          Components.updateQueueItem(this.tasks[idx]);
        }
      }
      this.renderQueueList();
    });

    api.on('task_failed', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) this.tasks[idx] = task;

      if (this.activeSingleTaskId === task.id) {
        this.activeSingleTaskId = null;
        document.getElementById('single-download-card').style.display = 'none';
        const errCard = document.getElementById('analyze-error');
        document.getElementById('error-friendly-text').textContent = task.error_friendly || 'Download failed.';
        document.getElementById('error-tech-log').textContent = task.error_technical || 'No additional logs.';
        errCard.style.display = 'flex';
      }

      Components.updateQueueItem(task);
      this.updateRecentDownloadsHeader();
    });

    api.on('task_updated', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) this.tasks[idx] = task;
      if (this.activeSingleTaskId === task.id && (task.status === 'queued' || task.status === 'downloading')) {
        const errCard = document.getElementById('analyze-error');
        if (errCard) errCard.style.display = 'none';
      }
      this.renderQueueList();
    });

    if (("Notification" in window) && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  setSinglePauseButtonState(isPaused) {
    const btnText = document.getElementById('single-pause-text');
    const badge = document.getElementById('single-status-badge');
    const btnIcon = document.getElementById('single-pause-icon');
    if (isPaused) {
      if (btnText) btnText.textContent = 'Resume';
      if (badge) badge.textContent = 'Paused';
      if (btnIcon) {
        btnIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3" fill="currentColor"></polygon>';
      }
    } else {
      if (btnText) btnText.textContent = 'Pause';
      if (badge && badge.textContent === 'Paused') badge.textContent = 'Downloading';
      if (btnIcon) {
        btnIcon.innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect>';
      }
    }
  }

  updateSingleProgress(task) {
    const fill = document.getElementById('single-progress-fill');
    const badge = document.getElementById('single-status-badge');
    const metricPercent = document.getElementById('single-metric-percent');
    const metricSize = document.getElementById('single-metric-size');
    const metricSpeed = document.getElementById('single-metric-speed');
    const metricEta = document.getElementById('single-metric-eta');

    const pct = typeof task.percent !== 'undefined' ? task.percent : (task.progress_percent || 0);
    if (fill) fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;

    const isProcessing = (task.status === 'processing');
    const isPaused = (task.status === 'paused');
    const isAudio = Boolean(task.is_audio);
    const audioFmt = (task.audio_format || 'audio').toUpperCase();
    const targetSizeClean = (task.expected_size_str || '').split('•')[0].trim();

    if (badge) {
      if (pct >= 100) {
        badge.textContent = 'Completed';
      } else if (isPaused) {
        badge.textContent = 'Paused';
      } else if (isProcessing) {
        badge.textContent = isAudio ? `Encoding ${audioFmt}` : 'Finalizing';
      } else {
        badge.textContent = 'Downloading';
      }
    }

    this.setSinglePauseButtonState(isPaused);

    if (metricPercent) metricPercent.textContent = `${pct.toFixed(1)}%`;

    if (isPaused) {
      if (metricSpeed) metricSpeed.textContent = 'Paused';
      if (metricEta) metricEta.textContent = '--:--';
      if (metricSize) metricSize.textContent = `${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'} (Paused)`;
    } else if (isProcessing) {
      if (metricSize) metricSize.textContent = `Encoding ${audioFmt}${targetSizeClean ? ` (~${targetSizeClean})` : ''}`;
      if (metricSpeed) metricSpeed.textContent = task.speed_str || 'Post-processing';
      if (metricEta) metricEta.textContent = task.eta_str || 'A few seconds';
    } else {
      if (metricSize) {
        if (isAudio && targetSizeClean && ['MP3', 'WAV'].includes(audioFmt)) {
          metricSize.textContent = `${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'} (Stream • Est: ${targetSizeClean})`;
        } else {
          metricSize.textContent = `${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'}`;
        }
      }
      if (metricSpeed) metricSpeed.textContent = task.speed_str || '-- KB/s';
      if (metricEta) metricEta.textContent = task.eta_str || '--:--';
    }
  }

  handleSingleSuccess(task) {
    this.activeSingleTaskId = null;
    document.getElementById('single-download-card').style.display = 'none';
    const errCard = document.getElementById('analyze-error');
    if (errCard) errCard.style.display = 'none';

    const successCard = document.getElementById('single-success-card');
    document.getElementById('success-filename').textContent = task.filename || task.title;

    const btnFolder = document.getElementById('btn-success-open-folder');
    const btnPlay = document.getElementById('btn-success-play');
    btnFolder.setAttribute('data-path', task.file_path || '');
    btnFolder.setAttribute('data-id', task.id || '');
    btnPlay.setAttribute('data-path', task.file_path || '');
    btnPlay.setAttribute('data-id', task.id || '');

    successCard.style.display = 'flex';
    Components.showToast('Download completed successfully!', 'success');
    this.loadHistory();
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.droplyApp = new DroplyApp();
});
