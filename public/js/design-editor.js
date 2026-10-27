(() => {
  const form = document.getElementById('customizeForm');
  const frame = document.getElementById('designPreviewFrame');
  const imageInput = document.getElementById('invitationFileInput');
  const musicInput = document.getElementById('musicFileInput');
  const audio = document.getElementById('musicPreview');
  const volume = document.getElementById('editMusicVolume');
  let imageObjectUrl = '';
  let musicObjectUrl = '';
  let savedMusicUrl = '';
  let active = false;
  let updateFrame = 0;
  let previousFocus = null;

  const fields = {
    theme_style: 'editTheme', custom_font: 'editFontFamily', crest_font: 'editCrestFont',
    custom_accent_color: 'editAccentColor', custom_bg_color: 'editBgColor', custom_text_color: 'editTextColor',
    custom_meal_options: 'editMealOptions', crest_style: 'editCrestStyle', crest_text: 'editCrestText',
    welcome_message: 'editWelcomeMessage', dress_code: 'editDressCode', invitation_subtitle: 'editInvitationSubtitle'
  };

  function getDraft() {
    const draft = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, document.getElementById(id).value]));
    return {
      ...draft,
      crest_style: document.getElementById('editShowCrest').checked ? draft.crest_style : 'none',
      invitation_image_url: imageObjectUrl || document.getElementById('editInvitationUrl').value.trim(),
      event_schedule: JSON.stringify(getScheduleData()),
      enable_meal_choice: document.getElementById('editEnableMeal').checked ? 1 : 0,
      enable_song_request: document.getElementById('editEnableSong').checked ? 1 : 0,
      music_url: musicObjectUrl || savedMusicUrl,
      music_volume: Number(volume.value) / 100
    };
  }

  function send(type = 'invitation-preview') {
    if (!active || !frame.contentWindow) return;
    // Only public invitation fields cross into the preview document.
    const event = {};
    for (const key of ['title', 'couple_names', 'event_date', 'location', 'map_url', 'description']) event[key] = currentEvent[key];
    frame.contentWindow.postMessage({ type, event: { ...event, ...getDraft() } }, location.origin);
  }

  function update() {
    if (!active) return;
    cancelAnimationFrame(updateFrame);
    updateFrame = requestAnimationFrame(() => send());
  }

  function clearImage() {
    if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
    imageObjectUrl = '';
    update();
  }

  function updateAudio() {
    const source = musicObjectUrl || savedMusicUrl;
    audio.pause();
    if (source) audio.src = source;
    else audio.removeAttribute('src');
    audio.load();
    audio.hidden = !source;
    audio.volume = Number(volume.value) / 100;
    document.getElementById('musicFileName').textContent = musicInput.files[0]?.name || (savedMusicUrl ? 'Kayıtlı davetiye müziği' : 'Müzik seçilmedi.');
    document.getElementById('removeMusicButton').disabled = !source;
    update();
  }

  function clearMusic() {
    audio.pause();
    if (musicObjectUrl) URL.revokeObjectURL(musicObjectUrl);
    musicObjectUrl = '';
    savedMusicUrl = '';
    musicInput.value = '';
    updateAudio();
  }

  form.addEventListener('input', update);
  form.addEventListener('change', update);
  imageInput.addEventListener('change', () => {
    clearImage();
    const file = imageInput.files[0];
    if (file && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      imageInput.value = '';
      showToast('JPG, PNG, WebP veya GIF seçin. En fazla 10 MB.', 'error');
      return;
    }
    if (file) imageObjectUrl = URL.createObjectURL(file);
    const source = imageObjectUrl || document.getElementById('editInvitationUrl').value.trim();
    document.getElementById('imagePreview').src = source;
    document.getElementById('imagePreviewContainer').style.display = source ? 'block' : 'none';
    update();
  });
  musicInput.addEventListener('change', () => {
    const file = musicInput.files[0];
    if (musicObjectUrl) URL.revokeObjectURL(musicObjectUrl);
    musicObjectUrl = '';
    if (file && (!/\.(mp3|wav|ogg)$/i.test(file.name) || file.size > 20 * 1024 * 1024)) {
      musicInput.value = '';
      showToast('MP3, WAV veya OGG seçin. En fazla 20 MB.', 'error');
    } else if (file) {
      musicObjectUrl = URL.createObjectURL(file);
    }
    updateAudio();
  });
  volume.addEventListener('input', () => {
    audio.volume = Number(volume.value) / 100;
    document.getElementById('musicVolumeLabel').textContent = `%${volume.value}`;
  });
  document.getElementById('removeMusicButton').addEventListener('click', clearMusic);
  document.getElementById('previewEnvelopeButton').addEventListener('click', () => {
    audio.pause();
    send('invitation-preview-envelope');
  });
  document.getElementById('previewMobileButton').addEventListener('click', (event) => {
    const isMobile = frame.classList.toggle('phone-preview');
    event.currentTarget.setAttribute('aria-pressed', String(isMobile));
  });
  window.addEventListener('message', (event) => {
    if (event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'invitation-preview-ready') send();
  });
  audio.addEventListener('play', () => frame.contentWindow?.postMessage({ type: 'invitation-preview-pause' }, location.origin));
  audio.addEventListener('error', () => {
    if (audio.hasAttribute('src')) showToast('Müzik bu tarayıcıda çalınamadı. Başka bir MP3 dosyası deneyin.', 'error');
  });

  window.designEditor = {
    getDraft, update, clearImage,
    open() {
      previousFocus = document.activeElement;
      active = true;
      form.scrollTop = 0;
      savedMusicUrl = currentEvent.music_url || '';
      musicInput.value = '';
      volume.value = Math.round((currentEvent.music_volume ?? 0.15) * 100);
      document.getElementById('musicVolumeLabel').textContent = `%${volume.value}`;
      updateAudio();
      frame.src = '/admin/preview';
      document.body.classList.add('design-editor-open');
      document.querySelector('.admin-container').inert = true;
      document.getElementById('editTheme').focus();
    },
    close() {
      if (!active) return;
      active = false;
      cancelAnimationFrame(updateFrame);
      frame.src = 'about:blank';
      clearImage();
      clearMusic();
      document.body.classList.remove('design-editor-open');
      document.querySelector('.admin-container').inert = false;
      previousFocus?.focus();
    },
    async uploadMusic() {
      const file = musicInput.files[0];
      if (!file) return savedMusicUrl;
      const data = new FormData();
      data.append('music', file);
      const response = await fetch('/api/admin/session/music', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Müzik yüklenemedi.');
      return result.music_url;
    }
  };

  // Enable the licensed font only when its actual webfont is installed.
  fetch('/fonts/SloopScriptPro.woff2', { method: 'HEAD' }).then((response) => {
    if (!response.ok || response.headers.get('content-type')?.includes('text/html')) return [];
    return document.fonts.load('24px "Sloop Script Pro"');
  }).then((faces) => {
    if (!faces.length) return;
    document.querySelectorAll('option[value="Sloop Script Pro"]').forEach((option) => {
      option.disabled = false;
      option.textContent = 'Sloop Script Pro — Kaligrafi';
    });
  }).catch(() => {});
})();
