/* ============================================================
   城格·漫游 · app.js —— 暗色三段式 + 出发漫游闭环
   封面 → 场景测试(可跳过) → 空间人格(邮寄戳分享) → 心情聊天(可跳过)
   → 思考链 → 路线(左图右文) → 出发漫游(盖章/临时反馈/重规划)
   → 漫游结束(反馈+画像微调)
   ============================================================ */
(function () {
  'use strict';
  /* 全局错误兜底 —— 如果 JS 出错，给用户提示而不是空白 */
  window.addEventListener('error', e => {
    console.error('城格漫游错误:', e.message, e.filename, e.lineno);
    const d = document.getElementById('err-fallback');
    if (d) { d.hidden = false; d.textContent = '加载出错：' + e.message; }
    /* 错误提示 6 秒后自动消失 —— 不要一直挂着 */
    setTimeout(() => { if (d) d.hidden = true; }, 6000);
  });
  /* 未捕获的 promise 错误也兜底 */
  window.addEventListener('unhandledrejection', e => {
    console.error('城格漫游 promise 错误:', e.reason);
    const d = document.getElementById('err-fallback');
    if (d) { d.hidden = false; d.textContent = '加载出错：' + (e.reason && e.reason.message || e.reason); }
    setTimeout(() => { if (d) d.hidden = true; }, 6000);
  });
  try {
  const CW = window.CITYWALK;
  const { DIMS, SPACE_NODES, QUIZ, sceneSVG, buildPersona, buildNeutralPersona, parseMood, fuse, matchScore, genRoute, clamp, dist } = CW;
  const $ = id => document.getElementById(id);

  const state = {
    qIndex: 0,
    answers: new Array(QUIZ.length).fill(null),
    persona: null,
    mood: { texts: [], parse: null, skipped: false },
    demand: null,
    route: null,
    sharedRoute: null,
    backendPlan: null,
    backendPlanPromise: null,
    cityContextPromise: null,
    diningRequest: null,
    map: null,
    mapConfig: null,
    walkMap: null,
    walkWatchId: null,
    userPosition: null,
    challenge: false,
    bigFiveIndex: 0,
    bigFiveAnswers: new Array(15).fill(null),
    walk: null, // { idx, visitedIds, stamps, heatScale, replanned }
  };
  const SPACE_FEATURES = [
    ['svi', '天空可视率', 'percent'],
    ['bvi', '建筑可视率', 'percent'],
    ['gvi', '绿视率', 'percent'],
    ['visual_entropy', '视觉熵', 'percent'],
    ['traditional_visibility', '传统要素可视率', 'percent'],
    ['interface_transparency', '界面通透率', 'percent'],
    ['relative_walk_width', '相对步行宽度', 'percent'],
    ['historic_cultural_richness', '历史文化丰富度', 'percent'],
    ['stay_activity_support', '停留活动支持度', 'percent'],
    ['accessible_node_density', '无障碍节点密度', 'percent'],
    ['environmental_maintenance', '环境维护度', 'percent'],
    ['spatial_depth_stddev', '空间深度标准差', 'number'],
    ['visible_path_choice', '可见路径选择数', 'number'],
  ];

  const BIG_FIVE_KEY = 'citywalk_cbfpi15_v1';
  const BIG_FIVE_OPTIONS = ['完全不同意', '大部分不同意', '有点不同意', '有点同意', '大部分同意', '完全同意'];
  const BIG_FIVE_ITEMS = [
    { text: '我觉得大部分人基本上是心怀善意的。', dim: 'A' },
    { text: '我对人多的聚会感到乏味。', dim: 'E', reverse: true },
    { text: '我是个勇于冒险，突破常规的人。', dim: 'O' },
    { text: '我喜欢冒险。', dim: 'O' },
    { text: '我尽量避免参加人多的聚会和嘈杂的环境。', dim: 'E', reverse: true },
    { text: '我喜欢一开头就把事情计划好。', dim: 'C' },
    { text: '我常担忧一些无关紧要的事情。', dim: 'N' },
    { text: '我工作或学习很勤奋。', dim: 'C' },
    { text: '虽然社会上有些骗子，但我觉得大部分人还是可信的。', dim: 'A' },
    { text: '我身上具有别人没有的冒险精神。', dim: 'O' },
    { text: '我常常感到内心不踏实。', dim: 'N' },
    { text: '我常担心有什么不好的事情要发生。', dim: 'N' },
    { text: '尽管人类社会存在着一些阴暗的东西（如战争、罪恶、欺诈），我仍然相信人性总的来说是善良的。', dim: 'A' },
    { text: '我喜欢参加社交与娱乐聚会。', dim: 'E' },
    { text: '做事讲究逻辑和条理是我的一个特点。', dim: 'C' },
  ];
  const BIG_FIVE_DIMS = [
    { key: 'A', label: '宜人性', color: '#e85a50' },
    { key: 'E', label: '外向性', color: '#d49030' },
    { key: 'O', label: '开放性', color: '#2db5a6' },
    { key: 'C', label: '尽责性', color: '#7e8fb2' },
    { key: 'N', label: '情绪敏感', color: '#9a6e86' },
  ];
  const QUESTION_IMAGES = {
    alley_quiet: './assets/questions/district-quiet.webp',
    street_busy: './assets/questions/district-busy.webp',
    cafe_courtyard: './assets/questions/cafe-courtyard.webp',
    cafe_street: './assets/questions/cafe-street.webp',
    lane_straight: './assets/questions/lane-straight.webp',
    lane_winding: './assets/questions/lane-winding.webp',
    wall_clean: './assets/questions/wall-clean.webp',
    wall_graffiti: './assets/questions/wall-graffiti.webp',
    route_direct: './assets/questions/route-direct.webp',
    route_scenic: './assets/questions/route-scenic.webp',
    mall_chain: './assets/questions/store-chain.webp',
    street_indie: './assets/questions/store-indie.webp',
    plan_free: './assets/questions/plan-free.webp',
    plan_map: './assets/questions/plan-map.webp',
    check_casual: './assets/questions/checkin-casual.webp',
    check_list: './assets/questions/checkin-planned.webp',
    dark_calm: './assets/questions/dark-alley-explore.webp',
    dark_tense: './assets/questions/dark-alley-leave.webp',
    crowd_ok: './assets/questions/crowd-enjoy.webp',
    crowd_bad: './assets/questions/crowd-uncomfortable.webp',
  };
  const PRODUCT_DIMS = [
    { key: 'safety', label: '安心感', wish: '我想走得安心' },
    { key: 'vitality', label: '热闹感', wish: '我想感受城市生命力' },
    { key: 'wealth', label: '品质感', wish: '我想要整洁、精致、有品质的空间' },
    { key: 'beauty', label: '审美感', wish: '我想看好看的空间' },
    { key: 'boredom', label: '探索感', wish: '我想遇到变化、惊喜和未知', inverse: true },
    { key: 'depression', label: '松弛感', wish: '我想要开阔、舒服、不拥挤', inverse: true },
    { key: 'humanity', label: '地方感', wish: '我想感受这里真正的文化和生活' },
    { key: 'social', label: '互动感', wish: '我想停留、互动、参与城市生活' },
  ];
  const USER_ID_KEY = 'sw_light_user_id';
  const NORTH_GATE = {
    longitude: 118.787898,
    latitude: 32.012777,
    name: '老门东北门',
  };
  const SESSION_ID = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `session-${Date.now()}`;
  const OLD_MENDONG_BBOX = { minLng: 118.785, maxLng: 118.815, minLat: 31.995, maxLat: 32.025 };
  const LOCAL_DINING_DENSITY = null;
  // GitHub Pages 没有运行后端：保留原版交互和本地空间库，
  // 将实时接口明确降级为可复现的展示数据，避免请求一个并不存在的 API。
  const STATIC_DEMO = true;
  const STATIC_CITY_CONTEXT = {
    weather: { available: true, condition: '晴间多云', temperature_c: 28, warning: '静态展示数据 · 南京秦淮区' },
    crowd: { old_mendong_area: { available: true, comfort: '舒适', current: 1260 }, source_label: '静态展示数据', publication_schedule: '非实时数据' },
  };
  let localDiningDensityPromise = null;
  const getUserId = () => {
    let id = localStorage.getItem(USER_ID_KEY);
    if (!id) {
      id = (window.crypto && window.crypto.randomUUID) ? window.crypto.randomUUID() : `user-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(USER_ID_KEY, id);
    }
    return id;
  };
  async function api(path, options) {
    if (STATIC_DEMO) {
      if (path === '/api/v1/city-context') return STATIC_CITY_CONTEXT;
      if (path === '/api/v1/map/config') return { enabled: false };
      if (path === '/api/v1/fieldwork/track') return { track: { features: [] } };
      if (path === '/api/v1/feedback' || path === '/api/v1/profile/bigfive') return { ok: true, static_demo: true };
      throw new Error('当前为 GitHub Pages 静态演示，已使用本地路线数据');
    }
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options && options.headers || {}) },
    });
    let data = null;
    try { data = await response.json(); } catch (e) { /* non-json response */ }
    if (!response.ok) throw new Error((data && data.detail) || `请求失败：${response.status}`);
    return data;
  }
  function inOldMendong(point) {
    return point && Number(point.longitude) >= OLD_MENDONG_BBOX.minLng
      && Number(point.longitude) <= OLD_MENDONG_BBOX.maxLng
      && Number(point.latitude) >= OLD_MENDONG_BBOX.minLat
      && Number(point.latitude) <= OLD_MENDONG_BBOX.maxLat;
  }
  function nodeInOldMendong(node) {
    const point = node && (node.mapCoordinate || node.coordinate || node);
    return !point || !Number.isFinite(Number(point.longitude)) || !Number.isFinite(Number(point.latitude)) || inOldMendong(point);
  }
  function renderMapLegend(target, stops) {
    if (!target) return;
    const items = stops.map((stop, index) => `<span><b>${index + 1}</b> ${escapeHtml(shortNodeName(stop.n))}</span>`).join('');
    target.insertAdjacentHTML('beforeend', `<div class="map-node-legend" aria-label="地图节点顺序">${items}</div>`);
  }
  async function loadLocalDiningDensity() {
    if (!localDiningDensityPromise) {
      localDiningDensityPromise = Array.isArray(LOCAL_DINING_DENSITY)
        ? Promise.resolve(LOCAL_DINING_DENSITY)
        : fetch('./assets/light/dining_density.json').then(response => {
          if (!response.ok) throw new Error(`餐饮密度表加载失败：${response.status}`);
          return response.json();
        });
    }
    return localDiningDensityPromise;
  }
  function scalePercent(value, fallback = 0.5) {
    const n = Number(value);
    if (Number.isFinite(n)) return Math.round(clamp(n, 0, 1) * 100);
    return Math.round(clamp(fallback, 0, 1) * 100);
  }
  function backendProfileFromPersona(persona) {
    const norm = persona && persona.norm || {};
    const base = persona && persona.base8D || {};
    const fromBase = key => clamp(((Number(base[key]) || 3) - 1) / 4, 0, 1);
    return {
      openness: scalePercent(norm.O, fromBase('beauty')),
      conscientiousness: scalePercent(norm.C, (fromBase('safety') + fromBase('wealth')) / 2),
      extraversion: scalePercent(norm.E, (fromBase('vitality') + fromBase('social')) / 2),
      agreeableness: scalePercent(norm.A, (fromBase('humanity') + fromBase('beauty')) / 2),
      neuroticism: scalePercent(norm.N, fromBase('safety')),
      source: persona && persona.neutral ? 'default' : 'explicit',
      confidence: persona && persona.neutral ? 0.45 : 0.78,
    };
  }
  const perceptionToFive = value => clamp(1 + ((Number(value) || 4) - 1) * 4 / 6, 1, 5);
  function localNodeForBackend(item, index) {
    const id = String(item && item.space_id || '');
    const number = Number((id.match(/\d+/) || [index + 1])[0]);
    return SPACE_NODES.find(n => Number((String(n.id).match(/\d+/) || [0])[0]) === number)
      || SPACE_NODES.find(n => item && (item.name || '').includes(n.name.replace('老门东·', '').replace(/^\d+\s*/, '')))
      || SPACE_NODES[index % SPACE_NODES.length];
  }
  function normalizedCoordinate(value) {
    const point = value && (value.map_coordinate || value.coordinate || value);
    if (!point || !Number.isFinite(Number(point.longitude)) || !Number.isFinite(Number(point.latitude))) return null;
    return {
      longitude: Number(point.longitude),
      latitude: Number(point.latitude),
      name: point.name || value.name || '',
    };
  }
  function routeFromBackendPlan(plan) {
    const recommendations = (plan && plan.recommendations || []).slice(0, 8);
    if (!recommendations.length) return null;
    const stops = recommendations.map((item, index) => {
      const base = localNodeForBackend(item, index);
      const p = item.perceptions || {};
      const image = item.images && item.images[0];
      const node = {
        ...base,
        id: base.id,
        backendSpaceId: item.space_id || null,
        coordinate: normalizedCoordinate(item.coordinate),
        mapCoordinate: normalizedCoordinate(item.map_coordinate || item.coordinate),
        name: item.name && item.name.startsWith('老门东') ? item.name : `老门东·${item.name || base.name.replace('老门东·', '')}`,
        type: '后端实测节点',
        desc: item.reason || item.description || base.desc,
        tags: Array.isArray(item.tags) && item.tags.length ? item.tags : base.tags,
        profile: item.perceptions ? {
          safety: perceptionToFive(p.safety),
          vitality: perceptionToFive(p.vitality),
          wealth: perceptionToFive(p.prosperity),
          beauty: perceptionToFive(p.beauty),
          boredom: perceptionToFive(p.boredom),
          depression: perceptionToFive(p.oppression),
          humanity: perceptionToFive(p.humanistic_place),
          social: perceptionToFive(p.social_interaction),
        } : base.profile,
        features: item.features || base.features || null,
        backendImageUrl: image && image.url,
        backendImageAlt: image && image.alt,
      };
      return {
        n: node,
        s: item.score && Number.isFinite(Number(item.score.final)) ? Number(item.score.final) / 100 : matchScore(node, state.demand, state.challenge, state.persona.base8D),
        source: 'backend',
      };
    }).filter(stop => nodeInOldMendong(stop.n));
    const route = plan.route || {};
    const walkMinutes = Number(route.duration_minutes || 0);
    const citywalkMinutes = Math.max(30, Math.round(walkMinutes + stops.length * 8));
    return {
      stops,
      km: route.distance_meters ? (route.distance_meters / 1000).toFixed(1) : computeRoute().km,
      mins: citywalkMinutes || computeRoute().mins,
      walkMins: walkMinutes,
      pathCoordinates: (route.path_coordinates || []).map(normalizedCoordinate).filter(Boolean),
      geometryComplete: !!route.geometry_complete,
      backend: true,
      plan,
    };
  }
  function backendQuery() {
    const mood = state.mood.texts.join('；');
    const vector = productVector(state.demand || state.persona.base8D);
    const topWishes = [...vector].sort((a, b) => b.value - a.value).slice(0, 3).map(x => x.wish).join('；');
    return [
      mood || `我想在老门东按自己的节奏走走`,
      `我更期待：${topWishes}`,
      state.challenge ? '我愿意在熟悉的偏好之外，多看看一点新的城市体验' : '',
    ].filter(Boolean).join('；');
  }
  function productVector(demand) {
    return PRODUCT_DIMS.map(dim => ({
      ...dim,
      value: Number((dim.inverse ? 6 - demand[dim.key] : demand[dim.key]).toFixed(1)),
    }));
  }
  function productDimLabel(key) {
    return (PRODUCT_DIMS.find(dim => dim.key === key) || {}).label || key;
  }
  function productTags(demand) {
    const vector = productVector(demand);
    const byKey = Object.fromEntries(vector.map(x => [x.key, x.value]));
    const tags = [];
    if (byKey.humanity >= 3.5) tags.push('历史');
    if (byKey.beauty >= 3.5) tags.push('拍照');
    if (byKey.boredom >= 3.5) tags.push('小众');
    if (byKey.depression >= 3.5) tags.push('自然', '绿化');
    if (/咖啡|喝|奶茶|茶/.test(state.mood.texts.join('，'))) tags.push('咖啡');
    return [...new Set(tags)].slice(0, 6);
  }
  function backendConstraintsFromDemand() {
    const demand = state.demand || state.persona.base8D;
    const parsed = state.mood.parse && state.mood.parse.constraints || {};
    const duration = parsed.duration === 'short' ? 60 : parsed.duration === 'long' ? 240 : 120;
    const vector = Object.fromEntries(productVector(demand).map(x => [x.key, x.value]));
    return {
      price_level: '不限',
      indoor: /下雨|雨|晒|热|冷/.test(state.mood.texts.join('，')) ? true : null,
      quiet: vector.vitality <= 2.4 || vector.social <= 2.4 ? true : vector.vitality >= 3.8 || vector.social >= 3.8 ? false : null,
      duration_minutes: Math.max(30, duration),
      start: NORTH_GATE,
      tags: productTags(demand),
      accessibility_required: false,
    };
  }
  async function requestBackendPlan() {
    try {
      const plan = await api('/api/v1/plans', {
        method: 'POST',
        body: JSON.stringify({
          user_id: getUserId(),
          session_id: SESSION_ID,
          query: backendQuery(),
          profile: backendProfileFromPersona(state.persona),
          constraints: backendConstraintsFromDemand(),
          mode: state.challenge ? 'challenge' : 'normal',
          use_memory: true,
        }),
      });
      state.backendPlan = plan;
      return plan;
    } catch (error) {
      console.warn('后端路线不可用，使用前端本地路线：', error);
      state.backendPlan = null;
      return null;
    }
  }
  async function loadCityContext() {
    if (state.cityContextPromise) return state.cityContextPromise;
    state.cityContextPromise = api('/api/v1/city-context').then(context => {
      const weather = context.weather || {};
      const crowd = context.crowd || {};
      const weatherText = weather.available
        ? `${weather.condition || '天气已更新'}${weather.temperature_c == null ? '' : ` · ${weather.temperature_c}°C`}`
        : '实时天气暂不可用';
      const crowdSpot = crowd.old_mendong_area || {};
      const crowdText = crowdSpot.available && crowdSpot.current != null
        ? `${crowdSpot.comfort || '已发布'} · ${Number(crowdSpot.current).toLocaleString()} 人`
        : (crowdSpot.comfort || '本时点暂未发布有效客流');
      $('context-weather').textContent = weatherText;
      $('context-weather-source').textContent = weather.warning || '天气数据 · 南京秦淮区';
      $('context-crowd').textContent = crowdText;
      $('context-crowd-source').textContent = crowd.warning || `${crowd.source_label || '南京文旅官方快照'} · ${crowd.publication_schedule || '按发布时点更新'}`;
      $('city-context-time').textContent = `更新于 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      return context;
    }).catch(error => {
      $('context-weather').textContent = '晴间多云 · 28°C';
      $('context-crowd').textContent = '舒适 · 本地现场快照';
      $('context-weather-source').textContent = '实时接口暂不可用，已切换本地演示状态';
      $('context-crowd-source').textContent = '实时接口暂不可用，已切换本地演示状态';
      return { weather: { available: true }, crowd: { old_mendong_area: { available: true } }, fallback: true };
    });
    return state.cityContextPromise;
  }
  async function syncBackendFeedback(note, rating, favoriteIds) {
    if (!rating) return;
    const liked = favoriteIds.flatMap(id => {
      const n = SPACE_NODES.find(x => x.id === id) || (state.route && state.route.stops || []).find(s => s.n.id === id)?.n;
      return n ? n.tags : [];
    });
    const disliked = (state.walk && state.walk.dislikes || []).flatMap(id => {
      const n = SPACE_NODES.find(x => x.id === id) || (state.route && state.route.stops || []).find(s => s.n.id === id)?.n;
      return n ? n.tags : [];
    });
    try {
      await api('/api/v1/feedback', {
        method: 'POST',
        body: JSON.stringify({
          user_id: getUserId(),
          session_id: SESSION_ID,
          rating,
          liked_tags: [...new Set(liked)].slice(0, 12),
          disliked_tags: [...new Set(disliked)].slice(0, 12),
          comment: note || null,
        }),
      });
    } catch (error) {
      console.warn('后端反馈同步失败：', error);
    }
  }

  /* ---------------- 屏切换 ---------------- */
  function go(name) {
    const targetId = 'scr-' + name;
    document.querySelectorAll('.screen').forEach(screen =>
      screen.classList.toggle('active', screen.id === targetId));
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('[data-back]').forEach(b =>
    b.addEventListener('click', () => go(b.dataset.back)));

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ============================================================
     ① 封面
     ============================================================ */
  const LS_KEY = 'citywalk_persona_v1';
  const MEMORY_KEY = 'citywalk_memory_v1';
  const emptyArchive = () => ({ profiles: [], journeys: [] });
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const formatMemoryDate = value => {
    const d = new Date(value || Date.now());
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const formatMemoryDateTime = value => {
    const d = new Date(value || Date.now());
    const pad = number => String(number).padStart(2, '0');
    return `${formatMemoryDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  function canonicalScene(nodeId, name) {
    const source = String(nodeId || '');
    const number = (source.match(/\d+/) || String(name || '').match(/^(?:老门东·)?(\d{1,2})\b/) || [])[1] || (source.match(/\d+/) || [])[0];
    const node = number && SPACE_NODES.find(item => Number((String(item.id).match(/\d+/) || [0])[0]) === Number(number));
    return {
      nodeId: node ? node.id : (nodeId || null),
      name: node ? node.name : String(name || '未知场景'),
    };
  }
  function sceneEvents(archive, kind) {
    const plural = kind === 'like' ? 'favoriteEvents' : 'photoEvents';
    const legacy = kind === 'like' ? 'favorites' : 'photos';
    const groups = new Map();
    (archive.journeys || []).forEach(journey => {
      const records = Array.isArray(journey[plural]) && journey[plural].length
        ? journey[plural]
        : (journey[legacy] || []).map(name => ({ name, legacy: true }));
      records.forEach(record => {
        const scene = canonicalScene(record.nodeId, record.name);
        const key = scene.nodeId || scene.name;
        if (!groups.has(key)) groups.set(key, { ...scene, events: [] });
        const visit = (journey.visitEvents || []).find(item => canonicalScene(item.nodeId, item.name).nodeId === scene.nodeId);
        groups.get(key).events.push({
          occurredAt: record.occurredAt || null,
          visitAt: record.visitAt || (visit && visit.occurredAt) || null,
          journeyCreatedAt: journey.createdAt,
          legacy: !!record.legacy,
        });
      });
    });
    return [...groups.values()];
  }
  function loadArchive() {
    try {
      const a = JSON.parse(localStorage.getItem(MEMORY_KEY) || 'null');
      return a && Array.isArray(a.profiles) && Array.isArray(a.journeys) ? a : emptyArchive();
    } catch (e) { return emptyArchive(); }
  }
  function saveArchive(archive) {
    try { localStorage.setItem(MEMORY_KEY, JSON.stringify(archive)); } catch (e) { /* ignore */ }
  }
  function updateMemorySummary() {
    const a = loadArchive();
    const latest = a.profiles[0];
    $('cover-memory-summary').textContent = latest
      ? `已经收好 ${a.profiles.length} 次测试与 ${a.journeys.length} 段漫游。最近的你是「${latest.nickname}」。`
      : '完成第一次测试后，记忆会从这里慢慢生长。';
  }
  function savePersona() {
    try {
      const p = state.persona;
      const poleKey = pole => Object.keys(CW.POLE).find(key => CW.POLE[key] === pole || CW.POLE[key].label === (pole && pole.label || pole));
      localStorage.setItem(LS_KEY, JSON.stringify({
        nickname: p.nickname, mainKey: poleKey(p.main), subKey: poleKey(p.sub),
        poleList: p.poleList, poles: p.poles, norm: p.norm, blurb: p.blurb, base8D: p.base8D,
        source: p.source || null, bigFiveScores: p.bigFiveScores || null, bigFiveUpdatedAt: p.bigFiveUpdatedAt || null,
        neutral: !!p.neutral,
        updatedAt: new Date().toISOString(),
      }));
    } catch (e) { /* ignore */ }
  }
  function recordProfileSnapshot() {
    if (!state.persona || state.persona.neutral) return;
    const p = state.persona;
    const archive = loadArchive();
    archive.profiles.unshift({
      id: `profile-${Date.now()}`,
      createdAt: new Date().toISOString(),
      city: '南京 · 老门东',
      nickname: p.nickname,
      poleList: (p.poleList || []).map(x => ({ label: x.label, strong: !!x.strong })),
      blurb: p.blurb,
      base8D: { ...p.base8D },
    });
    archive.profiles = archive.profiles.slice(0, 12);
    saveArchive(archive);
    updateMemorySummary();
  }
  function hydrateSavedPersona(saved) {
    if (!saved || !saved.nickname || !saved.base8D) return null;
    const poleByLabel = label => Object.values(CW.POLE).find(pole => pole.label === label);
    saved.main = CW.POLE[saved.mainKey] || poleByLabel(saved.main) || CW.POLE.E_L;
    saved.sub = CW.POLE[saved.subKey] || poleByLabel(saved.sub) || CW.POLE.A_R;
    saved.poles = saved.poles || {};
    saved.norm = saved.norm || {};
    return saved;
  }
  function readSavedPersona() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function hasProfileBasis() {
    const saved = readSavedPersona();
    const bigFive = loadBigFiveResult();
    const archive = loadArchive();
    return !!(bigFive && bigFive.scores)
      || !!(saved && saved.base8D && !saved.neutral)
      || archive.profiles.length > 0;
  }
  function startMoodJourney(preferredPersona) {
    let persona = preferredPersona || state.persona;
    if (!persona) {
      try { persona = hydrateSavedPersona(JSON.parse(localStorage.getItem(LS_KEY) || 'null')); }
      catch (e) { persona = null; }
    }
    if (!persona) {
      persona = buildNeutralPersona();
      state.persona = persona;
      savePersona();
    } else {
      state.persona = persona;
    }
    state.mood = { texts: [], parse: null, skipped: false };
    enterMood();
  }
  function loadSaved() {
    try {
      const p = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (p && p.nickname && p.base8D) {
        $('welcome-back').hidden = false;
        $('welcome-back').textContent = `欢迎回来，「${p.nickname}」——你的空间人格我们还记得。`;
        $('btn-resume').hidden = false;
        $('resume-name').textContent = p.nickname;
        $('btn-resume').onclick = () => startMoodJourney(hydrateSavedPersona(p));
      }
    } catch (e) { /* ignore */ }
  }
  loadSaved();
  updateMemorySummary();

  $('btn-enter-hub').addEventListener('click', () => go('hub'));

  $('btn-memory-cover').addEventListener('click', () => {
    renderMemory();
    go('memory');
  });

  $('btn-city-plan').addEventListener('click', () => go('city-plan'));

  $('btn-start').addEventListener('click', () => {
    state.qIndex = 0;
    state.answers.fill(null);
    renderQuestion();
    go('test');
  });
  $('btn-mood-start').addEventListener('click', () => startMoodJourney());

  /* ============================================================
     ② 空间测试
     ============================================================ */
  function renderQuestion() {
    const q = QUIZ[state.qIndex];
    $('q-now').textContent = state.qIndex + 1;
    $('q-title').textContent = q.q;
    $('test-progress').style.width = ((state.qIndex) / QUIZ.length * 100) + '%';

    const pair = $('scene-pair');
    pair.innerHTML = '';
    [['a', q.a], ['b', q.b]].forEach(([side, opt]) => {
      const card = document.createElement('div');
      card.className = 'scene-card' + (state.answers[state.qIndex] === side ? ' picked' : '');
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', opt.cap);
      const image = QUESTION_IMAGES[opt.key];
      card.innerHTML = `<div class="scene-photo ${image ? '' : `scene-sheet-${opt.sheet}`}" style="${image ? `background-image:url('${image}');background-size:cover;background-position:center` : `--scene-x:${opt.x}%;--scene-y:${opt.y}%`}" role="img" aria-label="${opt.cap}"></div>` +
        `<div class="cap"><span class="tick">✓ </span>${opt.cap}</div>`;
      const choose = () => {
        state.answers[state.qIndex] = side;
        pair.querySelectorAll('.scene-card').forEach(c => c.classList.remove('picked'));
        card.classList.add('picked');
        setTimeout(() => {
          if (state.qIndex < QUIZ.length - 1) {
            state.qIndex++;
            renderQuestion();
          } else {
            finishTest();
          }
        }, 420);
      };
      card.addEventListener('click', choose);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); }
      });
      pair.appendChild(card);
    });
    $('btn-prev-q').disabled = state.qIndex === 0;
  }

  $('btn-prev-q').addEventListener('click', () => {
    if (state.qIndex > 0) { state.qIndex--; renderQuestion(); }
  });

  // 跳过测试 → 中性人格
  $('btn-skip-test').addEventListener('click', () => {
    state.persona = buildNeutralPersona();
    savePersona();
    renderPersona();
    go('persona');
    toast('没关系，我们边走边认识你');
  });

  function finishTest() {
    state.persona = buildPersona(state.answers);
    savePersona();
    recordProfileSnapshot();
    renderPersona();
    go('persona');
    toast('这一次的空间人格，已经替你收进漫游记忆');
  }

  /* ============================================================
     ③ 空间人格：昵称 + 邮寄戳分享
     ============================================================ */
  function renderPersona() {
    const p = state.persona;
    $('persona-nickname').textContent = `「${p.nickname}」`;
    $('persona-poles').innerHTML = p.neutral
      ? `<span class="pole-chip">边走边认识你</span>`
      : p.poleList.map(x => `<span class="pole-chip${x.strong ? ' strong' : ''}">${x.label}</span>`).join('');
    $('persona-blurb').textContent = p.blurb;

    if (p.neutral) {
      $('persona-likes').innerHTML = `<div class="lbl">你可能会喜欢的地方</div><span class="like-node">聊聊今天，马上就知道</span>`;
    } else {
      const top = SPACE_NODES.map(n => ({ n, s: matchScore(n, p.base8D, false, null) }))
        .sort((a, b) => b.s - a.s).slice(0, 3);
      $('persona-likes').innerHTML = `<div class="lbl">你可能会喜欢的地方</div>` +
        top.map(x => `<span class="like-node">◈ ${x.n.name}</span>`).join('');
    }
  }

  $('btn-retest').addEventListener('click', () => {
    state.qIndex = 0; state.answers.fill(null);
    renderQuestion(); go('test');
  });
  $('btn-to-mood').addEventListener('click', () => {
    state.mood = { texts: [], parse: null, skipped: false };
    enterMood();
  });
  $('btn-persona-generate').addEventListener('click', () => {
    state.mood = { texts: [], parse: null, skipped: true };
    startThinking();
  });

  $('btn-share').addEventListener('click', async () => {
    const p = state.persona;
    const text = p.neutral
      ? `我正在「城格·漫游」打开老门东的心动之钥，来和我一起走走～`
      : `我在「城格·漫游」测出了自己的空间人格：「${p.nickname}」（${p.main.label} × ${p.sub.label}）。${p.main.desc}。来测测你的是什么样～`;
    if (navigator.share) {
      try { await navigator.share({ title: '我的空间人格', text }); return; } catch (e) { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制空间人格卡片，去粘贴给朋友吧 ♥');
    } catch (e) {
      toast(text);
    }
  });

  /* ============================================================
     ④ 心情聊天
     ============================================================ */
  const CHIPS = ['今天有点累', '特别开心', '想安静', '一个人来的', '和朋友一起',
    '大概走半小时', '想走久一点', '想喝杯咖啡', '想吃饭'];

  function enterMood() {
    const name = state.persona.nickname;
    const known = hasProfileBasis();
    $('mood-title').textContent = '心境之钥 · Soulwalking';
    $('chat').innerHTML = '';
    botSay(known
      ? `「${name}」，今天想从哪里聊起？心情、同行的人、想走多久，或者想不想顺路吃点喝点，都可以慢慢说。我会尽量把已经理解到的你，和今天的状态一起放进路线里。`
      : `「${name}」，今天想从哪里聊起？心情、同行的人、想走多久，都可以慢慢说。如果愿意，也可以告诉我 MBTI；它只会作为一个小线索，不会成为定义你的标签。`);
    $('mood-chips').innerHTML = CHIPS.map(c => `<button class="chip">${c}</button>`).join('') +
      (known ? '' : `<button class="chip chip-mbti" data-mbti-guide>我的 MBTI 是…</button>`);
    document.querySelectorAll('#mood-chips .chip').forEach(b => b.addEventListener('click', () => {
      if (b.hasAttribute('data-mbti-guide')) {
        $('mood-input').value = '我的 MBTI 是 ';
        $('mood-input').focus();
        return;
      }
      sendUser(b.textContent);
    }));
    $('btn-generate').disabled = false;
    loadCityContext();
    go('mood');
    setTimeout(() => $('mood-input').focus(), 300);
  }

  function botSay(t) {
    const d = document.createElement('div');
    d.className = 'msg bot'; d.textContent = t;
    $('chat').appendChild(d);
    $('chat').scrollTop = $('chat').scrollHeight;
  }
  function sysSay(t) {
    const d = document.createElement('div');
    d.className = 'msg sys'; d.textContent = t;
    $('chat').appendChild(d);
    $('chat').scrollTop = $('chat').scrollHeight;
  }
  function userSay(t) {
    const d = document.createElement('div');
    d.className = 'msg user'; d.textContent = t;
    $('chat').appendChild(d);
    $('chat').scrollTop = $('chat').scrollHeight;
  }

  // 引导追问：缺什么问什么，引导说更多
  function nextProbe(parse) {
    const c = (parse && parse.constraints) || {};
    if (!c.people) return '对了，今天几个人一起呀？自己一个人，还是和朋友？';
    if (state.mood.texts.join('').indexOf('咖啡') < 0 && state.mood.texts.join('').indexOf('吃') < 0 && state.mood.texts.join('').indexOf('喝') < 0)
      return '想顺便喝点什么、吃点什么吗？比如一杯咖啡、一碗小吃——我好把歇脚的点排进去。';
    if (!/鞋|脚|重|拎|背/.test(state.mood.texts.join('')))
      return '脚上的鞋好走吗？随身带的东西重不重？这决定我给你排多少路。';
    return '还有什么想告诉我的吗？没有的话，我们就出发！';
  }

  function sendUser(text) {
    text = (text || '').trim();
    if (!text) return;
    userSay(text);
    state.mood.texts.push(text);
    $('mood-input').value = '';
    $('btn-generate').disabled = false;

    const merged = state.mood.texts.join('，');
    const r = parseMood(merged);
    state.mood.parse = r;

    const bits = [];
    if (r.constraints.peopleLabel) bits.push(r.constraints.peopleLabel);
    if (r.constraints.timeLabel) bits.push(r.constraints.timeLabel);
    if (r.constraints.durationLabel) bits.push(r.constraints.durationLabel);
    const devTxt = DIMS.map(d => ({ d, diff: r.mood8D[d.key] - 3 }))
      .filter(x => Math.abs(x.diff) > 0.4)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 2)
      .map(x => (x.diff > 0 ? '想要更多' : '想远离') + '「' + productDimLabel(x.d.key) + '」').join('、');
    const mbti = merged.match(/\b([EI][NS][TF][JP](?:-[AT])?)\b/i);
    sysSay('我理解到：' + (bits.join(' · ') || '今天的状态') + (mbti ? ` · MBTI ${mbti[1].toUpperCase()}（仅作参考）` : '') + (devTxt ? ' · ' + devTxt : ''));
    botSay(!mbti && state.mood.texts.length === 1 && !hasProfileBasis()
      ? '这些已经足够我开始理解你了。如果你知道自己的 MBTI，也可以顺手告诉我；不知道也完全没关系。想继续说，我还在听。'
      : '这些已经足够我开始理解你了。想继续说，我还在听；准备好了，就让我们一起看看今天更适合怎样的空间。');
  }

  $('btn-send').addEventListener('click', () => sendUser($('mood-input').value));
  $('mood-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendUser($('mood-input').value); });

  $('btn-generate').addEventListener('click', () => {
    state.mood.skipped = !state.mood.parse;
    startThinking();
  });
  $('btn-mood-to-test').addEventListener('click', () => {
    state.qIndex = 0;
    state.answers.fill(null);
    renderQuestion();
    go('test');
  });

  /* ---------- 语音输入（不可用时优雅降级） ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  $('btn-mic').addEventListener('click', () => {
    if (!SR) {
      toast('当前浏览器/环境不支持语音，直接打字也一样～');
      $('mood-input').focus();
      return;
    }
    if (listening) { rec.stop(); return; }
    rec = new SR();
    rec.lang = 'zh-CN'; rec.interimResults = false;
    const ms = $('mic-status');
    ms.hidden = false; ms.textContent = '🎙 聆听中…请说话';
    $('btn-mic').classList.add('listening');
    listening = true;
    rec.onresult = e => {
      const t = e.results[0][0].transcript;
      $('mood-input').value = t;
      sendUser(t);
    };
    rec.onerror = e => {
      ms.textContent = '语音没听清（' + e.error + '），试试打字吧';
      $('mood-input').focus();
    };
    rec.onend = () => {
      listening = false;
      $('btn-mic').classList.remove('listening');
      setTimeout(() => { ms.hidden = true; }, 1800);
    };
    try { rec.start(); } catch (e) { ms.textContent = '语音启动失败，请直接打字'; }
  });

  /* ============================================================
     ⑤ 思考链
     ============================================================ */
  async function startThinking() {
    const steps = buildThinkSteps();
    state.backendPlanPromise = requestBackendPlan();
    const box = $('think-steps');
    box.innerHTML = steps.map((s, i) =>
      `<div class="tstep" id="tstep-${i}">
        <span class="dot" aria-hidden="true"></span>
        <p><b class="thought-cue">${s.title}</b>${s.body}</p>
      </div>`).join('');
    $('think-title').textContent = `正在为「${state.persona.nickname}」把线索慢慢连起来…`;
    $('think-live-text').textContent = '正在听懂你的话';
    go('think');

    steps.forEach((s, i) => {
      setTimeout(() => {
        const el = $('tstep-' + i);
        box.querySelectorAll('.tstep.is-current').forEach(x => {
          x.classList.remove('is-current');
          x.classList.add('done');
        });
        if (el) {
          el.classList.add('on', 'is-current');
          $('think-live-text').textContent = s.status;
        }
      }, 420 + i * 820);
    });
    const baseWait = 420 + steps.length * 820 + 520;
    setTimeout(() => { if ($('think-live-text')) $('think-live-text').textContent = '空间数据已匹配，AI 正在组织路线说明…'; }, baseWait + 1500);
    setTimeout(() => { if ($('think-live-text')) $('think-live-text').textContent = '正在校对道路衔接与实拍节点…'; }, baseWait + 6000);
    setTimeout(async () => {
      try {
        await state.backendPlanPromise;
        $('think-live-text').textContent = '路线已经想好了，正在交给你';
        renderRoute();
        go('route');
      } catch (error) {
        console.error('路线渲染失败：', error);
        try { renderRoute(); } catch (_) {}
        go('route');
        toast('路线展示遇到问题，已尝试恢复');
      }
    }, baseWait);
  }

  function buildThinkSteps() {
    const p = state.persona;
    const skipped = state.mood.skipped || !state.mood.parse;
    if (skipped) {
      state.demand = { ...p.base8D };
    } else {
      state.demand = fuse(p.base8D, state.mood.parse.mood8D);
    }

    const joined = state.mood.texts.join('，');
    const constraints = (state.mood.parse && state.mood.parse.constraints) || {};
    const understood = [];
    if (/累|疲惫|疲倦|困|脚疼/.test(joined)) understood.push('疲惫');
    if (/开心|高兴|兴奋|快乐/.test(joined)) understood.push('心情轻快');
    if (constraints.peopleLabel) understood.push(constraints.peopleLabel);
    if (constraints.durationLabel) understood.push(constraints.durationLabel.replace('约 ', ''));
    if (/安静|静一静|独处|一个人/.test(joined)) understood.push('希望安静');
    if (/坐|休息|累|咖啡|喝/.test(joined)) understood.push('希望有地方坐');
    if (!understood.length) understood.push(p.neutral ? '以今天的选择为主' : `沿用「${p.nickname}」的稳定偏好`);

    const ranked = SPACE_NODES.map(n => ({ n, s: matchScore(n, state.demand, false, p.base8D) }))
      .sort((a, b) => b.s - a.s);
    const recalled = ranked.slice(0, 8);
    const selected = recalled.slice(0, 5);
    const archive = loadArchive();
    const stopsN = (!skipped && state.mood.parse && state.mood.parse.constraints.duration === 'short') ? 3
      : (!skipped && state.mood.parse && state.mood.parse.constraints.duration === 'long') ? 8 : 5;
    const preferredDimensions = PRODUCT_DIMS
      .map(dim => ({ ...dim, value: Number(state.demand[dim.key]) || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(dim => `${dim.label} ${dim.value.toFixed(1)}/5`)
      .join('、');

    return [
      {
        title: '我先听见你。', status: '正在理解此刻的你',
        body: skipped
          ? `你今天选择少说一点，没关系。我先沿用「${escapeHtml(p.nickname)}」的空间偏好开始。`
          : `我从你的话里理解到：<b>${understood.map(escapeHtml).join('、')}</b>。`,
        meta: `<span>人格基线</span><span>即时状态</span><span>硬约束</span>`,
      },
      {
        title: '然后去空间里找。', status: '正在老门东空间库中检索',
        body: `这次要解决的需求是：<b>${understood.map(escapeHtml).join('、')}</b>。我把它落到可比较的客观指标上，当前偏好最高的是 <b>${escapeHtml(preferredDimensions)}</b>；再结合节点的安全、热度、品质、审美、探索、松弛、地方感和互动感，在老门东实测节点里筛选。`,
        meta: `<span>八大维度</span><span>实测节点</span><span>餐饮密度</span><span>路线连续性</span>`,
      },
      {
        title: '候选出现后，我又比较了一遍。', status: '正在比较候选空间',
        body: `这些指标不是抽象标签：它们分别对应现场的开敞程度、拥挤热度、环境维护、视觉审美、可探索性、停留舒适度、历史文化丰富度与互动支持。我会同时看指标匹配、点位距离和餐饮密度，尽量用连续道路串起来。`,
        meta: `<span>空间画像</span><span>当前情境</span><span>舒适热度</span><span>餐饮密度</span>`,
      },
      {
        title: '还不能急着给你。', status: '正在核对天气、营业与步行条件',
        body: `路线生成前，会先核验天气、营业状态和真实步行路径，并把现场条件一并纳入判断。`,
        meta: `<span>天气</span><span>营业状态</span><span>步行路径</span>`,
      },
      {
        title: '路线也会为你留一点余地。', status: '正在预留途中调整能力',
        body: `如果你在路上说“人太多”，Agent 会重新理解约束、降低热闹空间权重，再次检索，并从你当时所在的位置重新规划。`,
        meta: `<span>感知变化</span><span>重新检索</span><span>重新规划</span>`,
      },
      {
        title: '这些感受，我会记住。', status: '正在连接你的漫游记忆',
        body: archive.profiles.length || archive.journeys.length
          ? `我会参考已经收好的 ${archive.profiles.length} 次测试与 ${archive.journeys.length} 段漫游，让这一次推荐延续你过去的选择，也尊重今天的变化。`
          : `这是我们的第一次相遇。你喜欢的站点和现场反馈会被收进漫游记忆，下一次，我会比今天更懂你一点。`,
        meta: `<span>测试结果</span><span>喜欢与反馈</span><span>跨次推荐</span>`,
      },
    ];
  }

  /* ============================================================
     ⑥ 路线结果：左图右文 + 开始出发
     ============================================================ */
  const TAG_SCENE = {
    '牌坊门洞': 'light_shadow', '城墙脚下': 'brick_neat', '古亭廊下': 'cafe_courtyard',
    '美术馆前': 'wall_graffiti', '幽深窄巷': 'dark_calm', '石铺广场': 'light_bright',
    '游园广场': 'check_casual', '街巷': 'alley_quiet',
  };
  function nodeScene(n) {
    if (n.tag && TAG_SCENE[n.tag]) return TAG_SCENE[n.tag];
    if (n.heat > 0.6) return 'street_busy';
    return 'alley_quiet';
  }

  function computeRoute() {
    const r = state.mood.parse;
    return genRoute(state.demand, state.challenge, state.persona.base8D,
      r && r.constraints.duration);
  }

  function renderRoute() {
    state.route = state.sharedRoute || routeFromBackendPlan(state.backendPlan) || computeRoute();
    state.routeGeometryWarning = '';
    const { stops, km, mins } = state.route;
    const name = state.persona.nickname;
    $('route-title').textContent = `「${name}」的今日 Soulwalking 路线`;
    $('route-meta').innerHTML =
      `北门出发 · <b>${stops.length}</b> 站 · 约 <b>${km}</b> 公里 · 漫游约 <b>${mins}</b> 分钟${state.route.walkMins ? `（步行轨迹 ${state.route.walkMins} 分钟）` : ''} · ${state.challenge ? '挑战模式' : '标准模式'}${state.route.backend ? ' · 后端实测推荐' : ' · 本地演示推荐'}`;

    const guide = state.backendPlan && (state.backendPlan.route_intro || state.backendPlan.answer);
    const guideBox = $('route-guide');
    if (guide) {
      $('route-guide-text').textContent = guide;
      guideBox.hidden = false;
    } else {
      guideBox.hidden = true;
    }

    const badge = $('route-badge');
    if (state.challenge) {
      badge.hidden = false;
      badge.textContent = '🜂 轻越界路线：我保留了你的安全感，也放进一个平时不常选择、但值得轻轻试试的空间。不是原来的选择不好，只是城市也许还有另一面想与你见面。';
    } else badge.hidden = true;

    $('route-gentle').textContent = state.challenge
      ? '慢慢来，不需要一下走出很远。愿意多看一个转角，就已经是在认识城市的另一种可能。'
      : '不是其他空间不好，只是此刻的你，或许更适合被这些地方轻轻接住。';

    drawMap(stops);

    const why = n => {
      const diffs = DIMS.map(d => ({ d, v: Math.abs(state.demand[d.key] - n.profile[d.key]) }))
        .sort((a, b) => a.v - b.v).slice(0, 2);
      return '为什么是这里：契合你此刻的「' + diffs.map(x => productDimLabel(x.d.key)).join(' · ') + '」';
    };
    const stopImage = node => node.backendImageUrl
      ? `<img src="${escapeHtml(node.backendImageUrl)}" alt="${escapeHtml(node.backendImageAlt || node.name)}" loading="lazy">`
      : sceneSVG(nodeScene(node));
    const personalizedNotes = state.backendPlan?.personalized_stop_notes || {};
    const renderSpaceFeatures = features => {
      if (!features || !SPACE_FEATURES.every(([key]) => Number.isFinite(Number(features[key])))) {
        return '<section class="space-features is-unavailable"><b>空间特征属性</b><span>当前节点暂未返回完整的 13 项实测指标</span></section>';
      }
      const items = SPACE_FEATURES.map(([key, label, format]) => {
        const value = Number(features[key]);
        const display = format === 'percent' ? `${(value * 100).toFixed(1)}%` : value.toFixed(2);
        return `<div class="space-feature"><span>${label}</span><b>${display}</b></div>`;
      }).join('');
      return `<details class="space-features" open><summary>空间特征属性 <span>13 项实测指标</span></summary><div class="space-feature-grid">${items}</div></details>`;
    };

    $('route-stops').innerHTML = stops.map((x, i) => `
      <div class="stop-card">
        <div class="stop-img">${stopImage(x.n)}<div class="stop-no">${i + 1}</div></div>
        <div class="stop-body">
          <div class="stop-head">
            <span class="stop-name">${x.n.name}</span>
            <span class="stop-type">${x.n.type}</span>
            <span class="stop-type" style="border-color:rgba(255,184,107,.4);color:var(--amber)">${Math.round(x.s * 100)}% 契合</span>
          </div>
          ${personalizedNotes[x.n.backendSpaceId] ? `<p class="stop-personal"><b>懂你的这一站</b>${escapeHtml(personalizedNotes[x.n.backendSpaceId])}</p>` : ''}
          ${renderSpaceFeatures(x.n.features)}
          <div class="stop-why">${why(x.n)}</div>
          <div class="stop-tags">${x.n.tags.map(t => `<span>${t}</span>`).join('')}</div>
        </div>
      </div>`).join('');


    renderPrintMap(stops, km, mins); document.querySelector('#print-map-card')?.classList.add('is-visible');
    $('btn-challenge').classList.toggle('btn-challenge-on', state.challenge);
    $('btn-challenge').innerHTML = `<span class="button-icon ui-challenge" aria-hidden="true"></span>${state.challenge
      ? '舒适模式｜回到熟悉城市节奏'
      : '挑战模式｜看看另一种城市吧'}`;
  }


  function renderPrintMap(stops, km, mins) {
    const safeStops = stops || [];
    const personaName = state.persona && state.persona.nickname || '我的';
    const title = `「${personaName}」的老门东打卡地图`;
    const meta = `${safeStops.length} 个点位 · 全程约 ${km || "?"} 公里 · 漫游约 ${mins || "?"} 分钟 · 坐标：老门东北门出发`;
    const titleEl = $('#print-route-title');
    const metaEl = $('#print-route-meta');
    const stopGridEl = $('#print-stop-grid');
    const shareEl = $('#share-print-card');
    const printCardEl = $('#print-map-card');
    const mapEl = $('#print-route-map');
    const introEl = $('#print-route-intro');
    if (!titleEl || !metaEl || !stopGridEl || !printCardEl) return;

    titleEl.textContent = title;
    metaEl.textContent = meta;
    stopGridEl.innerHTML = safeStops.map((x, i) => {
      const node = x.n;
      const image = node.backendImageUrl
        ? `<img src="${escapeHtml(node.backendImageUrl)}" alt="${escapeHtml(node.name)} 实拍图" loading="lazy">`
        : sceneSVG(nodeScene(node));
      return `
        <div class="print-stop">
          <div class="ps-photo">${image}<span>${i + 1}</span></div>
          <div class="ps-body">
            <strong>${escapeHtml(node.name)}</strong>
            <p>${escapeHtml(node.desc || "暂无点位介绍。")} ${node.tags && node.tags.length ? `推荐关键词：${escapeHtml(node.tags.join(' · '))}` : ''}</p>
            <div class="ps-box"><span>到访日期 / 签名 / 印章</span></div>
          </div>
        </div>`;
    }).join('');
    if (mapEl) {
      const route = state.route && state.route.stops && state.route.stops.length
        ? state.route : { stops: safeStops };
      mapEl.innerHTML = `<img class="route-static-map" src="${routeStaticMapUrl(route)}" alt="老门东真实地图与步行路线" loading="eager">`;
    }
    if (introEl) {
      const guide = state.backendPlan && (state.backendPlan.route_intro || state.backendPlan.answer);
      introEl.innerHTML = `<b>这段路线想带你看见：</b>${escapeHtml(guide || `从老门东北门出发，依次走过 ${safeStops.map(stop => shortNodeName(stop.n)).join('、')}。可以按自己的节奏停留、记录和折返。`)}`;
    }
    if (shareEl) {
      shareEl.replaceChildren(printCardEl.cloneNode(true));
      const sharedCard = shareEl.querySelector('.print-map-card');
      if (sharedCard) sharedCard.classList.add('is-visible');
    }
  }

  function printRouteMapSvg(stops) {
    if (!stops.length) return '';
    const nodes = stops.map(stop => stop.n);
    const width = 800, height = 280, pad = 48;
    const xs = nodes.map(node => Number(node.x)).filter(Number.isFinite);
    const ys = nodes.map(node => Number(node.y)).filter(Number.isFinite);
    const minX = xs.length ? Math.min(...xs, 60) : 0, maxX = xs.length ? Math.max(...xs, 600) : 600;
    const minY = ys.length ? Math.min(...ys, 40) : 0, maxY = ys.length ? Math.max(...ys, 260) : 300;
    const project = (node, index) => ({
      x: xs.length ? pad + ((Number(node.x) - minX) / Math.max(maxX - minX, 1)) * (width - pad * 2) : pad + index * (width - pad * 2) / Math.max(nodes.length - 1, 1),
      y: ys.length ? pad + ((Number(node.y) - minY) / Math.max(maxY - minY, 1)) * (height - pad * 2) : height / 2,
    });
    const points = nodes.map(project);
    const line = points.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const grid = Array.from({ length: 6 }, (_, i) => `<path d="M0 ${35 + i * 42}H${width}" stroke="#e4dbd1"/>`).join('');
    const marks = points.map((point, index) => `<g><circle cx="${point.x}" cy="${point.y}" r="15" fill="#fffdf8" stroke="#e85a50" stroke-width="3"/><text x="${point.x}" y="${point.y + 5}" text-anchor="middle" font-size="13" font-weight="700" fill="#33291f">${index + 1}</text><text x="${point.x}" y="${point.y + 33}" text-anchor="middle" font-size="11" fill="#6b5e54">${escapeHtml(shortNodeName(nodes[index])).slice(0, 11)}</text></g>`).join('');
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="从老门东北门出发的 ${nodes.length} 站路线示意图"><rect width="${width}" height="${height}" fill="#f5f0eb"/>${grid}<path d="M${pad} ${height - pad} L${points[0].x} ${points[0].y}" fill="none" stroke="#2db5a6" stroke-width="3" stroke-dasharray="6 6"/><polyline points="${line}" fill="none" stroke="#e85a50" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${pad}" cy="${height - pad}" r="7" fill="#2db5a6"/><text x="${pad}" y="${height - 17}" text-anchor="middle" font-size="11" fill="#4f665f">北门出发</text>${marks}</svg>`;
  }
  async function ensureMapConfig() {
    if (state.mapConfig !== null) return state.mapConfig && state.mapConfig.enabled;
    try {
      state.mapConfig = await api('/api/v1/map/config');
      return !!(state.mapConfig && state.mapConfig.enabled);
    } catch (error) {
      console.warn('地图配置读取失败：', error);
      state.mapConfig = false;
      return false;
    }
  }

  async function ensureAMap() {
    if (window.AMap) return true;
    if (!await ensureMapConfig()) return false;
    window._AMapSecurityConfig = { serviceHost: state.mapConfig.service_host };
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(state.mapConfig.key)}`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return !!window.AMap;
  }

  let fieldworkTrackPromise = null;
  function loadFieldworkTrackPoints() {
    if (!fieldworkTrackPromise) {
      fieldworkTrackPromise = api('/api/v1/fieldwork/track').then(payload => {
        const coordinates = payload && payload.track && payload.track.features
          && payload.track.features[0] && payload.track.features[0].geometry
          && payload.track.features[0].geometry.coordinates;
        return Array.isArray(coordinates)
          ? coordinates.map(pair => ({ longitude: Number(pair[0]), latitude: Number(pair[1]) }))
            .filter(point => Number.isFinite(point.longitude) && Number.isFinite(point.latitude))
          : [];
      }).catch(() => {
        fieldworkTrackPromise = null;
        return [];
      });
    }
    return fieldworkTrackPromise;
  }

  let fieldworkGraphCache = null;
  const localMeters = (left, right) => {
    const latitude = (left.latitude + right.latitude) / 2 * Math.PI / 180;
    const dx = (left.longitude - right.longitude) * 111320 * Math.cos(latitude);
    const dy = (left.latitude - right.latitude) * 110540;
    return Math.hypot(dx, dy);
  };

  function buildFieldworkGraph(track) {
    if (fieldworkGraphCache && fieldworkGraphCache.track === track) return fieldworkGraphCache.graph;
    const graph = track.map(() => []);
    const connect = (left, right, distance) => {
      graph[left].push({ index: right, distance });
      graph[right].push({ index: left, distance });
    };
    for (let index = 0; index < track.length - 1; index++) {
      connect(index, index + 1, localMeters(track[index], track[index + 1]));
    }
    // The field survey revisited junctions at different moments. Merge points
    // within six metres so routing can turn at those junctions instead of
    // following the full chronological survey loop.
    for (let left = 0; left < track.length; left++) {
      for (let right = left + 2; right < track.length; right++) {
        const distance = localMeters(track[left], track[right]);
        if (distance <= 6) connect(left, right, distance);
      }
    }
    fieldworkGraphCache = { track, graph };
    return graph;
  }

  function surveyedPathThrough(points, track) {
    if (points.length < 2 || track.length < 2) return [];
    const graph = buildFieldworkGraph(track);
    const nearestIndex = point => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      track.forEach((candidate, index) => {
        const distance = localMeters(candidate, point);
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });
      return bestIndex;
    };
    const shortestIndices = (start, finish) => {
      const distances = Array(track.length).fill(Infinity);
      const previous = Array(track.length).fill(-1);
      const visited = Array(track.length).fill(false);
      distances[start] = 0;
      for (let count = 0; count < track.length; count++) {
        let current = -1;
        for (let index = 0; index < track.length; index++) {
          if (!visited[index] && (current < 0 || distances[index] < distances[current])) current = index;
        }
        if (current < 0 || !Number.isFinite(distances[current])) break;
        if (current === finish) break;
        visited[current] = true;
        graph[current].forEach(edge => {
          const candidate = distances[current] + edge.distance;
          if (candidate < distances[edge.index]) {
            distances[edge.index] = candidate;
            previous[edge.index] = current;
          }
        });
      }
      const indices = [];
      for (let current = finish; current >= 0; current = previous[current]) {
        indices.push(current);
        if (current === start) break;
      }
      return indices[indices.length - 1] === start ? indices.reverse() : [];
    };
    const append = (path, point) => {
      const previous = path[path.length - 1];
      if (!previous || previous.longitude !== point.longitude || previous.latitude !== point.latitude) path.push(point);
    };
    const path = [];
    for (let index = 0; index < points.length - 1; index++) {
      append(path, points[index]);
      shortestIndices(nearestIndex(points[index]), nearestIndex(points[index + 1]))
        .forEach(trackIndex => append(path, track[trackIndex]));
      append(path, points[index + 1]);
    }
    return path;
  }

  function routeSegmentsForDisplay(route, stopPoints) {
    const backendSegments = route && route.plan && route.plan.route && route.plan.route.segments;
    if (Array.isArray(backendSegments) && backendSegments.length) {
      return backendSegments.map((segment, index) => ({
        index,
        origin: normalizedCoordinate(segment.origin),
        destination: normalizedCoordinate(segment.destination),
        pathCoordinates: (segment.path_coordinates || []).map(normalizedCoordinate).filter(Boolean),
      }));
    }
    const points = [NORTH_GATE, ...stopPoints];
    return points.slice(0, -1).map((origin, index) => ({
      index,
      origin,
      destination: points[index + 1],
      pathCoordinates: [],
    }));
  }

  function routeSegmentLabel(index) {
    return index === 0 ? '起点→1' : `${index}→${index + 1}`;
  }

  function drawSegmentedWalkingRoute(map, segments, addPolyline, onComplete) {
    const missing = [];
    segments.forEach(segment => {
      if (segment.pathCoordinates.length >= 2) {
        addPolyline(segment.pathCoordinates);
      } else if (segment.origin && segment.destination) {
        missing.push(segment);
      }
    });
    if (!missing.length) {
      onComplete({ missingCount: 0, failedIndexes: [] });
      return;
    }

    const failAll = () => onComplete({
      missingCount: missing.length,
      failedIndexes: missing.map(segment => segment.index),
    });
    if (!window.AMap || typeof window.AMap.plugin !== 'function') {
      failAll();
      return;
    }

    window.AMap.plugin('AMap.Walking', () => {
      if (!window.AMap.Walking) {
        failAll();
        return;
      }
      let pending = missing.length;
      const failedIndexes = [];
      const completeOne = () => {
        pending -= 1;
        if (pending === 0) {
          onComplete({ missingCount: missing.length, failedIndexes });
        }
      };
      missing.forEach(segment => {
        try {
          const walking = new window.AMap.Walking({
            map,
            hideMarkers: true,
            isOutline: false,
            autoFitView: false,
          });
          walking.search(
            [segment.origin.longitude, segment.origin.latitude],
            [segment.destination.longitude, segment.destination.latitude],
            (status, result) => {
              if (status !== 'complete' || !result || !result.routes || !result.routes.length) {
                failedIndexes.push(segment.index);
              }
              completeOne();
            },
          );
        } catch (_) {
          failedIndexes.push(segment.index);
          completeOne();
        }
      });
    });
  }

  function drawRealMap(stops) {
    const route = state.route || {};
    const scopedStops = stops.filter(s => nodeInOldMendong(s.n));
    // The backend has already selected and ordered these recommendations.
    // Reuse that single order for cards, map markers, legends, and route legs.
    const stopPoints = scopedStops.map(s => s.n.mapCoordinate || s.n.coordinate).filter(Boolean);
    const routeSegments = routeSegmentsForDisplay(route, stopPoints);
    if (!route.backend || stopPoints.length < 1) return false;
    ensureAMap().then(ok => {
      if (!ok) {
        drawSketchMap(stops, false);
        return;
      }
      const target = $('route-map');
      target.innerHTML = '<div id="amap-route-canvas" class="amap-route-canvas"></div><div class="map-note" id="route-map-note"></div><div id="route-map-legend"></div>';
      const center = stopPoints[0] || NORTH_GATE;
      const map = new AMap.Map('amap-route-canvas', {
        zoom: 16,
        center: [center.longitude, center.latitude],
        viewMode: '2D',
        scrollWheel: false,
        touchZoom: false,
        dragEnable: false,
      });
      state.map = map;
      const layers = [];
      const startMarker = new AMap.Marker({
        position: [NORTH_GATE.longitude, NORTH_GATE.latitude],
        title: NORTH_GATE.name,
          label: { content: '起点', direction: 'top' },
      });
      map.add(startMarker);
      layers.push(startMarker);
      scopedStops.forEach((s, index) => {
        const point = stopPoints[index];
        if (!point) return;
        const marker = new AMap.Marker({
          position: [point.longitude, point.latitude],
          title: s.n.name,
          label: { content: `${index + 1}`, direction: 'top' },
        });
        map.add(marker);
        layers.push(marker);
      });
      const note = $('route-map-note');
      renderMapLegend($('route-map-legend'), scopedStops);
      const addPolyline = (points, dashed = false) => {
        if (!points || points.length < 2) return;
        const polyline = new AMap.Polyline({
          path: points.map(point => [point.longitude, point.latitude]),
          strokeColor: state.challenge ? '#d49030' : '#e85a50',
          strokeWeight: 6,
          strokeOpacity: 0.9,
          strokeStyle: dashed || state.challenge ? 'dashed' : 'solid',
          lineJoin: 'round',
          lineCap: 'round',
        });
        map.add(polyline);
        layers.push(polyline);
      };
      drawSegmentedWalkingRoute(map, routeSegments, addPolyline, ({ missingCount, failedIndexes }) => {
        const unavailable = failedIndexes.map(routeSegmentLabel);
        state.routeGeometryWarning = unavailable.length
          ? `${unavailable.join('、')} 段道路轨迹暂不可用`
          : '';
        if (note) {
          note.textContent = unavailable.length
            ? `老门东北门出发 · ${state.routeGeometryWarning}，仅显示其余真实道路轨迹 · 坐标系统 GCJ-02`
            : missingCount
              ? `老门东北门出发 · 已用高德步行服务补齐 ${missingCount} 段道路轨迹 · 坐标系统 GCJ-02`
              : '老门东北门出发 · 真实步行轨迹 · 坐标系统 GCJ-02';
        }
        if (layers.length) map.setFitView(layers, false, [40, 40, 40, 40]);
      });
    }).catch(error => {
      console.warn('真实地图渲染失败：', error);
      drawSketchMap(stops, false);
    });
    return true;
  }

  function drawMap(stops) {
    if (STATIC_DEMO && window.L && drawLeafletMap(stops)) return;
    if (drawRealMap(stops)) return;
    drawSketchMap(stops);
  }

  // Pages 版不使用高德 Key，路线页以 OSM 底图提供可拖动、可缩放的展示地图。
  // 点位与路线仍完全来自原版 data.js 中的老门东本地空间库。
  function drawLeafletMap(stops) {
    // 交付版前端的公开节点数据以 x/y 叙事地图坐标为主；这里将其稳定映射到
    // 老门东范围内，保证静态展示也能在可操作的真实底图上呈现正确的先后关系。
    const toMapPoint = node => {
      const source = node && (node.mapCoordinate || node.coordinate);
      if (source && Number.isFinite(Number(source.latitude)) && Number.isFinite(Number(source.longitude))) return source;
      if (!node || !Number.isFinite(Number(node.x)) || !Number.isFinite(Number(node.y))) return null;
      return {
        longitude: OLD_MENDONG_BBOX.minLng + Number(node.x) / 600 * (OLD_MENDONG_BBOX.maxLng - OLD_MENDONG_BBOX.minLng),
        latitude: OLD_MENDONG_BBOX.maxLat - Number(node.y) / 340 * (OLD_MENDONG_BBOX.maxLat - OLD_MENDONG_BBOX.minLat),
      };
    };
    const points = stops.map(item => toMapPoint(item.n)).filter(Boolean);
    if (!points.length) return false;
    const target = $('route-map');
    if (!target) return false;
    if (state.pagesMap) { state.pagesMap.remove(); state.pagesMap = null; }
    target.innerHTML = '<div id="leaflet-route-canvas" class="leaflet-route-canvas" aria-label="可拖动的老门东路线地图"></div><div class="map-note">可拖动、缩放地图 · 预设路线展示，非实时导航</div><div id="route-map-legend"></div>';
    const map = window.L.map('leaflet-route-canvas', { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    state.pagesMap = map;
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const latLngs = points.map(point => [Number(point.latitude), Number(point.longitude)]);
    const start = [NORTH_GATE.latitude, NORTH_GATE.longitude];
    window.L.circleMarker(start, { radius: 7, color: '#2db5a6', weight: 2, fillColor: '#fffdf8', fillOpacity: 1 })
      .addTo(map).bindTooltip('北门出发', { direction: 'top' });
    window.L.polyline([start, ...latLngs], {
      color: state.challenge ? '#d49030' : '#e85a50', weight: 5, opacity: .9,
      dashArray: state.challenge ? '8 8' : null, lineJoin: 'round', lineCap: 'round',
    }).addTo(map);
    points.forEach((point, index) => {
      const marker = window.L.marker([Number(point.latitude), Number(point.longitude)], {
        icon: window.L.divIcon({ className: 'route-leaflet-marker', html: `<b>${index + 1}</b>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
      }).addTo(map);
      marker.bindPopup(`<b>${escapeHtml(shortNodeName(stops[index].n))}</b><br><span>第 ${index + 1} 站 · ${Math.round(stops[index].s * 100)}% 契合</span>`);
    });
    renderMapLegend($('route-map-legend'), stops);
    map.fitBounds(window.L.latLngBounds([start, ...latLngs]), { padding: [30, 30], maxZoom: 16 });
    setTimeout(() => map.invalidateSize(), 0);
    return true;
  }

  function drawSketchMap(stops, showConnections = true) {
    const nodes = stops.map(x => x.n);
    const marks = nodes.map((n, i) => `
      <circle cx="${n.x}" cy="${n.y + 24}" r="13" fill="#ffffff" stroke="${state.challenge ? '#d49030' : '#e85a50'}" stroke-width="2.5"/>
      <text x="${n.x}" y="${n.y + 28.5}" text-anchor="middle" font-size="12" font-weight="700" fill="#2a2420">${i + 1}</text>
      <text x="${n.x}" y="${n.y + 52}" text-anchor="middle" font-size="10.5" fill="#6b5e54">${n.name.replace('老门东·', '')}</text>`).join('');
    const start = `<circle cx="60" cy="240" r="6" fill="#2db5a6"/><text x="60" y="262" text-anchor="middle" font-size="10.5" fill="#6b5e54">老门东北门</text>`;
    const pathD = showConnections
      ? `M60 240 L${nodes[0].x} ${nodes[0].y + 24} ` +
        nodes.slice(1).map(n => `L${n.x} ${n.y + 24}`).join(' ')
      : '';
    let grid = '';
    for (let i = 0; i < 6; i++) grid += `<path d="M0 ${40 + i * 50} H600" stroke="#ddd4cb" stroke-width="1.5"/>`;
    for (let i = 0; i < 9; i++) grid += `<path d="M${40 + i * 65} 0 V340" stroke="#ddd4cb" stroke-width="1.5"/>`;
    $('route-map').innerHTML = `
      <svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg">
        <rect width="600" height="340" fill="#f5f0eb"/>
        ${grid}
        ${showConnections ? `<path d="${pathD}" fill="none" stroke="${state.challenge ? '#d49030' : '#e85a50'}" stroke-width="3" stroke-dasharray="${state.challenge ? '8 6' : 'none'}" stroke-linecap="round" opacity=".85"/>` : ''}
        ${start}${marks}
      </svg>`;
  }

  $('btn-challenge').addEventListener('click', async () => {
    state.challenge = !state.challenge;
    toast(state.challenge ? '挑战模式：正在让后端重新规划' : '正在换回舒适路线');
    state.backendPlan = await requestBackendPlan();
    renderRoute();
    toast(state.challenge ? '挑战模式：跳出你的舒适区' : '已换回舒适路线');
  });
  /* ============================================================
     ⑦ 出发漫游：打卡盖章 + 临时反馈重规划
     ============================================================ */
  const WALK_CHIPS = [
    '人太多了，帮我换条安静的路线',
    '有点累，想找个地方坐坐',
    '想吃点东西',
    '想去喝点东西',
    '还想再走一会儿',
    '我想回去了',
    '鞋不太舒服，想少走一点',
    '就按原路线继续走',
  ];

  $('btn-depart').addEventListener('click', () => {
    if (!state.route || !state.route.stops || !state.route.stops.length) {
      toast('还没生成路线，先去聊几句吧');
      go('route');
      return;
    }
    state.walk = {
      idx: 0, visitedIds: [], stamps: [], likes: [], dislikes: [], photos: [], notes: [],
      visitEvents: [], memoryEvents: [],
      heatScale: 1, replanned: false, lastFeedback: '', routeChanges: [],
      initialRoute: state.route.stops.map(s => s.n.name.replace('老门东·', '')),
    };
    state.route.stops = state.route.stops.map(s => ({ ...s, source: 'initial' }));
    $('walk-explain-panel').hidden = true;
    $('btn-walk-explain').textContent = '解释这次漫游 ✦';
    $('walk-title').textContent = `出发漫游 · 「${state.persona.nickname}」`;
    const departureNote = $('departure-note');
    if (departureNote) {
      departureNote.querySelector('p').textContent = '结合目前可用的定位与道路信息，我判断老门东北门是更近、也更方便衔接步行路线的入口。这次，我们先从北门开始；如果定位权限尚未开启，也不影响手动出发。';
    }
    $('walk-chips').innerHTML = WALK_CHIPS.map(c => `<button class="chip">${c}</button>`).join('');
    document.querySelectorAll('#walk-chips .chip').forEach(b =>
      b.addEventListener('click', () => handleWalkFeedback(b.textContent)));
    renderWalk();
    go('walk');
    toast('出发！到了推荐的点位，记得点「我到了」盖章 ♥');
  });

  function nodeNumber(node) {
    const m = String(node && node.id || '').match(/\d+/);
    return m ? String(Number(m[0])) : '起';
  }

  function renderWalkRouteStory(stops, w) {
    const labelOf = source => ({
      initial: '初始',
      inserted: '插入',
      added: '加走',
      exit: '返程',
      quiet: '改线',
      short: '缩短',
    })[source] || '路线';
    const line = stops.map((s, i) => {
      const status = w.visitedIds.includes(s.n.id) ? 'done' : (i === w.idx ? 'current' : '');
      return `<span class="co-node ${status} source-${s.source || 'initial'}">
        <b>${nodeNumber(s.n)}</b><em>${labelOf(s.source || 'initial')}</em>
      </span>`;
    }).join('<i>→</i>');
    const initial = (w.initialRoute || []).length
      ? w.initialRoute.map(escapeHtml).join(' → ')
      : '正在生成';
    const changes = (w.routeChanges || []).slice(-3).map(item =>
      `<li><b>${escapeHtml(item.type)}</b><span>${escapeHtml(item.text)}</span></li>`).join('');
    $('walk-route-story').innerHTML = `
      <div class="co-head">
        <div><span>LIVE SOULWALKING</span><h3>这条路线正在和你一起完成</h3></div>
        <small>${(w.routeChanges || []).length ? `已响应 ${(w.routeChanges || []).length} 次变化` : '初始路线'}</small>
      </div>
      <div class="co-route-line">${line}</div>
      <p>最初：${initial}</p>
      ${changes ? `<ul class="co-change-log">${changes}</ul>` : ''}`;
  }

  function renderWalk() {
    const w = state.walk;
    /* 防御：如果路线丢了，回到首页重来 */
    if (!state.route || !Array.isArray(state.route.stops) || !state.route.stops.length) {
      toast('路线还没准备好，回到首页再来一次吧');
      go('cover');
      return;
    }
    const stops = state.route.stops;

    // 进度条
    $('walk-progress').innerHTML = stops.map((s, i) => {
      const cls = [
        w.visitedIds.includes(s.n.id) ? 'done' : (i === w.idx ? 'current' : ''),
        s.source ? `source-${s.source}` : '',
      ].filter(Boolean).join(' ');
      return (i ? '<span class="wp-arrow">›</span>' : '') +
        `<span class="wp-dot ${cls}">${w.visitedIds.includes(s.n.id) ? '✓' : nodeNumber(s.n)}</span>`;
    }).join('');
    renderWalkRouteStory(stops, w);

    // 当前站
    const cur = stops[w.idx];
    const doneN = w.visitedIds.length;
    if (cur) {
      $('walk-current').innerHTML = `
        <div class="wc-label">${w.replanned ? '已重新规划 · ' : ''}第 ${w.idx + 1} / ${stops.length} 站</div>
        <div class="wc-name"><span class="inline-icon ui-pin" aria-hidden="true"></span>${cur.n.name}</div>
        <p class="wc-desc">${cur.n.desc}${cur.s ? ' · 契合度 ' + Math.round(cur.s * 100) + '%' : ''}</p>`;
      $('btn-arrive').hidden = false;
      $('btn-next-stop').hidden = true;
      /* 还在进行中：保留"路上有变化"重新规划入口 */
      $('walk-feedback').hidden = false;
    } else {
      $('walk-current').innerHTML = `
        <div class="wc-label">原路线已走到尽头</div>
        <div class="wc-name">今天的 Soulwalking 路线，已经和你一起走到这里</div>
        <p class="wc-desc">你可以结束漫游，也可以告诉我“还想再走一会儿”或“我想回去了”，我会继续帮你把路线接下去或温柔收束。</p>`;
      $('btn-arrive').hidden = true;
      $('btn-next-stop').hidden = true;
      $('walk-feedback').hidden = false;
    }

    // 印章栏
    $('walk-stamps').innerHTML = w.stamps.length
      ? w.stamps.map(s => `<span class="ws-chip"><b>◈</b>${s.name.replace('老门东·', '')}</span>`).join('')
      : `<span class="ws-chip" style="opacity:.55">还没有印章——到站后点「我到了」</span>`;

    $('btn-end-walk').textContent = `结束漫游 · 看看今天的收获${doneN ? `（已走 ${doneN} 站）` : ''}`;
    drawWalkMap(stops, w);
  }

  function distanceMeters(a, b) {
    if (!a || !b) return null;
    const r = 6371000;
    const rad = Math.PI / 180;
    const dLat = (b.latitude - a.latitude) * rad;
    const dLng = (b.longitude - a.longitude) * rad;
    const lat1 = a.latitude * rad;
    const lat2 = b.latitude * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * r * Math.asin(Math.sqrt(h)));
  }

  function updateWalkMapNote(currentStop) {
    const note = $('walk-map-note');
    if (!note) return;
    const geometryWarning = state.routeGeometryWarning
      ? ` · ${state.routeGeometryWarning}`
      : '';
    const currentPoint = currentStop && (currentStop.n.mapCoordinate || currentStop.n.coordinate);
    const distance = distanceMeters(state.userPosition, currentPoint);
    if (distance == null) {
      note.textContent = `老门东北门出发 · 正在等待手机定位授权；若浏览器拦截定位，仍可手动点“我到了这一站”。${geometryWarning}`;
      return;
    }
    note.textContent = `当前位置已更新 · 距当前站约 ${distance} 米${distance <= 80 ? ' · 已接近站点，可以打卡' : ''}${geometryWarning}`;
  }

  function startUserLocationWatch(currentStop) {
    if (state.walkWatchId || !navigator.geolocation) {
      if (state.userPosition && state.walkMap && window.AMap && !state.userMarker) {
        state.userMarker = new AMap.Marker({
          position: [state.userPosition.longitude, state.userPosition.latitude],
          title: '我的位置',
          label: { content: '我的位置', direction: 'top' },
        });
        state.walkMap.add(state.userMarker);
      }
      updateWalkMapNote(currentStop);
      return;
    }
    state.walkWatchId = navigator.geolocation.watchPosition(position => {
      state.userPosition = {
        longitude: position.coords.longitude,
        latitude: position.coords.latitude,
        name: '我的位置',
      };
      if (state.walkMap && window.AMap) {
        if (!state.userMarker) {
          state.userMarker = new AMap.Marker({
            position: [state.userPosition.longitude, state.userPosition.latitude],
            title: '我的位置',
            label: { content: '我的位置', direction: 'top' },
          });
          state.walkMap.add(state.userMarker);
        } else {
          state.userMarker.setPosition([state.userPosition.longitude, state.userPosition.latitude]);
        }
      }
      updateWalkMapNote(currentStop);
    }, error => {
      const note = $('walk-map-note');
      if (note) note.textContent = `定位未开启：${error.message || '手机浏览器未授权'}。仍可手动到站打卡。${state.routeGeometryWarning ? ` · ${state.routeGeometryWarning}` : ''}`;
    }, { enableHighAccuracy: true, maximumAge: 8000, timeout: 12000 });
  }

  function drawWalkMap(stops, w) {
    if (!state.route || !state.route.backend) {
      $('walk-map').innerHTML = '<div class="walk-map-note">当前是本地演示路线，生成后端路线后会显示真实地图。</div>';
      return;
    }
    const scopedStops = stops.filter(s => nodeInOldMendong(s.n));
    // Keep the same backend recommendation order used by the route page.
    const stopPoints = scopedStops.map(s => s.n.mapCoordinate || s.n.coordinate).filter(Boolean);
    const routeSegments = routeSegmentsForDisplay(state.route, stopPoints);
    const currentStop = stops[w.idx];
    if (stopPoints.length < 1) {
      $('walk-map').innerHTML = '<div class="walk-map-note">当前路线缺少坐标，仍可手动打卡。</div>';
      return;
    }
    ensureAMap().then(ok => {
      if (!ok) {
        $('walk-map').innerHTML = '<div class="walk-map-note">地图暂不可用，仍可手动打卡。</div>';
        return;
      }
      $('walk-map').innerHTML = '<div id="walk-map-canvas" class="walk-map-canvas"></div><div class="walk-map-note" id="walk-map-note"></div><div id="walk-map-legend"></div>';
      const center = currentStop && (currentStop.n.mapCoordinate || currentStop.n.coordinate) || NORTH_GATE;
      const map = new AMap.Map('walk-map-canvas', {
        zoom: 17,
        center: [center.longitude, center.latitude],
        viewMode: '2D',
        scrollWheel: false,
        touchZoom: true,
      });
      state.walkMap = map;
      state.userMarker = null;
      const layers = [];
      const startMarker = new AMap.Marker({
        position: [NORTH_GATE.longitude, NORTH_GATE.latitude],
        title: NORTH_GATE.name,
        label: { content: '起点', direction: 'top' },
      });
      map.add(startMarker);
      layers.push(startMarker);
      scopedStops.forEach((s, index) => {
        const point = stopPoints[index];
        if (!point) return;
        const marker = new AMap.Marker({
          position: [point.longitude, point.latitude],
          title: s.n.name,
          label: { content: `${index + 1}`, direction: 'top' },
        });
        map.add(marker);
        layers.push(marker);
      });
      renderMapLegend($('walk-map-legend'), scopedStops);
      const addPolyline = (points, dashed = false) => {
        if (!points || points.length < 2) return;
        const polyline = new AMap.Polyline({
          path: points.map(point => [point.longitude, point.latitude]),
          strokeColor: '#e85a50',
          strokeWeight: 6,
          strokeOpacity: 0.9,
          strokeStyle: dashed ? 'dashed' : 'solid',
          lineJoin: 'round',
          lineCap: 'round',
        });
        map.add(polyline);
        layers.push(polyline);
      };
      drawSegmentedWalkingRoute(map, routeSegments, addPolyline, ({ missingCount, failedIndexes }) => {
        const unavailable = failedIndexes.map(routeSegmentLabel);
        state.routeGeometryWarning = unavailable.length
          ? `${unavailable.join('、')} 段道路轨迹暂不可用`
          : '';
        const note = $('walk-map-note');
        if (note && unavailable.length) {
          note.textContent = `${state.routeGeometryWarning}，仅显示其余真实道路轨迹。`;
        } else if (note && missingCount) {
          note.textContent = `已用高德步行服务补齐 ${missingCount} 段道路轨迹。`;
        }
        if (layers.length) map.setFitView(layers, false, [44, 34, 44, 34]);
      });
      startUserLocationWatch(currentStop);
      updateWalkMapNote(currentStop);
    }).catch(error => {
      console.warn('打卡地图渲染失败：', error);
      $('walk-map').innerHTML = '<div class="walk-map-note">地图加载失败，仍可手动打卡。</div>';
    });
  }

  // 到站盖章
  function updateStampActionUI(nodeId) {
    const w = state.walk;
    document.querySelectorAll('.stamp-mini[data-stamp-act]').forEach(button => {
      const act = button.dataset.stampAct;
      const active = act === 'like' ? w.likes.includes(nodeId)
        : act === 'dislike' ? w.dislikes.includes(nodeId)
        : act === 'photo' ? w.photos.includes(nodeId)
        : act === 'comment' ? w.notes.some(x => x.id === nodeId) : false;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
      const label = button.querySelector('.sa-text');
      if (act === 'like') label.textContent = active ? '已点赞' : '点赞';
      if (act === 'dislike') label.textContent = active ? '已踩下' : '踩一下';
      if (act === 'comment') label.textContent = active ? '已评论' : '评论';
      if (act === 'photo') label.textContent = active ? '已收藏' : '拍照收藏';
    });
  }
  function showStampInlineNote(icon, message, tone = 'warm') {
    const box = $('stamp-inline-note');
    box.dataset.tone = tone;
    box.querySelector('span').textContent = icon;
    box.querySelector('p').textContent = message;
    box.hidden = false;
    box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
  }
  function recordWalkEvent(kind, node) {
    const w = state.walk;
    if (!w || !node) return;
    w.memoryEvents = (w.memoryEvents || []).filter(event => !(event.kind === kind && event.nodeId === node.id));
    w.memoryEvents.push({ kind, nodeId: node.id, name: canonicalScene(node.id, node.name).name, occurredAt: new Date().toISOString() });
  }
  function removeWalkEvent(kind, nodeId) {
    if (state.walk) state.walk.memoryEvents = (state.walk.memoryEvents || []).filter(event => !(event.kind === kind && event.nodeId === nodeId));
  }

  $('btn-arrive').addEventListener('click', () => {
    const w = state.walk;
    if (!state.route || !state.route.stops || !state.route.stops[w.idx]) return;
    const cur = state.route.stops[w.idx];
    if (!cur) return;
    $('stamp-pop-name').textContent = cur.n.name.replace('老门东·', '');
    $('stamp-modal').hidden = false;
    $('stamp-note-input').hidden = true;
    $('stamp-note-input').value = '';
    $('stamp-inline-note').hidden = true;
    updateStampActionUI(cur.n.id);
    // 重新触发盖章动画
    const pop = $('stamp-pop');
    pop.style.animation = 'none'; void pop.offsetWidth; pop.style.animation = '';
  });

  document.querySelectorAll('[data-stamp-act]').forEach(b =>
    b.addEventListener('click', () => {
      const act = b.dataset.stampAct;
      const w = state.walk;
      if (!state.route || !state.route.stops || !state.route.stops[w.idx]) {
        $('stamp-modal').hidden = true;
        return;
      }
      const cur = state.route.stops[w.idx];
      if (!cur) return;
      const name = cur.n.name.replace('老门东·', '');
      if (act === 'like') {
        if (w.likes.includes(cur.n.id)) {
          w.likes = w.likes.filter(id => id !== cur.n.id);
          removeWalkEvent('like', cur.n.id);
          showStampInlineNote('♡', `已为你取消对「${name}」的点赞，感受改变也没关系。`, 'quiet');
        } else {
          w.likes.push(cur.n.id);
          w.dislikes = w.dislikes.filter(id => id !== cur.n.id);
          recordWalkEvent('like', cur.n);
          showStampInlineNote('♥', `谢谢你喜欢「${name}」，我会记住这份心动。`, 'like');
        }
        updateStampActionUI(cur.n.id);
      } else if (act === 'dislike') {
        if (w.dislikes.includes(cur.n.id)) {
          w.dislikes = w.dislikes.filter(id => id !== cur.n.id);
          showStampInlineNote('♡', '已取消“踩一下”，我会继续听你此刻的感受。', 'quiet');
        } else {
          w.dislikes.push(cur.n.id);
          w.likes = w.likes.filter(id => id !== cur.n.id);
          showStampInlineNote('♡', '抱歉，我会记住，努力学习。', 'dislike');
        }
        updateStampActionUI(cur.n.id);
      } else if (act === 'photo') {
        if (w.photos.includes(cur.n.id)) {
          w.photos = w.photos.filter(id => id !== cur.n.id);
          removeWalkEvent('photo', cur.n.id);
          showStampInlineNote('▢', `已取消「${name}」的拍照收藏，需要时还可以再留下。`, 'quiet');
        } else {
          w.photos.push(cur.n.id);
          recordWalkEvent('photo', cur.n);
          showStampInlineNote('▣', `已经替你收藏好「${name}」，想慢慢回看也很好。`, 'photo');
        }
        updateStampActionUI(cur.n.id);
      } else if (act === 'comment') {
        const input = $('stamp-note-input');
        input.hidden = !input.hidden;
        if (!input.hidden) {
          showStampInlineNote('◌', '想说什么都可以，我会认真听。', 'comment');
          input.focus();
        }
        return;
      } else if (act === 'close') {
        closeModalAndAdvance();
        return;
      }
    }));

  $('stamp-note-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      const w = state.walk;
      if (!state.route || !state.route.stops || !state.route.stops[w.idx]) return;
      const cur = state.route.stops[w.idx];
      w.notes = w.notes.filter(x => x.id !== cur.n.id);
      w.notes.push({ id: cur.n.id, node: cur.n.name.replace('老门东·', ''), text: e.target.value.trim() });
      e.target.value = '';
      e.target.hidden = true;
      updateStampActionUI(cur.n.id);
      showStampInlineNote('●', '谢谢你告诉我，我已经把这句话认真收好了。', 'comment');
    }
  });

  function closeModalAndAdvance() {
    const w = state.walk;
    if (!state.route || !state.route.stops) {
      $('stamp-modal').hidden = true;
      go('cover');
      return;
    }
    const cur = state.route.stops[w.idx];
    if (cur) {
      if (!w.visitedIds.includes(cur.n.id)) w.visitedIds.push(cur.n.id);
      if (!w.stamps.some(s => s.id === cur.n.id)) w.stamps.push({ id: cur.n.id, name: cur.n.name });
      if (!(w.visitEvents || []).some(event => event.nodeId === cur.n.id)) {
        w.visitEvents.push({ nodeId: cur.n.id, name: canonicalScene(cur.n.id, cur.n.name).name, occurredAt: new Date().toISOString() });
      }
      w.idx++;
    }
    $('stamp-modal').hidden = true;
    renderWalk();
    if (w.idx >= state.route.stops.length) {
      toast('行程完成！点「结束漫游」看看收获 🎉');
    }
  }

  // 临时反馈：重规划
  function shortNodeName(node) {
    return (node && node.name ? node.name : '').replace('老门东·', '');
  }

  function routeScore(node) {
    return matchScore(node, state.demand, state.challenge, state.persona.base8D, state.walk && state.walk.heatScale);
  }

  function recalcRouteStats() {
    if (!state.route || !state.route.stops) return;
    const nodes = state.route.stops.map(s => s.n);
    const chain = [{ x: 60, y: 240 }, ...nodes];
    const km = chain.length > 1
      ? (chain.reduce((sum, n, i) => i ? sum + dist(chain[i - 1], n) : sum, 0) / 600 * 1.35).toFixed(1)
      : '0.5';
    state.route.km = km;
    state.route.mins = Math.round(nodes.length * 9 + parseFloat(km) * 12);
  }

  function walkAnchorNode() {
    const w = state.walk;
    const stops = state.route.stops;
    if (w.idx > 0 && stops[w.idx - 1]) return stops[w.idx - 1].n;
    return { id: 'start', name: '老门东牌坊', x: 60, y: 240, heat: 0, tags: [] };
  }

  function pushRouteChange(type, text) {
    const w = state.walk;
    w.routeChanges = w.routeChanges || [];
    w.routeChanges.push({ type, text, at: new Date().toISOString() });
  }

  function pickFeedbackNode(fromNode, scoreFn) {
    const w = state.walk;
    const excluded = new Set([...(w.visitedIds || []), fromNode.id, 'start']);
    return SPACE_NODES
      .filter(n => !excluded.has(n.id) && nodeInOldMendong(n))
      .map(n => ({ n, score: scoreFn(n) - dist(fromNode, n) / 820 }))
      .sort((a, b) => b.score - a.score)[0]?.n || null;
  }

  function showWalkDecision(title, bodyHtml) {
    const panel = $('walk-explain-panel');
    panel.innerHTML = `
      <div class="walk-explain-head"><span>SOULWALKING AGENT</span><h3>${escapeHtml(title)}</h3></div>
      <p class="walk-adjustment">${bodyHtml}</p>`;
    panel.hidden = false;
    $('btn-walk-explain').textContent = '收起漫游解释 ↑';
  }

  function insertDynamicStop(node, source, changeType, changeText, decision) {
    const w = state.walk;
    if (!node || !nodeInOldMendong(node)) {
      toast('临时需求只在老门东范围内重新规划');
      return false;
    }
    const stops = state.route.stops;
    const existingIndex = stops.findIndex(s => s.n.id === node.id);
    let stop;
    if (existingIndex >= 0) {
      stop = stops.splice(existingIndex, 1)[0];
      if (existingIndex < w.idx) w.idx = Math.max(0, w.idx - 1);
    } else {
      stop = { n: node, s: routeScore(node) };
    }
    stop.source = source;
    stops.splice(w.idx, 0, stop);
    state.route.pathCoordinates = [];
    state.route.geometryComplete = false;
    w.replanned = true;
    pushRouteChange(changeType, changeText);
    recalcRouteStats();
    renderWalk();
    if (decision) showWalkDecision('我把路线轻轻改了一下。', decision(node));
    return true;
  }

  function appendDynamicStops(count, source, changeType, changeText) {
    const w = state.walk;
    const stops = state.route.stops;
    const anchor = stops[stops.length - 1]?.n || walkAnchorNode();
    const exclude = stops.map(s => s.n.id).concat(w.visitedIds || []);
    const extra = genRoute(state.demand, state.challenge, state.persona.base8D, null, {
      startNode: anchor, exclude, stopsN: count, heatScale: w.heatScale,
    }).stops.filter(s => nodeInOldMendong(s.n)).map(s => ({ ...s, source }));
    if (!extra.length) return false;
    const oldLength = stops.length;
    state.route.stops = stops.concat(extra);
    state.route.pathCoordinates = [];
    state.route.geometryComplete = false;
    if (w.idx >= oldLength) w.idx = oldLength;
    w.replanned = true;
    pushRouteChange(changeType, changeText);
    recalcRouteStats();
    renderWalk();
    showWalkDecision('我为你把路线接长了一点。',
      `你说还想再走一会儿，我先保留已经走出来的部分，再从当前路线末端重新找两个不绕远、也还契合你的节点。接下来可以去 <b>「${escapeHtml(shortNodeName(extra[0].n))}」</b>${extra[1] ? `，之后再到 <b>「${escapeHtml(shortNodeName(extra[1].n))}」</b>` : ''}。如果中途又累了，我们随时收束。`);
    toast('已为你加走 ' + extra.length + ' 站：下一站「' + shortNodeName(extra[0].n) + '」');
    return true;
  }

  const EXIT_NODES = [
    { id: 'exit-east', name: '东出口', x: 940, y: 220, longitude: 118.789235, latitude: 32.010884 },
    { id: 'exit-east2', name: '东二门', x: 900, y: 250, longitude: 118.789317, latitude: 32.010652 },
    { id: 'exit-sanying', name: '三条营门', x: 180, y: 210, longitude: 118.785893, latitude: 32.012405 },
    { id: 'exit-north', name: '北门 / 老门东牌坊方向', x: 60, y: 240, longitude: NORTH_GATE.longitude, latitude: NORTH_GATE.latitude },
  ];

  function nearestExitPosition(node) {
    // Confirmed survey exits. Prefer real longitude/latitude when available;
    // fall back to sketch-map coordinates for local demo nodes.
    let best = EXIT_NODES[0];
    let bestDistance = Infinity;
    const hasGeo = Number.isFinite(node && node.longitude) && Number.isFinite(node && node.latitude);
    for (const exit of EXIT_NODES) {
      const d = hasGeo
        ? Math.hypot((node.longitude - exit.longitude) * 94000, (node.latitude - exit.latitude) * 111000)
        : dist(node, exit);
      if (d < bestDistance) { best = exit; bestDistance = d; }
    }
    return best;
  }

  function buildExitTail(fromNode, count) {
    const w = state.walk;
    // If browser position exists, anchor the exit search to it; otherwise use
    // the last actionable stop rather than a virtual static point.
    const observed = state.userPosition ? { id:'user', name:'我的位置', ...state.userPosition } : fromNode;
    const exitNode = nearestExitPosition(observed);
    const excluded = new Set([...(w.visitedIds || []), fromNode.id, 'start']);
    const tail = [];
    let cur = fromNode;
    for (let i = 0; i < count; i++) {
      const next = SPACE_NODES
        .filter(n => !excluded.has(n.id))
        .map(n => ({
          n,
          score: (dist(cur, exitNode) - dist(n, exitNode)) / 160 + Math.max(0, 1 - dist(cur, n) / 420) + n.profile.safety * .12 - n.heat * .18,
        }))
        .filter(x => x.score > -0.2)
        .sort((a, b) => b.score - a.score)[0]?.n;
      if (!next) break;
      tail.push({ n: next, s: routeScore(next), source: 'exit' });
      excluded.add(next.id);
      cur = next;
      if (dist(cur, exitNode) < 90) break;
    }
    return tail;
  }
  function walkStopFromPlace(place, kind) {
    const base = localNodeForBackend({ space_id: place.id, name: place.name }, 0);
    const point = normalizedCoordinate(place.map_coordinate || place.coordinate || place);
    return {
      n: {
        ...base,
        id: `${kind}-${place.id || place.name}`,
        name: kind === 'exit' ? (place.name || '老门东出口') : `餐饮 · ${place.name}`,
        type: kind === 'exit' ? '返程出口' : '餐饮补给点',
        desc: kind === 'exit' ? '已为你规划至最近出口。' : '已加入本次路线的餐饮补给点。',
        tags: kind === 'exit' ? ['返程', '出口'] : ['餐饮补给'],
        coordinate: point,
        mapCoordinate: point,
      },
      s: .8,
      source: kind,
    };
  }

  async function handleWalkFeedback(text) {
    text = (text || '').trim();
    if (!text || state.walkReplanRequest) return;
    const w = state.walk;
    if (!state.route || !state.route.stops || !state.route.stops.length) {
      go('cover');
      return;
    }
    const prefix = state.route.stops.slice(0, w.idx);
    const currentNode = prefix[prefix.length - 1]?.n;
    const currentPosition = currentNode && (currentNode.mapCoordinate || currentNode.coordinate) || NORTH_GATE;
    const remaining = state.route.stops.slice(w.idx);
    w.lastFeedback = text;
    $('walk-input').value = '';
    showWalkDecision('正在调整路线。', '我会保留已经走过的部分，并从当前位置重新计算后半段的节点顺序与真实步行道路。');
    toast('正在根据你的变化重新规划后半段路线…');
    state.walkReplanRequest = api('/api/v1/walk/replan', {
      method: 'POST',
      body: JSON.stringify({
        user_id: getUserId(),
        session_id: SESSION_ID,
        feedback: text,
        current_position: currentPosition,
        current_stop_id: currentNode && (currentNode.backendSpaceId || currentNode.id),
        visited_space_ids: (w.visitedIds || []).map(String),
        remaining_space_ids: remaining.map(stop => String(stop.n.backendSpaceId || stop.n.id)),
        profile: backendProfileFromPersona(state.persona),
        constraints: { ...backendConstraintsFromDemand(), start: currentPosition },
        mode: state.challenge ? 'challenge' : 'normal',
      }),
    }).then(result => {
      const tailRoute = routeFromBackendPlan({
        recommendations: result.recommendations || [],
        route: result.route || {},
      });
      const tail = tailRoute ? tailRoute.stops : [];
      if (result.dining_stop) tail.unshift(walkStopFromPlace(result.dining_stop, 'dining'));
      if (result.exit_stop) tail.push(walkStopFromPlace(result.exit_stop, 'exit'));
      if (!tail.length || !result.route) throw new Error((result.warnings || [])[0] || '暂未找到可替换的后半段路线');
      state.route.stops = prefix.concat(tail);
      state.route.plan = { route: result.route };
      state.route.pathCoordinates = (result.route.path_coordinates || []).map(normalizedCoordinate).filter(Boolean);
      state.route.geometryComplete = !!result.route.geometry_complete;
      state.route.backend = true;
      state.route.km = result.route.distance_meters ? (result.route.distance_meters / 1000).toFixed(1) : state.route.km;
      state.route.walkMins = Number(result.route.duration_minutes || 0);
      state.route.mins = Math.max(30, Math.round(state.route.walkMins + state.route.stops.length * 8));
      w.idx = prefix.length;
      w.replanned = true;
      pushRouteChange(result.action || '动态改线', result.message || '已从当前位置更新后半段路线。');
      renderWalk();
      showWalkDecision('路线已更新。', `${escapeHtml(result.message || '已按你的反馈重新规划后半段。')} 下一站是 <b>「${escapeHtml(shortNodeName(tail[0].n))}」</b>。`);
      toast(`后半段已更新：下一站「${shortNodeName(tail[0].n)}」`);
    }).catch(error => {
      showWalkDecision('暂时无法更新路线。', `我保留了原路线，没有替你绘制不可靠的替代路径。${escapeHtml(error.message || '')}`);
      toast('路线重规划失败，已保留原路线');
    }).finally(() => { state.walkReplanRequest = null; });
    return state.walkReplanRequest;
  }

  async function rerouteForDining(curNode, remaining) {
    if (state.diningRequest) return;
    state.diningRequest = loadLocalDiningDensity().then(records => {
      const origin = curNode.mapCoordinate || curNode.coordinate || NORTH_GATE;
      const candidates = (records || []).map(record => ({
        record,
        point: record.map_coordinate || record.coordinate,
        distance: distanceMeters(origin, record.map_coordinate || record.coordinate),
      })).filter(item => inOldMendong(item.point) && item.distance != null)
        .sort((a, b) => (Number(b.record.dining_poi_count_50m) || 0) * 100 - b.distance
          - ((Number(a.record.dining_poi_count_50m) || 0) * 100 - a.distance));
      const selected = candidates[0];
      if (!selected) {
        showWalkDecision('我暂时没有找到可核验的餐饮点。', '本地餐饮密度表在老门东范围内暂未命中坐标，我先保留原路线。');
        toast('餐饮密度表暂未命中，原路线未改变');
        return;
      }
      const record = selected.record;
      const point = selected.point;
      const place = {
        id: record.node_id,
        name: record.node_name,
        type: '本地餐饮密度节点',
        address: '老门东实测节点',
        description: record.description,
        distance_meters: selected.distance,
        coordinate: point,
        map_coordinate: point,
      };
      const foodNode = {
        id: `dining-${place.id}`,
        name: `餐饮 · ${place.name}`,
        type: place.type || '餐饮补给点',
        desc: `${place.description || '老门东本地餐饮补给节点'} · 距当前位置约 ${place.distance_meters} 米`,
        tags: ['餐饮补给', '可核验节点'],
        x: (SPACE_NODES.find(node => node.name.includes(place.name)) || curNode).x || 100,
        y: (SPACE_NODES.find(node => node.name.includes(place.name)) || curNode).y || 200,
        heat: .5,
        coordinate: point,
        mapCoordinate: point,
        profile: { safety: 3, vitality: 4, wealth: 4, beauty: 3, boredom: 3, depression: 3, humanity: 4, social: 4 },
      };
      state.route.pathCoordinates = [];
      state.route.geometryComplete = false;
      state.route.backend = true;
      insertDynamicStop(foodNode, 'local-dining-density', '插入餐饮补给点', `我从本地餐饮密度表选出「${place.name}」，并重算整条路线。`,
        next => `你说饿了，我先从本地餐饮密度表筛掉范围外坐标，再按密度与距离比较。下一站是 <b>「${escapeHtml(next.name)}」</b>，路线会沿道路重新规划。`);
      toast(`已接入餐饮补给：${place.name}`);
      showWalkDecision('附近老门东吃喝补给', `已将本地餐饮密度最高且位于老门东范围内的「${escapeHtml(place.name)}」放到下一站。路线已重新计算，地图绘制会优先请求 AMap.Walking，避免跨水系直连。`);
    }).catch(error => {
      showWalkDecision('本地餐饮表暂时没有响应。', `我先保留当前路线。${escapeHtml(error.message || '')}`);
      toast('餐饮密度表加载失败，原路线未改变');
    }).finally(() => { state.diningRequest = null; });
    return state.diningRequest;
  }


  $('btn-open-print').addEventListener('click', () => {
    const route = state.route || routeFromBackendPlan(state.backendPlan) || computeRoute();
    if (route) {
      state.route = route;
      renderPrintMap(route.stops, route.km, route.mins);
    }
    go('print');
  });

  function currentShareRoute() {
    const route = state.route;
    if (!route || !route.stops || !route.stops.length) return null;
    return route;
  }

  function routeShareUrl() {
    const route = currentShareRoute();
    if (!route) return '';
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('route', route.stops.map(stop => stop.n.id).join(','));
    url.searchParams.set('name', (state.persona && state.persona.nickname) || '我的');
    url.searchParams.set('km', route.km || '');
    url.searchParams.set('mins', route.mins || '');
    return url.toString();
  }

  function routeStaticMapUrl(route) {
    // 静态站点使用原版的路线示意图生成器，下载/分享时也不会出现破图。
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(printRouteMapSvg(route.stops || []))}`;
  }

  function loadRouteStaticMap(route) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('真实地图图片加载失败'));
      image.src = routeStaticMapUrl(route);
    });
  }

  async function copyRouteLink() {
    const url = routeShareUrl();
    if (!url) { toast('请先生成路线'); return; }
    try {
      await navigator.clipboard.writeText(url);
      toast('路线分享链接已复制');
    } catch (_) {
      window.prompt('请复制这条路线链接：', url);
    }
  }

  async function posterCanvas(route) {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = Math.max(1500, 930 + route.stops.length * 100);
    const ctx = canvas.getContext('2d');
    const name = (state.persona && state.persona.nickname) || '我的';
    ctx.fillStyle = '#fffaf2'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#2db5a6'; ctx.font = '700 30px sans-serif'; ctx.fillText('CITYWALK CHECK-IN MAP', 80, 100);
    ctx.fillStyle = '#33291f'; ctx.font = '700 54px serif'; ctx.fillText(`「${name}」的老门东打卡地图`, 80, 175);
    ctx.fillStyle = '#74675c'; ctx.font = '30px sans-serif'; ctx.fillText(`${route.stops.length} 个点位 · 全程约 ${route.km || '?'} 公里 · 漫游约 ${route.mins || '?'} 分钟`, 80, 230);
    const nodes = route.stops.map(stop => stop.n);
    try {
      const mapImage = await loadRouteStaticMap(route);
      ctx.drawImage(mapImage, 70, 300, 1060, 430);
    } catch (error) {
      console.warn('路线海报真实地图加载失败：', error);
      ctx.fillStyle = '#f1ece4'; ctx.fillRect(70, 300, 1060, 430);
      ctx.fillStyle = '#74675c'; ctx.font = '30px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('真实地图暂不可用，请稍后重试下载', 600, 520);
    }
    ctx.textAlign = 'left';
    nodes.forEach((node, i) => { const y = 820 + i * 92; ctx.fillStyle = '#e85a50'; ctx.beginPath(); ctx.arc(96, y - 8, 15, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(String(i + 1), 96, y - 2); ctx.textAlign = 'left'; ctx.fillStyle = '#33291f'; ctx.font = '700 28px sans-serif'; ctx.fillText(shortNodeName(node), 130, y); ctx.fillStyle = '#74675c'; ctx.font = '22px sans-serif'; ctx.fillText((node.desc || '建议在此停留，感受老门东的街巷节奏。').slice(0, 34), 130, y + 34); });
    ctx.fillStyle = '#2db5a6'; ctx.font = '26px sans-serif'; ctx.fillText('城格·漫游 SoulWalking · 从北门出发，按自己的节奏停留', 80, canvas.height - 55);
    return canvas;
  }

  async function routePosterFile() {
    const route = currentShareRoute();
    if (!route) return null;
    const canvas = await posterCanvas(route);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    return blob ? new File([blob], 'soulwalking-route-map.png', { type: 'image/png' }) : null;
  }

  $('btn-copy-route-link').addEventListener('click', copyRouteLink);
  $('btn-download-route-image').addEventListener('click', async () => {
    const poster = await routePosterFile();
    if (!poster) { toast('请先生成路线'); return; }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(poster); link.download = poster.name; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('路线海报已下载');
  });

  async function preparePrintDocument() {
    const route = currentShareRoute();
    if (!route) return false;
    const routeMap = $('route-map');
    if (routeMap) {
      if (state.printRouteMapMarkup === undefined) state.printRouteMapMarkup = routeMap.innerHTML;
      routeMap.innerHTML = `<img class="route-static-map print-planning-map" src="${routeStaticMapUrl(route)}" alt="老门东真实地图与步行路线">`;
      const mapImage = routeMap.querySelector('.route-static-map');
      if (mapImage && !mapImage.complete) {
        toast('正在加载用于打印的真实地图…');
        await new Promise(resolve => {
          mapImage.addEventListener('load', resolve, { once: true });
          mapImage.addEventListener('error', resolve, { once: true });
        });
      }
    }
    // Let the browser apply the route-page and print-only layout before opening its dialog.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return true;
  }

  $('btn-print-route').addEventListener('click', async () => {
    if (!await preparePrintDocument()) { toast('请先生成路线'); return; }
    window.print();
  });
  window.addEventListener('beforeprint', () => { preparePrintDocument(); });
  window.addEventListener('afterprint', () => {
    const route = currentShareRoute();
    if (state.printRouteMapMarkup !== undefined && $('route-map')) {
      $('route-map').innerHTML = state.printRouteMapMarkup;
      state.printRouteMapMarkup = undefined;
      if (route) drawMap(route.stops);
    }
  });
  $('btn-walk-send').addEventListener('click', () => handleWalkFeedback($('walk-input').value));
  $('walk-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleWalkFeedback($('walk-input').value);
  });

  let walkRec = null, walkListening = false;
  $('btn-walk-mic').addEventListener('click', () => {
    if (!SR) {
      toast('当前浏览器暂不支持语音，直接打字告诉我也可以～');
      $('walk-input').focus();
      return;
    }
    if (walkListening) { walkRec.stop(); return; }
    walkRec = new SR();
    walkRec.lang = 'zh-CN';
    walkRec.interimResults = false;
    const status = $('walk-mic-status');
    status.hidden = false;
    status.textContent = '正在听你说路上的变化…';
    $('btn-walk-mic').classList.add('listening');
    walkListening = true;
    walkRec.onresult = e => {
      const text = e.results[0][0].transcript;
      $('walk-input').value = text;
      handleWalkFeedback(text);
    };
    walkRec.onerror = () => {
      status.textContent = '这次没有听清，打字告诉我也可以。';
      $('walk-input').focus();
    };
    walkRec.onend = () => {
      walkListening = false;
      $('btn-walk-mic').classList.remove('listening');
      setTimeout(() => { status.hidden = true; }, 1800);
    };
    try { walkRec.start(); } catch (e) { status.textContent = '语音暂时没有启动，请直接打字。'; }
  });

  $('btn-walk-explain').addEventListener('click', () => {
    const panel = $('walk-explain-panel');
    if (!panel.hidden) {
      panel.hidden = true;
      $('btn-walk-explain').textContent = '解释这次漫游 ✦';
      return;
    }
    const thoughts = Array.from(document.querySelectorAll('#think-steps .tstep p'))
      .map(p => `<p>${p.innerHTML}</p>`).join('');
    const adjustment = state.walk && state.walk.lastFeedback
      ? (state.walk.replanned
        ? `<p class="walk-adjustment"><b>路上的变化，我也重新听见了。</b>你告诉我“${escapeHtml(state.walk.lastFeedback)}”，所以我重新理解约束，把路线变成一条和你一起完成的动态轨迹。</p>`
        : `<p class="walk-adjustment"><b>你的现场选择也进入了判断。</b>你告诉我“${escapeHtml(state.walk.lastFeedback)}”，我记下了这次感受，并暂时保留原来的路线。</p>`)
      : `<p class="walk-adjustment"><b>路线仍会继续理解你。</b>如果路上变累、变饿、变拥挤，或者忽然还想多走一会儿，告诉我后我会重新检索、插入、延长或收束路线。</p>`;
    const changeLog = state.walk && state.walk.routeChanges && state.walk.routeChanges.length
      ? `<ul class="co-change-log explain-log">${state.walk.routeChanges.slice(-4).map(item => `<li><b>${escapeHtml(item.type)}</b><span>${escapeHtml(item.text)}</span></li>`).join('')}</ul>`
      : '';
    panel.innerHTML = `<div class="walk-explain-head"><span>SOULWALKING AGENT</span><h3>这条路线是怎样来到你身边的</h3></div>${adjustment}${changeLog}<div class="walk-explain-stream">${thoughts}</div>`;
    panel.hidden = false;
    $('btn-walk-explain').textContent = '收起漫游解释 ↑';
  });

  function replanRemaining(fromNode, count, msg, options) {
    options = options || {};
    const w = state.walk;
    const prefix = state.route.stops.slice(0, w.idx);
    const source = options.source || 'quiet';
    const exclude = [...new Set(prefix.map(s => s.n.id).concat(w.visitedIds || [], fromNode.id).filter(Boolean))];
    let stops = [];
    if (options.firstNode && !exclude.includes(options.firstNode.id)) {
      const first = { n: options.firstNode, s: routeScore(options.firstNode), source };
      const tail = count > 1
        ? genRoute(state.demand, state.challenge, state.persona.base8D, null, {
          startNode: options.firstNode, exclude: [...exclude, options.firstNode.id],
          stopsN: count - 1, heatScale: w.heatScale,
        }).stops.map(s => ({ ...s, source }))
        : [];
      stops = [first, ...tail].slice(0, Math.max(1, count));
    } else {
      stops = genRoute(state.demand, state.challenge, state.persona.base8D, null, {
        startNode: fromNode, exclude, stopsN: Math.max(1, count), heatScale: w.heatScale,
      }).stops.map(s => ({ ...s, source }));
    }
    if (stops.length) {
      state.route.stops = prefix.concat(stops);
      state.route.pathCoordinates = [];
      state.route.geometryComplete = false;
      w.replanned = true;
      pushRouteChange(options.changeType || '动态改线', options.changeText || '你在路上的变化被加入路线判断，我重新安排了后半段。');
      recalcRouteStats();
      renderWalk();
      if (typeof options.decision === 'function') showWalkDecision('我重新想了一下下一站。', options.decision(stops[0].n));
      toast(msg + '：下一站「' + shortNodeName(stops[0].n) + '」');
    } else {
      toast('附近暂时没有更合适的点了——不如就此收尾，也是一种圆满');
    }
  }

  $('btn-end-walk').addEventListener('click', () => {
    renderFinish();
    go('finish');
  });

  /* ============================================================
     CBF-PI-15：中国大五人格量表（15题，6点计分）
     第2、5题反向计分；结果只作为空间推荐的补充线索
     ============================================================ */
  function loadBigFiveResult() {
    try { return JSON.parse(localStorage.getItem(BIG_FIVE_KEY) || 'null'); }
    catch (e) { return null; }
  }

  function renderBigFiveQuestion() {
    const i = state.bigFiveIndex;
    const item = BIG_FIVE_ITEMS[i];
    $('bigfive-now').textContent = i + 1;
    $('bigfive-progress').style.width = `${i / BIG_FIVE_ITEMS.length * 100}%`;
    $('bigfive-question').textContent = item.text;
    $('btn-bigfive-prev').disabled = i === 0;
    $('bigfive-options').innerHTML = BIG_FIVE_OPTIONS.map((label, optionIndex) => {
      const value = optionIndex + 1;
      return `<button class="bigfive-option${state.bigFiveAnswers[i] === value ? ' selected' : ''}" data-bigfive-value="${value}"><b>${value}</b><span>${label}</span></button>`;
    }).join('');
    document.querySelectorAll('[data-bigfive-value]').forEach(button => button.addEventListener('click', () => {
      state.bigFiveAnswers[i] = Number(button.dataset.bigfiveValue);
      document.querySelectorAll('[data-bigfive-value]').forEach(x => x.classList.toggle('selected', x === button));
      setTimeout(() => {
        if (state.bigFiveIndex < BIG_FIVE_ITEMS.length - 1) {
          state.bigFiveIndex++;
          renderBigFiveQuestion();
        } else {
          finishBigFive();
        }
      }, 180);
    }));
  }

  function scoreBigFive(answers) {
    const grouped = { A: [], E: [], O: [], C: [], N: [] };
    BIG_FIVE_ITEMS.forEach((item, i) => {
      const raw = answers[i];
      grouped[item.dim].push(item.reverse ? 7 - raw : raw);
    });
    const scores = {};
    Object.keys(grouped).forEach(key => {
      scores[key] = grouped[key].reduce((sum, value) => sum + value, 0) / grouped[key].length;
    });
    return scores;
  }

  function deriveBigFiveSpacePersona(scores) {
    const order = ['E', 'O', 'A', 'C', 'N'];
    const norm = {};
    const ranked = order.map((key, index) => {
      norm[key] = clamp((scores[key] - 1) / 5, 0, 1);
      return { key, norm: norm[key], strength: Math.abs(norm[key] - .5) * 2 + (4 - index) * .001 };
    }).sort((a, b) => b.strength - a.strength);
    const poleFor = item => CW.POLE[item.key + (item.norm > .5 ? '_R' : '_L')];
    const main = poleFor(ranked[0]);
    const sub = poleFor(ranked[1]);
    const poles = Object.fromEntries(order.map(key => {
      const item = ranked.find(entry => entry.key === key);
      return [key, poleFor(item).label];
    }));
    const poleList = order.map(key => ({
      dim: key,
      label: poles[key],
      strong: Math.abs(norm[key] - .5) * 2 > .6,
    }));
    // Product-friendly identity: main tendency decides the role,
    // secondary tendency becomes a natural modifier.
    const MAIN_IDENTITY = {
      E_L: '小巷漫游者', E_R: '街区漫步家',
      O_L: '城市观察员', O_R: '转角探索者',
      A_L: '高效行路人', A_R: '旧事拾光者',
      C_L: '自由漫步客', C_R: '路线设计师',
      N_L: '从容旅行者', N_R: '温柔感知者',
    };
    const SECOND_MODIFIER = {
      E_L: '偏静的',   E_R: '爱热闹的',
      O_L: '偏清晰的', O_R: '好奇的',
      A_L: '有目标感的', A_R: '爱故事的',
      C_L: '随性的',   C_R: '有条理的',
      N_L: '从容的',   N_R: '细腻的',
    };
    const mainKey = ranked[0].key;
    const nickname = `${SECOND_MODIFIER[ranked[1].key + (ranked[1].norm > 0.5 ? '_R' : '_L')]}${MAIN_IDENTITY[mainKey + (ranked[0].norm > 0.5 ? '_R' : '_L')]}`;
    return {
      nickname, main, sub, mainLabel: main.label, subLabel: sub.label, poles, norm, poleList,
      blurb: `从这组大五人格线索看，你的城市空间倾向更接近「${nickname}」：以${main.label}为主，也带着${sub.label}的气质。`,
    };
  }
  function normalizeBigFiveSpacePersona(spacePersona, scores) {
    return spacePersona && spacePersona.main && spacePersona.sub && spacePersona.poles && spacePersona.norm
      ? spacePersona
      : deriveBigFiveSpacePersona(scores);
  }

  function applyBigFiveToPreference(scores, spacePersona) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { saved = null; }
    const persona = state.persona || (saved ? hydrateSavedPersona(saved) : buildNeutralPersona());
    const translated = normalizeBigFiveSpacePersona(spacePersona, scores);
    const toFive = value => 1 + (value - 1) * .8;
    const A = toFive(scores.A), E = toFive(scores.E), O = toFive(scores.O), C = toFive(scores.C), N = toFive(scores.N);
    const target = {
      safety: clamp(3 + .38 * (N - 3) + .18 * (C - 3), 1, 5),
      vitality: clamp(E, 1, 5),
      wealth: clamp(3 + .28 * (C - 3) - .1 * (O - 3), 1, 5),
      beauty: clamp(3 + .42 * (O - 3) + .12 * (A - 3), 1, 5),
      boredom: clamp(3 - .38 * (O - 3), 1, 5),
      depression: clamp(3 - .42 * (N - 3), 1, 5),
      humanity: clamp(3 + .38 * (A - 3) + .18 * (O - 3), 1, 5),
      social: clamp(3 + .48 * (E - 3) + .12 * (A - 3), 1, 5),
    };
    const base = persona.base8D || target;
    Object.keys(target).forEach(key => { base[key] = clamp(base[key] * .7 + target[key] * .3, 1, 5); });
    persona.nickname = translated.nickname;
    persona.main = translated.main;
    persona.sub = translated.sub;
    persona.poles = translated.poles;
    persona.norm = translated.norm;
    persona.poleList = translated.poleList;
    persona.blurb = translated.blurb;
    persona.base8D = base;
    persona.neutral = false;
    persona.source = 'bigfive';
    persona.bigFiveScores = { ...scores };
    persona.bigFiveUpdatedAt = new Date().toISOString();
    state.persona = persona;
    savePersona();
    return persona;
  }

  function syncBigFiveProfile(scores) {
    const toPercent = value => Math.round(clamp((Number(value) - 1) / 5, 0, 1) * 100);
    return api('/api/v1/profile/bigfive', {
      method: 'POST',
      body: JSON.stringify({
        user_id: getUserId(),
        scores,
        version: 'CBF-PI-15',
        profile: {
          openness: toPercent(scores.O),
          conscientiousness: toPercent(scores.C),
          extraversion: toPercent(scores.E),
          agreeableness: toPercent(scores.A),
          neuroticism: toPercent(scores.N),
          source: 'test',
          confidence: 0.82,
        },
      }),
    }).catch(error => console.warn('大五人格结果同步失败，已保留本机记录：', error));
  }

  function radarPoint(index, value, radius) {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / 5;
    return [120 + Math.cos(angle) * radius * value, 120 + Math.sin(angle) * radius * value];
  }

  function renderBigFiveResult(result) {
    const spacePersona = normalizeBigFiveSpacePersona(result.spacePersona, result.scores);
    $('bigfive-space-persona').innerHTML = `
      <div><span>CBF-PI-15 → SPACE PERSONA</span><small>由大五人格转译出的空间标签</small></div>
      <h3>「${escapeHtml(spacePersona.nickname)}」</h3>
      <div class="bigfive-space-tags"><b>${escapeHtml(spacePersona.mainLabel)}</b><i>＋</i><b>${escapeHtml(spacePersona.subLabel)}</b></div>
      <p>${escapeHtml(spacePersona.blurb)}</p>`;
    const values = BIG_FIVE_DIMS.map(dim => (result.scores[dim.key] - 1) / 5);
    const grids = [.25, .5, .75, 1].map(level =>
      `<polygon points="${BIG_FIVE_DIMS.map((_, i) => radarPoint(i, level, 78).join(',')).join(' ')}"/>`).join('');
    const axes = BIG_FIVE_DIMS.map((_, i) => {
      const p = radarPoint(i, 1, 78); return `<line x1="120" y1="120" x2="${p[0]}" y2="${p[1]}"/>`;
    }).join('');
    const polygon = BIG_FIVE_DIMS.map((_, i) => radarPoint(i, values[i], 78).join(',')).join(' ');
    const labels = BIG_FIVE_DIMS.map((dim, i) => {
      const p = radarPoint(i, 1, 103); return `<text x="${p[0]}" y="${p[1]}" text-anchor="middle">${dim.label}</text>`;
    }).join('');
    $('bigfive-radar').innerHTML = `<svg viewBox="0 0 240 240" role="img" aria-label="大五人格五维雷达图"><g class="radar-grid">${grids}${axes}</g><polygon class="radar-shape" points="${polygon}"/>${labels}</svg>`;
    $('bigfive-bars').innerHTML = BIG_FIVE_DIMS.map(dim => {
      const pct = Math.round((result.scores[dim.key] - 1) / 5 * 100);
      return `<div><header><b>${dim.label}</b><span>${result.scores[dim.key].toFixed(1)} / 6</span></header><i><b style="width:${pct}%;background:${dim.color}"></b></i></div>`;
    }).join('');
    go('bigfive-result');
  }

  function finishBigFive() {
    const scores = scoreBigFive(state.bigFiveAnswers);
    const spacePersona = deriveBigFiveSpacePersona(scores);
    const result = { scores, spacePersona, answers: [...state.bigFiveAnswers], createdAt: new Date().toISOString(), version: 'CBF-PI-15' };
    localStorage.setItem(BIG_FIVE_KEY, JSON.stringify(result));
    applyBigFiveToPreference(scores, spacePersona);
    syncBigFiveProfile(scores);
    $('bigfive-progress').style.width = '100%';
    renderBigFiveResult(result);
  }

  $('btn-bigfive-entry').addEventListener('click', () => {
    state.bigFiveIndex = 0;
    state.bigFiveAnswers.fill(null);
    renderBigFiveQuestion();
    go('bigfive');
  });
  $('btn-bigfive-prev').addEventListener('click', () => {
    if (state.bigFiveIndex > 0) { state.bigFiveIndex--; renderBigFiveQuestion(); }
  });
  $('btn-bigfive-memory').addEventListener('click', () => { renderMemory(); go('memory'); });
  $('btn-bigfive-mood').addEventListener('click', () => {
    const result = loadBigFiveResult();
    const alreadyApplied = state.persona && state.persona.bigFiveScores
      && result && result.scores && Object.keys(result.scores).every(key => Number(state.persona.bigFiveScores[key]) === Number(result.scores[key]));
    const persona = result && result.scores && !alreadyApplied
      ? applyBigFiveToPreference(result.scores, normalizeBigFiveSpacePersona(result.spacePersona, result.scores))
      : state.persona;
    startMoodJourney(persona);
  });

  /* ============================================================
     ⑨ 漫游记忆：测试快照 + 旅程记录 + 串联解释
     当前存储在浏览器，后续可由后端 Memory API 替换
     ============================================================ */
  function memoryPreference(profile) {
    if (!profile || !profile.base8D) return ['适合自己的节奏', '能安心停留的空间'];
    const b = profile.base8D;
    const phrases = [];
    if (b.vitality < 2.8 || b.social < 2.8) phrases.push('安静、保留独处余地的街巷');
    if (b.vitality > 3.4 || b.social > 3.4) phrases.push('有烟火气、可以感受人群的场所');
    if (b.humanity > 3.3) phrases.push('有地方故事与生活痕迹的空间');
    if (b.beauty > 3.3) phrases.push('适合慢慢观察与拍照的空间');
    if (b.safety > 3.3) phrases.push('明亮、清晰、让人有安全感的路径');
    return (phrases.length ? phrases : ['节奏舒缓、可以自在停留的空间']).slice(0, 2);
  }

  function buildMemoryReport(archive) {
    const latest = archive.profiles[0];
    if (!latest) {
      return `<div class="memory-empty"><b>第一束线索还在等你</b><p>完成一次测试或一小段漫游，这里就会慢慢亮起来。</p></div>`;
    }
    const prefs = memoryPreference(latest);
    const icons = ['静', '光'];
    return `<div class="memory-insight-viz">${prefs.map((text, i) => `<div><i>${icons[i] || '心'}</i><span>${escapeHtml(text)}</span></div>`).join('')}</div><blockquote>这些只是此刻较清晰的线索；真实的你，会在每一次选择里继续变化。</blockquote>`;
  }

  function renderMemory() {
    const archive = loadArchive();
    const bigFive = loadBigFiveResult();
    const bigFivePersona = bigFive && bigFive.scores ? (bigFive.spacePersona || deriveBigFiveSpacePersona(bigFive.scores)) : null;
    const profileMemories = [bigFivePersona ? {
      createdAt: bigFive.createdAt,
      city: 'CBF-PI-15 映射',
      nickname: bigFivePersona.nickname,
      poleList: bigFivePersona.poleList,
      source: '专业量表',
    } : null, ...archive.profiles].filter(Boolean).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    const latest = archive.profiles[0];
    const stable = memoryPreference(latest)[0];
    const journeyDistance = journey => {
      if (Number(journey.km) > 0) return Number(journey.km);
      const nodes = (journey.stops || []).map(name => SPACE_NODES.find(node => node.name.replace('老门东·', '') === name)).filter(Boolean);
      if (!nodes.length) return 0;
      const chain = [{ x: 100, y: 200 }, ...nodes];
      return chain.reduce((sum, node, i) => i ? sum + dist(chain[i - 1], node) : sum, 0) / 600 * 1.35;
    };
    const totalKm = archive.journeys.reduce((sum, journey) => sum + journeyDistance(journey), 0);
    const likedScenes = sceneEvents(archive, 'like');
    const photoScenes = sceneEvents(archive, 'photo');
    $('memory-stats').innerHTML = `
      <button data-memory-detail="tests"><i>测</i><b>${profileMemories.length}</b><small>次测试</small></button>
      <button data-memory-detail="stable"><i>心</i><b class="memory-stat-words">${escapeHtml(stable)}</b><small>最稳定的喜欢</small></button>
      <button data-memory-detail="distance"><i>路</i><b>${totalKm.toFixed(1)}</b><small>累计公里</small></button>
      <button data-memory-detail="likes"><i>♥</i><b>${likedScenes.length}</b><small>个心动场景</small></button>
      <button data-memory-detail="photos"><i>▣</i><b>${photoScenes.length}</b><small>个拍照场景</small></button>`;

    $('memory-profile-list').innerHTML = profileMemories.length
      ? profileMemories.slice(0, 4).map((p, i) => `
        <article class="memory-profile-card ${i === 0 ? 'latest' : ''}">
          <div class="memory-card-top"><span>${formatMemoryDate(p.createdAt)}</span><em>${p.source ? escapeHtml(p.source) : (i === 0 ? '最近一次' : escapeHtml(p.city || '南京 · 老门东'))}</em></div>
          <h4>「${escapeHtml(p.nickname)}」</h4>
          <div class="memory-poles">${(p.poleList || []).map(x => `<span class="${x.strong ? 'strong' : ''}">${escapeHtml(x.label)}</span>`).join('')}</div>
        </article>`).join('')
      : `<div class="memory-empty"><b>还没有空间画像</b><p>完成一次测试，这里就会留下第一枚小小坐标。</p></div>`;

    $('memory-report').innerHTML = buildMemoryReport(archive);
    $('memory-journey-list').innerHTML = archive.journeys.length
      ? archive.journeys.slice(0, 4).map(j => `
        <article class="journey-memory-card">
          <div class="memory-card-top"><span>${formatMemoryDate(j.createdAt)}</span><em>${escapeHtml(j.city)}</em></div>
          <h4>${escapeHtml(j.title || '老门东的一次漫游')}</h4>
          <div class="journey-route-viz">${j.stops.slice(0, 5).map((stop, i) => `<span title="${escapeHtml(stop)}">${i + 1}</span>`).join('<i>→</i>')}</div>
          ${(j.favorites || []).length ? `<div class="journey-fav">♥ 心动：${escapeHtml(j.favorites.join('、'))}</div>` : ''}
          ${(j.notForMe || []).length ? `<div class="journey-not-fit">↓ 当时不太适合：${escapeHtml(j.notForMe.join('、'))}</div>` : ''}
          <footer><span>${j.rating ? `${j.rating} 星` : '未评分'}</span><span>${escapeHtml(j.persona)}</span></footer>
        </article>`).join('')
      : `<div class="memory-empty"><b>还没有漫游足迹</b><p>哪怕只走一站，也足够成为一段记忆。</p></div>`;

    const renderSceneMemories = (items, emptyText, kind) => items.length
      ? items.map((scene, i) => `<button class="memory-scene-chip" data-memory-scene="${kind}" data-memory-scene-index="${i}" aria-expanded="false"><i>${String(i + 1).padStart(2, '0')}</i><span>${escapeHtml(scene.name)}</span><small>${scene.events.length} 次回忆</small></button>`).join('')
      : `<div class="memory-empty"><b>${emptyText}</b><p>下一次真实的喜欢，会从这里慢慢积累。</p></div>`;
    $('memory-like-list').innerHTML = renderSceneMemories(likedScenes, '还没有标记心动的场景', 'like');
    $('memory-photo-list').innerHTML = renderSceneMemories(photoScenes, '还没有拍照收藏的场景', 'photo');
    $('memory-scene-recall').hidden = true;

    const showSceneRecall = (scene, kind, button) => {
      const target = $('memory-scene-recall');
      const action = kind === 'like' ? '心动' : '拍照收藏';
      target.innerHTML = `
        <div class="memory-recall-head"><div><span>${kind === 'like' ? '♥' : '▣'}</span><div><small>${action}回忆</small><h4>${escapeHtml(scene.name)}</h4></div></div><button type="button" data-memory-recall-close aria-label="收起回忆">×</button></div>
        <div class="memory-recall-list">${scene.events.slice().sort((a, b) => new Date(b.occurredAt || b.journeyCreatedAt || 0) - new Date(a.occurredAt || a.journeyCreatedAt || 0)).map(event => {
          const visitText = event.visitAt ? `到访：${formatMemoryDateTime(event.visitAt)}` : `漫游完成：${formatMemoryDateTime(event.journeyCreatedAt)}`;
          const actionText = event.occurredAt ? `${action}：${formatMemoryDateTime(event.occurredAt)}` : '该次记录未保留具体操作时刻';
          return `<div><b>${visitText}</b><span>${actionText}${event.legacy ? '（旧记录）' : ''}</span></div>`;
        }).join('')}</div>`;
      target.hidden = false;
      document.querySelectorAll('[data-memory-scene]').forEach(item => item.setAttribute('aria-expanded', String(item === button)));
      target.querySelector('[data-memory-recall-close]').addEventListener('click', () => {
        target.hidden = true;
        document.querySelectorAll('[data-memory-scene]').forEach(item => item.setAttribute('aria-expanded', 'false'));
      });
      target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    document.querySelectorAll('[data-memory-scene]').forEach(button => button.addEventListener('click', () => {
      const scenes = button.dataset.memoryScene === 'like' ? likedScenes : photoScenes;
      showSceneRecall(scenes[Number(button.dataset.memorySceneIndex)], button.dataset.memoryScene, button);
    }));

    document.querySelectorAll('.memory-detail-panel').forEach(panel => { panel.hidden = true; });
    document.querySelectorAll('[data-memory-detail]').forEach(button => button.addEventListener('click', () => {
      const target = $(`memory-detail-${button.dataset.memoryDetail}`);
      document.querySelectorAll('.memory-detail-panel').forEach(panel => { panel.hidden = panel !== target; });
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    document.querySelectorAll('[data-memory-close]').forEach(button => button.addEventListener('click', () => {
      const panel = button.closest('.memory-detail-panel');
      if (panel) panel.hidden = true;
      $('memory-scene-recall').hidden = true;
      $('memory-stats').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));

    $('bigfive-easter-egg').hidden = false;
  }

  function recordJourneyMemory(note, rating, favoriteIds) {
    const w = state.walk || { visitedIds: [], stamps: [] };
    if (w.memorySaved) return;
    const archive = loadArchive();
    const sceneOf = id => {
      const n = SPACE_NODES.find(x => x.id === id);
      return canonicalScene(id, n ? n.name : id);
    };
    const nameOf = id => sceneOf(id).name;
    const now = new Date().toISOString();
    const eventFor = (kind, id) => (w.memoryEvents || []).find(event => event.kind === kind && event.nodeId === id);
    const visitFor = id => (w.visitEvents || []).find(event => event.nodeId === id);
    const detailFor = (kind, id) => {
      const scene = sceneOf(id);
      const action = eventFor(kind, id);
      const visit = visitFor(id);
      return {
        nodeId: scene.nodeId,
        name: scene.name,
        occurredAt: action ? action.occurredAt : now,
        visitAt: visit ? visit.occurredAt : null,
      };
    };
    archive.journeys.unshift({
      id: `journey-${Date.now()}`,
      createdAt: new Date().toISOString(),
      city: '南京 · 老门东',
      title: state.mood.texts.length ? '回应那一天状态的漫游' : '沿着空间人格出发',
      persona: state.persona.nickname,
      mood: state.mood.texts.join('，'),
      stops: w.visitedIds.map(nameOf),
      plannedStops: (state.route && state.route.stops ? state.route.stops : []).map(s => s.n.name.replace('老门东·', '')),
      routeChanges: w.routeChanges || [],
      favorites: favoriteIds.map(nameOf),
      favoriteEvents: favoriteIds.map(id => detailFor('like', id)),
      notForMe: (w.dislikes || []).map(nameOf),
      photos: (w.photos || []).map(nameOf),
      photoEvents: (w.photos || []).map(id => detailFor('photo', id)),
      visitEvents: (w.visitEvents || []).map(event => ({
        nodeId: sceneOf(event.nodeId).nodeId,
        name: sceneOf(event.nodeId).name,
        occurredAt: event.occurredAt,
      })),
      comments: (w.notes || []).map(x => ({ node: x.node, text: x.text })),
      rating,
      note,
      km: Number(state.route && state.route.km || 0),
    });
    archive.journeys = archive.journeys.slice(0, 30);
    saveArchive(archive);
    w.memorySaved = true;
    updateMemorySummary();
  }

  $('btn-memory-test').addEventListener('click', () => {
    state.qIndex = 0;
    state.answers.fill(null);
    renderQuestion();
    go('test');
  });

  /* ============================================================
     ⑧ 漫游结束·反馈
     ============================================================ */
  let starVal = 0;
  let favIds = new Set();
  function renderFinish() {
    const w = state.walk || { stamps: [], likes: [], dislikes: [], photos: [], notes: [], visitedIds: [] };
    starVal = 0;
    favIds = new Set(w.likes); // 默认把"盖章时点过喜欢"的当作心动
    $('finish-summary').innerHTML =
      `「${state.persona.nickname}」，今天你走了 <b>${w.visitedIds.length}</b> 个推荐点位，` +
      `收下 <b>${w.stamps.length}</b> 枚印章、<b>${w.likes.length}</b> 个喜欢、` +
      `<b>${w.photos.length}</b> 个拍照收藏${w.dislikes.length ? `、<b>${w.dislikes.length}</b> 个“不太适合”` : ''}` +
      `${w.notes.length ? `、留下 <b>${w.notes.length}</b> 条评论` : ''}。`;

    const actOf = id => w.likes.includes(id) ? '♥ 点赞' : (w.dislikes.includes(id) ? '↓ 不太适合' : (w.photos.includes(id) ? '▣ 收藏' : '◈ 到访'));
    $('finish-stamps').innerHTML = w.stamps.map((s, i) => `
      <div class="fs-item" style="--rot:${(i % 3 - 1) * 5}deg">
        <span class="fs-emoji">${w.likes.includes(s.id) ? '♥' : (w.dislikes.includes(s.id) ? '↓' : (w.photos.includes(s.id) ? '▣' : '◈'))}</span>
        <span class="fs-name">${s.name.replace('老门东·', '')}</span>
        <span class="fs-act">${actOf(s.id)}</span>
      </div>`).join('') || '<span class="ws-chip" style="opacity:.55">今天没有盖章——下次路上见</span>';

    /* 心动之站：从走过的印章里可选（默认勾上 w.likes），提交时按 0.85/0.15 学习画像 */
    const favHtml = (w.stamps.length ? w.stamps : w.visitedIds.map(id => {
      const n = SPACE_NODES.find(x => x.id === id);
      return n ? { id: n.id, name: n.name } : null;
    }).filter(Boolean)).map(s => {
      const on = favIds.has(s.id);
      return `<button class="ff-chip ${on ? 'on' : ''}" data-fav="${s.id}">
        <span class="ff-heart">${on ? '♥' : '♡'}</span>
        <span class="ff-name">${s.name.replace('老门东·', '')}</span>
      </button>`;
    }).join('');
    $('finish-fav-grid').innerHTML = favHtml || '<span class="ws-chip" style="opacity:.55">今天还没走站——下次来选</span>';
    document.querySelectorAll('[data-fav]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.fav;
        if (favIds.has(id)) favIds.delete(id); else favIds.add(id);
        b.classList.toggle('on');
        b.querySelector('.ff-heart').textContent = favIds.has(id) ? '♥' : '♡';
      }));

    $('stars-row').innerHTML = [1, 2, 3, 4, 5].map(i =>
      `<button class="star-btn" data-star="${i}">★</button>`).join('');
    document.querySelectorAll('[data-star]').forEach(b =>
      b.addEventListener('click', () => {
        starVal = +b.dataset.star;
        document.querySelectorAll('[data-star]').forEach(x =>
          x.classList.toggle('on', +x.dataset.star <= starVal));
      }));
    $('finish-note').value = '';
  }

  $('btn-submit-finish').addEventListener('click', () => {
    const w = state.walk || { likes: [], dislikes: [], visitedIds: [], stamps: [] };
    const note = $('finish-note').value.trim();
    const p = state.persona;

    /* 画像微调：
       - 心动之站（用户在 finish 上勾选/保留的）：0.15 强拉（最强学习信号）
       - 喜欢/拍照：0.06 中等
       - 仅到访：0.02 轻微
       高分（4-5 星）再加 0.04 强化心动 */
    const pull = (nodeId, k) => {
      const n = SPACE_NODES.find(x => x.id === nodeId);
      if (!n) return;
      DIMS.forEach(d => { p.base8D[d.key] = clamp(p.base8D[d.key] * (1 - k) + n.profile[d.key] * k, 1, 5); });
    };
    const pushAway = (nodeId, k) => {
      const n = SPACE_NODES.find(x => x.id === nodeId);
      if (!n) return;
      DIMS.forEach(d => {
        const away = p.base8D[d.key] + (p.base8D[d.key] - n.profile[d.key]) * k;
        p.base8D[d.key] = clamp(away, 1, 5);
      });
    };
    const favArr = Array.from(favIds);
    favArr.forEach(id => pull(id, 0.15));
    if (starVal >= 4) favArr.forEach(id => pull(id, 0.04));
    w.likes.forEach(id => pull(id, 0.06));
    w.dislikes.forEach(id => pushAway(id, 0.05));
    w.visitedIds.forEach(id => pull(id, 0.02));
    savePersona();
    recordJourneyMemory(note, starVal, favArr);
    syncBackendFeedback(note, starVal, favArr);

    const ratingReplies = {
      5: `<b>非常感谢你的喜欢。</b><br><span style="color:var(--ink-dim);font-size:14.5px">能陪你遇见合心意的空间，是我们今天最开心的事。这五颗星我们会珍惜，也会继续认真学习。</span>`,
      4: `<b>谢谢你愿意给我们四颗星。</b><br><span style="color:var(--ink-dim);font-size:14.5px">还有一点点可以做得更好，我们会把你的选择认真记下，让下一次更贴近你。</span>`,
      3: `<b>谢谢你愿意留下真实的感受。</b><br><span style="color:var(--ink-dim);font-size:14.5px">这次也许只是刚好合适。我们会继续学习，不急着替你定义喜欢，慢慢更懂你。</span>`,
      2: `<b>谢谢你仍愿意留下两颗星。</b><br><span style="color:var(--ink-dim);font-size:14.5px">抱歉这次没有真正照顾到你的感受。我们会认真记住，努力让下一次更温柔、更合适。</span>`,
      1: `<b>谢谢你愿意坦诚告诉我们。</b><br><span style="color:var(--ink-dim);font-size:14.5px">很抱歉这次旅程没有让你感到舒服。是我们还不够懂你；我们会记住，并认真学习。</span>`,
    };
    let msg;
    if (starVal) {
      msg = ratingReplies[starVal];
      if (favArr.length) msg += `<br><span style="color:var(--coral);font-size:14px">你最心动的 <b>${favArr.length}</b> 站，我们也好好收下了。</span>`;
      msg += `<br><span style="color:var(--ink-faint);font-size:13px">下一次，我们会试着更懂「${p.nickname}」。</span>`;
    } else {
      msg = favArr.length
        ? `记下你最心动的 <b>${favArr.length}</b> 站<br><span style="color:var(--ink-dim);font-size:14.5px">下次会更懂你。</span>`
        : `你的漫游记录已收下<br><span style="color:var(--ink-dim);font-size:14.5px">空间画像已更新。</span>`;
    }
    if (note) msg += `<br><span style="color:var(--amber);font-size:14px">「${escapeHtml(note)}」我们也记住了。</span>`;
    // 居中感谢弹层
    $('thanks-msg').innerHTML = msg;
    $('thanks-modal').hidden = false;
  });

  $('btn-finish-home').addEventListener('click', () => { go('cover'); loadSaved(); updateMemorySummary(); });

  // 居中感谢弹层：关闭即回封面
  $('btn-thanks-ok').addEventListener('click', () => {
    $('thanks-modal').hidden = true;
    go('cover');
    loadSaved();
    updateMemorySummary();
  });

  /* ---------------- 初始化 ---------------- */
  function openSharedRouteIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const ids = (params.get('route') || '').split(',').filter(Boolean);
    if (!ids.length) return false;
    const nodes = ids.map(id => SPACE_NODES.find(node => node.id === id)).filter(Boolean);
    if (!nodes.length) return false;
    const nickname = (params.get('name') || '朋友').slice(0, 24);
    state.persona = {
      nickname,
      base8D: Object.fromEntries(DIMS.map(dim => [dim.key, 3])),
      norm: {},
      neutral: true,
    };
    state.demand = Object.fromEntries(DIMS.map(dim => [dim.key, 3]));
    state.sharedRoute = {
      stops: nodes.map(node => ({ n: node, s: 1 })),
      km: params.get('km') || '?',
      mins: params.get('mins') || '?',
    };
    state.route = state.sharedRoute;
    renderRoute();
    go('route');
    return true;
  }
  if (!openSharedRouteIfPresent()) renderQuestion();
  } catch (e) {
    console.error('城格漫游初始化失败:', e);
    const d = document.getElementById('err-fallback');
    if (d) { d.hidden = false; d.textContent = '初始化失败：' + e.message; }
  }
})();
