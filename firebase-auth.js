import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

const showMessage = (text, error = false) => { const target = document.querySelector('[data-auth-message]'); if (target) { target.textContent = text; target.style.color = error ? '#c62929' : '#0d9f6e'; } };
const errorText = code => ({ 'auth/invalid-credential':'이메일 또는 비밀번호를 다시 확인해 주세요.', 'auth/email-already-in-use':'이미 가입된 이메일입니다.', 'auth/weak-password':'비밀번호는 6자 이상으로 입력해 주세요.', 'auth/invalid-email':'올바른 이메일 주소를 입력해 주세요.' }[code] || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
function updateUI(user) { document.querySelectorAll('[data-auth-required]').forEach(el => el.hidden = !user); document.querySelectorAll('[data-auth-guest]').forEach(el => el.hidden = !!user); document.querySelectorAll('[data-user-email]').forEach(el => el.textContent = user?.email || ''); document.querySelectorAll('[data-user-name]').forEach(el => el.textContent = user?.displayName || user?.email?.split('@')[0] || '회원'); }
document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#loginForm');
  if (!isFirebaseConfigured) { updateUI(null); if (form) showMessage('firebase-config.js에 Firebase 설정값을 입력하면 로그인할 수 있습니다.', true); return; }
  const auth = getAuth(initializeApp(firebaseConfig));
  onAuthStateChanged(auth, updateUI);
  document.querySelectorAll('[data-logout]').forEach(button => button.onclick = async e => { e.preventDefault(); await signOut(auth); location.href='index.html'; });
  if (!form) return;
  form.addEventListener('submit', async e => { e.preventDefault(); const email=form.email.value.trim(), password=form.password.value; try { if (form.dataset.mode === 'signup') { const credential=await createUserWithEmailAndPassword(auth,email,password); if(form.name.value.trim()) await updateProfile(credential.user,{displayName:form.name.value.trim()}); } else await signInWithEmailAndPassword(auth,email,password); location.href='mypage.html'; } catch(error) { showMessage(errorText(error.code), true); } });
  document.querySelectorAll('[data-auth-mode]').forEach(button => button.onclick = () => { const signup=button.dataset.authMode==='signup'; form.dataset.mode=signup?'signup':'login'; form.name.closest('label').hidden=!signup; document.querySelector('#authTitle').textContent=signup?'화물메이트 회원가입':'다시 만나서 반가워요'; document.querySelector('#authSubmit').textContent=signup?'회원가입하기':'로그인하기'; document.querySelectorAll('[data-auth-mode]').forEach(item=>item.style.color=item===button?'#1479ff':'#64748b'); showMessage(''); });
});
