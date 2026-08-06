import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';
import { getFirestore, collection, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';
import { firebaseConfig, isFirebaseConfigured } from './firebase-config.js';

if (isFirebaseConfigured) {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const groupsQuery = query(collection(db, 'cargoGroups'), orderBy('departureDate'));

  onSnapshot(groupsQuery, snapshot => {
    const groups = snapshot.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        ...data,
        fill: Number(data.fill) || 0,
        remaining: Number(data.remaining) || 0,
        members: Number(data.members) || 0
      };
    });
    if (window.setCargoGroups) window.setCargoGroups(groups);
  }, () => {
    const summary = document.querySelector('#matchSummary');
    if (summary) summary.textContent = '화물 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  });
}
