/* English Battle authentication + admin console. Configure the two constants below. */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://xrdwvswwcgqapailbohf.supabase.co';
  const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY';
  const $ = id => document.getElementById(id);
  const gate = $('authGate');
  let client = null, mode = 'login', currentProfile = null, membersCache = [];
  const say = (message, bad = true) => { $('authError').textContent = message || ''; $('authError').style.color = bad ? '#ff7b86' : '#2bd9a0'; };
  const adminSay = message => { $('adminContent').insertAdjacentHTML('afterbegin', `<p class="admin-status">${escapeHtml(message)}</p>`); };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const configured = !SUPABASE_URL.startsWith('YOUR_') && !SUPABASE_ANON_KEY.startsWith('YOUR_');

  function setMode(next) {
    mode = next;
    $('authTitle').textContent = next === 'login' ? '로그인' : '회원가입';
    $('authSubmit').textContent = next === 'login' ? '로그인' : '계정 만들기';
    $('tabLogin').classList.toggle('active', next === 'login');
    $('tabSignup').classList.toggle('active', next === 'signup');
    $('signupNameWrap').classList.toggle('hide', next !== 'signup');
    $('authPassword').autocomplete = next === 'login' ? 'current-password' : 'new-password';
    say('');
  }
  $('tabLogin').addEventListener('click', () => setMode('login'));
  $('tabSignup').addEventListener('click', () => setMode('signup'));

  function lockScreen() {
    document.body.classList.add('auth-locked');
    gate.classList.remove('hidden');
    $('accountBar').style.display = 'none';
    $('adminOpen').style.display = 'none';
  }
  function unlockScreen(profile, user) {
    currentProfile = profile;
    window.EB_AUTH_USER = user;
    document.body.classList.remove('auth-locked');
    gate.classList.add('hidden');
    $('accountBar').style.display = 'flex';
    $('accountLabel').textContent = `${profile.nickname || profile.username} · ${profile.role === 'admin' ? '관리자' : '회원'}`;
    $('adminOpen').style.display = profile.role === 'admin' ? 'block' : 'none';
    if ($('nick') && profile.nickname) $('nick').value = profile.nickname;
  }
  async function loadProfile(user) {
    const { data, error } = await client.from('profiles').select('id,email,username,nickname,role,status,created_at,last_seen').eq('id', user.id).single();
    if (error) throw error;
    if (!data || data.status !== 'active') {
      await client.auth.signOut();
      throw new Error(data?.status === 'suspended' ? '이 계정은 운영자에 의해 정지되었습니다.' : '회원 정보를 확인할 수 없습니다.');
    }
    await client.from('profiles').update({ last_seen: new Date().toISOString() }).eq('id', user.id);
    return data;
  }
  $('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!client) return say('Supabase 설정이 필요합니다. auth.js의 프로젝트 URL과 anon key를 입력하세요.');
    const username = $('authUsername').value.trim().toLowerCase();
    const password = $('authPassword').value;
    if (!/^[a-z0-9_-]{3,24}$/.test(username)) return say('아이디는 영문 소문자, 숫자, _ 또는 -로 3~24자 입력하세요.');
    // Supabase Auth는 이메일 기반이므로 아이디를 예약된 example.com 도메인의 내부용 주소로 변환합니다.
    // 실제 이메일을 발송하지 않도록 Supabase의 이메일 확인 설정을 꺼야 합니다.
    const authEmail = `${username}@example.com`;
    $('authSubmit').disabled = true;
    say(mode === 'login' ? '로그인 중…' : '회원가입 처리 중…', false);
    try {
      if (mode === 'signup') {
        const nickname = $('authNickname').value.trim().slice(0, 8);
        if (!nickname) throw new Error('게임 닉네임을 입력하세요.');
        const { data, error } = await client.auth.signUp({
          email: authEmail,
          password,
          options: { data: { username, nickname } }
        });
        if (error) throw error;
        if (!data.session) {
          say('Supabase 이메일 확인 기능이 켜져 있습니다. 아이디 로그인 방식에서는 이메일 확인을 끄고 다시 가입해야 합니다.', true);
          return;
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email: authEmail, password });
        if (error) throw new Error('아이디 또는 비밀번호가 올바르지 않습니다.');
      }
      const { data: { user } } = await client.auth.getUser();
      const profile = await loadProfile(user);
      unlockScreen(profile, user);
      say('');
    } catch (err) { say(err.message || '인증에 실패했습니다.'); }
    finally { $('authSubmit').disabled = false; }
  });

  $('logoutBtn').addEventListener('click', async () => {
    if (client) await client.auth.signOut();
    currentProfile = null; window.EB_AUTH_USER = null;
    $('adminPanel').classList.remove('open'); lockScreen(); setMode('login');
  });
  $('adminOpen').addEventListener('click', () => {
    if (currentProfile?.role !== 'admin') return;
    $('adminPanel').classList.add('open'); renderAdmin('overview');
  });
  $('adminClose').addEventListener('click', () => $('adminPanel').classList.remove('open'));

  const featureGroups = [
    ['회원 관리', ['회원 목록','회원 검색','회원 상세 프로필','닉네임 변경','회원 ID 조회','가입일 조회','최근 접속 조회','계정 정지','계정 복구','회원 탈퇴 처리','비밀번호 재설정 안내','이메일 변경 안내','회원 등급 조회','관리자 권한 부여','관리자 권한 회수']],
    ['제재 관리', ['영구 정지','기간 정지','임시 정지','닉네임 변경 제한','채팅 제한','채팅 시간 제한','게임 플레이 제한','방 입장 제한','강제 퇴장','제재 사유 기록','제재 이력 조회','제재 해제','자동 만료 확인','제재 대상 검색','제재 통계']],
    ['보안 관리', ['로그인 기록','로그인 실패 기록','비정상 접속 확인','중복 세션 확인','전체 세션 종료','계정 잠금 확인','비밀번호 재설정 안내','관리자 활동 로그','보안 이벤트 조회','의심 계정 목록']],
    ['게임 관리', ['실시간 방 목록','방 강제 종료','게임 강제 시작','플레이어 이동','플레이어 강퇴','게임 일시정지','게임 재개','게임 모드 변경','맵 변경','CPU 설정','게임 시간 설정','플레이어 체력 회복','라운드 강제 종료','방 초기화','진행 상태 조회']],
    ['경제·아이템', ['재화 지급','재화 회수','전체 재화 지급','무기 지급','아이템 지급','아이템 회수','무기 레벨 변경','능력치 변경','지급 이력 조회','아이템 통계']],
    ['채팅·신고', ['전체 채팅 조회','채팅 삭제','채팅 비활성화','특정 회원 채팅 차단','전체 공지','개인 메시지','금칙어 관리','신고 목록','신고 처리','채팅 검색']],
    ['이벤트', ['XP 이벤트','재화 이벤트','무기 이벤트','출석 이벤트','이벤트 확률 설정','이벤트 시작','이벤트 종료','이벤트 예약','참여자 조회','보상 관리']],
    ['통계', ['전체 회원 수','현재 접속자','오늘 가입자','오늘 접속자','전체 플레이 횟수','평균 플레이 시간','인기 게임 모드','인기 맵','정지 통계','활동 그래프']],
    ['시스템', ['점검 모드','전체 접속 차단','공지 관리','시스템 설정','관리자 감사 로그']]
  ];
  const featureList = featureGroups.flatMap(([group, items]) => items.map(name => ({group, name})));
  const navItems = [['overview','대시보드'],['members','회원 관리'],['announcements','공지 관리'],['logs','관리자 기록'],['features','100가지 기능']];
  function setNav(active) {
    $('adminNav').innerHTML = navItems.map(([id,label]) => `<button class="${id===active?'active':''}" data-page="${id}">${label}</button>`).join('');
    $('adminNav').querySelectorAll('button').forEach(b => b.addEventListener('click', () => renderAdmin(b.dataset.page)));
  }
  async function requireAdmin() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('로그인이 필요합니다.');
    const { data, error } = await client.from('profiles').select('role,status').eq('id', user.id).single();
    if (error || data?.role !== 'admin' || data?.status !== 'active') throw new Error('관리자 권한이 없습니다.');
    return user;
  }
  async function renderAdmin(page) {
    try { await requireAdmin(); } catch (e) { $('adminPanel').classList.remove('open'); return say(e.message); }
    setNav(page);
    const c = $('adminContent');
    if (page === 'overview') {
      c.innerHTML = '<h3>운영 대시보드</h3><p class="mut">실제 데이터는 Supabase 정책에 따라 조회됩니다.</p><div class="admin-actions"><button class="admin-mini" id="refreshStats">통계 새로고침</button></div><div id="statsArea" class="feature-grid" style="margin-top:14px"></div>';
      $('refreshStats').onclick = loadStats; await loadStats();
    } else if (page === 'members') {
      c.innerHTML = '<h3>회원 관리</h3><input id="memberSearch" placeholder="이메일 또는 닉네임 검색"><div class="admin-actions"><button id="memberRefresh" class="admin-mini">회원 새로고침</button></div><div style="overflow:auto;margin-top:12px"><table class="admin-table"><thead><tr><th>회원</th><th>등급</th><th>상태</th><th>가입일</th><th>관리</th></tr></thead><tbody id="memberRows"></tbody></table></div>';
      $('memberRefresh').onclick = loadMembers; $('memberSearch').oninput = renderMemberRows; await loadMembers();
    } else if (page === 'announcements') {
      c.innerHTML = '<h3>공지 관리</h3><label>공지 제목</label><input id="noticeTitle" maxlength="100"><label>공지 내용</label><textarea id="noticeBody" rows="5" maxlength="2000"></textarea><button id="noticeSend" class="admin-mini">공지 등록</button><div id="noticeList" style="margin-top:16px"></div>';
      $('noticeSend').onclick = createNotice; await loadNotices();
    } else if (page === 'logs') {
      c.innerHTML = '<h3>관리자 감사 로그</h3><button id="logsRefresh" class="admin-mini">새로고침</button><div id="logsArea" style="overflow:auto;margin-top:12px"></div>';
      $('logsRefresh').onclick = loadLogs; await loadLogs();
    } else {
      c.innerHTML = `<h3>관리자 기능 목록 (${featureList.length}개)</h3><p class="mut">아래 목록은 전체 운영 기능의 설계 목록입니다. 현재 백엔드에 연결된 기능은 회원 조회·정지·복구·권한 변경·공지·감사 로그·기본 통계입니다. 나머지는 게임 서버용 안전한 RPC를 추가 연결해야 실제 동작합니다.</p><div class="feature-grid">${featureList.map((f,i)=>`<div class="feature"><b>${String(i+1).padStart(2,'0')}. ${escapeHtml(f.name)}</b><small>${escapeHtml(f.group)} · ${['회원 목록','회원 검색','계정 정지','계정 복구','관리자 권한 부여','관리자 권한 회수','전체 공지','공지 관리','관리자 감사 로그','전체 회원 수','현재 접속자'].includes(f.name)?'백엔드 연결됨':'서버 기능 연결 필요'}</small></div>`).join('')}</div>`;
    }
  }
  async function loadStats() {
    const area = $('statsArea'); if (!area) return;
    const { count: total, error } = await client.from('profiles').select('*', {count:'exact',head:true});
    if (error) { area.textContent = error.message; return; }
    const { count: suspended } = await client.from('profiles').select('*',{count:'exact',head:true}).eq('status','suspended');
    const { count: admins } = await client.from('profiles').select('*',{count:'exact',head:true}).eq('role','admin');
    area.innerHTML = [['전체 회원',total],['정지 회원',suspended],['관리자',admins]].map(([k,v])=>`<div class="feature"><small>${k}</small><h2>${v ?? 0}</h2></div>`).join('');
  }
  async function loadMembers() {
    const { data, error } = await client.from('profiles').select('id,username,nickname,role,status,created_at').order('created_at',{ascending:false}).limit(500);
    if (error) { $('memberRows').innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`; return; }
    membersCache = data || []; renderMemberRows();
  }
  function renderMemberRows() {
    const rows = $('memberRows'); if (!rows) return;
    const q = ($('memberSearch')?.value || '').toLowerCase();
    rows.innerHTML = membersCache.filter(m => `${m.username} ${m.nickname}`.toLowerCase().includes(q)).map(m => `<tr><td><b>${escapeHtml(m.nickname||'-')}</b><br><small>아이디: ${escapeHtml(m.username)}</small><br><small>${escapeHtml(m.id)}</small></td><td>${m.role==='admin'?'관리자':'회원'}</td><td>${m.status==='active'?'정상':'정지'}</td><td>${new Date(m.created_at).toLocaleDateString('ko-KR')}</td><td><div class="admin-actions"><button class="admin-mini" data-status="${m.id}" data-next="${m.status==='active'?'suspended':'active'}">${m.status==='active'?'정지':'복구'}</button><button class="admin-mini" data-role="${m.id}" data-next="${m.role==='admin'?'member':'admin'}">${m.role==='admin'?'관리자 해제':'관리자 지정'}</button></div></td></tr>`).join('') || '<tr><td colspan="5">검색 결과가 없습니다.</td></tr>';
    rows.querySelectorAll('[data-status]').forEach(b => b.onclick = () => changeStatus(b.dataset.status,b.dataset.next));
    rows.querySelectorAll('[data-role]').forEach(b => b.onclick = () => changeRole(b.dataset.role,b.dataset.next));
  }
  async function changeStatus(id,status) {
    if (id === window.EB_AUTH_USER?.id && status === 'suspended') return adminSay('현재 로그인한 관리자 계정은 여기서 정지할 수 없습니다.');
    if (!confirm(`이 회원의 상태를 ${status==='active'?'정상':'정지'}으로 변경할까요?`)) return;
    const {error} = await client.rpc('admin_set_member_status',{target_user_id:id,new_status:status,reason:'관리자 패널에서 변경'});
    if (error) return adminSay(error.message);
    adminSay('회원 상태를 변경했습니다.'); await loadMembers();
  }
  async function changeRole(id,role) {
    if (id === window.EB_AUTH_USER?.id) return adminSay('자신의 관리자 권한은 변경할 수 없습니다.');
    if (!confirm(`이 회원의 권한을 ${role==='admin'?'관리자':'일반 회원'}로 변경할까요?`)) return;
    const {error} = await client.rpc('admin_set_member_role',{target_user_id:id,new_role:role});
    if (error) return adminSay(error.message);
    adminSay('회원 권한을 변경했습니다.'); await loadMembers();
  }
  async function createNotice() {
    const title = $('noticeTitle').value.trim(), body = $('noticeBody').value.trim();
    if (!title || !body) return adminSay('제목과 내용을 입력하세요.');
    const {error} = await client.from('announcements').insert({title,body,created_by:window.EB_AUTH_USER.id});
    if (error) return adminSay(error.message);
    $('noticeTitle').value=''; $('noticeBody').value=''; adminSay('공지를 등록했습니다.'); await loadNotices();
  }
  async function loadNotices() {
    const {data,error} = await client.from('announcements').select('id,title,body,created_at').order('created_at',{ascending:false}).limit(30);
    if (error) { $('noticeList').textContent=error.message; return; }
    $('noticeList').innerHTML = (data||[]).map(n=>`<div class="feature"><b>${escapeHtml(n.title)}</b><small>${new Date(n.created_at).toLocaleString('ko-KR')}</small><p>${escapeHtml(n.body)}</p></div>`).join('') || '<p class="mut">등록된 공지가 없습니다.</p>';
  }
  async function loadLogs() {
    const {data,error} = await client.from('admin_logs').select('id,action,target_user_id,details,created_at').order('created_at',{ascending:false}).limit(100);
    if (error) { $('logsArea').textContent=error.message; return; }
    $('logsArea').innerHTML = `<table class="admin-table"><thead><tr><th>시간</th><th>작업</th><th>대상</th><th>내용</th></tr></thead><tbody>${(data||[]).map(x=>`<tr><td>${new Date(x.created_at).toLocaleString('ko-KR')}</td><td>${escapeHtml(x.action)}</td><td>${escapeHtml(x.target_user_id||'-')}</td><td>${escapeHtml(JSON.stringify(x.details||{}))}</td></tr>`).join('')}</tbody></table>`;
  }

  if (!configured || !window.supabase?.createClient) {
    lockScreen(); say('Supabase 연결 설정 전입니다. auth.js 상단의 URL과 anon key를 설정하면 로그인/회원가입이 활성화됩니다.');
    return;
  }
  client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  window.EB_SUPABASE = client;
  lockScreen();
  client.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) { currentProfile=null; window.EB_AUTH_USER=null; lockScreen(); return; }
    try { const profile=await loadProfile(session.user); unlockScreen(profile,session.user); }
    catch(e) { say(e.message); lockScreen(); }
  });
  client.auth.getSession().then(async ({data}) => {
    if (!data.session) return;
    try { const profile=await loadProfile(data.session.user); unlockScreen(profile,data.session.user); }
    catch(e) { say(e.message); lockScreen(); }
  });
})();
