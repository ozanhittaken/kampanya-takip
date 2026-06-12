/* ========================================
   KampanyaTakip - Application Logic
   ======================================== */

const app = {
  campaigns: [],
  currentFilter: 'all',
  currentSort: 'endDate',
  searchQuery: '',
  editingId: null,
  deleteTargetId: null,
  notificationCheckInterval: null,
  notifiedSet: new Set(),

  // --- Category Config ---
  categories: {
    indirim: { label: 'İndirim', icon: '💰', color: '#f59e0b' },
    '2al1ode': { label: '2 Al 1 Öde', icon: '🎁', color: '#10b981' },
    hediye: { label: 'Hediyeli', icon: '🎀', color: '#ec4899' },
    ozel: { label: 'Özel', icon: '⭐', color: '#8b5cf6' },
    sadakat: { label: 'Sadakat', icon: '💳', color: '#3b82f6' },
    sezon: { label: 'Sezon', icon: '🌞', color: '#f97316' },
    diger: { label: 'Diğer', icon: '📦', color: '#6b7280' }
  },

  // --- Settings ---
  settings: {
    notifications: true,
    notifyStart: true,
    notifyEnd: true,
    notifyDayBefore: true
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
  },

  // =====================
  //   DATA PERSISTENCE
  // =====================
  loadData() {
    try {
      const data = localStorage.getItem('kampanya_campaigns');
      this.campaigns = data ? JSON.parse(data) : [];
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
    });

    // FAB
    document.getElementById('fab-add').addEventListener('click', () => this.openModal());

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
    document.querySelectorAll('.btn-delete-cancel').forEach(btn => {
      btn.addEventListener('click', () => this.closeDeleteModal());
    });
    document.getElementById('btn-delete-confirm').addEventListener('click', () => this.confirmDelete());

    // Search
    document.getElementById('search-input').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this.renderCampaigns();
    });

    // Filter
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.renderCampaigns();
      });
    });

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

    // Data management
    document.getElementById('btn-export').addEventListener('click', () => this.exportData());
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
    document.getElementById('btn-clear-all').addEventListener('click', () => this.clearAllData());

    // Test notification
    document.getElementById('btn-test-notification').addEventListener('click', () => this.sendTestNotification());
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
      this.renderDashboard();
    } else if (viewName === 'campaigns') {
      this.renderCampaigns();
    }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // =====================
  //   CAMPAIGN STATUS
  // =====================
  getCampaignStatus(campaign) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(campaign.startDate);
    const end = new Date(campaign.endDate);
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    if (today > endDay) return 'expired';
    if (today < startDay) return 'upcoming';
    
    // Calculate days remaining
    const daysLeft = Math.ceil((endDay - today) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 2) return 'ending';
    return 'active';
  },

  getCountdownText(campaign) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const start = new Date(campaign.startDate);
    const end = new Date(campaign.endDate);
    const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    const status = this.getCampaignStatus(campaign);

    if (status === 'expired') {
      const daysAgo = Math.floor((today - endDay) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) return 'Bugün bitti';
      return `${daysAgo} gün önce bitti`;
    }

    if (status === 'upcoming') {
      const daysUntil = Math.ceil((startDay - today) / (1000 * 60 * 60 * 24));
      if (daysUntil === 0) return 'Bugün başlıyor';
      if (daysUntil === 1) return 'Yarın başlıyor';
      return `${daysUntil} gün sonra başlıyor`;
    }

    // Active or ending
    const daysLeft = Math.ceil((endDay - today) / (1000 * 60 * 60 * 24));
    if (daysLeft === 0) return 'Bugün bitiyor!';
    if (daysLeft === 1) return 'Yarın bitiyor!';
    return `${daysLeft} gün kaldı`;
  },

  getCountdownClass(campaign) {
    const status = this.getCampaignStatus(campaign);
    return `countdown-${status}`;
  },

  // =====================
  //   DATE FORMATTING
  // =====================
  formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short'
    });
  },

  formatDateLong(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  },

  getTodayStr() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  },

  // =====================
  //   DASHBOARD
  // =====================
  renderDashboard() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    let activeCount = 0;
    let startingTodayCount = 0;
    let endingTodayCount = 0;
    let endingWeekCount = 0;
    const todayCampaigns = [];
    const endingSoon = [];

    this.campaigns.forEach(c => {
      const status = this.getCampaignStatus(c);
      const startDay = new Date(new Date(c.startDate).getFullYear(), new Date(c.startDate).getMonth(), new Date(c.startDate).getDate());
      const endDay = new Date(new Date(c.endDate).getFullYear(), new Date(c.endDate).getMonth(), new Date(c.endDate).getDate());

      if (status === 'active' || status === 'ending') {
        activeCount++;
      }

      if (startDay.getTime() === today.getTime()) {
        startingTodayCount++;
        todayCampaigns.push(c);
      }

      if (endDay.getTime() === today.getTime()) {
        endingTodayCount++;
        if (!todayCampaigns.includes(c)) todayCampaigns.push(c);
      }

      if (endDay >= today && endDay <= weekEnd && status !== 'expired') {
        endingWeekCount++;
        if (endDay.getTime() !== today.getTime()) {
          endingSoon.push(c);
        }
      }
    });

    // Update stat counters with animation
    this.animateCounter('stat-active', activeCount);
    this.animateCounter('stat-starting-today', startingTodayCount);
    this.animateCounter('stat-ending-today', endingTodayCount);
    this.animateCounter('stat-ending-week', endingWeekCount);

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
          <p>Yakında biten kampanya yok</p>
        </div>`;
    } else {
      endingContainer.innerHTML = endingSoon.slice(0, 5).map((c, i) => this.renderCampaignCard(c, i)).join('');
    }
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
    let filtered = [...this.campaigns];

    // Filter
    if (this.currentFilter !== 'all') {
      filtered = filtered.filter(c => {
        const status = this.getCampaignStatus(c);
        if (this.currentFilter === 'active') return status === 'active' || status === 'ending';
        if (this.currentFilter === 'upcoming') return status === 'upcoming';
        if (this.currentFilter === 'expired') return status === 'expired';
        return true;
      });
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

    const container = document.getElementById('campaigns-list');

    if (filtered.length === 0) {
      const message = this.campaigns.length === 0
        ? `<span class="empty-icon">🏷️</span><p>Henüz kampanya eklenmemiş</p>
           <button class="btn btn-primary btn-sm" onclick="app.openModal()">İlk Kampanyayı Ekle</button>`
        : `<span class="empty-icon">🔍</span><p>Aramanızla eşleşen kampanya bulunamadı</p>`;
      container.innerHTML = `<div class="empty-state">${message}</div>`;
      return;
    }

    container.innerHTML = filtered.map((c, i) => this.renderCampaignCard(c, i, true)).join('');
  },

  renderCampaignCard(campaign, index, showActions = true) {
    const status = this.getCampaignStatus(campaign);
    const countdown = this.getCountdownText(campaign);
    const countdownClass = this.getCountdownClass(campaign);
    const cat = this.categories[campaign.category] || this.categories.diger;
    const delay = Math.min(index * 0.05, 0.3);

    return `
      <div class="campaign-card status-${status}" style="animation-delay: ${delay}s" data-id="${campaign.id}">
        <div class="campaign-card-header">
          <span class="campaign-name">${this.escapeHtml(campaign.name)}</span>
          <span class="campaign-category">${cat.icon} ${cat.label}</span>
        </div>
        ${campaign.description ? `<p class="campaign-description">${this.escapeHtml(campaign.description)}</p>` : ''}
        <div class="campaign-meta">
          <div class="campaign-dates">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            ${this.formatDate(campaign.startDate)} — ${this.formatDate(campaign.endDate)}
          </div>
          <span class="campaign-countdown ${countdownClass}">${countdown}</span>
        </div>
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
      document.getElementById('input-id').value = campaign.id;
      document.getElementById('input-name').value = campaign.name;
      document.getElementById('input-description').value = campaign.description || '';
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
          name, description, category, posterStatus, demandStatus, startDate, endDate,
          updatedAt: new Date().toISOString()
        };
        this.showToast('Kampanya güncellendi', 'success');
      }
    } else {
      // Create new
      const campaign = {
        id: this.generateId(),
        name, description, category, posterStatus, demandStatus, startDate, endDate,
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
        msg = 'Bildirim izni engellenmiş. Telefonunuzun Ayarlar -> Bildirimler -> KampanyaTakip bölümünden bildirimlere izin verin.';
      } else if (/Android/i.test(navigator.userAgent)) {
        msg = 'Bildirim izni engellenmiş. Telefonunuzun Ayarlar -> Uygulamalar -> KampanyaTakip -> Bildirimler bölümünden izin verin.';
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
          'KampanyaTakip hatırlatıcı bildirimleri başarıyla etkinleştirildi.',
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
      '🏷️ KampanyaTakip Test',
      'Bildirimler çalışıyor! Kampanyalarınız için hatırlatıcılar alacaksınız.',
      'test-notification'
    );
    this.showToast('Test bildirimi gönderildi', 'success');
  },

  startNotificationChecker() {
    // Check every 60 seconds
    this.checkNotifications();
    this.notificationCheckInterval = setInterval(() => this.checkNotifications(), 60000);
  },

  checkNotifications() {
    if (!this.settings.notifications) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const todayStr = this.getTodayStr();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

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
        const registration = await navigator.serviceWorker.register('sw.js');
        console.log('Service Worker registered successfully:', registration);
        this.updateNotificationUI();
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
    this.updateNotificationUI();
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
  exportData() {
    const data = {
      version: 1,
      exportDate: new Date().toISOString(),
      campaigns: this.campaigns
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

    this.showToast('Veriler dışa aktarıldı', 'success');
  },

  importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.campaigns && Array.isArray(data.campaigns)) {
          // Merge: add new campaigns, skip existing IDs
          const existingIds = new Set(this.campaigns.map(c => c.id));
          let imported = 0;
          data.campaigns.forEach(c => {
            if (!existingIds.has(c.id)) {
              this.campaigns.push(c);
              imported++;
            }
          });
          this.saveData();
          this.renderDashboard();
          this.renderCampaigns();
          this.showToast(`${imported} kampanya içe aktarıldı`, 'success');
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

  clearAllData() {
    if (!confirm('Tüm kampanyaları silmek istediğinizden emin misiniz?\nBu işlem geri alınamaz!')) return;

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
  //   UTILITIES
  // =====================
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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
    this.renderDashboard();
    this.renderCampaigns();
    
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

    // Format start and end dates in simple DD.MM.YYYY format
    const startObj = new Date(campaign.startDate);
    const endObj = new Date(campaign.endDate);
    
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

    // Automatically mark as created when request is initiated
    campaign.demandStatus = 'created';
    campaign.updatedAt = new Date().toISOString();
    this.saveData();
    this.renderDashboard();
    this.renderCampaigns();

    // Try to copy to clipboard
    navigator.clipboard.writeText(textTemplate)
      .then(() => {
        this.showToast('Kampanya içeriği panoya kopyalandı! Talep formundaki "Afiş İçeriği" alanına yapıştırabilirsiniz.', 'success');
      })
      .catch((err) => {
        console.error('Kopyalama hatası:', err);
        this.showToast('Talep oluşturuldu! Form açılıyor...', 'info');
      })
      .finally(() => {
        // Open the company request page in a new window/tab
        window.open('https://corewishasset.com.tr/digital-form/demand-form/create/75', '_blank');
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
    this.renderDashboard();
    this.renderCampaigns();
    
    const labels = {
      pending: 'Tasarım talebi bekleniyor olarak işaretlendi',
      created: 'Tasarım talebi oluşturuldu olarak işaretlendi'
    };
    this.showToast(labels[next], 'info');
  }
};

// --- Initialize ---
document.addEventListener('DOMContentLoaded', () => app.init());
