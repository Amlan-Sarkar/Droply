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

  // Render Format Chips for Video
  renderVideoFormats(formats, selectedFormatId, onSelect) {
    const container = document.getElementById('video-formats-grid');
    if (!container) return;
    container.innerHTML = '';

    if (!formats || formats.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 13px;">Default source video stream will be downloaded.</div>`;
      return;
    }

    formats.forEach((fmt, index) => {
      const chip = document.createElement('div');
      const isSelected = selectedFormatId ? (fmt.format_id === selectedFormatId) : (index === 0);
      chip.className = `format-chip ${isSelected ? 'selected' : ''}`;
      chip.setAttribute('data-fid', fmt.format_id);

      chip.innerHTML = `
        <div class="format-chip-label">${fmt.label || fmt.resolution}</div>
        <div class="format-chip-meta">
          <span>${fmt.resolution}</span>
          <span class="format-chip-size">${fmt.filesize_str || 'Standard'}</span>
        </div>
      `;

      chip.addEventListener('click', () => {
        container.querySelectorAll('.format-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        onSelect(fmt);
      });

      container.appendChild(chip);
    });
  },

  // Render Audio Codec Chips
  renderAudioFormats(formats, selectedFormatId, onSelect) {
    const container = document.getElementById('audio-formats-grid');
    if (!container) return;
    container.innerHTML = '';

    formats.forEach((fmt, index) => {
      const chip = document.createElement('div');
      const isSelected = selectedFormatId ? (fmt.format_id === selectedFormatId) : (index === 0);
      chip.className = `format-chip ${isSelected ? 'selected' : ''}`;
      chip.setAttribute('data-fid', fmt.format_id);

      chip.innerHTML = `
        <div class="format-chip-label">${fmt.label}</div>
        <div class="format-chip-meta">
          <span>${fmt.ext.toUpperCase()} Audio</span>
          <span class="format-chip-size">${fmt.filesize_str}</span>
        </div>
      `;

      chip.addEventListener('click', () => {
        container.querySelectorAll('.format-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        onSelect(fmt);
      });

      container.appendChild(chip);
    });
  },

  // Render Single Queue Item Card in Batch View
  renderQueueItem(task) {
    const card = document.createElement('div');
    card.className = 'queue-item-card';
    card.id = `q-task-${task.id}`;

    const thumbSrc = task.thumbnail || '';
    const platformIcon = this.getPlatformIcon(task.platform);

    let statusClass = task.status || 'queued';
    let statusLabel = task.status || 'Queued';
    if (task.status === 'processing') statusLabel = 'Merging';

    let actionButtons = '';
    if (task.status === 'downloading' || task.status === 'processing') {
      actionButtons = `
        <button class="icon-btn-cancel" data-action="cancel" data-id="${task.id}" title="Cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else if (task.status === 'failed' || task.status === 'cancelled') {
      actionButtons = `
        <button class="secondary-btn btn-sm" data-action="retry" data-id="${task.id}" title="Retry">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          <span>Retry</span>
        </button>
        <button class="icon-btn" data-action="remove" data-id="${task.id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    } else if (task.status === 'completed') {
      actionButtons = `
        <button class="secondary-btn btn-sm" data-action="open-folder" data-path="${task.file_path || ''}" title="Open Folder">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
          <span>Folder</span>
        </button>
        <button class="icon-btn" data-action="play" data-path="${task.file_path || ''}" title="Play file">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </button>
      `;
    } else {
      // Queued
      actionButtons = `
        <button class="icon-btn" data-action="remove" data-id="${task.id}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      `;
    }

    card.innerHTML = `
      <div style="position: relative;">
        ${thumbSrc ? `<img class="queue-item-thumb" src="${thumbSrc}" alt="thumb" />` : `<div class="queue-item-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;">${platformIcon}</div>`}
      </div>
      <div class="queue-item-info">
        <div class="queue-item-title-row">
          <span class="queue-item-title" title="${task.title}">${task.title}</span>
          <span class="queue-item-platform">${task.platform}</span>
          <span class="status-tag ${statusClass}">${statusLabel}</span>
        </div>
        <div class="queue-item-progress-track">
          <div class="queue-item-progress-fill" style="width: ${task.percent || 0}%;"></div>
        </div>
        <div class="queue-item-meta-row">
          <span>${task.percent ? task.percent.toFixed(1) : '0.0'}%</span>
          <span>${task.speed_str || '-- KB/s'}</span>
          <span>${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'}</span>
          <span>ETA: ${task.eta_str || '--:--'}</span>
          <span style="color: #a5b4fc;">${task.format_label || ''}</span>
        </div>
        ${task.error_friendly ? `<div style="font-size: 11px; color: #f87171;">${task.error_friendly}</div>` : ''}
      </div>
      <div class="queue-item-actions">
        ${actionButtons}
      </div>
    `;

    return card;
  },

  // Update existing Queue Item DOM
  updateQueueItem(task) {
    const el = document.getElementById(`q-task-${task.id}`);
    if (!el) return false;

    const fill = el.querySelector('.queue-item-progress-fill');
    if (fill) fill.style.width = `${task.percent || 0}%`;

    const statusTag = el.querySelector('.status-tag');
    if (statusTag) {
      statusTag.className = `status-tag ${task.status}`;
      statusTag.textContent = task.status;
    }

    const metaRow = el.querySelector('.queue-item-meta-row');
    if (metaRow) {
      metaRow.innerHTML = `
        <span>${task.percent ? task.percent.toFixed(1) : '0.0'}%</span>
        <span>${task.speed_str || '-- KB/s'}</span>
        <span>${task.downloaded_str || '0 B'} / ${task.total_str || '0 B'}</span>
        <span>ETA: ${task.eta_str || '--:--'}</span>
        <span style="color: #a5b4fc;">${task.format_label || ''}</span>
      `;
    }

    return true;
  },

  // Render History Item Card
  renderHistoryItem(item) {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.id = `hist-item-${item.id}`;

    const icon = this.getPlatformIcon(item.platform);
    const thumbSrc = item.thumbnail || '';

    card.innerHTML = `
      <div style="position: relative;">
        ${thumbSrc ? `<img class="history-thumb" src="${thumbSrc}" alt="thumb" />` : `<div class="history-thumb" style="display:flex;align-items:center;justify-content:center;font-size:22px;">${icon}</div>`}
      </div>
      <div class="history-info">
        <div class="history-filename" title="${item.filename || item.title}">${item.filename || item.title}</div>
        <div class="history-meta-sub">
          <span class="queue-item-platform">${item.platform}</span>
          <span>${item.file_size_str || '0 B'}</span>
          <span>${item.format_label || ''}</span>
          <span>${item.created_at_str || ''}</span>
          <span class="status-tag ${item.status}">${item.status}</span>
        </div>
      </div>
      <div class="history-actions">
        ${item.file_path ? `
          <button class="secondary-btn btn-sm" data-action="reveal" data-path="${item.file_path}" title="Reveal in Windows Explorer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span>Reveal</span>
          </button>
          <button class="icon-btn" data-action="play" data-path="${item.file_path}" title="Play file">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </button>
        ` : ''}
        <button class="icon-btn" data-action="delete-hist" data-id="${item.id}" title="Remove record">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
    `;

    return card;
  }
};
