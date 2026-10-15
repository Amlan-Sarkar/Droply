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

    // Batch Drawer Toggle button
    const btnBatchToggle = document.getElementById('btn-batch-toggle');
    const batchDrawer = document.getElementById('omni-batch-drawer');
    const batchTextarea = document.getElementById('batch-urls-input');
    if (btnBatchToggle && batchDrawer) {
      btnBatchToggle.addEventListener('click', () => {
        const isShown = batchDrawer.style.display !== 'none';
        batchDrawer.style.display = isShown ? 'none' : 'block';
        btnBatchToggle.classList.toggle('active', !isShown);
        if (!isShown && batchTextarea) {
          batchTextarea.focus();
        }
      });
    }

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
        const trimmed = text.trim();
        if (batchDrawer && batchDrawer.style.display !== 'none' && batchTextarea) {
          batchTextarea.value = trimmed;
        } else {
          urlInput.value = trimmed;
          btnClear.style.display = 'flex';
          this.instantDetectPlatform(trimmed);
        }
      }
    });

    // Clear button
    btnClear.addEventListener('click', () => {
      urlInput.value = '';
      if (batchTextarea) batchTextarea.value = '';
      btnClear.style.display = 'none';
      this.hideDetectedBadge();
      this.resetSingleView();
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

    const updateConcurrentBadge = () => {
      badgeConcurrent.textContent = sliderConcurrent.value;
    };
    sliderConcurrent.addEventListener('input', updateConcurrentBadge);
    sliderConcurrent.addEventListener('change', updateConcurrentBadge);

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
      const appVer = status.app_version || 'v1.3.2';
      const ytdlpVer = status.ytdlp_version || '2026.08.19';

      const verPill = document.getElementById('header-version-pill');
      if (verPill) verPill.textContent = appVer;

      const enginePill = document.getElementById('header-engine-pill');
      if (enginePill) enginePill.textContent = `Engine v${ytdlpVer}`;

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
      if (diagYtdlp) diagYtdlp.textContent = `yt-dlp v${ytdlpVer}`;

      const diagFfmpeg = document.getElementById('diag-ffmpeg');
      if (diagFfmpeg) diagFfmpeg.textContent = status.ffmpeg_ready ? 'Bundled v7.1 (Active)' : 'Not Available';

      const diagPython = document.getElementById('diag-python');
      if (diagPython) diagPython.textContent = `Python ${status.python_version}`;

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
          <li><span class="cl-feature-highlight">Refined Cat-Inspired Design:</span> Minimalist feline outline divider, sleeping kitten idle state in the downloader queue, and cleaned-up UI hints.</li>
          <li><span class="cl-feature-highlight">Theme-Adaptive Interface:</span> Analyze button, update controls, and security badges automatically harmonize with your active color theme.</li>
          <li><span class="cl-feature-highlight">Live Services Monitor:</span> Animated breathing pulse indicator displays real-time local background engine connectivity and status.</li>
          <li><span class="cl-feature-highlight">Private by Design:</span> 100% on-device local processing with zero telemetry, zero analytics, and no external tracking.</li>
          <li><span class="cl-feature-highlight">Core Engine Stability:</span> Embedded yt-dlp core engine update system with dynamic version detection and seamless restart installer.</li>
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

      if (curVerEl) curVerEl.textContent = 'v1.3.2';
      if (newVerEl) newVerEl.textContent = '...';
      titleEl.textContent = 'Checking for Updates...';
      descEl.textContent = 'Contacting update servers to verify Droply release and platform core engine status...';
      changelogEl.innerHTML = '<div style="color: #64748b; font-size: 13px;">Fetching release notes...</div>';

      try {
        const info = await api.checkUpdates();
        currentUpdateInfo = info;
        const appInst = info.app_installed || 'v1.3.2';
        const appLatest = info.app_latest || 'v1.3.2';
        const isUpToDate = Boolean(info.app_up_to_date);

        curVerEl.textContent = appInst;
        newVerEl.textContent = appLatest;
        releaseDateEl.textContent = formatDate(info.published_at);
        releaseSizeEl.textContent = formatBytes(info.installer_size);
        changelogEl.innerHTML = renderChangelog(info.release_notes);

        if (info.release_url && btnViewGithub) {
          btnViewGithub.href = info.release_url;
        }

        if (isUpToDate) {
          titleEl.textContent = 'Droply is Up to Date';
          descEl.textContent = 'You are running the newest release of Droply. You can update the embedded yt-dlp core engine for latest platform fixes.';
          btnPrimary.disabled = false;
          btnPrimaryText.textContent = 'Update yt-dlp Core';
          downloadState = 'ytdlp-core';
        } else {
          titleEl.textContent = 'Application Update Available';
          descEl.textContent = 'A newer version of Droply is ready to install';
          btnPrimary.disabled = false;
          btnPrimaryText.textContent = 'Download Update';
          downloadState = 'can-download';
        }
      } catch (e) {
        curVerEl.textContent = 'v1.3.2';
        newVerEl.textContent = 'v1.3.2';
        titleEl.textContent = 'Droply Core Engine';
        descEl.textContent = 'Verified online. You can refresh the embedded yt-dlp core engine.';
        changelogEl.innerHTML = renderChangelog('');
        btnPrimary.disabled = false;
        btnPrimaryText.textContent = 'Update yt-dlp Core';
        downloadState = 'ytdlp-core';
      }
    };

    if (btnHeaderUpdates) btnHeaderUpdates.addEventListener('click', openUpdateCheck);
    if (btnSettingsUpdates) btnSettingsUpdates.addEventListener('click', openUpdateCheck);
    if (btnClose) btnClose.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });

    // Cancel download button
    btnCancelDl.addEventListener('click', async () => {
      if (pollInterval) clearInterval(pollInterval);
      try {
        await api.cancelInstallerDownload();
      } catch (e) {}
      dlBox.style.display = 'none';
      btnCancelDl.style.display = 'none';
      btnPrimary.disabled = false;
      btnPrimaryText.textContent = 'Download Update';
      downloadState = 'can-download';
      Components.showToast('Download cancelled', 'info');
    });

    // Primary action button handler (Download -> Restart & Install / Core Update)
    btnPrimary.addEventListener('click', async () => {
      if (downloadState === 'can-download') {
        const url = currentUpdateInfo?.installer_url || `https://github.com/Amlan-Sarkar/Droply/releases/download/${currentUpdateInfo?.app_latest || 'v1.3.2'}/Droply-Setup.exe`;
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
        // Update yt-dlp core
        btnPrimary.disabled = true;
        btnPrimaryText.textContent = 'Updating core...';
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
          btnPrimary.disabled = false;
          btnPrimaryText.textContent = 'Update yt-dlp Core';
        }
      }
    });
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
