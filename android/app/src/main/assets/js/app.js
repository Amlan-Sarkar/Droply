/**
 * OmniFetch Main Application Controller
 */

class OmniFetchApp {
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
    this.setupSingleDownloader();
    this.setupBatchDownloader();
    this.setupHistory();
    this.setupSettings();
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
  }

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.nav-tab').forEach(t => {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach(p => {
      p.classList.toggle('active', p.id === `pane-${tabName}`);
    });

    if (tabName === 'history') {
      this.loadHistory();
    } else if (tabName === 'settings') {
      this.loadSettings();
    }
  }

  // ================= SINGLE DOWNLOADER =================
  setupSingleDownloader() {
    const urlInput = document.getElementById('single-url-input');
    const btnPaste = document.getElementById('btn-paste');
    const btnClear = document.getElementById('btn-clear');
    const btnAnalyze = document.getElementById('btn-analyze');
    const btnChangeDir = document.getElementById('btn-change-dir');
    const btnStartDownload = document.getElementById('btn-start-download');
    const btnAddSingleToBatch = document.getElementById('btn-add-single-to-batch');
    const btnCancelSingle = document.getElementById('btn-cancel-single');
    const btnSuccessOpenFolder = document.getElementById('btn-success-open-folder');
    const btnSuccessPlay = document.getElementById('btn-success-play');
    const btnDownloadAnother = document.getElementById('btn-download-another');
    const btnCloseError = document.getElementById('btn-close-error');
    const btnCopyTitle = document.getElementById('btn-copy-title');

    // Live typing instant platform detection
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
      if (e.key === 'Enter') {
        btnAnalyze.click();
      }
    });

    // Paste button
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
        text = prompt("Paste your media link here:");
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

    // Analyze button
    btnAnalyze.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (!url) {
        Components.showToast('Please paste a media URL to analyze.', 'error');
        urlInput.focus();
        return;
      }
      this.analyzeUrl(url);
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
      if (this.currentMedia && this.currentMedia.formats.length > 0) {
        this.selectedFormat = this.currentMedia.formats[0];
      }
    });

    modeBtnAudio.addEventListener('click', () => {
      this.selectedMode = 'audio';
      modeBtnAudio.classList.add('active');
      modeBtnVideo.classList.remove('active');
      document.getElementById('video-formats-section').style.display = 'none';
      document.getElementById('audio-formats-section').style.display = 'block';
      if (this.currentMedia && this.currentMedia.audio_formats.length > 0) {
        this.selectedFormat = this.currentMedia.audio_formats[0];
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

    // Queue for later button
    btnAddSingleToBatch.addEventListener('click', () => {
      if (!this.currentMedia) return;
      this.enqueueCurrentMedia();
    });

    // Cancel active single download
    btnCancelSingle.addEventListener('click', async () => {
      if (this.activeSingleTaskId) {
        await api.cancelTask(this.activeSingleTaskId);
        this.activeSingleTaskId = null;
      }
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
  }

  // Instant regex platform detection
  async instantDetectPlatform(url) {
    try {
      const res = await api.detectPlatform(url);
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
    } catch (e) {
      this.hideDetectedBadge();
    }
  }

  hideDetectedBadge() {
    const badge = document.getElementById('detected-badge');
    badge.style.opacity = '0';
  }

  resetSingleView() {
    const existingPlaylist = document.getElementById('playlist-preview-container');
    if (existingPlaylist) existingPlaylist.remove();

    document.getElementById('media-card').style.display = 'none';
    document.getElementById('single-download-card').style.display = 'none';
    document.getElementById('single-success-card').style.display = 'none';
    document.getElementById('analyze-skeleton').style.display = 'none';
    document.getElementById('analyze-error').style.display = 'none';
    this.currentMedia = null;
    this.selectedFormat = null;
    this.activeSingleTaskId = null;
  }

  // Analyze URL workflow
  async analyzeUrl(url) {
    this.resetSingleView();
    document.getElementById('analyze-skeleton').style.display = 'grid';
    document.getElementById('btn-analyze').disabled = true;

    try {
      const data = await api.analyzeUrl(url);
      this.currentMedia = data;

      // Check if media is a Playlist
      if (data.is_playlist) {
        document.getElementById('analyze-skeleton').style.display = 'none';
        document.getElementById('media-card').style.display = 'none';

        const pContainer = document.createElement('div');
        pContainer.id = 'playlist-preview-container';

        const handleEnqueuePlaylist = async (pData) => {
          const urls = (pData.playlist_entries || []).map(e => e.url);
          try {
            await api.batchEnqueue({
              urls,
              items: pData.playlist_entries,
              playlist_folder: pData.title,
              is_audio: this.selectedMode === 'audio',
              format_id: 'best',
              format_label: 'Best Video',
              audio_format: 'mp3',
              output_dir: this.settings.download_dir
            });
            Components.showToast(`Enqueued ${urls.length} items from "${pData.title}" into dedicated folder!`, 'success');
            this.switchTab('batch');
          } catch (e) {
            Components.showToast(`Error queuing playlist: ${e.message}`, 'error');
          }
        };

        const handleDownloadPlaylist = async (pData) => {
          await handleEnqueuePlaylist(pData);
        };

        const playlistCard = Components.renderPlaylistCard(data, handleEnqueuePlaylist, handleDownloadPlaylist);
        pContainer.appendChild(playlistCard);

        const mediaCard = document.getElementById('media-card');
        mediaCard.parentElement.insertBefore(pContainer, mediaCard);

        Components.showToast(`Playlist detected: ${data.title} (${data.playlist_count} videos)`, 'success');
        return;
      }

      // Populate media preview card
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
      document.getElementById('analyze-skeleton').style.display = 'none';
      document.getElementById('media-card').style.display = 'block';

      // Re-apply current mode
      if (this.selectedMode === 'audio') {
        document.getElementById('mode-btn-audio').click();
      } else {
        document.getElementById('mode-btn-video').click();
      }

      Components.showToast(`Found media: ${data.title.substring(0, 45)}...`, 'success');

    } catch (err) {
      document.getElementById('analyze-skeleton').style.display = 'none';
      const errCard = document.getElementById('analyze-error');
      const friendlyEl = document.getElementById('error-friendly-text');
      const techEl = document.getElementById('error-tech-log');

      friendlyEl.textContent = (err.data && err.data.error_friendly) ? err.data.error_friendly : err.message;
      techEl.textContent = (err.data && err.data.error_technical) ? err.data.error_technical : (err.stack || err.message);

      errCard.style.display = 'flex';
      Components.showToast('Unable to extract media from this URL.', 'error');
    } finally {
      document.getElementById('btn-analyze').disabled = false;
    }
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

      // Show single progress card
      document.getElementById('media-card').style.display = 'none';
      const pCard = document.getElementById('single-download-card');
      pCard.style.display = 'block';
      document.getElementById('single-progress-title').textContent = this.currentMedia.title;
      document.getElementById('single-status-badge').textContent = 'Starting...';

      Components.showToast('Download started locally.', 'success');

    } catch (e) {
      Components.showToast(`Failed to initiate download: ${e.message}`, 'error');
    }
  }

  enqueueCurrentMedia() {
    if (!this.currentMedia) return;
    const isAudio = this.selectedMode === 'audio';
    const formatId = this.selectedFormat ? this.selectedFormat.format_id : 'best';
    const formatLabel = this.selectedFormat ? this.selectedFormat.label : 'Best Quality';

    api.startDownload({
      url: this.currentMedia.url,
      format_id: formatId,
      format_label: formatLabel,
      is_audio: isAudio,
      audio_format: isAudio ? 'mp3' : '',
      output_dir: this.settings.download_dir,
      title: this.currentMedia.title,
      thumbnail: this.currentMedia.thumbnail
    }).then(() => {
      Components.showToast('Added to Batch Queue!', 'success');
      this.switchTab('batch');
    }).catch(e => {
      Components.showToast(`Error queuing: ${e.message}`, 'error');
    });
  }

  // ================= BATCH DOWNLOADER =================
  setupBatchDownloader() {
    const textarea = document.getElementById('batch-url-textarea');
    const parsedInfo = document.getElementById('batch-parsed-info');
    const btnClearBatch = document.getElementById('btn-clear-batch-input');
    const btnEnqueue = document.getElementById('btn-enqueue-batch');
    const btnRetryFailed = document.getElementById('btn-queue-retry-failed');
    const btnClearFinished = document.getElementById('btn-queue-clear-finished');

    // Live URL parsing counter
    let parseTimer = null;
    textarea.addEventListener('input', () => {
      clearTimeout(parseTimer);
      parseTimer = setTimeout(async () => {
        const text = textarea.value.trim();
        if (!text) {
          parsedInfo.textContent = '0 URLs ready';
          return;
        }
        try {
          const res = await api.batchParse(text);
          const c = typeof res.count !== 'undefined' ? res.count : (res.total || (res.items ? res.items.length : 0));
          parsedInfo.textContent = `${c} valid URL${c === 1 ? '' : 's'} identified`;
        } catch (e) {
          parsedInfo.textContent = 'Parsing...';
        }
      }, 250);
    });

    btnClearBatch.addEventListener('click', () => {
      textarea.value = '';
      parsedInfo.textContent = '0 URLs ready';
    });

    const btnPasteBatch = document.getElementById('btn-paste-batch-input');
    if (btnPasteBatch) {
      btnPasteBatch.addEventListener('click', async () => {
        let text = '';
        if (window.DroplyAndroid && window.DroplyAndroid.getClipboardText) {
          text = window.DroplyAndroid.getClipboardText();
        }
        if (!text && navigator.clipboard && navigator.clipboard.readText) {
          try { text = await navigator.clipboard.readText(); } catch (e) {}
        }
        if (text) {
          textarea.value = (textarea.value ? textarea.value + '\n' : '') + text.trim();
          textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
    }

    btnEnqueue.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) {
        Components.showToast('Please paste one or more URLs into the box.', 'error');
        return;
      }

      const preset = document.getElementById('batch-quality-preset').value;
      let isAudio = false;
      let formatId = 'bestvideo+bestaudio/best';
      let formatLabel = 'Best Video';
      let audioFormat = 'mp3';

      if (preset === '1080p') {
        formatId = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
        formatLabel = '1080p FHD';
      } else if (preset === '720p') {
        formatId = 'bestvideo[height<=720]+bestaudio/best[height<=720]';
        formatLabel = '720p HD';
      } else if (preset === 'audio_mp3') {
        isAudio = true;
        audioFormat = 'mp3';
        formatLabel = 'MP3 Audio (320k)';
      } else if (preset === 'audio_m4a') {
        isAudio = true;
        audioFormat = 'm4a';
        formatLabel = 'M4A Audio';
      }

      try {
        const parsed = await api.batchParse(text);
        const count = typeof parsed.count !== 'undefined' ? parsed.count : (parsed.total || (parsed.items ? parsed.items.length : 0));
        if (count === 0) {
          Components.showToast('No valid URLs found in the text.', 'error');
          return;
        }

        const urls = parsed.items.map(it => it.url);
        const res = await api.batchEnqueue({
          urls,
          items: parsed.items,
          is_audio: isAudio,
          format_id: formatId,
          format_label: formatLabel,
          audio_format: audioFormat,
          output_dir: this.settings.download_dir
        });

        const enqueuedCount = typeof res.count !== 'undefined' ? res.count : (res.enqueued || (res.tasks ? res.tasks.length : urls.length));
        Components.showToast(`Enqueued ${enqueuedCount} downloads into queue!`, 'success');
        textarea.value = '';
        parsedInfo.textContent = '0 URLs ready';
        await this.loadTasks();

      } catch (e) {
        Components.showToast(`Error queuing batch: ${e.message}`, 'error');
      }
    });

    btnRetryFailed.addEventListener('click', async () => {
      const failed = this.tasks.filter(t => t.status === 'failed' || t.status === 'cancelled');
      for (const t of failed) {
        await api.retryTask(t.id);
      }
      Components.showToast('Retrying failed downloads...', 'info');
    });

    btnClearFinished.addEventListener('click', async () => {
      await api.clearFinishedTasks();
      this.tasks = (this.tasks || []).filter(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'processing' || t.status === 'pending');
      this.renderQueueList();
      this.updateQueueBadge();
      Components.showToast('Cleared completed items from queue.', 'info');
    });

    // Delegate queue items actions
    const qContainer = document.getElementById('queue-items-container');
    qContainer.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id');
      const path = target.getAttribute('data-path');

      if (action === 'cancel') {
        await api.cancelTask(id);
      } else if (action === 'retry') {
        await api.retryTask(id);
      } else if (action === 'remove') {
        await api.removeTask(id);
        const card = document.getElementById(`q-task-${id}`);
        if (card) card.remove();
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.updateQueueBadge();
      } else if (action === 'open-folder') {
        await api.revealFile(path);
      } else if (action === 'play') {
        await api.openFile(path);
      }
    });
  }

  async loadTasks() {
    try {
      this.tasks = await api.getTasks();
      this.renderQueueList();
      this.updateQueueBadge();
    } catch (e) {
      console.error("Load tasks error:", e);
    }
  }

  renderQueueList() {
    const container = document.getElementById('queue-items-container');
    const emptyState = document.getElementById('queue-empty-state');
    const countEl = document.getElementById('queue-active-count');

    if (!this.tasks || this.tasks.length === 0) {
      container.innerHTML = '';
      if (emptyState) {
        container.appendChild(emptyState);
        emptyState.style.display = 'block';
      }
      if (countEl) countEl.textContent = '0 items in queue';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = '';
    if (countEl) {
      countEl.textContent = `${this.tasks.length} item${this.tasks.length === 1 ? '' : 's'} in queue`;
    }

    this.tasks.forEach(t => {
      try {
        const card = Components.renderQueueItem(t);
        if (card) container.appendChild(card);
      } catch (err) {
        console.error("Error rendering queue card:", err);
      }
    });
  }

  updateQueueBadge() {
    const badge = document.getElementById('batch-badge');
    const activeCount = (this.tasks || []).filter(t => t.status === 'queued' || t.status === 'downloading' || t.status === 'processing' || t.status === 'pending').length;
    if (activeCount > 0) {
      badge.textContent = activeCount;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }

  // ================= LIBRARY & HISTORY =================
  setupHistory() {
    const btnClearHist = document.getElementById('btn-hist-clear');
    const btnOpenFolder = document.getElementById('btn-hist-open-folder');
    const searchInput = document.getElementById('hist-search-input');
    const statFolder = document.getElementById('hist-stat-folder');

    btnClearHist.addEventListener('click', async () => {
      if (confirm("Are you sure you want to clear your download history? (Downloaded files will NOT be deleted)")) {
        await api.clearHistory();
        await this.loadHistory();
        Components.showToast('History cleared.', 'info');
      }
    });

    btnOpenFolder.addEventListener('click', async () => {
      await api.openFolder(this.settings.download_dir);
    });

    statFolder.addEventListener('click', async () => {
      await api.openFolder(this.settings.download_dir);
    });

    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      document.querySelectorAll('.history-card').forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(q) ? 'grid' : 'none';
      });
    });

    // Delegate history card clicks
    const hContainer = document.getElementById('history-items-container');
    hContainer.addEventListener('click', async (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      const id = target.getAttribute('data-id');
      const path = target.getAttribute('data-path');

      if (action === 'reveal') {
        await api.revealFile(path);
      } else if (action === 'play') {
        await api.openFile(path);
      } else if (action === 'delete-hist') {
        await api.deleteHistoryItem(id, false);
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
        if (it.status === 'completed') completedCount++;
        totalBytes += (it.file_size || it.filesize || it.downloaded_bytes || 0);
      });

      document.getElementById('hist-stat-total').textContent = items.length;
      document.getElementById('hist-stat-completed').textContent = completedCount;
      document.getElementById('hist-stat-size').textContent = this.formatBytes(totalBytes);
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

  formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let v = bytes;
    while (v >= 1024 && i < units.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(1)} ${units[i]}`;
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
      const statusPill = document.getElementById('server-status-pill') || document.getElementById('ffmpeg-pill');
      if (status.ffmpeg_ready) {
        if (statusPill) statusPill.className = 'status-pill status-ready';
        if (statusPill) statusPill.innerHTML = `<span class="status-dot"></span><span class="status-label">Server Online</span>`;
      } else {
        if (statusPill) statusPill.className = 'status-pill';
        ffmpegPill.style.color = '#f59e0b';
        if (statusPill) statusPill.innerHTML = `<span class="status-label">Server Available</span>`;
      }

      document.getElementById('diag-ytdlp').textContent = `yt-dlp v${status.ytdlp_version}`;
      document.getElementById('diag-ffmpeg').textContent = status.ffmpeg_ready ? 'Bundled v7.1 (Active)' : 'Not Available';
      document.getElementById('diag-python').textContent = `Python ${status.python_version}`;

    } catch (e) {
      console.error("Load system status error:", e);
    }
  }

  // ================= WEBSOCKET REAL-TIME EVENTS =================
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
      this.updateQueueBadge();
    });

    api.on('task_progress', (payload) => {
      const task = payload.task;
      // Update in memory
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) this.tasks[idx] = task;

      // Update Single Download View if matching
      if (this.activeSingleTaskId === task.id) {
        this.updateSingleProgress(task);
      }

      // Update Batch Queue DOM
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
      this.updateQueueBadge();

      // Show in-app toast notification so user immediately sees fast background downloads
      Components.showToast(`Completed download: "${task.title || 'Media'}"`, 'success');

      // Trigger desktop notification if permitted
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
      this.updateQueueBadge();
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
      this.updateQueueBadge();
    });

    api.on('task_updated', (payload) => {
      const task = payload.task;
      const idx = this.tasks.findIndex(t => t.id === task.id);
      if (idx >= 0) this.tasks[idx] = task;
      this.renderQueueList();
      this.updateQueueBadge();
    });

    // Request notification permission once
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
    this.updateQueueBadge();
  }
}

// Instantiate on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.droplyApp = new OmniFetchApp();
});
