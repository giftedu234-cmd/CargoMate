(() => {
  const body = document.body;
  const isProtected = body.dataset.requireAuth === 'true';
  const isLoginPage = body.dataset.loginPage === 'true';
  if (!isProtected && !isLoginPage) return;

  const timeout = window.setTimeout(() => {
    if (body.dataset.authReady === 'true') return;
    if (isProtected) {
      const page = location.pathname.split('/').pop() || 'index.html';
      location.replace(`login.html?next=${encodeURIComponent(page)}&authCheck=failed`);
      return;
    }
    const message = document.querySelector('[data-auth-message]');
    if (message) {
      message.textContent = '로그인 서버 연결이 지연되고 있습니다. 인터넷 연결을 확인한 뒤 새로고침해 주세요.';
      message.style.color = '#c62929';
    }
  }, 8000);

  window.addEventListener('cargomate-auth-ready', () => window.clearTimeout(timeout), { once: true });
})();
