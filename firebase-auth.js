import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const message = (text, isError = false) => {
  const target = document.querySelector('[data-auth-message]');
  if (target) { target.textContent = text; target.style.color = isError ? '#c62929' : '#0d9f6e'; }
};

const explainError = code => ({
  'auth/invalid-credential': '이메일 또는 비밀번호를 다시 확인해 주세요.',
  'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
  'auth/weak-password': '비밀번호는 6자 이상으로 입력해 주세요.',
  'auth/invalid-email': '올바른 이메일 주소를 입력해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인해 주세요.',
  'auth/too-many-requests': '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  'auth/operation-not-allowed': 'Firebase Console에서 이메일/비밀번호 로그인을 활성화해 주세요.'
}[code] || '로그인을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');

const requestedPage = () => {
  const next = new URLSearchParams(location.search).get('next');
  return next && /^[a-zA-Z0-9-]+\.html$/.test(next) ? next : 'mypage.html';
};

if (!isFirebaseConfigured) {
  message('Firebase 설정을 확인해 주세요.', true);
} else {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);

  onAuthStateChanged(auth, user => {
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user?.displayName || user?.email?.split('@')[0] || '회원');
    document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = user?.email || '');
    document.querySelectorAll('[data-auth-required]').forEach(el => el.hidden = !user);
    document.querySelectorAll('[data-auth-guest]').forEach(el => el.hidden = Boolean(user));
    if (document.body.dataset.requireAuth === 'true' && !user) location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`);
    if (document.body.dataset.loginPage === 'true' && user) location.replace(requestedPage());
  });

  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async event => { event.preventDefault(); await signOut(auth); location.replace('index.html'); });
  });

  const form = document.getElementById('loginForm');
  if (form) {
    const setMode = signup => {
      form.dataset.mode = signup ? 'signup' : 'login';
      document.getElementById('nameField').hidden = !signup;
      document.getElementById('confirmField').hidden = !signup;
      document.getElementById('authTitle').textContent = signup ? '화물메이트 회원가입' : '다시 만나서 반가워요';
      document.getElementById('authSubmit').textContent = signup ? '회원가입하기' : '로그인하기';
      document.querySelectorAll('[data-auth-mode]').forEach(button => button.style.color = button.dataset.authMode === (signup ? 'signup' : 'login') ? '#1479ff' : '#64748b');
      message('');
    };
    document.querySelectorAll('[data-auth-mode]').forEach(button => button.onclick = () => setMode(button.dataset.authMode === 'signup'));
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const signup = form.dataset.mode === 'signup';
      const email = form.elements.email.value.trim();
      const password = form.elements.password.value;
      if (signup && password !== form.elements.confirmPassword.value) return message('비밀번호 확인이 일치하지 않습니다.', true);
      const submit = document.getElementById('authSubmit');
      submit.disabled = true; submit.textContent = signup ? '회원가입 중…' : '로그인 중…';
      try {
        if (signup) {
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          const name = form.elements.name.value.trim();
          if (name) await updateProfile(credential.user, { displayName: name });
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
        location.replace(requestedPage());
      } catch (error) {
        message(explainError(error.code), true);
        submit.disabled = false; submit.textContent = signup ? '회원가입하기' : '로그인하기';
      }
    });
  }
}
