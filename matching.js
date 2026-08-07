import {
  watchSignedInUser,
  groupMetrics,
  isRecruiting
} from './firebase-store.js?v=20260807-3';

const $ = selector => document.querySelector(selector);
const safe = value => String(value ?? '').replace(/[&<>'"]/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;'
}[character]));

const matchForm = $('#matchForm');
const createForm = $('#createForm');
const joinForm = $('#joinForm');
const result = $('#matchResults');
const summary = $('#matchSummary');
const dataStatus = $('#dataStatus');
const createNotice = $('#createNotice');
const openCreateButton = $('#openCreate');
const joinModal = $('#joinModal');
const successModal = $('#successModal');
const cancelModal = $('#cancelModal');
const confirmCancelButton = $('#confirmCancel');
const keepApplicationButton = $('#keepApplication');

let currentUser = null;
let groups = [];
let myApplications = new Map();
let localApplications = new Map();
let profile = { blockedUntil: null };
let dataConnected = false;
let applicationAccess = 'pending';
let filterActive = false;
let activeJoinId = '';
let activeCancelId = '';
let stopCargoData = null;
let stopProfile = null;
let createNoticeTimer = null;
let createNoticeCleanupTimer = null;
const pendingGroups = new Set();

const localApplicationKey = uid => `cargomate-local-applications-v1-${uid}`;
const localGroupsKey = 'cargomate-local-groups-v1';
const loadLocalApplications = uid => {
  try {
    const value = JSON.parse(localStorage.getItem(localApplicationKey(uid)) || '{}');
    return new Map(Object.entries(value && typeof value === 'object' ? value : {}));
  } catch {
    return new Map();
  }
};
const saveLocalApplications = () => {
  if (!currentUser) return;
  localStorage.setItem(localApplicationKey(currentUser.uid), JSON.stringify(Object.fromEntries(localApplications)));
};
const mergeApplications = remoteApplications => {
  const merged = new Map(localApplications);
  remoteApplications.forEach((application, groupId) => merged.set(groupId, application));
  return merged;
};

const loadLocalGroups = () => {
  try {
    const value = JSON.parse(localStorage.getItem(localGroupsKey) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const saveLocalGroups = () => localStorage.setItem(localGroupsKey, JSON.stringify(groups));

const localDateString = date => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const localToday = () => localDateString(new Date());

const shiftDate = (value, days) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return localDateString(date);
};

const selectedDestination = (selectId, inputId) => {
  const selected = $(selectId).value;
  return selected === '__custom__' ? $(inputId).value.trim() : selected;
};

const setupCustomDestination = (selectId, fieldId, inputId) => {
  const select = $(selectId);
  const field = $(fieldId);
  const input = $(inputId);
  const update = () => {
    const custom = select.value === '__custom__';
    field.hidden = !custom;
    input.required = custom;
    if (custom) input.focus();
  };
  select.addEventListener('change', update);
  update();
};

const formatDate = value => {
  if (!value) return '미정';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '미정';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(date);
};

const formatNumber = value => {
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(number) : '미입력';
};

const stageFor = group => {
  const metrics = groupMetrics(group);
  return metrics.currentCbm >= Number(group.minCbm)
    ? { number: 2, label: '최소 물량 달성 · 출항 확인 대기', color: '#0d9f6e' }
    : { number: 1, label: '모집 중 · 최소 물량 확보 필요', color: '#1565d8' };
};

const activeCreationBlock = () => {
  const blockedUntil = profile?.blockedUntil;
  return blockedUntil instanceof Date && blockedUntil > new Date() ? blockedUntil : null;
};

const setDataStatus = (state, message) => {
  dataStatus.dataset.state = state;
  dataStatus.textContent = message;
  dataStatus.hidden = !message;
};

const showNotice = (text = '새 그룹을 등록했습니다. 개설자의 화물 정보도 그룹 카드에 표시됩니다.', isError = false) => {
  clearTimeout(createNoticeTimer);
  clearTimeout(createNoticeCleanupTimer);
  if (String(text).includes('Firebase 데이터 권한이 없습니다') || String(text).includes('Firestore 보안 규칙을 확인해 주세요')) {
    createNotice.textContent = '';
    createNotice.style.display = 'none';
    createNotice.classList.remove('is-visible', 'notice-error');
    return;
  }
  createNotice.textContent = text;
  createNotice.classList.toggle('notice-error', isError);
  createNotice.style.display = 'block';
  createNotice.classList.remove('is-visible');
  requestAnimationFrame(() => requestAnimationFrame(() => createNotice.classList.add('is-visible')));
  createNoticeTimer = setTimeout(() => {
    createNotice.classList.remove('is-visible');
    createNoticeCleanupTimer = setTimeout(() => {
      createNotice.style.display = 'none';
    }, 850);
  }, 5000);
};

const setButtonBusy = (button, busy, busyLabel = '처리 중…') => {
  if (!button) return;
  if (!button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.idleLabel;
};

const updateDeadline = () => {
  const departure = $('#newDate');
  const offset = Number($('#newDeadlineOffset').value);
  departure.min = shiftDate(localToday(), offset);
  if (departure.value && departure.value < departure.min) departure.value = '';
  $('#newDeadline').value = shiftDate(departure.value, -offset);
};

const filteredGroups = () => {
  const recruiting = groups.filter(group => isRecruiting(group));
  if (!filterActive) return recruiting;

  const origin = $('#origin').value;
  const destination = selectedDestination('#destination', '#destinationCustom');
  const sailingDate = $('#sailingDate').value;
  const cargoCbm = Number($('#cargoCbm').value) || 0;
  return recruiting.filter(group => {
    const metrics = groupMetrics(group);
    const alreadyRelated = group.ownerUid === currentUser?.uid || myApplications.has(group.id);
    return group.origin === origin
      && group.destination === destination
      && (!sailingDate || group.departureDate >= sailingDate)
      && (alreadyRelated || metrics.remainingCbm >= cargoCbm);
  });
};

const cardMarkup = group => {
  const application = myApplications.get(group.id);
  const isOwner = Boolean(currentUser && group.ownerUid === currentUser.uid);
  const metrics = groupMetrics(group);
  const stage = stageFor(group);
  const cargo = group.creatorCargo || {};
  const progress = Math.min(100, Math.max(0, metrics.fillPercent));
  const pending = pendingGroups.has(group.id);
  const isFull = metrics.remainingCbm <= 0;
  const unavailable = pending || !dataConnected;
  const buttonLabel = pending
    ? '처리 중…'
    : application
      ? '참여 신청 취소'
      : isFull
        ? '모집 물량 달성'
        : '그룹 참여 신청하기';

  const action = isOwner
    ? '<button class="btn btn-light" type="button" disabled style="margin-top:18px;width:100%">내가 만든 그룹 · 마이페이지에서 관리</button>'
    : `<button class="btn join${application ? ' cancel-application' : ''}" data-group-id="${safe(encodeURIComponent(group.id))}" data-applied="${Boolean(application)}" type="button" style="margin-top:18px;width:100%"${unavailable || (isFull && !application) ? ' disabled' : ''}>${buttonLabel}</button>`;

  const applicationMarkup = application
    ? `<div class="my-application">내 신청 화물: ${safe(application.item)} · ${safe(formatNumber(application.cbm))} CBM · ${safe(formatNumber(application.weight))} kg · ${safe(application.condition)}</div>`
    : '';

  return `<article class="card match-card">
    <div class="space-row"><span class="tag" style="color:${stage.color}">${stage.label}</span><small>화주 ${metrics.activeCargoCount}명</small></div>
    <h3>${safe(group.origin)} → ${safe(group.destination)}</h3>
    <p class="muted">출항 목표 ${safe(formatDate(group.departureDate))} · ${safe(group.type)}</p>
    <section class="creator-cargo">
      <h4><i class="fa-solid fa-box"></i> 그룹 개설자 화물 정보</h4>
      <div class="cargo-facts">
        <div><span>품목</span><b>${safe(cargo.item || '미입력')}</b></div>
        <div><span>화물 부피</span><b>${Number(cargo.cbm) > 0 ? `${safe(formatNumber(cargo.cbm))} CBM` : '미입력'}</b></div>
        <div><span>중량</span><b>${Number(cargo.weight) > 0 ? `${safe(formatNumber(cargo.weight))} kg` : '미입력'}</b></div>
        <div><span>포장 형태</span><b>${safe(cargo.packaging || '미입력')}</b></div>
        <div><span>운송 조건</span><b>${safe(cargo.condition || '미입력')}</b></div>
      </div>
      <p class="cargo-notes"><b>특이사항:</b> ${safe(cargo.notes || '없음')}</p>
    </section>
    <p style="font-size:13px;font-weight:800;margin:16px 0 6px">진행 단계: ${stage.number}/3 · ${stage.label}</p>
    <p class="muted" style="font-size:12px;margin:0 0 10px">모집 중 → 최소 물량 달성 → 출항 확정</p>
    <div class="space-row"><span>최소 ${safe(formatNumber(group.minCbm))} CBM 중 <b>${safe(formatNumber(metrics.currentCbm))} CBM 확보</b></span><b style="color:${stage.color}">${metrics.remainingCbm ? `${safe(formatNumber(metrics.remainingCbm))} CBM 더 필요` : '출항 확인 가능'}</b></div>
    <div class="progress"><span style="width:${progress}%;background:${stage.color}"></span></div>
    <div class="space-row" style="font-size:13px"><span>모집 마감: ${safe(formatDate(group.deadline))}</span><span>모집 현황</span></div>
    ${applicationMarkup}
    ${action}
  </article>`;
};

const render = () => {
  const visibleGroups = filteredGroups();
  result.setAttribute('aria-busy', String(!dataConnected));

  if (!dataConnected && !groups.length) {
    summary.textContent = '그룹 데이터를 불러오는 중입니다.';
    result.innerHTML = '<article class="empty">그룹 데이터를 불러오는 중입니다.</article>';
    return;
  }

  summary.textContent = visibleGroups.length
    ? `${visibleGroups.length}개의 출항 그룹을 찾았습니다. 개설자 화물과 출항 조건을 확인해 주세요.`
    : filterActive
      ? '입력한 조건과 적재 가능 부피에 맞는 그룹이 없습니다. 새 그룹을 만들어 보세요.'
      : '현재 모집 중인 그룹이 없습니다. 새 그룹을 만들어 보세요.';
  result.innerHTML = visibleGroups.length
    ? visibleGroups.map(cardMarkup).join('')
    : '<article class="empty">조건을 바꾸거나 새 그룹을 등록해 보세요.</article>';

  result.querySelectorAll('.join').forEach(button => {
    button.addEventListener('click', () => {
      const groupId = decodeURIComponent(button.dataset.groupId);
      if (button.dataset.applied === 'true') {
        activeCancelId = groupId;
        cancelModal.hidden = false;
        confirmCancelButton.focus();
        return;
      }

      const group = groups.find(item => item.id === groupId);
      if (!group) {
        showNotice('그룹 정보가 갱신되었습니다. 잠시 후 다시 시도해 주세요.', true);
        return;
      }
      activeJoinId = groupId;
      $('#joinGroupName').textContent = `${group.origin} → ${group.destination} · ${formatDate(group.departureDate)} 출항 목표`;
      joinForm.reset();
      const remainingCbm = groupMetrics(group).remainingCbm;
      joinForm.elements.cbm.max = String(remainingCbm);
      joinForm.elements.cbm.value = Math.min(Number($('#cargoCbm').value) || remainingCbm, remainingCbm);
      $('#joinCbmHelp').textContent = `최대 ${formatNumber(remainingCbm)} CBM까지 신청할 수 있습니다.`;
      joinModal.hidden = false;
      joinForm.elements.item.focus();
    });
  });
};

const closeModal = modal => {
  modal.hidden = true;
};

matchForm.addEventListener('submit', event => {
  event.preventDefault();
  filterActive = true;
  render();
});

$('#newDate').addEventListener('change', updateDeadline);
$('#newDeadlineOffset').addEventListener('change', updateDeadline);
$('#sailingDate').min = localToday();
updateDeadline();
setupCustomDestination('#destination', '#destinationCustomField', '#destinationCustom');
setupCustomDestination('#newDestination', '#newDestinationCustomField', '#newDestinationCustom');

openCreateButton.addEventListener('click', () => {
  const blockedUntil = activeCreationBlock();
  if (blockedUntil) {
    showNotice(`그룹 취소 페널티로 ${formatDate(localDateString(blockedUntil))}까지 새 그룹을 만들 수 없습니다.`, true);
    return;
  }
  createForm.hidden = !createForm.hidden;
  if (!createForm.hidden) {
    updateDeadline();
    $('#newDate').focus();
  }
});

createForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !dataConnected) {
    showNotice('로그인 상태를 확인한 뒤 다시 시도해 주세요.', true);
    return;
  }

  const blockedUntil = activeCreationBlock();
  if (blockedUntil) {
    showNotice(`그룹 취소 페널티로 ${formatDate(localDateString(blockedUntil))}까지 새 그룹을 만들 수 없습니다.`, true);
    return;
  }

  const submitButton = createForm.querySelector('[type="submit"]');
  setButtonBusy(submitButton, true, '그룹 등록 중…');
  try {
    const deadlineOffsetDays = Number($('#newDeadlineOffset').value);
    const departureDate = $('#newDate').value;
    const input = {
      origin: $('#newOrigin').value,
      destination: selectedDestination('#newDestination', '#newDestinationCustom'),
      departureDate,
      deadlineOffsetDays,
      deadline: shiftDate(departureDate, -deadlineOffsetDays),
      minCbm: Number($('#newMinimum').value),
      type: '40ft HQ',
      creatorCargo: {
        item: $('#newCargoItem').value.trim(),
        cbm: Number($('#newMyVolume').value),
        weight: Number($('#newWeight').value),
        packaging: $('#newPackaging').value,
        condition: $('#newCondition').value,
        notes: $('#newNotes').value.trim()
      }
    };
    if (!input.destination) throw new Error('도착 항구를 입력해 주세요.');
    if (!input.departureDate || !input.deadline) throw new Error('출항 목표일을 선택해 주세요.');
    if (input.creatorCargo.cbm <= 0 || input.creatorCargo.cbm > input.minCbm) throw new Error('최소 출항 물량은 개설자 화물 부피 이상이어야 합니다.');
    groups.unshift({
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ownerUid: currentUser.uid,
      ...input,
      capacityCbm: input.minCbm,
      currentCbm: input.creatorCargo.cbm,
      activeCargoCount: 1,
      status: 'recruiting',
      storageMode: 'browser',
      createdAt: new Date().toISOString()
    });
    saveLocalGroups();
    filterActive = false;
    createForm.reset();
    $('#newDestination').dispatchEvent(new Event('change'));
    createForm.hidden = true;
    updateDeadline();
    showNotice();
  } catch (error) {
    showNotice(error?.message || '그룹을 등록하지 못했습니다.', true);
  } finally {
    setButtonBusy(submitButton, false);
  }
});

joinForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !activeJoinId || pendingGroups.has(activeJoinId)) return;

  const submitButton = joinForm.querySelector('[type="submit"]');
  const form = new FormData(joinForm);
  const groupId = activeJoinId;
  pendingGroups.add(groupId);
  setButtonBusy(submitButton, true, '신청 저장 중…');
  render();
  try {
    const cargo = {
      item: String(form.get('item')).trim(),
      cbm: Number(form.get('cbm')),
      weight: Number(form.get('weight')),
      packaging: String(form.get('packaging')),
      condition: String(form.get('condition')),
      notes: String(form.get('notes')).trim()
    };
    const targetGroup = groups.find(group => group.id === groupId);
    if (!targetGroup) throw new Error('그룹을 찾을 수 없습니다.');
    const remainingCbm = groupMetrics(targetGroup).remainingCbm;
    if (!Number.isFinite(cargo.cbm) || cargo.cbm <= 0 || cargo.cbm > remainingCbm) {
      throw new Error(`화물 부피는 최대 ${formatNumber(remainingCbm)} CBM까지 입력할 수 있습니다.`);
    }
    localApplications.set(groupId, {
      ...cargo,
      applicantUid: currentUser.uid,
      status: 'active',
      storageMode: 'browser',
      appliedAt: new Date().toISOString()
    });
    targetGroup.currentCbm = Number(targetGroup.currentCbm || 0) + cargo.cbm;
    targetGroup.activeCargoCount = Number(targetGroup.activeCargoCount || 1) + 1;
    saveLocalGroups();
    saveLocalApplications();
    myApplications = mergeApplications(new Map());
    $('#successMessage').textContent = '화물 정보 입력과 그룹 참여 신청이 완료되었습니다.';
    activeJoinId = '';
    closeModal(joinModal);
    successModal.hidden = false;
    $('#closeSuccess').focus();
  } catch (error) {
    showNotice(error?.message || '참여 신청을 저장하지 못했습니다.', true);
  } finally {
    pendingGroups.delete(groupId);
    setButtonBusy(submitButton, false);
    render();
  }
});

confirmCancelButton.addEventListener('click', async () => {
  if (!currentUser || !activeCancelId || pendingGroups.has(activeCancelId)) return;
  const groupId = activeCancelId;
  pendingGroups.add(groupId);
  setButtonBusy(confirmCancelButton, true, '취소 중…');
  keepApplicationButton.disabled = true;
  render();
  try {
    const application = myApplications.get(groupId);
    if (application) {
      const targetGroup = groups.find(group => group.id === groupId);
      if (targetGroup) {
        targetGroup.currentCbm = Math.max(Number(targetGroup.creatorCargo?.cbm || 0), Number(targetGroup.currentCbm || 0) - Number(application.cbm || 0));
        targetGroup.activeCargoCount = Math.max(1, Number(targetGroup.activeCargoCount || 1) - 1);
        saveLocalGroups();
      }
    }
    localApplications.delete(groupId);
    saveLocalApplications();
    myApplications.delete(groupId);
    activeCancelId = '';
    closeModal(cancelModal);
    showNotice('그룹 참여 신청을 취소했습니다.');
  } catch (error) {
    showNotice(error?.message || '참여 신청을 취소하지 못했습니다.', true);
  } finally {
    pendingGroups.delete(groupId);
    setButtonBusy(confirmCancelButton, false);
    keepApplicationButton.disabled = false;
    render();
  }
});

$('#closeJoin').addEventListener('click', () => closeModal(joinModal));
$('#closeSuccess').addEventListener('click', () => closeModal(successModal));
keepApplicationButton.addEventListener('click', () => closeModal(cancelModal));

[joinModal, successModal, cancelModal].forEach(modal => {
  modal.addEventListener('click', event => {
    if (event.target === modal && !pendingGroups.size) closeModal(modal);
  });
});

document.addEventListener('keydown', event => {
  if (event.key !== 'Escape' || pendingGroups.size) return;
  [joinModal, successModal, cancelModal].forEach(closeModal);
});

const stopAuth = watchSignedInUser(user => {
  stopCargoData?.();
  stopProfile?.();
  stopCargoData = null;
  stopProfile = null;
  currentUser = user;
  groups = loadLocalGroups();
  myApplications = new Map();
  localApplications = user ? loadLocalApplications(user.uid) : new Map();
  myApplications = mergeApplications(new Map());
  dataConnected = Boolean(user);
  applicationAccess = 'local';
  openCreateButton.disabled = !user;
  render();

  if (!user) {
    setDataStatus('error', '로그인이 필요합니다. 로그인 화면으로 이동합니다.');
    return;
  }

  setDataStatus('ready', '');
  render();
});

window.addEventListener('pagehide', () => {
  stopAuth?.();
  stopCargoData?.();
  stopProfile?.();
});

render();
