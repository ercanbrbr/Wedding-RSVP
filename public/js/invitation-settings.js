const invitationSettings = {
  text: [
    ['hero_eyebrow', 'İsimlerin üzerindeki yazı', 'BİRLİKTE, EN GÜZEL GÜNE', '.invitation-hero-copy > .invitation-eyebrow'],
    ['hero_cta', 'İsimlerin altındaki düğme', 'Bizimle kutlayın', '.hero-rsvp-link .button-copy'],
    ['cover_label', 'Küçük davetiye düğmesi', 'Davetiyeyi gör', '.image-overlay-hint .button-copy'],
    ['countdown', 'Sayaç başlığı', 'O GÜNE SAYILI ANLAR', '.invitation-countdown > .invitation-eyebrow'],
    ['gathering_eyebrow', 'Tarih ve mekân üst yazısı', 'BULUŞACAĞIMIZ AN', '.invitation-section-heading > .invitation-eyebrow'],
    ['gathering_title', 'Tarih ve mekân başlığı', 'Aynı yerde,\naynı mutlulukta.', '#gatheringTitle'],
    ['when', 'Tarih etiketi', 'NE ZAMAN', '.hero-info-row:first-child > .invitation-detail-label'],
    ['where', 'Mekân etiketi', 'NEREDE', '.hero-info-row:nth-child(2) > .invitation-detail-label'],
    ['dress', 'Giyim etiketi', 'GİYİM NOTU', '#dressCodeContainer > .invitation-detail-label'],
    ['schedule_eyebrow', 'Program üst yazısı', 'HER ANINI BİRLİKTE', '#timelineSection > .invitation-eyebrow'],
    ['schedule_title', 'Program başlığı', 'Günün akışı', '#scheduleTitle'],
    ['note_eyebrow', 'Not başlığı', 'SİZE BİR NOTUMUZ VAR', '#descriptionContainer .invitation-eyebrow'],
    ['rsvp_eyebrow', 'Katılım üst yazısı', 'BU HİKÂYEDE SİZ DE OLUN', '.invitation-rsvp-intro > .invitation-eyebrow'],
    ['rsvp_title', 'Katılım başlığı', 'Sizinle daha güzel.', '.invitation-rsvp-intro > h2'],
    ['rsvp_message', 'Katılım açıklaması', 'Yeriniz bizde hazır.\nGeleceğinizi bilmek bizi çok mutlu eder.', '.invitation-rsvp-intro > p:last-child'],
    ['rsvp_cta', 'Katılım düğmesi', 'Yanıtınızı iletin', '.reply-label-closed'],
    ['footer', 'İmza üst yazısı', 'Sevgiyle,', '.invitation-footer > span:first-child'],
    ['envelope_eyebrow', 'Zarf üst yazısı', 'BİRLİKTE, EN GÜZEL GÜNE', '.envelope-eyebrow'],
    ['envelope_message', 'Zarf açıklaması', 'Sizin için bir davetiye var.', '.envelope-heading > p:last-child'],
    ['envelope_hint', 'Zarf dokunma açıklaması', 'AÇMAK İÇİN MÜHRE DOKUNUN', '.envelope-hint'],
    ['envelope_card', 'Görselsiz kart yazısı', 'Sevgiyle davetlisiniz', '.envelope-paper-message']
  ],
  toggles: [
    ['show_countdown', 'Geri sayımı göster', '.invitation-countdown'],
    ['show_gathering', 'Tarih ve mekân bölümünü göster', '.invitation-gathering'],
    ['show_schedule', 'Program bölümünü göster', '#timelineSection'],
    ['show_footer', 'Alttaki imzayı göster', '.invitation-footer'],
    ['show_arch', 'İsimlerin etrafındaki kemeri göster', null]
  ]
};
const invitationDefaultMarkup = new WeakMap();
const invitationEditFields = [
  ['event_date', 'Tarih ve saat', '#eventDateStr, #eventTimeStr, #heroDateCaption', 'editDesignDate', 40],
  ['couple_names', 'Çift isimleri', '#eventCalligraphyTitle, #invitationSignoff, #envelopeTitle, #envelopePaperNames', 'editDesignNames', 150],
  ['invitation_subtitle', 'İsimlerin altındaki yazı', '#eventSubtitle', 'editInvitationSubtitle', 150],
  ['crest_text', 'Amblem metni', '#crestMonogram, #envelopeSeal', 'editCrestText', 100],
  ['welcome_message', 'Karşılama mesajı', '#welcomeMessageText', 'editWelcomeMessage', 3000],
  ['location', 'Mekân', '#eventLocation', 'editDesignLocation', 300],
  ['description', 'Size bir notumuz var', '#eventDescription', 'editDesignDescription', 3000],
  ['dress_code', 'Giyim notu', '#dressCodeBadge', 'editDressCode', 300],
  ...invitationSettings.text.map(([key, label, fallback, selector]) => [`copy:${key}`, label, selector, `copy_${key}`, 400])
];
function invitationContent(event) {
  try { return typeof event.invitation_content === 'string' ? JSON.parse(event.invitation_content) : (event.invitation_content || {}); }
  catch { return {}; }
}
function applyInvitationContent(event) {
  const values = invitationContent(event);
  for (const [key, , fallback, selector] of invitationSettings.text) {
    const element = document.querySelector(selector);
    if (!element) continue;
    if (!invitationDefaultMarkup.has(element)) invitationDefaultMarkup.set(element, element.innerHTML);
    if (values[key] === undefined || values[key] === fallback) {
      // Only restore trusted markup captured from our own template.
      element.innerHTML = invitationDefaultMarkup.get(element);
    } else {
      element.textContent = values[key];
    }
    element.hidden = !element.textContent.trim();
  }
  for (const [key, , selector] of invitationSettings.toggles) {
    if (selector) document.querySelector(selector)?.toggleAttribute('hidden', values[key] === false);
  }
  document.body.dataset.ornament = values.ornament || 'floral';
  document.body.classList.toggle('hide-invitation-arch', values.show_arch === false);
}
if (typeof module !== 'undefined' && module.exports) module.exports = invitationSettings;
