const routes = [
  {
    id: 'quiet', tag: '独处 · 约 60 分钟', title: '城墙听风线',
    summary: '想慢一点、安静一点时，沿着绿荫与转角，把步伐交给老城。',
    intro: '这是一条以安静停留为主的短线。请在每一处觉得舒服的地方多停几分钟，不必赶路。',
    meta: ['约 1.2 km', '4 个停留点', '人少时更佳'],
    stops: [
      ['老门东牌坊', '从开阔的入口开始，先确认方向与当天的人流。'],
      ['凉亭·城墙东（尾）', '在城墙脚下停一会，感受绿意和开阔视野。'],
      ['窄巷', '放慢脚步，看一看巷子里的门头、光影和生活痕迹。'],
      ['茶舍', '用一杯茶或一段休息，为这次漫游留出余白。']
    ]
  },
  {
    id: 'culture', tag: '人文 · 约 90 分钟', title: '旧城拾光线',
    summary: '适合想了解老门东故事、愿意在建筑与展馆前驻足的午后。',
    intro: '这条路线把城墙、广场、园林入口和展览空间串起来。遇到开放的展馆或活动，可灵活延长停留。',
    meta: ['约 2.0 km', '5 个停留点', '适合下午'],
    stops: [
      ['老门东牌坊', '从牌坊进入，观察新旧建筑尺度如何交织。'],
      ['中心广场', '站在较开阔的位置，理解街区与城墙的关系。'],
      ['芥子园·入口', '沿着巷道向园林方向走，留意门洞与传统肌理。'],
      ['先锋书店', '在书店或周边檐下休息，挑一本与南京有关的书。'],
      ['金陵美术馆', '以展览与建筑外部空间作为路线的收束。']
    ]
  },
  {
    id: 'lively', tag: '烟火 · 约 120 分钟', title: '街巷寻味线',
    summary: '适合和朋友一起、想感受市集和餐饮烟火气的一次漫游。',
    intro: '这条路线人流相对集中，建议避开用餐高峰；不必每一站都消费，按状态选择一两处停留即可。',
    meta: ['约 2.4 km', '5 个停留点', '适合傍晚'],
    stops: [
      ['箍桶巷主街', '从主街进入，感受老门东最具烟火气的一面。'],
      ['文化展馆', '在热闹之间插入一段较安静的文化停留。'],
      ['金陵手作坊', '看看手作与地方材料，把“逛”变成一次发现。'],
      ['美食街·南京大牌档', '按现场排队与营业情况选择小吃或正餐。'],
      ['美食·绿柳居', '用一份点心或小吃，为这次街巷漫游收尾。']
    ]
  }
];

const grid = document.querySelector('#route-grid');
const result = document.querySelector('#result');
const quiz = document.querySelector('#route-quiz');
const routeReason = document.querySelector('#route-reason');
const selected = () => routes.find(route => route.id === sessionStorage.getItem('soulwalking-route')) || routes[0];

function renderCards() {
  grid.innerHTML = routes.map(route => `
    <article class="route-card">
      <span class="tag">${route.tag}</span><h3>${route.title}</h3><p>${route.summary}</p>
      <button class="button primary" data-route="${route.id}">选这条路线</button>
    </article>`).join('');
  grid.querySelectorAll('[data-route]').forEach(button => button.addEventListener('click', () => showRoute(button.dataset.route)));
}

function showRoute(id, reason = '') {
  const route = routes.find(item => item.id === id);
  sessionStorage.setItem('soulwalking-route', id);
  document.querySelector('#route-title').textContent = route.title;
  document.querySelector('#route-intro').textContent = route.intro;
  routeReason.textContent = reason;
  routeReason.hidden = !reason;
  document.querySelector('#route-meta').innerHTML = route.meta.map(item => `<span>${item}</span>`).join('');
  document.querySelector('#stop-list').innerHTML = route.stops.map(([name, note]) => `<li><h3>${name}</h3><p>${note}</p></li>`).join('');
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function recommendRoute(answers) {
  const scores = { quiet: 0, culture: 0, lively: 0 };
  const reasons = [];

  if (answers.energy === 'quiet') {
    scores.quiet += 3;
    scores.culture += 1;
    reasons.push('你更需要安静、可停留的空间');
  } else {
    scores.lively += 3;
    reasons.push('你想感受街巷的人气与烟火');
  }
  if (answers.interest === 'culture') {
    scores.culture += 3;
    scores.quiet += 1;
    reasons.push('你想把注意力留给建筑与旧城故事');
  } else {
    scores.lively += 3;
    reasons.push('你期待小吃、手作与在地发现');
  }
  if (answers.pace === 'slow') {
    scores.quiet += 2;
    reasons.push('你希望用更松弛的节奏行走');
  } else {
    scores.culture += 1;
    scores.lively += 1;
    reasons.push('你愿意多走一点、多看几个地点');
  }

  const priority = ['quiet', 'culture', 'lively'];
  const id = priority.reduce((best, current) => scores[current] > scores[best] ? current : best, priority[0]);
  return { id, reason: `推荐理由：${reasons.join('；')}。` };
}

document.querySelector('#copy-route').addEventListener('click', async () => {
  const route = selected();
  const text = `${route.title}\n${route.meta.join(' · ')}\n` + route.stops.map((stop, index) => `${index + 1}. ${stop[0]}：${stop[1]}`).join('\n');
  try { await navigator.clipboard.writeText(text); document.querySelector('#copy-route').textContent = '已复制'; }
  catch { document.querySelector('#copy-route').textContent = '请手动复制'; }
  window.setTimeout(() => { document.querySelector('#copy-route').textContent = '复制路线文字'; }, 1800);
});
document.querySelector('#print-route').addEventListener('click', () => window.print());
document.querySelector('#retake-quiz').addEventListener('click', () => {
  document.querySelector('#quiz').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
quiz.addEventListener('submit', event => {
  event.preventDefault();
  const answers = Object.fromEntries(new FormData(quiz).entries());
  const recommendation = recommendRoute(answers);
  showRoute(recommendation.id, recommendation.reason);
});
renderCards();
