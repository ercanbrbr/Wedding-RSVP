const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');
const legacyToken = window.location.hash.startsWith('#token=')
  ? decodeURIComponent(window.location.hash.slice(7))
  : '';

if (legacyToken) {
  history.replaceState(null, '', '/admin/setup');
  document.getElementById('loginTitle').textContent = 'Güvenli Yönetici Hesabı Oluştur';
  document.getElementById('loginDescription').textContent = 'Eski yönetim bağlantınızı iptal etmek için yeni bir parola belirleyin.';
  document.getElementById('eventCodeGroup').style.display = 'none';
  document.getElementById('event_code').required = false;
  document.getElementById('confirmGroup').style.display = 'block';
  document.getElementById('password_confirm').required = true;
  document.getElementById('password').autocomplete = 'new-password';
  document.getElementById('loginButton').textContent = 'Parolayı Kaydet';
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.textContent = '';
  const button = document.getElementById('loginButton');
  const password = document.getElementById('password').value;
  if (legacyToken && password !== document.getElementById('password_confirm').value) {
    errorBox.textContent = 'Parolalar eşleşmiyor.';
    return;
  }
  button.disabled = true;
  try {
    const endpoint = legacyToken ? '/api/auth/legacy-setup' : '/api/auth/login';
    const payload = legacyToken
      ? { legacy_token: legacyToken, password }
      : { event_code: document.getElementById('event_code').value, password };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Giriş başarısız.');
    sessionStorage.setItem('adminCsrfToken', data.csrf_token);
    window.location.replace(data.admin_url || '/admin');
  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    button.disabled = false;
  }
});
