/* ===== API LAYER ===== */
const API = {
  token() { return localStorage.getItem('tdl_token'); },
  headers() {
    const h = { 'Content-Type': 'application/json' };
    const t = this.token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  },
  async req(method, path, body) {
    const res = await fetch('/api' + path, {
      method,
      headers: this.headers(),
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || t('server_error'));
      err.data = data;
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(path) { return this.req('GET', path); },
  post(path, body) { return this.req('POST', path, body); },
  put(path, body) { return this.req('PUT', path, body); },
  patch(path, body) { return this.req('PATCH', path, body); },
  del(path, body) { return this.req('DELETE', path, body); },
};

/* ===== STATE ===== */
let currentUser = null;
let currentFile = null;
let pollInterval = null;
const expandedMissions = new Set();
let applyWallpaper = null;
let applyAccent = null;
let currentLanguage = 'en';
let pendingVerificationEmail = '';
const LANGUAGES = {};

async function loadLanguageXml(lang) {
  if (LANGUAGES[lang]) return LANGUAGES[lang];
  try {
    const res = await fetch(`/locales/${lang}.xml`);
    if (!res.ok) throw new Error(`Could not load translations for ${lang}`);
    const xmlText = await res.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
    const parserError = xmlDoc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML parsing error: ${parserError.textContent}`);
    }
    const entries = xmlDoc.getElementsByTagName('entry');
    const dict = {};
    for (let i = 0; i < entries.length; i++) {
      const key = entries[i].getAttribute('key');
      const val = entries[i].textContent;
      dict[key] = val;
    }
    LANGUAGES[lang] = dict;
    return dict;
  } catch (err) {
    console.error(err);
    return {};
  }
}



function t(key, ...args) {
  const dict = LANGUAGES[currentLanguage] || LANGUAGES['en'] || {};
  let text = dict[key] || (LANGUAGES['en'] && LANGUAGES['en'][key]) || key;
  for (let i = 0; i < args.length; i++) {
    text = text.replace(`{${i}}`, args[i]);
  }
  return text;
}

/* ===== HELPERS ===== */
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10);
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  const locales = { fr: 'fr-FR', en: 'en-US', zh: 'zh-CN', ru: 'ru-RU' };
  return date.toLocaleDateString(locales[currentLanguage] || 'fr-FR', { day: 'numeric', month: 'short' });
}

function updateQuickEntryPlaceholder() {
  const qe = $('#quick-entry');
  if (!qe) return;
  if (currentFile) {
    const isShared = currentFile.sharedWith && currentFile.sharedWith.length > 0;
    qe.placeholder = isShared ? t('quick_entry_shared') : t('quick_entry_private');
  } else {
    qe.placeholder = t('quick_entry_private');
  }
}

async function updateLanguage(lang) {
  if (lang !== 'en' && lang !== 'fr' && lang !== 'zh' && lang !== 'ru') lang = 'en';
  await loadLanguageXml(lang);
  if (lang !== 'en') {
    await loadLanguageXml('en');
  }
  currentLanguage = lang;
  
  if (currentUser) {
    localStorage.setItem('tdl_lang_' + currentUser._id, lang);
  }
  
  const select = $('#settings-lang');
  if (select) select.value = lang;
  
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    el.textContent = t(key);
  });
  
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    const key = el.dataset.i18nHtml;
    el.innerHTML = t(key);
  });
  
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.dataset.i18nTitle;
    el.setAttribute('title', t(key));
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.dataset.i18nPlaceholder;
    el.setAttribute('placeholder', t(key));
  });

  setLegalModalLanguage(lang === 'fr' ? 'fr' : 'en');
  
  if (currentUser) {
    const greet = $('#user-greeting');
    if (greet) {
      if (currentLanguage === 'fr') greet.textContent = `Bonjour, ${currentUser.name}`;
      else if (currentLanguage === 'en') greet.textContent = `Hello, ${currentUser.name}`;
      else if (currentLanguage === 'zh') greet.textContent = `你好，${currentUser.name}`;
      else if (currentLanguage === 'ru') greet.textContent = `Привет, ${currentUser.name}`;
    }
  }

  updateQuickEntryPlaceholder();

  // Re-render active screen to update dynamic content translations
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen) {
    if (activeScreen.id === 'home-screen') {
      renderHome().catch(console.error);
    } else if (activeScreen.id === 'file-screen') {
      renderFolderDescription();
      renderMissionNotesView();
      renderSections();
    } else if (activeScreen.id === 'trash-screen') {
      renderTrash().catch(console.error);
    }
  }
}

function dateBadgeEmoji(cls) {
  if (cls === 'ok') return '😎';
  if (cls === 'warning') return '🤔';
  if (cls === 'urgent' || cls === 'overdue') return '🫪';
  return '📅';
}
function dateBadgeClass(d, done) {
  if (!d) return '';
  if (done) return 'done';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const deadline = new Date(d); deadline.setHours(0, 0, 0, 0);
  const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff < 3) return 'urgent';
  if (diff < 7) return 'warning';
  return 'ok';
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

function showScreen(id) {
  if (id === 'auth-screen') {
    resetAuthScreen();
  }
  // Instant switch — used only at first load / init, no animation
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active', 'anim-enter-up', 'anim-enter-left', 'anim-enter-right',
                        'anim-exit-down', 'anim-exit-left', 'anim-exit-right');
  });
  $(`#${id}`).classList.add('active');
}

let _transitioning = false;

/**
 * Animated screen transition.
 * @param {string} toId    — ID of the target screen
 * @param {string} direction — 'up' | 'left' | 'right' | 'down' (describes the visual movement)
 *   - 'up'    : auth → home  (new page rises from bottom)
 *   - 'left'  : home → file  (new page enters from right, old exits left)
 *   - 'right' : file → home  (new page enters from left, old exits right)
 *   - 'down'  : home → auth  (logout, old page drops down)
 */
function transitionTo(toId, direction) {
  if (_transitioning) return;

  if (toId === 'auth-screen') {
    resetAuthScreen();
  }

  const currentScreen = document.querySelector('.screen.active');
  const nextScreen = $(`#${toId}`);

  // Same screen or no current — instant switch
  if (!currentScreen || currentScreen === nextScreen) {
    showScreen(toId);
    return;
  }

  _transitioning = true;
  document.body.classList.add('screen-transitioning');

  // Determine animation class pairs
  const exitMap  = { up: 'anim-exit-down',  left: 'anim-exit-left', right: 'anim-exit-right', down: 'anim-exit-down'  };
  const enterMap = { up: 'anim-enter-up',   left: 'anim-enter-left', right: 'anim-enter-right', down: 'anim-enter-up' };

  const exitClass  = exitMap[direction]  || 'anim-exit-left';
  const enterClass = enterMap[direction] || 'anim-enter-left';

  // Clean any leftover animation classes
  const allAnimClasses = ['anim-enter-up', 'anim-enter-left', 'anim-enter-right',
                          'anim-exit-down', 'anim-exit-left', 'anim-exit-right'];
  document.querySelectorAll('.screen').forEach(s => s.classList.remove(...allAnimClasses));

  // Show next screen and animate it in
  nextScreen.classList.add('active');
  nextScreen.classList.add(enterClass);

  // Animate current screen out
  currentScreen.classList.add(exitClass);

  const cleanup = () => {
    currentScreen.classList.remove('active', ...allAnimClasses);
    nextScreen.classList.remove(...allAnimClasses);
    document.body.classList.remove('screen-transitioning');
    _transitioning = false;
  };

  // When the enter animation ends, clean up everything
  let cleaned = false;
  const onEnterEnd = () => {
    if (cleaned) return;
    cleaned = true;
    nextScreen.removeEventListener('animationend', onEnterEnd);
    currentScreen.removeEventListener('animationend', onExitEnd);
    cleanup();
  };
  const onExitEnd = () => {
    currentScreen.removeEventListener('animationend', onExitEnd);
    // Exit finished but enter might still be going — do nothing, let enter handle it
  };
  currentScreen.addEventListener('animationend', onExitEnd);
  nextScreen.addEventListener('animationend', onEnterEnd);

  // Safety timeout
  setTimeout(() => {
    if (!cleaned) {
      cleaned = true;
      cleanup();
    }
  }, 600);
}

function setLoading(btnId, loading) {
  const btn = $(`#${btnId}`);
  if (!btn) return;
  btn.disabled = loading;
  btn.style.opacity = loading ? '0.6' : '1';
}

/* ===== AUTH ===== */
function resetAuthScreen() {
  document.querySelectorAll('#auth-screen input').forEach(input => {
    input.value = '';
  });
  document.querySelectorAll('#auth-screen .auth-error').forEach(el => {
    el.textContent = '';
  });
  const forgotMsg = $('#forgot-msg');
  if (forgotMsg) {
    forgotMsg.textContent = '';
    forgotMsg.style.color = '';
  }
  document.querySelectorAll('#auth-screen .auth-form').forEach(form => {
    if (form.id === 'login-form') {
      form.classList.remove('hidden');
    } else {
      form.classList.add('hidden');
    }
  });
}

$('#show-register').addEventListener('click', e => { e.preventDefault(); $('#login-form').classList.add('hidden'); $('#forgot-form').classList.add('hidden'); const vp = $('#verify-pending-form'); if (vp) vp.classList.add('hidden'); $('#register-form').classList.remove('hidden'); });
$('#show-login').addEventListener('click', e => { e.preventDefault(); $('#register-form').classList.add('hidden'); $('#forgot-form').classList.add('hidden'); const vp = $('#verify-pending-form'); if (vp) vp.classList.add('hidden'); $('#login-form').classList.remove('hidden'); });
$('#show-forgot').addEventListener('click', e => { e.preventDefault(); $('#login-form').classList.add('hidden'); $('#register-form').classList.add('hidden'); const vp = $('#verify-pending-form'); if (vp) vp.classList.add('hidden'); $('#forgot-form').classList.remove('hidden'); $('#forgot-email').focus(); });
$('#forgot-back').addEventListener('click', e => { e.preventDefault(); $('#forgot-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); });
const vBack = $('#verify-back-login');
if (vBack) vBack.addEventListener('click', e => { e.preventDefault(); $('#verify-pending-form').classList.add('hidden'); $('#login-form').classList.remove('hidden'); });

$('#auth-brand-link').addEventListener('click', () => { transitionTo('about-screen', 'left'); });
$('#about-back-btn').addEventListener('click', () => { transitionTo('auth-screen', 'right'); });

/* ===== LEGAL & TERMS MODAL ===== */
function setLegalModalLanguage(lang) {
  const modal = $('#terms-modal');
  if (!modal) return;
  const targetLang = (lang === 'fr') ? 'fr' : 'en';
  modal.setAttribute('data-legal-lang', targetLang);
  document.querySelectorAll('.legal-lang-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.legalLang === targetLang);
  });
}

function openLegalModal(tabId = 'tab-cgu') {
  const overlay = $('#terms-modal-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  
  const defaultLang = (currentLanguage === 'fr') ? 'fr' : 'en';
  setLegalModalLanguage(defaultLang);

  document.querySelectorAll('.legal-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.legal-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === tabId);
  });
  const container = $('.legal-content-container');
  if (container) container.scrollTop = 0;
}

function closeLegalModal() {
  const overlay = $('#terms-modal-overlay');
  if (overlay) overlay.classList.remove('active');
}

document.addEventListener('click', e => {
  const termsLink = e.target.closest('#open-terms-link');
  if (termsLink) {
    e.preventDefault();
    openLegalModal('tab-cgu');
    return;
  }
  const privacyLink = e.target.closest('#open-privacy-link');
  if (privacyLink) {
    e.preventDefault();
    openLegalModal('tab-privacy');
    return;
  }
  const authLegalLink = e.target.closest('#auth-legal-link') || e.target.closest('#about-legal-link');
  if (authLegalLink) {
    e.preventDefault();
    openLegalModal('tab-cgu');
    return;
  }
});

$('#terms-modal-close')?.addEventListener('click', closeLegalModal);
$('#terms-modal-ok')?.addEventListener('click', closeLegalModal);
$('#terms-modal-overlay')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeLegalModal();
});

document.querySelectorAll('.legal-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.dataset.tab;
    document.querySelectorAll('.legal-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.legal-tab-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const pane = $(`#${targetTab}`);
    if (pane) pane.classList.add('active');
    const container = $('.legal-content-container');
    if (container) container.scrollTop = 0;
  });
});

document.querySelectorAll('.legal-lang-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.legalLang;
    setLegalModalLanguage(lang);
  });
});

$('#register-form').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#register-name').value.trim();
  const email = $('#register-email').value.trim().toLowerCase();
  const password = $('#register-password').value;
  const hpInput = $('#register-hp');
  const website_hp = hpInput ? hpInput.value : '';
  const termsCheckbox = $('#register-terms');
  if (termsCheckbox && !termsCheckbox.checked) {
    $('#register-error').textContent = t('terms_required') || 'Veuillez accepter les Conditions d\'Utilisation et la Politique de Confidentialité.';
    return;
  }
  $('#register-error').textContent = '';
  setLoading('register-btn', true);
  try {
    const data = await API.post('/auth/register', { name, email, password, termsAccepted: true, website_hp });
    if (data.requiresVerification) {
      pendingVerificationEmail = email;
      $('#register-form').classList.add('hidden');
      $('#verify-pending-form').classList.remove('hidden');
      const descTpl = t('check_email_desc_user');
      $('#verify-pending-desc').textContent = descTpl ? descTpl.replace('{0}', email) : `Un lien de confirmation a été envoyé à ${email}. Veuillez cliquer dessus pour activer votre compte.`;
      if (data.devVerifyLink) {
        $('#dev-verify-banner').style.display = 'block';
        $('#dev-verify-link').href = data.devVerifyLink;
      } else {
        $('#dev-verify-banner').style.display = 'none';
      }
      $('#register-name').value = '';
      $('#register-password').value = '';
      if (termsCheckbox) termsCheckbox.checked = false;
    } else {
      localStorage.setItem('tdl_token', data.token);
      currentUser = data.user;
      enterApp();
    }
  } catch (err) {
    $('#register-error').textContent = t(err.message);
  } finally {
    setLoading('register-btn', false);
  }
});

async function triggerResendVerification(email) {
  if (!email) return;
  try {
    const res = await API.post('/auth/resend-verification', { email });
    toast(t(res.message) || res.message);
    if (res.devVerifyLink) {
      $('#dev-verify-banner').style.display = 'block';
      $('#dev-verify-link').href = res.devVerifyLink;
      $('#login-form').classList.add('hidden');
      $('#verify-pending-form').classList.remove('hidden');
    }
  } catch (err) {
    toast(t('error_prefix') + t(err.message));
  }
}

const resendBtn = $('#resend-verification-btn');
if (resendBtn) {
  resendBtn.addEventListener('click', async () => {
    if (!pendingVerificationEmail) return;
    setLoading('resend-verification-btn', true);
    $('#verify-pending-msg').textContent = '';
    try {
      const res = await API.post('/auth/resend-verification', { email: pendingVerificationEmail });
      toast(t(res.message) || res.message);
      if (res.devVerifyLink) {
        $('#dev-verify-banner').style.display = 'block';
        $('#dev-verify-link').href = res.devVerifyLink;
      }
    } catch (err) {
      $('#verify-pending-msg').textContent = t(err.message);
    } finally {
      setLoading('resend-verification-btn', false);
    }
  });
}

$('#login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#login-email').value.trim().toLowerCase();
  const password = $('#login-password').value;
  $('#login-error').innerHTML = '';
  setLoading('login-btn', true);
  try {
    const data = await API.post('/auth/login', { email, password });
    localStorage.setItem('tdl_token', data.token);
    currentUser = data.user;
    enterApp();
  } catch (err) {
    if (err.data && err.data.unverified) {
      pendingVerificationEmail = email;
      const resendLinkText = t('resend_verification_link') || 'Renvoyer le lien de confirmation';
      $('#login-error').innerHTML = `${esc(t(err.message))} <br><a href="#" id="login-resend-link" style="color:var(--accent);text-decoration:underline;display:inline-block;margin-top:0.4rem;font-weight:600;">${esc(resendLinkText)}</a>`;
      const resendEl = $('#login-resend-link');
      if (resendEl) {
        resendEl.addEventListener('click', async (evt) => {
          evt.preventDefault();
          await triggerResendVerification(email);
        });
      }
    } else {
      $('#login-error').textContent = t(err.message);
    }
  } finally {
    setLoading('login-btn', false);
  }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await API.post('/auth/logout'); } catch (_) {}
  localStorage.removeItem('tdl_token');
  currentUser = null;
  currentFile = null;
  disconnectRealTime();
  stopPolling();
  // Reset personalization settings back to default on logout
  if (applyWallpaper) applyWallpaper({ type: 'default' }, false);
  if (applyAccent) applyAccent('#6C5CE7', false);
  applyTheme(localStorage.getItem('tdl_theme') || 'dark', false);
  transitionTo('auth-screen', 'down');
});

async function enterApp() {
  // Apply language settings for this user (cached locally or from DB)
  let userLang = localStorage.getItem('tdl_lang_' + currentUser._id);
  if (!userLang && currentUser.language) {
    userLang = currentUser.language;
  }
  await updateLanguage(userLang || 'en');

  // Apply theme settings for this user (cached locally or from DB)
  let userTheme = localStorage.getItem('tdl_theme_' + currentUser._id);
  if (!userTheme && currentUser.theme) {
    userTheme = currentUser.theme;
  }
  applyTheme(userTheme || 'dark', false);

  // Apply personalized settings for this user (cached locally per user, or from DB)
  if (applyWallpaper) {
    let wp = localStorage.getItem('tdl_wallpaper_' + currentUser._id);
    if (!wp && currentUser.wallpaper) {
      wp = currentUser.wallpaper;
    }
    if (wp) {
      try {
        applyWallpaper(JSON.parse(wp), false);
      } catch (_) {
        applyWallpaper({ type: 'default' }, false);
      }
    } else {
      applyWallpaper({ type: 'default' }, false);
    }
  }

  if (applyAccent) {
    let acc = localStorage.getItem('tdl_accent_' + currentUser._id);
    if (!acc && currentUser.accent) {
      acc = currentUser.accent;
    }
    if (acc) {
      applyAccent(acc, false);
    } else {
      applyAccent('#6C5CE7', false);
    }
  }

  initRealTimeConnection();
  renderHome();
  transitionTo('home-screen', 'up');
}

/* ===== FORGOT PASSWORD ===== */
$('#forgot-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#forgot-email').value.trim();
  const msgEl = $('#forgot-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';
  setLoading('forgot-btn', true);
  try {
    const data = await API.post('/auth/forgot-password', { email });
    msgEl.style.color = 'var(--accent-light)';
    msgEl.textContent = '✓ ' + data.message + ' Please check your email (and spam folder).';
    $('#forgot-email').value = '';
  } catch (err) {
    msgEl.textContent = err.message;
  } finally {
    setLoading('forgot-btn', false);
  }
});

$('#reset-form').addEventListener('submit', async e => {
  e.preventDefault();
  const password = $('#reset-password').value;
  const confirm = $('#reset-confirm').value;
  const msgEl = $('#reset-msg');
  msgEl.textContent = '';
  msgEl.style.color = '';
  if (password !== confirm) { msgEl.textContent = 'Passwords do not match.'; return; }
  const token = new URLSearchParams(window.location.search).get('reset_token');
  if (!token) { msgEl.textContent = 'Missing token. Please request a new password reset.'; return; }
  setLoading('reset-btn', true);
  try {
    const data = await API.post(`/auth/reset-password/${token}`, { password });
    msgEl.style.color = 'var(--accent-light)';
    msgEl.textContent = '✓ ' + data.message;
    // Effacer le token de l’URL et rediriger vers login après 2s
    setTimeout(() => {
      window.history.replaceState({}, '', '/');
      $('#reset-form').classList.add('hidden');
      $('#login-form').classList.remove('hidden');
      $('#reset-password').value = ''; $('#reset-confirm').value = '';
    }, 2000);
  } catch (err) {
    msgEl.textContent = err.message;
  } finally {
    setLoading('reset-btn', false);
  }
});

/* ===== AUTO-LOGIN ===== */
(async function init() {
  await updateLanguage('en');

  // Détection du token de vérification d'e-mail dans l'URL
  const verifyToken = new URLSearchParams(window.location.search).get('verify_token');
  if (verifyToken) {
    showScreen('auth-screen');
    window.history.replaceState({}, document.title, window.location.pathname);
    try {
      const data = await API.post('/auth/verify-email/' + verifyToken);
      currentUser = data.user;
      if (data.token) localStorage.setItem('tdl_token', data.token);
      toast(t('account_verified_success') || 'Compte validé avec succès ! Bienvenue !');
      await enterApp();
      return;
    } catch (err) {
      $('#login-error').textContent = t(err.message) || err.message;
      return;
    }
  }

  // Détection du token de réinitialisation dans l'URL
  const resetToken = new URLSearchParams(window.location.search).get('reset_token');
  if (resetToken) {
    showScreen('auth-screen');
    $('#login-form').classList.add('hidden');
    $('#reset-form').classList.remove('hidden');
    return;
  }
  try {
    const data = await API.get('/auth/me');
    currentUser = data.user;
    await enterApp();
  } catch {
    localStorage.removeItem('tdl_token');
    showScreen('auth-screen');
  }
})();

/* ===== HOME ===== */
async function renderHome() {
  stopPolling();
  const grid = $('#files-grid');
  grid.innerHTML = `<div style="color:var(--text-dim);padding:2rem;text-align:center;">${t('loading')}</div>`;
  try {
    const { files } = await API.get('/files');
    const { trash } = await API.get('/trash');
    let html = `<div class="file-card trash-card" data-action="trash">
      <div class="file-card-name">${t('trash_title')}</div>
      <div class="file-card-meta">${t('items_count', trash.length)}</div>
    </div>`;
    files.forEach(f => {
      const total = countTasks(f), done = countDone(f);
      const isOwner = f.ownerId._id === currentUser._id || f.ownerId === currentUser._id;
      const collab = f.sharedWith && f.sharedWith.length > 0 ? `👥 ${f.sharedWith.length + 1}` : '';
      html += `<div class="file-card" data-id="${f._id}">
        <div class="file-card-actions">
          ${isOwner ? `<button class="icon-btn" data-edit="${f._id}" title="${t('edit')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>` : ''}
          ${isOwner ? `<button class="icon-btn" data-share="${f._id}" title="${t('share')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg></button>` : ''}
          ${isOwner ? `<button class="icon-btn danger" data-delete="${f._id}" title="${t('delete')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>` : ''}
        </div>
        <div class="file-card-name">${f.emoji ? esc(f.emoji) + ' ' : ''}${esc(f.name)}${collab ? ` <span style="font-size:0.75rem;opacity:0.7;">${collab}</span>` : ''}</div>
        <div class="file-card-meta">${t('missions_status', total, done)}</div>
      </div>`;
    });
    grid.innerHTML = html;
    grid.querySelectorAll('.file-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-edit]')) { openEditModal(e.target.closest('[data-edit]').dataset.edit, files); return; }
        if (e.target.closest('[data-share]')) { openShareModal(e.target.closest('[data-share]').dataset.share, files); return; }
        if (e.target.closest('[data-delete]')) { deleteFile(e.target.closest('[data-delete]').dataset.delete); return; }
        if (card.dataset.action === 'trash') { openTrash(); return; }
        if (card.dataset.id) {
          const f = files.find(x => x._id === card.dataset.id);
          if (f) openFile(f);
        }
      });
    });
  } catch (err) {
    grid.innerHTML = `<p style="color:var(--text-dim)">${esc(err.message)}</p>`;
  }
}

function countTasks(f) { return (f.sections || []).reduce((s, sec) => s + sec.missions.length, 0); }
function countDone(f) { return (f.sections || []).reduce((s, sec) => s + sec.missions.filter(m => m.done).length, 0); }

/* ===== NEW FILE MODAL ===== */
$('#add-file-btn').addEventListener('click', () => {
  $('#modal-overlay').classList.add('active');
  $('#new-file-name').value = '';
  // Reset emoji selection
  document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
  document.querySelector('.emoji-opt[data-emoji=""]').classList.add('selected');
  setTimeout(() => $('#new-file-name').focus(), 100);
});

// Emoji picker selection
document.querySelectorAll('.emoji-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});
$('#modal-cancel').addEventListener('click', () => $('#modal-overlay').classList.remove('active'));
$('#modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#modal-overlay').classList.remove('active'); });

$('#modal-confirm').addEventListener('click', async () => {
  const name = $('#new-file-name').value.trim();
  if (!name) return;
  const selectedEmoji = document.querySelector('.emoji-opt.selected');
  const emoji = selectedEmoji ? selectedEmoji.dataset.emoji : '';
  try {
    await API.post('/files', { name, emoji });
    $('#modal-overlay').classList.remove('active');
    toast(t('file_created'));
    renderHome();
  } catch (err) { toast(t('error_prefix') + t(err.message)); }
});
$('#new-file-name').addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter') { e.preventDefault(); $('#modal-confirm').click(); }
});

/* ===== EDIT FILE MODAL ===== */
let editFileId = null;

function openEditModal(fid, files) {
  const f = files.find(x => x._id === fid);
  if (!f) return;
  editFileId = fid;
  $('#edit-file-name').value = f.name;
  // Pre-select current emoji
  document.querySelectorAll('.edit-emoji-opt').forEach(b => {
    b.classList.toggle('selected', b.dataset.emoji === (f.emoji || ''));
  });
  $('#edit-modal-overlay').classList.add('active');
  setTimeout(() => $('#edit-file-name').focus(), 100);
}

document.querySelectorAll('.edit-emoji-opt').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.edit-emoji-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

$('#edit-modal-cancel').addEventListener('click', () => $('#edit-modal-overlay').classList.remove('active'));
$('#edit-modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#edit-modal-overlay').classList.remove('active'); });

$('#edit-modal-confirm').addEventListener('click', async () => {
  const name = $('#edit-file-name').value.trim();
  if (!name || !editFileId) return;
  const sel = document.querySelector('.edit-emoji-opt.selected');
  const emoji = sel ? sel.dataset.emoji : '';
  try {
    await API.put(`/files/${editFileId}`, { name, emoji });
    $('#edit-modal-overlay').classList.remove('active');
    toast(t('file_modified'));
    renderHome();
  } catch (err) { toast(t('error_prefix') + t(err.message)); }
});
$('#edit-file-name').addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Enter') { e.preventDefault(); $('#edit-modal-confirm').click(); }
});

/* ===== DELETE FILE ===== */
async function deleteFile(id) {
  try {
    await API.del(`/files/${id}`);
    toast(t('file_deleted'));
    renderHome();
  } catch (err) { toast(t('error_prefix') + t(err.message)); }
}

/* ===== SHARE MODAL ===== */
let shareFileId = null;
function openShareModal(fid, files) {
  shareFileId = fid;
  const f = files.find(x => x._id === fid);
  if (!f) return;
  $('#share-file-name').textContent = t('file_prefix', f.name);
  $('#share-email').value = '';
  renderSharedUsers(f);
  $('#share-overlay').classList.add('active');
}
$('#share-close').addEventListener('click', () => $('#share-overlay').classList.remove('active'));
$('#share-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) $('#share-overlay').classList.remove('active'); });

$('#share-add-btn').addEventListener('click', async () => {
  const email = $('#share-email').value.trim().toLowerCase();
  if (!email) return;
  try {
    const { file } = await API.post(`/files/${shareFileId}/share`, { email });
    $('#share-email').value = '';
    renderSharedUsers(file);
    toast(t('access_granted', email));
    renderHome();
  } catch (err) { toast(t('error_prefix') + t(err.message)); }
});

function renderSharedUsers(f) {
  const list = $('#shared-users-list');
  const shared = f.sharedWith || [];
  if (shared.length === 0) { list.innerHTML = `<p style="color:var(--text-dim);font-size:0.82rem;">${t('no_collaborators')}</p>`; return; }
  list.innerHTML = shared.map(u => {
    const uid = u._id || u;
    const label = u.name ? `${u.name} (${u.email})` : u.email || uid;
    return `<div class="shared-user"><span class="shared-user-email">${esc(label)}</span><button class="icon-btn danger" data-remove-share="${uid}" title="${t('remove')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>`;
  }).join('');
  list.querySelectorAll('[data-remove-share]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        const { file } = await API.del(`/files/${shareFileId}/share/${btn.dataset.removeShare}`);
        renderSharedUsers(file);
        toast(t('collaborator_removed'));
      } catch (err) { toast(t('error_prefix') + t(err.message)); }
    });
  });
}

/* ===== TRASH ===== */
async function openTrash() {
  await renderTrash();
  transitionTo('trash-screen', 'left');
}
$('#trash-back-btn').addEventListener('click', () => { transitionTo('home-screen', 'right'); renderHome(); });

$('#empty-trash-btn').addEventListener('click', async () => {
  try {
    await API.del('/trash');
    toast(t('trash_emptied'));
    renderTrash();
  } catch (err) { toast(t('error_prefix') + t(err.message)); }
});

async function renderTrash() {
  const container = $('#trash-content');
  const emptyEl = $('#trash-empty-state');
  try {
    const { trash } = await API.get('/trash');
    if (trash.length === 0) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
    emptyEl.classList.add('hidden');
    container.innerHTML = trash.map((item, i) => {
      let label, origin;
      if (item.type === 'file') {
        label = `📁 ${esc(item.data.name)}`;
        origin = t('deleted_file_label');
      } else if (item.type === 'subtask') {
        label = `↳ ${esc(item.data.text)}`;
        origin = t('subtask_origin_prefix', item.origin || '');
      } else {
        label = `✓ ${esc(item.data.text)}`;
        origin = t('origin_prefix', item.origin || '');
      }
      return `<div class="trash-item"><div class="trash-item-info"><span class="trash-item-name">${label}</span><span class="trash-item-origin">${esc(origin)}</span></div><button class="btn-restore" data-restore="${i}">${t('restore_btn')}</button></div>`;
    }).join('');
    container.querySelectorAll('[data-restore]').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await API.post(`/trash/restore/${btn.dataset.restore}`);
          toast(t('item_restored'));
          renderTrash();
        } catch (err) { toast(t('error_prefix') + t(err.message)); }
      });
    });
  } catch (err) { container.innerHTML = `<p style="color:var(--text-dim)">${esc(t(err.message))}</p>`; }
}

/* ===== FILE DETAIL & 3-COLUMN PANELS ===== */
let selectedMissionId = null;
let selectedSubtaskId = null;
let currentNotesInitialValue = '';

function openFile(f) {
  currentFile = f;
  selectedMissionId = null;
  selectedSubtaskId = null;
  currentNotesInitialValue = '';
  $('#file-title').textContent = (f.emoji ? f.emoji + ' ' : '') + f.name;
  $('#quick-entry').value = '';
  updateQuickEntryPlaceholder();
  renderFolderDescription();
  closeMissionNotes();
  renderSections();
  transitionTo('file-screen', 'left');
  setTimeout(() => $('#quick-entry').focus(), 100);
  joinFileRoom(f._id);
  startPolling();
}

/* --- Left Panel: Folder Description & Objectives --- */
function renderFolderDescription() {
  if (!currentFile) return;
  const countEl = $('#folder-stat-count');
  if (countEl) {
    const total = countTasks(currentFile);
    const done = countDone(currentFile);
    countEl.textContent = `${done} / ${total}`;
  }

  const editorEl = $('#folder-desc-editor');
  if (editorEl && !editorEl.classList.contains('hidden')) return;

  const emptyEl = $('#folder-desc-empty');
  const descEl = $('#folder-desc-text');
  const saveBtn = $('#save-folder-desc-btn');

  if (saveBtn) saveBtn.classList.add('hidden');

  const desc = (currentFile.description || '').trim();
  if (desc) {
    if (descEl) {
      descEl.textContent = currentFile.description;
      descEl.classList.remove('hidden');
    }
    if (emptyEl) emptyEl.classList.add('hidden');
  } else {
    if (descEl) descEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.remove('hidden');
  }
}

function startEditFolderDescription() {
  if (!currentFile) return;
  const emptyEl = $('#folder-desc-empty');
  const descEl = $('#folder-desc-text');
  const editorEl = $('#folder-desc-editor');
  const input = $('#folder-desc-input');
  const saveBtn = $('#save-folder-desc-btn');
  if (!input || !editorEl) return;

  if (!editorEl.classList.contains('hidden')) return;

  const currentDesc = currentFile.description || '';
  input.value = currentDesc;
  if (descEl) descEl.classList.add('hidden');
  if (emptyEl) emptyEl.classList.add('hidden');
  editorEl.classList.remove('hidden');
  if (saveBtn) saveBtn.classList.add('hidden');
  input.focus();
  input.select();
}

async function saveFolderDescription() {
  if (!currentFile) return;
  const input = $('#folder-desc-input');
  const editorEl = $('#folder-desc-editor');
  if (!input) return;
  const newDesc = input.value.trim().slice(0, 2000);
  if (newDesc !== (currentFile.description || '')) {
    try {
      const { file } = await API.put(`/files/${currentFile._id}`, { description: newDesc });
      currentFile.description = file.description;
      toast(t('description_saved'));
    } catch (err) {
      toast(t('error_prefix') + t(err.message));
    }
  }
  if (editorEl) editorEl.classList.add('hidden');
  renderFolderDescription();
}

function cancelFolderDescription() {
  const editorEl = $('#folder-desc-editor');
  if (editorEl) editorEl.classList.add('hidden');
  renderFolderDescription();
}

/* --- Right Panel: Mission & Subtask Notes & Details --- */
function findMissionById(mid) {
  if (!currentFile || !currentFile.sections) return null;
  for (const sec of currentFile.sections) {
    const m = sec.missions.find(x => x.id === mid);
    if (m) return { mission: m, section: sec };
  }
  return null;
}

function findSubtaskById(mid, stid) {
  if (!currentFile || !currentFile.sections) return null;
  for (const sec of currentFile.sections) {
    const m = sec.missions.find(x => x.id === mid);
    if (m && m.subtasks) {
      const st = m.subtasks.find(x => x.id === stid);
      if (st) return { subtask: st, parentMission: m, section: sec };
    }
  }
  return null;
}

function renderMissionNotesView() {
  const emptyEl = $('#mission-notes-empty');
  const emptySelectedEl = $('#mission-notes-empty-selected');
  const textEl = $('#mission-notes-text');
  const editorEl = $('#mission-notes-editor');
  const saveBtn = $('#save-mission-notes-btn');

  if (saveBtn) saveBtn.classList.add('hidden');
  if (editorEl) editorEl.classList.add('hidden');

  if (!selectedMissionId && !selectedSubtaskId) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (emptySelectedEl) emptySelectedEl.classList.add('hidden');
    if (textEl) textEl.classList.add('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');

  const notes = (currentNotesInitialValue || '').trim();
  if (notes) {
    if (textEl) {
      textEl.textContent = currentNotesInitialValue;
      textEl.classList.remove('hidden');
    }
    if (emptySelectedEl) emptySelectedEl.classList.add('hidden');
  } else {
    if (textEl) textEl.classList.add('hidden');
    if (emptySelectedEl) emptySelectedEl.classList.remove('hidden');
  }
}

function startEditMissionNotes() {
  if (!selectedMissionId && !selectedSubtaskId) return;
  const emptyEl = $('#mission-notes-empty');
  const emptySelectedEl = $('#mission-notes-empty-selected');
  const textEl = $('#mission-notes-text');
  const editorEl = $('#mission-notes-editor');
  const input = $('#mission-notes-input');
  const saveBtn = $('#save-mission-notes-btn');

  if (emptyEl) emptyEl.classList.add('hidden');
  if (emptySelectedEl) emptySelectedEl.classList.add('hidden');
  if (textEl) textEl.classList.add('hidden');
  if (editorEl) editorEl.classList.remove('hidden');

  if (input) {
    input.value = currentNotesInitialValue;
    input.focus();
    input.select();
  }
  if (saveBtn) saveBtn.classList.add('hidden');
}

function openMissionNotes(mid) {
  selectedMissionId = mid;
  selectedSubtaskId = null;
  const found = findMissionById(mid);
  if (!found) {
    closeMissionNotes();
    return;
  }

  const { mission } = found;
  const titleEl = $('#mission-sidebar-title');
  const statusEl = $('#mission-notes-status');
  const sidebar = $('#mission-sidebar-right');
  const overlay = $('#mission-sidebar-overlay');

  currentNotesInitialValue = mission.notes || '';
  if (titleEl) titleEl.textContent = mission.text;
  if (statusEl) statusEl.textContent = '';

  renderMissionNotesView();

  document.querySelectorAll('.mission-item').forEach(el => {
    if (el.dataset.mid === mid) el.classList.add('active-selected');
    else el.classList.remove('active-selected');
  });
  document.querySelectorAll('.subtask-item').forEach(el => el.classList.remove('active-selected'));

  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function openSubtaskNotes(mid, stid) {
  selectedMissionId = null;
  selectedSubtaskId = stid;
  const found = findSubtaskById(mid, stid);
  if (!found) {
    closeMissionNotes();
    return;
  }

  const { subtask, parentMission } = found;
  const titleEl = $('#mission-sidebar-title');
  const statusEl = $('#mission-notes-status');
  const sidebar = $('#mission-sidebar-right');
  const overlay = $('#mission-sidebar-overlay');

  currentNotesInitialValue = subtask.notes || '';
  if (titleEl) {
    titleEl.innerHTML = `<span style="display:block; font-size:0.75rem; color:var(--text-dim); font-weight:normal; margin-bottom:3px;">↳ ${esc(parentMission.text)}</span>${esc(subtask.text)}`;
  }
  if (statusEl) statusEl.textContent = '';

  renderMissionNotesView();

  document.querySelectorAll('.mission-item').forEach(el => el.classList.remove('active-selected'));
  document.querySelectorAll('.subtask-item').forEach(el => {
    if (el.dataset.stid === stid) el.classList.add('active-selected');
    else el.classList.remove('active-selected');
  });

  if (sidebar) sidebar.classList.add('open');
  if (overlay) overlay.classList.add('active');
}

function closeMissionNotes() {
  selectedMissionId = null;
  selectedSubtaskId = null;
  currentNotesInitialValue = '';
  const titleEl = $('#mission-sidebar-title');
  const sidebar = $('#mission-sidebar-right');
  const overlay = $('#mission-sidebar-overlay');

  if (titleEl) titleEl.textContent = '';
  renderMissionNotesView();

  document.querySelectorAll('.mission-item.active-selected, .subtask-item.active-selected').forEach(el => {
    el.classList.remove('active-selected');
  });

  if (sidebar) sidebar.classList.remove('open');
  if (overlay) overlay.classList.remove('active');
}

async function saveMissionNotes() {
  if (!currentFile) return;
  const input = $('#mission-notes-input');
  if (!input) return;
  const notesText = input.value.trim().slice(0, 2000);

  if (selectedSubtaskId) {
    let targetSt = null;
    for (const sec of currentFile.sections) {
      for (const m of sec.missions) {
        if (m.subtasks) {
          const st = m.subtasks.find(x => x.id === selectedSubtaskId);
          if (st) { targetSt = st; break; }
        }
      }
      if (targetSt) break;
    }
    if (!targetSt) return;
    targetSt.notes = notesText;
    try {
      await saveFile();
      currentNotesInitialValue = targetSt.notes || '';
      toast(t('notes_saved'));
      const btn = document.querySelector(`.btn-notes[data-stnotes="${selectedSubtaskId}"]`);
      if (btn) {
        if (notesText) btn.classList.add('has-notes');
        else btn.classList.remove('has-notes');
      }
      renderMissionNotesView();
    } catch (err) {
      toast(t('error_prefix') + t(err.message));
    }
  } else if (selectedMissionId) {
    const found = findMissionById(selectedMissionId);
    if (!found) return;
    found.mission.notes = notesText;
    try {
      await saveFile();
      currentNotesInitialValue = found.mission.notes || '';
      toast(t('notes_saved'));
      const btn = document.querySelector(`.btn-notes[data-notes="${selectedMissionId}"]`);
      if (btn) {
        if (notesText) btn.classList.add('has-notes');
        else btn.classList.remove('has-notes');
      }
      renderMissionNotesView();
    } catch (err) {
      toast(t('error_prefix') + t(err.message));
    }
  }
}

function startTitleEdit() {
  const wrapper = $('#file-title-wrapper');
  if (!wrapper || !currentFile) return;
  // Already editing?
  if (wrapper.querySelector('.file-title-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentFile.name;
  input.className = 'file-title-input';
  wrapper.innerHTML = '';
  wrapper.appendChild(input);
  input.focus();
  input.select();

  async function saveTitle() {
    const newName = input.value.trim();
    if (newName && newName !== currentFile.name) {
      try {
        const { file } = await API.put(`/files/${currentFile._id}`, { name: newName });
        currentFile = file;
        toast(t('title_modified'));
      } catch (err) { toast(t('error_prefix') + t(err.message)); }
    }
    wrapper.innerHTML = '';
    const h2 = document.createElement('h2');
    h2.id = 'file-title';
    h2.className = 'file-title-header';
    h2.title = t('click_to_rename');
    h2.textContent = (currentFile.emoji ? currentFile.emoji + ' ' : '') + currentFile.name;
    wrapper.appendChild(h2);
  }
  input.addEventListener('blur', saveTitle);
  input.addEventListener('keydown', e => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = currentFile.name; input.blur(); }
  });
}

// Delegation : clic sur le wrapper du titre (fonctionne même après innerHTML reset)
$('#file-title-wrapper').addEventListener('click', e => {
  if (e.target.classList.contains('file-title-header')) startTitleEdit();
});

// Event listeners for folder description
$('#folder-desc-empty')?.addEventListener('click', startEditFolderDescription);
$('#folder-desc-text')?.addEventListener('click', startEditFolderDescription);
$('#save-folder-desc-btn')?.addEventListener('click', saveFolderDescription);
$('#folder-desc-input')?.addEventListener('input', () => {
  const saveBtn = $('#save-folder-desc-btn');
  const input = $('#folder-desc-input');
  if (!saveBtn || !input) return;
  const currentDesc = (currentFile && currentFile.description) || '';
  if (input.value !== currentDesc) {
    saveBtn.classList.remove('hidden');
  } else {
    saveBtn.classList.add('hidden');
  }
});
$('#folder-desc-input')?.addEventListener('blur', (e) => {
  if (e.relatedTarget && e.relatedTarget.id === 'save-folder-desc-btn') return;
  const input = $('#folder-desc-input');
  const currentDesc = (currentFile && currentFile.description) || '';
  if (input && input.value === currentDesc) {
    cancelFolderDescription();
  }
});
$('#folder-desc-input')?.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    cancelFolderDescription();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    saveFolderDescription();
  }
});

// Event listeners for mission notes panel
$('#mission-notes-empty-selected')?.addEventListener('click', startEditMissionNotes);
$('#mission-notes-text')?.addEventListener('click', startEditMissionNotes);
$('#close-mission-notes-btn')?.addEventListener('click', closeMissionNotes);
$('#mission-sidebar-overlay')?.addEventListener('click', closeMissionNotes);
$('#save-mission-notes-btn')?.addEventListener('click', saveMissionNotes);
$('#mission-notes-input')?.addEventListener('input', () => {
  const saveBtn = $('#save-mission-notes-btn');
  const input = $('#mission-notes-input');
  if (!saveBtn || !input) return;
  if (input.value !== currentNotesInitialValue) {
    saveBtn.classList.remove('hidden');
  } else {
    saveBtn.classList.add('hidden');
  }
});
$('#mission-notes-input')?.addEventListener('blur', (e) => {
  if (e.relatedTarget && e.relatedTarget.id === 'save-mission-notes-btn') return;
  const input = $('#mission-notes-input');
  if (input && input.value === currentNotesInitialValue) {
    renderMissionNotesView();
  }
});
$('#mission-notes-input')?.addEventListener('keydown', e => {
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Escape') {
    e.preventDefault();
    renderMissionNotesView();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    saveMissionNotes();
  }
});

// Mobile toggle for folder panel
document.querySelector('.folder-sidebar-header')?.addEventListener('click', (e) => {
  if (window.innerWidth < 1100 && !e.target.closest('button, textarea, input')) {
    const panel = $('#folder-sidebar-left');
    if (panel) panel.classList.toggle('mobile-collapsed');
  }
});

$('#back-btn').addEventListener('click', () => {
  if (currentFile && currentFile._id) leaveFileRoom(currentFile._id);
  stopPolling();
  closeMissionNotes();
  currentFile = null;
  renderHome();
  transitionTo('home-screen', 'right');
});

async function saveFile() {
  if (!currentFile) return;
  try {
    const { file } = await API.put(`/files/${currentFile._id}`, { sections: currentFile.sections });
    currentFile = file;
  } catch (err) { toast(t('error_prefix') + t(err.message)); }
}

/* ===== REAL-TIME WEBSOCKET & COLLABORATION ===== */
let realTimeWs = null;
let wsReconnectTimer = null;
let typingIndicatorTimeout = null;
let lastTypingSentAt = 0;

function initRealTimeConnection() {
  if (realTimeWs && (realTimeWs.readyState === WebSocket.OPEN || realTimeWs.readyState === WebSocket.CONNECTING)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = localStorage.getItem('tdl_token');
  const wsUrl = `${protocol}//${window.location.host}/ws${token ? '?token=' + encodeURIComponent(token) : ''}`;

  try {
    realTimeWs = new WebSocket(wsUrl);

    realTimeWs.addEventListener('open', () => {
      console.log('⚡ Connecté au serveur temps réel');
      clearTimeout(wsReconnectTimer);
      if (currentFile && currentFile._id) {
        joinFileRoom(currentFile._id);
      }
    });

    realTimeWs.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleRealTimeMessage(msg);
      } catch (err) {
        console.error('Erreur décodage message temps réel:', err);
      }
    });

    realTimeWs.addEventListener('close', () => {
      const presenceEl = $('#live-presence');
      if (presenceEl) presenceEl.classList.add('hidden');
      const typingEl = $('#live-typing-indicator');
      if (typingEl) typingEl.classList.add('hidden');

      if (currentUser) {
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(initRealTimeConnection, 2500);
      }
    });

    realTimeWs.addEventListener('error', (err) => {
      console.warn('Erreur WebSocket temps réel:', err);
    });
  } catch (err) {
    console.warn('Impossible d\'initier la connexion temps réel:', err);
  }
}

function disconnectRealTime() {
  clearTimeout(wsReconnectTimer);
  if (realTimeWs) {
    try {
      realTimeWs.close();
    } catch (_) {}
    realTimeWs = null;
  }
  const presenceEl = $('#live-presence');
  if (presenceEl) {
    presenceEl.classList.add('hidden');
    presenceEl.innerHTML = '';
  }
  const typingEl = $('#live-typing-indicator');
  if (typingEl) typingEl.classList.add('hidden');
}

function joinFileRoom(fileId) {
  if (!fileId) return;
  if (realTimeWs && realTimeWs.readyState === WebSocket.OPEN) {
    realTimeWs.send(JSON.stringify({ type: 'join_file', fileId: fileId.toString() }));
  }
}

function leaveFileRoom(fileId) {
  if (!fileId) return;
  if (realTimeWs && realTimeWs.readyState === WebSocket.OPEN) {
    realTimeWs.send(JSON.stringify({ type: 'leave_file', fileId: fileId.toString() }));
  }
  const presenceEl = $('#live-presence');
  if (presenceEl) {
    presenceEl.classList.add('hidden');
    presenceEl.innerHTML = '';
  }
  const typingEl = $('#live-typing-indicator');
  if (typingEl) typingEl.classList.add('hidden');
}

function broadcastTyping(action = 'quick_entry', text = '') {
  if (!currentFile || !realTimeWs || realTimeWs.readyState !== WebSocket.OPEN) return;
  const now = Date.now();
  if (now - lastTypingSentAt < 600) return;
  lastTypingSentAt = now;
  realTimeWs.send(JSON.stringify({
    type: 'typing',
    fileId: currentFile._id.toString(),
    action,
    text,
  }));
}

function handleRealTimeMessage(msg) {
  if (!msg || !msg.type) return;

  switch (msg.type) {
    case 'file_updated':
      onRealTimeFileUpdated(msg);
      break;

    case 'file_deleted':
      if (currentFile && currentFile._id && currentFile._id.toString() === msg.fileId?.toString()) {
        toast('Ce fichier a été supprimé par son propriétaire.');
        stopPolling();
        closeMissionNotes();
        currentFile = null;
        renderHome();
        transitionTo('home-screen', 'right');
      }
      break;

    case 'presence_update':
      onRealTimePresenceUpdate(msg);
      break;

    case 'user_typing':
      onRealTimeUserTyping(msg);
      break;
  }
}

function onRealTimeFileUpdated(msg) {
  if (!currentFile || !msg.file) return;
  const updatedId = (msg.file._id || msg.fileId || '').toString();
  if (updatedId !== currentFile._id.toString()) return;

  if (msg.senderId && currentUser && msg.senderId === currentUser._id.toString()) {
    return;
  }

  const activeInput = document.querySelector('.mission-text-input, .section-tag-input, .file-title-input');
  if (activeInput) {
    currentFile.sections = msg.file.sections;
    currentFile.sharedWith = msg.file.sharedWith;
    currentFile.description = msg.file.description;
    currentFile.name = msg.file.name;
    return;
  }

  currentFile = msg.file;

  renderFolderDescription();
  renderSections();
  updateQuickEntryPlaceholder();

  if (selectedMissionId) {
    const found = findMissionById(selectedMissionId);
    if (found) {
      const notesInput = $('#mission-notes-input');
      const isEditingNotes = notesInput && !notesInput.classList.contains('hidden') && document.activeElement === notesInput;
      if (!isEditingNotes) {
        renderMissionNotes();
      }
    }
  }

  const senderUser = (msg.file.sharedWith && msg.file.sharedWith.find(u => (u._id || u.id || '').toString() === msg.senderId)) ||
                     (msg.file.ownerId && (msg.file.ownerId._id || msg.file.ownerId.id || '').toString() === msg.senderId ? msg.file.ownerId : null);
  const senderName = senderUser ? (senderUser.name || senderUser.email) : 'Un coéquipier';
  toast(`⚡ Mis à jour en direct par ${senderName}`);
}

function onRealTimePresenceUpdate(msg) {
  if (!currentFile || !msg.fileId || msg.fileId.toString() !== currentFile._id.toString()) return;
  const presenceEl = $('#live-presence');
  if (!presenceEl) return;

  const activeUsers = msg.activeUsers || [];
  const otherUsers = activeUsers.filter(u => !currentUser || u.id !== currentUser._id.toString());

  if (otherUsers.length > 0) {
    const names = otherUsers.map(u => esc(u.name)).join(', ');
    presenceEl.innerHTML = `
      <span class="live-status-dot" title="En direct"></span>
      <span class="live-user-badge"><span class="live-user-name">${names}</span> en direct</span>
    `;
    presenceEl.classList.remove('hidden');
  } else {
    presenceEl.classList.add('hidden');
    presenceEl.innerHTML = '';
  }
}

function onRealTimeUserTyping(msg) {
  if (!currentFile || !msg.fileId || msg.fileId.toString() !== currentFile._id.toString()) return;
  const indicator = $('#live-typing-indicator');
  const textEl = $('#live-typing-text');
  if (!indicator || !textEl) return;

  const name = msg.user?.name || 'Un coéquipier';
  textEl.textContent = `${name} est en train d'écrire...`;
  indicator.classList.remove('hidden');

  clearTimeout(typingIndicatorTimeout);
  typingIndicatorTimeout = setTimeout(() => {
    indicator.classList.add('hidden');
  }, 2500);
}

/* ===== POLLING (collaboration fallback) ===== */
function startPolling() {
  stopPolling();
  if (realTimeWs && realTimeWs.readyState === WebSocket.OPEN) return;
  if (!currentFile || !currentFile.sharedWith || currentFile.sharedWith.length === 0) return;

  pollInterval = setInterval(async () => {
    if (realTimeWs && realTimeWs.readyState === WebSocket.OPEN) {
      stopPolling();
      return;
    }
    if (!currentFile || !currentFile.sharedWith || currentFile.sharedWith.length === 0) {
      stopPolling();
      return;
    }
    const isEditing = document.querySelector('.mission-text-input, .section-tag-input, .file-title-input')
      || (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA'));
    if (isEditing) return;

    try {
      const { file } = await API.get(`/files/${currentFile._id}`);
      if (file && file.sections && currentFile.sections) {
        if (JSON.stringify(file.sections) === JSON.stringify(currentFile.sections)) {
          return;
        }
      }
      currentFile = file;
      renderFolderDescription();
      renderSections();
    } catch {}
  }, 4000);
}

function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}

/* ===== COLLABORATOR & TAG HELPERS ===== */
function getCollabs() {
  if (!currentFile) return [];
  const isShared = currentFile.sharedWith && currentFile.sharedWith.length > 0;
  if (!isShared) return [];

  const list = [];
  if (currentFile.ownerId) {
    if (currentFile.ownerId.name) list.push(currentFile.ownerId.name);
    else if (currentFile.ownerId.email) list.push(currentFile.ownerId.email);
  }
  if (currentFile.sharedWith) {
    currentFile.sharedWith.forEach(u => {
      if (u.name) list.push(u.name);
      else if (u.email) list.push(u.email);
    });
  }
  return [...new Set(list)];
}

const GENERAL_SECTION_NAMES = ['général', 'general', '常规', '通用', 'общее', 'générale', 'generale'];

function isGeneralSection(name) {
  if (!name) return false;
  return GENERAL_SECTION_NAMES.includes(name.trim().toLowerCase());
}

function getGeneralSectionDisplay() {
  const trans = t('section_general');
  return (trans && trans !== 'section_general') ? trans : 'General';
}

function parseTags(val) {
  let sectionName = '';
  let cleanText = val;

  if (currentFile && currentFile.sections && currentFile.sections.length > 0) {
    const knownSections = currentFile.sections
      .map(s => isGeneralSection(s.name) ? getGeneralSectionDisplay() : s.name)
      .sort((a, b) => b.length - a.length);
    for (const name of knownSections) {
      const escName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const reg = new RegExp('#' + escName + '(?=\\s|$|[.,!?;])', 'i');
      if (reg.test(cleanText)) {
        sectionName = name;
        cleanText = cleanText.replace(reg, '').trim();
        break;
      }
    }
  }

  if (!sectionName) {
    const hashMatch = cleanText.match(/#(\S+)/);
    if (hashMatch) {
      sectionName = hashMatch[1];
      cleanText = cleanText.replace(/#\S+/g, '').trim();
    } else {
      sectionName = getGeneralSectionDisplay();
    }
  }

  const collabs = getCollabs();
  const sortedCollabs = [...collabs].sort((a, b) => b.length - a.length);

  const matchedAssignees = [];

  for (const name of sortedCollabs) {
    const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp('@' + escapedName + '(?=\\s|$|[.,!?;])', 'gi');
    if (regex.test(cleanText)) {
      matchedAssignees.push(name);
      cleanText = cleanText.replace(regex, '').trim();
    }
  }

  const remainingAtMatches = cleanText.match(/@(\S+)/g);
  if (remainingAtMatches) {
    remainingAtMatches.forEach(match => {
      const parsedName = match.substring(1);
      if (!matchedAssignees.includes(parsedName)) {
        matchedAssignees.push(parsedName);
      }
    });
    cleanText = cleanText.replace(/@\S+/g, '').trim();
  }

  const uniqueAssignees = [...new Set(matchedAssignees)];
  const assignee = uniqueAssignees.length > 0 ? uniqueAssignees.join(', ') : null;

  cleanText = cleanText.replace(/\s+/g, ' ').trim();
  return { sectionName, assignee, cleanText };
}

/* ===== QUICK ENTRY — SECTION & USER AUTOCOMPLETE ===== */
(function () {
  const input    = $('#quick-entry');
  const ghost    = $('#quick-entry-ghost');
  const tabHint  = $('#tab-hint');
  const dropdown = $('#quick-entry-dropdown');

  let currentMatches = [];
  let selectedIndex = 0;
  let currentSuggestion = '';
  let prefixType = '';
  let tagStart = -1;

  function getSections() {
    if (!currentFile || !currentFile.sections) return [];
    const list = currentFile.sections.map(s => isGeneralSection(s.name) ? getGeneralSectionDisplay() : s.name);
    return [...new Set(list)];
  }

  function getCollabsPool() {
    const collabs = getCollabs();
    return [...new Set(collabs)];
  }

  function findMatches(typed, type) {
    const pool = type === '#' ? getSections() : getCollabsPool();
    if (!pool.length) return [];
    if (!typed) {
      return [...pool];
    }
    const lower = typed.toLowerCase();
    const prefixMatches = pool.filter(s => s.toLowerCase().startsWith(lower));
    const otherMatches = pool.filter(s => !s.toLowerCase().startsWith(lower) && s.toLowerCase().includes(lower));
    return [...prefixMatches, ...otherMatches];
  }

  function closeDropdown() {
    if (dropdown) {
      dropdown.classList.add('hidden');
      dropdown.innerHTML = '';
    }
    currentMatches = [];
    selectedIndex = 0;
  }

  function clearGhost() {
    if (ghost) ghost.innerHTML = '';
    if (tabHint) tabHint.style.display = 'none';
    currentSuggestion = '';
    prefixType = '';
    tagStart = -1;
  }

  function renderDropdown(matches, activeIdx, type) {
    if (!dropdown) return;
    dropdown.innerHTML = '';
    if (!matches || matches.length === 0) {
      dropdown.classList.add('hidden');
      return;
    }

    matches.forEach((item, index) => {
      const div = document.createElement('div');
      div.className = 'quick-entry-dropdown-item' + (index === activeIdx ? ' active' : '');

      const badge = document.createElement('span');
      badge.className = 'quick-entry-dropdown-badge';
      badge.textContent = type;

      const name = document.createElement('span');
      name.className = 'quick-entry-dropdown-name';
      name.textContent = item;

      div.appendChild(badge);
      div.appendChild(name);

      div.addEventListener('mousedown', (e) => {
        e.preventDefault();
        acceptSuggestion(item);
      });

      dropdown.appendChild(div);
    });

    dropdown.classList.remove('hidden');

    const activeEl = dropdown.children[activeIdx];
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }

  function updateGhost() {
    if (!input || !ghost) return;
    const val = input.value;
    const cursor = (input.selectionStart !== null && input.selectionStart !== undefined) ? input.selectionStart : val.length;
    const beforeCursor = val.slice(0, cursor);

    const hashIdx = beforeCursor.lastIndexOf('#');
    const atIdx = beforeCursor.lastIndexOf('@');

    let activeIdx = -1;
    let type = '';
    if (hashIdx > atIdx) {
      activeIdx = hashIdx;
      type = '#';
    } else if (atIdx > hashIdx) {
      activeIdx = atIdx;
      type = '@';
    }

    if (activeIdx === -1) {
      clearGhost();
      closeDropdown();
      return;
    }

    const afterSymbol = beforeCursor.slice(activeIdx + 1);
    if (/\s/.test(afterSymbol)) {
      clearGhost();
      closeDropdown();
      return;
    }

    if (type === '@') {
      const isShared = currentFile && currentFile.sharedWith && currentFile.sharedWith.length > 0;
      if (!isShared) {
        clearGhost();
        closeDropdown();
        return;
      }
    }

    const matches = findMatches(afterSymbol, type);
    if (!matches || matches.length === 0) {
      clearGhost();
      closeDropdown();
      return;
    }

    currentMatches = matches;
    if (selectedIndex >= matches.length || selectedIndex < 0) {
      selectedIndex = 0;
    }

    tagStart = activeIdx;
    prefixType = type;
    const chosenMatch = matches[selectedIndex];
    currentSuggestion = chosenMatch;

    if (chosenMatch.toLowerCase().startsWith(afterSymbol.toLowerCase())) {
      const completion = chosenMatch.slice(afterSymbol.length);
      const typedSpan = `<span class="ghost-typed">${esc(beforeCursor)}</span>`;
      const suggSpan  = `<span class="ghost-suggestion">${esc(completion)}</span>`;
      ghost.innerHTML = typedSpan + suggSpan;
      if (tabHint) tabHint.style.display = 'block';
    } else {
      ghost.innerHTML = '';
      if (tabHint) tabHint.style.display = 'block';
    }

    if (ghost) ghost.scrollLeft = input.scrollLeft;
    renderDropdown(matches, selectedIndex, type);
  }

  function acceptSuggestion(customMatch) {
    const chosen = customMatch || currentSuggestion;
    if (!chosen || tagStart === -1) return;

    const val = input.value;
    const cursor = (input.selectionStart !== null && input.selectionStart !== undefined) ? input.selectionStart : val.length;
    const beforeTag = val.slice(0, tagStart);
    let afterCursor = val.slice(cursor);
    if (afterCursor.startsWith(' ')) {
      afterCursor = afterCursor.slice(1);
    }

    const inserted = prefixType + chosen + ' ';
    input.value = beforeTag + inserted + afterCursor;
    const newCursor = beforeTag.length + inserted.length;
    input.setSelectionRange(newCursor, newCursor);

    clearGhost();
    closeDropdown();
    input.focus();
  }

  input.addEventListener('input', () => {
    selectedIndex = 0;
    updateGhost();
    if (typeof broadcastTyping === 'function') {
      broadcastTyping('quick_entry');
    }
  });

  input.addEventListener('scroll', () => {
    if (ghost) ghost.scrollLeft = input.scrollLeft;
  });

  input.addEventListener('click', updateGhost);
  input.addEventListener('keyup', e => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      updateGhost();
    }
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      closeDropdown();
      clearGhost();
    }, 250);
  });

  input.addEventListener('keydown', async e => {
    if (e.isComposing || e.keyCode === 229) return;

    const isDropdownOpen = dropdown && !dropdown.classList.contains('hidden') && currentMatches.length > 0;

    if (e.key === 'ArrowDown' && isDropdownOpen) {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % currentMatches.length;
      updateGhostAfterIndexChange();
      return;
    }

    if (e.key === 'ArrowUp' && isDropdownOpen) {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
      updateGhostAfterIndexChange();
      return;
    }

    if (e.key === 'Tab') {
      if (isDropdownOpen && currentMatches.length > 0) {
        e.preventDefault();
        acceptSuggestion(currentMatches[selectedIndex]);
      } else if (currentSuggestion) {
        e.preventDefault();
        acceptSuggestion();
      }
      return;
    }

    if (e.key === 'Escape') {
      clearGhost();
      closeDropdown();
      return;
    }

    if (e.key !== 'Enter') return;

    if (isDropdownOpen && currentMatches.length > 0) {
      const val = input.value;
      const cursor = input.selectionStart != null ? input.selectionStart : val.length;
      const typed = val.slice(tagStart + 1, cursor);
      const chosen = currentMatches[selectedIndex];

      if (!typed || typed.toLowerCase() !== chosen.toLowerCase()) {
        e.preventDefault();
        acceptSuggestion(chosen);
        return;
      }
    }

    const val = e.target.value.trim();
    if (!val) return;

    const { sectionName, assignee, cleanText } = parseTags(val);
    if (!cleanText) return;

    let sec = null;
    if (isGeneralSection(sectionName)) {
      sec = currentFile.sections.find(s => isGeneralSection(s.name));
      if (!sec) {
        sec = { name: getGeneralSectionDisplay(), missions: [] };
        currentFile.sections.push(sec);
      }
    } else {
      sec = currentFile.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
      if (!sec) {
        sec = { name: sectionName, missions: [] };
        currentFile.sections.push(sec);
      }
    }
    
    sec.missions.push({
      id: uid(),
      text: cleanText,
      done: false,
      subtasks: [],
      assignedTo: assignee
    });

    e.target.value = '';
    clearGhost();
    closeDropdown();
    await saveFile();
    renderSections();
  });

  function updateGhostAfterIndexChange() {
    if (!currentMatches.length) return;
    const chosenMatch = currentMatches[selectedIndex];
    currentSuggestion = chosenMatch;

    const val = input.value;
    const cursor = (input.selectionStart !== null && input.selectionStart !== undefined) ? input.selectionStart : val.length;
    const beforeCursor = val.slice(0, cursor);
    const afterSymbol = beforeCursor.slice(tagStart + 1);

    if (chosenMatch.toLowerCase().startsWith(afterSymbol.toLowerCase())) {
      const completion = chosenMatch.slice(afterSymbol.length);
      const typedSpan = `<span class="ghost-typed">${esc(beforeCursor)}</span>`;
      const suggSpan  = `<span class="ghost-suggestion">${esc(completion)}</span>`;
      ghost.innerHTML = typedSpan + suggSpan;
      if (tabHint) tabHint.style.display = 'block';
    } else {
      ghost.innerHTML = '';
      if (tabHint) tabHint.style.display = 'block';
    }

    if (ghost) ghost.scrollLeft = input.scrollLeft;
    renderDropdown(currentMatches, selectedIndex, prefixType);
  }
})();

/* ===== RENDER SECTIONS ===== */
function renderSections() {
  if (!currentFile) return;
  const container = $('#sections-container');
  const emptyEl = $('#empty-state');
  
  // Sort sections alphabetically by name
  if (currentFile.sections) {
    currentFile.sections.sort((a, b) => {
      const nameA = isGeneralSection(a.name) ? getGeneralSectionDisplay() : a.name;
      const nameB = isGeneralSection(b.name) ? getGeneralSectionDisplay() : b.name;
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }

  const totalMissions = countTasks(currentFile);
  const doneMissions = countDone(currentFile);
  if (totalMissions === 0) { container.innerHTML = ''; emptyEl.classList.remove('hidden'); } else { emptyEl.classList.add('hidden'); }
  const pct = totalMissions > 0 ? Math.round((doneMissions / totalMissions) * 100) : 0;
  $('#progress-fill').style.width = pct + '%';
  $('#progress-text').textContent = pct + '%';

  // Sync stats in left folder sidebar
  const statCount = $('#folder-stat-count');
  if (statCount) statCount.textContent = `${doneMissions} / ${totalMissions}`;

  // Sync active mission or subtask selection in right panel
  if (selectedMissionId) {
    const found = findMissionById(selectedMissionId);
    if (found) {
      const titleEl = $('#mission-sidebar-title');
      if (titleEl) titleEl.textContent = found.mission.text;
    } else {
      closeMissionNotes();
    }
  } else if (selectedSubtaskId) {
    let foundSt = null;
    let foundParent = null;
    for (const sec of currentFile.sections) {
      for (const m of sec.missions) {
        if (m.subtasks) {
          const st = m.subtasks.find(x => x.id === selectedSubtaskId);
          if (st) { foundSt = st; foundParent = m; break; }
        }
      }
      if (foundSt) break;
    }
    if (foundSt) {
      const titleEl = $('#mission-sidebar-title');
      if (titleEl) {
        titleEl.innerHTML = `<span style="display:block; font-size:0.75rem; color:var(--text-dim); font-weight:normal; margin-bottom:3px;">↳ ${esc(foundParent.text)}</span>${esc(foundSt.text)}`;
      }
    } else {
      closeMissionNotes();
    }
  }
  let html = '';
  
  const isShared = currentFile.sharedWith && currentFile.sharedWith.length > 0;
  const myToken = currentUser ? (currentUser.name || currentUser.email) : '';

  // Render index sidebar on the right
  const sidebar = $('#category-index-sidebar');
  if (sidebar) {
    if (totalMissions === 0 || !currentFile.sections || currentFile.sections.length === 0) {
      sidebar.style.display = 'none';
      sidebar.innerHTML = '';
    } else {
      sidebar.style.display = 'flex';
      let sidebarHtml = '';
      currentFile.sections.forEach(sec => {
        const isGen = isGeneralSection(sec.name);
        const displayName = isGen ? getGeneralSectionDisplay() : sec.name;
        const firstLetter = displayName.trim().charAt(0).toUpperCase() || '#';
        const secId = 'sec-' + sec.name.replace(/\s+/g, '-');
        sidebarHtml += `<button class="category-index-item" data-target="${secId}" aria-label="${esc(displayName)}"><span class="category-index-letter">${esc(firstLetter)}</span><span class="category-index-tooltip"># ${esc(displayName)}</span></button>`;
      });
      sidebar.innerHTML = sidebarHtml;
      sidebar.querySelectorAll('.category-index-item').forEach(btn => {
        btn.addEventListener('click', () => {
          const targetId = btn.getAttribute('data-target');
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        });
      });
    }
  }

  currentFile.sections.forEach(sec => {
    const isGen = isGeneralSection(sec.name);
    const displayName = isGen ? getGeneralSectionDisplay() : sec.name;
    const doneCount = sec.missions.filter(m => m.done).length;
    const secId = 'sec-' + sec.name.replace(/\s+/g, '-');
    html += `<div class="section" id="${secId}"><div class="section-header"><span class="section-tag" data-secedit="${esc(sec.name)}" data-displayname="${esc(displayName)}" title="${t('click_to_rename')}"># ${esc(displayName)}</span><span class="section-count">${doneCount}/${sec.missions.length}</span></div>`;
    
    if (!isShared) {
      const sorted = [...sec.missions].sort((a, b) => {
        if (a.done !== b.done) return a.done - b.done;
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
      sorted.forEach(m => { html += renderMission(m, sec.name); });
    } else {
      // Group by assignee
      const groups = {};
      sec.missions.forEach(m => {
        let groupKey = 'unassigned';
        if (m.assignedTo) {
          if (m.assignedTo.includes(',')) {
            groupKey = 'teamwork';
          } else {
            groupKey = m.assignedTo;
          }
        }
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(m);
      });

      // Sort assignee groups
      const groupKeys = Object.keys(groups).sort((a, b) => {
        if (a === 'unassigned') return 1;
        if (b === 'unassigned') return -1;
        if (a === 'teamwork') return 1;
        if (b === 'teamwork') return -1;
        if (myToken) {
          if (a.toLowerCase() === myToken.toLowerCase()) return -1;
          if (b.toLowerCase() === myToken.toLowerCase()) return 1;
        }
        return a.localeCompare(b);
      });

      groupKeys.forEach(gKey => {
        let headerLabel = '';
        if (gKey === 'unassigned') {
          headerLabel = 'Sans assignation';
        } else if (gKey === 'teamwork') {
          headerLabel = 'Team Work';
        } else {
          headerLabel = gKey;
        }

        html += `<div class="assignee-group">
          <div class="assignee-group-header">@ ${esc(headerLabel)}</div>
          <div class="assignee-group-list">`;

        const sortedMissions = groups[gKey].sort((a, b) => a.done - b.done);
        sortedMissions.forEach(m => {
          html += renderMission(m, sec.name);
        });

        html += `</div></div>`;
      });
    }
    html += '</div>';
  });
  container.innerHTML = html;
  expandedMissions.forEach(mid => {
    const toggle = document.querySelector(`.subtask-toggle[data-toggle="${mid}"]`);
    const subList = document.querySelector(`.subtasks-list[data-parent="${mid}"]`);
    if (toggle) toggle.classList.add('open');
    if (subList) subList.classList.add('open');
  });
  bindMissionEvents();
}

function renderMission(m, secName) {
  const hasSubtasks = m.subtasks && m.subtasks.length > 0;
  const arrow = hasSubtasks ? `<button class="subtask-toggle" data-toggle="${m.id}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>` : '';
  
  const mClass = dateBadgeClass(m.dueDate, m.done);
  const dateBadge = m.done 
    ? `<span class="mission-date done"> ${t('completed_on', formatDate(m.completedAt || new Date()))}</span>`
    : (m.dueDate ? `<span class="mission-date ${mClass}" data-datepick="${m.id}" style="cursor: pointer;" title="Modifier ou supprimer la date">${dateBadgeEmoji(mClass)} ${formatDate(m.dueDate)}</span>` : '');
  const mDueDateStr = m.dueDate ? new Date(m.dueDate).toISOString().split('T')[0] : '';

  let teamworkBadge = '';
  if (m.assignedTo && m.assignedTo.includes(',')) {
    const assigneeNames = m.assignedTo.split(',').map(s => s.trim());
    teamworkBadge = `<span class="mission-team-badge" title="${esc(m.assignedTo)}">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="color: #3182ce; margin-right: 4px; display: inline-block; vertical-align: middle;"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
      <span class="team-count" style="font-weight: 600; font-size: 0.82rem; color: var(--text-dim); display: inline-block; vertical-align: middle;">${assigneeNames.length}</span>
    </span>`;
  }

  const isShared = currentFile && currentFile.sharedWith && currentFile.sharedWith.length > 0;
  const assignBtn = isShared
    ? `<button class="icon-btn" data-assign="${m.id}" title="Assigner des membres"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>`
    : '';

  let sub = '';
  if (hasSubtasks) {
    const sortedSub = [...m.subtasks].sort((a, b) => {
      if (a.done !== b.done) return a.done - b.done;
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    sub = `<div class="subtasks-list" data-parent="${m.id}">`;
    sortedSub.forEach(st => {
      const stClass = dateBadgeClass(st.dueDate, st.done);
      const stDateBadge = st.done
        ? `<span class="subtask-date done"> ${t('completed_on', formatDate(st.completedAt || new Date()))}</span>`
        : (st.dueDate ? `<span class="subtask-date ${stClass}" data-stdatepick="${st.id}" data-mid="${m.id}" data-maxdate="${mDueDateStr}" style="cursor: pointer;" title="Modifier ou supprimer la date">${dateBadgeEmoji(stClass)} ${formatDate(st.dueDate)}</span>` : '');
      
      const stAssigneeBadge = st.assignedTo
        ? `<span class="subtask-assignee" data-stassign="${st.id}" data-mid="${m.id}" title="Assigné à @${esc(st.assignedTo)}">@${esc(st.assignedTo)}</span>`
        : '';

      const stAssignBtn = isShared
        ? `<button class="icon-btn" data-stassignbtn="${st.id}" data-mid="${m.id}" title="Assigner des membres"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></button>`
        : '';

      const isStSelected = selectedSubtaskId === st.id;
      const stHasNotes = st.notes && st.notes.trim().length > 0;
      sub += `<div class="subtask-item${st.done ? ' completed' : ''}${isStSelected ? ' active-selected' : ''}" data-stid="${st.id}">
        <button class="subtask-check${st.done ? ' checked' : ''}" data-stcheck="${st.id}" data-mid="${m.id}"></button>
        <span class="subtask-text" data-stedit="${st.id}" data-mid="${m.id}">${esc(st.text)}</span>
        ${stDateBadge}
        ${stAssigneeBadge}
        <div class="subtask-actions">
          ${stAssignBtn}
          <button class="icon-btn" data-stdatepick="${st.id}" data-mid="${m.id}" data-maxdate="${mDueDateStr}" title="Date d'échéance"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
          <button class="icon-btn btn-notes${stHasNotes ? ' has-notes' : ''}" data-stnotes="${st.id}" data-mid="${m.id}" title="${t('mission_notes')}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
          <button class="icon-btn danger" data-stdel="${st.id}" data-mid="${m.id}" title="Supprimer"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
        </div>
      </div>`;
    });
    sub += '</div>';
  }
  const isSelected = selectedMissionId === m.id;
  const hasNotes = m.notes && m.notes.trim().length > 0;
  return `<div class="mission-item${m.done ? ' completed' : ''}${isSelected ? ' active-selected' : ''}" data-mid="${m.id}" data-sec="${esc(secName)}">
    ${teamworkBadge}
    <button class="mission-check${m.done ? ' checked' : ''}" data-check="${m.id}"></button>
    ${arrow}
    <span class="mission-text" data-edit="${m.id}">${esc(m.text)}</span>
    ${dateBadge}
    <div class="mission-actions">
      ${assignBtn}
      <button class="icon-btn" data-datepick="${m.id}" title="Date d'échéance"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></button>
      <button class="icon-btn btn-notes${hasNotes ? ' has-notes' : ''}" data-notes="${m.id}" title="${t('mission_notes')}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
      <button class="icon-btn" data-addsub="${m.id}" title="Ajouter sous-mission"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="icon-btn danger" data-del="${m.id}" title="Supprimer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg></button>
    </div>
  </div>${sub}`;
}

/* ===== MISSION EVENTS ===== */
function bindMissionEvents() {
  // ── Inline rename section tag ──
  document.querySelectorAll('[data-secedit]').forEach(span => span.addEventListener('click', () => {
    const oldName = span.dataset.secedit;
    const currentDisplay = span.dataset.displayname || oldName;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'section-tag-input';
    input.value = currentDisplay;
    // auto-size to content
    input.style.width = Math.max(currentDisplay.length * 9, 60) + 'px';
    span.replaceWith(input);
    input.focus();
    input.select();

    let saved = false;
    const save = async () => {
      if (saved) return; saved = true;
      const newName = input.value.trim();
      if (newName && newName.toLowerCase() !== oldName.toLowerCase() && newName.toLowerCase() !== currentDisplay.toLowerCase()) {
        // Check no other section has this name
        const conflict = currentFile.sections.find(s => s.name.toLowerCase() === newName.toLowerCase() && s.name !== oldName);
        if (conflict) { toast(t('section_exists')); renderSections(); return; }
        currentFile.sections.forEach(s => { if (s.name === oldName) s.name = newName; });
        await saveFile();
        toast(t('section_renamed'));
      }
      renderSections();
    };
    input.addEventListener('blur', () => {
      if (!saved) {
        saved = true;
        renderSections();
      }
    });
    input.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; renderSections(); }
    });
    // auto-resize as user types
    input.addEventListener('input', () => {
      input.style.width = Math.max(input.value.length * 9, 60) + 'px';
    });
  }));

  document.querySelectorAll('[data-check]').forEach(btn => btn.addEventListener('click', async () => {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === btn.dataset.check);
      if (m) {
        m.done = !m.done;
        m.completedAt = m.done ? new Date() : null;
        // Cascader l'état à toutes les sous-missions
        if (m.subtasks && m.subtasks.length > 0) {
          m.subtasks.forEach(st => {
            st.done = m.done;
            st.completedAt = m.done ? new Date() : null;
          });
        }
      }
    });
    await saveFile(); renderSections();
  }));

  document.querySelectorAll('[data-edit]').forEach(span => span.addEventListener('click', () => {
    const mid = span.dataset.edit;
    let m = null;
    let secName = '';
    currentFile.sections.forEach(s => {
      const found = s.missions.find(x => x.id === mid);
      if (found) {
        m = found;
        secName = s.name;
      }
    });
    if (!m) return;

    let editValue = m.text;
    if (!isGeneralSection(secName)) {
      editValue += ` #${secName}`;
    }
    if (m.assignedTo) {
      const atMentions = m.assignedTo.split(',').map(s => `@${s.trim()}`).join(' ');
      editValue += ` ${atMentions}`;
    }

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.value = editValue;
    span.replaceWith(input); input.focus();
    let saved = false;
    const save = async () => {
      if (saved) return; saved = true;
      const val = input.value.trim();
      if (val && val !== editValue) {
        const { sectionName, assignee, cleanText } = parseTags(val);

        let foundMission = null;
        let currentSec = null;
        currentFile.sections.forEach(s => {
          const m = s.missions.find(x => x.id === mid);
          if (m) {
            foundMission = m;
            currentSec = s;
          }
        });

        if (foundMission) {
          foundMission.text = cleanText;
          foundMission.assignedTo = assignee;
          const isSameSection = (isGeneralSection(currentSec.name) && isGeneralSection(sectionName))
            || (currentSec.name.toLowerCase() === sectionName.toLowerCase());

          if (!isSameSection) {
            const idx = currentSec.missions.findIndex(x => x.id === mid);
            if (idx !== -1) currentSec.missions.splice(idx, 1);

            let targetSec = isGeneralSection(sectionName)
              ? currentFile.sections.find(s => isGeneralSection(s.name))
              : currentFile.sections.find(s => s.name.toLowerCase() === sectionName.toLowerCase());
            if (!targetSec) {
              targetSec = { name: isGeneralSection(sectionName) ? getGeneralSectionDisplay() : sectionName, missions: [] };
              currentFile.sections.push(targetSec);
            }
            targetSec.missions.push(foundMission);
          }
        }

        currentFile.sections = currentFile.sections.filter(s => s.missions.length > 0);
        await saveFile();
      }
      renderSections();
    };
    input.addEventListener('blur', () => {
      if (!saved) {
        saved = true;
        renderSections();
      }
    });
    input.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; renderSections(); }
    });
  }));

  document.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
    const mid = btn.dataset.del;
    if (selectedMissionId === mid) {
      closeMissionNotes();
    }
    if (selectedSubtaskId) {
      for (const s of currentFile.sections) {
        const m = s.missions.find(x => x.id === mid);
        if (m && m.subtasks && m.subtasks.some(st => st.id === selectedSubtaskId)) {
          closeMissionNotes();
          break;
        }
      }
    }
    currentFile.sections.forEach(s => {
      const idx = s.missions.findIndex(x => x.id === mid);
      if (idx !== -1) {
        const removed = s.missions.splice(idx, 1)[0];
        API.post('/trash', { type: 'mission', data: removed, fileId: currentFile._id, sectionName: s.name, origin: currentFile.name + ' / ' + s.name });
      }
    });
    currentFile.sections = currentFile.sections.filter(s => s.missions.length > 0);
    await saveFile(); toast(t('mission_deleted')); renderSections();
  }));

  document.querySelectorAll('[data-addsub]').forEach(btn => btn.addEventListener('click', () => {
    const mid = btn.dataset.addsub;
    const missionEl = btn.closest('.mission-item');
    let mission = null;
    currentFile.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m) mission = m; });
    if (!mission) return;
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.placeholder = t('new_subtask_placeholder');
    input.style.marginLeft = '3.2rem'; input.style.marginTop = '0.3rem'; input.style.marginBottom = '0.3rem';
    missionEl.parentNode.insertBefore(input, missionEl.nextSibling);
    input.focus();
    let saved = false;
    const doAdd = async () => {
      if (saved) return; saved = true;
      const val = input.value.trim();
      if (val) {
        if (!mission.subtasks) mission.subtasks = [];
        const { assignee, cleanText } = parseTags(val);
        mission.subtasks.push({ id: uid(), text: cleanText, done: false, assignedTo: assignee });
        mission.done = false;
        mission.completedAt = null;
        await saveFile();
      }
      renderSections();
    };
    input.addEventListener('blur', doAdd);
    input.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
      if (e.key === 'Escape') { saved = true; renderSections(); }
    });
  }));

  document.querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const mid = btn.dataset.toggle;
    if (expandedMissions.has(mid)) expandedMissions.delete(mid); else expandedMissions.add(mid);
    btn.classList.toggle('open');
    const subList = document.querySelector(`.subtasks-list[data-parent="${mid}"]`);
    if (subList) subList.classList.toggle('open');
  }));

  document.querySelectorAll('[data-stcheck]').forEach(btn => btn.addEventListener('click', async () => {
    const stid = btn.dataset.stcheck, mid = btn.dataset.mid;
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const st = m.subtasks.find(x => x.id === stid);
        if (st) {
          st.done = !st.done;
          st.completedAt = st.done ? new Date() : null;
        }
        if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) {
          m.done = true;
          m.completedAt = m.completedAt || new Date();
        }
        if (m.subtasks.some(x => !x.done)) {
          m.done = false;
          m.completedAt = null;
        }
      }
    });
    await saveFile(); renderSections();
  }));

  document.querySelectorAll('[data-stedit]').forEach(span => span.addEventListener('click', () => {
    const stid = span.dataset.stedit, mid = span.dataset.mid;
    let st = null;
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const found = m.subtasks.find(x => x.id === stid);
        if (found) st = found;
      }
    });
    if (!st) return;

    let editValue = st.text;
    if (st.assignedTo) {
      const atMentions = st.assignedTo.split(',').map(s => `@${s.trim()}`).join(' ');
      editValue += ` ${atMentions}`;
    }

    const input = document.createElement('input');
    input.type = 'text'; input.className = 'mission-text-input'; input.value = editValue; input.style.fontSize = '0.85rem';
    span.replaceWith(input); input.focus();
    let saved = false;
    const save = async () => {
      if (saved) return; saved = true;
      const val = input.value.trim();
      if (val && val !== editValue) {
        const { assignee, cleanText } = parseTags(val);
        currentFile.sections.forEach(s => {
          const m = s.missions.find(x => x.id === mid);
          if (m && m.subtasks) {
            const found = m.subtasks.find(x => x.id === stid);
            if (found) {
              found.text = cleanText;
              found.assignedTo = assignee;
            }
          }
        });
        await saveFile();
      }
      renderSections();
    };
    input.addEventListener('blur', () => {
      if (!saved) {
        saved = true;
        renderSections();
      }
    });
    input.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { saved = true; renderSections(); }
    });
  }));

  document.querySelectorAll('[data-stdel]').forEach(btn => btn.addEventListener('click', async () => {
    const stid = btn.dataset.stdel, mid = btn.dataset.mid;
    if (selectedSubtaskId === stid) {
      closeMissionNotes();
    }
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const idx = m.subtasks.findIndex(x => x.id === stid);
        if (idx !== -1) {
          const removed = m.subtasks.splice(idx, 1)[0];
          API.post('/trash', {
            type: 'subtask',
            data: removed,
            fileId: currentFile._id,
            sectionName: s.name,
            parentMissionId: mid,
            origin: currentFile.name + ' / ' + s.name + ' / ' + m.text
          });
          if (m.subtasks.length > 0 && m.subtasks.every(x => x.done)) m.done = true;
        }
      }
    });
    await saveFile(); renderSections();
  }));

  // Date picker — mission principale
  document.querySelectorAll('[data-datepick]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const mid = btn.dataset.datepick;
    let currentVal = null;
    let minDate = null;
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m) {
        if (m.dueDate) currentVal = m.dueDate;
        // minDate = deadline la plus tardive des sous-missions
        if (m.subtasks) {
          m.subtasks.forEach(st => {
            if (st.dueDate) {
              if (!minDate || new Date(st.dueDate) > new Date(minDate)) minDate = st.dueDate;
            }
          });
        }
      }
    });
    openDatePicker(btn, { type: 'mission', mid, currentVal, maxDate: null, minDate });
  }));

  // Date picker — sous-mission
  document.querySelectorAll('[data-stdatepick]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const stid = btn.dataset.stdatepick;
    const mid = btn.dataset.mid;
    const maxDate = btn.dataset.maxdate || null;
    let currentVal = null;
    currentFile.sections.forEach(s => { const m = s.missions.find(x => x.id === mid); if (m && m.subtasks) { const st = m.subtasks.find(x => x.id === stid); if (st && st.dueDate) currentVal = st.dueDate; } });
    openDatePicker(btn, { type: 'subtask', mid, stid, currentVal, maxDate });
  }));

  // ── Mission Assignee Dropdown ──
  document.querySelectorAll('.mission-team-badge, [data-assign]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const mid = el.dataset.assign || el.closest('.mission-item').dataset.mid;
    showAssigneeDropdown(el, mid);
  }));

  // ── Subtask Assignee Dropdown ──
  document.querySelectorAll('.subtask-assignee, [data-stassignbtn]').forEach(el => el.addEventListener('click', e => {
    e.stopPropagation();
    const mid = el.dataset.mid;
    const stid = el.dataset.stassign || el.dataset.stassignbtn;
    showAssigneeDropdown(el, mid, stid);
  }));

  // ── Mission Notes Panel Trigger (Pencil icon) ──
  document.querySelectorAll('[data-notes]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const mid = btn.dataset.notes;
    openMissionNotes(mid);
  }));

  // ── Subtask Notes Panel Trigger (Pencil icon) ──
  document.querySelectorAll('[data-stnotes]').forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const stid = btn.dataset.stnotes;
    const mid = btn.dataset.mid;
    openSubtaskNotes(mid, stid);
  }));
}

function showAssigneeDropdown(badgeEl, mid, stid = null) {
  const existing = document.querySelector('.assignee-dropdown');
  if (existing) existing.remove();

  let targetObj = null;
  if (stid) {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === mid);
      if (m && m.subtasks) {
        const found = m.subtasks.find(x => x.id === stid);
        if (found) targetObj = found;
      }
    });
  } else {
    currentFile.sections.forEach(s => {
      const found = s.missions.find(x => x.id === mid);
      if (found) targetObj = found;
    });
  }
  if (!targetObj) return;

  const collabs = [];
  if (currentFile.ownerId) {
    collabs.push(currentFile.ownerId);
  }
  if (currentFile.sharedWith) {
    currentFile.sharedWith.forEach(u => collabs.push(u));
  }

  const uniqueCollabs = [];
  const seen = new Set();
  collabs.forEach(u => {
    const uid = u._id || u;
    if (!seen.has(uid)) {
      seen.add(uid);
      uniqueCollabs.push(u);
    }
  });

  let selected = targetObj.assignedTo
    ? targetObj.assignedTo.split(',').map(s => s.trim())
    : [];

  const dropdown = document.createElement('div');
  dropdown.className = 'assignee-dropdown';

  let hasChanged = false;

  uniqueCollabs.forEach(u => {
    const name = u.name || u.email;
    const item = document.createElement('div');
    item.className = 'assignee-dropdown-item';
    if (selected.includes(name)) {
      item.classList.add('active');
    }
    item.textContent = name;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      hasChanged = true;
      if (selected.includes(name)) {
        selected = selected.filter(x => x !== name);
        item.classList.remove('active');
      } else {
        selected.push(name);
        item.classList.add('active');
      }
      targetObj.assignedTo = selected.length > 0 ? selected.join(', ') : null;
    });
    dropdown.appendChild(item);
  });

  const unassignItem = document.createElement('div');
  unassignItem.className = 'assignee-dropdown-item unassign';
  unassignItem.textContent = "Retirer l'assignation";
  unassignItem.addEventListener('click', async (e) => {
    e.stopPropagation();
    selected = [];
    targetObj.assignedTo = null;
    await saveFile();
    renderSections();
    dropdown.remove();
  });
  dropdown.appendChild(unassignItem);

  document.body.appendChild(dropdown);

  const rect = badgeEl.getBoundingClientRect();
  dropdown.style.top = `${rect.bottom + window.scrollY + 5}px`;
  dropdown.style.left = `${rect.left + window.scrollX}px`;

  const closeDropdown = async (e) => {
    if (!dropdown.contains(e.target) && e.target !== badgeEl) {
      dropdown.remove();
      document.removeEventListener('click', closeDropdown);
      if (hasChanged) {
        await saveFile();
        renderSections();
      }
    }
  };
  setTimeout(() => document.addEventListener('click', closeDropdown), 10);
}

/* ===== CUSTOM DATE PICKER ===== */
let dpTarget = null;
let dpViewMonth = null;

function openDatePicker(anchorBtn, config) {
  closeDatePicker();
  dpTarget = config;
  dpViewMonth = config.currentVal
    ? new Date(new Date(config.currentVal).getFullYear(), new Date(config.currentVal).getMonth(), 1)
    : new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const popup = document.createElement('div');
  popup.id = 'dp-popup';
  popup.className = 'dp-popup';
  document.body.appendChild(popup);
  renderDPContent(popup, config.currentVal);

  // Positionner sous le bouton
  const rect = anchorBtn.getBoundingClientRect();
  const popupW = 240;
  let left = rect.left;
  if (left + popupW > window.innerWidth - 8) left = window.innerWidth - popupW - 8;
  popup.style.top = `${rect.bottom + window.scrollY + 6}px`;
  popup.style.left = `${left}px`;

  setTimeout(() => document.addEventListener('click', dpOutsideClick), 0);
}

function dpOutsideClick(e) {
  const popup = document.getElementById('dp-popup');
  if (popup && !popup.contains(e.target)) closeDatePicker();
}

function closeDatePicker() {
  const popup = document.getElementById('dp-popup');
  if (popup) popup.remove();
  document.removeEventListener('click', dpOutsideClick);
  dpTarget = null;
}

function renderDPContent(popup, selectedVal) {
  const lang = currentLanguage || 'en';
  let months, days;
  if (lang === 'fr') {
    months = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    days = ['Lu','Ma','Me','Je','Ve','Sa','Di'];
  } else if (lang === 'ru') {
    months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    days = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  } else if (lang === 'zh') {
    months = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
    days = ['一','二','三','四','五','六','日'];
  } else {
    months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    days = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const year = dpViewMonth.getFullYear();
  const month = dpViewMonth.getMonth();

  const selectedDate = selectedVal ? new Date(selectedVal) : null;
  if (selectedDate) selectedDate.setHours(0,0,0,0);

  const maxDate = dpTarget && dpTarget.maxDate ? new Date(dpTarget.maxDate) : null;
  if (maxDate) maxDate.setHours(0,0,0,0);
  const minDate = dpTarget && dpTarget.minDate ? new Date(dpTarget.minDate) : null;
  if (minDate) minDate.setHours(0,0,0,0);

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const lastDay = new Date(year, month + 1, 0).getDate();

  let titleText = `${months[month]} ${year}`;
  if (lang === 'zh') {
    titleText = `${year}年 ${months[month]}`;
  }

  let html = `
    <div class="dp-header">
      <button class="dp-nav" id="dp-prev">‹</button>
      <span class="dp-title">${titleText}</span>
      <button class="dp-nav" id="dp-next">›</button>
    </div>
    <div class="dp-grid">
      ${days.map(d => `<span class="dp-label">${d}</span>`).join('')}
      ${Array(firstDow).fill('<span></span>').join('')}
  `;

  for (let d = 1; d <= lastDay; d++) {
    const date = new Date(year, month, d);
    date.setHours(0,0,0,0);
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const isToday = date.getTime() === today.getTime();
    const isSelected = selectedDate && date.getTime() === selectedDate.getTime();
    const disabled = (maxDate && date > maxDate) || (minDate && date < minDate);
    let cls = 'dp-day';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';
    if (disabled) cls += ' disabled';
    html += `<button class="${cls}" ${disabled ? 'disabled' : ''} data-date="${dateStr}">${d}</button>`;
  }

  html += `</div><button class="dp-clear" id="dp-clear">✕ ${t('clear_date')}</button>`;
  popup.innerHTML = html;

  popup.querySelector('#dp-prev').addEventListener('click', e => {
    e.stopPropagation();
    dpViewMonth = new Date(year, month - 1, 1);
    renderDPContent(popup, selectedVal);
  });
  popup.querySelector('#dp-next').addEventListener('click', e => {
    e.stopPropagation();
    dpViewMonth = new Date(year, month + 1, 1);
    renderDPContent(popup, selectedVal);
  });
  popup.querySelectorAll('.dp-day:not(.disabled)').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await applyDueDate(btn.dataset.date);
      closeDatePicker();
    });
  });
  popup.querySelector('#dp-clear').addEventListener('click', async e => {
    e.stopPropagation();
    await applyDueDate(null);
    closeDatePicker();
  });
}

async function applyDueDate(dateStr) {
  if (!dpTarget) return;
  const newDate = dateStr ? new Date(dateStr) : null;
  if (dpTarget.type === 'mission') {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === dpTarget.mid);
      if (m) m.dueDate = newDate;
    });
  } else {
    currentFile.sections.forEach(s => {
      const m = s.missions.find(x => x.id === dpTarget.mid);
      if (m && m.subtasks) {
        const st = m.subtasks.find(x => x.id === dpTarget.stid);
        if (st) st.dueDate = newDate;
      }
    });
  }
  await saveFile(); renderSections();
}

/* ===== THEME ===== */
function applyTheme(theme, persistToDb = true) {
  const root = document.documentElement;
  const sunIcon = $('#theme-icon-sun'), moonIcon = $('#theme-icon-moon');
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  } else {
    root.removeAttribute('data-theme');
    sunIcon.style.display = 'none';
    moonIcon.style.display = 'block';
  }

  if (currentUser) {
    localStorage.setItem('tdl_theme_' + currentUser._id, theme);
    if (persistToDb) {
      API.patch('/auth/me', { theme }).catch(console.error);
    }
  } else {
    localStorage.setItem('tdl_theme', theme);
  }
}

// Initial default theme (guest mode)
applyTheme(localStorage.getItem('tdl_theme') || 'dark', false);

$('#theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const target = current === 'dark' ? 'light' : 'dark';
  applyTheme(target, true);
});

/* ===== SETTINGS MODULE ===== */
(function () {
  const panel    = $('#settings-panel');
  const overlay  = $('#settings-overlay');
  const openBtn  = $('#settings-btn');
  const closeBtn = $('#settings-close');

  function openSettings() {
    panel.classList.add('open');
    overlay.classList.add('open');
    // Populate profile fields
    if (currentUser) {
      $('#settings-name').value = currentUser.name || '';
      $('#settings-email').textContent = currentUser.email || '';
      const select = $('#settings-lang');
      if (select) select.value = currentLanguage;
    }
  }
  function closeSettings() {
    panel.classList.remove('open');
    overlay.classList.remove('open');
    // Reset delete confirm box
    $('#delete-confirm-box').style.display = 'none';
    $('#delete-password').value = '';
    $('#delete-error').textContent = '';
  }

  openBtn.addEventListener('click', openSettings);
  closeBtn.addEventListener('click', closeSettings);
  overlay.addEventListener('click', closeSettings);

  /* ── PROFILE: Save language ── */
  const langSelect = $('#settings-lang');
  if (langSelect) {
    langSelect.addEventListener('change', async () => {
      const selectedLang = langSelect.value;
      if (selectedLang === currentLanguage) return;
      try {
        await updateLanguage(selectedLang);
        if (currentUser) {
          const data = await API.patch('/auth/me', { language: selectedLang });
          currentUser = data.user;
        }
      } catch (err) {
        toast(t('error_prefix') + t(err.message));
      }
    });
  }

  /* ── PROFILE: Save name ── */
  $('#settings-save-name').addEventListener('click', async () => {
    const newName = $('#settings-name').value.trim();
    if (!newName) return toast(t('name_empty'));
    if (newName === (currentUser && currentUser.name)) return;
    try {
      const data = await API.req('PATCH', '/auth/me', { name: newName });
      currentUser = data.user;
      updateLanguage(currentLanguage);
      toast(t('name_updated'));
    } catch (err) {
      toast(t('error_prefix') + t(err.message));
    }
  });

  /* ── PROFILE: Change password link ── */
  $('#settings-change-pwd').addEventListener('click', () => {
    closeSettings();
    // Logout then redirect to forgot password form
    localStorage.removeItem('tdl_token');
    currentUser = null;
    transitionTo('auth-screen', 'down');
    // Trigger the forgot-password form
    setTimeout(() => {
      $('#login-form').classList.add('hidden');
      $('#forgot-form').classList.remove('hidden');
      $('#forgot-email').focus();
    }, 100);
  });

  /* ── PROFILE: Delete account ── */
  $('#delete-account-btn').addEventListener('click', () => {
    $('#delete-confirm-box').style.display = 'block';
    $('#delete-password').focus();
  });
  $('#delete-cancel-btn').addEventListener('click', () => {
    $('#delete-confirm-box').style.display = 'none';
    $('#delete-password').value = '';
    $('#delete-error').textContent = '';
  });
  $('#delete-confirm-btn').addEventListener('click', async () => {
    const pwd = $('#delete-password').value;
    const errEl = $('#delete-error');
    errEl.textContent = '';
    if (!pwd) { errEl.textContent = 'Veuillez saisir votre mot de passe.'; return; }
    try {
      await API.req('DELETE', '/auth/me', { password: pwd });
      // Clean up and log out
      localStorage.removeItem('tdl_token');
      localStorage.removeItem('tdl_wallpaper');
      localStorage.removeItem('tdl_accent');
      currentUser = null;
      closeSettings();
      transitionTo('auth-screen', 'down');
      toast(t('account_deleted'));
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  /* ── CANVAS COLOR PICKER CLASS ── */
  class CanvasColorPicker {
    constructor(containerId, initialHex, onChange) {
      this.container = $('#' + containerId);
      this.canvasSatVal = this.container.querySelector('.cp-satval');
      this.canvasHue = this.container.querySelector('.cp-hue');
      this.cursorSatVal = this.container.querySelector('.cp-cursor');
      this.cursorHue = this.container.querySelector('.cp-hue-cursor');
      this.previewSwatch = this.container.querySelector('.cp-preview-swatch');
      
      this.hexInput = this.container.querySelector('.cp-hex-input');
      this.rInput = this.container.querySelector('.r-input');
      this.gInput = this.container.querySelector('.g-input');
      this.bInput = this.container.querySelector('.b-input');

      this.onChange = onChange;
      this.ctxSatVal = this.canvasSatVal.getContext('2d', { willReadFrequently: true });
      this.ctxHue = this.canvasHue.getContext('2d', { willReadFrequently: true });

      this.currentHue = 0;
      this.currentSat = 100;
      this.currentVal = 100;

      this.initHueCanvas();
      this.setColor(initialHex);
      this.setupEvents();
    }

    setColor(hex) {
      const rgb = this.hexToRgb(hex);
      if (!rgb) return;
      const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.currentHue = hsv.h;
      this.currentSat = hsv.s * 100;
      this.currentVal = hsv.v * 100;

      this.drawSatValCanvas();
      this.updateUI();
    }

    initHueCanvas() {
      const w = this.canvasHue.width;
      const h = this.canvasHue.height;
      this.ctxHue.clearRect(0, 0, w, h);
      const grad = this.ctxHue.createLinearGradient(0, 0, w, 0);
      const stops = [0, 60, 120, 180, 240, 300, 360];
      stops.forEach(stop => {
        grad.addColorStop(stop / 360, `hsl(${stop}, 100%, 50%)`);
      });
      this.ctxHue.fillStyle = grad;
      this.ctxHue.fillRect(0, 0, w, h);
    }

    drawSatValCanvas() {
      const w = this.canvasSatVal.width;
      const h = this.canvasSatVal.height;
      this.ctxSatVal.clearRect(0, 0, w, h);

      // Base color for Hue
      this.ctxSatVal.fillStyle = `hsl(${this.currentHue}, 100%, 50%)`;
      this.ctxSatVal.fillRect(0, 0, w, h);

      // Saturation (white to transparent)
      const whiteGrad = this.ctxSatVal.createLinearGradient(0, 0, w, 0);
      whiteGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
      whiteGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      this.ctxSatVal.fillStyle = whiteGrad;
      this.ctxSatVal.fillRect(0, 0, w, h);

      // Value (transparent to black)
      const blackGrad = this.ctxSatVal.createLinearGradient(0, 0, 0, h);
      blackGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      blackGrad.addColorStop(1, 'rgba(0, 0, 0, 1)');
      this.ctxSatVal.fillStyle = blackGrad;
      this.ctxSatVal.fillRect(0, 0, w, h);
    }

    updateUI() {
      const wSV = this.canvasSatVal.width;
      const hSV = this.canvasSatVal.height;
      const xSV = (this.currentSat / 100) * wSV;
      const ySV = (1 - (this.currentVal / 100)) * hSV;
      this.cursorSatVal.style.left = `${xSV}px`;
      this.cursorSatVal.style.top = `${ySV}px`;

      const wH = this.canvasHue.width;
      const xH = (this.currentHue / 360) * wH;
      this.cursorHue.style.left = `${xH}px`;

      const hex = this.getHex();
      this.previewSwatch.style.backgroundColor = hex;

      if (document.activeElement !== this.hexInput) {
        this.hexInput.value = hex.replace('#', '').toUpperCase();
      }
      const rgb = this.hexToRgb(hex);
      if (rgb) {
        if (document.activeElement !== this.rInput) this.rInput.value = rgb.r;
        if (document.activeElement !== this.gInput) this.gInput.value = rgb.g;
        if (document.activeElement !== this.bInput) this.bInput.value = rgb.b;
      }
    }

    getHex() {
      const rgb = this.hsvToRgb(this.currentHue / 360, this.currentSat / 100, this.currentVal / 100);
      return this.rgbToHex(rgb.r, rgb.g, rgb.b);
    }

    setupEvents() {
      let isDraggingSV = false;
      let isDraggingHue = false;

      const handleSV = (clientX, clientY) => {
        const rect = this.canvasSatVal.getBoundingClientRect();
        let x = clientX - rect.left;
        let y = clientY - rect.top;
        x = Math.max(0, Math.min(x, rect.width));
        y = Math.max(0, Math.min(y, rect.height));

        this.currentSat = (x / rect.width) * 100;
        this.currentVal = (1 - (y / rect.height)) * 100;
        this.updateUI();
        if (this.onChange) this.onChange(this.getHex());
      };

      const handleHue = (clientX) => {
        const rect = this.canvasHue.getBoundingClientRect();
        let x = clientX - rect.left;
        x = Math.max(0, Math.min(x, rect.width));

        this.currentHue = (x / rect.width) * 360;
        this.drawSatValCanvas();
        this.updateUI();
        if (this.onChange) this.onChange(this.getHex());
      };

      this.canvasSatVal.addEventListener('mousedown', (e) => {
        isDraggingSV = true;
        handleSV(e.clientX, e.clientY);
      });

      this.canvasHue.addEventListener('mousedown', (e) => {
        isDraggingHue = true;
        handleHue(e.clientX);
      });

      window.addEventListener('mousemove', (e) => {
        if (isDraggingSV) handleSV(e.clientX, e.clientY);
        if (isDraggingHue) handleHue(e.clientX);
      });

      window.addEventListener('mouseup', () => {
        isDraggingSV = false;
        isDraggingHue = false;
      });

      // Touch events
      this.canvasSatVal.addEventListener('touchstart', (e) => {
        isDraggingSV = true;
        const t = e.touches[0];
        handleSV(t.clientX, t.clientY);
      }, { passive: true });

      this.canvasHue.addEventListener('touchstart', (e) => {
        isDraggingHue = true;
        const t = e.touches[0];
        handleHue(t.clientX);
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (e.touches.length === 0) return;
        const t = e.touches[0];
        if (isDraggingSV) handleSV(t.clientX, t.clientY);
        if (isDraggingHue) handleHue(t.clientX);
      }, { passive: true });

      window.addEventListener('touchend', () => {
        isDraggingSV = false;
        isDraggingHue = false;
      });

      // Inputs event listeners
      const updateFromInputs = () => {
        let hex = '';
        if (document.activeElement === this.hexInput) {
          let val = this.hexInput.value.trim();
          if (!val.startsWith('#')) val = '#' + val;
          if (/^#[0-9A-F]{6}$/i.test(val)) {
            hex = val;
          } else {
            return;
          }
        } else {
          const r = Math.max(0, Math.min(255, parseInt(this.rInput.value) || 0));
          const g = Math.max(0, Math.min(255, parseInt(this.gInput.value) || 0));
          const b = Math.max(0, Math.min(255, parseInt(this.bInput.value) || 0));
          hex = this.rgbToHex(r, g, b);
        }

        const rgb = this.hexToRgb(hex);
        if (rgb) {
          const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
          this.currentHue = hsv.h;
          this.currentSat = hsv.s * 100;
          this.currentVal = hsv.v * 100;

          this.drawSatValCanvas();

          const wSV = this.canvasSatVal.width;
          const hSV = this.canvasSatVal.height;
          const xSV = (this.currentSat / 100) * wSV;
          const ySV = (1 - (this.currentVal / 100)) * hSV;
          this.cursorSatVal.style.left = `${xSV}px`;
          this.cursorSatVal.style.top = `${ySV}px`;

          const wH = this.canvasHue.width;
          const xH = (this.currentHue / 360) * wH;
          this.cursorHue.style.left = `${xH}px`;

          this.previewSwatch.style.backgroundColor = hex;

          if (document.activeElement !== this.hexInput) {
            this.hexInput.value = hex.replace('#', '').toUpperCase();
          }
          if (document.activeElement !== this.rInput) this.rInput.value = rgb.r;
          if (document.activeElement !== this.gInput) this.gInput.value = rgb.g;
          if (document.activeElement !== this.bInput) this.bInput.value = rgb.b;

          if (this.onChange) this.onChange(hex);
        }
      };

      this.hexInput.addEventListener('input', updateFromInputs);
      this.rInput.addEventListener('input', updateFromInputs);
      this.gInput.addEventListener('input', updateFromInputs);
      this.bInput.addEventListener('input', updateFromInputs);
    }

    hexToRgb(hex) {
      const clean = hex.replace('#', '');
      const num = parseInt(clean, 16);
      return {
        r: (num >> 16) & 255,
        g: (num >> 8) & 255,
        b: num & 255
      };
    }

    rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, v = max;
      const d = max - min;
      s = max === 0 ? 0 : d / max;
      if (max === min) {
        h = 0;
      } else {
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      return { h: h * 360, s, v };
    }

    hsvToRgb(h, s, v) {
      let r, g, b;
      const i = Math.floor(h * 6);
      const f = h * 6 - i;
      const p = v * (1 - s);
      const q = v * (1 - f * s);
      const t = v * (1 - (1 - f) * s);
      switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
      }
      return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
      };
    }

    rgbToHex(r, g, b) {
      return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }
  }

  /* ── WALLPAPER ── */
  const wallpaperStyleTag = (() => {
    const s = document.createElement('style');
    s.id = 'wallpaper-dynamic';
    document.head.appendChild(s);
    return s;
  })();

  let wpColorPickerInstance = null;

  applyWallpaper = function (cfg, persistToDb = true) {
    const screens = ['#home-screen', '#file-screen', '#trash-screen'];
    
    let opacityVal = 0.60;
    if (cfg.opacity !== undefined) {
      opacityVal = Number(cfg.opacity);
    } else if (cfg.type === 'image') {
      opacityVal = 0.55;
    } else if (cfg.type === 'color') {
      opacityVal = 0;
    }
    document.documentElement.style.setProperty('--overlay-opacity', opacityVal);

    const opacityRow = $('#wp-opacity-row');
    if (opacityRow) {
      if (cfg.type === 'color') {
        opacityRow.style.display = 'none';
      } else {
        opacityRow.style.display = 'flex';
        const slider = $('#filter-opacity-slider');
        const label = $('#filter-opacity-val');
        if (slider) slider.value = Math.round(opacityVal * 100);
        if (label) label.textContent = Math.round(opacityVal * 100) + '%';
      }
    }

    if (cfg.type === 'default') {
      wallpaperStyleTag.textContent = '';
    } else if (cfg.type === 'color') {
      const safeColor = String(cfg.value || '#1a1a30').replace(/[^#a-zA-Z0-9,().\s%-]/g, '');
      wallpaperStyleTag.textContent = `
        ${screens.map(s => s + '::before').join(', ')} {
          background-image: none !important;
          background: ${safeColor} !important;
          filter: none !important;
          opacity: 1 !important;
        }
        ${screens.map(s => s + '::after').join(', ')} {
          background: transparent !important;
        }
      `;
    } else if (cfg.type === 'image') {
      const fitMode = ['cover', 'contain', 'auto'].includes(cfg.fit) ? cfg.fit : 'cover';
      const safeUrl = String(cfg.value || '').replace(/['"\\()\r\n]/g, '');
      wallpaperStyleTag.textContent = `
        ${screens.map(s => s + '::before').join(', ')} {
          background-image: url('${safeUrl}') !important;
          background-size: ${fitMode} !important;
          background-position: center !important;
          background-repeat: no-repeat !important;
          filter: none !important;
          opacity: 1 !important;
        }
        ${screens.map(s => s + '::after').join(', ')} {
          background: rgba(10,10,16, var(--overlay-opacity, 0.55)) !important;
        }
        [data-theme="light"] ${screens.map(s => s + '::after').join(', [data-theme="light"] ')} {
          background: rgba(244,245,247, var(--overlay-opacity, 0.65)) !important;
        }
      `;
      const cb = $('#wp-fit-contain');
      if (cb) {
        cb.checked = fitMode === 'contain';
      }
    }

    if (currentUser) {
      localStorage.setItem('tdl_wallpaper_' + currentUser._id, JSON.stringify(cfg));
      if (persistToDb) {
        API.patch('/auth/me', { wallpaper: JSON.stringify(cfg) }).catch(console.error);
      }
    }

    const radios = document.querySelectorAll('input[name="wallpaper"]');
    radios.forEach(r => { r.checked = r.value === cfg.type; });

    if (cfg.type === 'color') {
      $('#wp-color-row').style.display = 'block';
      $('#wp-image-row').style.display = 'none';
      if (wpColorPickerInstance) {
        wpColorPickerInstance.setColor(cfg.value);
      }
      $('#wp-color-preview').style.background = cfg.value;
    } else if (cfg.type === 'image') {
      $('#wp-color-row').style.display = 'none';
      $('#wp-image-row').style.display = 'flex';
    } else {
      $('#wp-color-row').style.display = 'none';
      $('#wp-image-row').style.display = 'none';
    }
  };

  // Instantiate wallpaper picker
  wpColorPickerInstance = new CanvasColorPicker('wp-cpw', '#1a1a30', (hex) => {
    applyWallpaper({ type: 'color', value: hex });
  });

  document.querySelectorAll('input[name="wallpaper"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const type = radio.value;
      if (type === 'default') applyWallpaper({ type: 'default' });
      else if (type === 'color') {
        const hex = wpColorPickerInstance.getHex();
        applyWallpaper({ type: 'color', value: hex });
      }
      else if (type === 'image') {
        const fitMode = $('#wp-fit-contain').checked ? 'contain' : 'cover';
        let wp = localStorage.getItem('tdl_wallpaper_' + currentUser._id);
        let val = '';
        if (wp) {
          try {
            const parsed = JSON.parse(wp);
            if (parsed.type === 'image') val = parsed.value;
          } catch (_) {}
        }
        applyWallpaper({ type: 'image', value: val, fit: fitMode });
        $('#wp-image-row').style.display = 'flex';
      }
    });
  });

  $('#wp-fit-contain').addEventListener('change', () => {
    let wp = localStorage.getItem('tdl_wallpaper_' + currentUser._id);
    if (!wp && currentUser.wallpaper) {
      wp = currentUser.wallpaper;
    }
    let cfg = { type: 'default' };
    if (wp) {
      try {
        cfg = JSON.parse(wp);
      } catch (_) {}
    }
    if (cfg.type === 'image') {
      cfg.fit = $('#wp-fit-contain').checked ? 'contain' : 'cover';
      applyWallpaper(cfg);
    }
  });

  $('#filter-opacity-slider').addEventListener('input', e => {
    const val = parseInt(e.target.value);
    $('#filter-opacity-val').textContent = val + '%';
    document.documentElement.style.setProperty('--overlay-opacity', val / 100);
  });

  $('#filter-opacity-slider').addEventListener('change', e => {
    const val = parseInt(e.target.value);
    let wp = localStorage.getItem('tdl_wallpaper_' + (currentUser ? currentUser._id : ''));
    if (!wp && currentUser && currentUser.wallpaper) {
      wp = currentUser.wallpaper;
    }
    let cfg = { type: 'default' };
    if (wp) {
      try {
        cfg = JSON.parse(wp);
      } catch (_) {}
    }
    cfg.opacity = val / 100;
    applyWallpaper(cfg, true);
  });

  $('#wp-upload-btn').addEventListener('click', () => $('#wallpaper-file-input').click());
  $('#wallpaper-file-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast(t('image_too_heavy'));
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target.result;
      $('#wp-image-preview').style.background = `url(${dataUrl}) center/cover`;
      $('#wp-image-preview').textContent = '';
      const fitMode = $('#wp-fit-contain').checked ? 'contain' : 'cover';
      applyWallpaper({ type: 'image', value: dataUrl, fit: fitMode });
      toast(t('wallpaper_applied'));
    };
    reader.readAsDataURL(file);
  });

  /* ── ACCENT COLOR ── */
  const DEFAULT_ACCENT = '#6C5CE7';

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  function lightenHex(hex, amount = 30) {
    let { r, g, b } = hexToRgb(hex);
    r = Math.min(255, r + amount); g = Math.min(255, g + amount); b = Math.min(255, b + amount);
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  let accColorPickerInstance = null;

  applyAccent = function (hex, persistToDb = true) {
    const root = document.documentElement;
    const { r, g, b } = hexToRgb(hex);
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-light', lightenHex(hex, 30));
    root.style.setProperty('--accent-glow', `rgba(${r},${g},${b},0.25)`);
    root.style.setProperty('--border-focus', hex);

    if (currentUser) {
      localStorage.setItem('tdl_accent_' + currentUser._id, hex);
      if (persistToDb) {
        API.patch('/auth/me', { accent: hex }).catch(console.error);
      }
    }

    if (accColorPickerInstance) {
      accColorPickerInstance.setColor(hex);
    }

    document.querySelectorAll('.accent-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.color === hex);
    });
  };

  // Instantiate accent color picker
  accColorPickerInstance = new CanvasColorPicker('acc-cpw', '#6C5CE7', (hex) => {
    applyAccent(hex);
  });

  // Apply startup defaults
  applyWallpaper({ type: 'default' }, false);
  applyAccent(DEFAULT_ACCENT, false);

  document.querySelectorAll('.accent-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      applyAccent(swatch.dataset.color);
    });
  });

  $('#accent-reset-btn').addEventListener('click', () => {
    applyAccent(DEFAULT_ACCENT);
    toast(t('accent_reset_toast'));
  });

})(); // end settings module


