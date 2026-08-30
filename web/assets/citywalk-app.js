(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const state = {
    questions: [], answers: [], qIndex: 0, profile: null, persona: null,
    mood: [], plan: null, challenge: false, map: null, mapConfig: null,
    checkin: null, moodOrigin: "cover",
  };
  const userId = localStorage.getItem("sw_citywalk_user") || crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  localStorage.setItem("sw_citywalk_user", userId);
  const sceneOptions = [
    ["alley_quiet", "street_busy"], ["cafe_courtyard", "cafe_street"], ["artist_skip", "artist_watch"],
    ["brick_neat", "stone_rough"], ["lane_straight", "lane_winding"], ["wall_clean", "wall_graffiti"],
    ["route_direct", "route_scenic"], ["fork_nav", "fork_curious"], ["mall_chain", "street_indie"],
    ["plan_free", "plan_map"], ["rain_walk", "rain_indoor"], ["check_casual", "check_list"],
    ["dark_calm", "dark_tense"], ["crowd_ok", "crowd_bad"], ["light_bright", "light_shadow"],
  ];
  const sceneImages = Object.freeze({
    alley_quiet: "/assets/questions/district-quiet.webp",
    street_busy: "/assets/questions/district-busy.webp",
    cafe_courtyard: "/assets/questions/cafe-courtyard.webp",
    cafe_street: "/assets/questions/cafe-street.webp",
    artist_skip: "/assets/questions/district-quiet.webp",
    artist_watch: "/assets/questions/district-busy.webp",
    brick_neat: "/assets/questions/wall-clean.webp",
    stone_rough: "/assets/questions/wall-graffiti.webp",
    lane_straight: "/assets/questions/lane-straight.webp",
    lane_winding: "/assets/questions/lane-winding.webp",
    wall_clean: "/assets/questions/wall-clean.webp",
    wall_graffiti: "/assets/questions/wall-graffiti.webp",
    route_direct: "/assets/questions/route-direct.webp",
    route_scenic: "/assets/questions/route-scenic.webp",
    mall_chain: "/assets/questions/store-chain.webp",
    street_indie: "/assets/questions/store-indie.webp",
    plan_free: "/assets/questions/plan-free.webp",
    plan_map: "/assets/questions/plan-map.webp",
    fork_nav: "/assets/questions/plan-map.webp",
    fork_curious: "/assets/questions/plan-free.webp",
    rain_walk: "/assets/questions/cafe-street.webp",
    rain_indoor: "/assets/questions/cafe-courtyard.webp",
    check_casual: "/assets/questions/checkin-casual.webp",
    check_list: "/assets/questions/checkin-planned.webp",
    dark_calm: "/assets/questions/dark-alley-explore.webp",
    dark_tense: "/assets/questions/dark-alley-leave.webp",
    light_bright: "/assets/questions/dark-alley-explore.webp",
    light_shadow: "/assets/questions/dark-alley-leave.webp",
    crowd_ok: "/assets/questions/crowd-enjoy.webp",
    crowd_bad: "/assets/questions/crowd-uncomfortable.webp",
  });

  const escapeHtml = value => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const api = async (path, options = {}) => {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || `请求失败：${response.status}`);
    return data;
  };
  const go = name => {
    if (name !== "checkin") stopDemoWalk();
    ["cover", "test", "persona", "mood", "memory", "about", "think", "route", "checkin"].forEach(screen =>
      $(`scr-${screen}`).classList.toggle("active", screen === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const toast = text => {
    const node = $("toast"); node.textContent = text; node.hidden = false;
    clearTimeout(node._timer); node._timer = setTimeout(() => { node.hidden = true; }, 2600);
  };
  const guideName = () => state.persona?.nickname || "漫游者";

  function personaFor(profile) {
    const dimensions = [
      ["openness", "实景派", "意象派", "转角寻梦"],
      ["conscientiousness", "随兴派", "计划派", "掌线"],
      ["extraversion", "隐逸派", "活力派", "追光"],
      ["agreeableness", "功能派", "情怀派", "拾遗"],
      ["neuroticism", "稳静派", "敏感派", "听雨"],
    ].map(([key, left, right, word]) => ({ key, left, right, word, value: Number(profile[key] || 50) }));
    const ordered = [...dimensions].sort((a, b) => Math.abs(b.value - 50) - Math.abs(a.value - 50));
    const main = ordered[0], sub = ordered[1];
    const side = item => item.value >= 50 ? item.right : item.left;
    return {
      nickname: `${sub.value >= 50 ? "转角" : "深巷"}${main.word}人`,
      labels: dimensions.map(item => ({ label: side(item), strong: Math.abs(item.value - 50) >= 30 })),
      description: `你更接近${side(main)}，也带着${side(sub)}的漫游气质。路线会用 37 个实测节点与此刻的表达共同计算。`,
    };
  }

  function renderContext(context) {
    const targets = [$("city-context"), $("mood-context")].filter(Boolean);
    if (!targets.length) return;
    if (!context) {
      const markup = '<article class="city-card demo"><span>老门东天气</span><b>Demo 条件</b><small>城市服务暂不可用</small></article><article class="city-card demo"><span>老门东景区客流快照</span><b>待发布</b><small>不会伪造实时人数</small></article>';
      targets.forEach(target => { target.innerHTML = markup; });
      return;
    }
    const weather = context.weather || {}, crowd = context.crowd || {}, spot = crowd.old_mendong_area || {};
    const weatherText = [weather.condition || "天气待发布", weather.temperature_c == null ? "" : `${weather.temperature_c}℃`].filter(Boolean).join(" · ");
    const crowdText = spot.available && spot.current != null ? `${Number(spot.current).toLocaleString()} 人 · ${spot.comfort}` : "本时点暂未发布";
    const markup = `<article class="city-card ${weather.provider === "unavailable" ? "demo" : ""}"><span>老门东天气</span><b>${escapeHtml(weatherText)}</b><small>${escapeHtml(weather.provider === "amap-web-api" || weather.provider === "amap-mcp" ? "高德实况天气" : "Demo / 降级天气")}</small></article><article class="city-card ${crowd.is_demo ? "demo" : ""}"><span>老门东景区客流快照</span><b>${escapeHtml(crowdText)}</b><small>${escapeHtml(crowd.source_label || "Demo 客流数据")} · ${escapeHtml(crowd.publication_schedule || "定时发布")}</small></article>`;
    targets.forEach(target => { target.innerHTML = markup; });
  }

  function renderQuestion() {
    const q = state.questions[state.qIndex];
    if (!q) return;
    $("q-now").textContent = String(state.qIndex + 1);
    $("q-title").textContent = q.prompt;
    $("test-progress").style.width = `${(state.qIndex / state.questions.length) * 100}%`;
    const chosen = state.answers[state.qIndex];
    $("scene-pair").innerHTML = [["A", q.option_a, q.option_a_image, sceneOptions[state.qIndex]?.[0]], ["B", q.option_b, q.option_b_image, sceneOptions[state.qIndex]?.[1]]]
      .map(([choice, label, image, scene]) => `<button class="scene-card ${chosen === choice ? "picked" : ""}" data-choice="${choice}" aria-label="${escapeHtml(label)}">${sceneVisual(image, scene, label)}<span class="cap"><span class="tick">✓ </span>${escapeHtml(label)}</span></button>`).join("");
    $("scene-pair").querySelectorAll("button").forEach(button => button.addEventListener("click", () => choose(button.dataset.choice)));
    $("btn-prev-q").disabled = state.qIndex === 0;
  }

  function sceneSvg(key) {
    if (window.CITYWALK?.sceneSVG) return window.CITYWALK.sceneSVG(key);
    return '<svg viewBox="0 0 200 140" role="img" aria-label="城市空间插画"><rect width="200" height="140" fill="#18203a"/><circle cx="150" cy="30" r="14" fill="#ffb86b"/><path d="M0 105 L55 55 L110 105 L155 40 L200 105 V140 H0Z" fill="#293653"/><path d="M0 112 H200 V140 H0Z" fill="#11182a"/></svg>';
  }

  function sceneVisual(image, key, label) {
    const source = image || sceneImages[key];
    if (source) return `<img src="${source}" alt="${escapeHtml(label)}" loading="eager">`;
    return sceneSvg(key);
  }

  async function choose(choice) {
    state.answers[state.qIndex] = choice;
    if (state.qIndex < state.questions.length - 1) {
      state.qIndex += 1; renderQuestion();
    } else {
      await submitProfile();
    }
  }

  async function submitProfile() {
    try {
      const data = await api("/api/v1/profile/score", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, answers: state.questions.map((q, index) => ({ question_id: q.id, choice: state.answers[index] })) }),
      });
      state.profile = data.profile;
      state.persona = personaFor(data.profile);
      localStorage.setItem("sw_citywalk_persona", JSON.stringify({ profile: data.profile, persona: state.persona }));
      renderPersona(); go("persona");
    } catch (error) { toast(`计分失败：${error.message}`); }
  }

  function renderPersona() {
    const persona = state.persona;
    $("persona-nickname").textContent = `「${persona.nickname}」`;
    $("persona-poles").innerHTML = persona.labels.map(item => `<span class="pole-chip ${item.strong ? "strong" : ""}">${escapeHtml(item.label)}</span>`).join("");
    $("persona-blurb").textContent = persona.description;
    $("persona-likes").innerHTML = '<div class="lbl">数据基础</div><span class="like-node">◈ 37 个老门东实测节点</span><span class="like-node">◈ 现场照片与空间指标</span>';
  }

  const journeysKey = "sw_citywalk_journeys";

  function loadJourneys() {
    try {
      const stored = JSON.parse(localStorage.getItem(journeysKey) || "[]");
      return Array.isArray(stored) ? stored : [];
    } catch (_) { return []; }
  }

  function saveJourney(plan) {
    const journey = {
      createdAt: new Date().toISOString(),
      title: `「${guideName()}」的老门东漫游`,
      stops: (plan.recommendations || []).map(item => item.name).slice(0, 7),
      duration: plan.route?.duration_minutes || null,
    };
    const journeys = [journey, ...loadJourneys()].slice(0, 12);
    localStorage.setItem(journeysKey, JSON.stringify(journeys));
  }

  function renderMemoryHub(records = []) {
    const target = $("memory-content"), profile = state.profile;
    const traits = [["开放", "openness"], ["尽责", "conscientiousness"], ["外向", "extraversion"], ["宜人", "agreeableness"], ["神经质", "neuroticism"]];
    const profileMarkup = profile ? `<div class="big-five">${traits.map(([label, key]) => `<div class="big-five-item"><b>${Math.round(Number(profile[key] || 0))}</b><span>${label}</span></div>`).join("")}</div>` : '<p>还没有人格画像。完成测试后，这里会显示你的 OCEAN 五维结果。</p>';
    const journeys = loadJourneys();
    const journeyMarkup = journeys.length ? journeys.map(item => `<div class="memory-item"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.stops.join(" · ") || "本次漫游")} ${item.duration ? `· 约 ${item.duration} 分钟` : ""}</span></div>`).join("") : '<p>还没有保存的漫游路线。聊聊心情并生成路线后，它会留在这里。</p>';
    const memoryCount = Array.isArray(records) ? records.length : 0;
    target.innerHTML = `<p class="hub-intro">回忆默认保存在当前设备；人格和偏好仅用于本项目内的路线推荐。</p><section class="hub-card"><h2>大五人格（OCEAN）</h2><p>场景化简版测试，帮助描述空间偏好，不构成心理诊断。</p>${profileMarkup}<div class="checkin-actions"><button id="btn-memory-test" class="btn btn-primary">${profile ? "重新进行大五人格测试" : "开始大五人格测试"}</button></div></section><section class="hub-card"><h2>我的漫游回忆</h2><p>${memoryCount ? `已同步 ${memoryCount} 条本项目偏好记录。` : ""}</p><div class="memory-list">${journeyMarkup}</div></section>`;
    $("btn-memory-test").addEventListener("click", startSpatialTest);
  }

  async function openMemoryHub() {
    renderMemoryHub(); go("memory");
    try {
      const data = await api("/api/v1/memory", { headers: { "X-User-ID": userId } });
      renderMemoryHub(data.records);
    } catch (_) { /* Local memories remain available offline. */ }
  }

  function startSpatialTest() {
    state.qIndex = 0; state.answers = []; renderQuestion(); go("test");
  }

  function enterMood() {
    $("mood-title").textContent = `「${guideName()}」，今天的心情如何呢？`;
    $("btn-mood-back").dataset.back = state.moodOrigin;
    $("chat").innerHTML = "";
    botSay("说说你现在想去哪里、和谁走、想吃点什么，或者只是今天的心情。我会把它们带入实测空间路线。");
    const chips = ["今天有点累", "想安静走走", "想边走边吃", "想拍照", "想和朋友热闹一点", "今天下雨了"];
    $("mood-chips").innerHTML = chips.map(text => `<button class="chip">${text}</button>`).join("");
    $("mood-chips").querySelectorAll("button").forEach(button => button.addEventListener("click", () => sendMood(button.textContent)));
    $("btn-generate").disabled = true; go("mood");
    api("/api/v1/city-context").then(renderContext).catch(() => renderContext(null));
  }
  function addMessage(kind, text) {
    const node = document.createElement("div"); node.className = `msg ${kind}`; node.textContent = text; $("chat").appendChild(node); $("chat").scrollTop = $("chat").scrollHeight;
  }
  const botSay = text => addMessage("bot", text);
  const sendMood = text => {
    const value = String(text || "").trim(); if (!value) return;
    addMessage("user", value); state.mood.push(value); $("mood-input").value = ""; $("btn-generate").disabled = false;
    const indicators = [];
    if (/累|烦|焦虑/.test(value)) indicators.push("低刺激恢复");
    if (/吃|喝|咖啡|小吃/.test(value)) indicators.push("沿途餐饮");
    if (/雨/.test(value)) indicators.push("天气适配");
    const system = document.createElement("div"); system.className = "msg sys"; system.textContent = `已捕捉：${indicators.join(" · ") || "当下漫游偏好"}`; $("chat").appendChild(system);
  };

  async function createPlan() {
    const query = state.mood.length ? state.mood.join("；") : "请按我的空间人格推荐老门东两小时 Citywalk 路线。";
    const steps = ["解析空间人格与当下心情", "检索 37 个实测空间", "查询天气与景区客流快照", "搜索老门东周边餐饮", "规划高德步行路线", "生成可解释推荐"];
    $("think-title").textContent = `正在为「${guideName()}」调用城市工具…`;
    renderThinkingLocation();
    $("think-steps").innerHTML = steps.map((step, index) => `<div class="tstep on" id="think-${index}"><div class="dot">${index + 1}</div><div class="txt">${step}…</div></div>`).join("");
    go("think");
    try {
      state.plan = await api("/api/v1/plans", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, session_id: sessionId, query, profile: state.profile, mode: state.challenge ? "challenge" : "normal", use_memory: true }),
      });
      if (!state.profile && state.plan.profile) {
        state.profile = state.plan.profile;
        state.persona = personaFor(state.profile);
        localStorage.setItem("sw_citywalk_persona", JSON.stringify({ profile: state.profile, persona: state.persona }));
      }
      saveJourney(state.plan);
      $("think-title").textContent = "我把你的话，翻译成了这条路线的体验偏好";
      renderThinkingLocation(state.plan);
      $("think-steps").innerHTML = renderFriendlyRationale(state.plan, query);
      setTimeout(() => { renderRoute(); go("route"); }, 380);
    } catch (error) {
      toast(`路线生成失败：${error.message}`); go("mood");
    }
  }

  const FRIENDLY_DIMENSIONS = [
    { key: "safety", label: "安心感", wish: "我想走得安心" },
    { key: "vitality", label: "热闹感", wish: "我想感受城市生命力" },
    { key: "prosperity", label: "品质感", wish: "我想要整洁、精致、有品质的空间" },
    { key: "beauty", label: "审美感", wish: "我想看好看的空间" },
    { key: "boredom", label: "探索感", wish: "我想遇到变化、惊喜和未知", inverse: true },
    { key: "oppression", label: "松弛感", wish: "我想要开阔、舒服、不拥挤", inverse: true },
    { key: "humanistic_place", label: "地方感", wish: "我想感受这里真正的文化和生活" },
    { key: "social_interaction", label: "互动感", wish: "我想停留、互动、参与城市生活" },
  ];

  function renderThinkingLocation(plan = null) {
    const activeStop = state.checkin && checkinStops()[state.checkin.index];
    const location = activeStop?.name || "老门东北门";
    $("think-place").innerHTML = `<b>⌖ 当前所在：${escapeHtml(location)}</b><small>演示模拟位置，未读取真实定位，也不会上传位置或轨迹。</small>`;
  }

  function friendlyDimensionScores(plan) {
    const nodes = (plan?.recommendations || []).filter(item => item?.perceptions && typeof item.perceptions === "object");
    return FRIENDLY_DIMENSIONS.map(dimension => {
      const values = nodes.map(node => Number(node.perceptions[dimension.key])).filter(Number.isFinite);
      const hasMeasuredData = values.length > 0;
      const raw = hasMeasuredData ? values.reduce((sum, value) => sum + value, 0) / values.length : 4;
      const score = Math.max(1, Math.min(7, dimension.inverse ? 8 - raw : raw));
      return { ...dimension, score, hasMeasuredData };
    });
  }

  function renderFriendlyRationale(plan, query) {
    const dimensions = friendlyDimensionScores(plan);
    const hasMeasuredData = dimensions.some(dimension => dimension.hasMeasuredData);
    const top = [...dimensions].sort((a, b) => b.score - a.score).slice(0, 3);
    const recommendationCount = (plan?.recommendations || []).length;
    const quote = state.mood.length ? state.mood.join("；") : query;
    const trace = plan?.tool_trace || [];
    const dimensionCards = dimensions.map(dimension => `<div class="think-dim"><div class="think-dim-top"><b>${dimension.label}</b><span>${dimension.score.toFixed(1)} / 7</span></div><div class="think-dim-bar"><i style="width:${(dimension.score / 7 * 100).toFixed(0)}%"></i></div><small>${dimension.wish}</small></div>`).join("");
    const source = hasMeasuredData
      ? "八维值为本轮入选节点的实测空间感知均值；“探索感、松弛感”已按反向指标换算为正向体验。"
      : "本轮结果暂未返回节点八维数据，以下先以中性值展示，不把它当作实测得分。";
    const toolDetails = trace.length ? `<details class="think-tools"><summary>已完成 ${trace.length} 项城市信息核验</summary><div class="think-tools-list">${trace.map(item => `<div><b>${escapeHtml(toolName(item.name))}</b><br>${escapeHtml(item.output_summary)}</div>`).join("")}</div></details>` : "";
    return `<section class="think-quote"><b>我先听见你</b>“${escapeHtml(quote)}”</section><section><div class="think-dim-grid">${dimensionCards}</div><span class="think-source">${source}</span></section><section class="think-rationale"><b>这条路线为何适合你</b>我优先保留了 <strong>${top.map(item => item.label).join("、")}</strong> 的体验，在 37 个实测节点中选出 ${recommendationCount} 个点位，再结合天气、客流、餐饮和步行路径排成顺路的一段。这里展示的是可理解的推荐依据，不是系统的内部推理过程。</section>${toolDetails}`;
  }

  function renderRoute() {
    const plan = state.plan, route = plan.route || {}, recommendations = plan.recommendations || [];
    resetCheckin();
    $("route-title").textContent = `「${guideName()}」的今日心动路线`;
    $("route-meta").innerHTML = `<b>${recommendations.length}</b> 个实测节点 · 约 <b>${(route.distance_meters || 0) / 1000}</b> 公里 · <b>${route.duration_minutes || "—"}</b> 分钟 · ${state.challenge ? "挑战模式" : "标准模式"}`;
    const badge = $("route-badge"); badge.hidden = !state.challenge;
    if (state.challenge) badge.textContent = "🜂 挑战路线：基于同一份实测数据，主动避开你的惯常舒适偏好。";
    $("route-stops").innerHTML = recommendations.map((item, index) => `<article class="stop-card"><div class="stop-head"><div class="stop-no">${index + 1}</div><span class="stop-name">${escapeHtml(item.name)}</span><span class="stop-type">${Math.round(item.score.final)}% 契合</span></div>${item.images?.[0] ? `<img src="${escapeHtml(item.images[0].url)}" alt="${escapeHtml(item.images[0].alt)}" style="width:100%;margin-top:12px;border-radius:10px;aspect-ratio:16/8;object-fit:cover">` : ""}<p class="stop-desc">${escapeHtml(item.reason)}</p><div class="stop-why">实测行为：进入 ${Number(item.behaviors?.entry || 0).toFixed(1)} · 停留 ${Number(item.behaviors?.stay || 0).toFixed(1)} · 记录 ${Number(item.behaviors?.record || 0).toFixed(1)}</div><div class="stop-tags">${(item.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join("")}</div></article>`).join("");
    renderDining(plan.dining); drawMap(plan);
    $("btn-challenge").textContent = state.challenge ? "↩ 换回我的舒适路线" : "🜂 挑战一下｜换一条明显不同的路线";
  }

  function resetCheckin() {
    stopDemoWalk();
    state.checkin = { index: 0, legProgress: 0, arrived: false, completed: new Set(), interactions: {}, adjustment: null, adjusting: false, timer: null };
  }

  function stopDemoWalk() {
    if (!state.checkin?.timer) return;
    clearInterval(state.checkin.timer);
    state.checkin.timer = null;
  }

  function checkinStops() {
    return state.plan?.recommendations || [];
  }

  function openCheckin() {
    if (!checkinStops().length) { toast("路线中没有可打卡的节点"); return; }
    if (!state.checkin) resetCheckin();
    renderCheckin(); go("checkin");
  }

  function checkinTrack(stops, checkin) {
    return `<div class="demo-track">${stops.map((stop, index) => {
      const done = checkin.completed.has(index);
      const current = index === checkin.index && !done;
      return `<div class="demo-step ${done ? "done" : ""} ${current ? "current" : ""} ${current && checkin.timer ? "walking" : ""}"><i>${done ? "✓" : index + 1}</i><span>${escapeHtml(stop.name)}</span></div>`;
    }).join("")}</div>`;
  }

  function mapPoint(value) {
    const point = value?.map_coordinate || value?.coordinate || value;
    if (!point || !Number.isFinite(Number(point.longitude)) || !Number.isFinite(Number(point.latitude))) return null;
    return { longitude: Number(point.longitude), latitude: Number(point.latitude), name: point.name || value?.name || "" };
  }

  function routePoints(route, fallback) {
    const points = (route?.path_coordinates || []).map(mapPoint).filter(Boolean);
    return points.length > 1 ? points : fallback.map(mapPoint).filter(Boolean);
  }

  function navigationMap(checkin, stops) {
    const originalRoute = routePoints(state.plan?.route, stops);
    const adjustedRoute = checkin.adjustment?.route ? routePoints(checkin.adjustment.route, stops) : originalRoute;
    const food = checkin.adjustment?.selected_restaurant;
    const foodPoint = mapPoint(food);
    const stopPoints = stops.map(mapPoint).filter(Boolean);
    const allPoints = [...originalRoute, ...adjustedRoute, ...stopPoints, ...(foodPoint ? [foodPoint] : [])];
    if (allPoints.length < 2) return '<div class="route-note" style="padding:18px">路线坐标暂不可用，仍可继续模拟打卡。</div>';
    const longitudes = allPoints.map(point => point.longitude), latitudes = allPoints.map(point => point.latitude);
    const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes), minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
    const lngSpan = Math.max(maxLng - minLng, 0.0005), latSpan = Math.max(maxLat - minLat, 0.0005);
    const project = point => ({ x: 34 + ((point.longitude - minLng) / lngSpan) * 352, y: 218 - ((point.latitude - minLat) / latSpan) * 176 });
    const path = points => points.map((point, index) => { const xy = project(point); return `${index ? "L" : "M"}${xy.x.toFixed(1)} ${xy.y.toFixed(1)}`; }).join(" ");
    const progress = Math.min(1, (checkin.completed.size + (checkin.arrived ? 1 : checkin.legProgress / 100)) / Math.max(stops.length, 1));
    const passedCount = progress ? Math.max(2, Math.ceil(originalRoute.length * progress)) : 0;
    const passedRoute = originalRoute.slice(0, passedCount);
    const stopMarkers = stopPoints.map((point, index) => { const xy = project(point); const done = index < checkin.completed.size; const current = index === checkin.index; return `<g><circle cx="${xy.x}" cy="${xy.y}" r="${current ? 10 : 7}" fill="${done ? "#6fd6c8" : "#141a30"}" stroke="${current ? "#ff8a80" : "#dbe3f6"}" stroke-width="2"/><text x="${xy.x}" y="${xy.y + 3.5}" text-anchor="middle" font-size="9" font-weight="700" fill="${done ? "#102229" : "#dbe3f6"}">${index + 1}</text></g>`; }).join("");
    const foodMarker = foodPoint ? (() => { const xy = project(foodPoint); return `<g><circle cx="${xy.x}" cy="${xy.y}" r="8" fill="#6fd6c8" stroke="#dbe3f6" stroke-width="2"/><text x="${xy.x}" y="${xy.y + 3}" text-anchor="middle" font-size="9" font-weight="700" fill="#102229">餐</text></g>`; })() : "";
    return `<div class="checkin-map" aria-label="漫游路线地图"><svg viewBox="0 0 420 250" role="img" aria-label="推荐路线与已走路线"><rect width="420" height="250" fill="#10172a"/>${Array.from({ length: 6 }, (_, index) => `<path d="M0 ${24 + index * 40}H420" stroke="#1d2942" stroke-width="1"/>`).join("")}${Array.from({ length: 9 }, (_, index) => `<path d="M${18 + index * 48} 0V250" stroke="#1d2942" stroke-width="1"/>`).join("")}<path d="${path(adjustedRoute)}" fill="none" stroke="#ffb86b" stroke-width="4" stroke-dasharray="8 7" stroke-linecap="round"/><path d="${passedRoute.length > 1 ? path(passedRoute) : ""}" fill="none" stroke="#ff5d6c" stroke-width="5" stroke-linecap="round"/>${stopMarkers}${foodMarker}</svg><div class="checkin-map-legend"><span><i class="dashed"></i>推荐路线${foodPoint ? "（已绕行餐饮）" : ""}</span><span><i></i>已经走过</span>${foodPoint ? '<span><i class="food"></i>餐饮停靠</span>' : ""}</div></div>`;
  }

  function renderCheckin() {
    const target = $("checkin-content"), stops = checkinStops(), checkin = state.checkin;
    if (!stops.length || !checkin) { target.innerHTML = '<div class="checkin-hero checkin-finish"><h2>还没有可打卡的路线</h2></div>'; return; }
    const finished = checkin.index >= stops.length;
    const completedCount = checkin.completed.size;
    const currentProgress = checkin.completed.has(checkin.index) ? 0 : (checkin.arrived ? 1 : checkin.legProgress / 100);
    const totalProgress = Math.round(((completedCount + currentProgress) / stops.length) * 100);
    if (finished) {
      target.innerHTML = `<div class="checkin-hero checkin-finish"><div class="checkin-kicker">模拟漫游完成</div><h2>你已收好这条路线的 ${stops.length} 个瞬间</h2><p>本次打卡只保存在当前页面中；没有请求定位，也没有上传轨迹。</p><div class="checkin-actions"><button id="btn-checkin-route" class="btn btn-primary">回看推荐路线</button></div></div>${checkinTrack(stops, checkin)}`;
      $("btn-checkin-route").addEventListener("click", () => go("route"));
      return;
    }
    const stop = stops[checkin.index], markedArrive = checkin.completed.has(checkin.index);
    const entries = checkin.interactions[checkin.index] || {};
    const isWalking = Boolean(checkin.timer);
    const nextText = checkin.index === stops.length - 1 ? "完成本次模拟漫游" : "模拟前往下一站";
    const foodStop = checkin.adjustment?.selected_restaurant;
    const foodNotice = foodStop ? `<div class="food-reroute"><b>路线已调整</b><br>先前往「${escapeHtml(foodStop.name)}」，再衔接剩余推荐点。${foodStop.distance_meters ? `约 ${foodStop.distance_meters} 米` : ""}</div>` : "";
    const arrivalCard = checkin.arrived || markedArrive ? `<section class="checkin-arrival"><h3>${markedArrive ? "✓ 本站已完成" : "你已抵达推荐点"}</h3><p>选择你想留下的互动印记。所有内容仅为本次演示状态。</p><div class="checkin-interactions"><button class="checkin-interaction ${markedArrive ? "selected" : ""}" data-checkin-action="arrive">${markedArrive ? "✓ 已到达" : "◎ 到达打卡"}</button><button class="checkin-interaction ${entries.photo ? "selected" : ""}" data-checkin-action="photo">${entries.photo ? "✓ 已拍照" : "◌ 拍照留念"}</button><button class="checkin-interaction ${entries.collect ? "selected" : ""}" data-checkin-action="collect">${entries.collect ? "✓ 已收集" : "✦ 收集印记"}</button></div><div class="demo-message"><input id="demo-message-input" maxlength="80" placeholder="写一句此刻的感受（演示，不上传）" value="${escapeHtml(entries.message || "")}"><button id="btn-save-demo-message" class="btn btn-small">留言</button></div>${entries.message ? `<div class="demo-message-saved">已留下：${escapeHtml(entries.message)}</div>` : ""}${markedArrive ? `<div class="checkin-actions"><button id="btn-checkin-next" class="btn btn-primary">${nextText}</button></div>` : ""}</section>` : "";
    target.innerHTML = `<div class="checkin-hero"><div class="checkin-kicker">${isWalking ? "正在模拟行进" : checkin.arrived ? "到点触发互动" : "下一站"}</div><h2>${escapeHtml(stop.name)}</h2><p><b>当前模拟位置：</b>${escapeHtml(stop.name)}<br>${isWalking ? "模拟位置正沿推荐路线靠近本点…" : "点击开始后，虚拟位置将自动沿本次推荐路线移动。"}</p><div class="checkin-progress-label"><span>路线进度</span><b>${Math.min(100, totalProgress)}%</b></div><div class="checkin-progress"><div style="width:${Math.min(100, totalProgress)}%"></div></div>${navigationMap(checkin, stops)}${foodNotice}${checkinTrack(stops, checkin)}<div class="checkin-actions">${!checkin.arrived && !isWalking ? '<button id="btn-demo-start" class="btn btn-primary">开始模拟行进</button><button id="btn-demo-arrive" class="btn btn-ghost">直接到达本站</button>' : ""}${isWalking ? '<button id="btn-demo-pause" class="btn btn-ghost">暂停模拟行进</button>' : ""}<button id="btn-reroute-food" class="btn btn-outline" ${checkin.adjusting ? "disabled" : ""}>${checkin.adjusting ? "正在查找附近餐饮…" : "饿了，想吃东西"}</button></div></div>${arrivalCard}`;
    $("btn-demo-start")?.addEventListener("click", startDemoWalk);
    $("btn-demo-arrive")?.addEventListener("click", arriveAtDemoStop);
    $("btn-demo-pause")?.addEventListener("click", () => { stopDemoWalk(); renderCheckin(); });
    $("btn-reroute-food")?.addEventListener("click", rerouteForFood);
    target.querySelectorAll("[data-checkin-action]").forEach(button => button.addEventListener("click", () => recordDemoInteraction(button.dataset.checkinAction)));
    $("btn-save-demo-message")?.addEventListener("click", saveDemoMessage);
    $("btn-checkin-next")?.addEventListener("click", goToNextDemoStop);
  }

  async function rerouteForFood() {
    const checkin = state.checkin, stops = checkinStops();
    if (!checkin || checkin.adjusting) return;
    const currentStop = stops[Math.min(checkin.index, Math.max(stops.length - 1, 0))];
    const origin = mapPoint(currentStop) || mapPoint(state.plan?.route?.coordinates?.[0]);
    if (!origin) { toast("当前模拟站点缺少坐标，暂时无法调整路线"); return; }
    const remaining = stops.slice(checkin.index + 1).map(mapPoint).filter(Boolean);
    checkin.adjusting = true; renderCheckin();
    try {
      const adjustment = await api("/api/v1/route-adjustments", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, session_id: sessionId, origin, remaining_destinations: remaining }),
      });
      if (!adjustment.selected_restaurant || !adjustment.route) throw new Error(adjustment.warning || "附近餐饮坐标暂不可用");
      checkin.adjustment = adjustment;
      toast(`已将「${adjustment.selected_restaurant.name}」加入后续路线`);
    } catch (error) {
      toast(`餐饮路线调整失败：${error.message}`);
    } finally {
      checkin.adjusting = false; renderCheckin();
    }
  }

  function startDemoWalk() {
    const checkin = state.checkin;
    if (!checkin || checkin.timer || checkin.arrived) return;
    checkin.timer = setInterval(() => {
      checkin.legProgress = Math.min(100, checkin.legProgress + 5);
      if (checkin.legProgress >= 100) arriveAtDemoStop();
      else renderCheckin();
    }, 180);
    renderCheckin();
  }

  function arriveAtDemoStop() {
    const checkin = state.checkin;
    if (!checkin) return;
    stopDemoWalk(); checkin.legProgress = 100; checkin.arrived = true;
    renderCheckin(); toast("已进入推荐点范围，弹出互动卡");
  }

  function recordDemoInteraction(action) {
    const checkin = state.checkin;
    if (!checkin?.arrived) return;
    const entries = checkin.interactions[checkin.index] || (checkin.interactions[checkin.index] = {});
    entries[action] = true;
    if (action === "arrive") { checkin.completed.add(checkin.index); toast("本站已完成打卡"); }
    else toast(action === "photo" ? "已记录拍照留念（演示）" : "已收集本站印记");
    renderCheckin();
  }

  function saveDemoMessage() {
    const input = $("demo-message-input"), message = input?.value.trim();
    if (!message) { toast("先写下一句感受吧"); return; }
    const checkin = state.checkin, entries = checkin.interactions[checkin.index] || (checkin.interactions[checkin.index] = {});
    entries.message = message; renderCheckin(); toast("留言已保存在本次演示中");
  }

  function goToNextDemoStop() {
    const checkin = state.checkin;
    if (!checkin?.completed.has(checkin.index)) { toast("先完成到达打卡"); return; }
    checkin.index += 1; checkin.legProgress = 0; checkin.arrived = false; renderCheckin();
  }

  function renderDining(dining) {
    const target = $("food-wrap"), places = dining?.restaurants || [];
    target.hidden = !places.length; if (!places.length) return;
    target.innerHTML = `<div class="food-title"><b>沿途吃喝补给</b><small>${escapeHtml(dining.source_label || "餐饮数据")}${dining.is_demo ? " · Demo" : ""}</small></div><div class="food-grid">${places.slice(0, 6).map(place => `<article class="food-card"><b>${escapeHtml(place.name)}</b><span>${escapeHtml(place.address || place.type || "老门东周边")}</span><span>${place.distance_meters ? `约 ${place.distance_meters}m` : "沿途补给"}${place.rating ? ` · 评分 ${escapeHtml(place.rating)}` : ""}</span></article>`).join("")}</div>`;
  }

  async function ensureMap() {
    if (window.AMap) return true;
    if (!state.mapConfig?.enabled) return false;
    window._AMapSecurityConfig = { serviceHost: state.mapConfig.service_host };
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(state.mapConfig.key)}`;
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script);
    });
    return true;
  }
  async function drawMap(plan) {
    const target = $("route-map");
    try {
      if (!await ensureMap()) throw new Error("地图未配置");
      if (!state.map) state.map = new AMap.Map("route-map", { zoom: 16, center: [118.788, 32.013] });
      state.map.clearMap(); const layers = [];
      const nodes = plan.recommendations || [];
      nodes.forEach((item, index) => {
        const point = item.map_coordinate || item.coordinate; if (!point) return;
        const marker = new AMap.Marker({ position: [point.longitude, point.latitude], title: item.name, label: { content: `${index + 1}. ${escapeHtml(item.name)}`, direction: "top" } });
        state.map.add(marker); layers.push(marker);
      });
      const line = plan.route?.path_coordinates || [];
      if (line.length > 1) { const polyline = new AMap.Polyline({ path: line.map(point => [point.longitude, point.latitude]), strokeColor: state.challenge ? "#ffb86b" : "#ff8a80", strokeWeight: 5, strokeStyle: state.challenge ? "dashed" : "solid" }); state.map.add(polyline); layers.push(polyline); }
      if (layers.length) state.map.setFitView(layers, false, [35, 35, 35, 35]);
      const geometryLabel = plan.route?.geometry_provider === "local-road-network" ? "ArcGIS 本地路网" : (plan.route?.geometry_complete ? "高德道路折线" : "站点位置");
      $("route-note").textContent = `${geometryLabel} · 实地调研轨迹不会被伪装为导航路线`;
    } catch (_) { target.innerHTML = '<div class="route-note" style="padding:18px">地图暂不可用，路线文字与实拍节点仍可使用。</div>'; }
  }

  const toolName = name => ({ search_spaces: "实测空间检索", get_weather: "老门东天气", get_tourism_crowd: "景区客流快照", search_dining: "周边餐饮", plan_walking_route: "高德步行路线", grounded_answer: "推荐说明", check_opening_status: "开放状态核验" })[name] || name;

  function wire() {
    $("theme-toggle").addEventListener("click", toggleTheme);
    document.querySelectorAll("[data-home-action]").forEach(button => button.addEventListener("click", () => {
      const action = button.dataset.homeAction;
      if (action === "test") startSpatialTest();
      if (action === "mood") { state.mood = []; state.moodOrigin = "cover"; enterMood(); }
      if (action === "memory") openMemoryHub();
      if (action === "about") go("about");
    }));
    $("btn-prev-q").addEventListener("click", () => { if (state.qIndex) { state.qIndex--; renderQuestion(); } });
    $("btn-retest").addEventListener("click", startSpatialTest);
    $("btn-to-mood").addEventListener("click", () => { state.mood = []; state.moodOrigin = "persona"; enterMood(); });
    $("btn-send").addEventListener("click", () => sendMood($("mood-input").value));
    $("mood-input").addEventListener("keydown", event => { if (event.key === "Enter") sendMood(event.target.value); });
    $("btn-generate").addEventListener("click", createPlan);
    $("btn-skip-mood").addEventListener("click", createPlan);
    $("btn-start-checkin").addEventListener("click", openCheckin);
    $("btn-challenge").addEventListener("click", () => { state.challenge = !state.challenge; createPlan(); });
    $("btn-again").addEventListener("click", () => { state.challenge = false; state.mood = []; state.moodOrigin = "route"; enterMood(); });
    $("btn-home").addEventListener("click", () => go("cover"));
    document.querySelectorAll("[data-back]").forEach(button => button.addEventListener("click", () => go(button.dataset.back)));
    $("btn-share").addEventListener("click", async () => { const text = `我在「城格·漫游」的空间人格是「${state.persona.nickname}」。`; try { await navigator.clipboard.writeText(text); toast("空间人格已复制"); } catch (_) { toast(text); } });
  }

  async function init() {
    applyTheme(localStorage.getItem("sw_citywalk_theme") || "dark");
    wire();
    const [questions, context, mapConfig] = await Promise.all([
      api("/api/v1/questions"), api("/api/v1/city-context").catch(() => null), api("/api/v1/map/config").catch(() => null),
    ]);
    state.questions = questions.questions; state.mapConfig = mapConfig; renderContext(context); renderQuestion();
    try { const saved = JSON.parse(localStorage.getItem("sw_citywalk_persona") || "null"); if (saved?.profile && saved?.persona) { state.profile = saved.profile; state.persona = saved.persona; $("welcome-back").hidden = false; $("welcome-back").textContent = `欢迎回来，「${state.persona.nickname}」`; $("btn-resume").hidden = false; $("resume-name").textContent = state.persona.nickname; $("btn-resume").onclick = () => { state.mood = []; state.moodOrigin = "cover"; enterMood(); }; } } catch (_) { /* ignored */ }
  }
  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    const light = theme === "light";
    $("theme-toggle").textContent = light ? "🌙 黑暗" : "☀️ 亮色";
    $("theme-toggle").setAttribute("aria-label", light ? "切换黑暗模式" : "切换亮色模式");
  }
  function toggleTheme() {
    const next = document.body.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem("sw_citywalk_theme", next); applyTheme(next);
  }
  init().catch(error => { toast(`初始化失败：${error.message}`); });
})();
