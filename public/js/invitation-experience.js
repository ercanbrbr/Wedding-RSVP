(() => {
  const envelope = document.createElement('section');
  envelope.className = 'invitation-envelope';
  envelope.hidden = true;
  envelope.setAttribute('role', 'dialog');
  envelope.setAttribute('aria-modal', 'true');
  envelope.setAttribute('aria-labelledby', 'envelopeTitle');
  envelope.innerHTML = `
    <div class="envelope-heading"><p class="envelope-eyebrow">BİRLİKTE, EN GÜZEL GÜNE</p>
      <h2 id="envelopeTitle"></h2><p>Sizin için bir davetiye var.</p></div>
    <button type="button" class="envelope-open" aria-label="Zarfı aç ve davetiyeyi görüntüle">
      <span class="envelope-paper">
        <img id="envelopePaperImage" alt="Davetiye görseliniz" hidden>
        <span class="envelope-paper-fallback"><span id="envelopePaperNames"></span><span class="envelope-paper-message">Sevgiyle davetlisiniz</span></span>
      </span>
      <span class="envelope-pocket"></span><span class="envelope-flap"></span>
      <span class="envelope-seal" id="envelopeSeal"></span>
    </button>
    <p class="envelope-hint">AÇMAK İÇİN MÜHRE DOKUNUN</p>`;
  const audio = document.createElement('audio');
  audio.id = 'invitationMusic';
  audio.loop = true;
  audio.preload = 'none';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'invitation-music-toggle';
  toggle.hidden = true;
  const musicStatus = document.createElement('span');
  musicStatus.className = 'music-status';
  musicStatus.setAttribute('role', 'status');
  document.body.append(envelope, audio, toggle, musicStatus);
  const content = document.querySelector('body > .container');
  const loading = document.createElement('p');
  loading.className = 'invitation-loading-message';
  loading.setAttribute('role', 'status');
  loading.textContent = 'Davetiyeniz hazırlanıyor…';
  document.body.append(loading);
  const openButton = envelope.querySelector('button');
  const paper = envelope.querySelector('.envelope-paper');
  const paperImage = document.getElementById('envelopePaperImage');
  const paperFallback = envelope.querySelector('.envelope-paper-fallback');
  let imageSource = '';
  let closingTimer = null;
  let source = '';
  let opening = false;
  let floatingCard = null;

  function resetPresentation() {
    clearTimeout(closingTimer);
    floatingCard?.remove();
    floatingCard = null;
    envelope.classList.remove('is-opening', 'is-presenting', 'is-turning');
  }

  function presentCard() {
    const rect = paper.getBoundingClientRect();
    floatingCard = document.createElement('div');
    floatingCard.className = 'invitation-card-flight';
    floatingCard.setAttribute('aria-hidden', 'true');
    const turner = document.createElement('div');
    turner.className = 'invitation-card-turner';
    const front = document.createElement('div');
    front.className = 'invitation-card-front';
    if (!paperImage.hidden && paperImage.naturalWidth) {
      const img = document.createElement('img');
      img.src = paperImage.src;
      img.alt = '';
      front.append(img);
    } else {
      const fallback = paperFallback.cloneNode(true);
      fallback.removeAttribute('hidden');
      fallback.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
      front.append(fallback);
    }
    const back = document.createElement('div');
    back.className = 'invitation-card-back';
    const names = document.createElement('span');
    names.textContent = document.getElementById('envelopePaperNames').textContent;
    back.append(names);
    turner.append(front, back);
    floatingCard.append(turner);
    envelope.append(floatingCard);
    const ratio = !paperImage.hidden && paperImage.naturalWidth ? paperImage.naturalWidth / paperImage.naturalHeight : 210 / 297;
    const width = Math.min(520, innerWidth - 40, (innerHeight - 64) * ratio);
    const height = width / ratio;
    const finalBox = { left: `${(innerWidth - width) / 2}px`, top: `${(innerHeight - height) / 2}px`, width: `${width}px`, height: `${height}px` };
    Object.assign(floatingCard.style, finalBox);
    floatingCard.animate([
      { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` },
      finalBox
    ], { duration: 650, easing: 'cubic-bezier(.22,.7,.2,1)' });
    envelope.classList.add('is-presenting');
    // The enlarged invitation stays still for 1.6 seconds before turning.
    closingTimer = setTimeout(() => {
      envelope.classList.add('is-turning');
      closingTimer = setTimeout(finishOpening, 950);
    }, 2250);
  }

  function showPaperImage(ready) {
    paperImage.hidden = !ready;
    paperFallback.hidden = ready;
    paper.classList.toggle('has-image', ready);
  }
  paperImage.addEventListener('load', () => showPaperImage(paperImage.naturalWidth > 0));
  paperImage.addEventListener('error', () => showPaperImage(false));

  function syncToggle() {
    toggle.textContent = audio.paused ? '♫ Müziği çal' : 'Ⅱ Müziği durdur';
    toggle.setAttribute('aria-label', audio.paused ? 'Davetiye müziğini çal' : 'Davetiye müziğini durdur');
    toggle.setAttribute('aria-pressed', String(!audio.paused));
  }
  async function play() {
    if (!source) return;
    musicStatus.textContent = '';
    try { await audio.play(); }
    catch (error) {
      if (error.name !== 'AbortError') musicStatus.textContent = 'Müzik başlamadı. Müziği çal düğmesini deneyin.';
    }
    syncToggle();
  }
  function finishOpening() {
    envelope.hidden = true;
    resetPresentation();
    opening = false;
    document.body.classList.remove('envelope-visible');
    if (content) content.inert = false;
    const title = document.getElementById('eventCalligraphyTitle');
    title?.setAttribute('tabindex', '-1');
    title?.focus({ preventScroll: true });
  }
  openButton.addEventListener('click', () => {
    if (opening) return;
    opening = true;
    // Start playback directly from the tap, before awaiting any animation.
    play();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishOpening();
      return;
    }
    envelope.classList.add('is-opening');
    closingTimer = setTimeout(presentCard, 1150);
  });
  envelope.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    event.preventDefault();
    if (!toggle.hidden) toggle.focus();
    else openButton.focus();
  });
  toggle.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !envelope.hidden) {
      event.preventDefault();
      openButton.focus();
    }
  });
  toggle.addEventListener('click', () => audio.paused ? play() : audio.pause());
  audio.addEventListener('play', syncToggle);
  audio.addEventListener('pause', syncToggle);
  audio.addEventListener('error', () => {
    if (source) musicStatus.textContent = 'Müzik yüklenemedi. Davetiyeyi görüntülemeye devam edebilirsiniz.';
    syncToggle();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
  });
  window.addEventListener('pagehide', () => audio.pause());

  window.invitationExperience = {
    pause: () => audio.pause(),
    fail(message) { loading.textContent = message; },
    configure(event, showEnvelope = false) {
      loading.hidden = true;
      document.body.classList.remove('invitation-loading');
      if (content) content.hidden = false;
      const nextSource = event.music_url || '';
      if (source !== nextSource) {
        audio.pause();
        source = nextSource;
        if (source) audio.src = source;
        else audio.removeAttribute('src');
        audio.load();
        musicStatus.textContent = '';
      }
      audio.volume = Math.max(0, Math.min(1, Number(event.music_volume ?? 0.15)));
      toggle.hidden = !source;
      syncToggle();
      document.getElementById('envelopeTitle').textContent = event.couple_names || event.title;
      document.getElementById('envelopePaperNames').textContent = event.couple_names || event.title;
      const nextImage = event.invitation_image_url || '';
      if (nextImage !== imageSource) {
        imageSource = nextImage;
        showPaperImage(false);
        if (imageSource) paperImage.src = imageSource;
        else paperImage.removeAttribute('src');
      }
      document.getElementById('envelopeSeal').textContent = event.crest_text || getInitials(event.couple_names || event.title);
      applyInvitationContent(event);
      if (!showEnvelope) return;
      resetPresentation();
      audio.pause();
      opening = false;
      envelope.hidden = false;
      document.body.classList.add('envelope-visible');
      if (content) content.inert = true;
      openButton.focus({ preventScroll: true });
    }
  };
})();
