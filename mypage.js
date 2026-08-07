(() => {
  const groupStorageKey='cargomate-departure-groups';
  const applicationKey='cargomate-group-application-details';
  const penaltyKey='cargomate-owner-penalties';
  const parseStorage=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||JSON.stringify(fallback));}catch{return fallback;}};
  const save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const safe=value=>String(value??'').replace(/[&<>'"]/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[character]));
  const formatDate=value=>value?new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'numeric',day:'numeric'}).format(new Date(value+'T12:00:00')):'미정';
  const localDate=value=>{const date=value||new Date();return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;};
  const dateMinusDays=(value,days)=>{if(!value)return'';const date=new Date(value+'T12:00:00');date.setDate(date.getDate()-days);return localDate(date);};
  const groupKey=group=>group.id||`${group.origin}|${group.destination}|${group.departureDate}`;
  const legacyGroupKey=group=>`${group.origin}|${group.destination}|${group.departureDate}`;
  const groupSnapshot=group=>({id:group.id||'',origin:group.origin||'',destination:group.destination||'',departureDate:group.departureDate||'',deadline:group.deadline||'',type:group.type||'',ownerUid:group.ownerUid||''});
  const knownDemoGroups=[
    {id:'demo-busan-longbeach-20260915',origin:'부산항',destination:'롱비치항 (미국)',departureDate:'2026-09-15',deadline:'2026-09-08',type:'40ft HQ'},
    {id:'demo-incheon-shanghai-20260912',origin:'인천항',destination:'상하이항 (중국)',departureDate:'2026-09-12',deadline:'2026-08-29',type:'40ft GP'},
    {id:'demo-busan-hamburg-20260920',origin:'부산항',destination:'함부르크항 (독일)',departureDate:'2026-09-20',deadline:'2026-09-06',type:'40ft HQ'}
  ];
  const snapshotFromKey=key=>{const parts=String(key).split('|');return parts.length>=3?{origin:parts[0],destination:parts[1],departureDate:parts.slice(2).join('|')}:{};};
  const applicationEntries=value=>{if(!value)return[];if(value.item)return[['legacy',value]];return Object.entries(value).filter(([,item])=>item&&item.item);};
  const applicationList=value=>{if(!value)return[];if(value.item)return[value];return Object.values(value).filter(item=>item&&item.item);};
  let currentUser=window.cargoMateAuthUser||null;
  let pendingGroupId='';
  let pendingParticipantCount=0;
  const modal=document.getElementById('ownerCancelModal');

  const getData=()=>{
    const groupsRaw=parseStorage(groupStorageKey,[]);
    const groups=Array.isArray(groupsRaw)?groupsRaw:[];
    const applications=parseStorage(applicationKey,{});
    const penaltiesRaw=parseStorage(penaltyKey,[]);
    const penalties=Array.isArray(penaltiesRaw)?penaltiesRaw:[];
    return {groups,applications:applications&&!Array.isArray(applications)?applications:{},penalties};
  };

  const render=()=>{
    if(!currentUser)return;
    const data=getData();
    const previousGroups=JSON.stringify(data.groups);
    data.groups=data.groups.map((group,index)=>{
      const rawCurrent=Number(group.currentCbm);
      const currentCbm=Number.isFinite(rawCurrent)?Math.max(0,rawCurrent):Math.max(0,28-(Number(group.remaining)||0));
      const deadlineOffsetDays=[7,14].includes(Number(group.deadlineOffsetDays))?Number(group.deadlineOffsetDays):7;
      return {...group,id:group.id||`legacy-${index}-${group.departureDate||'group'}`,ownerUid:group.ownerUid||currentUser.uid,ownerEmail:group.ownerEmail||currentUser.email,minCbm:Number(group.minCbm)||28,currentCbm,deadlineOffsetDays,deadline:dateMinusDays(group.departureDate,deadlineOffsetDays),creatorCargo:group.creatorCargo||{item:'기존 그룹 정보 미입력',cbm:currentCbm,weight:'미입력',packaging:'미입력',condition:'미입력',notes:'개설자가 화물 정보를 추가해야 합니다.'}};
    });
    if(previousGroups!==JSON.stringify(data.groups))save(groupStorageKey,data.groups);

    const previousApplications=JSON.stringify(data.applications);
    const normalizedApplications={};
    Object.entries(data.applications).forEach(([sourceKey,value])=>{
      const matchedGroup=[...data.groups,...knownDemoGroups].find(group=>groupKey(group)===sourceKey||legacyGroupKey(group)===sourceKey);
      const targetKey=matchedGroup?groupKey(matchedGroup):sourceKey;
      const snapshot=matchedGroup?groupSnapshot(matchedGroup):snapshotFromKey(sourceKey);
      const entries=applicationEntries(value);
      const bucket=normalizedApplications[targetKey]||(normalizedApplications[targetKey]={});
      entries.forEach(([entryKey,application],index)=>{
        const keyedUid=!['legacy'].includes(entryKey)&&!entryKey.startsWith('unclaimed-')?entryKey:'';
        let applicantUid=application.applicantUid||keyedUid;
        if(!applicantUid&&entries.length===1)applicantUid=currentUser.uid;
        const storageId=applicantUid||`unclaimed-${index}-${application.appliedAt||'application'}`;
        bucket[storageId]={...application,applicantUid,groupSnapshot:{...snapshot,...(application.groupSnapshot||{})}};
      });
    });
    data.applications=normalizedApplications;
    if(previousApplications!==JSON.stringify(data.applications))save(applicationKey,data.applications);
    const myGroups=data.groups.filter(group=>group.ownerUid===currentUser.uid);
    const activePenalties=data.penalties.filter(item=>item.ownerUid===currentUser.uid&&new Date(item.blockedUntil)>new Date());
    const trustScore=Math.max(0,100+data.penalties.filter(item=>item.ownerUid===currentUser.uid).reduce((sum,item)=>sum+(Number(item.trustScoreDelta)||0),0));
    const penaltyBox=document.getElementById('penaltyStatus');
    if(activePenalties.length){const latest=activePenalties.sort((a,b)=>new Date(b.blockedUntil)-new Date(a.blockedUntil))[0];penaltyBox.style.display='block';penaltyBox.innerHTML=`<b>현재 신뢰점수 ${trustScore}점</b><br>그룹 취소 페널티로 ${formatDate(latest.blockedUntil.slice(0,10))}까지 새 그룹을 만들 수 없습니다.`;}else if(data.penalties.some(item=>item.ownerUid===currentUser.uid)){penaltyBox.style.display='block';penaltyBox.innerHTML=`<b>현재 신뢰점수 ${trustScore}점</b><br>활성화된 그룹 생성 제한은 없습니다.`;}else{penaltyBox.style.display='none';}

    const createdBox=document.getElementById('createdGroups');
    createdBox.innerHTML=myGroups.length?myGroups.map(group=>{
      const key=groupKey(group),legacyKey=legacyGroupKey(group),applicationCount=applicationList(data.applications[key]||data.applications[legacyKey]).filter(item=>item.applicantUid!==group.ownerUid).length,participants=Math.max(Math.max(0,Number(group.members||1)-1),applicationCount),canCancel=Boolean(group.deadline)&&localDate()<=group.deadline;
      return `<article class="card my-card"><div class="space-row"><span class="tag">내가 만든 그룹</span><small>참여 화주 ${participants}명</small></div><h3>${safe(group.origin)} → ${safe(group.destination)}</h3><p class="muted">출항 목표 ${formatDate(group.departureDate)} · 모집 마감 ${formatDate(group.deadline)}</p><p>개설 화물: <b>${safe(group.creatorCargo?.item||'미입력')}</b> · ${safe(group.creatorCargo?.cbm||0)} CBM</p><button class="btn danger-btn owner-cancel" data-id="${safe(group.id)}" data-participants="${participants}" type="button" ${canCancel?'':'disabled'}>${canCancel?'그룹 취소':'모집 마감 후 취소 불가'}</button></article>`;
    }).join(''):'<article class="empty"><h3>아직 만든 그룹이 없습니다.</h3><p>화물 조건을 입력해 새로운 출항 그룹을 만들어 보세요.</p><a class="btn" href="matching.html">새 그룹 만들기</a></article>';

    const joined=[];
    Object.entries(data.applications).forEach(([key,value])=>applicationList(value).forEach(application=>{if(application.applicantUid===currentUser.uid)joined.push({key,application});}));
    const joinedBox=document.getElementById('joinedGroups');
    joinedBox.innerHTML=joined.length?joined.map(({application})=>{const group=application.groupSnapshot||{};return `<article class="card my-card"><span class="tag">참여 신청 완료</span><h3>${safe(group.origin||'그룹 정보 확인 중')} → ${safe(group.destination||'')}</h3><p class="muted">출항 목표 ${formatDate(group.departureDate)}</p><p>내 화물: <b>${safe(application.item)}</b> · ${safe(application.cbm)} CBM · ${safe(application.weight)} kg</p><a class="btn" href="matching.html">매칭 화면에서 관리</a></article>`;}).join(''):'<article class="empty"><h3>참여 신청한 그룹이 없습니다.</h3><p>나와 맞는 출항 그룹을 찾아보세요.</p><a class="btn" href="matching.html">그룹 찾기</a></article>';

    document.querySelectorAll('.owner-cancel:not(:disabled)').forEach(button=>button.onclick=()=>{pendingGroupId=button.dataset.id;pendingParticipantCount=Number(button.dataset.participants)||0;const group=myGroups.find(item=>item.id===pendingGroupId);document.getElementById('ownerCancelRoute').textContent=`${group.origin} → ${group.destination} · 모집 마감 ${formatDate(group.deadline)}`;document.getElementById('ownerPenaltyText').textContent=pendingParticipantCount>0?`이미 ${pendingParticipantCount}명의 화주가 참여했습니다. 취소하면 신뢰점수 10점이 차감되고 7일 동안 새 그룹을 만들 수 없습니다.`:'아직 참여한 화주가 없어 별도의 페널티 없이 취소할 수 있습니다.';modal.hidden=false;document.getElementById('confirmOwnerCancel').focus();});
  };

  const closeModal=()=>{modal.hidden=true;pendingGroupId='';pendingParticipantCount=0;};
  document.getElementById('keepOwnerGroup').onclick=closeModal;
  modal.onclick=event=>{if(event.target===modal)closeModal();};
  document.getElementById('confirmOwnerCancel').onclick=()=>{
    if(!currentUser||!pendingGroupId)return closeModal();
    const data=getData(),index=data.groups.findIndex(group=>group.id===pendingGroupId&&group.ownerUid===currentUser.uid);
    if(index<0)return closeModal();
    const group=data.groups[index];
    if(localDate()>group.deadline)return closeModal();
    const latestApplications=data.applications[groupKey(group)]||data.applications[legacyGroupKey(group)];
    const applicationCount=applicationList(latestApplications).filter(item=>item.applicantUid!==group.ownerUid).length;
    const participantCount=Math.max(Math.max(0,Number(group.members||1)-1),applicationCount);
    data.groups.splice(index,1);
    delete data.applications[pendingGroupId];
    delete data.applications[`${group.origin}|${group.destination}|${group.departureDate}`];
    if(participantCount>0){const blockedUntil=new Date();blockedUntil.setDate(blockedUntil.getDate()+7);data.penalties.push({ownerUid:currentUser.uid,groupId:pendingGroupId,reason:'참여 화주가 있는 그룹 취소',trustScoreDelta:-10,createdAt:new Date().toISOString(),blockedUntil:blockedUntil.toISOString()});}
    save(groupStorageKey,data.groups);save(applicationKey,data.applications);save(penaltyKey,data.penalties);
    const notice=document.getElementById('mypageNotice');notice.style.display='block';notice.textContent=participantCount>0?'그룹이 취소되었습니다. 신뢰점수 10점 차감과 7일 생성 제한이 적용되었습니다.':'그룹이 페널티 없이 취소되었습니다.';
    closeModal();render();
  };
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!modal.hidden)closeModal();});
  window.addEventListener('cargomate-auth-changed',event=>{currentUser=event.detail;render();});
  if(currentUser)render();
})();
