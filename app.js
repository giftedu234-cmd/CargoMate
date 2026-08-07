const dashboardState = {
  stats: null
};

const dashboardLabels = {
  loading: {
    badge: '계산 중',
    message: '그룹 현황을 계산하는 중…',
    color: '#cbd5e1'
  },
  live: {
    badge: 'LIVE',
    message: '그룹 등록·참여 현황이 자동으로 반영됩니다.',
    color: '#69f0c0'
  },
  offline: {
    badge: 'OFFLINE',
    message: '오프라인 상태입니다 · 연결되면 자동으로 다시 동기화합니다.',
    color: '#fbbf24'
  },
  error: {
    badge: '오류',
    message: '그룹 현황을 계산하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    color: '#fca5a5'
  },
  auth: {
    badge: '대기',
    message: '로그인 상태를 확인하는 중…',
    color: '#cbd5e1'
  }
};

const safeCount = value => Math.max(0, Math.round(Number(value) || 0));
const localGroupsKey = 'cargomate-local-groups-v1';
const exampleStats = [
  { capacityCbm: 34, currentCbm: 22, activeCargoCount: 3 },
  { capacityCbm: 32, currentCbm: 17.5, activeCargoCount: 2 },
  { capacityCbm: 30, currentCbm: 12, activeCargoCount: 2 }
];

const loadDashboardGroups = () => {
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(localGroupsKey) || '[]');
    if (Array.isArray(parsed)) saved = parsed;
  } catch {
    saved = [];
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recruiting = saved.filter(group => {
    if (group?.isExample || group?.status === 'cancelled' || group?.status === 'completed') return false;
    if (!group?.deadline) return group?.status === 'recruiting';
    const deadline = new Date(`${String(group.deadline).slice(0, 10)}T23:59:59`);
    return group?.status === 'recruiting' && deadline >= today;
  });
  return [...exampleStats, ...recruiting];
};

const refreshLocalDashboard = () => {
  try {
    const groups = loadDashboardGroups();
    const cargoCount = groups.reduce((sum, group) => sum + Math.max(1, Number(group.activeCargoCount) || 1), 0);
    const fillRates = groups.map(group => Math.min(100, Math.max(0, (Number(group.currentCbm) || 0) / Math.max(0.1, Number(group.capacityCbm || group.minCbm) || 0.1) * 100)));
    const averageFill = fillRates.length ? Math.round(fillRates.reduce((sum, value) => sum + value, 0) / fillRates.length) : 0;
    window.setCargoDashboard({ cargoCount, groupCount: groups.length, averageFill }, { state: 'live' });
  } catch {
    window.setCargoDashboard(null, { state: 'error' });
  }
};

window.setCargoDashboard = (stats, options = {}) => {
  if (stats) {
    dashboardState.stats = {
      cargoCount: safeCount(stats.cargoCount),
      groupCount: safeCount(stats.groupCount),
      averageFill: Math.min(100, safeCount(stats.averageFill))
    };
  }

  const state = dashboardLabels[options.state] ? options.state : 'live';
  const presentation = dashboardLabels[state];
  const values = dashboardState.stats;
  const dashboard = document.getElementById('liveDashboard');
  const status = document.getElementById('liveDataStatus');
  const badge = document.getElementById('liveStatusBadge');
  const cargo = document.getElementById('liveCargoCount');
  const groups = document.getElementById('liveGroupCount');
  const average = document.getElementById('liveAverageFill');

  if (dashboard) dashboard.setAttribute('aria-busy', String(state === 'loading' || state === 'auth'));
  if (status) {
    status.textContent = options.message || presentation.message;
    status.style.color = presentation.color;
  }
  if (badge) {
    badge.textContent = presentation.badge;
    badge.style.color = presentation.color;
  }
  if (cargo) cargo.textContent = values ? `${values.cargoCount}건` : '—';
  if (groups) groups.textContent = values ? `${values.groupCount}개` : '—';
  if (average) average.textContent = values ? `${values.averageFill}%` : '—';
};

const activateComparison = selectedCard => {
  const comparisonMessage = document.getElementById('compareMessage');
  document.querySelectorAll('.compare').forEach(card => {
    const selected = card === selectedCard;
    card.classList.toggle('selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  if (!comparisonMessage) return;
  comparisonMessage.textContent = selectedCard.dataset.type === 'mate'
    ? '화주가 화물 조건과 출항 가능성을 확인하고 공동 출항 그룹에 참여합니다.'
    : '포워더가 혼적 구성과 출항 시점을 정하는 기존 LCL 방식입니다.';
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.compare').forEach(card => {
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-pressed', String(card.classList.contains('selected')));
    card.addEventListener('click', () => activateComparison(card));
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activateComparison(card);
    });
  });

  refreshLocalDashboard();
  window.addEventListener('storage', refreshLocalDashboard);
  window.addEventListener('focus', refreshLocalDashboard);
  window.addEventListener('pageshow', refreshLocalDashboard);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshLocalDashboard();
  });
  window.setInterval(refreshLocalDashboard, 1000);
});
