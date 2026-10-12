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

    // Remove existing dropdown if any
    const existingDropdown = container.parentElement.querySelector('.video-format-dropdown-wrap');
    if (existingDropdown) existingDropdown.remove();

    if (!formats || formats.length === 0) {
      container.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); font-size: 13px;">Default source video stream will be downloaded.</div>`;
      return;
    }

    // Auto-select the top format (highest quality) if none selected
    if (!selectedFormatId && formats.length > 0) {
      onSelect(formats[0]);
    }

    // Create dropdown selector for mobile & compact view
    const dropWrap = document.createElement('div');
    dropWrap.className = 'video-format-dropdown-wrap';
    dropWrap.style.marginBottom = '10px';

    const select = document.createElement('select');
    select.className = 'custom-select format-select-menu';
    select.style.width = '100%';

    formats.forEach((fmt, index) => {
      const isSelected = selectedFormatId ? (fmt.format_id === selectedFormatId) : (index === 0);

      const opt = document.createElement('option');
      opt.value = fmt.format_id;
      opt.textContent = `${fmt.label || fmt.resolution} • ${fmt.filesize_str || 'Standard'}`;
      opt.selected = isSelected;
      select.appendChild(opt);

      const chip = document.createElement('div');
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
        select.value = fmt.format_id;
        onSelect(fmt);
      });

      container.appendChild(chip);
    });

    select.addEventListener('change', (e) => {
      const chosen = formats.find(f => f.format_id === e.target.value);
      if (chosen) {
        container.querySelectorAll('.format-chip').forEach(c => {
          c.classList.toggle('selected', c.getAttribute('data-fid') === chosen.format_id);
        });
        onSelect(chosen);
      }
    });

    dropWrap.appendChild(select);
    container.parentElement.insertBefore(dropWrap, container);
  },

  // Render Audio Codec Chips
  renderAudioFormats(formats, selectedFormatId, onSelect) {
    const container = document.getElementById('audio-formats-grid');
    if (!container) return;
    container.innerHTML = '';

    const existingDropdown = container.parentElement.querySelector('.audio-format-dropdown-wrap');
    if (existingDropdown) existingDropdown.remove();

    if (!formats || formats.length === 0) return;

    if (!selectedFormatId && formats.length > 0) {
      onSelect(formats[0]);
    }

    const dropWrap = document.createElement('div');
    dropWrap.className = 'audio-format-dropdown-wrap';
    dropWrap.style.marginBottom = '10px';

    const select = document.createElement('select');
    select.className = 'custom-select format-select-menu';
    select.style.width = '100%';

    formats.forEach((fmt, index) => {
      const isSelected = selectedFormatId ? (fmt.format_id === selectedFormatId) : (index === 0);

      const opt = document.createElement('option');
      opt.value = fmt.format_id;
      opt.textContent = `${fmt.label} (${fmt.ext.toUpperCase()})`;
      opt.selected = isSelected;
      select.appendChild(opt);

      const chip = document.createElement('div');
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
        select.value = fmt.format_id;
        onSelect(fmt);
      });

      container.appendChild(chip);
    });

    select.addEventListener('change', (e) => {
      const chosen = formats.find(f => f.format_id === e.target.value);
      if (chosen) {
        container.querySelectorAll('.format-chip').forEach(c => {
          c.classList.toggle('selected', c.getAttribute('data-fid') === chosen.format_id);
        });
        onSelect(chosen);
      }
    });

    dropWrap.appendChild(select);
    container.parentElement.insertBefore(dropWrap, container);
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
  },

  // Render Playlist Preview Card
  renderPlaylistCard(data, onEnqueueAll, onDownloadAll) {
    const card = document.createElement('div');
    card.className = 'playlist-preview-card';
    card.style.cssText = 'background: rgba(18, 24, 38, 0.85); border: 1px solid rgba(139, 92, 246, 0.35); border-radius: 16px; padding: 20px; margin-top: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.4); backdrop-filter: blur(12px);';

    const entries = data.playlist_entries || [];
    const count = data.playlist_count || entries.length;
    const thumb = data.thumbnail || (entries[0] && entries[0].thumbnail) || '';
    const saveDir = (data.default_download_dir || 'Downloads/Droply') + '/' + (data.title || 'Playlist');

    let previewRows = '';
    entries.slice(0, 5).forEach((item, idx) => {
      previewRows += `
        <div style="display:flex; align-items:center; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.06);">
          <span style="color:#818cf8; font-weight:700; width:22px; font-size:13px;">${idx + 1}</span>
          <span style="flex:1; color:#f1f5f9; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.title}</span>
          <span style="color:#94a3b8; font-size:12px;">${item.duration_str || ''}</span>
        </div>
      `;
    });
    if (entries.length > 5) {
      previewRows += `
        <div style="padding:8px 0; text-align:center; color:#a5b4fc; font-size:13px; font-weight:600;">
          + ${entries.length - 5} more items in playlist
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap;">
        ${thumb ? `<img src="${thumb}" alt="thumb" style="width:130px; height:80px; object-fit:cover; border-radius:10px; border:1px solid rgba(255,255,255,0.1); box-shadow: 0 4px 14px rgba(0,0,0,0.5);" />` : ''}
        <div style="flex:1; min-width:240px;">
          <div style="display:inline-flex; align-items:center; gap:6px; background:linear-gradient(135deg, #6366f1, #8b5cf6); color:#fff; font-size:11px; font-weight:800; padding:3px 10px; border-radius:20px; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px;">
            <svg style="width:12px; height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            Playlist &bull; ${count} Items
          </div>
          <h3 style="margin:0 0 4px 0; color:#fff; font-size:18px; font-weight:700;">${data.title}</h3>
          <div style="color:#94a3b8; font-size:13px; margin-bottom:12px;">Curated by <span style="color:#e2e8f0; font-weight:600;">${data.uploader || 'Creator'}</span></div>
          <div style="background:rgba(99, 102, 241, 0.12); border:1px solid rgba(99, 102, 241, 0.25); border-radius:10px; padding:10px 14px; font-size:12.5px; color:#c7d2fe; display:flex; align-items:center; gap:8px;">
            <svg style="width:18px; height:18px; flex-shrink:0; color:#818cf8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <span>Creates dedicated folder: <strong style="color:#fff;">${saveDir}</strong></span>
          </div>
        </div>
      </div>

      <div style="margin-top:16px; background:rgba(0,0,0,0.25); border-radius:10px; padding:10px 14px;">
        ${previewRows}
      </div>

      <div style="display:flex; gap:12px; margin-top:18px; flex-wrap:wrap;">
        <button id="btn-playlist-enqueue-all" class="secondary-btn" style="flex:1; min-width:180px; justify-content:center; padding:12px 18px; font-weight:600;">
          <svg style="width:16px; height:16px; margin-right:6px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Add All ${count} to Queue
        </button>
        <button id="btn-playlist-download-now" class="primary-btn" style="flex:1; min-width:180px; justify-content:center; padding:12px 18px; font-weight:700;">
          <svg style="width:16px; height:16px; margin-right:6px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          Download Playlist Folder
        </button>
      </div>
    `;

    card.querySelector('#btn-playlist-enqueue-all').addEventListener('click', () => onEnqueueAll(data));
    card.querySelector('#btn-playlist-download-now').addEventListener('click', () => onDownloadAll(data));

    return card;
  }
};
