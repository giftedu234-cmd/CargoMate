import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const showMessage = (text, error = false) => { const target = document.querySelector('[data-auth-message]'); if (target) { target.textContent = text; target.style.color = error ? '#c62929' : '#0d9f6e'; } };
const errorText = code => ({ 'auth/invalid-credential':'이메일 또는 비밀번호를 다시 확인해 주세요.', 'auth/email-already-in-use':'이미 가입된 이메일입니다. 로그인해 주세요.', 'auth/weak-password':'비밀번호는 6자 이상으로 입력해 주세요.', 'auth/invalid-email':'올바른 이메일 주소를 입력해 주세요.', 'auth/network-request-failed':'네트워크 연결을 확인해 주세요.', 'auth/too-many-requests':'요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.', 'auth/operation-not-allowed':'Firebase Console에서 이메일/비밀번호 로그인을 활성화해 주세요.' }[code] || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
function updateUI(user) { document.querySelectorAll('[data-auth-required]').forEach(element => element.hidden = !user); document.querySelectorAll('[data-auth-guest]').forEach(element => element.hidden = Boolean(user)); document.querySelectorAll('[data-user-email]').forEach(element => element.textContent = user?.email || ''); document.querySelectorAll('[data-user-name]').forEach(element => element.textContent = user?.displayName || user?.email?.split('@')[0] || '회원'); }

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#loginForm');
  if (!isFirebaseConfigured) { updateUI(null); if (form) showMessage('Firebase 설정값을 확인해 주세요.', true); return; }
  let auth;
  try { auth = getAuth(initializeApp(firebaseConfig)); } catch { showMessage('Firebase 연결을 시작하지 못했습니다. 설정값을 확인해 주세요.', true); return; }
  onAuthStateChanged(auth, updateUI);
  document.querySelectorAll('[data-logout]').forEach(button => button.onclick = async event => { event.preventDefault(); await signOut(auth); location.href = 'index.html'; });
  if (!form) return;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const signup = form.dataset.mode === 'signup';
    const submit = document.querySelector('#authSubmit');
    if (signup && form.password.value !== form.confirmPassword.value) { showMessage('비밀번호 확인이 일치하지 않습니다.', true); return; }
    submit.disabled = true; submit.textContent = signup ? '회원가입 중…' : '로그인 중…';
    try {
      if (signup) { const credential = await createUserWithEmailAndPassword(auth, form.email.value.trim(), form.password.value); const name = form.name.value.trim(); if (name) await updateProfile(credential.user, { displayName: name }); }
      else await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
      location.href = 'mypage.html';
    } catch (error) { showMessage(errorText(error.code), true); submit.disabled = false; submit.textContent = signup ? '회원가입하기' : '로그인하기'; }
  });
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.onclick = () => { const signup = button.dataset.authMode === 'signup'; form.dataset.mode = signup ? 'signup' : 'login'; form.name.closest('label').hidden = !signup; form.confirmPassword.closest('label').hidden = !signup; form.password.autocomplete = signup ? 'new-password' : 'current-password'; document.querySelector('#authTitle').textContent = signup ? '화물메이트 회원가입' : '다시 만나서 반가워요'; document.querySelector('#authSubmit').textContent = signup ? '회원가입하기' : '로그인하기'; document.querySelectorAll('[data-auth-mode]').forEach(item => item.style.color = item === button ? '#1479ff' : '#64748b'); showMessage(''); });
});
