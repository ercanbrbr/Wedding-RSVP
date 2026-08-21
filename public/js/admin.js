// Global Admin Script
let currentEvent = null;
let allResponses = [];
let seatingTables = [];
let seatAssignments = [];
let seatingDecorations = [];
let selectedSeatingGuest = null;
let csrfToken = sessionStorage.getItem('adminCsrfToken') || '';
const originalFetch = window.fetch.bind(window);
window.fetch = (input, options = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = (options.method || 'GET').toUpperCase();
  if (url.startsWith('/api/admin/session') && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    options.headers = { ...(options.headers || {}), 'X-CSRF-Token': csrfToken };
  }
  return originalFetch(input, options);
};

let isSalonViewMode = false;
let currentZoom = 1.0;
let panX = 0;
let panY = 0;
let isPanningCanvas = false;
let panStartX = 0;
let panStartY = 0;
let initialPanX = 0;
let initialPanY = 0;

let activeDraggingId = null;
let activeDraggingType = null; // 'TABLE' or 'DECOR'
let dragStartX = 0;
let dragStartY = 0;
let initialElemX = 0;
let initialElemY = 0;

function applyFontSelectPreview(selectElement) {
  if (!selectElement) return;
  selectElement.style.fontFamily = `'${selectElement.value}', cursive`;
}

// Global Escape Key listener to close active modals
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeEditModal();
    closeCustomizeModal();
    closeSeatingModal();
    closeQrModal();
  }
});

function copyInput(inputId) {
  const inputEl = document.getElementById(inputId);
  if (!inputEl || !inputEl.value) return;

  inputEl.select();
  inputEl.setSelectionRange(0, 99999);

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(inputEl.value).then(() => {
      showToast('Link panoya kopyalandı.');
    }).catch(() => {
      document.execCommand('copy');
      showToast('Link kopyalandı.');
    });
  } else {
    document.execCommand('copy');
    showToast('Link kopyalandı.');
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.toggle('error', type === 'error');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

function showQrModal() {
  const modal = document.getElementById('qrModal');
  const container = document.getElementById('qrcodeContainer');
  const publicUrlInput = document.getElementById('publicUrlInput');

  if (modal && container && publicUrlInput && publicUrlInput.value) {
    container.innerHTML = '';
    new QRCode(container, {
      text: publicUrlInput.value,
      width: 220,
      height: 220
    });
    modal.classList.add('active');
  }
}

function closeQrModal() {
  const modal = document.getElementById('qrModal');
  if (modal) modal.classList.remove('active');
}

async function logoutAdmin() {
  try {
    await originalFetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': csrfToken }
    });
  } finally {
    sessionStorage.removeItem('adminCsrfToken');
    window.location.href = '/login';
  }
}

// ================= INDEX PAGE LOGIC =================
const createEventForm = document.getElementById('createEventForm');
if (createEventForm) {
  createEventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSubmit = document.getElementById('btnSubmit');
    const errorBox = document.getElementById('createEventError');
    errorBox.textContent = '';
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = 'Oluşturuluyor...';

    const payload = {
      title: document.getElementById('title').value,
      couple_names: document.getElementById('title').value,
      event_date: document.getElementById('event_date').value,
      location: document.getElementById('location').value,
      description: document.getElementById('description').value,
      admin_password: document.getElementById('admin_password').value
    };

    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Setup-Key': document.getElementById('setup_key').value
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Etkinlik oluşturulurken bir hata oluştu.');
      }

      document.getElementById('publicUrlInput').value = data.event.public_url;
      csrfToken = data.csrf_token;
      sessionStorage.setItem('adminCsrfToken', csrfToken);
      document.getElementById('goToAdminBtn').href = data.event.admin_url;

      document.getElementById('resultCard').style.display = 'block';
      document.getElementById('resultCard').scrollIntoView({ behavior: 'smooth' });
      showToast('Etkinlik ve bağlantılar başarıyla üretildi.');
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.focus();
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.textContent = 'Etkinliği oluştur';
    }
  });
}

// ================= ADMIN DASHBOARD LOGIC =================
if (window.location.pathname === '/admin' || window.location.pathname === '/admin/') {
  loadAdminDashboard('session');
}

async function loadAdminDashboard(adminToken) {
  try {
    const res = await fetch(`/api/admin/${adminToken}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (res.status === 401) window.location.href = '/login';
      else alert(data.error || 'Yönetim paneli yüklenemedi.');
      return;
    }

    csrfToken = data.csrf_token;
    sessionStorage.setItem('adminCsrfToken', csrfToken);

    currentEvent = data.event;
    allResponses = data.responses;

    document.getElementById('eventTitle').textContent = currentEvent.couple_names || currentEvent.title;
    document.title = `${currentEvent.couple_names || currentEvent.title} | LCV Yönetim Paneli`;

    const themeClass = `theme-${currentEvent.theme_style || 'warm_ivory'}`;
    document.body.className = themeClass;

    if (currentEvent.custom_font) {
      document.documentElement.style.setProperty('--font-couple-names', `'${currentEvent.custom_font}', Georgia, serif`);
    }

    const formattedDate = new Date(currentEvent.event_date).toLocaleString('tr-TR', {
      dateStyle: 'full',
      timeStyle: 'short'
    });
    document.getElementById('eventDate').textContent = formattedDate;
    document.getElementById('eventLocation').textContent = currentEvent.location;
    document.getElementById('publicUrlInput').value = currentEvent.public_url;
    
    const previewBtn = document.getElementById('previewPublicBtn');
    if (previewBtn) previewBtn.href = currentEvent.public_url;

    document.getElementById('statTotalPeople').textContent = data.stats.total_attending_people;
    document.getElementById('statAttendingMain').textContent = data.stats.attending_main_count;
    document.getElementById('statDeclinedMain').textContent = data.stats.declined_main_count;
    document.getElementById('statPlusOnes').textContent = data.stats.total_plus_ones_count;

    renderTable(allResponses);
  } catch (err) {
    console.error('Failed loading admin dashboard:', err);
  }
}

function renderTable(responses) {
  const tbody = document.getElementById('responsesTableBody');
  const countText = document.getElementById('responseCountText');

  if (countText) countText.textContent = responses.length;

  if (!responses || responses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--theme-muted); padding: 30px;">
          Gösterilecek yanıt bulunamadı.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = responses.map(r => {
    const isAttending = r.status === 'ATTENDING';
    const statusBadge = isAttending 
      ? `<span class="badge attending">Katılıyor</span>`
      : `<span class="badge declined">Katılmıyor</span>`;
    
    let plusText = '-';
    if (isAttending && r.plus_ones_count > 0) {
      plusText = `+${r.plus_ones_count} Kişi`;
      if (r.plus_ones_names) {
        plusText += `<br><small style="color: var(--theme-muted);">(${escapeHtml(r.plus_ones_names)})</small>`;
      }
    }

    const mealText = isAttending && r.meal_choice ? escapeHtml(r.meal_choice) : '-';
    
    let songNoteText = [];
    if (r.song_request) songNoteText.push(`Şarkı: ${escapeHtml(r.song_request)}`);
    if (r.note) songNoteText.push(`Not: ${escapeHtml(r.note)}`);
    const extraDetails = songNoteText.length > 0 ? songNoteText.join('<br>') : '-';

    const formattedTime = new Date(r.updated_at).toLocaleString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    return `
      <tr>
        <td><strong>${escapeHtml(r.guest_name)}</strong></td>
        <td>${statusBadge}</td>
        <td>${plusText}</td>
        <td><span style="font-weight:600;">${mealText}</span></td>
        <td><small style="color: var(--theme-muted);">${extraDetails}</small></td>
        <td><small style="color: var(--theme-muted);">${formattedTime}</small></td>
        <td style="text-align: right;">
          <button class="btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; color: #ef4444; border-color: rgba(239,68,68,0.3);" onclick="deleteResponse('${r.id}')">
            Sil
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function filterResponses() {
  const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const filterStatus = document.getElementById('filterStatus')?.value || 'ALL';

  const filtered = allResponses.filter(r => {
    const matchesSearch = r.guest_name.toLowerCase().includes(searchTerm) || 
                          (r.note && r.note.toLowerCase().includes(searchTerm)) ||
                          (r.meal_choice && r.meal_choice.toLowerCase().includes(searchTerm)) ||
                          (r.song_request && r.song_request.toLowerCase().includes(searchTerm)) ||
                          (r.plus_ones_names && r.plus_ones_names.toLowerCase().includes(searchTerm));
    
    const matchesStatus = filterStatus === 'ALL' || r.status === filterStatus;

    return matchesSearch && matchesStatus;
  });

  renderTable(filtered);
}

function shareWhatsApp() {
  if (!currentEvent) return;
  const titleStr = currentEvent.couple_names || currentEvent.title;
  const message = `Merhaba,\n\n"${titleStr}" düğünümüzün davetlisiniz. Katılım durumunuzu aşağıdaki bağlantıdan bildirebilirsiniz:\n\n${currentEvent.public_url}`;
  const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
}

function exportCSV() {
  if (!currentEvent) return;
  window.location.href = `/api/admin/${currentEvent.admin_token}/export`;
}

async function deleteResponse(responseId) {
  if (!confirm('Bu katılımcı kaydını silmek istediğinize emin misiniz? (Katılımcı silindiğinde masa ataması da kaldırılır)')) return;

  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/responses/${responseId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Kayıt ve masa ataması silindi.');
    loadAdminDashboard(currentEvent.admin_token);
  } catch (err) {
    showToast(err.message || 'Kayıt silinemedi.', 'error');
  }
}

// Edit Basic Event Info Modal
function openEditModal() {
  if (!currentEvent) return;
  document.getElementById('editTitle').value = currentEvent.title;
  document.getElementById('editCoupleNames').value = currentEvent.couple_names || currentEvent.title;
  document.getElementById('editDate').value = currentEvent.event_date;
  document.getElementById('editLocation').value = currentEvent.location;
  document.getElementById('editMapUrl').value = currentEvent.map_url || '';
  document.getElementById('editBaseUrl').value = currentEvent.custom_base_url || '';
  document.getElementById('editDescription').value = currentEvent.description || '';
  document.getElementById('editModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editModal').classList.remove('active');
}

const editEventForm = document.getElementById('editEventForm');
if (editEventForm) {
  editEventForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      ...currentEvent,
      title: document.getElementById('editTitle').value,
      couple_names: document.getElementById('editCoupleNames').value,
      event_date: document.getElementById('editDate').value,
      location: document.getElementById('editLocation').value,
      map_url: document.getElementById('editMapUrl').value,
      custom_base_url: document.getElementById('editBaseUrl').value,
      description: document.getElementById('editDescription').value
    };

    try {
      const res = await fetch(`/api/admin/${currentEvent.admin_token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      closeEditModal();
      showToast('Etkinlik güncellendi.');
      loadAdminDashboard(currentEvent.admin_token);
    } catch (err) {
      showToast(err.message || 'Etkinlik bilgileri kaydedilemedi.', 'error');
    }
  });
}

// Schedule Timeline Editor Helper
function addScheduleRow(time = '', icon = '', title = '') {
  const container = document.getElementById('scheduleListContainer');
  if (!container) return;

  const rowId = `sched_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
  const row = document.createElement('div');
  row.id = rowId;
  row.style.cssText = 'display: flex; gap: 6px; align-items: center;';

  row.innerHTML = `
    <input type="text" placeholder="19:00" value="${escapeHtml(time)}" class="form-input sched-time" style="width: 85px; padding: 8px;">
    <input type="text" placeholder="Program Adı" value="${escapeHtml(title)}" class="form-input sched-title" style="flex: 1; padding: 8px;">
    <button type="button" class="btn-secondary" style="padding: 8px; color: #ef4444;" onclick="document.getElementById('${rowId}').remove()">✕</button>
  `;

  container.appendChild(row);
}

function getScheduleData() {
  const rows = document.querySelectorAll('#scheduleListContainer > div');
  const items = [];
  rows.forEach(r => {
    const time = r.querySelector('.sched-time')?.value.trim();
    const title = r.querySelector('.sched-title')?.value.trim();
    if (time || title) {
      items.push({ time, icon: '', title });
    }
  });
  return items;
}

function onThemePresetChange(preset) {
  const accentInput = document.getElementById('editAccentColor');
  const bgInput = document.getElementById('editBgColor');
  const textInput = document.getElementById('editTextColor');

  if (preset === 'warm_ivory') {
    accentInput.value = '#b78c4a';
    bgInput.value = '#faf8f4';
    textInput.value = '#2b2925';
  } else if (preset === 'botanical_sage') {
    accentInput.value = '#355c49';
    bgInput.value = '#f7f8f3';
    textInput.value = '#202a24';
  } else if (preset === 'blush_rose') {
    accentInput.value = '#9d6268';
    bgInput.value = '#fbf7f6';
    textInput.value = '#362829';
  } else if (preset === 'noir_gold') {
    accentInput.value = '#d0ae6a';
    bgInput.value = '#171715';
    textInput.value = '#f6f2e9';
  } else if (preset === 'sage_linen') {
    accentInput.value = '#75806b';
    bgInput.value = '#f7f6f0';
    textInput.value = '#30342d';
  } else if (preset === 'burgundy_cream') {
    accentInput.value = '#713d43';
    bgInput.value = '#faf7f2';
    textInput.value = '#302629';
  }
}

// Image Upload & Preview Helper
function clearInvitationImage() {
  const urlInput = document.getElementById('editInvitationUrl');
  if (urlInput) urlInput.value = '';
  const fileInput = document.getElementById('invitationFileInput');
  if (fileInput) fileInput.value = '';
  const previewContainer = document.getElementById('imagePreviewContainer');
  if (previewContainer) previewContainer.style.display = 'none';
}

// Customize Modal
function openCustomizeModal() {
  if (!currentEvent) return;
  document.getElementById('editTheme').value = currentEvent.theme_style || 'warm_ivory';
  const fontSelect = document.getElementById('editFontFamily');
  const crestFontSelect = document.getElementById('editCrestFont');
  const selectedFont = currentEvent.custom_font || 'Alex Brush';
  const selectedCrestFont = currentEvent.crest_font || 'Alex Brush';
  fontSelect.value = [...fontSelect.options].some(option => option.value === selectedFont) ? selectedFont : 'Alex Brush';
  crestFontSelect.value = [...crestFontSelect.options].some(option => option.value === selectedCrestFont) ? selectedCrestFont : 'Alex Brush';
  applyFontSelectPreview(fontSelect);
  applyFontSelectPreview(crestFontSelect);
  document.getElementById('editAccentColor').value = currentEvent.custom_accent_color || '#b78c4a';
  document.getElementById('editBgColor').value = currentEvent.custom_bg_color || '#faf8f4';
  document.getElementById('editTextColor').value = currentEvent.custom_text_color || '#2b2925';
  document.getElementById('editMealOptions').value = currentEvent.custom_meal_options || 'Etli Menü, Vejetaryen / Vegan, Çocuk Menüsü';
  document.getElementById('editCrestStyle').value = currentEvent.crest_style || 'circle';
  document.getElementById('editCrestText').value = currentEvent.crest_text || '';
  
  document.getElementById('editWelcomeMessage').value = currentEvent.welcome_message || '';
  document.getElementById('editDressCode').value = currentEvent.dress_code || '';
  document.getElementById('editInvitationUrl').value = currentEvent.invitation_image_url || '';
  document.getElementById('editEnableMeal').checked = currentEvent.enable_meal_choice !== 0;
  document.getElementById('editEnableSong').checked = currentEvent.enable_song_request !== 0;

  const fileInput = document.getElementById('invitationFileInput');
  if (fileInput) fileInput.value = '';

  const previewContainer = document.getElementById('imagePreviewContainer');
  const previewImg = document.getElementById('imagePreview');
  if (currentEvent.invitation_image_url) {
    previewImg.src = currentEvent.invitation_image_url;
    previewContainer.style.display = 'block';
  } else {
    previewContainer.style.display = 'none';
  }

  const scheduleContainer = document.getElementById('scheduleListContainer');
  scheduleContainer.innerHTML = '';
  let scheduleItems = [];
  try {
    scheduleItems = typeof currentEvent.event_schedule === 'string'
      ? JSON.parse(currentEvent.event_schedule)
      : (currentEvent.event_schedule || []);
  } catch (e) {
    scheduleItems = [];
  }

  if (scheduleItems.length === 0) {
    addScheduleRow('19:00', '', 'Karşılama & Kokteyl');
    addScheduleRow('20:00', '', 'Nikah Töreni');
    addScheduleRow('21:00', '', 'Düğün Yemeği & Eğlence');
  } else {
    scheduleItems.forEach(item => addScheduleRow(item.time, item.icon, item.title));
  }

  document.getElementById('customizeModal').classList.add('active');
}

function closeCustomizeModal() {
  document.getElementById('customizeModal').classList.remove('active');
}

const customizeForm = document.getElementById('customizeForm');
if (customizeForm) {
  customizeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSave = document.getElementById('btnSaveCustomization');
    btnSave.disabled = true;
    btnSave.textContent = 'Kaydediliyor...';

    try {
      let finalImageUrl = document.getElementById('editInvitationUrl').value.trim();
      const fileInput = document.getElementById('invitationFileInput');

      if (fileInput && fileInput.files && fileInput.files[0]) {
        const formData = new FormData();
        formData.append('image', fileInput.files[0]);

        const uploadRes = await fetch(`/api/admin/${currentEvent.admin_token}/upload`, {
          method: 'POST',
          body: formData
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok || !uploadData.success) {
          throw new Error(uploadData.error || 'Görsel yüklenirken bir hata oluştu.');
        }

        finalImageUrl = uploadData.image_url;
      }

      const scheduleData = getScheduleData();

      const payload = {
        title: currentEvent.title,
        couple_names: currentEvent.couple_names || currentEvent.title,
        event_date: currentEvent.event_date,
        location: currentEvent.location,
        map_url: currentEvent.map_url || '',
        custom_base_url: currentEvent.custom_base_url || '',
        description: currentEvent.description,
        invitation_image_url: finalImageUrl,
        theme_style: document.getElementById('editTheme').value,
        custom_font: document.getElementById('editFontFamily').value,
        crest_font: document.getElementById('editCrestFont').value,
        custom_accent_color: document.getElementById('editAccentColor').value,
        custom_bg_color: document.getElementById('editBgColor').value,
        custom_text_color: document.getElementById('editTextColor').value,
        custom_meal_options: document.getElementById('editMealOptions').value,
        crest_style: document.getElementById('editCrestStyle').value,
        crest_text: document.getElementById('editCrestText').value,
        welcome_message: document.getElementById('editWelcomeMessage').value,
        dress_code: document.getElementById('editDressCode').value,
        event_schedule: JSON.stringify(scheduleData),
        enable_meal_choice: document.getElementById('editEnableMeal').checked ? 1 : 0,
        enable_song_request: document.getElementById('editEnableSong').checked ? 1 : 0
      };

      const res = await fetch(`/api/admin/${currentEvent.admin_token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      closeCustomizeModal();
      showToast('Tasarım ve tercihler kaydedildi.');
      loadAdminDashboard(currentEvent.admin_token);
    } catch (err) {
      showToast(err.message || 'Tasarım kaydedilemedi.', 'error');
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Tasarımı Kaydet';
    }
  });
}

// ================= DRAG & DROP, VISUAL FLOOR PLAN, HALL DIMENSIONS & MOUSE PAN LOGIC =================
async function openSeatingModal() {
  if (!currentEvent) return;
  selectedSeatingGuest = null;
  document.getElementById('seatingModal').classList.add('active');
  await loadSeatingData();
  applyHallDimensions(currentEvent.hall_width || 10, currentEvent.hall_height || 10);
  setupCanvasPanListeners();
}

function closeSeatingModal() {
  selectedSeatingGuest = null;
  const modal = document.getElementById('seatingModal');
  modal.classList.remove('active', 'is-focus-mode');
  const focusButton = document.getElementById('btnSeatingFocusMode');
  if (focusButton) {
    focusButton.textContent = '⛶ Genişlet';
    focusButton.setAttribute('aria-pressed', 'false');
  }
}

function toggleSeatingViewMode() {
  isSalonViewMode = !isSalonViewMode;
  const gridView = document.getElementById('seatingTablesGrid');
  const canvasContainer = document.getElementById('salonFloorCanvasContainer');
  const toggleBtn = document.getElementById('btnToggleSeatingView');
  const archToolbar = document.getElementById('architecturalToolbar');
  const hallControls = document.getElementById('hallSizeControls');
  const modal = document.getElementById('seatingModal');

  if (isSalonViewMode) {
    modal?.classList.add('is-salon-view');
    gridView.style.display = 'none';
    canvasContainer.style.display = 'block';
    if (archToolbar) archToolbar.style.display = 'flex';
    if (hallControls) hallControls.style.display = 'flex';
    toggleBtn.textContent = 'Masa listesine geç';
    applyHallDimensions(currentEvent.hall_width || 10, currentEvent.hall_height || 10);
    setupCanvasPanListeners();
  } else {
    modal?.classList.remove('is-salon-view', 'is-focus-mode');
    const focusButton = document.getElementById('btnSeatingFocusMode');
    if (focusButton) {
      focusButton.textContent = '⛶ Genişlet';
      focusButton.setAttribute('aria-pressed', 'false');
    }
    canvasContainer.style.display = 'none';
    gridView.style.display = 'grid';
    if (archToolbar) archToolbar.style.display = 'none';
    if (hallControls) hallControls.style.display = 'none';
    toggleBtn.textContent = 'Salon planına geç';
  }
  renderSeatingTables();
}

function toggleSeatingFocusMode() {
  const modal = document.getElementById('seatingModal');
  const button = document.getElementById('btnSeatingFocusMode');
  if (!modal || !isSalonViewMode) return;

  const isActive = modal.classList.toggle('is-focus-mode');
  if (button) {
    button.textContent = isActive ? '⊙ Normal görünüm' : '⛶ Genişlet';
    button.setAttribute('aria-pressed', String(isActive));
  }
  requestAnimationFrame(() => resetCanvasTransform());
}

// Apply Defined Hall Dimensions (In Meters -> Canvas Pixels)
function applyHallDimensions(wMeters, hMeters) {
  const widthM = Math.max(5, parseInt(wMeters) || 10);
  const heightM = Math.max(5, parseInt(hMeters) || 10);

  const canvas = document.getElementById('salonFloorCanvas');
  const wInput = document.getElementById('hallWidthMeters');
  const hInput = document.getElementById('hallHeightMeters');
  const bannerTag = document.getElementById('hallDimensionsTag');
  const bannerTitle = document.getElementById('hallTitleBannerText');

  if (wInput) wInput.value = widthM;
  if (hInput) hInput.value = heightM;

  // Scale ratio: 1 meter = 80px
  const widthPx = widthM * 80;
  const heightPx = heightM * 80;

  if (canvas) {
    canvas.style.width = `${widthPx}px`;
    canvas.style.height = `${heightPx}px`;
  }

  if (bannerTag) {
    const isSquare = widthM === heightM;
    bannerTag.textContent = `${widthM}m x ${heightM}m (${isSquare ? 'Kare Salon' : 'Dikdörtgen Salon'})`;
  }

  if (bannerTitle) {
    bannerTitle.textContent = `${(currentEvent?.couple_names || 'DÜĞÜN SALONU').toUpperCase()} KAT PLANU`;
  }

  resetCanvasTransform();
}

async function setHallPreset(wMeters, hMeters) {
  applyHallDimensions(wMeters, hMeters);
  await saveHallDimensionsToServer(wMeters, hMeters);
}

async function applyCustomHallSize() {
  const wM = parseInt(document.getElementById('hallWidthMeters')?.value) || 10;
  const hM = parseInt(document.getElementById('hallHeightMeters')?.value) || 10;

  applyHallDimensions(wM, hM);
  await saveHallDimensionsToServer(wM, hM);
}

async function saveHallDimensionsToServer(wM, hM) {
  if (!currentEvent) return;
  currentEvent.hall_width = wM;
  currentEvent.hall_height = hM;

  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...currentEvent,
        hall_width: wM,
        hall_height: hM
      })
    });
    const data = await res.json();
    if (res.ok) showToast(`Salon ölçüleri ${wM}m x ${hM}m olarak kaydedildi.`);
  } catch (err) {
    console.error('Error saving hall size:', err);
  }
}

// Canvas Mouse Pan
function setupCanvasPanListeners() {
  const viewport = document.getElementById('salonFloorCanvasViewport');
  if (!viewport || viewport.dataset.panSetup === 'true') return;

  viewport.dataset.panSetup = 'true';

  viewport.addEventListener('mousedown', (e) => {
    if (e.target.closest('.salon-table-card') || 
        e.target.closest('.salon-decor-card') || 
        e.target.closest('.decor-resize-handle') || 
        e.target.tagName === 'BUTTON' || 
        e.target.tagName === 'INPUT') {
      return;
    }

    isPanningCanvas = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    initialPanX = panX;
    initialPanY = panY;
    viewport.classList.add('panning');
  });

  document.addEventListener('mousemove', (e) => {
    if (!isPanningCanvas) return;

    panX = Math.round(initialPanX + (e.clientX - panStartX));
    panY = Math.round(initialPanY + (e.clientY - panStartY));

    applyCanvasTransform();
  });

  document.addEventListener('mouseup', () => {
    if (isPanningCanvas) {
      isPanningCanvas = false;
      const viewport = document.getElementById('salonFloorCanvasViewport');
      if (viewport) viewport.classList.remove('panning');
    }
  });
}

function zoomCanvas(delta) {
  currentZoom = Math.min(2.5, Math.max(0.3, currentZoom + delta));
  applyCanvasTransform();
}

function resetCanvasTransform() {
  const container = document.getElementById('salonFloorCanvasContainer');
  const canvas = document.getElementById('salonFloorCanvas');

  if (container && canvas) {
    const cW = container.clientWidth || 900;
    const cH = container.clientHeight || 520;
    const wPx = parseInt(canvas.style.width) || 800;
    const hPx = parseInt(canvas.style.height) || 800;

    const horizontalFit = Math.max(0.3, (cW - 64) / wPx);
    const verticalFit = Math.max(0.3, (cH - 96) / hPx);
    currentZoom = Math.min(1.25, horizontalFit, verticalFit);
    panX = Math.round((cW - (wPx * currentZoom)) / 2);
    panY = Math.max(42, Math.round((cH - (hPx * currentZoom)) / 2) + 10);
  } else {
    currentZoom = 1.0;
    panX = 30;
    panY = 40;
  }
  applyCanvasTransform();
}

function applyCanvasTransform() {
  const canvas = document.getElementById('salonFloorCanvas');
  const display = document.getElementById('zoomLevelDisplay');

  if (canvas) {
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${currentZoom})`;
  }
  if (display) {
    display.textContent = `${Math.round(currentZoom * 100)}%`;
  }
}

function createPdfCanvas(cssWidth, cssHeight, scale = 2) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(cssWidth * scale);
  canvas.height = Math.ceil(cssHeight * scale);
  canvas.dataset.cssWidth = String(cssWidth);
  canvas.dataset.cssHeight = String(cssHeight);
  const context = canvas.getContext('2d');
  context.scale(scale, scale);
  return { canvas, context };
}

function drawRoundedRect(context, x, y, width, height, radius, fill, stroke, lineWidth = 1) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
  if (fill) {
    context.fillStyle = fill;
    context.fill();
  }
  if (stroke) {
    context.lineWidth = lineWidth;
    context.strokeStyle = stroke;
    context.stroke();
  }
}

function getWrappedCanvasLines(context, text, maxWidth, maxLines = Infinity) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach(word => {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  });
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

async function downloadCanvasAsPdf(sourceCanvas, filename, orientation = 'portrait', margin = 8) {
  if (!window.html2pdf) throw new Error('PDF bileşeni yüklenemedi.');
  const cssWidth = Number(sourceCanvas.dataset.cssWidth) || sourceCanvas.width;
  const cssHeight = Number(sourceCanvas.dataset.cssHeight) || sourceCanvas.height;
  const image = document.createElement('img');
  image.src = sourceCanvas.toDataURL('image/jpeg', 0.96);
  image.alt = '';
  image.style.display = 'block';
  image.style.width = `${cssWidth}px`;
  image.style.height = `${cssHeight}px`;
  image.style.background = '#ffffff';

  const stage = document.createElement('div');
  stage.className = 'pdf-canvas-stage';
  stage.style.width = `${cssWidth}px`;
  stage.appendChild(image);
  document.body.appendChild(stage);

  try {
    if (image.decode) await image.decode();
    await html2pdf().set({
      margin,
      filename,
      image: { type: 'jpeg', quality: 0.96 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: cssWidth
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation },
      pagebreak: { mode: ['css', 'legacy'] }
    }).from(image).save();
  } finally {
    stage.remove();
  }
}

function buildSalonPlanCanvas() {
  const widthM = Number(currentEvent?.hall_width) || 10;
  const heightM = Number(currentEvent?.hall_height) || 10;
  const cssWidth = Math.max(400, widthM * 80);
  const cssHeight = Math.max(400, heightM * 80);
  const { canvas, context } = createPdfCanvas(cssWidth, cssHeight, 2);

  context.fillStyle = '#faf8f5';
  context.fillRect(0, 0, cssWidth, cssHeight);
  context.fillStyle = '#d8cbb8';
  for (let x = 18; x < cssWidth; x += 24) {
    for (let y = 18; y < cssHeight; y += 24) {
      context.beginPath();
      context.arc(x, y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }

  context.strokeStyle = '#7c6848';
  context.lineWidth = 3;
  context.strokeRect(2, 2, cssWidth - 4, cssHeight - 4);
  context.fillStyle = '#8f5558';
  context.font = '700 11px Arial, sans-serif';
  context.fillText(`${(currentEvent?.couple_names || currentEvent?.title || 'SALON').toUpperCase()} KAT PLANI`, 16, 24);
  context.textAlign = 'right';
  context.fillText(`${widthM}m x ${heightM}m`, cssWidth - 16, 24);
  context.textAlign = 'left';

  const decorStyles = {
    STAGE: ['#f0e5d8', '#a67c52', '#422d17'],
    COUPLE_TABLE: ['#fff8eb', '#b78c4a', '#7b5b29'],
    ENTRANCE: ['#e6f4ea', '#34a853', '#137333'],
    KITCHEN: ['#fff4cf', '#d99b00', '#8a5600'],
    DJ_BOOTH: ['#eceef1', '#6d7278', '#303438']
  };

  seatingDecorations.forEach(decoration => {
    const x = Number(decoration.pos_x) || 40;
    const y = Number(decoration.pos_y) || 40;
    const width = Number(decoration.width) || 180;
    const height = Number(decoration.height) || 80;
    const [fill, stroke, textColor] = decorStyles[decoration.type] || ['#eee7dd', '#9a7d58', '#4a3b2b'];
    drawRoundedRect(context, x, y, width, height, 10, fill, stroke, 2);
    context.fillStyle = textColor;
    context.font = '700 13px Arial, sans-serif';
    context.textAlign = 'center';
    const lines = getWrappedCanvasLines(context, decoration.label, width - 20, 3);
    const startY = y + (height - (lines.length * 17)) / 2 + 12;
    lines.forEach((line, index) => context.fillText(line, x + width / 2, startY + index * 17));
    context.textAlign = 'left';
  });

  seatingTables.forEach((table, index) => {
    const assignments = seatAssignments.filter(item => item.table_id === table.id);
    const x = Number.isFinite(Number(table.pos_x)) ? Number(table.pos_x) : 30 + (index % 3) * 220;
    const y = Number.isFinite(Number(table.pos_y)) ? Number(table.pos_y) : 140 + Math.floor(index / 3) * 160;
    const width = 185;
    const height = 135;
    const isFull = assignments.length >= Number(table.capacity);
    drawRoundedRect(context, x, y, width, height, 10, '#ffffff', isFull ? '#a95454' : '#9a6d6f', 2);
    context.fillStyle = '#2f2923';
    context.font = '700 14px Arial, sans-serif';
    context.fillText(String(table.name), x + 12, y + 22);
    context.strokeStyle = '#ddd5cb';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x + 10, y + 32);
    context.lineTo(x + width - 10, y + 32);
    context.stroke();
    context.fillStyle = '#716a62';
    context.font = '11px Arial, sans-serif';
    context.fillText(`${assignments.length}/${table.capacity} kişi`, x + 12, y + 49);
    context.fillStyle = '#3b3530';
    context.font = '10px Arial, sans-serif';
    const names = assignments.map(item => item.guest_name).join(', ');
    getWrappedCanvasLines(context, names || 'Boş masa', width - 24, 5)
      .forEach((line, lineIndex) => context.fillText(line, x + 12, y + 68 + lineIndex * 13));
  });

  return canvas;
}

async function legacyExportSeatingPDF() {
  if (!window.html2pdf) {
    showToast('PDF bileşeni yüklenemedi.', 'error');
    return;
  }
  const widthM = Number(currentEvent?.hall_width) || 10;
  const heightM = Number(currentEvent?.hall_height) || 10;
  const eventName = (currentEvent?.couple_names || currentEvent?.title || 'dugun')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  showToast('Salon planı PDF hazırlanıyor...');
  try {
    const canvas = buildSalonPlanCanvas();
    await downloadCanvasAsPdf(
      canvas,
      `salon_kat_plani_${widthM}x${heightM}m_${eventName}.pdf`,
      (widthM / heightM) > 1.15 ? 'landscape' : 'portrait',
      8
    );
    showToast('Salon planı PDF indirildi.');
  } catch (error) {
    console.error('Salon planı PDF export error:', error);
    showToast('Salon planı PDF oluşturulamadı.', 'error');
  }
}

async function legacyExportSeatingGuestListPDF() {
  if (!window.html2pdf) {
    showToast('PDF bileşeni yüklenemedi.', 'error');
    return;
  }

  const attendingGuests = getAttendingGuestList();
  const assignedNames = new Set(seatAssignments.map(assignment => assignment.guest_name));
  const unassignedGuests = attendingGuests.filter(guest => !assignedNames.has(guest.name));
  const sections = seatingTables.map((table, index) => ({
    title: `${index + 1}. ${table.name}`,
    names: seatAssignments
      .filter(assignment => assignment.table_id === table.id)
      .map(assignment => assignment.guest_name)
      .sort((a, b) => a.localeCompare(b, 'tr'))
  }));
  if (unassignedGuests.length > 0) {
    sections.push({
      title: 'Masaya Atanmayanlar',
      names: unassignedGuests.map(guest => guest.name).sort((a, b) => a.localeCompare(b, 'tr'))
    });
  }

  const cssWidth = 700;
  const pageHeight = Math.floor(cssWidth * (281 / 194));
  const commands = [];
  let pageIndex = 0;
  let y = 52;
  const pageBottom = () => ((pageIndex + 1) * pageHeight) - 48;
  const moveToNextPage = () => {
    pageIndex += 1;
    y = (pageIndex * pageHeight) + 48;
  };

  commands.push({ type: 'title', text: 'Masa Listesi', x: 48, y });
  y += 29;
  commands.push({
    type: 'event',
    text: currentEvent?.couple_names || currentEvent?.title || '',
    x: 48,
    y
  });
  y += 39;

  sections.forEach(section => {
    if (y + 50 > pageBottom()) moveToNextPage();
    commands.push({ type: 'heading', text: section.title, x: 48, y });
    commands.push({ type: 'line', x1: 48, x2: cssWidth - 48, y: y + 8 });
    y += 29;

    section.names.forEach((name, nameIndex) => {
      if (y + 22 > pageBottom()) {
        moveToNextPage();
        commands.push({ type: 'heading', text: `${section.title} - devam`, x: 48, y });
        commands.push({ type: 'line', x1: 48, x2: cssWidth - 48, y: y + 8 });
        y += 29;
      }
      commands.push({ type: 'name', text: name, x: 56, y, order: nameIndex + 1 });
      y += 22;
    });
    y += 24;
  });

  const canvasHeight = (pageIndex + 1) * pageHeight;
  const { canvas, context } = createPdfCanvas(cssWidth, canvasHeight, 2);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, cssWidth, canvasHeight);
  commands.forEach(command => {
    if (command.type === 'title') {
      context.fillStyle = '#000000';
      context.font = '700 24px Arial, sans-serif';
      context.fillText(command.text, command.x, command.y);
    } else if (command.type === 'event') {
      context.fillStyle = '#333333';
      context.font = '14px Arial, sans-serif';
      context.fillText(command.text, command.x, command.y);
    } else if (command.type === 'heading') {
      context.fillStyle = '#000000';
      context.font = '700 17px Arial, sans-serif';
      context.fillText(command.text, command.x, command.y);
    } else if (command.type === 'line') {
      context.strokeStyle = '#000000';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(command.x1, command.y);
      context.lineTo(command.x2, command.y);
      context.stroke();
    } else if (command.type === 'name') {
      context.fillStyle = '#000000';
      context.font = '14px Arial, sans-serif';
      context.fillText(`${command.order}. ${command.text}`, command.x, command.y);
    }
  });

  const eventName = (currentEvent?.couple_names || currentEvent?.title || 'dugun')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_');
  showToast('Masa isim listesi hazırlanıyor...');
  try {
    await downloadCanvasAsPdf(canvas, `masa_isim_listesi_${eventName}.pdf`, 'portrait', 8);
    showToast('Masa isim listesi indirildi.');
  } catch (error) {
    console.error('Guest list PDF export error:', error);
    showToast('Masa isim listesi oluşturulamadı.', 'error');
  }
}

function getPdfDownloadName(response, fallbackName) {
  const disposition = response.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallbackName;
}

async function downloadAdminPdf(endpoint, fallbackName, preparingMessage, successMessage) {
  showToast(preparingMessage);
  try {
    const response = await fetch(`/api/admin/${currentEvent.admin_token}${endpoint}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'PDF oluşturulamadı.');
    }

    const blob = await response.blob();
    const signature = new TextDecoder('ascii').decode((await blob.slice(0, 5).arrayBuffer()));
    if (blob.size < 1000 || signature !== '%PDF-') {
      throw new Error('Sunucudan geçerli bir PDF alınamadı.');
    }

    const objectUrl = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = getPdfDownloadName(response, fallbackName);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    downloadLink.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
    showToast(successMessage);
  } catch (error) {
    console.error('PDF download error:', error);
    showToast(error.message || 'PDF indirilemedi.', 'error');
  }
}

function exportSeatingPDF() {
  const width = Number(currentEvent?.hall_width) || 10;
  const height = Number(currentEvent?.hall_height) || 10;
  return downloadAdminPdf(
    '/seating/floor-plan.pdf',
    `salon_kat_plani_${width}x${height}m.pdf`,
    'Salon planı PDF hazırlanıyor...',
    'Salon planı PDF indirildi.'
  );
}

function exportSeatingGuestListPDF() {
  return downloadAdminPdf(
    '/seating/guest-list.pdf',
    'masa_isim_listesi.pdf',
    'Masa isim listesi hazırlanıyor...',
    'Masa isim listesi indirildi.'
  );
}

async function loadSeatingData() {
  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.error || 'Oturma verileri yüklenemedi.', 'error');
      return;
    }

    seatingTables = data.tables || [];
    seatAssignments = data.assignments || [];
    seatingDecorations = data.decorations || [];

    renderSeatingTables();
  } catch (err) {
    console.error('Error loading seating data:', err);
  }
}

function getAttendingGuestList() {
  const attendingGuests = [];
  allResponses.filter(r => r.status === 'ATTENDING').forEach(r => {
    attendingGuests.push({
      name: r.guest_name,
      isPlusOne: false,
      mainName: r.guest_name,
      meal: r.meal_choice || ''
    });

    if (r.plus_ones_count > 0) {
      let detailsList = [];
      try {
        detailsList = r.plus_ones_details ? JSON.parse(r.plus_ones_details) : [];
      } catch (e) {
        detailsList = [];
      }

      let namesList = [];
      if (r.plus_ones_names && r.plus_ones_names.trim()) {
        namesList = r.plus_ones_names.split(/,|\n/).map(n => n.trim()).filter(n => n.length > 0);
      }

      for (let i = 0; i < r.plus_ones_count; i++) {
        const item = detailsList[i] || {};
        const pName = item.name || namesList[i] || `${r.guest_name} (+1 Misafir ${i+1})`;
        const pMeal = item.meal || r.meal_choice || '';

        attendingGuests.push({
          name: pName,
          isPlusOne: true,
          mainName: r.guest_name,
          meal: pMeal
        });
      }
    }
  });

  return attendingGuests;
}

function selectSeatingGuest(guest) {
  selectedSeatingGuest = selectedSeatingGuest?.name === guest.name ? null : guest;
  renderSeatingTables();
}

async function handleSelectedGuestAssignment(event, tableId) {
  if (!selectedSeatingGuest || event.target.closest('button')) return;
  const table = seatingTables.find(item => item.id === tableId);
  const occupiedSeats = seatAssignments.filter(item => item.table_id === tableId).length;
  if (table && occupiedSeats >= Number(table.capacity)) {
    showToast(`${table.name} dolu. Önce bir konuğu masadan çıkarın.`, 'error');
    return;
  }
  const guest = selectedSeatingGuest;
  selectedSeatingGuest = null;
  await assignGuestToTable(tableId, guest.name, guest.isPlusOne, guest.mainName);
}

function renderSeatingTables() {
  const attendingGuests = getAttendingGuestList();
  const unassignedGuests = attendingGuests.filter(g => 
    !seatAssignments.some(a => a.guest_name === g.name)
  );
  const totalCapacity = seatingTables.reduce((sum, table) => sum + (Number(table.capacity) || 0), 0);
  const searchTerm = (document.getElementById('guestSearchInput')?.value || '').trim().toLocaleLowerCase('tr-TR');
  const visibleUnassignedGuests = searchTerm
    ? unassignedGuests.filter(guest => guest.name.toLocaleLowerCase('tr-TR').includes(searchTerm))
    : unassignedGuests;

  if (selectedSeatingGuest && !unassignedGuests.some(guest => guest.name === selectedSeatingGuest.name)) {
    selectedSeatingGuest = null;
  }

  const summaryValues = {
    seatingTotalGuests: attendingGuests.length,
    seatingAssignedGuests: seatAssignments.length,
    seatingOpenGuests: unassignedGuests.length,
    seatingTotalCapacity: totalCapacity
  };
  Object.entries(summaryValues).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  });

  const selectionHint = document.getElementById('seatingSelectionHint');
  if (selectionHint) {
    selectionHint.textContent = selectedSeatingGuest
      ? `${selectedSeatingGuest.name} seçildi — bir masaya dokunun`
      : 'Bir konuğu masaya sürükleyin';
  }

  const sidebarContainer = document.getElementById('unassignedGuestsSidebar');
  document.getElementById('unassignedCount').textContent = unassignedGuests.length;

  if (unassignedGuests.length === 0) {
    sidebarContainer.innerHTML = '<div class="seating-empty-state" style="color:var(--attending-color); font-weight:650;">Tüm konuklar masalara atandı.</div>';
  } else if (visibleUnassignedGuests.length === 0) {
    sidebarContainer.innerHTML = '<div class="seating-empty-state">Aramanızla eşleşen konuk bulunamadı.</div>';
  } else {
    sidebarContainer.innerHTML = visibleUnassignedGuests.map((g, index) => `
      <div class="drag-guest-badge" 
           draggable="true" 
           data-guest-index="${index}"
           data-initial="${escapeHtml(g.name.charAt(0).toLocaleUpperCase('tr-TR'))}"
           role="button"
           tabindex="0"
           aria-pressed="${selectedSeatingGuest?.name === g.name ? 'true' : 'false'}"
           style="background: var(--theme-surface); border: 1px solid var(--theme-border); border-radius: var(--radius-md); padding: 10px 12px; margin-bottom: 8px; cursor: grab; font-size: 0.82rem; font-weight: 500; user-select: none;">
        <div>${escapeHtml(g.name)}</div>
        <div style="font-size: 0.75rem; color: var(--theme-muted); margin-top: 2px;">
          ${g.isPlusOne ? `(+1 - ${escapeHtml(g.mainName)})` : 'Ana Konuk'}
          ${g.meal ? ` &bull; ${escapeHtml(g.meal)}` : ''}
        </div>
      </div>
    `).join('');
    sidebarContainer.querySelectorAll('[data-guest-index]').forEach((element) => {
      const guest = visibleUnassignedGuests[Number(element.dataset.guestIndex)];
      if (selectedSeatingGuest?.name === guest.name) element.classList.add('is-selected');
      element.addEventListener('dragstart', (event) => {
        handleGuestDragStart(event, guest.name, guest.isPlusOne, guest.mainName);
      });
      element.addEventListener('click', () => selectSeatingGuest(guest));
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectSeatingGuest(guest);
        }
      });
    });
  }

  if (isSalonViewMode) {
    renderSalonFloorPlan(attendingGuests);
    return;
  }

  const gridContainer = document.getElementById('seatingTablesGrid');
  if (seatingTables.length === 0) {
    gridContainer.innerHTML = `
      <div style="text-align: center; color: var(--theme-muted); padding: 30px; grid-column: 1/-1;">
        Henüz masa eklenmedi. Masanızı ekleyerek başlayabilirsiniz.
      </div>`;
    return;
  }

  gridContainer.innerHTML = seatingTables.map(t => {
    const tableSeats = seatAssignments.filter(a => a.table_id === t.id);
    const isFull = tableSeats.length >= t.capacity;

    const occupancy = Math.min(100, Math.round((tableSeats.length / Math.max(1, t.capacity)) * 100));
    const seatListHtml = tableSeats.map(s => `
      <div class="seated-guest-row">
        <span><strong>${escapeHtml(s.guest_name)}</strong>${s.is_plus_one ? `<small>${escapeHtml(s.main_guest_name)} adlı konuğun eşlikçisi</small>` : ''}</span>
        <button type="button" class="guest-remove-button" aria-label="${escapeHtml(s.guest_name)} kişisini masadan çıkar" onclick="removeSeatAssignment('${s.id}')">✕</button>
      </div>
    `).join('');

    return `
      <div class="table-drop-zone seating-table-card ${isFull ? 'is-full' : ''} ${selectedSeatingGuest ? 'can-assign' : ''}"
           ondragover="allowDropGuest(event)"
           ondragenter="highlightDropZone(event, true)"
           ondragleave="highlightDropZone(event, false)"
           ondrop="handleGuestDropOnTable(event, '${t.id}')"
           onclick="handleSelectedGuestAssignment(event, '${t.id}')">
        <div class="seating-table-card-header">
          <div>
            <h4>${escapeHtml(t.name)}</h4>
            <div class="table-capacity-label">${tableSeats.length} / ${t.capacity} kişi${isFull ? ' · Dolu' : ''}</div>
          </div>
          <button type="button" class="table-delete-button" aria-label="${escapeHtml(t.name)} masasını sil" onclick="deleteTable('${t.id}')">✕</button>
        </div>
        <div class="table-capacity-track"><span style="width:${occupancy}%"></span></div>
        <div class="seating-table-guests">
          ${tableSeats.length > 0 ? seatListHtml : '<div class="table-empty-drop">Konuk kartını buraya sürükleyin<br>veya bir konuk seçip masaya dokunun</div>'}
        </div>
      </div>
    `;
  }).join('');
}

// Render Both Tables & Resizable Architectural Hall Elements on Canvas Layer
function renderSalonFloorPlan(attendingGuests) {
  const layer = document.getElementById('salonTablesLayer');
  if (!layer) return;

  let html = '';

  // 1. Render Architectural Hall Elements with Interactive Resize Drag Handle
  seatingDecorations.forEach(d => {
    const posX = d.pos_x || 60;
    const posY = d.pos_y || 60;
    const w = d.width || 200;
    const h = d.height || 100;

    let styleBg = 'background: #e2d9cd; border: 2px dashed #b89355; color: #5c431b;';
    let iconBadge = '📌';

    if (d.type === 'STAGE') {
      styleBg = 'background: #e8ded1; border: 2px solid #a67c52; color: #422d17; font-weight: bold; box-shadow: 0 4px 10px rgba(0,0,0,0.06);';
      iconBadge = '🎭 SAHNE & DANS ALANI';
    } else if (d.type === 'COUPLE_TABLE') {
      styleBg = 'background: #fff8eb; border: 2px solid #b78c4a; color: #8a6c38; font-weight: bold; box-shadow: 0 4px 12px rgba(183,140,74,0.2);';
      iconBadge = '💍 GELİN & DAMAT MASASI';
    } else if (d.type === 'ENTRANCE') {
      styleBg = 'background: #e6f4ea; border: 2px solid #34a853; color: #137333; font-weight: bold;';
      iconBadge = '🚪 GİRİŞ / KAPI';
    } else if (d.type === 'KITCHEN') {
      styleBg = 'background: #feefc3; border: 2px solid #f9ab00; color: #b06000; font-weight: bold;';
      iconBadge = '🍽️ MUTFAK / SERVİS';
    } else if (d.type === 'DJ_BOOTH') {
      styleBg = 'background: #e8eaed; border: 2px solid #5f6368; color: #202124; font-weight: bold;';
      iconBadge = '🎵 DJ & MÜZİK KABİNİ';
    }

    html += `
      <div id="canvas_decor_${d.id}"
           class="salon-decor-card"
           onmousedown="startCanvasElemDrag(event, '${d.id}', 'DECOR')"
           style="position: absolute; left: ${posX}px; top: ${posY}px; width: ${w}px; min-height: ${h}px; ${styleBg} border-radius: var(--radius-md); padding: 10px; display: flex; flex-direction: column; justify-content: space-between; align-items: center; text-align: center; cursor: move; user-select: none; z-index: 5;">
        <div style="width: 100%; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.72rem; opacity: 0.85;">${iconBadge}</span>
          <button type="button" onclick="event.stopPropagation(); deleteDecoration('${d.id}')" style="background:none; border:none; color:#ef4444; font-size:0.75rem; cursor:pointer; font-weight:bold;">✕</button>
        </div>
        <div style="font-family: var(--font-display); font-size: 1.05rem; margin: 4px 0;">${escapeHtml(d.label)}</div>
        <div style="font-size: 0.68rem; opacity: 0.7;">Taşı: Sürükle &bull; Boyutlandır: Sağ Alt</div>

        <!-- Interactive Resize Drag Handle -->
        <div class="decor-resize-handle"
             onmousedown="event.stopPropagation(); startDecorationResize(event, '${d.id}')"
             title="Boyutlandırmak için sürükleyin"
             style="position: absolute; right: 0; bottom: 0; width: 16px; height: 16px; cursor: se-resize; background: var(--theme-primary); border-top-left-radius: 4px; opacity: 0.85; z-index: 20;"></div>
      </div>
    `;
  });

  // 2. Render Tables
  seatingTables.forEach((t, idx) => {
    const tableSeats = seatAssignments.filter(a => a.table_id === t.id);
    const isFull = tableSeats.length >= t.capacity;

    const posX = t.pos_x !== undefined && t.pos_x !== 50 ? t.pos_x : (30 + (idx % 3) * 220);
    const posY = t.pos_y !== undefined && t.pos_y !== 50 ? t.pos_y : (140 + Math.floor(idx / 3) * 160);

    const namesInsideTable = tableSeats.map(s => escapeHtml(s.guest_name)).join(', ');

    html += `
      <div id="canvas_table_${t.id}"
           class="salon-table-card ${selectedSeatingGuest ? 'can-assign' : ''}"
           onmousedown="startCanvasElemDrag(event, '${t.id}', 'TABLE')"
           ondragover="allowDropGuest(event)"
           ondragenter="highlightDropZone(event, true)"
           ondragleave="highlightDropZone(event, false)"
           ondrop="handleGuestDropOnTable(event, '${t.id}')"
           onclick="handleSelectedGuestAssignment(event, '${t.id}')"
           style="position: absolute; left: ${posX}px; top: ${posY}px; width: 185px; min-height: 135px; background: var(--theme-surface); border: 1px solid ${isFull ? '#ef4444' : 'var(--theme-primary)'}; border-radius: var(--radius-md); padding: 10px; box-shadow: var(--shadow-card); cursor: move; user-select: none; z-index: 10;">
        <div style="font-family: var(--font-display); font-weight: 600; font-size: 0.95rem; color: var(--theme-text); text-align: center; border-bottom: 1px solid var(--theme-border); padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
          <span>${escapeHtml(t.name)}</span>
          <button type="button" onclick="event.stopPropagation(); deleteTable('${t.id}')" style="background:none; border:none; color:#ef4444; font-size:0.75rem; cursor:pointer;">✕</button>
        </div>
        <div style="font-size: 0.72rem; text-align: center; color: var(--theme-muted); font-weight: 500; margin-bottom: 6px;">
          (${tableSeats.length}/${t.capacity} Konuk)
        </div>
        <div style="font-size: 0.75rem; color: var(--theme-text); line-height: 1.3; max-height: 60px; overflow-y: auto; background: var(--theme-surface-muted); padding: 5px; border-radius: 4px;">
          ${tableSeats.length > 0 ? namesInsideTable : '<i style="color:var(--theme-muted);">Konuk sürükleyin</i>'}
        </div>
      </div>
    `;
  });

  layer.innerHTML = html;
}

// Drag & Drop for Scaled Canvas Elements
function startCanvasElemDrag(e, elemId, elemType) {
  if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.classList.contains('decor-resize-handle')) return;

  activeDraggingId = elemId;
  activeDraggingType = elemType;

  const prefix = elemType === 'TABLE' ? 'canvas_table_' : 'canvas_decor_';
  const elemEl = document.getElementById(`${prefix}${elemId}`);
  if (!elemEl) return;

  dragStartX = e.clientX;
  dragStartY = e.clientY;
  initialElemX = parseInt(elemEl.style.left) || 40;
  initialElemY = parseInt(elemEl.style.top) || 40;

  const canvas = document.getElementById('salonFloorCanvas');
  const maxW = (parseInt(canvas?.style.width) || 1000) - 50;
  const maxH = (parseInt(canvas?.style.height) || 1000) - 50;

  function onMouseMove(moveEvent) {
    if (!activeDraggingId) return;

    const deltaX = (moveEvent.clientX - dragStartX) / currentZoom;
    const deltaY = (moveEvent.clientY - dragStartY) / currentZoom;

    const newX = Math.max(5, Math.min(maxW, Math.round(initialElemX + deltaX)));
    const newY = Math.max(5, Math.min(maxH, Math.round(initialElemY + deltaY)));

    elemEl.style.left = `${newX}px`;
    elemEl.style.top = `${newY}px`;
  }

  async function onMouseUp(upEvent) {
    if (!activeDraggingId) return;

    const finalX = parseInt(elemEl.style.left) || 40;
    const finalY = parseInt(elemEl.style.top) || 40;

    if (activeDraggingType === 'TABLE') {
      const tableObj = seatingTables.find(t => t.id === activeDraggingId);
      if (tableObj) {
        tableObj.pos_x = finalX;
        tableObj.pos_y = finalY;
      }
      await updateTablePosition(activeDraggingId, finalX, finalY);
    } else if (activeDraggingType === 'DECOR') {
      const decorObj = seatingDecorations.find(d => d.id === activeDraggingId);
      if (decorObj) {
        decorObj.pos_x = finalX;
        decorObj.pos_y = finalY;
      }
      await updateDecorationPosition(activeDraggingId, finalX, finalY, decorObj?.width || 200, decorObj?.height || 100);
    }

    activeDraggingId = null;
    activeDraggingType = null;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// Interactive Resize Handler for Architectural Hall Elements
function startDecorationResize(e, decorId) {
  e.preventDefault();
  e.stopPropagation();

  const decorEl = document.getElementById(`canvas_decor_${decorId}`);
  if (!decorEl) return;

  const startX = e.clientX;
  const startY = e.clientY;
  const startW = parseInt(decorEl.style.width) || 200;
  const startH = parseInt(decorEl.style.minHeight || decorEl.style.height) || 100;

  function onMouseMove(moveEvent) {
    const deltaX = (moveEvent.clientX - startX) / currentZoom;
    const deltaY = (moveEvent.clientY - startY) / currentZoom;

    const newW = Math.max(80, Math.round(startW + deltaX));
    const newH = Math.max(40, Math.round(startH + deltaY));

    decorEl.style.width = `${newW}px`;
    decorEl.style.minHeight = `${newH}px`;
  }

  async function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);

    const finalW = parseInt(decorEl.style.width) || startW;
    const finalH = parseInt(decorEl.style.minHeight || decorEl.style.height) || startH;
    const decorObj = seatingDecorations.find(d => d.id === decorId);
    if (decorObj) {
      decorObj.width = finalW;
      decorObj.height = finalH;
    }

    const posX = parseInt(decorEl.style.left) || 50;
    const posY = parseInt(decorEl.style.top) || 50;
    await updateDecorationPosition(decorId, posX, posY, finalW, finalH);
  }

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function handleGuestDragStart(e, guestName, isPlusOne, mainGuestName) {
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', JSON.stringify({
    type: 'GUEST',
    guestName,
    isPlusOne,
    mainGuestName
  }));
}

function allowDropGuest(e) {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function highlightDropZone(e, isActive) {
  e.preventDefault();
  const zone = e.currentTarget;
  if (zone) zone.classList.toggle('is-drop-target', isActive);
}

async function handleGuestDropOnTable(e, tableId) {
  e.preventDefault();
  e.currentTarget?.classList.remove('is-drop-target');
  const rawData = e.dataTransfer.getData('text/plain');
  if (!rawData) return;

  try {
    const data = JSON.parse(rawData);
    if (data.type === 'GUEST') {
      selectedSeatingGuest = null;
      await assignGuestToTable(tableId, data.guestName, data.isPlusOne, data.mainGuestName);
    }
  } catch (err) {
    console.error('Drop error:', err);
  }
}

async function updateTablePosition(tableId, posX, posY) {
  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/tables/${tableId}/position`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: posX, pos_y: posY })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Masa konumu kaydedildi.');
  } catch (err) {
    console.error('Position save error:', err);
  }
}

async function addDecoration(type, label, width = 200, height = 100) {
  if (!currentEvent) return;

  const count = seatingDecorations.length;
  const posX = 40 + (count % 3) * 220;
  const posY = 30 + Math.floor(count / 3) * 120;

  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/decorations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, label, pos_x: posX, pos_y: posY, width, height })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(`${label} eklendi.`);
    await loadSeatingData();
  } catch (err) {
    showToast(err.message || 'Salon elemanı eklenemedi.', 'error');
  }
}

async function updateDecorationPosition(decorId, posX, posY, width, height) {
  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/decorations/${decorId}/position`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pos_x: posX, pos_y: posY, width, height })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Eleman güncellendi.');
  } catch (err) {
    console.error('Decor update error:', err);
  }
}

async function deleteDecoration(decorId) {
  if (!confirm('Bu mimari elemanı silmek istediğinize emin misiniz?')) return;

  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/decorations/${decorId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Eleman silindi.');
    await loadSeatingData();
  } catch (err) {
    showToast(err.message || 'Salon elemanı silinemedi.', 'error');
  }
}

async function assignGuestToTable(tableId, guestName, isPlusOne, mainGuestName) {
  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/assign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        table_id: tableId,
        guest_name: guestName,
        is_plus_one: isPlusOne,
        main_guest_name: mainGuestName
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Konuk masaya atandı.');
    await loadSeatingData();
  } catch (err) {
    showToast(err.message || 'Konuk masaya atanamadı.', 'error');
  }
}

async function createNewTable() {
  const nameInput = document.getElementById('newTableName');
  const capInput = document.getElementById('newTableCapacity');
  const name = nameInput.value.trim();
  const cap = parseInt(capInput.value) || 10;

  if (!name) {
    showToast('Lütfen masa adı girin.', 'error');
    nameInput.focus();
    return;
  }

  const tableCount = seatingTables.length;
  const newX = 40 + (tableCount % 3) * 220;
  const newY = 140 + Math.floor(tableCount / 3) * 160;

  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/tables`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, capacity: cap, pos_x: newX, pos_y: newY })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    nameInput.value = '';
    showToast('Masa eklendi.');
    await loadSeatingData();
  } catch (err) {
    showToast(err.message || 'Masa eklenemedi.', 'error');
  }
}

async function deleteTable(tableId) {
  if (!confirm('Bu masayı silmek istediğinize emin misiniz?')) return;

  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/tables/${tableId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Masa silindi.');
    await loadSeatingData();
  } catch (err) {
    showToast(err.message || 'Masa silinemedi.', 'error');
  }
}

async function removeSeatAssignment(assignmentId) {
  try {
    const res = await fetch(`/api/admin/${currentEvent.admin_token}/seating/assign/${assignmentId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Konuk masadan çıkarıldı.');
    await loadSeatingData();
  } catch (err) {
    showToast(err.message || 'Konuk masadan çıkarılamadı.', 'error');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('resize', () => {
    if (isSalonViewMode && document.getElementById('seatingModal')?.classList.contains('active')) {
      requestAnimationFrame(() => resetCanvasTransform());
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.getElementById('seatingModal')?.classList.contains('is-focus-mode')) {
      event.preventDefault();
      toggleSeatingFocusMode();
    }
  });

  ['newTableName', 'newTableCapacity'].forEach((id) => {
    document.getElementById(id)?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        createNewTable();
      }
    });
  });

  const fileInputEl = document.getElementById('invitationFileInput');
  if (fileInputEl) {
    fileInputEl.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const previewImg = document.getElementById('imagePreview');
          const previewContainer = document.getElementById('imagePreviewContainer');
          if (previewImg && previewContainer) {
            previewImg.src = evt.target.result;
            previewContainer.style.display = 'block';
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }
});
