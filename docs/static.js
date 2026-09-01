const questions = [
  { dim: '人流感受', q: '进入一条陌生街巷时，你更希望看见？', a: ['quiet', '稀疏的人流和能慢下来的转角'], b: ['lively', '有人说话、有摊贩和热闹的动静'] },
  { dim: '人流感受', q: '路过一处人很多的广场，你会？', a: ['quiet', '绕到边缘，找一个能观察又不拥挤的位置'], b: ['lively', '走进去看看，感受当下发生的事'] },
  { dim: '路线取向', q: '选择漫步路线时，你最在意？', a: ['culture', '沿途的建筑、故事和值得驻足的细节'], b: ['food', '小吃、手作和偶然遇见的烟火气'] },
  { dim: '路线取向', q: '两条都能到达的路，你会选？', a: ['culture', '有树荫、有老房子、可以多看几眼的'], b: ['food', '经过店铺和人群、更有生活感的'] },
  { dim: '漫游节奏', q: '出发前，你希望今天的脚步？', a: ['slow', '留白一些，看到喜欢的地方就停下来'], b: ['explore', '多走几个点，把时间用得更充实'] },
  { dim: '漫游节奏', q: '面对一条有点曲折的小巷，你会？', a: ['slow', '不赶时间，慢慢走进去感受光影'], b: ['explore', '想知道尽头有什么，继续往前探索'] },
  { dim: '计划方式', q: '出发前，你对路线有什么期待？', a: ['free', '不用太固定，留给现场一点惊喜'], b: ['plan', '大致知道顺序，走起来更安心'] },
  { dim: '计划方式', q: '发现一家感兴趣的小店，你会？', a: ['free', '顺路就进去，路线可以临时改变'], b: ['plan', '先记下来，按计划走完再决定'] },
  { dim: '空间尺度', q: '休息时，你更喜欢？', a: ['courtyard', '安静的小院、檐下或可以坐一会的角落'], b: ['street', '能看到来往人群的街边位置'] },
  { dim: '空间尺度', q: '今天带走一段漫游记忆时，你更想记住？', a: ['courtyard', '光影、砖墙、树影和一个安静瞬间'], b: ['street', '一口小吃、一家店和街巷里的热闹'] }
];

const routes = {
  quiet: { title: '城墙听风线', tags: ['独处友好', '约 60 分钟', '约 1.2 km'], summary: '沿着城墙脚下的绿意与窄巷慢慢走，把步伐交给可以停留的转角。', reason: '你在这次选择中更偏好安静、可呼吸的空间与松弛节奏，所以优先安排了人流相对舒缓、可随时停留的节点。', stops: [['老门东牌坊', '从开阔入口开始，先确认方向与当下人流。'], ['城墙东侧步道', '在城墙脚下停一会，感受绿意与开阔视野。'], ['窄巷转角', '放慢脚步，看门头、光影和生活痕迹。'], ['檐下茶舍', '用一段休息，为这次漫游留出余白。']], color: '#5f826f', point: '72,315 154,260 266,215 400,126' },
  culture: { title: '旧城拾光线', tags: ['人文漫游', '约 90 分钟', '约 2.0 km'], summary: '把城墙、园林入口、书店与展览空间串成一段可以慢读的旧城下午。', reason: '你更在意建筑、故事和探索感，因此这条路线会把有文化线索的地点排在步行顺序里，并保留延长停留的余地。', stops: [['老门东牌坊', '从牌坊进入，观察新旧建筑尺度如何交织。'], ['中心广场', '在开阔位置理解街区与城墙的关系。'], ['芥子园入口', '沿巷道向园林方向走，留意门洞与传统肌理。'], ['先锋书店', '在书店或檐下休息，挑一本与南京有关的书。'], ['金陵美术馆', '以展览与建筑外部空间收束这次漫游。']], color: '#4c778d', point: '70,315 156,265 246,184 355,148 438,80' },
  lively: { title: '街巷寻味线', tags: ['朋友同行', '约 120 分钟', '约 2.4 km'], summary: '在主街的烟火气与一段文化停留之间切换，适合结伴吃逛的傍晚。', reason: '你选择了更有生活感和探索感的体验，路线会把店铺、手作与餐饮密度较高的街段放在核心位置。', stops: [['箍桶巷主街', '从主街进入，先感受老门东最有烟火气的一面。'], ['文化展馆', '在热闹之间插入一段较安静的文化停留。'], ['金陵手作坊', '看看手作与地方材料，把“逛”变成一次发现。'], ['南京大牌档周边', '按现场排队与营业情况选择小吃或正餐。'], ['绿柳居附近', '用一份点心或小吃，为街巷漫游收尾。']], color: '#b35d42', point: '72,315 142,247 234,278 334,204 438,145' },
  photo: { title: '巷陌光影线', tags: ['适合拍照', '约 100 分钟', '约 1.8 km'], summary: '在门洞、砖墙、树影和街巷尺度之间游走，为光线与偶遇留出时间。', reason: '你偏好慢走、观察与探索，适合一条以光影、门头和空间层次为重点的预设拍照路线。', stops: [['老门东牌坊', '从入口取一张完整的街区开场。'], ['砖墙门洞', '观察门洞框景与新旧材料的交界。'], ['巷陌树影', '留意不同时间的光线落点。'], ['庭院转角', '在较安静的尺度里寻找细节。'], ['城墙远望点', '以更开阔的视野结束这条路线。']], color: '#9b6d48', point: '72,315 135,230 225,160 335,205 434,112' }
};

const state = { index: 0, answers: [], persona: null, routeId: 'quiet', chatText: '', checkin: 0, mealAdded: false };
const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];

function go(name) {
  all('.screen').forEach(screen => screen.classList.toggle('active', screen.id === name));
  all('[data-go]').forEach(button => button.classList.toggle('selected', button.dataset.go === name));
  if (name === 'quiz') renderQuestion();
  if (name === 'chat') renderChat();
  if (name === 'route') renderRoute();
  if (name === 'memory') renderMemory();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuestion() {
  const item = questions[state.index];
  $('#quiz-count').textContent = `${String(state.index + 1).padStart(2, '0')} / ${questions.length}`;
  $('#quiz-progress-bar').style.width = `${((state.index + 1) / questions.length) * 100}%`;
  $('#question-dim').textContent = item.dim;
  $('#question-title').textContent = item.q;
  $('#question-options').innerHTML = [['a', item.a], ['b', item.b]].map(([key, value]) => `<button class="option" data-answer="${value[0]}"><span>${key === 'a' ? 'A' : 'B'}</span>${value[1]}<b>→</b></button>`).join('');
  all('[data-answer]').forEach(button => button.addEventListener('click', () => answer(button.dataset.answer)));
  $('#quiz-back').disabled = state.index === 0;
}

function answer(value) {
  state.answers[state.index] = value;
  if (state.index < questions.length - 1) { state.index += 1; renderQuestion(); return; }
  calculatePersona(); go('persona');
}

function calculatePersona() {
  const count = key => state.answers.filter(answer => answer === key).length;
  const quiet = count('quiet') + count('courtyard'); const lively = count('lively') + count('street');
  const culture = count('culture'); const food = count('food'); const slow = count('slow') + count('free'); const explore = count('explore') + count('plan');
  let type = 'culture';
  if (slow >= 3 && quiet >= lively) type = 'quiet'; else if (food >= 2 && lively >= quiet) type = 'lively'; else if (slow >= 2 && explore >= 2 && culture >= 1) type = 'photo';
  state.routeId = type;
  const personas = {
    quiet: ['城墙听风者', '你会自然靠近留有余白的空间。在安静的光影、绿意与转角里，你更容易找到自己的步调。', ['安静停留', '风景优先', '松弛节奏']],
    culture: ['旧城拾光者', '你喜欢在街区里读到故事。建筑尺度、门洞和一段被保留下来的旧城线索，会让你愿意再走远一点。', ['人文线索', '探索发现', '有序漫游']],
    lively: ['街巷寻味者', '你会被城市正在发生的生活感吸引。声音、食物、手作和人与人的相遇，都是这次漫游的一部分。', ['烟火人气', '在地吃逛', '结伴分享']],
    photo: ['巷陌观景者', '你对光线、材质和空间层次有耐心。你不急着抵达，更愿意为一个有感觉的画面多停一会。', ['光影观察', '慢走探索', '自由停留']]
  };
  const [name, description, traits] = personas[type];
  state.persona = { name, description, traits, quiet, lively, plan: count('plan'), free: count('free') };
  localStorage.setItem('soulwalking-demo', JSON.stringify({ persona: state.persona, routeId: state.routeId }));
  $('#persona-name').textContent = name; $('#persona-description').textContent = description;
  $('#trait-list').innerHTML = traits.map(trait => `<span>${trait}</span>`).join('');
  $('#axis-energy').style.width = `${Math.max(18, Math.min(82, 50 + (lively - quiet) * 12))}%`;
  $('#axis-plan').style.width = `${Math.max(18, Math.min(82, 50 + (count('plan') - count('free')) * 20))}%`;
}

function renderChat() {
  const name = state.persona?.name || '还未完成测评的漫游者';
  $('#chat-messages').innerHTML = `<div class="message agent"><b>SoulWalking</b><p>你好，${name}。说说你想怎么走：一个人还是结伴、能走多久、想安静还是想吃逛？</p></div>${state.chatText ? `<div class="message user"><p>${escapeHtml(state.chatText)}</p></div><div class="message agent"><b>SoulWalking · 演示理解</b><p>我会把这句需求与本次空间偏好一起放进预设路线。接下来展示的是本地固定的推荐流程。</p></div>` : ''}`;
}

function generate(text) {
  state.chatText = text.trim() || '请按我的空间人格推荐老门东路线。';
  if (!state.persona) state.routeId = text.includes('吃') || text.includes('朋友') ? 'lively' : text.includes('拍') ? 'photo' : text.includes('安静') ? 'quiet' : 'culture';
  else if (text.includes('吃') || text.includes('朋友')) state.routeId = 'lively'; else if (text.includes('拍')) state.routeId = 'photo'; else if (text.includes('安静') || text.includes('一个人')) state.routeId = 'quiet';
  localStorage.setItem('soulwalking-demo', JSON.stringify({ persona: state.persona, routeId: state.routeId }));
  go('thinking'); renderThinking(); setTimeout(() => go('route'), 2200);
}

function renderThinking() {
  $('#thinking-quote').textContent = `“${state.chatText || '请按我的空间人格推荐老门东路线。'}”`;
  const items = [['空间人格匹配', state.persona?.name || '按本次文字偏好匹配'], ['老门东知识库', '演示：读取预设空间节点'], ['高德地图 MCP', '演示：固定步行距离与时长'], ['路线生成', '已匹配预设 Citywalk']];
  $('#thinking-steps').innerHTML = items.map(([title, note], index) => `<div class="thinking-step"><span>${String(index + 1).padStart(2, '0')}</span><div><b>${title}</b><small>${note}</small></div><i>演示完成</i></div>`).join('');
}

function renderRoute() {
  const route = routes[state.routeId] || routes.quiet;
  $('#route-title').textContent = route.title; $('#route-summary').textContent = route.summary;
  $('#route-badges').innerHTML = route.tags.map(tag => `<span>${tag}</span>`).join(''); $('#route-reason').textContent = route.reason;
  $('#stop-list').innerHTML = route.stops.map(([name, note], index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><div><h4>${name}</h4><p>${note}</p></div></li>`).join('');
  $('#tool-log').innerHTML = [['知识库检索', '老门东空间节点 · 固定结果'], ['天气与客流', '未连接 · 演示数据'], ['高德步行规划', `${route.tags[1]} · ${route.tags[2]} · 固定结果`]].map(([name, note]) => `<div><b>${name}</b><span>${note}</span><i>模拟</i></div>`).join('');
  const points = route.point.split(' ').map(pair => pair.split(',').map(Number)); const line = points.map(point => point.join(',')).join(' ');
  $('#route-map').innerHTML = `<rect width="520" height="440" fill="#202b2a"/><path d="M0 84H520M0 176H520M0 268H520M0 360H520M86 0V440M190 0V440M294 0V440M398 0V440" stroke="#31403d" stroke-width="1"/><path d="M18 360 C130 322 180 328 260 278 S400 210 520 184" fill="none" stroke="#344946" stroke-width="20" opacity=".55"/><polyline points="${line}" fill="none" stroke="${route.color}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="10 7"/>${points.map((point, index) => `<g transform="translate(${point[0]} ${point[1]})"><circle r="15" fill="#f6f1e9"/><circle r="10" fill="${route.color}"/><text y="4" text-anchor="middle" fill="#fff" font-family="system-ui" font-size="10" font-weight="700">${index + 1}</text></g>`).join('')}<text x="26" y="38" fill="#bdc7c1" font-family="serif" font-size="16">老门东 · 路线示意</text>`;
}

function renderMemory() { const saved = JSON.parse(localStorage.getItem('soulwalking-demo') || 'null'); $('#memory-card').innerHTML = saved?.persona ? `<span>最近的空间人格</span><h3>${saved.persona.name}</h3><p>${routes[saved.routeId]?.title || '尚未生成路线'} · 仅保存在本机</p>` : '<span>还没有本地记录</span><h3>等你开始一次漫游</h3><p>完成测评或生成路线后，这里会显示本次演示记录。</p>'; }
function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function toast(message) { const target = $('#toast'); target.textContent = message; target.classList.add('show'); setTimeout(() => target.classList.remove('show'), 2200); }
function renderCheckin() { const route = routes[state.routeId]; const stop = route.stops[state.checkin]; $('#checkin-stop').textContent = state.mealAdded && state.checkin === 1 ? '预设餐饮停靠点' : stop[0]; $('#checkin-progress').textContent = `第 ${state.checkin + 1} 站 / 共 ${route.stops.length} 站`; $('#walk-progress-bar').style.width = `${((state.checkin + 1) / route.stops.length) * 100}%`; $('#checkin-map-mini').innerHTML = `<b>${route.title}</b><p>${state.mealAdded ? '路线已插入固定餐饮停靠点，再继续前往下一站。' : `下一站：${route.stops[Math.min(state.checkin + 1, route.stops.length - 1)][0]}`}</p>`; }

all('[data-go]').forEach(button => button.addEventListener('click', () => go(button.dataset.go)));
$('#quiz-back').addEventListener('click', () => { if (state.index > 0) { state.index -= 1; renderQuestion(); } });
$('#chat-form').addEventListener('submit', event => { event.preventDefault(); generate($('#chat-input').value); });
all('[data-prompt]').forEach(button => button.addEventListener('click', () => { $('#chat-input').value = button.dataset.prompt; generate(button.dataset.prompt); }));
$('#share-persona').addEventListener('click', async () => { const text = `我在 SoulWalking 的空间人格是「${state.persona?.name || '漫游者'}」。`; try { await navigator.clipboard.writeText(text); toast('人格卡片文字已复制'); } catch { toast(text); } });
$('#copy-route').addEventListener('click', async () => { const route = routes[state.routeId]; const text = `${route.title}\n${route.tags.join(' · ')}\n${route.stops.map((stop, index) => `${index + 1}. ${stop[0]}：${stop[1]}`).join('\n')}`; try { await navigator.clipboard.writeText(text); toast('路线已复制'); } catch { toast('浏览器不支持自动复制'); } });
$('#print-route').addEventListener('click', () => window.print());
$('#swap-route').addEventListener('click', () => { const keys = Object.keys(routes); state.routeId = keys[(keys.indexOf(state.routeId) + 1) % keys.length]; state.checkin = 0; state.mealAdded = false; renderRoute(); toast('已切换为预设备选路线'); });
$('#start-checkin').addEventListener('click', () => { state.checkin = 0; state.mealAdded = false; renderCheckin(); go('checkin'); });
$('#next-stop').addEventListener('click', () => { const length = routes[state.routeId].stops.length; if (state.checkin < length - 1) { state.checkin += 1; renderCheckin(); } else toast('这条模拟漫游已经完成'); });
$('#meal-adjust').addEventListener('click', () => { state.mealAdded = true; renderCheckin(); toast('已在演示路线中插入固定餐饮停靠点'); });
$('#clear-memory').addEventListener('click', () => { localStorage.removeItem('soulwalking-demo'); toast('已清除当前浏览器的演示记录'); renderMemory(); });
const saved = JSON.parse(localStorage.getItem('soulwalking-demo') || 'null'); if (saved) { state.persona = saved.persona; state.routeId = saved.routeId || state.routeId; }
renderQuestion(); renderRoute(); renderMemory();
