// Guest RSVP Public Page Logic
let publicToken = null;
let currentPublicEvent = null;
let existingGuestToken = null;
let selectedStatus = null;
let selectedMeal = null;
let hasPlusOnes = false;
let countdownInterval = null;

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

const match = window.location.pathname.match(/\/e\/([a-f0-9-]+)/i);
if (match) {
  publicToken = match[1];
  initGuestView();
}

async function initGuestView() {
  if (!publicToken) return;

  try {
    const res = await fetch(`/api/public/${publicToken}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      alert(data.error || 'Etkinlik bulunamadı veya bağlantı sonlanmış.');
      return;
    }

    currentPublicEvent = data.event;
    renderEventDetails(currentPublicEvent);

    existingGuestToken = localStorage.getItem(`lcv_guest_token_${publicToken}`);
    if (existingGuestToken) {
      await loadExistingResponse(existingGuestToken);
    }
  } catch (err) {
    console.error('Error initializing guest view:', err);
  }
}

function splitCoupleText(value) {
  const normalized = String(value || '').trim().replace(/\s+/g, ' ');
  const explicitParts = normalized.split(/\s*(?:&|\+|\bve\b|\band\b)\s*/i).filter(Boolean);
  if (explicitParts.length === 2) return explicitParts;
  return null;
}

function renderSeparatedNames(element, value, variant) {
  const parts = splitCoupleText(value);
  element.replaceChildren();
  if (!parts) {
    element.textContent = value;
    element.classList.remove('has-separated-names');
    return;
  }

  element.classList.add('has-separated-names');
  const first = document.createElement('span');
  const joiner = document.createElement('span');
  const second = document.createElement('span');
  first.className = `${variant}-name-part`;
  second.className = `${variant}-name-part`;
  joiner.className = `${variant}-name-joiner`;
  first.textContent = parts[0];
  joiner.textContent = '&';
  second.textContent = parts[1];
  element.append(first, joiner, second);
}

function renderEventDetails(event) {
  const coupleName = event.couple_names || event.title;
  document.title = `${coupleName} | Düğün Davetiyesi & LCV`;

  renderSeparatedNames(document.getElementById('eventCalligraphyTitle'), coupleName, 'couple');

  const subtitleEl = document.getElementById('eventSubtitle');
  if (event.title && event.title !== coupleName) {
    subtitleEl.textContent = event.title;
  } else {
    subtitleEl.textContent = 'Düğün';
  }

  // Configurable Monogram Crest Text, Shape Style, and Separate Monogram Font (1. Kısım)
  const crestEl = document.getElementById('crestMonogram');
  if (crestEl) {
    const textToShow = (event.crest_text && event.crest_text.trim()) 
      ? event.crest_text.trim() 
      : getInitials(coupleName);
    
    const crestStyleClass = event.crest_style || 'circle';
    crestEl.className = `crest-monogram ${crestStyleClass}`;
    renderSeparatedNames(crestEl, textToShow, 'crest');
  }

  // Set 1. Kısım (Monogram Font)
  const crestFont = event.crest_font || 'Alex Brush';
  const crestFontFamily = `'${crestFont}', cursive`;
  document.documentElement.style.setProperty('--font-monogram', crestFontFamily);

  // Set 3. Kısım (Çift İsimleri Fontu - Affects ONLY 3. Kısım!)
  const coupleFont = event.custom_font || 'Alex Brush';
  const coupleFontFamily = `'${coupleFont}', cursive`;
  document.documentElement.style.setProperty('--font-couple-names', coupleFontFamily);

  // Theme Class (6 Semantic Themes)
  const themeClass = `theme-${event.theme_style || 'warm_ivory'}`;
  document.body.className = `${themeClass} custom-theme-active`;

  if (event.custom_accent_color) {
    document.documentElement.style.setProperty('--custom-accent-color', event.custom_accent_color);
  }
  if (event.custom_bg_color) {
    document.documentElement.style.setProperty('--custom-bg-color', event.custom_bg_color);
  }
  if (event.custom_text_color) {
    document.documentElement.style.setProperty('--custom-text-color', event.custom_text_color);
  }

  // Welcome Quote (5. Kısım - Always Italic & Standard Editorial Serif)
  const welcomeMsgEl = document.getElementById('welcomeMessageText');
  if (event.welcome_message && event.welcome_message.trim()) {
    welcomeMsgEl.textContent = `"${event.welcome_message.trim()}"`;
    welcomeMsgEl.style.display = 'block';
  } else {
    welcomeMsgEl.style.display = 'none';
  }

  // Cover Image
  const imgFrame = document.getElementById('invitationImageFrame');
  const imgEl = document.getElementById('invitationImg');
  if (event.invitation_image_url && event.invitation_image_url.trim()) {
    imgEl.src = event.invitation_image_url;
    imgFrame.style.display = 'block';
  } else {
    imgFrame.style.display = 'none';
  }

  // Live Countdown Timer
  startCountdown(event.event_date);

  // Render Program / Schedule Timeline
  renderScheduleTimeline(event.event_schedule);

  // Render Custom Meal Options Pills for Main Guest
  renderMealPills(event.custom_meal_options);

  // Form Feature Toggles
  const mealSection = document.getElementById('mealSection');
  if (mealSection) mealSection.style.display = event.enable_meal_choice ? 'block' : 'none';

  const songSection = document.getElementById('songSection');
  if (songSection) songSection.style.display = event.enable_song_request ? 'block' : 'none';

  // Dates & Times
  const dateObj = new Date(event.event_date);
  const formattedDate = dateObj.toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const formattedTime = dateObj.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit'
  });

  document.getElementById('eventDateStr').textContent = formattedDate;
  document.getElementById('eventTimeStr').textContent = `Saat: ${formattedTime}`;
  document.getElementById('eventLocation').textContent = event.location;

  // Custom Google Maps Link or fallback
  const mapLinkEl = document.getElementById('mapLink');
  let safeMapUrl = '';
  try {
    const candidate = new URL(event.map_url || '');
    if (['http:', 'https:'].includes(candidate.protocol)) safeMapUrl = candidate.href;
  } catch (err) {}
  if (safeMapUrl) {
    mapLinkEl.href = safeMapUrl;
  } else {
    mapLinkEl.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`;
  }

  // Dress Code
  const dressCodeContainer = document.getElementById('dressCodeContainer');
  const dressCodeBadge = document.getElementById('dressCodeBadge');
  if (event.dress_code && event.dress_code.trim()) {
    dressCodeBadge.textContent = event.dress_code.trim();
    dressCodeContainer.style.display = 'flex';
  } else {
    dressCodeContainer.style.display = 'none';
  }

  // Description
  if (event.description && event.description.trim()) {
    document.getElementById('eventDescription').textContent = event.description;
    document.getElementById('descriptionContainer').style.display = 'flex';
  } else {
    document.getElementById('descriptionContainer').style.display = 'none';
  }
}

// Dynamically Render Custom Meal Option Pills for Main Guest
function renderMealPills(optionsStr) {
  const container = document.getElementById('mealPillsContainer');
  if (!container) return;

  const defaultOptions = ['Etli Menü', 'Vejetaryen / Vegan', 'Çocuk Menüsü'];
  let options = defaultOptions;

  if (optionsStr && optionsStr.trim()) {
    options = optionsStr.split(',').map(o => o.trim()).filter(o => o.length > 0);
  }

  container.innerHTML = options.map((opt, index) => {
    const isSelected = selectedMeal === opt;
    return `
      <div class="meal-pill ${isSelected ? 'selected' : ''}" data-meal-index="${index}">
        ${escapeHtml(opt)}
      </div>
    `;
  }).join('');
  container.querySelectorAll('[data-meal-index]').forEach((element) => {
    element.addEventListener('click', () => selectMeal(options[Number(element.dataset.mealIndex)]));
  });
}

// Render Plus-Ones Cards with Individual Meal Choice Selectors
function updatePlusOnesCards() {
  const countInput = document.getElementById('plus_ones_count');
  const container = document.getElementById('plusOnesCardsContainer');
  if (!countInput || !container) return;

  const count = Math.max(1, parseInt(countInput.value) || 1);
  const options = getMealOptionsArray();
  const enableMeal = currentPublicEvent && currentPublicEvent.enable_meal_choice;

  let html = '';
  for (let i = 1; i <= count; i++) {
    const mealOptionsHtml = options.map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('');

    html += `
      <div class="plus-one-guest-card" style="background: var(--theme-surface); border: 1px solid var(--theme-border); border-radius: var(--radius-md); padding: 14px; margin-bottom: 12px;">
        <div style="font-weight: 600; font-size: 0.85rem; color: var(--theme-text); margin-bottom: 8px;">
          ${i}. Misafir Bilgileri:
        </div>
        <div class="form-group" style="margin-bottom: 10px;">
          <input type="text" class="form-input plus-one-name-input" placeholder="Misafir Adı ve Soyadı" required style="padding: 10px;">
        </div>
        ${enableMeal ? `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" style="font-size: 0.78rem; margin-bottom: 4px;">Misafir Yemek Tercihi:</label>
            <select class="form-select plus-one-meal-select" style="padding: 8px 10px; font-size: 0.85rem;">
              ${mealOptionsHtml}
            </select>
          </div>
        ` : ''}
      </div>
    `;
  }

  container.innerHTML = html;
}

function getMealOptionsArray() {
  const defaultOptions = ['Etli Menü', 'Vejetaryen / Vegan', 'Çocuk Menüsü'];
  if (currentPublicEvent && currentPublicEvent.custom_meal_options && currentPublicEvent.custom_meal_options.trim()) {
    return currentPublicEvent.custom_meal_options.split(',').map(o => o.trim()).filter(o => o.length > 0);
  }
  return defaultOptions;
}

function getInitials(nameStr) {
  if (!nameStr) return 'E&E';
  const parts = nameStr.split(/&|ve|\+/i);
  if (parts.length >= 2) {
    const first = parts[0].trim().charAt(0).toUpperCase();
    const second = parts[1].trim().charAt(0).toUpperCase();
    return `${first}${second}`;
  }
  const words = nameStr.trim().split(' ');
  if (words.length >= 2) {
    return `${words[0].charAt(0).toUpperCase()}${words[1].charAt(0).toUpperCase()}`;
  }
  return nameStr.charAt(0).toUpperCase();
}

function startCountdown(targetDateStr) {
  if (countdownInterval) clearInterval(countdownInterval);

  const targetDate = new Date(targetDateStr).getTime();

  function updateTimer() {
    const now = new Date().getTime();
    const difference = targetDate - now;

    if (difference <= 0) {
      document.getElementById('cdDays').textContent = '00';
      document.getElementById('cdHours').textContent = '00';
      document.getElementById('cdMins').textContent = '00';
      document.getElementById('cdSecs').textContent = '00';
      clearInterval(countdownInterval);
      return;
    }

    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    document.getElementById('cdDays').textContent = String(days).padStart(2, '0');
    document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
    document.getElementById('cdMins').textContent = String(minutes).padStart(2, '0');
    document.getElementById('cdSecs').textContent = String(seconds).padStart(2, '0');
  }

  updateTimer();
  countdownInterval = setInterval(updateTimer, 1000);
}

function renderScheduleTimeline(scheduleJson) {
  const section = document.getElementById('timelineSection');
  const container = document.getElementById('timelineContainer');
  if (!section || !container) return;

  let items = [];
  try {
    items = typeof scheduleJson === 'string' ? JSON.parse(scheduleJson) : (scheduleJson || []);
  } catch (e) {
    items = [];
  }

  if (!items || items.length === 0) {
    section.style.display = 'none';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-time">${escapeHtml(item.time || '')}</div>
      <div class="timeline-title">${escapeHtml(item.title || '')}</div>
    </div>
  `).join('');

  section.style.display = 'block';
}

function openImageModal() {
  const imgModal = document.getElementById('imageModal');
  const fullImg = document.getElementById('fullSizeImg');
  const invImg = document.getElementById('invitationImg');
  if (imgModal && fullImg && invImg) {
    fullImg.src = invImg.src;
    imgModal.classList.add('active');
  }
}

function closeImageModal() {
  const imgModal = document.getElementById('imageModal');
  if (imgModal) imgModal.classList.remove('active');
}

async function loadExistingResponse(guestToken) {
  try {
    const res = await fetch(`/api/public/${publicToken}/guest`, {
      headers: { 'X-Guest-Token': guestToken }
    });
    const data = await res.json();

    if (res.ok && data.success && data.response) {
      const resp = data.response;

      document.getElementById('guest_name').value = resp.guest_name || '';
      selectStatus(resp.status);

      if (resp.status === 'ATTENDING' && resp.plus_ones_count > 0) {
        setPlusOnesToggle(true);
        document.getElementById('plus_ones_count').value = resp.plus_ones_count;
        updatePlusOnesCards();

        let detailsList = [];
        try {
          detailsList = resp.plus_ones_details ? JSON.parse(resp.plus_ones_details) : [];
        } catch (e) {
          detailsList = [];
        }

        const nameInputs = document.querySelectorAll('.plus-one-name-input');
        const mealSelects = document.querySelectorAll('.plus-one-meal-select');

        nameInputs.forEach((inp, idx) => {
          if (detailsList[idx] && detailsList[idx].name) {
            inp.value = detailsList[idx].name;
          }
        });

        mealSelects.forEach((sel, idx) => {
          if (detailsList[idx] && detailsList[idx].meal) {
            sel.value = detailsList[idx].meal;
          }
        });
      } else {
        setPlusOnesToggle(false);
      }

      if (resp.meal_choice) {
        selectMeal(resp.meal_choice);
      }

      if (resp.song_request) {
        document.getElementById('song_request').value = resp.song_request;
      }

      document.getElementById('note').value = resp.note || '';

      document.getElementById('updateBanner').style.display = 'flex';
      const btnSubmit = document.getElementById('btnSubmitRsvp');
      if (btnSubmit) {
        btnSubmit.innerHTML = '<span>Yanıtı Güncelle</span>';
      }
    }
  } catch (err) {
    console.warn('Could not fetch existing response:', err);
  }
}

function selectStatus(status) {
  selectedStatus = status;
  document.getElementById('status').value = status;

  const btnAttending = document.getElementById('btnAttending');
  const btnDeclined = document.getElementById('btnDeclined');
  const plusSection = document.getElementById('plusOnesSection');
  const mealSection = document.getElementById('mealSection');
  const songSection = document.getElementById('songSection');

  if (status === 'ATTENDING') {
    btnAttending.classList.add('selected');
    btnDeclined.classList.remove('selected');
    plusSection.style.display = 'block';
    if (currentPublicEvent && currentPublicEvent.enable_meal_choice) mealSection.style.display = 'block';
    if (currentPublicEvent && currentPublicEvent.enable_song_request) songSection.style.display = 'block';
  } else {
    btnDeclined.classList.add('selected');
    btnAttending.classList.remove('selected');
    plusSection.style.display = 'none';
    mealSection.style.display = 'none';
    songSection.style.display = 'none';
  }
  btnAttending.setAttribute('aria-pressed', String(status === 'ATTENDING'));
  btnDeclined.setAttribute('aria-pressed', String(status === 'DECLINED'));
}

function selectMeal(mealName) {
  selectedMeal = mealName;
  document.getElementById('meal_choice').value = mealName;

  document.querySelectorAll('.meal-pill').forEach(pill => {
    if (pill.textContent.trim() === mealName) {
      pill.classList.add('selected');
    } else {
      pill.classList.remove('selected');
    }
  });
}

function setPlusOnesToggle(enable) {
  hasPlusOnes = enable;
  const toggleYes = document.getElementById('toggleYes');
  const toggleNo = document.getElementById('toggleNo');
  const inputsContainer = document.getElementById('plusOnesInputs');

  if (enable) {
    toggleYes.classList.add('active');
    toggleNo.classList.remove('active');
    inputsContainer.style.display = 'block';
    updatePlusOnesCards();
  } else {
    toggleNo.classList.add('active');
    toggleYes.classList.remove('active');
    inputsContainer.style.display = 'none';
  }
  toggleYes.setAttribute('aria-pressed', String(enable));
  toggleNo.setAttribute('aria-pressed', String(!enable));
}

const rsvpForm = document.getElementById('rsvpForm');
if (rsvpForm) {
  rsvpForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const guestName = document.getElementById('guest_name').value.trim();
    if (!guestName) {
      alert('Lütfen adınızı ve soyadınızı giriniz.');
      return;
    }

    if (!selectedStatus) {
      alert('Lütfen katılım durumunuzu seçiniz.');
      return;
    }

    const btnSubmit = document.getElementById('btnSubmitRsvp');
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = '<span>Kaydediliyor...</span>';

    const plusCount = (selectedStatus === 'ATTENDING' && hasPlusOnes)
      ? parseInt(document.getElementById('plus_ones_count').value) || 1
      : 0;

    let plusDetails = [];
    let plusNamesArr = [];

    if (selectedStatus === 'ATTENDING' && hasPlusOnes) {
      const nameInputs = document.querySelectorAll('.plus-one-name-input');
      const mealSelects = document.querySelectorAll('.plus-one-meal-select');

      nameInputs.forEach((inp, idx) => {
        const pName = inp.value.trim() || `Misafir ${idx + 1}`;
        const pMeal = mealSelects[idx] ? mealSelects[idx].value : (selectedMeal || '');
        plusNamesArr.push(pName);
        plusDetails.push({ name: pName, meal: pMeal });
      });
    }

    const payload = {
      guest_name: guestName,
      status: selectedStatus,
      plus_ones_count: plusCount,
      plus_ones_names: plusNamesArr.join(', '),
      plus_ones_details: JSON.stringify(plusDetails),
      meal_choice: selectedMeal || '',
      song_request: document.getElementById('song_request') ? document.getElementById('song_request').value.trim() : '',
      note: document.getElementById('note').value.trim(),
      guest_token: existingGuestToken
    };

    try {
      const res = await fetch(`/api/public/${publicToken}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Yanıt kaydedilirken bir sorun oluştu.');
      }

      if (data.guest_token) {
        existingGuestToken = data.guest_token;
        localStorage.setItem(`lcv_guest_token_${publicToken}`, data.guest_token);
      }

      document.getElementById('rsvpFormCard').style.display = 'none';
      const successCard = document.getElementById('successCard');
      const summaryText = document.getElementById('successSummaryText');

      if (selectedStatus === 'ATTENDING') {
        let text = `Katılım durumunuz "Katılıyorum" olarak kaydedildi.`;
        if (plusCount > 0) text += ` Yanınızda ${plusCount} kişi ile bekleniyorsunuz.`;
        if (selectedMeal) text += ` Ana yemek tercihiniz: ${selectedMeal}.`;
        summaryText.textContent = text;
      } else {
        summaryText.textContent = 'Katılım durumunuz "Katılamıyorum" olarak kaydedildi. Geri bildiriminiz için teşekkür ederiz.';
      }

      successCard.style.display = 'block';
      successCard.scrollIntoView({ behavior: 'smooth' });
      showToast('Yanıtınız başarıyla iletildi.');
    } catch (err) {
      alert(err.message);
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = existingGuestToken ? '<span>Yanıtı Güncelle</span>' : '<span>Yanıtı Gönder</span>';
    }
  });
}

function reeditForm() {
  document.getElementById('successCard').style.display = 'none';
  document.getElementById('rsvpFormCard').style.display = 'block';
  document.getElementById('updateBanner').style.display = 'flex';
  document.getElementById('rsvpFormCard').scrollIntoView({ behavior: 'smooth' });
}

function addToCalendar() {
  if (!currentPublicEvent) return;

  const title = encodeURIComponent(currentPublicEvent.couple_names || currentPublicEvent.title);
  const location = encodeURIComponent(currentPublicEvent.location);
  const details = encodeURIComponent(currentPublicEvent.description || 'Düğün Katılımı');

  const startDate = new Date(currentPublicEvent.event_date);
  const endDate = new Date(startDate.getTime() + (4 * 60 * 60 * 1000));

  const formatCalDate = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');

  const datesParam = `${formatCalDate(startDate)}/${formatCalDate(endDate)}`;
  const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${datesParam}&details=${details}&location=${location}`;

  window.open(gcalUrl, '_blank');
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
