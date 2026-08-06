// CargoMate Firebase 웹 앱 설정값입니다.
// Firebase 웹 설정값은 공개되어도 되는 식별자이며, 비밀 키를 이 파일에 넣으면 안 됩니다.
export const firebaseConfig = {
  apiKey: 'AIzaSyCHW1UDWH2oShcAUcW2W1CQbPsd6gXsufA',
  authDomain: 'cargomate-cbf6a.firebaseapp.com',
  projectId: 'cargomate-cbf6a',
  storageBucket: 'cargomate-cbf6a.firebasestorage.app',
  messagingSenderId: '802321226929',
  appId: '1:802321226929:web:532e0d80f0c9ffb9a69690'
};
export const isFirebaseConfigured = !Object.values(firebaseConfig).some(value => value.includes('YOUR_'));
