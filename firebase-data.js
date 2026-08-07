import {
  watchSignedInUser,
  subscribeGroups,
  dashboardStats
} from './firebase-store.js?v=20260807-2';

let currentUser = null;
let stopCargoSubscription = null;
let latestGroups = [];
let clockRefreshTimer = null;
let hasCargoSnapshot = false;

const render = (stats, state, message = '') => {
  if (typeof window.setCargoDashboard !== 'function') return;
  window.setCargoDashboard(stats, { state, message });
};

const stopCargo = () => {
  if (typeof stopCargoSubscription === 'function') stopCargoSubscription();
  stopCargoSubscription = null;
  if (clockRefreshTimer) window.clearInterval(clockRefreshTimer);
  clockRefreshTimer = null;
};

const renderLatestGroups = () => {
  if (!currentUser || !hasCargoSnapshot) return;
  render(dashboardStats(latestGroups), navigator.onLine ? 'live' : 'offline');
};

const errorMessage = error => {
  if (error?.code === 'permission-denied') {
    return 'Firebase 데이터 읽기 권한이 없습니다. Firestore 보안 규칙을 확인해 주세요.';
  }
  if (error?.code === 'unavailable') {
    return 'Firebase 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.';
  }
  return 'Firebase 실시간 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.';
};

const startCargo = () => {
  stopCargo();

  if (!currentUser) {
    render(null, 'auth', '로그인 상태를 확인하는 중…');
    return;
  }
  if (!navigator.onLine) {
    render(null, 'offline');
    return;
  }

  render(null, 'loading', 'Firebase에서 실시간 현황을 불러오는 중…');
  try {
    stopCargoSubscription = subscribeGroups(
      groups => {
        latestGroups = groups;
        hasCargoSnapshot = true;
        renderLatestGroups();
      },
      error => {
        stopCargo();
        render(null, navigator.onLine ? 'error' : 'offline', errorMessage(error));
      }
    );
    // 마감 시각이 지나도 문서 수정 없이 통계가 바뀌도록 주기적으로 다시 계산합니다.
    clockRefreshTimer = window.setInterval(renderLatestGroups, 30_000);
  } catch (error) {
    render(null, navigator.onLine ? 'error' : 'offline', errorMessage(error));
  }
};

const stopAuth = watchSignedInUser(user => {
  currentUser = user;
  latestGroups = [];
  hasCargoSnapshot = false;
  startCargo();
});

window.addEventListener('offline', () => {
  stopCargo();
  render(null, 'offline');
});

window.addEventListener('online', () => {
  startCargo();
});

window.addEventListener('pagehide', () => {
  stopCargo();
  if (typeof stopAuth === 'function') stopAuth();
}, { once: true });
