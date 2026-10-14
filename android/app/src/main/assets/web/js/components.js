/**
 * OmniFetch UI Component Renderers & Helpers
 */

const Components = {
  
  // Platform Icons & Badges
  getPlatformIcon(platform = '') {
    const p = platform.toLowerCase();
    if (p.includes('youtube')) return '▶️';
    if (p.includes('twitter') || p.includes('x')) return '🐦';
    if (p.includes('tiktok')) return '🎵';
    if (p.includes('reddit')) return '🤖';
    if (p.includes('instagram')) return '📸';
    if (p.includes('vimeo')) return '🎬';
    if (p.includes('soundcloud')) return '🎧';
    if (p.includes('direct')) return '📁';
    return '🌐';
  },

  // Toast Notification
  showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
    }

    toast.innerHTML = `${iconSvg}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },

  // Render Format Chips for Video (OmniDownloader Style)
  renderVideoFormats(formats, selectedFormatId, onSelect) {
    const container = document.getElementById('video-formats-grid');
    if (!container) return;
    container.innerHTML = '';

    const existingDropdown = container.parentElement.querySelector('.video-format-dropdown-wrap');
    if (existingDropdown) existingDropdown.remove();

    if (!formats || formats.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 13px;">Default source video stream will be downloaded.</div>`;
      return;
    }

    const defaultFmt = formats[0];
    const initialSelectedId = selectedFormatId || defaultFmt.format_id;
    if (!selectedFormatId && formats.length > 0) {
      onSelect(defaultFmt);
      const sizeEl = document.getElementById('omni-estimated-size');
      if (sizeEl) sizeEl.textContent = defaultFmt.filesize_str || 'Standard';
    }

    formats.forEach((fmt) => {
      const isSelected = (fmt.format_id === initialSelectedId);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `omni-quality-chip ${isSelected ? 'selected' : ''}`;
      chip.setAttribute('data-fid', fmt.format_id);

      chip.innerHTML = `
        <span class="chip-label">${fmt.label || fmt.resolution}</span>
        <span class="chip-size">${fmt.filesize_str || 'Standard'}</span>
      `;

      chip.addEventListener('click', () => {
        container.querySelectorAll('.omni-quality-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const sizeEl = document.getElementById('omni-estimated-size');
        if (sizeEl) sizeEl.textContent = fmt.filesize_str || 'Standard';
        onSelect(fmt);
      });

      container.appendChild(chip);
    });
  },

  // Render Audio Codec Chips (OmniDownloader Style)
  renderAudioFormats(formats, selectedFormatId, onSelect) {
    const container = document.getElementById('audio-formats-grid');
    if (!container) return;
    container.innerHTML = '';

    const existingDropdown = container.parentElement.querySelector('.audio-format-dropdown-wrap');
    if (existingDropdown) existingDropdown.remove();

    if (!formats || formats.length === 0) return;

    const defaultFmt = formats[0];
    const initialSelectedId = selectedFormatId || defaultFmt.format_id;

    formats.forEach((fmt) => {
      const isSelected = (fmt.format_id === initialSelectedId);
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `omni-quality-chip ${isSelected ? 'selected' : ''}`;
      chip.setAttribute('data-fid', fmt.format_id);

      chip.innerHTML = `
        <span class="chip-label">${fmt.label}</span>
        <span class="chip-size">${fmt.filesize_str || (fmt.ext ? fmt.ext.toUpperCase() : 'Audio')}</span>
      `;

      chip.addEventListener('click', () => {
        container.querySelectorAll('.omni-quality-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        const sizeEl = document.getElementById('omni-estimated-size');
        if (sizeEl) sizeEl.textContent = fmt.filesize_str || '~3.5 MB';
        onSelect(fmt);
      });

      container.appendChild(chip);
    });
  },

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 MB';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    let b = parseFloat(bytes);
    while (b >= 1024 && i < units.length - 1) {
      b /= 1024;
      i++;
    }
    return `${b.toFixed(1)} ${units[i]}`;
  },

  formatSeconds(s) {
    if (!s || s <= 0) return '00:00';
    const sec = parseInt(s, 10);
    const m = Math.floor(sec / 60);
    const remS = sec % 60;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(remM)}:${pad(remS)}` : `${pad(remM)}:${pad(remS)}`;
  },

  // Render Queue / Recent Download Card (OmniDownloader Style)
  renderQueueItem(task) {
    const card = document.createElement('div');
    card.id = `q-task-${task.id}`;

    if (task.status === 'completed') {
      card.className = 'omni-recent-card';
      const isAudio = Boolean(task.is_audio);
      const tagType = isAudio ? 'AUDIO' : 'VIDEO';
      const tagText = isAudio ? 'Music • Tap to play' : 'Movies • Tap to watch';

      card.innerHTML = `
        <button class="omni-play-badge" data-action="open-file" data-path="${task.file_path || ''}" title="Tap to play">
          <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
        </button>
        <div class="omni-recent-info" data-action="open-file" data-path="${task.file_path || ''}">
          <div class="omni-recent-title" title="${task.title || 'Downloaded Media'}">${task.title || 'Downloaded Media'}</div>
          <div class="omni-recent-sub">
            <span class="omni-tag-pill ${isAudio ? 'audio' : 'video'}">${tagType}</span>
            <span class="omni-tag-text">${tagText}</span>
          </div>
        </div>
        <div class="omni-recent-actions">
          <button class="btn-omni-open" data-action="open-file" data-path="${task.file_path || ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            <span>Open</span>
          </button>
          <button class="icon-btn-trash" data-action="remove" data-id="${task.id}" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
      return card;
    }

    // Active downloading or pending / failed card
    card.className = 'queue-item-card';
    const thumbSrc = task.thumbnail || '';
    const platformIcon = this.getPlatformIcon(task.platform);

    let statusClass = task.status || 'queued';
    let statusLabel = task.status || 'Queued';
    if (task.status === 'processing') statusLabel = 'Merging';
    if (task.status === 'downloading') statusLabel = 'Downloading';

    const actionButtons = this._getQueueItemActions(task);
    const metaRowContent = this._getQueueItemMeta(task);

    card.innerHTML = `
      <div style="position: relative;">
        ${thumbSrc ? `<img class="queue-item-thumb" src="${thumbSrc}" alt="thumb" />` : `<div class="queue-item-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;">${platformIcon}</div>`}
      </div>
      <div class="queue-item-info">
        <div class="queue-item-title-row">
          <span class="queue-item-title" title="${task.title}">${task.title}</span>
          <span class="queue-item-platform">${task.platform || 'Media'}</span>
          <span class="status-tag ${statusClass}">${statusLabel}</span>
        </div>
        <div class="queue-item-progress-track">
          <div class="queue-item-progress-fill" style="width: ${task.percent || 0}%;"></div>
        </div>
        <div class="queue-item-meta-row">
          ${metaRowContent}
        </div>
        ${task.error_friendly ? `<div class="queue-item-error-msg" style="font-size: 11.5px; color: #f87171; line-height: 1.4;">${task.error_friendly}</div>` : ''}
      </div>
      <div class="queue-item-actions">
        ${actionButtons}
      </div>
    `;

    return card;
  },

  _getQueueItemActions(task) {
    if (task.status === 'downloading' || task.status === 'processing') {
      return `
        <button class="icon-btn-cancel" data-action="cancel" data-id="${task.id}" title="Cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else if (task.status === 'failed' || task.status === 'cancelled') {
      return `
        <button class="secondary-btn btn-sm" data-action="retry" data-id="${task.id}" title="Retry">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          <span>Retry</span>
        </button>
        <button class="icon-btn" data-action="remove" data-id="${task.id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else if (task.status === 'completed') {
      return `
        <button class="btn-omni-open" data-action="open-file" data-path="${task.file_path || ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
          <span>Open</span>
        </button>
        <button class="icon-btn-trash" data-action="remove" data-id="${task.id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;
    } else {
      return `
        <button class="icon-btn" data-action="remove" data-id="${task.id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    }
  },

  _getQueueItemMeta(task) {
    if (task.status === 'failed' || task.status === 'cancelled') {
      return `
        <span style="color: #f87171; font-weight: 600;">Download Failed</span>
        <span style="color: #a5b4fc;">${task.format_label || ''}</span>
      `;
    }
    if (task.status === 'completed') {
      return `
        <span style="color: #34d399; font-weight: 600;">Completed (100%)</span>
        <span>${task.file_size_str || task.total_str || ''}</span>
        <span style="color: #a5b4fc;">${task.format_label || ''}</span>
      `;
    }
    return `
      <span>${task.percent ? task.percent.toFixed(1) : '0.0'}%</span>
      <span>${task.speed_str || '-- KB/s'}</span>
      <span>${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'}</span>
      <span>ETA: ${task.eta_str || '--:--'}</span>
      <span style="color: #a5b4fc;">${task.format_label || ''}</span>
    `;
  },

  // Update existing Queue Item DOM
  updateQueueItem(task) {
    const el = document.getElementById(`q-task-${task.id}`);
    if (!el) return false;

    // If transitioned to completed, replace with Omni completed card!
    if (task.status === 'completed' && !el.classList.contains('omni-recent-card')) {
      const newCard = this.renderQueueItem(task);
      el.replaceWith(newCard);
      return true;
    }

    const fill = el.querySelector('.queue-item-progress-fill');
    if (fill) fill.style.width = `${task.percent || 0}%`;

    const statusTag = el.querySelector('.status-tag');
    if (statusTag) {
      statusTag.className = `status-tag ${task.status}`;
      statusTag.textContent = task.status;
    }

    const metaRow = el.querySelector('.queue-item-meta-row');
    if (metaRow) {
      metaRow.innerHTML = this._getQueueItemMeta(task);
    }

    const actionsEl = el.querySelector('.queue-item-actions');
    if (actionsEl) {
      actionsEl.innerHTML = this._getQueueItemActions(task);
    }

    let errEl = el.querySelector('.queue-item-error-msg');
    if (task.error_friendly) {
      if (!errEl) {
        errEl = document.createElement('div');
        errEl.className = 'queue-item-error-msg';
        errEl.style.cssText = 'font-size: 11.5px; color: #f87171; line-height: 1.4;';
        const info = el.querySelector('.queue-item-info');
        if (info) info.appendChild(errEl);
      }
      errEl.textContent = task.error_friendly;
    } else if (errEl) {
      errEl.remove();
    }

    return true;
  },

  // Render History Item Card (Clean & Responsive)
  renderHistoryItem(item) {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.id = `hist-item-${item.id}`;

    const platform = (item.platform && item.platform !== 'undefined') ? item.platform : 'YouTube';
    const icon = this.getPlatformIcon(platform);
    const thumbSrc = item.thumbnail || '';
    const isAudio = Boolean(item.is_audio || (item.format_label && item.format_label.toLowerCase().includes('audio')));
    const formatLabel = (item.format_label && item.format_label !== 'undefined') ? item.format_label : (isAudio ? 'Audio' : 'Video');
    const sizeStr = item.file_size_str || (item.file_size ? this.formatBytes(item.file_size) : (item.downloaded_bytes ? this.formatBytes(item.downloaded_bytes) : ''));

    card.innerHTML = `
      <div class="history-thumb-box">
        ${thumbSrc ? `<img class="history-thumb" src="${thumbSrc}" alt="thumb" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'history-thumb-fallback\\'>${icon}</div>';" />` : `<div class="history-thumb-fallback">${icon}</div>`}
      </div>
      <div class="history-info">
        <div class="history-filename" title="${item.filename || item.title}">${item.filename || item.title}</div>
        <div class="history-meta-sub">
          <span class="history-platform-badge">${platform}</span>
          <span class="omni-tag-pill ${isAudio ? 'audio' : 'video'}">${isAudio ? 'AUDIO' : 'VIDEO'}</span>
          ${sizeStr ? `<span>${sizeStr}</span>` : ''}
          ${formatLabel ? `<span class="history-format-pill">${formatLabel}</span>` : ''}
          ${item.created_at_str ? `<span>${item.created_at_str}</span>` : ''}
        </div>
      </div>
      <div class="history-actions">
        ${item.file_path ? `
          <button class="btn-omni-open" data-action="open-file" data-path="${item.file_path}" title="Open with compatible app">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            <span>Open</span>
          </button>
        ` : ''}
        <button class="icon-btn-trash" data-action="delete-hist" data-id="${item.id}" title="Remove record">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    return card;
  },

  // Render Omni-style Playlist Card with Quality Selection & Full Video List
  renderPlaylistCard(data, onDownloadSelected) {
    const card = document.createElement('div');
    card.className = 'omni-playlist-card';

    const entries = data.playlist_entries || [];
    const count = data.playlist_count || entries.length;
    const thumb = data.thumbnail || (entries[0] && entries[0].thumbnail) || '';

    // Selection set of video indices
    const selectedIndices = new Set(entries.map((_, i) => i));

    // Quality state for entire playlist
    let selectedQuality = 'best'; // '1080p', '720p', '480p', 'best', 'audio_mp3', 'audio_m4a'
    let isAudio = false;
    let audioFormat = 'mp3';

    // Size estimation helper based on duration and quality bitrate
    const getEntrySize = (durSec) => {
      const dur = durSec && durSec > 0 ? durSec : 210; // default 3.5 min
      let bytesPerSec = 0;
      if (selectedQuality === 'audio_mp3') {
        bytesPerSec = (320 * 1024) / 8; // 320 kbps
      } else if (selectedQuality === 'audio_m4a') {
        bytesPerSec = (192 * 1024) / 8; // 192 kbps
      } else if (selectedQuality === '1080p') {
        bytesPerSec = (3500 * 1024) / 8; // ~3.5 Mbps FHD
      } else if (selectedQuality === '720p') {
        bytesPerSec = (1900 * 1024) / 8; // ~1.9 Mbps HD
      } else if (selectedQuality === '480p') {
        bytesPerSec = (900 * 1024) / 8;  // ~900 kbps SD
      } else {
        // best
        bytesPerSec = (2800 * 1024) / 8; // ~2.8 Mbps
      }
      return dur * bytesPerSec;
    };

    const calcTotalEstimatedSize = () => {
      let total = 0;
      entries.forEach((e, i) => {
        if (selectedIndices.has(i)) {
          total += getEntrySize(e.duration);
        }
      });
      return Components.formatBytes(total);
    };

    // Render items HTML
    const renderVideoRows = () => {
      return entries.map((item, idx) => {
        const isChecked = selectedIndices.has(idx);
        const itemSizeStr = Components.formatBytes(getEntrySize(item.duration));
        return `
          <div class="playlist-video-row ${isChecked ? 'selected' : ''}" data-idx="${idx}">
            <input type="checkbox" class="playlist-chk custom-checkbox" data-idx="${idx}" ${isChecked ? 'checked' : ''} />
            <span class="playlist-item-idx">#${idx + 1}</span>
            <div class="playlist-item-info">
              <span class="playlist-item-title" title="${item.title}">${item.title}</span>
              <div class="playlist-item-meta">
                <span>${item.duration_str || '00:00'}</span>
                <span class="dot">•</span>
                <span class="playlist-item-size">${itemSizeStr}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    };

    card.innerHTML = `
      <!-- TOP PLAYLIST HEADER -->
      <div class="omni-playlist-header">
        ${thumb ? `<img src="${thumb}" alt="thumb" class="omni-playlist-thumb" />` : `<div class="omni-playlist-thumb placeholder">📑</div>`}
        <div class="omni-playlist-info">
          <div class="omni-playlist-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Playlist • ${count} Videos</span>
          </div>
          <h3 class="omni-playlist-title">${data.title || 'Playlist'}</h3>
          <div class="omni-playlist-author">Curated by <span>${data.uploader || 'Creator'}</span> • Total duration: ${data.duration_str || 'Various'}</div>
        </div>
      </div>

      <!-- PLAYLIST QUALITY SELECTOR (Applied to all videos at once!) -->
      <div class="omni-playlist-quality-wrap">
        <label class="omni-sublabel">Select Download Quality:</label>
        <div class="omni-quality-chips-grid">
          <button class="omni-q-chip" data-quality="480p">
            <span class="q-label">Standard 480p</span>
            <span class="q-est">~SD</span>
          </button>
          <button class="omni-q-chip" data-quality="720p">
            <span class="q-label">HD 720p</span>
            <span class="q-est">~Standard</span>
          </button>
          <button class="omni-q-chip" data-quality="1080p">
            <span class="q-label">Full HD 1080p</span>
            <span class="q-est">~FHD</span>
          </button>
          <button class="omni-q-chip active" data-quality="best">
            <span class="q-label">Best Auto</span>
            <span class="q-est">~Adaptive</span>
          </button>
          <button class="omni-q-chip" data-quality="audio_mp3">
            <span class="q-label">Audio Only (MP3)</span>
            <span class="q-est">~320k</span>
          </button>
          <button class="omni-q-chip" data-quality="audio_m4a">
            <span class="q-label">Audio Only (M4A)</span>
            <span class="q-est">~HQ AAC</span>
          </button>
        </div>

        <!-- ESTIMATED SIZE BANNER -->
        <div class="omni-size-banner">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          <span>Estimated Download Size: <strong id="playlist-est-size">${calcTotalEstimatedSize()}</strong></span>
        </div>
      </div>

      <!-- SELECTION CONTROLS HEADER -->
      <div class="omni-selection-bar">
        <div class="omni-selection-count">
          <span id="playlist-selected-count">${selectedIndices.size}</span> of ${count} videos selected
        </div>
        <div class="omni-selection-btns">
          <button class="text-action-btn" id="btn-select-all">Select All</button>
          <span class="divider">|</span>
          <button class="text-action-btn" id="btn-deselect-all">Deselect All</button>
        </div>
      </div>

      <!-- SCROLLABLE LIST OF ALL PLAYLIST VIDEOS -->
      <div class="omni-playlist-scrollable" id="playlist-videos-container">
        ${renderVideoRows()}
      </div>

      <!-- PRIMARY DOWNLOAD ACTION -->
      <div class="omni-playlist-footer">
        <button class="primary-btn btn-download-playlist-now" id="btn-download-playlist-now">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span id="btn-download-playlist-text">Download Playlist (${selectedIndices.size} Videos • ${calcTotalEstimatedSize()})</span>
        </button>
      </div>
    `;

    // Refresh UI helper
    const updateSizeAndButton = () => {
      const est = calcTotalEstimatedSize();
      const estSizeEl = card.querySelector('#playlist-est-size');
      if (estSizeEl) estSizeEl.textContent = est;

      const selCountEl = card.querySelector('#playlist-selected-count');
      if (selCountEl) selCountEl.textContent = selectedIndices.size;

      const btnText = card.querySelector('#btn-download-playlist-text');
      if (btnText) {
        btnText.textContent = `Download Playlist (${selectedIndices.size} Videos • ${est})`;
      }

      const dlBtn = card.querySelector('#btn-download-playlist-now');
      if (dlBtn) dlBtn.disabled = selectedIndices.size === 0;

      // Update individual row sizes
      card.querySelectorAll('.playlist-video-row').forEach(row => {
        const idx = parseInt(row.getAttribute('data-idx'), 10);
        const item = entries[idx];
        const sizeEl = row.querySelector('.playlist-item-size');
        if (sizeEl && item) {
          sizeEl.textContent = Components.formatBytes(getEntrySize(item.duration));
        }
      });
    };

    // Quality chip click handlers
    card.querySelectorAll('.omni-q-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        card.querySelectorAll('.omni-q-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        selectedQuality = chip.getAttribute('data-quality');
        if (selectedQuality.startsWith('audio_')) {
          isAudio = true;
          audioFormat = selectedQuality.replace('audio_', '');
        } else {
          isAudio = false;
          audioFormat = 'mp3';
        }
        updateSizeAndButton();
      });
    });

    // Checkbox and row click handlers
    const listContainer = card.querySelector('#playlist-videos-container');
    listContainer.addEventListener('click', (e) => {
      const row = e.target.closest('.playlist-video-row');
      if (!row) return;

      const idx = parseInt(row.getAttribute('data-idx'), 10);
      const chk = row.querySelector('.playlist-chk');

      if (e.target !== chk) {
        chk.checked = !chk.checked;
      }

      if (chk.checked) {
        selectedIndices.add(idx);
        row.classList.add('selected');
      } else {
        selectedIndices.delete(idx);
        row.classList.remove('selected');
      }
      updateSizeAndButton();
    });

    // Select All
    card.querySelector('#btn-select-all').addEventListener('click', () => {
      entries.forEach((_, i) => selectedIndices.add(i));
      card.querySelectorAll('.playlist-chk').forEach(c => c.checked = true);
      card.querySelectorAll('.playlist-video-row').forEach(r => r.classList.add('selected'));
      updateSizeAndButton();
    });

    // Deselect All
    card.querySelector('#btn-deselect-all').addEventListener('click', () => {
      selectedIndices.clear();
      card.querySelectorAll('.playlist-chk').forEach(c => c.checked = false);
      card.querySelectorAll('.playlist-video-row').forEach(r => r.classList.remove('selected'));
      updateSizeAndButton();
    });

    // Download Button Click
    card.querySelector('#btn-download-playlist-now').addEventListener('click', () => {
      if (selectedIndices.size === 0) {
        Components.showToast('Please select at least one video to download.', 'error');
        return;
      }
      const selectedEntries = entries.filter((_, i) => selectedIndices.has(i));
      let formatId = 'best';
      if (selectedQuality === '1080p') formatId = 'bestvideo[height<=1080]+bestaudio/best';
      else if (selectedQuality === '720p') formatId = 'bestvideo[height<=720]+bestaudio/best';
      else if (selectedQuality === '480p') formatId = 'bestvideo[height<=480]+bestaudio/best';
      else if (isAudio) formatId = 'bestaudio/best';

      onDownloadSelected(data, selectedEntries, {
        qualityKey: selectedQuality,
        format_id: formatId,
        format_label: isAudio ? `Audio (${audioFormat.toUpperCase()})` : selectedQuality.toUpperCase(),
        is_audio: isAudio,
        audio_format: audioFormat
      });
    });

    return card;
  },

  // Render Batch URLs Card (for multiple pasted links)
  renderBatchCard(batchData, onDownloadSelected) {
    const card = document.createElement('div');
    card.className = 'omni-playlist-card omni-batch-card';

    const items = batchData.items || [];
    const selectedIndices = new Set(items.map((_, i) => i));
    let selectedQuality = 'best';
    let isAudio = false;
    let audioFormat = 'mp3';

    card.innerHTML = `
      <div class="omni-playlist-header">
        <div class="omni-playlist-thumb placeholder">🔗</div>
        <div class="omni-playlist-info">
          <div class="omni-playlist-badge">
            <span>Multiple Media Links • ${items.length} URLs</span>
          </div>
          <h3 class="omni-playlist-title">Batch Download Links</h3>
          <div class="omni-playlist-author">All recognized video and audio URLs will download directly.</div>
        </div>
      </div>

      <div class="omni-playlist-quality-wrap">
        <label class="omni-sublabel">Select Download Quality Preset:</label>
        <div class="omni-quality-chips-grid">
          <button class="omni-q-chip" data-quality="720p">
            <span class="q-label">HD 720p</span>
          </button>
          <button class="omni-q-chip" data-quality="1080p">
            <span class="q-label">Full HD 1080p</span>
          </button>
          <button class="omni-q-chip active" data-quality="best">
            <span class="q-label">Best Auto</span>
          </button>
          <button class="omni-q-chip" data-quality="audio_mp3">
            <span class="q-label">Audio Only (MP3)</span>
          </button>
        </div>
      </div>

      <div class="omni-selection-bar">
        <div class="omni-selection-count">
          <span id="batch-selected-count">${selectedIndices.size}</span> of ${items.length} items selected
        </div>
        <div class="omni-selection-btns">
          <button class="text-action-btn" id="btn-batch-select-all">Select All</button>
          <span class="divider">|</span>
          <button class="text-action-btn" id="btn-batch-deselect-all">Deselect All</button>
        </div>
      </div>

      <div class="omni-playlist-scrollable" id="batch-items-container">
        ${items.map((it, idx) => `
          <div class="playlist-video-row selected" data-idx="${idx}">
            <input type="checkbox" class="playlist-chk custom-checkbox" data-idx="${idx}" checked />
            <span class="playlist-item-idx">#${idx + 1}</span>
            <div class="playlist-item-info">
              <span class="playlist-item-title">${it.title || it.url}</span>
              <div class="playlist-item-meta">
                <span>${it.platform || 'Media'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="omni-playlist-footer">
        <button class="primary-btn btn-download-playlist-now" id="btn-download-batch-now">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          <span id="btn-download-batch-text">Download All (${selectedIndices.size} Items)</span>
        </button>
      </div>
    `;

    const updateBatchBtn = () => {
      const selEl = card.querySelector('#batch-selected-count');
      if (selEl) selEl.textContent = selectedIndices.size;
      const textEl = card.querySelector('#btn-download-batch-text');
      if (textEl) textEl.textContent = `Download All (${selectedIndices.size} Items)`;
      const dlBtn = card.querySelector('#btn-download-batch-now');
      if (dlBtn) dlBtn.disabled = selectedIndices.size === 0;
    };

    card.querySelectorAll('.omni-q-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        card.querySelectorAll('.omni-q-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        selectedQuality = chip.getAttribute('data-quality');
        isAudio = selectedQuality.startsWith('audio_');
        audioFormat = isAudio ? selectedQuality.replace('audio_', '') : 'mp3';
      });
    });

    const listCont = card.querySelector('#batch-items-container');
    listCont.addEventListener('click', (e) => {
      const row = e.target.closest('.playlist-video-row');
      if (!row) return;
      const idx = parseInt(row.getAttribute('data-idx'), 10);
      const chk = row.querySelector('.playlist-chk');
      if (e.target !== chk) chk.checked = !chk.checked;
      if (chk.checked) {
        selectedIndices.add(idx);
        row.classList.add('selected');
      } else {
        selectedIndices.delete(idx);
        row.classList.remove('selected');
      }
      updateBatchBtn();
    });

    card.querySelector('#btn-batch-select-all').addEventListener('click', () => {
      items.forEach((_, i) => selectedIndices.add(i));
      card.querySelectorAll('.playlist-chk').forEach(c => c.checked = true);
      card.querySelectorAll('.playlist-video-row').forEach(r => r.classList.add('selected'));
      updateBatchBtn();
    });

    card.querySelector('#btn-batch-deselect-all').addEventListener('click', () => {
      selectedIndices.clear();
      card.querySelectorAll('.playlist-chk').forEach(c => c.checked = false);
      card.querySelectorAll('.playlist-video-row').forEach(r => r.classList.remove('selected'));
      updateBatchBtn();
    });

    card.querySelector('#btn-download-batch-now').addEventListener('click', () => {
      if (selectedIndices.size === 0) return;
      const sel = items.filter((_, i) => selectedIndices.has(i));
      onDownloadSelected(sel, {
        format_id: selectedQuality === '1080p' ? 'bestvideo[height<=1080]+bestaudio/best' : (selectedQuality === '720p' ? 'bestvideo[height<=720]+bestaudio/best' : 'best'),
        format_label: isAudio ? `Audio (${audioFormat.toUpperCase()})` : selectedQuality.toUpperCase(),
        is_audio: isAudio,
        audio_format: audioFormat
      });
    });

    return card;
  }
};

