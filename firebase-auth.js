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
const getPendingSignupEmail = () => { try { return localStorage.getItem(signupPendingKey) || ''; } catch { return ''; } };
const setPendingSignupEmail = email => { try { localStorage.setItem(signupPendingKey, email.trim().toLowerCase()); } catch {} };
const clearPendingSignup = () => { try { localStorage.removeItem(signupPendingKey); } catch {} };

if (!isFirebaseConfigured) {
  message('Firebase 설정을 확인해 주세요.', true);
} else {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  let signupInProgress = false;
  let logoutInProgress = false;
  let signupRecoveryInProgress = false;
  let loginSubmitted = false;

  const markAuthReady = () => {
    document.body.dataset.authReady = 'true';
    document.body.style.visibility = '';
    window.dispatchEvent(new CustomEvent('cargomate-auth-ready'));
  };

  const publishUser = user => {
    window.cargoMateAuthUser = user ? { uid: user.uid, email: user.email || '', displayName: user.displayName || '' } : null;
    window.dispatchEvent(new CustomEvent('cargomate-auth-changed', { detail: window.cargoMateAuthUser }));
    document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user?.displayName || user?.email?.split('@')[0] || '회원');
    document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = user?.email || '');
    document.querySelectorAll('[data-auth-required]').forEach(el => el.hidden = !user);
    document.querySelectorAll('[data-auth-guest]').forEach(el => el.hidden = Boolean(user));
  };

  onAuthStateChanged(auth, user => {
    if (!user && signupRecoveryInProgress) {
      publishUser(null);
      return;
    }

    const pendingEmail = getPendingSignupEmail();
    const isPendingSignupUser = Boolean(user && pendingEmail && (user.email || '').toLowerCase() === pendingEmail);
    if (isPendingSignupUser && !signupInProgress) {
      if (signupRecoveryInProgress) return;
      signupRecoveryInProgress = true;
      signOut(auth).then(() => {
        clearPendingSignup();
        signupRecoveryInProgress = false;
        if (document.body.dataset.loginPage === 'true') {
          markAuthReady();
          message('회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.');
        } else {
          const page = location.pathname.split('/').pop() || 'index.html';
          location.replace(`login.html?next=${encodeURIComponent(page)}&signupComplete=1`);
        }
      }).catch(() => {
        signupRecoveryInProgress = false;
        if (document.body.dataset.loginPage === 'true') {
          markAuthReady();
          message('계정은 생성되었지만 로그인 상태를 정리하지 못했습니다. 페이지를 새로고침해 주세요.', true);
        }
      });
      return;
    }
    if (user && pendingEmail && !isPendingSignupUser) clearPendingSignup();

    publishUser(user);
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
      const authCheckFailed = new URLSearchParams(location.search).get('authCheck') === 'failed';
      if (authCheckFailed && !loginSubmitted) {
        const continueButton = document.querySelector('[data-auth-continue]');
        if (continueButton) {
          continueButton.hidden = false;
          continueButton.onclick = () => location.replace(requestedPage());
        }
        message('기존 로그인 상태를 확인했습니다. 계속하기 버튼을 눌러 이동해 주세요.');
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
      const activeMode = signup ? 'signup' : 'login';
      document.querySelectorAll('[data-auth-mode]').forEach(button => {
        const isActive = button.dataset.authMode === activeMode;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
        button.tabIndex = isActive ? 0 : -1;
      });
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
      let accountWasCreated = false;
      try {
        if (signup) {
          signupInProgress = true;
          setPendingSignupEmail(email);
          const credential = await createUserWithEmailAndPassword(auth, email, password);
          accountWasCreated = true;
          const name = form.elements.name.value.trim();
          let profileSaved = true;
          if (name) {
            try { await updateProfile(credential.user, { displayName: name }); }
            catch { profileSaved = false; }
          }
          await signOut(auth);
          clearPendingSignup();
          signupInProgress = false;
          form.reset();
          setMode(false);
          submit.disabled = false;
          message(profileSaved
            ? '회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.'
            : '회원가입은 완료되었지만 이름은 저장되지 않았습니다. 이메일과 비밀번호로 다시 로그인해 주세요.');
          return;
        } else {
          loginSubmitted = true;
          await signInWithEmailAndPassword(auth, email, password);
          message('로그인 정보를 확인했습니다. 이동 중입니다.');
          return;
        }
      } catch (error) {
        if (accountWasCreated) {
          let signedOut = false;
          try {
            await signOut(auth);
            clearPendingSignup();
            signedOut = true;
            form.reset();
            setMode(false);
            message('회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.');
          } catch {
            message('계정은 생성되었지만 로그인 상태를 정리하지 못했습니다. 페이지를 새로고침해 주세요.', true);
          }
          signupInProgress = false;
          submit.disabled = !signedOut;
          submit.textContent = signedOut ? '로그인하기' : '새로고침해 주세요';
          return;
        }
        if (signup) clearPendingSignup();
        loginSubmitted = false;
        signupInProgress = false;
        message(explainError(error.code), true);
        submit.disabled = false; submit.textContent = signup ? '회원가입하기' : '로그인하기';
      }
    });
    const query = new URLSearchParams(location.search);
    if (query.get('signupComplete') === '1') message('회원가입이 완료되었습니다. 가입한 이메일과 비밀번호로 다시 로그인해 주세요.');
    else if (query.get('loggedOut') === '1') message('로그아웃되었습니다. 다시 이용하려면 로그인해 주세요.');
    else if (query.get('authCheck') === 'failed') message('로그인 상태 확인이 지연되었습니다. 로그인하거나 확인이 끝날 때까지 잠시 기다려 주세요.', true);
  }
}
