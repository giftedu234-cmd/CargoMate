import {
  watchSignedInUser,
  subscribeCargoData,
  groupMetrics,
  isRecruiting,
  subscribeUserProfile,
  cancelOwnedGroup,
  explainStoreError
} from './firebase-store.js?v=20260807-2';

const createdBox = document.getElementById('createdGroups');
const joinedBox = document.getElementById('joinedGroups');
const penaltyBox = document.getElementById('penaltyStatus');
const notice = document.getElementById('mypageNotice');
const liveStatus = document.getElementById('mypageLiveStatus');
const modal = document.getElementById('ownerCancelModal');
const routeText = document.getElementById('ownerCancelRoute');
const penaltyText = document.getElementById('ownerPenaltyText');
const confirmCancelButton = document.getElementById('confirmOwnerCancel');
const keepGroupButton = document.getElementById('keepOwnerGroup');

let currentUser = null;
let groups = [];
let myApplications = new Map();
let profile = { trustScore: 100, penaltyCount: 0, blockedUntil: null };
let profileError = '';
let dataError = '';
let dataReady = false;
let profileReady = false;
let pendingGroupId = '';
let pendingParticipantCount = 0;
let cancelInProgress = false;
let returnFocusElement = null;
let stopCargoData = null;
let stopProfile = null;

const safe = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
}[character]));

const formatDate = value => {
  if (!value) return '미정';
  const date = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '미정';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
};

const formatNumber = value => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(Number(value) || 0);

const showNotice = (message, type = 'success') => {
  notice.textContent = message;
  notice.classList.toggle('is-error', type === 'error');
  notice.style.display = 'block';
  notice.focus({ preventScroll: true });
};

const setLiveStatus = (message, state = 'loading') => {
  liveStatus.textContent = message;
  liveStatus.dataset.state = state;
};

const statusFor = group => {
  if (group.status === 'cancelled') return { label: '개설자 취소', className: 'is-cancelled' };
  if (group.status === 'completed') return { label: '운송 완료', className: 'is-completed' };
  if (isRecruiting(group)) return { label: '실시간 모집 중', className: 'is-recruiting' };
  return { label: '모집 마감', className: 'is-closed' };
};

const emptyCard = (title, description, actionLabel) => `
  <article class="empty">
    <h3>${safe(title)}</h3>
    <p>${safe(description)}</p>
    <a class="btn" href="matching.html">${safe(actionLabel)}</a>
  </article>`;

const loadingCard = message => `<article class="empty" aria-busy="true"><i class="fa-solid fa-circle-notch fa-spin"></i> ${safe(message)}</article>`;
const errorCard = message => `<article class="empty mypage-error"><i class="fa-solid fa-triangle-exclamation"></i><h3>데이터를 불러오지 못했습니다.</h3><p>${safe(message)}</p></article>`;

const renderProfile = () => {
  if (profileError) {
    penaltyBox.style.display = 'block';
    penaltyBox.textContent = `신뢰 점수를 불러오지 못했습니다: ${profileError}`;
    return;
  }
  if (!profileReady) {
    penaltyBox.style.display = 'block';
    penaltyBox.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 신뢰 점수를 불러오는 중입니다.';
    return;
  }

  const blockedUntil = profile.blockedUntil instanceof Date ? profile.blockedUntil : null;
  const isBlocked = Boolean(blockedUntil && blockedUntil > new Date());
  if (!profile.penaltyCount && !isBlocked) {
    penaltyBox.style.display = 'none';
    penaltyBox.textContent = '';
    return;
  }

  penaltyBox.style.display = 'block';
  penaltyBox.innerHTML = isBlocked
    ? `<b>현재 신뢰 점수 ${formatNumber(profile.trustScore)}점</b><br>그룹 취소 페널티로 ${safe(formatDate(blockedUntil))}까지 새 그룹을 만들 수 없습니다.`
    : `<b>현재 신뢰 점수 ${formatNumber(profile.trustScore)}점</b><br>현재 적용 중인 그룹 생성 제한은 없습니다.`;
};

const renderCreatedGroups = () => {
  if (dataError) {
    createdBox.innerHTML = errorCard(dataError);
    return;
  }
  if (!dataReady) {
    createdBox.innerHTML = loadingCard('내가 만든 그룹을 불러오는 중입니다.');
    return;
  }

  const ownedGroups = groups.filter(group => group.ownerUid === currentUser?.uid);
  createdBox.innerHTML = ownedGroups.length ? ownedGroups.map(group => {
    const metrics = groupMetrics(group);
    const status = statusFor(group);
    const canCancel = isRecruiting(group);
    const cargo = group.creatorCargo || {};
    return `
      <article class="card my-card">
        <div class="space-row">
          <span class="group-state ${status.className}">${safe(status.label)}</span>
          <small>참여 화주 ${metrics.participantCount}명 · 총 화물 ${metrics.activeCargoCount}건</small>
        </div>
        <h3>${safe(group.origin)} → ${safe(group.destination)}</h3>
        <p class="muted">출항 목표 ${safe(formatDate(group.departureDate))} · 모집 마감 ${safe(formatDate(group.deadline))} · ${safe(group.type)}</p>
        <p>개설 화물: <b>${safe(cargo.item || '미입력')}</b> · ${safe(formatNumber(cargo.cbm))} CBM · ${safe(formatNumber(cargo.weight))} kg</p>
        <div class="space-row my-volume-row"><span>${formatNumber(metrics.currentCbm)} / ${formatNumber(group.capacityCbm || group.minCbm)} CBM</span><b>${metrics.fillPercent}%</b></div>
        <div class="progress" aria-label="적재율 ${metrics.fillPercent}%"><span style="width:${metrics.fillPercent}%"></span></div>
        ${canCancel ? `<button class="btn danger-btn owner-cancel" data-group-id="${safe(group.id)}" type="button">그룹 취소</button>` : `<p class="closed-help">${group.status === 'cancelled' ? '취소된 그룹입니다.' : '모집 마감 이후에는 그룹을 취소할 수 없습니다.'}</p>`}
      </article>`;
  }).join('') : emptyCard('아직 만든 그룹이 없습니다.', '화물 조건을 입력해 새로운 출항 그룹을 만들어 보세요.', '새 그룹 만들기');
};

const renderJoinedGroups = () => {
  if (dataError) {
    joinedBox.innerHTML = errorCard(dataError);
    return;
  }
  if (!dataReady) {
    joinedBox.innerHTML = loadingCard('참여한 그룹을 불러오는 중입니다.');
    return;
  }

  const groupsById = new Map(groups.map(group => [group.id, group]));
  const joined = [...myApplications.entries()]
    .map(([groupId, application]) => ({ group: groupsById.get(groupId), application }))
    .filter(item => item.group);

  joinedBox.innerHTML = joined.length ? joined.map(({ group, application }) => {
    const status = statusFor(group);
    return `
      <article class="card my-card">
        <div class="space-row">
          <span class="group-state ${status.className}">${safe(status.label)}</span>
          <span class="tag">참여 신청 완료</span>
        </div>
        <h3>${safe(group.origin)} → ${safe(group.destination)}</h3>
        <p class="muted">출항 목표 ${safe(formatDate(group.departureDate))} · 모집 마감 ${safe(formatDate(group.deadline))}</p>
        <p>내 화물: <b>${safe(application.item || '미입력')}</b> · ${safe(formatNumber(application.cbm))} CBM · ${safe(formatNumber(application.weight))} kg</p>
        <p class="muted">${safe(application.packaging || '포장 미입력')} · ${safe(application.condition || '운송 조건 미입력')}</p>
        ${group.status === 'cancelled' ? '<p class="closed-help is-warning">개설자가 이 그룹을 취소했습니다. 신뢰 점수 페널티는 개설자에게 적용됩니다.</p>' : '<a class="btn" href="matching.html">매칭 화면에서 관리</a>'}
      </article>`;
  }).join('') : emptyCard('참여 신청한 그룹이 없습니다.', '나와 맞는 출항 그룹을 찾아보세요.', '그룹 찾기');
};

const render = () => {
  if (!currentUser) return;
  renderProfile();
  renderCreatedGroups();
  renderJoinedGroups();
};

const openCancelModal = groupId => {
  const group = groups.find(item => item.id === groupId && item.ownerUid === currentUser?.uid);
  if (!group || !isRecruiting(group)) {
    showNotice('이 그룹은 이미 취소되었거나 모집이 마감되어 취소할 수 없습니다.', 'error');
    return;
  }

  const metrics = groupMetrics(group);
  pendingGroupId = group.id;
  pendingParticipantCount = metrics.participantCount;
  returnFocusElement = document.activeElement;
  routeText.textContent = `${group.origin} → ${group.destination} · 모집 마감 ${formatDate(group.deadline)}`;
  penaltyText.textContent = pendingParticipantCount > 0
    ? `이미 ${pendingParticipantCount}명의 화주가 참여했습니다. 취소하면 신뢰 점수 10점이 차감되고 7일 동안 새 그룹을 만들 수 없습니다.`
    : '아직 참여한 화주가 없어 별도의 페널티 없이 취소할 수 있습니다.';
  modal.hidden = false;
  confirmCancelButton.focus();
};

const closeCancelModal = ({ restoreFocus = true, force = false } = {}) => {
  if (cancelInProgress && !force) return;
  modal.hidden = true;
  pendingGroupId = '';
  pendingParticipantCount = 0;
  if (restoreFocus && returnFocusElement?.isConnected) returnFocusElement.focus();
  returnFocusElement = null;
};

const confirmCancellation = async () => {
  if (!currentUser || !pendingGroupId || cancelInProgress) return;
  const targetGroupId = pendingGroupId;
  const expectedParticipants = pendingParticipantCount;
  cancelInProgress = true;
  confirmCancelButton.disabled = true;
  keepGroupButton.disabled = true;
  confirmCancelButton.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> 취소 처리 중';

  try {
    const result = await cancelOwnedGroup(currentUser, targetGroupId);
    closeCancelModal({ restoreFocus: false, force: true });
    const participantCount = Number(result?.participantCount ?? expectedParticipants);
    showNotice(
      participantCount > 0
        ? '그룹을 취소했습니다. 신뢰 점수 10점 차감과 7일 그룹 생성 제한이 적용되었습니다.'
        : '그룹을 페널티 없이 취소했습니다.'
    );
  } catch (error) {
    closeCancelModal({ restoreFocus: false, force: true });
    showNotice(explainStoreError(error), 'error');
  } finally {
    cancelInProgress = false;
    confirmCancelButton.disabled = false;
    keepGroupButton.disabled = false;
    confirmCancelButton.textContent = '예, 취소합니다';
  }
};

createdBox.addEventListener('click', event => {
  const button = event.target.closest('.owner-cancel');
  if (button) openCancelModal(button.dataset.groupId);
});
keepGroupButton.addEventListener('click', () => closeCancelModal());
confirmCancelButton.addEventListener('click', confirmCancellation);
modal.addEventListener('click', event => {
  if (event.target === modal) closeCancelModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !modal.hidden) closeCancelModal();
});

const stopSubscriptions = () => {
  stopCargoData?.();
  stopProfile?.();
  stopCargoData = null;
  stopProfile = null;
};

watchSignedInUser(user => {
  stopSubscriptions();
  currentUser = user;
  groups = [];
  myApplications = new Map();
  profile = { trustScore: 100, penaltyCount: 0, blockedUntil: null };
  profileError = '';
  dataError = '';
  dataReady = false;
  profileReady = false;

  if (!user) {
    setLiveStatus('로그인 정보를 확인하는 중입니다.', 'loading');
    return;
  }

  setLiveStatus('Firebase 실시간 데이터 연결 중…', 'loading');
  render();
  stopCargoData = subscribeCargoData(user.uid, data => {
    groups = data.groups;
    myApplications = data.myApplications;
    dataError = '';
    dataReady = true;
    setLiveStatus('Firebase 실시간 동기화 중', 'live');
    render();
  }, error => {
    dataError = explainStoreError(error);
    dataReady = true;
    setLiveStatus(`실시간 연결 오류: ${dataError}`, 'error');
    render();
  });

  stopProfile = subscribeUserProfile(user.uid, value => {
    profile = value;
    profileError = '';
    profileReady = true;
    renderProfile();
  }, error => {
    profileError = explainStoreError(error);
    profileReady = true;
    renderProfile();
  });
});

window.addEventListener('pagehide', stopSubscriptions, { once: true });
window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});
