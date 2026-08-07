import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

if (!isFirebaseConfigured) throw new Error('Firebase 설정이 완료되지 않았습니다.');

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const groupsCollection = collection(db, 'cargoGroups');

const DAY_MS = 24 * 60 * 60 * 1000;
const numberOr = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const rounded = value => Math.round(value * 10) / 10;
const cleanText = (value, max = 300) => String(value ?? '').trim().slice(0, max);

const localDateString = date => {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
};

const dateString = value => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (typeof value.toDate === 'function') return localDateString(value.toDate());
  return localDateString(value);
};

const endOfLocalDay = value => {
  const date = new Date(`${value}T23:59:59.999`);
  if (Number.isNaN(date.getTime())) throw storeError('invalid-date', '날짜 형식이 올바르지 않습니다.');
  return date;
};

const dateMinusDays = (value, days) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - days);
  return localDateString(date);
};

const storeError = (code, message) => Object.assign(new Error(message), { code });

const normalizeCargo = cargo => {
  const item = cleanText(cargo?.item, 80);
  const cbm = rounded(numberOr(cargo?.cbm));
  const weight = rounded(numberOr(cargo?.weight));
  const packaging = cleanText(cargo?.packaging, 40);
  const condition = cleanText(cargo?.condition, 40);
  const notes = cleanText(cargo?.notes, 300);
  if (!item || cbm <= 0 || weight <= 0 || !packaging || !condition) {
    throw storeError('invalid-cargo', '품목·부피·중량·포장·운송 조건을 모두 입력해 주세요.');
  }
  return { item, cbm, weight, packaging, condition, notes };
};

const normalizedStatus = value => value === 'open' ? 'recruiting' : (value || 'recruiting');

export const watchSignedInUser = callback => onAuthStateChanged(auth, user => callback(user ? {
  uid: user.uid,
  email: user.email || '',
  displayName: user.displayName || ''
} : null));

export const normalizeGroup = snapshot => {
  const data = snapshot.data();
  const legacyFill = Math.max(0, numberOr(data.fillPercent ?? data.fill));
  const legacyRemaining = Math.max(0, numberOr(data.remaining));
  const explicitCapacity = numberOr(data.capacityCbm ?? data.minCbm);
  const inferredCapacity = legacyFill > 0 && legacyFill < 100 && legacyRemaining > 0
    ? legacyRemaining / (1 - legacyFill / 100)
    : 28;
  const capacityCbm = Math.max(0.1, rounded(explicitCapacity || inferredCapacity));
  const minCbm = Math.max(0.1, rounded(numberOr(data.minCbm, capacityCbm)));
  const inferredCurrent = rounded(capacityCbm * legacyFill / 100);
  const creatorCargo = data.creatorCargo || {
    item: data.cargoItem || '화물 정보 미입력',
    cbm: rounded(numberOr(data.ownerCbm)),
    weight: numberOr(data.weight),
    packaging: data.packaging || '미입력',
    condition: data.condition || '일반 화물',
    notes: data.notes || ''
  };
  const explicitCurrent = Number(data.currentCbm);
  const currentCbm = Math.max(0, rounded(Number.isFinite(explicitCurrent)
    ? explicitCurrent
    : (legacyFill ? inferredCurrent : numberOr(creatorCargo.cbm))));
  const legacyCount = Math.max(1, Math.round(numberOr(data.members ?? data.memberCount, 1)));
  const activeCargoCount = Math.max(1, Math.round(numberOr(data.activeCargoCount, legacyCount)));

  return {
    id: snapshot.id,
    ...data,
    ownerUid: data.ownerUid || '',
    origin: data.origin || '출발 항구 미정',
    destination: data.destination || '도착 항구 미정',
    departureDate: dateString(data.departureAt || data.departureDate),
    deadline: dateString(data.deadlineAt || data.deadline),
    deadlineOffsetDays: [7, 14].includes(numberOr(data.deadlineOffsetDays)) ? numberOr(data.deadlineOffsetDays) : 7,
    type: data.type || data.containerType || '40ft HQ',
    status: normalizedStatus(data.status),
    minCbm,
    capacityCbm: Math.max(minCbm, capacityCbm),
    currentCbm,
    activeCargoCount,
    creatorCargo: {
      item: creatorCargo.item || '화물 정보 미입력',
      cbm: rounded(numberOr(creatorCargo.cbm)),
      weight: rounded(numberOr(creatorCargo.weight)),
      packaging: creatorCargo.packaging || '미입력',
      condition: creatorCargo.condition || '미입력',
      notes: creatorCargo.notes || ''
    }
  };
};

export const normalizeApplication = snapshot => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    applicantUid: data.applicantUid || snapshot.id,
    status: data.status || 'active',
    cbm: rounded(numberOr(data.cbm)),
    weight: rounded(numberOr(data.weight)),
    appliedAt: data.appliedAt?.toDate?.() || null
  };
};

export const groupMetrics = group => {
  const capacity = Math.max(0.1, numberOr(group.capacityCbm ?? group.minCbm, 28));
  const currentCbm = Math.max(0, rounded(numberOr(group.currentCbm)));
  return {
    currentCbm,
    activeCargoCount: Math.max(1, Math.round(numberOr(group.activeCargoCount, 1))),
    participantCount: Math.max(0, Math.round(numberOr(group.activeCargoCount, 1)) - 1),
    fillPercent: Math.min(100, Math.round(currentCbm / capacity * 100)),
    remainingCbm: Math.max(0, rounded(capacity - currentCbm))
  };
};

export const isRecruiting = (group, now = new Date()) => {
  if (normalizedStatus(group.status) !== 'recruiting') return false;
  const deadline = group.deadline ? endOfLocalDay(group.deadline) : null;
  const departure = group.departureDate ? endOfLocalDay(group.departureDate) : null;
  return (!deadline || deadline >= now) && (!departure || departure >= now);
};

export const dashboardStats = (groups, now = new Date()) => {
  const activeGroups = groups.filter(group => isRecruiting(group, now));
  const metrics = activeGroups.map(groupMetrics);
  return {
    cargoCount: metrics.reduce((sum, item) => sum + item.activeCargoCount, 0),
    groupCount: activeGroups.length,
    averageFill: metrics.length
      ? Math.round(metrics.reduce((sum, item) => sum + item.fillPercent, 0) / metrics.length)
      : 0
  };
};

export const subscribeGroups = (onData, onError = () => {}) => onSnapshot(
  groupsCollection,
  snapshot => onData(snapshot.docs
    .map(normalizeGroup)
    .sort((a, b) => (a.departureDate || '').localeCompare(b.departureDate || ''))),
  onError
);

export const subscribeCargoData = (uid, onData, onError = () => {}) => {
  if (!uid) throw storeError('auth-required', '로그인이 필요합니다.');
  let groups = [];
  const applications = new Map();
  const loadedApplications = new Set();
  const applicationStops = new Map();
  let stopped = false;

  const emit = () => {
    if (stopped || !groups.every(group => loadedApplications.has(group.id))) return;
    onData({
      groups: [...groups].sort((a, b) => (a.departureDate || '').localeCompare(b.departureDate || '')),
      myApplications: new Map(applications)
    });
  };

  const stopGroups = onSnapshot(groupsCollection, snapshot => {
    groups = snapshot.docs.map(normalizeGroup);
    const groupIds = new Set(groups.map(group => group.id));

    applicationStops.forEach((stop, groupId) => {
      if (groupIds.has(groupId)) return;
      stop();
      applicationStops.delete(groupId);
      applications.delete(groupId);
      loadedApplications.delete(groupId);
    });

    groups.forEach(group => {
      if (applicationStops.has(group.id)) return;
      const applicationRef = doc(db, 'cargoGroups', group.id, 'applications', uid);
      const stop = onSnapshot(applicationRef, applicationSnapshot => {
        loadedApplications.add(group.id);
        if (applicationSnapshot.exists() && (applicationSnapshot.data().status || 'active') === 'active') {
          applications.set(group.id, normalizeApplication(applicationSnapshot));
        } else {
          applications.delete(group.id);
        }
        emit();
      }, onError);
      applicationStops.set(group.id, stop);
    });
    emit();
  }, onError);

  return () => {
    stopped = true;
    stopGroups();
    applicationStops.forEach(stop => stop());
    applicationStops.clear();
  };
};

export const subscribeUserProfile = (uid, onProfile, onError = () => {}) => onSnapshot(
  doc(db, 'users', uid),
  snapshot => {
    const data = snapshot.exists() ? snapshot.data() : {};
    onProfile({
      trustScore: Math.max(0, numberOr(data.trustScore, 100)),
      penaltyCount: Math.max(0, numberOr(data.penaltyCount)),
      blockedUntil: data.groupCreationBlockedUntil?.toDate?.() || null
    });
  },
  onError
);

export const createCargoGroup = async (user, input) => {
  if (!user?.uid) throw storeError('auth-required', '로그인이 필요합니다.');
  const offset = numberOr(input.deadlineOffsetDays);
  if (![7, 14].includes(offset)) throw storeError('invalid-deadline', '모집 마감 기준은 출항 1주 전 또는 2주 전이어야 합니다.');
  if (!input.departureDate || dateMinusDays(input.departureDate, offset) !== input.deadline) {
    throw storeError('invalid-deadline', '출항 목표일과 모집 마감일을 다시 확인해 주세요.');
  }
  if (endOfLocalDay(input.deadline) <= new Date()) throw storeError('invalid-deadline', '모집 마감일이 오늘보다 뒤가 되도록 출항 목표일을 선택해 주세요.');

  const creatorCargo = normalizeCargo(input.creatorCargo);
  const minCbm = rounded(numberOr(input.minCbm));
  if (minCbm <= 0 || creatorCargo.cbm > minCbm) throw storeError('invalid-volume', '최소 출항 물량은 개설자 화물 부피보다 커야 합니다.');
  const origin = cleanText(input.origin, 60);
  const destination = cleanText(input.destination, 80);
  if (!origin || !destination) throw storeError('invalid-route', '출발 항구와 도착 항구를 선택해 주세요.');

  const profileRef = doc(db, 'users', user.uid);
  const groupRef = doc(groupsCollection);
  await runTransaction(db, async transaction => {
    const profileSnapshot = await transaction.get(profileRef);
    const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
    const blockedUntil = profile.groupCreationBlockedUntil?.toDate?.();
    if (blockedUntil && blockedUntil > new Date()) {
      throw storeError('creation-blocked', `${localDateString(blockedUntil)}까지 새 그룹을 만들 수 없습니다.`);
    }
    transaction.set(groupRef, {
      schemaVersion: 2,
      ownerUid: user.uid,
      origin,
      destination,
      departureDate: input.departureDate,
      departureAt: Timestamp.fromDate(endOfLocalDay(input.departureDate)),
      deadline: input.deadline,
      deadlineAt: Timestamp.fromDate(endOfLocalDay(input.deadline)),
      deadlineOffsetDays: offset,
      type: cleanText(input.type || '40ft HQ', 30),
      minCbm,
      capacityCbm: minCbm,
      currentCbm: creatorCargo.cbm,
      activeCargoCount: 1,
      creatorCargo,
      status: 'recruiting',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  return groupRef.id;
};

export const applyToCargoGroup = async (user, groupId, cargo) => {
  if (!user?.uid) throw storeError('auth-required', '로그인이 필요합니다.');
  const normalizedCargo = normalizeCargo(cargo);
  const groupRef = doc(db, 'cargoGroups', groupId);
  const applicationRef = doc(db, 'cargoGroups', groupId, 'applications', user.uid);

  await runTransaction(db, async transaction => {
    const [groupSnapshot, applicationSnapshot] = await Promise.all([
      transaction.get(groupRef),
      transaction.get(applicationRef)
    ]);
    if (!groupSnapshot.exists()) throw storeError('group-not-found', '그룹을 찾을 수 없습니다.');
    const group = normalizeGroup(groupSnapshot);
    if (!isRecruiting(group)) throw storeError('group-closed', '이미 종료되었거나 모집이 마감된 그룹입니다.');
    if (group.ownerUid === user.uid) throw storeError('group-owner', '내가 만든 그룹에는 참여 신청할 수 없습니다.');
    if (applicationSnapshot.exists()) throw storeError('already-applied', '이미 참여 신청한 그룹입니다.');
    const metrics = groupMetrics(group);
    if (metrics.currentCbm + normalizedCargo.cbm > group.capacityCbm) {
      throw storeError('volume-exceeded', `이 그룹에는 ${metrics.remainingCbm} CBM까지 참여할 수 있습니다.`);
    }

    transaction.set(applicationRef, {
      schemaVersion: 2,
      applicantUid: user.uid,
      ...normalizedCargo,
      status: 'active',
      appliedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    transaction.update(groupRef, {
      currentCbm: rounded(metrics.currentCbm + normalizedCargo.cbm),
      activeCargoCount: metrics.activeCargoCount + 1,
      updatedAt: serverTimestamp()
    });
  });
};

export const cancelCargoApplication = async (user, groupId) => {
  if (!user?.uid) throw storeError('auth-required', '로그인이 필요합니다.');
  const groupRef = doc(db, 'cargoGroups', groupId);
  const applicationRef = doc(db, 'cargoGroups', groupId, 'applications', user.uid);
  await runTransaction(db, async transaction => {
    const [groupSnapshot, applicationSnapshot] = await Promise.all([
      transaction.get(groupRef),
      transaction.get(applicationRef)
    ]);
    if (!groupSnapshot.exists()) throw storeError('group-not-found', '그룹을 찾을 수 없습니다.');
    if (!applicationSnapshot.exists()) return;
    const group = normalizeGroup(groupSnapshot);
    const application = normalizeApplication(applicationSnapshot);
    if (application.applicantUid !== user.uid) throw storeError('permission-denied', '신청 취소 권한이 없습니다.');
    if (!isRecruiting(group)) throw storeError('group-closed', '모집이 끝난 그룹의 신청은 취소할 수 없습니다.');
    const metrics = groupMetrics(group);
    transaction.delete(applicationRef);
    transaction.update(groupRef, {
      currentCbm: Math.max(rounded(numberOr(group.creatorCargo.cbm)), rounded(metrics.currentCbm - application.cbm)),
      activeCargoCount: Math.max(1, metrics.activeCargoCount - 1),
      updatedAt: serverTimestamp()
    });
  });
};

export const cancelOwnedGroup = async (user, groupId) => {
  if (!user?.uid) throw storeError('auth-required', '로그인이 필요합니다.');
  const groupRef = doc(db, 'cargoGroups', groupId);
  const profileRef = doc(db, 'users', user.uid);
  const penaltyRef = doc(db, 'users', user.uid, 'penalties', groupId);

  return runTransaction(db, async transaction => {
    const [groupSnapshot, profileSnapshot, penaltySnapshot] = await Promise.all([
      transaction.get(groupRef),
      transaction.get(profileRef),
      transaction.get(penaltyRef)
    ]);
    if (!groupSnapshot.exists()) throw storeError('group-not-found', '그룹을 찾을 수 없습니다.');
    const group = normalizeGroup(groupSnapshot);
    if (group.ownerUid !== user.uid) throw storeError('permission-denied', '그룹 취소 권한이 없습니다.');
    if (!isRecruiting(group)) throw storeError('group-closed', '모집 마감 전인 그룹만 취소할 수 있습니다.');
    const participantCount = groupMetrics(group).participantCount;

    transaction.update(groupRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    let penaltyApplied = false;
    if (participantCount > 0 && !penaltySnapshot.exists()) {
      const profile = profileSnapshot.exists() ? profileSnapshot.data() : {};
      const trustScore = Math.max(0, numberOr(profile.trustScore, 100));
      const currentBlock = profile.groupCreationBlockedUntil?.toDate?.();
      const proposedBlock = new Date(Date.now() + 7 * DAY_MS);
      const blockedUntil = currentBlock && currentBlock > proposedBlock ? currentBlock : proposedBlock;
      transaction.set(profileRef, {
        trustScore: Math.max(0, trustScore - 10),
        penaltyCount: Math.max(0, numberOr(profile.penaltyCount)) + 1,
        groupCreationBlockedUntil: Timestamp.fromDate(blockedUntil),
        updatedAt: serverTimestamp()
      }, { merge: true });
      transaction.set(penaltyRef, {
        groupId,
        ownerUid: user.uid,
        participantCount,
        trustScoreDelta: -10,
        blockedDays: 7,
        createdAt: serverTimestamp()
      });
      penaltyApplied = true;
    }
    return { participantCount, penaltyApplied };
  });
};

export const explainStoreError = error => ({
  'permission-denied': 'Firebase 데이터 권한이 없습니다. Firestore 보안 규칙을 확인해 주세요.',
  'unavailable': '실시간 서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.',
  'auth-required': '로그인이 필요합니다.',
  'already-applied': '이미 참여 신청한 그룹입니다.',
  'group-closed': '이미 종료되었거나 모집이 마감된 그룹입니다.',
  'group-owner': '내가 만든 그룹에는 참여 신청할 수 없습니다.',
  'group-not-found': '그룹을 찾을 수 없습니다.',
  'volume-exceeded': error?.message,
  'creation-blocked': error?.message,
  'invalid-cargo': error?.message,
  'invalid-volume': error?.message,
  'invalid-deadline': error?.message,
  'invalid-route': error?.message
}[error?.code] || error?.message || '데이터를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
