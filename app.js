/* ========================================
   KampanyaTakip - Application Logic
   ======================================== */

const app = {
  campaigns: [],
  currentFilter: 'all',
  currentSort: 'endDate',
  searchQuery: '',
  searchTimeout: null,
  editingId: null,
  deleteTargetId: null,
  notificationCheckInterval: null,
  notifiedSet: new Set(),
  posterFilter: 'all',
  currentCategory: 'all',
  darkTheme: true,
  batchMode: false,
  selectedCampaigns: new Set(),
  config: {
    version: '1.0.0 (v36)',
    demandFormUrl: 'https://corewishasset.com.tr/digital-form/demand-form/create/75'
  },

  // --- Category Config ---
  categories: {
    indirim: { label: 'İndirim', icon: '💰', color: '#f59e0b' },
    xalxode: { label: 'X Al X Öde', icon: '🎁', color: '#10b981' },
    hediye: { label: 'Hediyeli', icon: '🎀', color: '#ec4899' },
    ozel: { label: 'Özel', icon: '⭐', color: '#8b5cf6' },
    diger: { label: 'Diğer', icon: '📦', color: '#6b7280' }
  },

  // --- Settings ---
  settings: {
    notifications: true,
    notifyStart: true,
    notifyEnd: true,
    notifyDayBefore: true,
    darkTheme: true
  },

  // =====================
  //   INITIALIZATION
  // =====================
  init() {
    this.loadData();
    this.loadSettings();
    this.loadNotifiedSet();
    this.bindEvents();
    this.renderDashboard();
    this.renderCampaigns();
    this.startNotificationChecker();
    this.registerServiceWorker();
    this.applySettings();

    // Page Visibility API to save battery/resources
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopNotificationChecker();
      } else {
        this.startNotificationChecker();
      }
    });

    // ESC tuşu ile modal kapatma
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const campaignModal = document.getElementById('campaign-modal');
        const deleteModal = document.getElementById('delete-modal');
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal && confirmModal.classList.contains('open')) {
          // showConfirm'in Promise'ini düzgün resolve et
          if (typeof this._confirmResolver === 'function') {
            this._confirmResolver('cancel');
          } else {
            confirmModal.classList.remove('open');
          }
        } else if (deleteModal && deleteModal.classList.contains('open')) {
          this.closeDeleteModal();
        } else if (campaignModal && campaignModal.classList.contains('open')) {
          this.closeModal();
        }
      }
    });
  },

  // =====================
  //   DATA PERSISTENCE
  // =====================
  loadData() {
    try {
      const data = localStorage.getItem('kampanya_campaigns');
      this.campaigns = data ? JSON.parse(data) : [];
      // Eski kategori değerlerini migrate et
      const categoryMap = { '2al1ode': 'xalxode', 'sadakat': 'diger', 'sezon': 'diger' };
      let migrated = false;
      this.campaigns.forEach(c => {
        if (categoryMap[c.category]) {
          c.category = categoryMap[c.category];
          migrated = true;
        }
      });
      if (migrated) this.saveData();
    } catch (e) {
      console.error('Veri yükleme hatası:', e);
      this.campaigns = [];
    }
  },

  saveData() {
    try {
      localStorage.setItem('kampanya_campaigns', JSON.stringify(this.campaigns));
    } catch (e) {
      console.error('Veri kaydetme hatası:', e);
      this.showToast('Veri kaydedilemedi!', 'error');
    }
  },

  loadSettings() {
    try {
      const data = localStorage.getItem('kampanya_settings');
      if (data) {
        this.settings = { ...this.settings, ...JSON.parse(data) };
      }
    } catch (e) {
      console.error('Ayarlar yükleme hatası:', e);
    }
  },

  saveSettings() {
    localStorage.setItem('kampanya_settings', JSON.stringify(this.settings));
  },

  loadNotifiedSet() {
    try {
      const data = localStorage.getItem('kampanya_notified');
      if (data) {
        this.notifiedSet = new Set(JSON.parse(data));
      }
    } catch (e) {
      this.notifiedSet = new Set();
    }
  },

  saveNotifiedSet() {
    // Keep only entries from the last 7 days to prevent unbounded growth
    const validKeys = [];
    const now = new Date();
    this.notifiedSet.forEach(key => {
      // Keys are formatted as: id_type_YYYY-MM-DD
      const parts = key.split('_');
      const dateStr = parts[parts.length - 1];
      const keyDate = new Date(dateStr);
      if ((now - keyDate) < 7 * 24 * 60 * 60 * 1000) {
        validKeys.push(key);
      }
    });
    this.notifiedSet = new Set(validKeys);
    localStorage.setItem('kampanya_notified', JSON.stringify([...this.notifiedSet]));
  },

  // =====================
  //   EVENT BINDING
  // =====================
  bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view));
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.switchView(btn.dataset.view);
        }
      });
    });

    // FAB
    const fabAdd = document.getElementById('fab-add');
    if (fabAdd) {
      fabAdd.addEventListener('click', () => this.openModal());
      fabAdd.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.openModal();
        }
      });
    }

    // Modal
    document.getElementById('btn-modal-close').addEventListener('click', () => this.closeModal());
    document.getElementById('btn-cancel').addEventListener('click', () => this.closeModal());
    document.getElementById('campaign-form').addEventListener('submit', (e) => this.handleFormSubmit(e));

    // Modal overlay close
    document.getElementById('campaign-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });

    // Delete modal
    document.getElementById('delete-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeDeleteModal();
    });

    // Search clear button
    const searchClearBtn = document.getElementById('search-clear-btn');
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        const searchInput = document.getElementById('search-input');
        searchInput.value = '';
        this.searchQuery = '';
        searchClearBtn.classList.add('hidden');
        this.renderCampaigns();
      });
    }
    document.querySelectorAll('.btn-delete-cancel').forEach(btn => {
      btn.addEventListener('click', () => this.closeDeleteModal());
    });
    document.getElementById('btn-delete-confirm').addEventListener('click', () => this.confirmDelete());

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
      const clearBtn = document.getElementById('search-clear-btn');
      if (clearBtn) {
        clearBtn.classList.toggle('hidden', !e.target.value);
      }
      // Debounce: 250ms bekle, sonra render et
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(() => {
        this.searchQuery = e.target.value.toLowerCase().trim();
        this.renderCampaigns();
      }, 250);
    });

    // Filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.posterFilter = 'all'; // Reset posterFilter on tab change
        this.currentCategory = 'all'; // Reset currentCategory on tab change

        // Sync category select dropdown in DOM
        const catSelect = document.getElementById('category-select');
        if (catSelect) {
          catSelect.value = 'all';
        }

        this.renderCampaigns();
      });
    });

    // Category Select
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
      categorySelect.addEventListener('change', (e) => {
        this.currentCategory = e.target.value;
        this.posterFilter = 'all'; // Reset posterFilter on category change
        this.renderCampaigns();
      });
    }

    // Pending Poster Card Redirect
    const pendingPosterCard = document.getElementById('card-pending-poster');
    if (pendingPosterCard) {
      pendingPosterCard.addEventListener('click', () => {
        this.currentFilter = 'active';
        this.posterFilter = 'pending';
        this.currentCategory = 'all';

        // Update tabs active class
        document.querySelectorAll('.filter-btn').forEach(b => {
          if (b.dataset.filter === 'active') {
            b.classList.add('active');
          } else {
            b.classList.remove('active');
          }
        });

        // Sync category select dropdown in DOM
        const catSelect = document.getElementById('category-select');
        if (catSelect) {
          catSelect.value = 'all';
        }

        this.switchView('campaigns');
        this.updatePosterFilterBanner();
      });
    }

    // Poster filter banner clear
    const posterBannerClearBtn = document.getElementById('poster-filter-clear');
    if (posterBannerClearBtn) {
      posterBannerClearBtn.addEventListener('click', () => {
        this.clearPosterFilter();
      });
    }

    // Sort
    document.getElementById('sort-select').addEventListener('change', (e) => {
      this.currentSort = e.target.value;
      this.renderCampaigns();
    });

    // Notification toggle in header
    document.getElementById('btn-notification-toggle').addEventListener('click', () => this.requestNotificationPermission());

    // Settings toggles
    document.getElementById('setting-notifications').addEventListener('change', (e) => {
      this.settings.notifications = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        this.requestNotificationPermission();
      } else {
        this.updateNotificationUI();
      }
    });
    document.getElementById('setting-notify-start').addEventListener('change', (e) => {
      this.settings.notifyStart = e.target.checked;
      this.saveSettings();
    });
    document.getElementById('setting-notify-end').addEventListener('change', (e) => {
      this.settings.notifyEnd = e.target.checked;
      this.saveSettings();
    });
    document.getElementById('setting-notify-day-before').addEventListener('change', (e) => {
      this.settings.notifyDayBefore = e.target.checked;
      this.saveSettings();
    });

    // Dark theme toggle
    const darkThemeToggle = document.getElementById('setting-dark-theme');
    if (darkThemeToggle) {
      darkThemeToggle.addEventListener('change', (e) => {
        this.darkTheme = e.target.checked;
        document.documentElement.classList.toggle('light-theme', !this.darkTheme);
        this.settings.darkTheme = this.darkTheme;
        this.saveSettings();
      });
    }

    // Batch mode handlers
    const batchSelectAllBtn = document.getElementById('batch-select-all');
    if (batchSelectAllBtn) {
      batchSelectAllBtn.addEventListener('click', () => this.batchSelectAll());
    }
    const batchDeleteBtn = document.getElementById('batch-delete');
    if (batchDeleteBtn) {
      batchDeleteBtn.addEventListener('click', () => this.batchDelete());
    }
    const batchCancelBtn = document.getElementById('batch-cancel');
    if (batchCancelBtn) {
      batchCancelBtn.addEventListener('click', () => this.toggleBatchMode(false));
    }
    const batchToggleBtn = document.getElementById('btn-batch-toggle');
    if (batchToggleBtn) {
      batchToggleBtn.addEventListener('click', () => this.toggleBatchMode());
    }

    // Data management
    document.getElementById('btn-export').addEventListener('click', () => this.exportData());
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
    document.getElementById('btn-clear-all').addEventListener('click', () => this.clearAllData());

    // Test notification
    document.getElementById('btn-test-notification').addEventListener('click', () => this.sendTestNotification());

    // Share active campaigns
    document.getElementById('btn-share-active-campaigns').addEventListener('click', () => this.shareActiveCampaignsImage());
  },

  // =====================
  //   VIEW SWITCHING
  // =====================
  switchView(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(`view-${viewName}`).classList.add('active');
    document.querySelector(`[data-view="${viewName}"]`).classList.add('active');

    if (viewName === 'dashboard') {
      requestAnimationFrame(() => this.renderDashboard());
    } else if (viewName === 'campaigns') {
      requestAnimationFrame(() => this.renderCampaigns());
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // =====================
  //   CAMPAIGN STATUS
  // =====================
  // UTC bug fix: "2026-06-15" UTC olarak parse edilir, Türkiye'de 1 gün kayabilir
  parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  // Tek seferde status + countdown + class hesapla (3x getCampaignStatus çağrısını önler)
  getCampaignInfo(campaign) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startDay = this.parseLocalDate(campaign.startDate);
    const endDay = this.parseLocalDate(campaign.endDate);
    const DAY_MS = 86400000;

    let status, countdownText;

    if (today > endDay) {
      status = 'expired';
      const daysAgo = Math.floor((today - endDay) / DAY_MS);
      countdownText = daysAgo === 0 ? 'Bugün bitti' : `${daysAgo} gün önce bitti`;
    } else if (today < startDay) {
      status = 'upcoming';
      const daysUntil = Math.ceil((startDay - today) / DAY_MS);
      if (daysUntil === 0) countdownText = 'Bugün başlıyor';
      else if (daysUntil === 1) countdownText = 'Yarın başlıyor';
      else countdownText = `${daysUntil} gün sonra başlıyor`;
    } else {
      const daysLeft = Math.ceil((endDay - today) / DAY_MS);
      status = daysLeft <= 2 ? 'ending' : 'active';
      if (daysLeft === 0) countdownText = 'Bugün bitiyor!';
      else if (daysLeft === 1) countdownText = 'Yarın bitiyor!';
      else countdownText = `${daysLeft} gün kaldı`;
    }

    return { status, countdownText, countdownClass: `countdown-${status}` };
  },

  // Geriye uyumluluk — eski çağrılar için
  getCampaignStatus(campaign) {
    return this.getCampaignInfo(campaign).status;
  },

  // =====================
  //   DATE FORMATTING
  // =====================
  formatDate(dateStr) {
    const date = this.parseLocalDate(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short'
    });
  },

  getDateStr(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },

  getTodayStr() {
    return this.getDateStr(new Date());
  },

  // =====================
  //   DASHBOARD
  // =====================
  renderDashboard() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Haftanın sınırları: Pazartesi–Pazar
    const dayOfWeek = today.getDay(); // 0=Pazar, 1=Pazartesi, ..., 6=Cumartesi
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() + diffToMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6); // Pazar
    // Yarın (bitimine 1 gün kalan kampanyalar için)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    let activeCount = 0;
    let startingTodayCount = 0;
    let endingTodayCount = 0;
    let endingWeekCount = 0;
    let pendingPosterCount = 0;
    const todayCampaigns = [];
    const endingSoon = [];

    this.campaigns.forEach(c => {
      const status = this.getCampaignStatus(c);
      const startDay = this.parseLocalDate(c.startDate);
      const endDay = this.parseLocalDate(c.endDate);

      if (status === 'active' || status === 'ending') {
        activeCount++;
        if ((c.posterStatus || 'pending') === 'pending') {
          pendingPosterCount++;
        }
      }

      if (startDay.getTime() === today.getTime()) {
        startingTodayCount++;
        todayCampaigns.push(c);
      }

      if (endDay.getTime() === today.getTime()) {
        endingTodayCount++;
        if (!todayCampaigns.includes(c)) todayCampaigns.push(c);
      }

      if (endDay >= weekStart && endDay <= weekEnd && status !== 'expired') {
        endingWeekCount++;
      }

      // Yakında Bitenler: bitimine 1 gün kalan (yarın biten) kampanyalar
      if (endDay.getTime() === tomorrow.getTime() && status !== 'expired') {
        endingSoon.push(c);
      }
    });

    // Update stat counters with animation
    this.animateCounter('stat-active', activeCount);
    this.animateCounter('stat-starting-today', startingTodayCount);
    this.animateCounter('stat-ending-today', endingTodayCount);
    this.animateCounter('stat-ending-week', endingWeekCount);
    this.animateCounter('stat-pending-poster', pendingPosterCount);

    // Afiş bekleyen kart pulse animasyonu
    const pendingCard = document.getElementById('card-pending-poster');
    if (pendingCard) {
      if (pendingPosterCount > 0) {
        pendingCard.classList.add('pulse-warning');
      } else {
        pendingCard.classList.remove('pulse-warning');
      }
    }

    // Update badge count
    const badge = document.getElementById('notification-badge');
    if (badge) {
      if (todayCampaigns.length > 0) {
        badge.textContent = todayCampaigns.length;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }

    // Render today's campaigns
    const todayContainer = document.getElementById('today-campaigns');
    if (todayCampaigns.length === 0) {
      todayContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📭</span>
          <p>Bugün başlayan veya biten kampanya yok</p>
        </div>`;
    } else {
      todayContainer.innerHTML = todayCampaigns.map((c, i) => this.renderCampaignCard(c, i)).join('');
    }

    // Render ending soon
    const endingContainer = document.getElementById('ending-soon');
    endingSoon.sort((a, b) => new Date(a.endDate) - new Date(b.endDate));
    if (endingSoon.length === 0) {
      endingContainer.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">✅</span>
          <p>Yarın biten kampanya yok</p>
        </div>`;
    } else {
      endingContainer.innerHTML = endingSoon.slice(0, 5).map((c, i) => this.renderCampaignCard(c, i, false)).join('');
    }

    // Kategori dağılımı grafiği
    this.renderCategoryChart();
  },

  animateCounter(elementId, target) {
    const el = document.getElementById(elementId);
    const current = parseInt(el.textContent) || 0;
    if (current === target) return;

    const duration = 400;
    const start = performance.now();

    const animate = (time) => {
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(current + (target - current) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  },

  // =====================
  //   CAMPAIGN LIST
  // =====================
  renderCampaigns() {
    // Filtre sekmelerine sayaç ekle
    this.updateFilterCounts();

    let filtered = [...this.campaigns];

    // Status Filter
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(c => {
        const status = this.getCampaignStatus(c);
        if (this.currentFilter === 'active') return status === 'active' || status === 'ending';
        if (this.currentFilter === 'upcoming') return status === 'upcoming';
        if (this.currentFilter === 'expired') return status === 'expired';
        return true;
      });
    }
    // Category Filter (AND)
    if (this.currentCategory !== 'all') {
      filtered = filtered.filter(c => c.category === this.currentCategory);
    }

    // Poster Filter (AND)
    if (this.posterFilter === 'pending') {
      filtered = filtered.filter(c => (c.posterStatus || 'pending') === 'pending');
    }

    // Search
    if (this.searchQuery) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(this.searchQuery) ||
        (c.description && c.description.toLowerCase().includes(this.searchQuery)) ||
        (this.categories[c.category] && this.categories[c.category].label.toLowerCase().includes(this.searchQuery))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (this.currentSort) {
        case 'endDate': return new Date(a.endDate) - new Date(b.endDate);
        case 'startDate': return new Date(a.startDate) - new Date(b.startDate);
        case 'name': return a.name.localeCompare(b.name, 'tr');
        case 'createdAt': return new Date(b.createdAt) - new Date(a.createdAt);
        default: return 0;
      }
    });

    // Batch toolbar
    const batchToolbar = document.getElementById('batch-toolbar');
    if (batchToolbar) {
      batchToolbar.style.display = this.batchMode ? 'flex' : 'none';
      this.updateBatchToolbar();
    }

    const container = document.getElementById('campaigns-list');

    // Poster filter banner güncelle
    this.updatePosterFilterBanner();

    if (filtered.length === 0) {
      const message = this.campaigns.length === 0
        ? `<span class="empty-icon">🏷️</span><p>Henüz kampanya eklenmemiş</p>
           <button class="btn btn-primary btn-sm" onclick="app.openModal()">İlk Kampanyayı Ekle</button>`
        : `<span class="empty-icon">🔍</span><p>Seçili filtre ve kategoriye uygun kampanya bulunamadı</p>`;
      container.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    container.innerHTML = filtered.map((c, i) => this.renderCampaignCard(c, i, true)).join('');
  },

  renderCampaignCard(campaign, index, showActions = true) {
    const { status, countdownText: countdown, countdownClass } = this.getCampaignInfo(campaign);
    const cat = this.categories[campaign.category] || this.categories.diger;
    const delay = Math.min(index * 0.05, 0.3);
    const progressInfo = status !== 'upcoming' ? this.getProgressInfo(campaign, status) : null;

    return `
      <div class="campaign-card status-${status}${this.batchMode ? ' batch-mode' : ''}${this.selectedCampaigns.has(campaign.id) ? ' selected' : ''}" style="animation-delay: ${delay}s" data-id="${campaign.id}"${this.batchMode ? ` onclick="app.toggleCampaignSelection('${campaign.id}')"` : ''}>
        ${this.batchMode ? `<input type="checkbox" class="batch-checkbox" ${this.selectedCampaigns.has(campaign.id) ? 'checked' : ''} onchange="app.toggleCampaignSelection('${campaign.id}')" onclick="event.stopPropagation()">` : ''}
        <div class="campaign-card-header">
          <span class="campaign-name">${this.escapeHtml(campaign.name)}</span>
          <span class="campaign-category">${cat.icon} ${cat.label}</span>
        </div>
        ${campaign.description ? `<p class="campaign-description">${this.escapeHtml(campaign.description)}</p>` : ''}
        ${campaign.notes ? `<div class="campaign-notes">📝 ${this.escapeHtml(campaign.notes)}</div>` : ''}
        <div class="campaign-meta">
          <div class="campaign-dates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${this.formatDate(campaign.startDate)} — ${this.formatDate(campaign.endDate)}
          </div>
          <span class="campaign-countdown ${countdownClass}">${countdown}</span>
        </div>
        ${progressInfo ? `
          <div class="campaign-progress"><div class="campaign-progress-bar ${progressInfo.barClass}" style="width:${progressInfo.pct}%"></div></div>
          <div class="campaign-progress-text">${progressInfo.elapsedDays}/${progressInfo.totalDays} gün (${progressInfo.pct}%)</div>` : ''}
        <div class="campaign-poster-status">
          <span class="poster-badge poster-${campaign.posterStatus || 'pending'}" onclick="app.togglePosterStatus('${campaign.id}', event)">
            ${this.getPosterStatusLabel(campaign.posterStatus || 'pending')}
          </span>
          <span class="poster-badge demand-${campaign.demandStatus || 'pending'}" onclick="app.toggleDemandStatus('${campaign.id}', event)">
            ${this.getDemandStatusLabel(campaign.demandStatus || 'pending')}
          </span>
        </div>
        ${showActions ? `
        <div class="campaign-actions">
          <button class="campaign-action-btn" onclick="app.editCampaign('${campaign.id}')" title="Düzenle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Düzenle
          </button>
          <button class="campaign-action-btn" onclick="app.duplicateCampaign('${campaign.id}')" title="Kopyala">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Kopyala
          </button>
          <button class="campaign-action-btn" onclick="app.createPosterDemand('${campaign.id}')" title="Afiş Talebi Gönder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Afiş İste
          </button>
          <button class="campaign-action-btn delete" onclick="app.deleteCampaign('${campaign.id}')" title="Sil">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Sil
          </button>
        </div>` : ''}
      </div>`;
  },

  // =====================
  //   CRUD OPERATIONS
  // =====================
  openModal(campaign = null) {
    const modal = document.getElementById('campaign-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('campaign-form');

    form.reset();

    if (campaign) {
      this.editingId = campaign.id;
      title.textContent = 'Kampanyayı Düzenle';
      // input-id artık kullanılmıyor, editingId yeterli
      document.getElementById('input-name').value = campaign.name;
      document.getElementById('input-description').value = campaign.description || '';
      document.getElementById('input-notes').value = campaign.notes || '';
      document.getElementById('input-category').value = campaign.category;
      document.getElementById('input-poster-status').value = campaign.posterStatus || 'pending';
      document.getElementById('input-demand-status').value = campaign.demandStatus || 'pending';
      document.getElementById('input-start').value = campaign.startDate;
      document.getElementById('input-end').value = campaign.endDate;
    } else {
      this.editingId = null;
      title.textContent = 'Yeni Kampanya';
      document.getElementById('input-poster-status').value = 'pending';
      document.getElementById('input-demand-status').value = 'pending';
      // Set default dates
      const today = this.getTodayStr();
      document.getElementById('input-start').value = today;
    }

    modal.classList.add('open');
    // Focus first input after animation
    setTimeout(() => document.getElementById('input-name').focus(), 350);
  },

  closeModal() {
    const modal = document.getElementById('campaign-modal');
    modal.classList.remove('open');
    this.editingId = null;
  },

  handleFormSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('input-name').value.trim();
    const description = document.getElementById('input-description').value.trim();
    const notes = document.getElementById('input-notes').value.trim();
    const category = document.getElementById('input-category').value;
    const posterStatus = document.getElementById('input-poster-status').value;
    const demandStatus = document.getElementById('input-demand-status').value;
    const startDate = document.getElementById('input-start').value;
    const endDate = document.getElementById('input-end').value;

    if (!name || !startDate || !endDate) {
      this.showToast('Lütfen zorunlu alanları doldurun', 'warning');
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      this.showToast('Bitiş tarihi başlangıçtan önce olamaz', 'error');
      return;
    }

    if (this.editingId) {
      // Update existing
      const index = this.campaigns.findIndex(c => c.id === this.editingId);
      if (index !== -1) {
        this.campaigns[index] = {
          ...this.campaigns[index],
          name, description, notes, category, posterStatus, demandStatus, startDate, endDate,
          updatedAt: new Date().toISOString()
        };
        this.showToast('Kampanya güncellendi', 'success');
      }
    } else {
      // Create new
      const campaign = {
        id: this.generateId(),
        name, description, notes, category, posterStatus, demandStatus, startDate, endDate,
        createdAt: new Date().toISOString()
      };
      this.campaigns.push(campaign);
      this.showToast('Kampanya eklendi', 'success');
    }

    this.saveData();
    this.closeModal();
    this.renderDashboard();
    this.renderCampaigns();
  },

  editCampaign(id) {
    const campaign = this.campaigns.find(c => c.id === id);
    if (campaign) this.openModal(campaign);
  },

  duplicateCampaign(id) {
    const campaign = this.campaigns.find(c => c.id === id);
    if (!campaign) return;
    const newCampaign = {
      ...campaign,
      id: this.generateId(),
      name: campaign.name + ' (Kopya)',
      posterStatus: 'pending',
      demandStatus: 'pending',
      createdAt: new Date().toISOString()
    };
    this.campaigns.push(newCampaign);
    this.saveData();
    this.renderDashboard();
    this.renderCampaigns();
    this.showToast('Kampanya kopyalandı', 'success');
  },

  clearPosterFilter() {
    this.posterFilter = 'all';
    this.updatePosterFilterBanner();
    this.renderCampaigns();
  },

  updatePosterFilterBanner() {
    const banner = document.getElementById('poster-filter-banner');
    if (!banner) return;
    if (this.posterFilter === 'pending') {
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }
  },

  deleteCampaign(id) {
    const campaign = this.campaigns.find(c => c.id === id);
    if (!campaign) return;

    this.deleteTargetId = id;
    document.getElementById('delete-campaign-name').textContent = campaign.name;
    document.getElementById('delete-modal').classList.add('open');
  },

  closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('open');
    this.deleteTargetId = null;
  },

  confirmDelete() {
    if (!this.deleteTargetId) return;

    this.campaigns = this.campaigns.filter(c => c.id !== this.deleteTargetId);
    this.saveData();
    this.closeDeleteModal();
    this.renderDashboard();
    this.renderCampaigns();
    this.showToast('Kampanya silindi', 'success');
  },

  // =====================
  //   NOTIFICATIONS
  // =====================
  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.showToast('Bu cihaz veya tarayıcı bildirimleri desteklemiyor', 'error');
      this.settings.notifications = false;
      this.saveSettings();
      this.updateNotificationUI();
      return;
    }

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

    if (isIOS && !isStandalone) {
      this.showToast('iOS bildirimleri için: Paylaş butonuna basıp "Ana Ekrana Ekle" yaptıktan sonra uygulamayı ana ekrandan açın.', 'warning');
      this.settings.notifications = false;
      this.saveSettings();
      this.updateNotificationUI();
      return;
    }

    // Wait for service worker to be ready (critical for PWAs, especially iOS)
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.ready;
      } catch (e) {
        console.error('Service worker ready check failed:', e);
      }
    }

    if (Notification.permission === 'granted') {
      this.showToast('Bildirimler zaten aktif!', 'info');
      this.settings.notifications = true;
      this.saveSettings();
      this.updateNotificationUI();
      return;
    }

    if (Notification.permission === 'denied') {
      let msg = 'Bildirim izni engellenmiş. Lütfen cihaz ayarlarınızdan izin verin.';
      if (isIOS) {
        msg = 'Bildirim izni engellenmiş. Telefonunuzun Ayarlar -> Bildirimler -> Kampanya Takip bölümünden bildirimlere izin verin.';
      } else if (/Android/i.test(navigator.userAgent)) {
        msg = 'Bildirim izni engellenmiş. Telefonunuzun Ayarlar -> Uygulamalar -> Kampanya Takip -> Bildirimler bölümünden izin verin.';
      }
      this.showToast(msg, 'warning');
      this.settings.notifications = false;
      this.saveSettings();
      this.updateNotificationUI();
      return;
    }

    try {
      // Prompt for permission (supporting both callback and promise syntax)
      const permission = await new Promise((resolve) => {
        const result = Notification.requestPermission(resolve);
        if (result && typeof result.then === 'function') {
          result.then(resolve);
        }
      });

      if (permission === 'granted') {
        this.showToast('Bildirimler etkinleştirildi!', 'success');
        this.settings.notifications = true;
        this.saveSettings();
        this.updateNotificationUI();
        // Trigger a test notification to confirm it works
        this.sendNotification(
          '🚀 Bildirimler Aktif!',
          'Kampanya Takip hatırlatıcı bildirimleri başarıyla etkinleştirildi.',
          'welcome-notification'
        );
      } else {
        this.showToast('Bildirim izni reddedildi', 'warning');
        this.settings.notifications = false;
        this.saveSettings();
        this.updateNotificationUI();
      }
    } catch (e) {
      console.error('Bildirim izni istenirken hata:', e);
      this.showToast('Bildirim izni istenirken bir hata oluştu.', 'error');
      this.settings.notifications = false;
      this.saveSettings();
      this.updateNotificationUI();
    }
  },

  async sendNotification(title, body, tag) {
    if (!this.settings.notifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, {
          body,
          tag,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🏷️</text></svg>',
          badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🔔</text></svg>',
          vibrate: [200, 100, 200],
          requireInteraction: true
        });
      } else {
        // Fallback to direct notification
        new Notification(title, {
          body,
          tag,
          icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">🏷️</text></svg>',
          requireInteraction: true
        });
      }
    } catch (e) {
      console.error('Bildirim gönderme hatası:', e);
    }
  },

  sendTestNotification() {
    if (!('Notification' in window)) {
      this.showToast('Bu tarayıcı bildirimleri desteklemiyor', 'error');
      return;
    }
    if (Notification.permission !== 'granted') {
      this.requestNotificationPermission();
      return;
    }
    this.sendNotification(
      '🏷️ Kampanya Takip Test',
      'Bildirimler çalışıyor! Kampanyalarınız için hatırlatıcılar alacaksınız.',
      'test-notification'
    );
    this.showToast('Test bildirimi gönderildi', 'success');
  },

  startNotificationChecker() {
    this.stopNotificationChecker();
    // Check every 60 seconds
    this.checkNotifications();
    this.notificationCheckInterval = setInterval(() => this.checkNotifications(), 60000);
  },

  stopNotificationChecker() {
    if (this.notificationCheckInterval) {
      clearInterval(this.notificationCheckInterval);
      this.notificationCheckInterval = null;
    }
  },

  checkNotifications() {
    if (!this.settings.notifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const todayStr = this.getTodayStr();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = this.getDateStr(tomorrow);

    this.campaigns.forEach(campaign => {
      // Campaign starts today
      if (this.settings.notifyStart && campaign.startDate === todayStr) {
        const key = `${campaign.id}_start_${todayStr}`;
        if (!this.notifiedSet.has(key)) {
          this.notifiedSet.add(key);
          this.sendNotification(
            '🚀 Kampanya Başladı!',
            `"${campaign.name}" kampanyası bugün başladı!`,
            `start-${campaign.id}`
          );
        }
      }

      // Campaign ends today
      if (this.settings.notifyEnd && campaign.endDate === todayStr) {
        const key = `${campaign.id}_end_${todayStr}`;
        if (!this.notifiedSet.has(key)) {
          this.notifiedSet.add(key);
          this.sendNotification(
            '⏰ Kampanya Bitiyor!',
            `"${campaign.name}" kampanyası bugün sona eriyor!`,
            `end-${campaign.id}`
          );
        }
      }

      // Campaign ends tomorrow (1 day before)
      if (this.settings.notifyDayBefore && campaign.endDate === tomorrowStr) {
        const key = `${campaign.id}_daybefore_${todayStr}`;
        if (!this.notifiedSet.has(key)) {
          this.notifiedSet.add(key);
          this.sendNotification(
            '⚠️ Kampanya Yarın Bitiyor!',
            `"${campaign.name}" kampanyası yarın sona erecek!`,
            `daybefore-${campaign.id}`
          );
        }
      }
    });

    this.saveNotifiedSet();
  },

  // =====================
  //   SERVICE WORKER
  // =====================
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        // Listen for controller changes (reliable detection for skipWaiting / clients.claim)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          const banner = document.getElementById('sw-update-banner');
          if (banner) banner.style.display = 'flex';
        });

        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered successfully:', registration);
        this.updateNotificationUI();

        // Force an update check on launch to bypass browser HTTP cache (e.g. GitHub Pages 10-min cache)
        if (typeof registration.update === 'function') {
          registration.update();
        }

        // SW update detection (installing worker state changes)
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            const checkState = () => {
              if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
                const banner = document.getElementById('sw-update-banner');
                if (banner) banner.style.display = 'flex';
              }
            };
            newWorker.addEventListener('statechange', checkState);
            checkState(); // Check immediately in case it already transitioned
          }
        });
      } catch (e) {
        console.log('Service Worker kayıt hatası:', e);
      }
    }
  },

  // =====================
  //   SETTINGS
  // =====================
  applySettings() {
    document.getElementById('setting-notifications').checked = this.settings.notifications;
    document.getElementById('setting-notify-start').checked = this.settings.notifyStart;
    document.getElementById('setting-notify-end').checked = this.settings.notifyEnd;
    document.getElementById('setting-notify-day-before').checked = this.settings.notifyDayBefore;

    // Dark theme
    const darkToggle = document.getElementById('setting-dark-theme');
    if (darkToggle) {
      this.darkTheme = this.settings.darkTheme !== false;
      darkToggle.checked = this.darkTheme;
      document.documentElement.classList.toggle('light-theme', !this.darkTheme);
    }

    this.updateNotificationUI();

    // Update dynamic version in info footer
    const appInfoEl = document.getElementById('app-version-text');
    if (appInfoEl) {
      appInfoEl.textContent = `Kampanya Takip ${this.config.version}`;
    }
  },

  updateNotificationUI() {
    const btn = document.getElementById('btn-notification-toggle');
    if (!btn) return;

    const iconEl = btn.querySelector('.notification-icon');
    const hasPermission = 'Notification' in window && Notification.permission === 'granted';
    const isEnabled = this.settings.notifications && hasPermission;

    if (isEnabled) {
      btn.classList.add('active');
      btn.style.color = 'var(--accent)';
      btn.style.borderColor = 'var(--border-focus)';
      btn.style.boxShadow = '0 0 10px var(--accent-glow)';
      btn.title = 'Bildirimler Aktif';
      if (iconEl) iconEl.textContent = '🔔';
    } else {
      btn.classList.remove('active');
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.style.boxShadow = '';
      btn.title = 'Bildirimleri Aç';
      if (iconEl) iconEl.textContent = '🔕';
    }

    // Also update checkbox in settings
    const checkbox = document.getElementById('setting-notifications');
    if (checkbox) {
      checkbox.checked = isEnabled;
    }
  },

  // =====================
  //   IMPORT / EXPORT
  // =====================
  async exportData() {
    const choice = await this.showConfirm(
      'Dışa Aktarma',
      'Hangi kampanyaları dışa aktarmak istiyorsunuz?',
      [
        { label: 'Tümünü Aktar', class: 'btn-primary', value: 'all' },
        { label: 'Filtrelenenleri Aktar', class: 'btn-secondary', value: 'filtered' },
        { label: 'İptal', class: 'btn-secondary', value: 'cancel' }
      ]
    );
    if (choice === 'cancel') return;

    let campaignsToExport;
    if (choice === 'filtered') {
      campaignsToExport = this.getFilteredCampaigns();
    } else {
      campaignsToExport = this.campaigns;
    }

    if (campaignsToExport.length === 0) {
      this.showToast('Dışa aktarılacak kampanya yok', 'warning');
      return;
    }

    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      campaigns: campaignsToExport
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kampanya-takip-${this.getTodayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast(`${campaignsToExport.length} kampanya dışa aktarıldı`, 'success');
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.campaigns && Array.isArray(data.campaigns)) {
          const newCampaigns = data.campaigns;
          let addedCount = 0;
          let updatedCount = 0;
          let skippedCount = 0;
          let conflictChoice = null; // Can be 'overwrite', 'skip', 'cancel', or null

          for (const newCamp of newCampaigns) {
            const existingIndex = this.campaigns.findIndex(c => c.id === newCamp.id);
            if (existingIndex !== -1) {
              if (!conflictChoice) {
                const choice = await this.showConfirm(
                  'Veri Çakışması',
                  `Sistemde zaten "${this.escapeHtml(this.campaigns[existingIndex].name)}" gibi aynı ID'ye sahip kampanyalar var. Nasıl devam etmek istersiniz?`,
                  [
                    { label: 'Üzerine Yaz', class: 'btn-danger', value: 'overwrite' },
                    { label: 'Atla', class: 'btn-secondary', value: 'skip' },
                    { label: 'Vazgeç', class: 'btn-secondary', value: 'cancel' }
                  ]
                );
                
                if (choice === 'cancel') {
                  this.showToast('İçe aktarma iptal edildi', 'warning');
                  return;
                }
                conflictChoice = choice;
              }

              if (conflictChoice === 'overwrite') {
                this.campaigns[existingIndex] = newCamp;
                updatedCount++;
              } else {
                skippedCount++;
              }
            } else {
              this.campaigns.push(newCamp);
              addedCount++;
            }
          }

          this.saveData();
          this.renderDashboard();
          this.renderCampaigns();
          const parts = [];
          if (addedCount > 0) parts.push(`${addedCount} eklendi`);
          if (updatedCount > 0) parts.push(`${updatedCount} güncellendi`);
          if (skippedCount > 0) parts.push(`${skippedCount} atlandı`);
          this.showToast(parts.length > 0 ? parts.join(', ') : 'İçe aktarılacak yeni kampanya yok', parts.length > 0 && skippedCount === 0 ? 'success' : 'info');
        } else {
          this.showToast('Geçersiz dosya formatı', 'error');
        }
      } catch (err) {
        this.showToast('Dosya okunamadı: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  },

  async clearAllData() {
    const choice = await this.showConfirm(
      'Tüm Verileri Sil',
      'Tüm kampanyaları silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz!',
      [
        { label: 'Vazgeç', class: 'btn-secondary', value: 'cancel' },
        { label: 'Tümünü Sil', class: 'btn-danger', value: 'clear' }
      ]
    );
    
    if (choice !== 'clear') return;

    this.campaigns = [];
    this.saveData();
    this.renderDashboard();
    this.renderCampaigns();
    this.showToast('Tüm veriler silindi', 'success');
  },

  // =====================
  //   TOAST NOTIFICATIONS
  // =====================
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <span class="toast-message">${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  // =====================
  //   UTILITIES & HELPERS
  // =====================
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 11);
  },

  escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  getPosterStatusLabel(status) {
    const statuses = {
      pending: '⏳ Afiş Asılmadı',
      hung: '📌 Afiş Asıldı',
      removed: '❌ Afiş Söküldü'
    };
    return statuses[status] || statuses.pending;
  },

  togglePosterStatus(id, event) {
    if (event) event.stopPropagation();
    const campaign = this.campaigns.find(c => c.id === id);
    if (!campaign) return;

    const current = campaign.posterStatus || 'pending';
    let next = 'pending';
    if (current === 'pending') next = 'hung';
    else if (current === 'hung') next = 'removed';
    else if (current === 'removed') next = 'pending';

    campaign.posterStatus = next;
    campaign.updatedAt = new Date().toISOString();
    
    this.saveData();
    this.updateCampaignBadgesInDOM(id, next, null);
    
    const labels = {
      pending: 'Afiş asılmadı olarak işaretlendi',
      hung: 'Afiş asıldı olarak işaretlendi',
      removed: 'Afiş söküldü olarak işaretlendi'
    };
    this.showToast(labels[next], 'info');
  },

  createPosterDemand(id) {
    const campaign = this.campaigns.find(c => c.id === id);
    if (!campaign) return;

    const startObj = this.parseLocalDate(campaign.startDate);
    const endObj = this.parseLocalDate(campaign.endDate);
    
    const startFormatted = startObj.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const endFormatted = endObj.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const textTemplate = `${campaign.name} ${startFormatted}-${endFormatted}`;

    campaign.demandStatus = 'created';
    campaign.updatedAt = new Date().toISOString();
    this.saveData();
    this.updateCampaignBadgesInDOM(id, null, 'created');

    navigator.clipboard.writeText(textTemplate)
      .then(() => {
        this.showToast('Kampanya içeriği panoya kopyalandı! Talep formundaki "Afiş İçeriği" alanına yapıştırabilirsiniz.', 'success');
      })
      .catch((err) => {
        console.error('Kopyalama hatası:', err);
        this.showToast('Talep oluşturuldu! Form açılıyor...', 'info');
      })
      .finally(() => {
        window.open(this.config.demandFormUrl, '_blank');
      });
  },

  getDemandStatusLabel(status) {
    const statuses = {
      pending: '🎨 Talep Bekliyor',
      created: '✅ Talep Oluşturuldu'
    };
    return statuses[status] || statuses.pending;
  },

  toggleDemandStatus(id, event) {
    if (event) event.stopPropagation();
    const campaign = this.campaigns.find(c => c.id === id);
    if (!campaign) return;

    const current = campaign.demandStatus || 'pending';
    const next = current === 'pending' ? 'created' : 'pending';

    campaign.demandStatus = next;
    campaign.updatedAt = new Date().toISOString();
    
    this.saveData();
    this.updateCampaignBadgesInDOM(id, null, next);
    
    const labels = {
      pending: 'Tasarım talebi bekleniyor olarak işaretlendi',
      created: 'Tasarım talebi oluşturuldu olarak işaretlendi'
    };
    this.showToast(labels[next], 'info');
  },

  showConfirm(title, text, buttons = []) {
    return new Promise((resolve) => {
      const modal = document.getElementById('confirm-modal');
      const titleEl = document.getElementById('confirm-modal-title');
      const textEl = document.getElementById('confirm-modal-text');
      const buttonsContainer = document.getElementById('confirm-modal-buttons');
      
      if (!modal || !titleEl || !textEl || !buttonsContainer) {
        const res = confirm(`${title}\n\n${text}`);
        resolve(res ? 'yes' : 'no');
        return;
      }
      
      titleEl.textContent = title;
      textEl.innerHTML = text.replace(/\n/g, '<br>');
      buttonsContainer.innerHTML = '';
      
      const btnList = buttons.length > 0 ? buttons : [
        { label: 'İptal', class: 'btn-secondary', value: 'cancel' },
        { label: 'Tamam', class: 'btn-primary', value: 'ok' }
      ];
      
      let resolved = false;
      const closeModal = (val) => {
        if (resolved) return;
        resolved = true;
        this._confirmResolver = null;
        modal.classList.remove('open');
        // Overlay listener'ı temizle
        modal.removeEventListener('click', overlayHandler);
        resolve(val);
      };

      // ESC handler'dan erişilebilmesi için
      this._confirmResolver = closeModal;

      // Overlay tıklaması ile kapatma (Promise sızıntısı fix)
      const overlayHandler = (e) => {
        if (e.target === modal) closeModal('cancel');
      };
      modal.addEventListener('click', overlayHandler);
      
      const closeBtn = modal.querySelector('.btn-confirm-cancel');
      if (closeBtn) {
        closeBtn.onclick = () => closeModal('cancel');
      }
      
      btnList.forEach(btnInfo => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `btn ${btnInfo.class || 'btn-secondary'}`;
        btn.textContent = btnInfo.label;
        btn.onclick = () => {
          closeModal(btnInfo.value);
        };
        buttonsContainer.appendChild(btn);
      });
      
      modal.classList.add('open');
    });
  },

  updateCampaignBadgesInDOM(id, posterStatus, demandStatus) {
    const cards = document.querySelectorAll(`[data-id="${id}"]`);
    cards.forEach(card => {
      if (posterStatus) {
        const posterBadge = card.querySelector('.poster-badge.poster-pending, .poster-badge.poster-hung, .poster-badge.poster-removed');
        if (posterBadge) {
          posterBadge.className = `poster-badge poster-${posterStatus}`;
          posterBadge.textContent = this.getPosterStatusLabel(posterStatus);
        }
      }
      if (demandStatus) {
        const demandBadge = card.querySelector('.poster-badge.demand-pending, .poster-badge.demand-created');
        if (demandBadge) {
          demandBadge.className = `poster-badge demand-${demandStatus}`;
          demandBadge.textContent = this.getDemandStatusLabel(demandStatus);
        }
      }
    });
    this.updateDashboardStatsSilently();
    this.updateFilterCounts();
    if (this.posterFilter === 'pending' && posterStatus && posterStatus !== 'pending') {
      this.renderCampaigns();
    }
  },

  updateDashboardStatsSilently() {
    let activeCount = 0;
    let pendingPosterCount = 0;
    
    this.campaigns.forEach(c => {
      const status = this.getCampaignStatus(c);
      if (status === 'active' || status === 'ending') {
        activeCount++;
        if ((c.posterStatus || 'pending') === 'pending') {
          pendingPosterCount++;
        }
      }
    });
    
    const activeEl = document.getElementById('stat-active');
    if (activeEl) activeEl.textContent = activeCount;
    
    const pendingEl = document.getElementById('stat-pending-poster');
    if (pendingEl) pendingEl.textContent = pendingPosterCount;
  },

  shareActiveCampaignsImage() {
    const active = this.campaigns.filter(c => {
      const status = this.getCampaignStatus(c);
      return status === 'active' || status === 'ending';
    });

    if (active.length === 0) {
      this.showToast('Paylaşılacak aktif kampanya bulunamadı!', 'warning');
      return;
    }

    this.showToast('Görsel hazırlanıyor...', 'info');

    // Create canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Dimensions
    const baseWidth = 800;
    const headerHeight = 105;
    const itemHeight = 130;
    const footerHeight = 30;
    const baseHeight = headerHeight + (active.length * itemHeight) + footerHeight;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = baseWidth * dpr;
    canvas.height = baseHeight * dpr;
    canvas.style.width = `${baseWidth}px`;
    canvas.style.height = `${baseHeight}px`;

    // Scale drawing context for Retina display/high-DPI scaling support
    ctx.scale(dpr, dpr);

    // Draw background (premium light theme gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, baseHeight);
    gradient.addColorStop(0, '#f8fafc');
    gradient.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, baseWidth, baseHeight);

    // Bottom brand bar
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(0, 0, baseWidth, 6);

    // Font stack styling
    const fontStack = "'-apple-system', BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
    const fontSubtitle = `bold 16px 'Inter', ${fontStack}`;
    const fontCardTitle = `bold 18px 'Inter', ${fontStack}`;
    const fontCardDate = `14px 'Inter', ${fontStack}`;
    const fontBadge = `bold 12px 'Inter', ${fontStack}`;

    // Helper function to wrap text inside canvas (supports up to 3 lines for long campaign names)
    const wrapText = (context, text, x, y, maxWidth, lineHeight) => {
      const words = text.split(' ');
      let line = '';
      const lines = [];

      for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = context.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
          lines.push(line.trim());
          line = words[n] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line.trim());
      
      const linesToDraw = lines.slice(0, 3);
      linesToDraw.forEach((lineText, idx) => {
        let displayText = lineText;
        if (idx === 2 && lines.length > 3) {
          displayText = lineText.substring(0, lineText.length - 3) + '...';
        }
        context.fillText(displayText, x, y + (idx * lineHeight));
      });
    };

    // Draw Date & Count on the left (clean minimalist style)
    ctx.font = fontSubtitle;
    ctx.fillStyle = '#0f172a';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const dateStr = new Date().toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    ctx.fillText(`📅 ${dateStr}  |  Toplam: ${active.length} Aktif Kampanya`, 50, 50);

    // Draw header separator line
    ctx.beginPath();
    ctx.moveTo(50, 85);
    ctx.lineTo(750, 85);
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Draw campaign cards
    active.forEach((campaign, i) => {
      const cardY = headerHeight + (i * itemHeight);
      
      // 1. Card background with soft shadow
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, 0.04)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 4;
      this.defineRoundedRectPath(ctx, 50, cardY, 700, 110, 10);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.restore();

      // 2. Left brand accent bar (clipped to rounded corner)
      const { status, countdownText: countdown } = this.getCampaignInfo(campaign);
      let accentColor = '#3b82f6'; // Active (blue)
      if (status === 'ending') {
        accentColor = '#f97316'; // Ending (orange)
      }

      ctx.save();
      this.defineRoundedRectPath(ctx, 50, cardY, 700, 110, 10);
      ctx.clip();
      ctx.fillStyle = accentColor;
      ctx.fillRect(50, cardY, 6, 110);
      ctx.restore();

      // 3. Card border
      this.defineRoundedRectPath(ctx, 50, cardY, 700, 110, 10);
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Category config
      const cat = this.categories[campaign.category] || this.categories.diger;

      // Draw campaign name (wrapped dynamically up to 3 lines)
      ctx.font = fontCardTitle;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const fullTitleText = `${cat.icon} ${campaign.name}`;
      wrapText(ctx, fullTitleText, 75, cardY + 14, 450, 22);

      // Draw date range
      ctx.font = fontCardDate;
      ctx.fillStyle = '#64748b';
      const startObj = this.parseLocalDate(campaign.startDate);
      const endObj = this.parseLocalDate(campaign.endDate);
      const startFormatted = startObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      const endFormatted = endObj.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      ctx.fillText(`📅 ${startFormatted} - ${endFormatted}`, 75, cardY + 84);

      // Draw countdown badge
      
      let badgeColor = '#1e40af'; // Active
      let badgeBg = '#eff6ff';
      let badgeBorder = '#dbeafe';
      
      if (status === 'ending') {
        badgeColor = '#c2410c'; // Ending
        badgeBg = '#fff7ed';
        badgeBorder = '#ffedd5';
      }

      // Badge rounded box
      this.defineRoundedRectPath(ctx, 540, cardY + 39, 180, 32, 6);
      ctx.fillStyle = badgeBg;
      ctx.fill();
      ctx.strokeStyle = badgeBorder;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Badge text
      ctx.font = fontBadge;
      ctx.fillStyle = badgeColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(countdown, 540 + 90, cardY + 39 + 16);
    });

    // Convert canvas synchronously to data URL and File
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const file = this.dataURLtoFile(dataUrl, 'aktif-kampanyalar.png');

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({
          files: [file],
          title: 'Aktif Kampanyalar',
          text: 'Aktif kampanyalarımız ekteki görseldedir.'
        })
        .then(() => {
          this.showToast('Kampanyalar başarıyla paylaşıldı!', 'success');
        })
        .catch(err => {
          if (err.name !== 'AbortError') {
            console.error('Paylaşım hatası:', err);
            this.executeShareFallback(canvas, file);
          }
        });
      } else {
        this.executeShareFallback(canvas, file);
      }
    } catch (err) {
      console.error('Paylaşım hazırlık hatası:', err);
      this.executeShareFallback(canvas, null);
    }
  },

  async executeShareFallback(canvas, file) {
    let downloaded = false;
    let dataUrl = '';

    // 1. Trigger Download synchronously
    try {
      dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `aktif-kampanyalar-${this.getTodayStr()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      downloaded = true;
    } catch (e) {
      console.error('Görsel indirme hatası:', e);
    }

    if (!dataUrl) {
      try {
        dataUrl = canvas.toDataURL('image/png');
      } catch (e) {
        console.error('DataURL oluşturulamadı:', e);
      }
    }

    // 2. Show the custom image sharing modal (bulletproof fallback for mobile & iOS)
    this.showImageShareModal(dataUrl, file);
  },

  showImageShareModal(dataUrl, file) {
    // Remove existing modal if any
    const existing = document.getElementById('share-image-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'share-image-modal';
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '300';

    overlay.innerHTML = `
      <div class="modal modal-sm" style="max-width: 90%; width: 450px; background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius); transform: none !important;">
        <div class="modal-header" style="border-bottom: 1px solid var(--border-color); padding-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
          <h2 style="font-size: 1.15rem; font-weight: 700; color: var(--text-primary); margin: 0;">Görsel Paylaş / Kaydet</h2>
          <button id="btn-share-modal-close" class="modal-close" aria-label="Kapat" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="modal-body" style="display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 16px 0;">
          <p style="font-size: 0.84rem; text-align: center; color: var(--text-secondary); margin: 0; line-height: 1.4;">
            Görseli galerinize kaydetmek veya paylaşmak için üzerine <strong>basılı tutun</strong> (veya sağ tıklayıp resmi kaydedin).
          </p>
          <div style="width: 100%; max-height: 250px; overflow-y: auto; border-radius: var(--radius-xs); border: 1px solid var(--border-color); background: #06080f; display: flex; align-items: center; justify-content: center; padding: 8px;">
            <img src="${dataUrl}" alt="Kampanyalar" style="max-width: 100%; max-height: 230px; object-fit: contain; border-radius: 4px; border: 1px solid rgba(255,255,255,0.05);">
          </div>
        </div>
        <div class="form-actions" style="margin-top: 10px; display: flex; gap: 8px; justify-content: flex-end;">
          <button type="button" id="btn-share-whatsapp" class="btn btn-primary" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 14px; font-weight: 600; font-size: 0.88rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:#25D366;fill:none;"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
            WhatsApp'ta Paylaş
          </button>
          <button type="button" id="btn-share-close" class="btn btn-secondary" style="padding: 10px 16px; font-weight: 600; font-size: 0.88rem;">Kapat</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', escClose);
    };

    const escClose = (e) => {
      if (e.key === 'Escape') close();
    };

    document.addEventListener('keydown', escClose);
    document.getElementById('btn-share-modal-close').addEventListener('click', close);
    document.getElementById('btn-share-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.getElementById('btn-share-whatsapp').addEventListener('click', async () => {
      if (navigator.clipboard && window.ClipboardItem && file) {
        try {
          const item = new window.ClipboardItem({ [file.type]: file });
          await navigator.clipboard.write([item]);
          this.showToast('Görsel panoya kopyalandı! WhatsApp\'ta doğrudan yapıştırabilirsiniz.', 'success');
        } catch (err) {
          console.warn('Panoya kopyalama başarısız:', err);
          this.showToast('İndirdiğiniz görseli WhatsApp\'ta ekleyerek gönderebilirsiniz.', 'info');
        }
      } else {
        this.showToast('Görsel kopyalanamadı, galerinizden seçerek paylaşabilirsiniz.', 'info');
      }
      
      try {
        window.open('https://api.whatsapp.com/send', '_blank');
      } catch (e) {
        console.error('WhatsApp açılırken hata:', e);
      }
      close();
    });
  },

  defineRoundedRectPath(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  },

  dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  },

  // truncateText kaldırıldı (ölü kod)

  getProgressInfo(campaign, status) {
    const startDay = this.parseLocalDate(campaign.startDate);
    const endDay = this.parseLocalDate(campaign.endDate);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const totalDays = Math.max(1, Math.ceil((endDay - startDay) / 86400000));
    const elapsedDays = Math.ceil((today - startDay) / 86400000);
    const pct = Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100)));
    let barClass = '';
    if (status === 'expired') barClass = 'progress-expired';
    else if (status === 'ending') barClass = 'progress-ending';
    return { pct, elapsedDays: Math.max(0, elapsedDays), totalDays, barClass };
  },

  updateFilterCounts() {
    const counts = { all: 0, active: 0, upcoming: 0, expired: 0 };
    this.campaigns.forEach(c => {
      counts.all++;
      const s = this.getCampaignStatus(c);
      if (s === 'active' || s === 'ending') counts.active++;
      else if (s === 'upcoming') counts.upcoming++;
      else if (s === 'expired') counts.expired++;
    });
    document.querySelectorAll('.filter-btn').forEach(btn => {
      const filter = btn.dataset.filter;
      if (filter && counts[filter] !== undefined) {
        let badge = btn.querySelector('.filter-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'filter-badge';
          btn.appendChild(badge);
        }
        badge.textContent = counts[filter];
      }
    });
  },

  getFilteredCampaigns() {
    let filtered = [...this.campaigns];
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(c => {
        const status = this.getCampaignStatus(c);
        if (this.currentFilter === 'active') return status === 'active' || status === 'ending';
        if (this.currentFilter === 'upcoming') return status === 'upcoming';
        if (this.currentFilter === 'expired') return status === 'expired';
        return true;
      });
    }
    if (this.currentCategory !== 'all') {
      filtered = filtered.filter(c => c.category === this.currentCategory);
    }
    if (this.posterFilter === 'pending') {
      filtered = filtered.filter(c => (c.posterStatus || 'pending') === 'pending');
    }
    if (this.searchQuery) {
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(this.searchQuery) ||
        (c.description && c.description.toLowerCase().includes(this.searchQuery))
      );
    }
    return filtered;
  },

  toggleBatchMode(enabled) {
    this.batchMode = enabled !== undefined ? enabled : !this.batchMode;
    this.selectedCampaigns.clear();
    this.renderCampaigns();
    const toolbar = document.getElementById('batch-toolbar');
    if (toolbar) toolbar.style.display = this.batchMode ? 'flex' : 'none';
    this.updateBatchToolbar();
  },

  toggleCampaignSelection(id) {
    if (this.selectedCampaigns.has(id)) {
      this.selectedCampaigns.delete(id);
    } else {
      this.selectedCampaigns.add(id);
    }
    // Update card visual
    const card = document.querySelector(`[data-id="${id}"]`);
    if (card) {
      card.classList.toggle('selected', this.selectedCampaigns.has(id));
      const checkbox = card.querySelector('.batch-checkbox');
      if (checkbox) checkbox.checked = this.selectedCampaigns.has(id);
    }
    this.updateBatchToolbar();
  },

  batchSelectAll() {
    const filtered = this.getFilteredCampaigns();
    if (this.selectedCampaigns.size === filtered.length) {
      this.selectedCampaigns.clear();
    } else {
      filtered.forEach(c => this.selectedCampaigns.add(c.id));
    }
    this.renderCampaigns();
    this.updateBatchToolbar();
  },

  async batchDelete() {
    const count = this.selectedCampaigns.size;
    if (count === 0) return;
    const choice = await this.showConfirm(
      'Toplu Silme',
      `${count} kampanyayı silmek istediğinize emin misiniz?`,
      [
        { label: 'İptal', class: 'btn-secondary', value: 'cancel' },
        { label: `${count} Kampanyayı Sil`, class: 'btn-danger', value: 'delete' }
      ]
    );
    if (choice !== 'delete') return;
    this.campaigns = this.campaigns.filter(c => !this.selectedCampaigns.has(c.id));
    this.selectedCampaigns.clear();
    this.batchMode = false;
    this.saveData();
    this.renderDashboard();
    this.renderCampaigns();
    const toolbar = document.getElementById('batch-toolbar');
    if (toolbar) toolbar.style.display = 'none';
    this.showToast(`${count} kampanya silindi`, 'success');
  },

  updateBatchToolbar() {
    const countEl = document.getElementById('batch-count');
    if (countEl) countEl.textContent = this.selectedCampaigns.size;
  },

  renderCategoryChart() {
    const container = document.getElementById('category-chart-content');
    if (!container) return;
    const counts = {};
    const activeCampaigns = this.campaigns.filter(c => {
      const s = this.getCampaignStatus(c);
      return s === 'active' || s === 'ending';
    });
    activeCampaigns.forEach(c => {
      const key = c.category || 'diger';
      counts[key] = (counts[key] || 0) + 1;
    });
    const max = Math.max(...Object.values(counts), 1);
    if (Object.keys(counts).length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem">Aktif kampanya yok</p>';
      return;
    }
    container.innerHTML = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => {
        const cat = this.categories[key] || this.categories.diger;
        const pct = Math.round((count / max) * 100);
        return `<div class="chart-bar-row">
          <span class="chart-bar-label">${cat.icon} ${cat.label}</span>
          <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%;background:${cat.color}"></div></div>
          <span class="chart-bar-value">${count}</span>
        </div>`;
      }).join('');
  }
};

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => app.init());
