const cargoGroups = [
  { origin: '부산', destination: '롱비치', departure: '9/15 출발 예정', type: '40ft HQ', fill: 65, remaining: 12, members: 3 },
  { origin: '인천', destination: '상하이', departure: '9/12 출발 예정', type: '40ft GP', fill: 72, remaining: 8, members: 4 },
  { origin: '부산', destination: '함부르크', departure: '9/20 출발 예정', type: '40ft HQ', fill: 54, remaining: 18, members: 2 }
];

function renderGroups(filtered = false) {
  const resultBox = document.querySelector('#matchResults');
  if (!resultBox) return;
  const origin = document.querySelector('#origin').value;
  const destination = document.querySelector('#destination').value;
  const volume = Number(document.querySelector('#cargoCbm').value);
  const summary = document.querySelector('#matchSummary');
  const matching = filtered ? cargoGroups.filter(group => group.origin === origin && group.destination === destination && group.remaining >= volume) : cargoGroups;
  if (filtered && matching.length === 0) {
    summary.textContent = `${origin} → ${destination}, ${volume} CBM 조건에 맞는 그룹이 아직 없습니다.`;
    resultBox.innerHTML = `<article class="empty"><i class="fa-solid fa-ship" style="font-size:30px;color:#1479ff"></i><h3>새로운 그룹을 기다리고 있어요</h3><p>조건을 넓혀 다시 검색하거나, 화물 정보를 등록해 그룹 모집을 시작해 보세요.</p><button class="btn" type="button" id="resetSearch">전체 그룹 보기</button></article>`;
    document.querySelector('#resetSearch').onclick = () => renderGroups(false);
    return;
  }
  summary.textContent = filtered ? `${origin} → ${destination}, ${volume} CBM 기준 ${matching.length}개의 참여 가능한 그룹을 찾았습니다.` : '현재 모집 중인 모든 공유 컨테이너 그룹입니다.';
  resultBox.innerHTML = matching.map(group => `<article class="card match-card"><div class="space-row"><span class="tag">모집 중</span><small>화주 ${group.members}명</small></div><h3>${group.origin} → ${group.destination}</h3><p class="muted">${group.departure} · ${group.type} 컨테이너</p><div class="space-row"><span>현재 <b>${group.fill}%</b> 채워짐</span><b style="color:#1479ff">${group.remaining} CBM 남음</b></div><div class="progress"><span style="width:${group.fill}%"></span></div><button class="btn join" type="button">그룹 참여 신청하기</button></article>`).join('');
  document.querySelectorAll('.join').forEach(button => button.onclick = () => { button.textContent = '✓ 참여 신청 완료'; button.style.background = '#0d9f6e'; button.disabled = true; });
}

function calculate() {
  const mine = Math.max(0, Number(document.querySelector('#myCbm').value) || 0);
  const others = Math.max(0, Number(document.querySelector('#othersCbm').value) || 0);
  const cost = Math.max(0, Number(document.querySelector('#totalCost').value) || 0);
  const total = mine + others;
  const ratio = total === 0 ? 0 : mine / total;
  document.querySelector('#costDisplay').textContent = '$' + Math.round(cost * ratio).toLocaleString();
  document.querySelector('#ratioDisplay').textContent = `전체 부피의 ${(ratio * 100).toFixed(1)}%`;
  document.querySelector('#barPercent').textContent = `${(ratio * 100).toFixed(1)}%`;
  document.querySelector('#ratioBar').style.width = `${ratio * 100}%`;
  document.querySelector('#myVolumeText').textContent = `${mine} CBM`;
  document.querySelector('#totalVolumeText').textContent = `${total} CBM`;
}

document.addEventListener('DOMContentLoaded', () => {
  renderGroups();
  const matchForm = document.querySelector('#matchForm');
  if (matchForm) matchForm.onsubmit = event => { event.preventDefault(); renderGroups(true); };
  document.querySelectorAll('.calc-input').forEach(input => input.addEventListener('input', calculate));
  if (document.querySelector('#myCbm')) calculate();
  const comparisonMessage = document.querySelector('#compareMessage');
  document.querySelectorAll('.compare').forEach(card => card.onclick = () => { document.querySelectorAll('.compare').forEach(item => item.classList.remove('selected')); card.classList.add('selected'); comparisonMessage.textContent = card.dataset.type === 'mate' ? '화주가 먼저 그룹을 만들고, 포워더 견적을 비교해 선택합니다.' : '포워더가 혼적 구성과 출발 시점을 정하는 기존 LCL 방식입니다.'; });
  const rfpButton = document.querySelector('#rfpButton');
  if (rfpButton) rfpButton.onclick = () => { rfpButton.textContent = '✓ 견적 요청 전송 완료'; rfpButton.style.background = '#0d9f6e'; rfpButton.disabled = true; document.querySelector('#rfpNotice').style.display = 'block'; };
  document.querySelectorAll('.selectQuote').forEach(button => button.onclick = () => { document.querySelectorAll('.quote-card').forEach(card => card.classList.remove('selected')); button.closest('.quote-card').classList.add('selected'); document.querySelectorAll('.selectQuote').forEach(item => item.textContent = '이 견적 선택'); button.textContent = '선택됨'; });
});
