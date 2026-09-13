(() => {
  const form = document.getElementById('createEventForm');
  if (!form) return;
  const dateFormat = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  function updatePreview() {
    document.getElementById('previewTitle').textContent = form.querySelector('#title').value.trim() || 'Sizin güzel hikâyeniz';
    document.getElementById('previewLocation').textContent = form.querySelector('#location').value.trim() || 'En güzel anılara, birlikte.';
    const value = form.querySelector('#event_date').value;
    const date = value ? new Date(value) : null;
    document.getElementById('previewDate').textContent = date && !Number.isNaN(date.getTime())
      ? dateFormat.format(date) : 'Birlikte kutlayacağımız o gün';
  }
  form.addEventListener('input', updatePreview);
  window.addEventListener('pageshow', updatePreview);
  updatePreview();
})();
