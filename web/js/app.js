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
    this.setupTabs();
    this.setupDownloader();
    this.setupHistory();
    this.setupSettings();
    this.setupUpdateSystem();
    this.setupWebSocketListeners();

    // Load initial data
    await this.loadSettings();
    await this.loadSystemStatus();
    await this.loadTasks();
    await this.loadHistory();
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
    const btnDownloadAnother = document.getElementById('btn-download-another');
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

    // Paste button (reads clipboard directly)
    btnPaste.addEventListener('click', async () => {
      let text = '';
      if (window.DroplyAndroid && window.DroplyAndroid.getClipboardText) {
        text = window.DroplyAndroid.getClipboardText();
      }
      if (!text && navigator.clipboard && navigator.clipboard.readText) {
        try {
          text = await navigator.clipboard.readText();
        } catch (err) {}
      }
      if (!text) {
        text = prompt("Paste your video, playlist, or batch links here:");
      }
      if (text && text.trim()) {
        urlInput.value = text.trim();
        btnClear.style.display = 'flex';
        this.instantDetectPlatform(text.trim());
      }
    });

    // Clear button
    btnClear.addEventListener('click', () => {
      urlInput.value = '';
      btnClear.style.display = 'none';
      this.hideDetectedBadge();
      this.resetSingleView();
    });

    // Fetch Details / Analyze button
    btnAnalyze.addEventListener('click', () => {
      const text = urlInput.value.trim();
      if (!text) {
        Components.showToast('Please paste a media URL or batch links to fetch.', 'error');
        urlInput.focus();
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
      if (this.currentMedia && this.currentMedia.formats && this.currentMedia.formats.length > 0) {
        this.selectedFormat = this.currentMedia.formats[0];
        const sizeEl = document.getElementById('omni-estimated-size');
        if (sizeEl) sizeEl.textContent = this.selectedFormat.filesize_str || 'Standard';
      }
    });

    modeBtnAudio.addEventListener('click', () => {
      this.selectedMode = 'audio';
      modeBtnAudio.classList.add('active');
      modeBtnVideo.classList.remove('active');
      document.getElementById('video-formats-section').style.display = 'none';
      document.getElementById('audio-formats-section').style.display = 'block';
      if (this.currentMedia && this.currentMedia.audio_formats && this.currentMedia.audio_formats.length > 0) {
        this.selectedFormat = this.currentMedia.audio_formats[0];
        const sizeEl = document.getElementById('omni-estimated-size');
        if (sizeEl) sizeEl.textContent = this.selectedFormat.filesize_str || '~3.5 MB';
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
      if (this.activeSingleTaskId) {
        await api.cancelTask(this.activeSingleTaskId);
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
      Components.showToast('Download cancelled.', 'info');
    });

    // Success actions
    btnSuccessOpenFolder.addEventListener('click', async () => {
      const path = btnSuccessOpenFolder.getAttribute('data-path');
      await api.revealFile(path);
    });

    btnSuccessPlay.addEventListener('click', async () => {
      const path = btnSuccessPlay.getAttribute('data-path');
      await api.openFile(path);
    });

    btnDownloadAnother.addEventListener('click', () => {
      urlInput.value = '';
      btnClear.style.display = 'none';
      this.hideDetectedBadge();
      this.resetSingleView();
      urlInput.focus();
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

    // Header open folder button
    document.getElementById('header-open-folder').addEventListener('click', async () => {
      await api.openFolder(this.settings.download_dir);
    });

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
        // Priority 1: Opens compatible app (Gallery, VLC, MX Player, etc.)
        await api.openFile(path);
      } else if (action === 'cancel') {
        await api.cancelTask(id);
      } else if (action === 'retry') {
        await api.retryTask(id);
      } else if (action === 'remove') {
        await api.removeTask(id);
        const card = document.getElementById(`q-task-${id}`);
        if (card) card.remove();
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.updateRecentDownloadsHeader();
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
        nameEl.textContent = `Batch (${urls.length} URLs)`;
        iconEl.textContent = '📑';
        badge.style.opacity = '1';
        return;
      }
      if (urls.length === 1) {
        const u = urls[0];
        const res = await api.detectPlatform(u);
        if (res.valid && res.platform !== 'Unknown') {
          const badge = document.getElementById('detected-badge');
          const nameEl = document.getElementById('detect-name');
          const iconEl = document.getElementById('detect-icon');
          nameEl.textContent = res.platform;
          iconEl.textContent = Components.getPlatformIcon(res.platform);
          badge.style.opacity = '1';
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
    badge.style.opacity = '0';
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
        thumbImg.src = data.thumbnail;
        thumbImg.style.display = 'block';
      } else {
        thumbImg.style.display = 'none';
      }

      // Populate Download Directory
      const saveDir = this.settings.download_dir || data.default_download_dir;
      document.getElementById('selected-save-dir').textContent = saveDir;

      // Render Video Formats
      this.selectedFormat = data.formats[0] || null;
      Components.renderVideoFormats(data.formats, this.selectedFormat ? this.selectedFormat.format_id : null, (fmt) => {
        this.selectedFormat = fmt;
      });

      // Render Audio Formats
      Components.renderAudioFormats(data.audio_formats, null, (fmt) => {
        this.selectedFormat = fmt;
      });

      // Show preview card
      document.getElementById('media-card').style.display = 'block';

      if (this.selectedMode === 'audio') {
        document.getElementById('mode-btn-audio').click();
      } else {
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
    const techEl = document.getElementById('error-tech-log');

    friendlyEl.textContent = (err.data && err.data.error_friendly) ? err.data.error_friendly : err.message;
    techEl.textContent = (err.data && err.data.error_technical) ? err.data.error_technical : (err.stack || err.message);

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

    try {
      const task = await api.startDownload({
        url: this.currentMedia.url,
        format_id: formatId,
        format_label: formatLabel,
        is_audio: isAudio,
        audio_format: audioCodec,
        output_dir: this.settings.download_dir,
        title: this.currentMedia.title,
        thumbnail: this.currentMedia.thumbnail
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

  // ================= HISTORY =================
  setupHistory() {
    const searchInput = document.getElementById('hist-search-input');
    const btnOpenFolder = document.getElementById('btn-hist-open-folder');
    const btnClearHist = document.getElementById('btn-hist-clear');
    const histStatFolder = document.getElementById('hist-stat-folder');

    if (histStatFolder) {
      histStatFolder.addEventListener('click', async () => {
        await api.openFolder(this.settings.download_dir);
      });
    }

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase().trim();
      const cards = document.querySelectorAll('.history-card');
      cards.forEach(card => {
        const title = card.querySelector('.history-filename').textContent.toLowerCase();
        card.style.display = title.includes(query) ? 'flex' : 'none';
      });
    });

    btnOpenFolder.addEventListener('click', async () => {
      await api.openFolder(this.settings.download_dir);
    });

    btnClearHist.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your download history? (Files will remain in your folder)')) {
        await api.clearHistory();
        await this.loadHistory();
        Components.showToast('Download history cleared.', 'info');
      }
    });

    // History item card click delegation
    const container = document.getElementById('history-items-container');
    container.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id');
      const path = target.getAttribute('data-path');

      if (action === 'open-file' || action === 'play') {
        await api.openFile(path);
      } else if (action === 'reveal') {
        await api.revealFile(path);
      } else if (action === 'delete-hist') {
        await api.deleteHistoryItem(id);
        const card = document.getElementById(`hist-item-${id}`);
        if (card) card.remove();
        Components.showToast('Removed record from history.', 'info');
      }
    });
  }

  async loadHistory() {
    try {
      const items = await api.getHistory();
      const container = document.getElementById('history-items-container');
      const emptyState = document.getElementById('history-empty-state');

      // Update statistics
      let totalBytes = 0;
      let completedCount = 0;
      items.forEach(it => {
        if (it.status === 'completed' || !it.status) completedCount++;
        const sz = it.file_size || it.filesize || it.downloaded_bytes || it.total_bytes || 0;
        totalBytes += Number(sz) || 0;
      });

      document.getElementById('hist-stat-total').textContent = items.length;
      document.getElementById('hist-stat-completed').textContent = completedCount;
      document.getElementById('hist-stat-size').textContent = Components.formatBytes(totalBytes);
      document.getElementById('hist-stat-folder').textContent = this.settings.download_dir || 'Downloads/Droply';

      if (!items || items.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyState);
        emptyState.style.display = 'block';
        return;
      }

      emptyState.style.display = 'none';
      container.innerHTML = '';

      items.forEach(it => {
        const card = Components.renderHistoryItem(it);
        container.appendChild(card);
      });

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

    sliderConcurrent.addEventListener('input', () => {
      badgeConcurrent.textContent = sliderConcurrent.value;
    });

    btnBrowse.addEventListener('click', async () => {
      try {
        const res = await api.browseFolder();
        if (res.updated && res.folder) {
          document.getElementById('setting-dir-input').value = res.folder;
          this.settings.download_dir = res.folder;
          document.getElementById('selected-save-dir').textContent = res.folder;
          Components.showToast(`Updated directory: ${res.folder}`, 'success');
        }
      } catch (e) {
        console.error("Browse folder error:", e);
      }
    });

    btnSave.addEventListener('click', async () => {
      const updates = {
        download_dir: document.getElementById('setting-dir-input').value,
        default_video_quality: document.getElementById('setting-video-quality').value,
        default_audio_format: document.getElementById('setting-audio-codec').value,
        max_concurrent_downloads: parseInt(sliderConcurrent.value, 10),
        notifications: document.getElementById('setting-notifications').checked,
      };

      try {
        this.settings = await api.updateSettings(updates);
        document.getElementById('selected-save-dir').textContent = this.settings.download_dir;
        Components.showToast('Preferences saved successfully!', 'success');
      } catch (e) {
        Components.showToast(`Failed to save settings: ${e.message}`, 'error');
      }
    });
  }

  async loadSettings() {
    try {
      this.settings = await api.getSettings();
      document.getElementById('setting-dir-input').value = this.settings.download_dir || '';
      document.getElementById('selected-save-dir').textContent = this.settings.download_dir || 'Downloads/Droply';
      document.getElementById('setting-video-quality').value = this.settings.default_video_quality || 'best';
      document.getElementById('setting-audio-codec').value = this.settings.default_audio_format || 'mp3';
      document.getElementById('setting-concurrent').value = this.settings.max_concurrent_downloads || 3;
      document.getElementById('concurrent-val-badge').textContent = this.settings.max_concurrent_downloads || 3;
      document.getElementById('setting-notifications').checked = this.settings.notifications !== false;

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
      const statusPill = document.getElementById('server-status-pill');
      if (statusPill) {
        if (status.ffmpeg_ready) {
          statusPill.className = 'status-pill status-ready';
          statusPill.innerHTML = `<span class="status-dot"></span><span class="status-label">Engine Ready</span>`;
        } else {
          statusPill.className = 'status-pill';
          statusPill.innerHTML = `<span class="status-label">Online</span>`;
        }
      }

      document.getElementById('diag-ytdlp').textContent = `yt-dlp v${status.ytdlp_version}`;
      document.getElementById('diag-ffmpeg').textContent = status.ffmpeg_ready ? 'Bundled v7.1 (Active)' : 'Not Available';
      document.getElementById('diag-python').textContent = `Python ${status.python_version}`;

    } catch (e) {
      console.error("Load system status error:", e);
    }
  }

  // ================= UPDATE SYSTEM (OmniDownloader Style) =================
  setupUpdateSystem() {
    const modal = document.getElementById('update-modal');
    const btnClose = document.getElementById('btn-close-update-modal');
    const btnHeaderUpdates = document.getElementById('header-check-updates');
    const btnSettingsUpdates = document.getElementById('btn-settings-check-updates');
    const btnUpdateYtdlp = document.getElementById('btn-update-ytdlp');

    const openUpdateCheck = async () => {
      modal.style.display = 'flex';
      const titleEl = document.getElementById('update-modal-title');
      const descEl = document.getElementById('update-modal-desc');
      const instVer = document.getElementById('update-ver-installed');
      const latestVer = document.getElementById('update-ver-latest');
      const statusMsg = document.getElementById('update-status-msg');

      statusMsg.style.display = 'none';
      titleEl.textContent = 'Checking for Updates...';
      descEl.textContent = 'Contacting update servers to verify Droply release and platform core engine status...';

      try {
        const info = await api.checkUpdates();
        const appInst = info.app_installed || 'v1.2.8';
        const appLatest = info.app_latest || 'v1.2.8';
        const isUpToDate = Boolean(info.app_up_to_date);

        instVer.textContent = appInst;
        latestVer.textContent = appLatest;

        if (isUpToDate) {
          titleEl.textContent = 'Droply is Up to Date';
          descEl.textContent = 'You are running the newest release of Droply. You can also update the embedded yt-dlp core engine for latest platform fixes.';
        } else {
          titleEl.textContent = 'New Droply Update Available!';
          descEl.textContent = `A new release (${appLatest}) is available. You can download the latest installer from GitHub or update the embedded core engine below.`;
        }
      } catch (e) {
        instVer.textContent = 'v1.2.8';
        latestVer.textContent = 'v1.2.8';
        titleEl.textContent = 'Droply Core Engine';
        descEl.textContent = 'You can update the embedded yt-dlp core engine for latest platform fixes.';
      }
    };

    if (btnHeaderUpdates) btnHeaderUpdates.addEventListener('click', openUpdateCheck);
    if (btnSettingsUpdates) btnSettingsUpdates.addEventListener('click', openUpdateCheck);
    if (btnClose) btnClose.addEventListener('click', () => { modal.style.display = 'none'; });

    // Close on overlay backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    if (btnUpdateYtdlp) {
      btnUpdateYtdlp.addEventListener('click', async () => {
        const textSpan = document.getElementById('btn-update-ytdlp-text');
        const statusMsg = document.getElementById('update-status-msg');
        btnUpdateYtdlp.disabled = true;
        textSpan.textContent = 'Updating core...';
        statusMsg.style.display = 'block';
        statusMsg.textContent = 'Downloading and installing latest yt-dlp core engine...';

        try {
          const res = await api.updateYtdlpCore();
          if (res.status === 'success') {
            statusMsg.style.color = '#10b981';
            statusMsg.textContent = res.message || 'Core engine successfully updated!';
            Components.showToast('yt-dlp core engine updated!', 'success');
            await this.loadSystemStatus();
          } else {
            statusMsg.style.color = '#ef4444';
            statusMsg.textContent = res.message || 'Update failed.';
          }
        } catch (e) {
          statusMsg.style.color = '#ef4444';
          statusMsg.textContent = `Update error: ${e.message}`;
        } finally {
          btnUpdateYtdlp.disabled = false;
          textSpan.textContent = 'Update yt-dlp Core';
        }
      });
    }
  }

  // ================= WEBSOCKET & NATIVE EVENT LISTENERS =================
  setupWebSocketListeners() {
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
      if (idx >= 0) this.tasks[idx] = task;

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
        this.handleSingleSuccess(task);
      }

      Components.updateQueueItem(task);
      this.updateRecentDownloadsHeader();

      Components.showToast(`Completed download: "${task.title || 'Media'}"`, 'success');
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

    api.on('task_failed', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) this.tasks[idx] = task;

      if (this.activeSingleTaskId === task.id) {
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
      this.renderQueueList();
    });

    if (("Notification" in window) && Notification.permission === "default") {
      Notification.requestPermission();
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
    fill.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    badge.textContent = pct >= 100 ? 'Completed' : (task.status === 'processing' ? 'Finalizing' : 'Downloading');
    metricPercent.textContent = `${pct.toFixed(1)}%`;
    metricSize.textContent = `${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'}`;
    metricSpeed.textContent = task.speed_str || '-- KB/s';
    metricEta.textContent = task.eta_str || '--:--';
  }

  handleSingleSuccess(task) {
    document.getElementById('single-download-card').style.display = 'none';
    const successCard = document.getElementById('single-success-card');
    document.getElementById('success-filename').textContent = task.filename || task.title;

    const btnFolder = document.getElementById('btn-success-open-folder');
    const btnPlay = document.getElementById('btn-success-play');
    btnFolder.setAttribute('data-path', task.file_path);
    btnPlay.setAttribute('data-path', task.file_path);

    successCard.style.display = 'flex';
    Components.showToast('Download completed successfully!', 'success');
    this.loadHistory();
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.droplyApp = new DroplyApp();
});
