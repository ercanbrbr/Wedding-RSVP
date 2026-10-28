(() => {
  if (location.pathname !== '/admin/preview' || parent === window) return;
  let currentEvent = {};
  let selected = null;
  let enabled = true;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'preview-edit-toggle';
  toggle.textContent = 'Yazı düzenleme açık';
  toggle.setAttribute('aria-pressed', 'true');
  document.body.append(toggle);
  document.body.classList.add('preview-edit-mode');
  const editor = document.createElement('section');
  editor.className = 'preview-text-popover';
  editor.hidden = true;
  editor.setAttribute('role', 'dialog');
  editor.setAttribute('aria-labelledby', 'previewTextTitle');
  editor.innerHTML = `<strong id="previewTextTitle"></strong><label for="previewTextValue">Yeni metin</label><textarea id="previewTextValue" rows="4"></textarea><input id="previewDateValue" type="datetime-local" aria-label="Tarih ve saat" hidden><p>Değişiklik taslağa uygulanır. Yayınlamak için Tasarımı Kaydet.</p><div><button type="button" data-action="cancel">Vazgeç</button><button type="button" data-action="apply">Uygula</button></div>`;
  document.body.append(editor);
  const text = editor.querySelector('textarea');
  const date = editor.querySelector('input');
  const label = editor.querySelector('label');
  function close() {
    editor.hidden = true;
    selected?.element?.focus({ preventScroll: true });
    selected = null;
  }
  function open(element) {
    const key = element.dataset.previewEdit;
    const entry = invitationEditFields.find(item => item[0] === key);
    const schedule = /^schedule:(\d+):(title|time)$/.exec(key || '');
    let value;
    if (entry) {
      const copyKey = key.startsWith('copy:') ? key.slice(5) : null;
      value = copyKey ? (invitationContent(currentEvent)[copyKey] ?? invitationSettings.text.find(item => item[0] === copyKey)[2]) : currentEvent[key];
      if (value == null) value = element.innerText;
    } else if (schedule) {
      let items;
      try { items = JSON.parse(currentEvent.event_schedule || '[]'); } catch { return; }
      value = items[Number(schedule[1])]?.[schedule[2]] || '';
    } else return;
    selected = { key, element };
    editor.querySelector('strong').textContent = entry?.[1] || (schedule[2] === 'time' ? 'Program saati' : 'Program başlığı');
    const isDate = key === 'event_date';
    const isTime = schedule?.[2] === 'time';
    date.type = isTime ? 'time' : 'datetime-local';
    date.hidden = !isDate && !isTime;
    text.hidden = isDate || isTime;
    label.htmlFor = text.hidden ? date.id : text.id;
    label.textContent = isDate ? 'Tarih ve saat' : isTime ? 'Saat' : 'Yeni metin';
    if (isDate) {
      const parsed = new Date(value);
      date.value = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    } else if (isTime) {
      date.value = value;
    } else {
      text.maxLength = entry?.[4] || 200;
      text.value = value;
    }
    editor.hidden = false;
    (text.hidden ? date : text).focus();
    if (!text.hidden) text.select();
  }
  function apply() {
    if (!selected) return;
    const value = text.hidden ? date.value : text.value;
    if (['couple_names', 'location', 'event_date'].includes(selected.key) && !value.trim()) {
      (selected.key === 'event_date' ? date : text).setCustomValidity('Bu alan boş bırakılamaz.');
      (selected.key === 'event_date' ? date : text).reportValidity();
      return;
    }
    parent.postMessage({ type: 'invitation-preview-edit', key: selected.key, value }, location.origin);
    close();
  }
  editor.addEventListener('input', () => { text.setCustomValidity(''); date.setCustomValidity(''); });
  editor.querySelector('[data-action="apply"]').addEventListener('click', apply);
  editor.querySelector('[data-action="cancel"]').addEventListener('click', close);
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    document.body.classList.toggle('preview-edit-mode', enabled);
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.textContent = enabled ? 'Yazı düzenleme açık' : 'Davetli gibi görüntüle';
    close();
  });
  document.addEventListener('click', event => {
    const element = event.target.closest('[data-preview-edit]');
    if (!enabled || !element) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open(element);
  }, true);
  document.addEventListener('keydown', event => {
    if (!editor.hidden) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close(); }
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); apply(); }
      if (event.key === 'Tab') {
        const fields = [...editor.querySelectorAll('textarea, input, button')].filter(el => !el.hidden);
        if (event.shiftKey && document.activeElement === fields[0]) { event.preventDefault(); fields.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === fields.at(-1)) { event.preventDefault(); fields[0].focus(); }
      }
      // The envelope has its own keyboard focus handling.
      event.stopPropagation();
      return;
    }
    if (enabled && event.key === 'Enter' && event.target.matches('[data-preview-edit]')) {
      event.preventDefault(); event.stopImmediatePropagation(); open(event.target);
    }
  }, true);
  function mark(element, key, title) {
    element.dataset.previewEdit = key;
    element.tabIndex = 0;
    element.title = `${title} — düzenlemek için tıklayın`;
  }
  window.previewTextEditor = {
    refresh(event) {
      currentEvent = event;
      for (const [key, title, selector] of invitationEditFields) document.querySelectorAll(selector).forEach(element => mark(element, key, title));
      document.querySelectorAll('.timeline-item').forEach((row, index) => {
        mark(row.querySelector('.timeline-title'), `schedule:${index}:title`, 'Program başlığı');
        mark(row.querySelector('.timeline-time'), `schedule:${index}:time`, 'Program saati');
      });
    }
  };
})();
