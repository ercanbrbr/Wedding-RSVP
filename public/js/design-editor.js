(() => {
  const form = document.getElementById('customizeForm');
  const frame = document.getElementById('designPreviewFrame');
  const imageInput = document.getElementById('invitationFileInput');
  const musicInput = document.getElementById('musicFileInput');
  const shareInput = document.getElementById('shareImageInput');
  let shareObjectUrl = '';
  const audio = document.getElementById('musicPreview');
  const volume = document.getElementById('editMusicVolume');
  let imageObjectUrl = '';
  let musicObjectUrl = '';
  let savedMusicUrl = '';
  let active = false;
  let updateFrame = 0;
  let previousFocus = null;
  for (const [key, label, fallback] of invitationSettings.text) {
    const group = document.createElement('div');
    group.className = 'form-group';
    const caption = document.createElement('label');
    caption.className = 'form-label';
    caption.htmlFor = `copy_${key}`;
    caption.textContent = label;
    const input = document.createElement('textarea');
    input.id = caption.htmlFor;
    input.className = 'form-input';
    input.rows = fallback.includes('\n') ? 3 : 2;
    input.maxLength = 400;
    group.append(caption, input);
    document.getElementById('invitationCopyFields').append(group);
  }
  for (const [key, label] of invitationSettings.toggles) {
    const caption = document.createElement('label');
    caption.className = 'form-label';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = `copy_${key}`;
    caption.append(input, document.createTextNode(` ${label}`));
    document.getElementById('invitationVisibilityFields').append(caption);
  }

  for (const id of ['editFontFamily', 'editCrestFont']) {
    const select = document.getElementById(id);
    for (const category of ['Kaligrafi', 'Serif', 'Sade']) {
      const group = document.createElement('optgroup');
      group.label = category;
      for (const font of invitationFonts.filter(font => font.category === category)) {
        const option = new Option(font.name, font.name);
        option.style.fontFamily = `'${font.name}', serif`;
        group.append(option);
      }
      select.append(group);
    }
  }

  // Keep existing controls and listeners, but organize them into short sections.
  const sections = [];
  let sectionBody;
  for (const node of [...form.children]) {
    if (node.matches('.design-section-title')) {
      const section = document.createElement('details');
      section.className = 'editor-section';
      const summary = document.createElement('summary');
      summary.textContent = node.textContent;
      sectionBody = document.createElement('div');
      sectionBody.className = 'editor-section-body';
      section.append(summary, sectionBody);
      node.replaceWith(section);
      sections.push(section);
    } else if (sectionBody && !node.matches('.design-save-actions')) sectionBody.append(node);
  }
  const bodies = sections.map(section => section.querySelector('.editor-section-body'));
  const copyGroups = sections.map(section => {
    const details = document.createElement('details');
    details.className = 'editor-text-list';
    const summary = document.createElement('summary');
    summary.textContent = 'Bölüm yazılarını düzenle';
    details.append(summary);
    section.querySelector('.editor-section-body').append(details);
    return details;
  });
  function copySection(key) {
    if (key.startsWith('envelope_')) return 1;
    if (['gathering_eyebrow', 'gathering_title', 'when', 'where', 'dress', 'schedule_eyebrow', 'schedule_title', 'note_eyebrow'].includes(key)) return 3;
    if (key.startsWith('rsvp_')) return 4;
    return 2;
  }
  for (const [key] of invitationSettings.text) copyGroups[copySection(key)].append(document.getElementById(`copy_${key}`).closest('.form-group'));
  const ornament = document.getElementById('editOrnament');
  bodies[0].append(ornament.previousElementSibling, ornament);
  for (const [key] of invitationSettings.toggles) {
    const index = key === 'show_arch' ? 0 : ['show_gathering', 'show_schedule'].includes(key) ? 3 : 2;
    bodies[index].prepend(document.getElementById(`copy_${key}`).closest('label'));
  }
  bodies[3].append(document.getElementById('editDressCode').closest('.form-group'), document.getElementById('scheduleListContainer').closest('.form-group'));
  document.querySelector('.invitation-copy-editor').remove();
  copyGroups.forEach(group => { if (group.children.length === 1) group.remove(); });
  sections[0].open = true;
  for (const section of sections) section.addEventListener('toggle', event => {
    if (event.target === section && section.open) sections.forEach(other => { if (other !== section) other.open = false; });
  });
  form.addEventListener('invalid', event => {
    let parent = event.target.parentElement;
    while (parent && parent !== form) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
  }, true);

  const fields = {
    couple_names: 'editDesignNames', location: 'editDesignLocation', description: 'editDesignDescription', event_date: 'editDesignDate',
    theme_style: 'editTheme', custom_font: 'editFontFamily', crest_font: 'editCrestFont',
    custom_accent_color: 'editAccentColor', custom_bg_color: 'editBgColor', custom_text_color: 'editTextColor',
    custom_meal_options: 'editMealOptions', crest_style: 'editCrestStyle', crest_text: 'editCrestText',
    welcome_message: 'editWelcomeMessage', dress_code: 'editDressCode', invitation_subtitle: 'editInvitationSubtitle',
    share_title: 'editShareTitle', share_description: 'editShareDescription', share_image_url: 'editShareImageUrl'
  };

  function getDraft() {
    const draft = Object.fromEntries(Object.entries(fields).map(([key, id]) => [key, document.getElementById(id).value]));
    return {
      ...draft,
      invitation_content: JSON.stringify({
        ...Object.fromEntries(invitationSettings.text.map(([key]) => [key, document.getElementById(`copy_${key}`).value])),
        ...Object.fromEntries(invitationSettings.toggles.map(([key]) => [key, document.getElementById(`copy_${key}`).checked])),
        ornament: document.getElementById('editOrnament').value
      }),
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
    updateSharePreview();
    cancelAnimationFrame(updateFrame);
    updateFrame = requestAnimationFrame(() => send());
  }

  function updateSharePreview() {
    const draft = getDraft();
    document.getElementById('sharePreviewTitle').textContent = draft.share_title.trim()
      || `${currentEvent.couple_names || currentEvent.title} | Davetlisiniz`;
    document.getElementById('sharePreviewDescription').textContent = draft.share_description.trim()
      || 'Bu özel günümüzde sizi de aramızda görmek isteriz.';
    document.getElementById('sharePreviewDomain').textContent = new URL(currentEvent.public_url || location.href).hostname;
    const img = document.getElementById('sharePreviewImage');
    const source = shareObjectUrl || draft.share_image_url.trim() || draft.invitation_image_url;
    if (source !== img.getAttribute('src')) {
      img.hidden = !source;
      if (source) img.src = source;
      else img.removeAttribute('src');
    }
  }

  function clearShareFile() {
    if (shareObjectUrl) URL.revokeObjectURL(shareObjectUrl);
    shareObjectUrl = '';
    shareInput.value = '';
  }

  shareInput.addEventListener('change', () => {
    if (shareObjectUrl) URL.revokeObjectURL(shareObjectUrl);
    shareObjectUrl = '';
    const file = shareInput.files[0];
    if (file && (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      shareInput.value = '';
      showToast('JPG, PNG, WebP veya GIF seçin. En fazla 10 MB.', 'error');
    } else if (file) shareObjectUrl = URL.createObjectURL(file);
    update();
  });
  document.getElementById('editShareImageUrl').addEventListener('input', () => { clearShareFile(); update(); });
  document.getElementById('resetShareImageButton').addEventListener('click', () => {
    clearShareFile();
    document.getElementById('editShareImageUrl').value = '';
    update();
  });
  document.getElementById('sharePreviewImage').addEventListener('error', (event) => { event.currentTarget.hidden = true; });

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
    if (active && event.origin === location.origin && event.source === frame.contentWindow && event.data?.type === 'invitation-preview-edit') {
      let entry = invitationEditFields.find(item => item[0] === event.data.key);
      const scheduleKey = /^schedule:(\d+):(title|time)$/.exec(event.data.key || '');
      let scheduleInput;
      if (scheduleKey) {
        const rows = [...document.querySelectorAll('#scheduleListContainer > div')].filter(row => row.querySelector('.sched-time')?.value.trim() || row.querySelector('.sched-title')?.value.trim());
        scheduleInput = rows[Number(scheduleKey[1])]?.querySelector(`.sched-${scheduleKey[2]}`);
        if (scheduleInput) entry = [event.data.key, '', '', '', 200];
      }
      if (!entry || typeof event.data.value !== 'string' || event.data.value.length > entry[4]) return;
      const input = scheduleInput || document.getElementById(entry[3]);
      input.value = event.data.value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      let parent = input.parentElement;
      while (parent && parent !== form) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
      input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
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
      document.getElementById('editDesignNames').value = currentEvent.couple_names || currentEvent.title || '';
      document.getElementById('editDesignLocation').value = currentEvent.location || '';
      document.getElementById('editDesignDescription').value = currentEvent.description || '';
      const date = new Date(currentEvent.event_date);
      document.getElementById('editDesignDate').value = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const content = invitationContent(currentEvent);
      for (const [key, , fallback] of invitationSettings.text) document.getElementById(`copy_${key}`).value = content[key] ?? fallback;
      for (const [key] of invitationSettings.toggles) document.getElementById(`copy_${key}`).checked = content[key] !== false;
      document.getElementById('editOrnament').value = content.ornament || 'floral';
      clearShareFile();
      for (const key of ['share_title', 'share_description', 'share_image_url']) {
        document.getElementById(fields[key]).value = currentEvent[key] || '';
      }
      form.scrollTop = 0;
      sections.forEach((section, index) => { section.open = index === 0; });
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
      clearShareFile();
      document.body.classList.remove('design-editor-open');
      document.querySelector('.admin-container').inert = false;
      previousFocus?.focus();
    },
    async uploadShareImage() {
      const file = shareInput.files[0];
      if (!file) return document.getElementById('editShareImageUrl').value.trim();
      const data = new FormData();
      data.append('image', file);
      const response = await fetch('/api/admin/session/upload?draft=1', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Paylaşım görseli yüklenemedi.');
      return result.image_url;
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

})();
