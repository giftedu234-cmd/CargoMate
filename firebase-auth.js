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
  const allowedPages = ['index.html', 'matching.html', 'calculator.html', 'mypage.html'];
  return allowedPages.includes(next) ? next : 'mypage.html';
};

const signupPendingKey = 'cargomate-signup-must-login-again';

if (!isFirebaseConfigured) {
  message('Firebase 설정을 확인해 주세요.', true);
} else {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  let signupInProgress = false;
  let logoutInProgress = false;
  let signupRecoveryInProgress = false;

  const markAuthReady = () => {
    document.body.dataset.authReady = 'true';
    document.body.style.visibility = '';
    window.dispatchEvent(new CustomEvent('cargomate-auth-ready'));
  };

  onAuthStateChanged(auth, user => {
    window.cargoMateAuthUser = user ? { uid: user.uid, email: user.email || '', displayName: user.displayName || '' } : null;
    window.dispatchEvent(new CustomEvent('cargomate-auth-changed', { detail: window.cargoMateAuthUser }));
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user?.displayName || user?.email?.split('@')[0] || '회원');
    document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = user?.email || '');
    document.querySelectorAll('[data-auth-required]').forEach(el => el.hidden = !user);
    document.querySelectorAll('[data-auth-guest]').forEach(el => el.hidden = Boolean(user));
    if (document.body.dataset.requireAuth === 'true') {
      if (!user && !logoutInProgress) {
        location.replace(`login.html?next=${encodeURIComponent(location.pathname.split('/').pop() || 'index.html')}`);
        return;
      }
      if (user) markAuthReady();
    } else {
      markAuthReady();
    }

    if (document.body.dataset.loginPage === 'true' && user && !signupInProgress) {
      if (sessionStorage.getItem(signupPendingKey) === '1') {
        if (signupRecoveryInProgress) return;
        signupRecoveryInProgress = true;
        signOut(auth).then(() => {
          sessionStorage.removeItem(signupPendingKey);
          message('회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.');
        }).catch(() => {
          message('계정은 생성되었지만 로그인 상태를 정리하지 못했습니다. 페이지를 새로고침해 주세요.', true);
        }).finally(() => { signupRecoveryInProgress = false; });
        return;
      }
      location.replace(requestedPage());
    }
  });

  document.querySelectorAll('[data-logout]').forEach(button => {
    button.addEventListener('click', async event => {
      event.preventDefault();
      logoutInProgress = true;
      button.disabled = true;
      const originalText = button.textContent;
      button.textContent = '로그아웃 중…';
      try {
        await signOut(auth);
        location.replace('login.html?loggedOut=1');
      } catch {
        logoutInProgress = false;
        button.disabled = false;
        button.textContent = originalText;
        message('로그아웃하지 못했습니다. 잠시 후 다시 시도해 주세요.', true);
      }
    });
  });

  const form = document.getElementById('loginForm');
  if (form) {
    const setMode = signup => {
      form.dataset.mode = signup ? 'signup' : 'login';
      document.getElementById('nameField').hidden = !signup;
      document.getElementById('confirmField').hidden = !signup;
      document.getElementById('authTitle').textContent = signup ? '화물메이트 회원가입' : '다시 만나서 반가워요';
      document.getElementById('authSubmit').textContent = signup ? '회원가입하기' : '로그인하기';
      form.elements.name.required = signup;
      form.elements.confirmPassword.required = signup;
      form.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
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
          signupInProgress = true;
          sessionStorage.setItem(signupPendingKey, '1');
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          const name = form.elements.name.value.trim();
          let profileSaved = true;
          if (name) {
            try { await updateProfile(credential.user, { displayName: name }); }
            catch { profileSaved = false; }
          }
          await signOut(auth);
          sessionStorage.removeItem(signupPendingKey);
          signupInProgress = false;
          form.reset();
          setMode(false);
          submit.disabled = false;
          message(profileSaved
            ? '회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.'
            : '회원가입은 완료되었지만 이름은 저장되지 않았습니다. 이메일과 비밀번호로 다시 로그인해 주세요.');
          return;
        } else {
          await signInWithEmailAndPassword(auth, email, password);
          message('로그인 정보를 확인했습니다. 이동 중입니다.');
          return;
        }
      } catch (error) {
        const accountWasCreated = signup && Boolean(auth.currentUser);
        if (accountWasCreated) {
          try {
            await signOut(auth);
            sessionStorage.removeItem(signupPendingKey);
            form.reset();
            setMode(false);
            message('회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.');
          } catch {
            message('계정은 생성되었지만 로그인 상태를 정리하지 못했습니다. 페이지를 새로고침해 주세요.', true);
          }
          signupInProgress = false;
          submit.disabled = false;
          submit.textContent = '로그인하기';
          return;
        }
        if (signup) sessionStorage.removeItem(signupPendingKey);
        signupInProgress = false;
        message(explainError(error.code), true);
        submit.disabled = false; submit.textContent = signup ? '회원가입하기' : '로그인하기';
      }
    });
    if (new URLSearchParams(location.search).get('loggedOut') === '1') message('로그아웃되었습니다. 다시 이용하려면 로그인해 주세요.');
  }
}
