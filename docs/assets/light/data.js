/* ============================================================
   城格·漫游 · data.js
   亮色版：10 道场景二选一 + 30 个 SVG 空间场景
   五维 SpaceTI（对外仅展示 派系标签）→ 空间人格昵称 → 八维基线
   心情解析 → 八维叠加 → 人-场匹配 → 路线生成
   ============================================================ */
window.CITYWALK = (function () {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- 八维空间感知 ---------- */
  const DIMS = [
    { key: 'safety',   label: '安全' },
    { key: 'vitality', label: '活力' },
    { key: 'wealth',   label: '富裕' },
    { key: 'beauty',   label: '美丽' },
    { key: 'boredom',  label: '无聊' },
    { key: 'depression', label: '压抑' },
    { key: 'humanity', label: '人文地方' },
    { key: 'social',   label: '社会交往' },
  ];

/* ---------- 空间节点库：老门东 37 点位（由 空间指标计算.xlsx 实测指标合成） ---------- */
const SPACE_NODES = [
  { id: 'md01', name: '老门东牌坊', type: '老门东点位', x: 63, y: 44, heat: 0.64,
    desc: '新旧交织、视野开阔、绿意浓、人气旺。',
    tags: ['老门东', '牌坊门洞', '绿荫', '热闹'],
    profile: { safety: 3.18, vitality: 2.70, wealth: 2.57, beauty: 2.66, boredom: 2.42, depression: 3.37, humanity: 1.99, social: 2.47 } },
  { id: 'md02', name: '箍桶巷主街', type: '老门东点位', x: 138, y: 62, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.66, vitality: 3.69, wealth: 2.75, beauty: 2.17, boredom: 2.60, depression: 3.71, humanity: 2.76, social: 3.03 } },
  { id: 'md03', name: '中心广场', type: '老门东点位', x: 213, y: 44, heat: 0.89,
    desc: '传统风貌完整、视野开阔、人气旺。',
    tags: ['老门东', '城墙脚下', '人文', '热闹'],
    profile: { safety: 3.43, vitality: 2.69, wealth: 2.64, beauty: 2.23, boredom: 2.58, depression: 3.80, humanity: 4.09, social: 2.50 } },
  { id: 'md04', name: '城墙东（中）', type: '老门东点位', x: 288, y: 62, heat: 0.9,
    desc: '新旧交织、巷道紧凑、绿意浓、人气旺。',
    tags: ['老门东', '游园广场', '绿荫', '热闹'],
    profile: { safety: 3.13, vitality: 3.04, wealth: 2.76, beauty: 2.40, boredom: 2.42, depression: 3.80, humanity: 1.99, social: 2.72 } },
  { id: 'md05', name: '凉亭·城墙东（尾）', type: '老门东点位', x: 363, y: 44, heat: 0.15,
    desc: '新旧交织、视野开阔、绿意浓、人少清静。',
    tags: ['老门东', '城墙脚下', '绿荫', '人文', '安静'],
    profile: { safety: 3.53, vitality: 1.80, wealth: 2.55, beauty: 2.66, boredom: 2.50, depression: 3.28, humanity: 3.47, social: 1.50 } },
  { id: 'md06', name: '东二门', type: '老门东点位', x: 438, y: 62, heat: 0.15,
    desc: '新旧交织、巷道紧凑、绿意浓、人少清静。',
    tags: ['老门东', '街巷', '绿荫', '安静'],
    profile: { safety: 2.93, vitality: 1.56, wealth: 3.02, beauty: 2.05, boredom: 3.38, depression: 3.76, humanity: 1.70, social: 1.00 } },
  { id: 'md07', name: '凌霄花·街巷', type: '老门东点位', x: 513, y: 44, heat: 0.73,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.17, vitality: 3.00, wealth: 3.03, beauty: 2.02, boredom: 3.36, depression: 3.94, humanity: 2.46, social: 2.33 } },
  { id: 'md08', name: '芥子园·入口', type: '老门东点位', x: 87, y: 96, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '人文', '热闹'],
    profile: { safety: 3.17, vitality: 2.89, wealth: 3.18, beauty: 1.75, boredom: 3.48, depression: 4.37, humanity: 4.66, social: 2.33 } },
  { id: 'md09', name: '窄巷', type: '老门东点位', x: 162, y: 114, heat: 0.15,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.07, vitality: 1.56, wealth: 2.99, beauty: 1.88, boredom: 3.34, depression: 4.38, humanity: 2.47, social: 1.00 } },
  { id: 'md10', name: '小牌坊', type: '老门东点位', x: 237, y: 96, heat: 0.2,
    desc: '新旧交织、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.07, vitality: 2.50, wealth: 2.91, beauty: 1.88, boredom: 3.28, depression: 4.15, humanity: 1.99, social: 1.46 } },
  { id: 'md11', name: '门东市集·竹里馆', type: '老门东点位', x: 312, y: 114, heat: 0.15,
    desc: '新旧交织、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.13, vitality: 2.73, wealth: 3.11, beauty: 1.75, boredom: 3.28, depression: 4.27, humanity: 1.99, social: 1.71 } },
  { id: 'md12', name: '文创市集', type: '老门东点位', x: 387, y: 96, heat: 0.28,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.00, vitality: 3.01, wealth: 2.95, beauty: 2.16, boredom: 2.98, depression: 3.99, humanity: 2.34, social: 1.88 } },
  { id: 'md13', name: '文化展馆', type: '老门东点位', x: 462, y: 114, heat: 0.18,
    desc: '新旧交织、巷道紧凑、绿意浓、人少清静。',
    tags: ['老门东', '街巷', '绿荫', '安静'],
    profile: { safety: 3.62, vitality: 3.18, wealth: 2.76, beauty: 2.33, boredom: 3.36, depression: 3.80, humanity: 2.00, social: 2.26 } },
  { id: 'md14', name: '漾应的火塘', type: '老门东点位', x: 537, y: 96, heat: 0.15,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.31, vitality: 2.04, wealth: 3.01, beauty: 2.22, boredom: 2.44, depression: 4.05, humanity: 2.71, social: 1.48 } },
  { id: 'md15', name: '东出口', type: '老门东点位', x: 63, y: 148, heat: 0.45,
    desc: '传统风貌完整、巷道紧凑、人流适中。',
    tags: ['老门东', '街巷'],
    profile: { safety: 3.25, vitality: 1.72, wealth: 3.29, beauty: 1.67, boredom: 3.68, depression: 4.14, humanity: 2.71, social: 1.79 } },
  { id: 'md16', name: '茶舍', type: '老门东点位', x: 138, y: 166, heat: 0.16,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.11, vitality: 1.70, wealth: 3.02, beauty: 1.93, boredom: 3.34, depression: 3.99, humanity: 2.55, social: 1.07 } },
  { id: 'md17', name: '气味艺术家', type: '老门东点位', x: 213, y: 148, heat: 0.9,
    desc: '新旧交织、巷道紧凑、绿意浓、人气旺。',
    tags: ['老门东', '街巷', '绿荫', '热闹'],
    profile: { safety: 3.18, vitality: 2.67, wealth: 2.71, beauty: 2.42, boredom: 3.28, depression: 3.73, humanity: 1.93, social: 2.44 } },
  { id: 'md18', name: '木栅门', type: '老门东点位', x: 288, y: 166, heat: 0.15,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '绿荫', '安静'],
    profile: { safety: 3.32, vitality: 1.56, wealth: 3.14, beauty: 1.98, boredom: 2.52, depression: 4.22, humanity: 2.49, social: 1.15 } },
  { id: 'md19', name: '烟火·东二门', type: '老门东点位', x: 363, y: 148, heat: 0.9,
    desc: '新旧交织、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 2.86, vitality: 2.89, wealth: 3.00, beauty: 1.84, boredom: 2.44, depression: 4.23, humanity: 1.50, social: 2.53 } },
  { id: 'md20', name: '城墙西（中）', type: '老门东点位', x: 438, y: 166, heat: 0.9,
    desc: '新旧交织、巷道紧凑、绿意浓、人气旺。',
    tags: ['老门东', '街巷', '绿荫', '热闹'],
    profile: { safety: 3.54, vitality: 3.18, wealth: 2.58, beauty: 2.41, boredom: 2.60, depression: 3.75, humanity: 1.95, social: 2.78 } },
  { id: 'md21', name: '先锋书店', type: '老门东点位', x: 513, y: 148, heat: 0.15,
    desc: '传统风貌完整、巷道紧凑、绿意浓、人少清静。',
    tags: ['老门东', '古亭廊下', '绿荫', '安静'],
    profile: { safety: 3.53, vitality: 2.81, wealth: 2.68, beauty: 2.35, boredom: 2.94, depression: 3.80, humanity: 2.49, social: 2.20 } },
  { id: 'md22', name: '银兴菲林电影院', type: '老门东点位', x: 87, y: 200, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.57, vitality: 4.08, wealth: 2.88, beauty: 2.09, boredom: 3.16, depression: 4.06, humanity: 2.17, social: 3.14 } },
  { id: 'md23', name: '美食街·沈灶', type: '老门东点位', x: 162, y: 218, heat: 0.3,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.31, vitality: 2.03, wealth: 3.10, beauty: 2.22, boredom: 3.24, depression: 3.81, humanity: 2.25, social: 1.61 } },
  { id: 'md24', name: '美食街·南京大牌档', type: '老门东点位', x: 237, y: 200, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.12, vitality: 3.00, wealth: 2.95, beauty: 2.00, boredom: 3.26, depression: 4.00, humanity: 2.55, social: 2.38 } },
  { id: 'md25', name: '金陵手作坊', type: '老门东点位', x: 312, y: 218, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '古亭廊下', '热闹'],
    profile: { safety: 3.32, vitality: 4.07, wealth: 3.13, beauty: 2.00, boredom: 3.48, depression: 4.07, humanity: 2.55, social: 3.14 } },
  { id: 'md26', name: '两棵枇杷树', type: '老门东点位', x: 387, y: 200, heat: 0.43,
    desc: '传统风貌完整、巷道紧凑、绿意浓、人流适中。',
    tags: ['老门东', '幽深窄巷', '绿荫'],
    profile: { safety: 2.96, vitality: 2.24, wealth: 3.04, beauty: 2.08, boredom: 3.74, depression: 3.83, humanity: 2.31, social: 1.72 } },
  { id: 'md27', name: '餐饮市集', type: '老门东点位', x: 462, y: 218, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.24, vitality: 3.33, wealth: 3.24, beauty: 1.80, boredom: 3.48, depression: 4.21, humanity: 2.63, social: 2.57 } },
  { id: 'md28', name: '美食街·荔湾园', type: '老门东点位', x: 537, y: 200, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.32, vitality: 3.33, wealth: 3.23, beauty: 1.90, boredom: 3.08, depression: 3.93, humanity: 2.52, social: 2.58 } },
  { id: 'md29', name: '三条营门', type: '老门东点位', x: 63, y: 252, heat: 0.15,
    desc: '新旧交织、巷道紧凑、绿意浓、人少清静。',
    tags: ['老门东', '街巷', '绿荫', '安静'],
    profile: { safety: 3.37, vitality: 1.33, wealth: 2.89, beauty: 2.44, boredom: 3.32, depression: 3.72, humanity: 1.30, social: 1.30 } },
  { id: 'md30', name: '金陵美术馆', type: '老门东点位', x: 138, y: 270, heat: 0.15,
    desc: '新旧交织、巷道紧凑、人少清静。',
    tags: ['老门东', '石铺广场', '安静'],
    profile: { safety: 3.51, vitality: 1.33, wealth: 3.11, beauty: 1.75, boredom: 3.52, depression: 4.18, humanity: 1.00, social: 1.14 } },
  { id: 'md31', name: '金陵美术馆北侧', type: '老门东点位', x: 213, y: 252, heat: 0.28,
    desc: '新旧交织、巷道紧凑、人少清静。',
    tags: ['老门东', '美术馆前', '安静'],
    profile: { safety: 3.31, vitality: 1.64, wealth: 3.10, beauty: 2.07, boredom: 3.16, depression: 3.99, humanity: 1.00, social: 1.61 } },
  { id: 'md32', name: '美食·DQ冰淇淋', type: '老门东点位', x: 288, y: 270, heat: 0.9,
    desc: '新旧交织、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.37, vitality: 3.71, wealth: 3.07, beauty: 2.30, boredom: 3.06, depression: 3.79, humanity: 1.47, social: 2.96 } },
  { id: 'md33', name: '美食·火山屋台', type: '老门东点位', x: 363, y: 252, heat: 0.9,
    desc: '新旧交织、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '绿荫', '热闹'],
    profile: { safety: 3.50, vitality: 3.52, wealth: 3.36, beauty: 1.92, boredom: 3.44, depression: 3.99, humanity: 1.66, social: 3.14 } },
  { id: 'md34', name: '美食·绿柳居', type: '老门东点位', x: 438, y: 270, heat: 0.9,
    desc: '传统风貌完整、巷道紧凑、人气旺。',
    tags: ['老门东', '街巷', '热闹'],
    profile: { safety: 3.29, vitality: 3.33, wealth: 3.00, beauty: 1.93, boredom: 2.66, depression: 4.14, humanity: 2.65, social: 2.55 } },
  { id: 'md35', name: '游客中心', type: '老门东点位', x: 513, y: 252, heat: 0.15,
    desc: '传统风貌完整、巷道紧凑、人少清静。',
    tags: ['老门东', '街巷', '安静'],
    profile: { safety: 3.34, vitality: 2.00, wealth: 3.19, beauty: 1.98, boredom: 3.26, depression: 4.01, humanity: 2.16, social: 1.26 } },
  { id: 'md36', name: '泸溪河背面', type: '老门东点位', x: 87, y: 304, heat: 0.9,
    desc: '新旧交织、巷道紧凑、绿意浓、人气旺。',
    tags: ['老门东', '古亭廊下', '绿荫', '热闹'],
    profile: { safety: 3.41, vitality: 4.45, wealth: 2.98, beauty: 2.23, boredom: 2.86, depression: 3.90, humanity: 1.86, social: 3.58 } },
  { id: 'md37', name: '片仔癀博物馆', type: '老门东点位', x: 162, y: 322, heat: 0.15,
    desc: '传统风貌完整、巷道紧凑、绿意浓、人少清静。',
    tags: ['老门东', '街巷', '绿荫', '安静'],
    profile: { safety: 3.27, vitality: 1.67, wealth: 2.96, beauty: 2.25, boredom: 3.62, depression: 3.69, humanity: 2.58, social: 1.10 } },
];

  /* ============================================================
     30 个空间场景插画（参数化 SVG，暖阳晨光系）
     ============================================================ */
  const P = { // palette —— 暖阳晨光
    sky1: '#fce4cf', sky2: '#f8d5b5', skyWarm: '#e8a878',
    bld1: '#e6c8a4', bld2: '#d8b890', bld3: '#c9a878',
    win: '#e85a50', winDim: '#b85a40',
    ground: '#c4a888', ground2: '#a89070',
    coral: '#e85a50', teal: '#2db5a6', amber: '#d49030',
    ink: '#5a4030', moon: '#ffd27f',
  };
  let _uid = 0;

  function sceneSVG(key) {
    _uid++;
    const g = 'sg' + _uid;
    const sky = `<defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${P.sky1}"/><stop offset="0.75" stop-color="${P.sky2}"/><stop offset="1" stop-color="${P.skyWarm}"/></linearGradient></defs>
      <rect width="200" height="140" fill="url(#${g})"/>`;
    const ground = `<rect y="108" width="200" height="32" fill="${P.ground}"/>`;
    const b = (x, y, w, h, f = P.bld1) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`;
    const wins = (x, y, w, h, c, r, fill = P.win, op = 0.85) => {
      let s = '';
      const cw = w / c, ch = h / r;
      for (let i = 0; i < c; i++) for (let j = 0; j < r; j++)
        s += `<rect x="${(x + i * cw + cw * 0.22).toFixed(1)}" y="${(y + j * ch + ch * 0.22).toFixed(1)}" width="${(cw * 0.56).toFixed(1)}" height="${(ch * 0.5).toFixed(1)}" rx="0.8" fill="${fill}" opacity="${op}"/>`;
      return s;
    };
    const win = (x, y, fill = P.win) => `<rect x="${x}" y="${y}" width="7" height="9" rx="1" fill="${fill}"/>`;
    const person = (x, y, c = P.ink) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${c}"/><path d="M${x - 3.6} ${y + 2.4} h7.2 l-1.1 10 h-5 z" fill="${c}"/>`;
    const lamp = (x, y) => `<rect x="${x - 1}" y="${y - 26}" width="2" height="26" fill="#5a4030"/><circle cx="${x}" cy="${y - 28}" r="2.6" fill="${P.win}"/><circle cx="${x}" cy="${y - 28}" r="9" fill="${P.win}" opacity="0.18"/>`;
    const moon = (x, y, r = 9) => `<circle cx="${x}" cy="${y}" r="${r + 4}" fill="${P.moon}" opacity="0.1"/><circle cx="${x}" cy="${y}" r="${r}" fill="${P.moon}" opacity="0.9"/>`;
    const tree = (x, y, s = 1, c = '#2d5a3f') => `<rect x="${x - 1.6}" y="${y - 11 * s}" width="3.2" height="${12 * s}" fill="#5a4030"/><circle cx="${x - 6 * s}" cy="${y - 13 * s}" r="${7 * s}" fill="${c}"/><circle cx="${x + 6 * s}" cy="${y - 15 * s}" r="${8 * s}" fill="${c}"/><circle cx="${x}" cy="${y - 21 * s}" r="${7 * s}" fill="${c}"/>`;
    const sparkle = (x, y, c = P.teal, s = 1) => `<path d="M${x} ${y - 5 * s} L${x + 1.6 * s} ${y - 1.6 * s} L${x + 5 * s} ${y} L${x + 1.6 * s} ${y + 1.6 * s} L${x} ${y + 5 * s} L${x - 1.6 * s} ${y + 1.6 * s} L${x - 5 * s} ${y} L${x - 1.6 * s} ${y - 1.6 * s} Z" fill="${c}"/>`;
    const star = (x, y, o = 0.8) => `<circle cx="${x}" cy="${y}" r="1" fill="#fff" opacity="${o}"/>`;

    const S = {};
    /* —— 维度1 外向性 —— */
    S.alley_quiet = sky + star(30, 20) + star(160, 26, .5) + moon(168, 30, 7)
      + b(-6, 18, 74, 96, P.bld2) + wins(6, 30, 52, 50, 3, 3, P.winDim, .5)
      + b(128, 10, 80, 104, P.bld1) + wins(138, 24, 60, 46, 3, 3, P.winDim, .45)
      + ground + `<rect x="66" y="108" width="68" height="32" fill="${P.ground2}"/>` + lamp(74, 108) + tree(126, 116, .9)
      + `<path d="M96 44 q3 -4 6 0" stroke="${P.teal}" stroke-width="1" fill="none" opacity=".7"/>`;
    S.street_busy = sky + b(0, 26, 44, 82, P.bld1) + b(46, 40, 50, 68, P.bld3) + b(98, 30, 48, 78, P.bld1) + b(148, 46, 52, 62, P.bld3)
      + wins(6, 36, 32, 40, 2, 3) + wins(54, 48, 38, 34, 2, 2) + wins(104, 40, 36, 40, 2, 3) + wins(156, 54, 40, 30, 2, 2)
      + ground
      + `<path d="M10 84 q45 -14 90 0 t90 -6" stroke="${P.coral}" stroke-width="1.4" fill="none" opacity=".8"/>`
      + [0, 1, 2, 3, 4, 5].map(i => `<circle cx="${22 + i * 32}" cy="${84 + (i % 2) * 6}" r="2.2" fill="${P.amber}"/>`).join('')
      + person(58, 118) + person(86, 122) + person(112, 116) + person(140, 121);
    S.cafe_courtyard = sky + moon(160, 24, 7) + star(36, 18)
      + b(0, 22, 200, 86, P.bld2) + `<rect x="58" y="46" width="84" height="62" fill="${P.sky2}"/>`
      + `<rect x="58" y="46" width="84" height="62" fill="none" stroke="${P.bld1}" stroke-width="3"/>`
      + b(70, 56, 60, 52, P.bld3) + win(84, 64, P.win) + win(100, 64, P.win) + win(84, 80, P.winDim)
      + `<rect x="150" y="52" width="34" height="6" fill="${P.coral}" opacity=".85"/><text x="152" y="64" font-size="8" fill="${P.coral}">CAFE</text>`
      + ground + tree(20, 120, 1, '#2d5a3f') + tree(184, 122, .8, '#2d5a3f')
      + `<rect x="52" y="102" width="20" height="6" fill="#5a4030"/>`;
    S.cafe_street = sky + b(0, 26, 200, 62, P.bld1) + wins(10, 36, 180, 44, 5, 2)
      + ground + `<rect y="88" width="200" height="6" fill="${P.bld2}"/>`
      + [0, 1, 2].map(i => `<path d="M${28 + i * 64} 78 l24 0 l4 10 l-32 0 z" fill="${i === 1 ? P.coral : P.bld3}"/>`).join('')
      + lamp(178, 88) + person(46, 118) + person(96, 121) + person(150, 117);
    S.artist_skip = sky + star(40, 18) + star(150, 24, .6)
      + b(-4, 30, 90, 78, P.bld2) + b(86, 44, 118, 64, P.bld3) + wins(92, 54, 100, 40, 3, 2, P.winDim, .6)
      + ground + lamp(160, 108)
      + person(52, 112) + `<path d="M64 116 h22" stroke="${P.teal}" stroke-width="1.5" stroke-dasharray="3 3"/>`
      + `<circle cx="152" cy="102" r="9" fill="${P.coral}" opacity=".25"/><circle cx="152" cy="102" r="3" fill="${P.coral}"/>`;
    S.artist_watch = sky + b(0, 24, 200, 66, P.bld1) + wins(8, 34, 184, 42, 6, 2)
      + ground + `<ellipse cx="100" cy="112" rx="30" ry="10" fill="${P.amber}" opacity=".18"/>`
      + `<rect x="96" y="86" width="8" height="20" fill="${P.amber}"/><path d="M100 70 q8 10 -2 16 q-8 -6 2 -16" fill="${P.coral}"/>`
      + person(72, 114) + person(84, 118) + person(118, 114) + person(130, 118) + person(100, 124);

    /* —— 维度2 开放性 —— */
    S.brick_neat = sky + b(0, 0, 200, 52, P.bld2) + wins(20, 12, 160, 28, 4, 1, P.winDim, .55) + ground
      + (() => { let s = ''; for (let r = 0; r < 5; r++) for (let i = 0; i < 9; i++) { const y = 56 + r * 11; const x = i * 24 + (r % 2 ? 12 : 0); s += `<rect x="${x}" y="${y}" width="22" height="9" rx="1" fill="${P.ground2}" opacity="${0.85 - r * 0.1}"/>`; } return s; })()
      + `<path d="M100 56 L60 140 M100 56 L140 140" stroke="${P.ground2}" stroke-width="2" opacity=".4"/>`;
    S.stone_rough = sky + b(0, 0, 200, 52, P.bld2) + ground
      + (() => { let s = ''; const stones = [[10, 60, 26, 16], [40, 62, 20, 13], [64, 58, 28, 18], [96, 62, 22, 12], [122, 58, 26, 17], [152, 61, 30, 14], [16, 80, 30, 15], [50, 78, 24, 18], [78, 82, 30, 13], [112, 79, 22, 17], [138, 81, 34, 15], [10, 99, 26, 14], [40, 100, 32, 13], [76, 98, 26, 15], [106, 100, 30, 13], [140, 99, 28, 15], [14, 118, 34, 14], [52, 117, 28, 14], [84, 119, 32, 13], [120, 118, 26, 15], [150, 120, 30, 12]];
        const cols = ['#a89070', '#b89a78', '#9c8460', '#a88c70'];
        stones.forEach((st, i) => { s += `<rect x="${st[0]}" y="${st[1]}" width="${st[2]}" height="${st[3]}" rx="${3 + (i % 3)}" transform="rotate(${(i % 5) - 2} ${st[0] + st[2] / 2} ${st[1] + st[3] / 2})" fill="${cols[i % 4]}"/>`; }); return s; })()
      + sparkle(170, 70, P.teal, .9);
    S.lane_straight = sky + star(100, 14, .9) + moon(100, 22, 6)
      + b(-6, 16, 96, 92, P.bld2) + b(112, 16, 94, 92, P.bld2)
      + wins(10, 30, 70, 60, 2, 4, P.winDim, .6) + wins(122, 30, 70, 60, 2, 4, P.winDim, .6)
      + ground + `<path d="M88 140 L100 108 L112 140 Z" fill="${P.ground2}"/>`
      + `<path d="M0 140 L88 140 M112 140 L200 140" stroke="${P.bld3}" stroke-width="2"/>`;
    S.lane_winding = sky + moon(30, 22, 7) + star(160, 16)
      + b(0, 20, 90, 88, P.bld2) + b(120, 34, 80, 74, P.bld3)
      + wins(10, 34, 66, 54, 2, 3, P.winDim, .6) + wins(130, 46, 58, 46, 2, 2, P.winDim, .55)
      + ground + `<path d="M100 140 C 80 118, 130 116, 108 100 C 96 90, 116 88, 112 74" stroke="${P.teal}" stroke-width="3" fill="none" stroke-dasharray="6 4"/>`
      + sparkle(112, 66, P.teal, 1.2) + sparkle(126, 82, P.coral, .8) + sparkle(98, 92, P.amber, .7);
    S.wall_clean = sky + b(0, 10, 200, 98, P.bld2) + ground
      + `<rect x="0" y="10" width="200" height="98" fill="${P.bld1}"/>`
      + `<rect x="0" y="30" width="200" height="2" fill="${P.bld3}"/><rect x="0" y="70" width="200" height="2" fill="${P.bld3}"/>`
      + win(92, 38, P.win) + `<rect x="86" y="34" width="19" height="24" fill="none" stroke="${P.bld3}" stroke-width="2"/>`
      + lamp(30, 108);

    /* —— 维度3 宜人性 —— */
    S.route_direct = sky + ground
      + (() => { let s = ''; for (let i = 0; i < 6; i++) s += `<rect x="0" y="${60 + i * 14}" width="200" height="4" fill="${P.bld2}" opacity=".8"/>`; return s; })()
      + `<circle cx="30" cy="122" r="6" fill="${P.teal}"/><circle cx="168" cy="64" r="6" fill="${P.coral}"/>`
      + `<path d="M36 118 L162 68" stroke="${P.amber}" stroke-width="3.5" stroke-linecap="round"/>`
      + `<path d="M162 68 l-7 -2 l3 7 z" fill="${P.amber}"/>`;
    S.route_scenic = sky + ground
      + (() => { let s = ''; for (let i = 0; i < 6; i++) s += `<rect x="0" y="${60 + i * 14}" width="200" height="4" fill="${P.bld2}" opacity=".8"/>`; return s; })()
      + `<circle cx="26" cy="122" r="6" fill="${P.teal}"/><circle cx="172" cy="70" r="6" fill="${P.coral}"/>`
      + `<path d="M32 120 C 70 128, 70 86, 100 92 C 130 98, 128 64, 166 72" stroke="${P.amber}" stroke-width="3.5" fill="none" stroke-linecap="round"/>`
      + sparkle(100, 88, P.coral, 1) + sparkle(70, 122, P.teal, .8) + sparkle(128, 96, P.amber, .8) + tree(58, 118, .8, '#2d5a3f') + tree(140, 112, .9, '#2d5a3f');
    S.fork_nav = sky + ground + `<rect y="104" width="200" height="36" fill="${P.ground2}"/>`
      + `<path d="M0 132 C 60 132, 80 118, 200 96" stroke="${P.bld2}" stroke-width="8" fill="none"/>`
      + `<path d="M0 132 C 60 132, 80 140, 200 136" stroke="${P.bld2}" stroke-width="8" fill="none"/>`
      + `<path d="M0 132 C 60 132, 80 118, 200 96" stroke="${P.teal}" stroke-width="3" fill="none" stroke-dasharray="7 4"/>`
      + `<path d="M148 102 c0 -7 5 -11 10 -11 c5 0 10 4 10 11 c0 8 -10 16 -10 16 c0 0 -10 -8 -10 -16 z" fill="${P.teal}"/><circle cx="158" cy="102" r="3.4" fill="${P.ground}"/>`;
    S.fork_curious = sky + moon(24, 22, 6) + ground + `<rect y="104" width="200" height="36" fill="${P.ground2}"/>`
      + `<path d="M0 132 C 60 132, 80 118, 200 96" stroke="${P.bld2}" stroke-width="8" fill="none"/>`
      + `<path d="M0 132 C 60 132, 80 140, 200 136" stroke="${P.bld2}" stroke-width="8" fill="none"/>`
      + `<path d="M0 132 C 60 132, 80 140, 200 136" stroke="${P.coral}" stroke-width="3" fill="none" stroke-dasharray="2 6" stroke-linecap="round"/>`
      + tree(176, 122, 1.1, '#2d5a3f') + tree(188, 130, .8, '#2d5a3f') + sparkle(158, 128, P.coral, 1.1);
    S.mall_chain = sky + b(0, 20, 200, 82, P.bld3)
      + [0, 1, 2, 3].map(i => `<rect x="${12 + i * 47}" y="42" width="36" height="26" rx="2" fill="${P.win}" opacity=".85"/><rect x="${12 + i * 47}" y="74" width="36" height="7" fill="${P.coral}" opacity=".7"/>`).join('')
      + `<rect x="0" y="86" width="200" height="16" fill="${P.bld2}"/>` + ground
      + person(60, 120) + person(120, 118) + person(150, 122);
    S.street_indie = sky + b(0, 34, 46, 64, P.bld1) + b(48, 24, 42, 74, P.bld3) + b(92, 40, 50, 58, P.bld1) + b(144, 30, 56, 68, P.bld3)
      + `<path d="M6 34 l16 -10 l16 10 z" fill="${P.teal}"/><path d="M52 24 l17 -10 l17 10 z" fill="${P.coral}"/><path d="M97 40 l19 -10 l19 10 z" fill="${P.amber}"/><path d="M150 30 l21 -10 l21 10 z" fill="${P.teal}"/>`
      + win(16, 46) + win(60, 38, P.coral) + win(112, 52, P.amber) + win(164, 44, P.teal)
      + ground + lamp(130, 108) + tree(12, 122, .8) + person(90, 120);

    /* —— 维度4 尽责性 —— */
    S.plan_free = sky + moon(30, 22, 7) + ground + `<rect y="104" width="200" height="36" fill="${P.ground2}"/>`
      + `<path d="M10 130 C 50 112, 60 136, 100 118 C 140 100, 150 132, 190 108" stroke="${P.teal}" stroke-width="2.5" fill="none" stroke-dasharray="1 7" stroke-linecap="round"/>`
      + [0, 1, 2].map(i => `<ellipse cx="${44 + i * 46}" cy="${130 - i * 8}" rx="4" ry="6" fill="none" stroke="${P.teal}" stroke-width="1.2" opacity=".8"/>`).join('')
      + tree(170, 126, .9) + sparkle(120, 96, P.amber, .8);
    S.plan_map = sky + ground
      + `<rect x="20" y="20" width="160" height="96" rx="6" fill="${P.bld2}" stroke="${P.bld3}" stroke-width="2"/>`
      + `<rect x="30" y="30" width="140" height="76" fill="${P.bld1}"/>`
      + (() => { let s = ''; for (let i = 0; i < 4; i++) s += `<path d="M34 ${38 + i * 18} q40 ${i % 2 ? 8 : -8} 132 0" stroke="${P.ground2}" stroke-width="3" fill="none"/>`; return s; })()
      + `<path d="M44 96 C 80 90, 90 50, 156 44" stroke="${P.coral}" stroke-width="2.5" fill="none" stroke-dasharray="5 3"/>`
      + `<circle cx="44" cy="96" r="4" fill="${P.teal}"/><circle cx="100" cy="68" r="3.4" fill="${P.amber}"/><circle cx="156" cy="44" r="4" fill="${P.coral}"/>`
      + sparkle(176, 28, P.teal, .9);
    S.rain_walk = sky + b(0, 26, 200, 66, P.bld2) + wins(14, 38, 170, 40, 5, 2, P.winDim, .65) + ground
      + (() => { let s = ''; for (let i = 0; i < 16; i++) s += `<path d="M${10 + i * 13} ${34 + (i % 3) * 8} l-3 10" stroke="${P.teal}" stroke-width="1.1" opacity=".75"/>`; return s; })()
      + `<ellipse cx="100" cy="126" rx="26" ry="5" fill="${P.ground2}"/>`
      + `<path d="M88 96 a12 12 0 0 1 24 0 z" fill="${P.coral}"/><rect x="87" y="96" width="26" height="2.5" fill="${P.coral}"/>`
      + person(100, 112, P.ink);
    S.rain_indoor = sky + b(0, 0, 200, 140, P.bld2)
      + `<rect x="34" y="18" width="132" height="92" rx="4" fill="${P.bld1}" stroke="${P.bld3}" stroke-width="4"/>`
      + (() => { let s = ''; for (let i = 0; i < 10; i++) s += `<path d="M${46 + i * 12} ${28 + (i % 4) * 6} l-2 8" stroke="${P.teal}" stroke-width="1" opacity=".7"/>`; return s; })()
      + `<line x1="100" y1="18" x2="100" y2="110" stroke="${P.bld3}" stroke-width="3"/><line x1="34" y1="64" x2="166" y2="64" stroke="${P.bld3}" stroke-width="3"/>`
      + `<rect x="118" y="118" width="8" height="5" fill="${P.win}"/><path d="M122 118 v-6" stroke="${P.bld2}" stroke-width="1.5"/>`
      + `<circle cx="122" cy="112" r="7" fill="${P.win}" opacity=".25"/>`;
    S.check_casual = sky + moon(36, 20, 7) + star(150, 16) + b(0, 30, 70, 78, P.bld2) + wins(10, 42, 50, 44, 2, 2, P.winDim, .65) + ground
      + tree(160, 122, 1.1, '#2d5a3f') + tree(186, 130, .7, '#2d5a3f') + lamp(96, 108)
      + person(120, 118) + sparkle(84, 84, P.amber, .8) + sparkle(140, 90, P.teal, .7);

    /* —— 维度5 敏感性（对外仅称 稳静派/敏感派） —— */
    S.dark_calm = sky + star(150, 18, .7) + moon(40, 24, 6)
      + b(-6, 14, 84, 94, P.bld2) + b(118, 8, 88, 100, P.bld1)
      + wins(8, 26, 60, 40, 2, 2, P.winDim, .5) + wins(130, 20, 62, 40, 2, 2, P.winDim, .45)
      + ground + `<path d="M78 140 L100 108 L122 140 Z" fill="${P.ground2}"/>`
      + person(100, 116, '#8a6850') + lamp(88, 108)
      + `<path d="M96 40 q4 -5 8 0" stroke="${P.teal}" stroke-width="1" fill="none" opacity=".5"/>`;
    S.dark_tense = sky + b(-6, 14, 84, 94, P.bld3) + b(118, 8, 88, 100, P.bld2)
      + wins(8, 26, 60, 40, 2, 2, P.winDim, .35) + wins(130, 20, 62, 40, 2, 2, P.winDim, .3)
      + ground
      + `<path d="M0 14 L84 14 L118 108 L0 108 Z" fill="#000" opacity=".25"/>`
      + `<path d="M200 8 L118 8 L118 108 L200 108 Z" fill="#000" opacity=".3"/>`
      + `<path d="M100 108 L92 84 L108 84 Z" fill="${P.ground2}"/><path d="M96 84 l4 -10 l4 10" fill="${P.ground2}"/>`
      + person(76, 118, '#6a5040') + `<path d="M64 100 l8 -8 M64 92 l8 8" stroke="${P.coral}" stroke-width="1.6" opacity=".8"/>`;
    S.crowd_ok = sky + b(0, 22, 200, 62, P.bld2) + wins(10, 32, 180, 36, 5, 2, P.winDim, .65) + ground
      + [0, 1, 2, 3, 4, 5, 6].map(i => person(24 + i * 26, 112 + (i % 2) * 8, i % 2 ? '#6a5040' : P.ink)).join('')
      + `<path d="M20 140 C 60 132, 140 132, 180 140" stroke="${P.teal}" stroke-width="1.6" stroke-dasharray="4 4" opacity=".7"/>`;
    S.crowd_bad = sky + b(0, 22, 200, 62, P.bld2) + ground
      + (() => { let s = ''; for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) s += person(30 + i * 30, 106 + j * 12, j === 1 ? P.ground : '#5a4030'); return s; })()
      + `<path d="M150 96 l0 -14 M150 82 l-5 6 M150 82 l5 6 M150 88 l-5 6 M150 88 l5 6" stroke="${P.coral}" stroke-width="2" stroke-linecap="round"/>`
      + `<path d="M20 96 l6 -6 M26 96 l-6 -6" stroke="${P.coral}" stroke-width="1.6"/>`;
    S.light_bright = sky
      + `<circle cx="100" cy="46" r="26" fill="${P.win}" opacity=".25"/><circle cx="100" cy="46" r="14" fill="${P.win}" opacity=".65"/>`
      + ground + `<path d="M60 108 L140 108 L120 140 L80 140 Z" fill="${P.win}" opacity=".22"/>`
      + b(0, 54, 40, 54, P.bld3) + b(160, 54, 40, 54, P.bld3)
      + person(100, 118) + lamp(70, 108) + lamp(130, 108);
    S.light_shadow = sky + star(160, 16, .6)
      + b(-6, 10, 106, 98, P.bld2) + b(100, 26, 106, 82, P.bld3)
      + wins(8, 24, 76, 50, 2, 3, P.winDim, .6)
      + ground
      + `<path d="M0 10 L100 10 L40 140 L0 140 Z" fill="#000" opacity=".2"/>`
      + `<rect x="100" y="10" width="12" height="98" fill="${P.bld2}"/>`
      + `<circle cx="150" cy="70" r="12" fill="${P.win}" opacity=".7"/><circle cx="150" cy="70" r="24" fill="${P.win}" opacity=".2"/>`
      + person(126, 118, '#6a5040')
      + sparkle(66, 44, P.teal, .7);

    return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" role="img">${(S[key] || sky + ground)}</svg>`;
  }

  /* ============================================================
     10 道场景二选一：五个空间人格维度各 2 题
     保留最贴近真实 Citywalk 选择、且画面差异最直观的题目
     ============================================================ */
  const QUIZ = [
    { dim: 'E', q: '周末午后，你更向往哪种漫步氛围？', a: { key: 'alley_quiet', cap: '安静的小巷', sheet: 1, x: 1, y: 15.5 }, b: { key: 'street_busy', cap: '热闹的街区', sheet: 1, x: 25.4, y: 15.5 } },
    { dim: 'E', q: '路过一家咖啡馆，你会选择？', a: { key: 'cafe_courtyard', cap: '院子深处', sheet: 1, x: 74.3, y: 15.5 }, b: { key: 'cafe_street', cap: '临街外摆', sheet: 1, x: 49.9, y: 15.5 } },
    { dim: 'O', q: '走进一条巷子，你希望？', a: { key: 'lane_straight', cap: '一眼到头', sheet: 1, x: 98.8, y: 15.5 }, b: { key: 'lane_winding', cap: '转角有惊喜', sheet: 1, x: 1, y: 76 } },
    { dim: 'O', q: '你如何看待墙上的涂鸦？', a: { key: 'wall_clean', cap: '干净墙面', sheet: 1, x: 25.4, y: 76 }, b: { key: 'wall_graffiti', cap: '城市的表情', sheet: 1, x: 49.9, y: 76 } },
    { dim: 'A', q: '选择漫步路线，你最在意？', a: { key: 'route_direct', cap: '最快到达', sheet: 2, x: 1, y: 15.5 }, b: { key: 'route_scenic', cap: '风景优先', sheet: 2, x: 25.4, y: 15.5 } },
    { dim: 'A', q: '你更喜欢哪类商业街？', a: { key: 'mall_chain', cap: '品牌连锁', sheet: 1, x: 74.3, y: 76 }, b: { key: 'street_indie', cap: '独立小店', sheet: 1, x: 98.8, y: 76 } },
    { dim: 'C', q: '出发前，你会做路线规划吗？', a: { key: 'plan_free', cap: '走到哪算哪', sheet: 2, x: 49.9, y: 15.5 }, b: { key: 'plan_map', cap: '提前规划', sheet: 2, x: 74.3, y: 15.5 } },
    { dim: 'C', q: '你对"打卡"的态度是？', a: { key: 'check_casual', cap: '随遇而安', sheet: 2, x: 98.8, y: 15.5 }, b: { key: 'check_list', cap: '按攻略打卡', sheet: 2, x: 1, y: 76 } },
    { dim: 'N', q: '走进一条较暗的窄巷，你会？', a: { key: 'dark_calm', cap: '没什么感觉', sheet: 2, x: 25.4, y: 76 }, b: { key: 'dark_tense', cap: '想快点出去', sheet: 2, x: 49.9, y: 76 } },
    { dim: 'N', q: '周围人很多、很拥挤时，你？', a: { key: 'crowd_ok', cap: '可以适应', sheet: 2, x: 98.8, y: 76 }, b: { key: 'crowd_bad', cap: '容易烦躁', sheet: 2, x: 74.3, y: 76 } },
  ];

  /* ---------- 五维派系（对外永不出现学术维度名） ---------- */
  const DIMS5 = {
    E: { left: '隐逸派', right: '活力派' },
    O: { left: '实景派', right: '意象派' },
    A: { left: '功能派', right: '情怀派' },
    C: { left: '随兴派', right: '计划派' },
    N: { left: '稳静派', right: '敏感派' },
  };
  const POLE = {
    E_L: { label: '隐逸派', scene: '深巷', act: '听风', suffix: '人', desc: '偏爱安静角落，人少的地方让你自在' },
    E_R: { label: '活力派', scene: '长街', act: '追光', suffix: '者', desc: '喜欢有烟火气的热闹场子，人多反而来劲' },
    O_L: { label: '实景派', scene: '大街', act: '读城', suffix: '人', desc: '喜欢确定与秩序，清晰的路网让你安心' },
    O_R: { label: '意象派', scene: '转角', act: '寻梦', suffix: '人', desc: '迷恋转角与未知，城市的新鲜感是你的燃料' },
    A_L: { label: '功能派', scene: '捷径', act: '赴约', suffix: '人', desc: '效率优先，直达目标最舒服' },
    A_R: { label: '情怀派', scene: '旧里', act: '拾遗', suffix: '客', desc: '为氛围与故事驻足，一家小店的历史你能听一下午' },
    C_L: { label: '随兴派', scene: '风里', act: '浪游', suffix: '客', desc: '随性出发，走到哪算哪才是漫步' },
    C_R: { label: '计划派', scene: '图上', act: '掌线', suffix: '者', desc: '习惯规划，路线在手心里有底' },
    N_L: { label: '稳静派', scene: '晴野', act: '沐晴', suffix: '人', desc: '处变不惊，暗巷与人潮都动摇不了你的节奏' },
    N_R: { label: '敏感派', scene: '灯下', act: '听雨', suffix: '人', desc: '对光线与拥挤很敏锐，环境需要对你温柔一点' },
  };

  /* ---------- 计分 → 人格 ---------- */
  function buildPersona(answers) {
    // answers: 长度10的 'a'/'b' 数组，与 QUIZ 一一对应；选 b 计 1 分
    const score = { E: 0, O: 0, A: 0, C: 0, N: 0 }, cnt = { E: 0, O: 0, A: 0, C: 0, N: 0 };
    QUIZ.forEach((q, i) => { score[q.dim] += answers[i] === 'b' ? 1 : 0; cnt[q.dim]++; });
    const norm = {}, poles = {}, strength = [];
    Object.keys(DIMS5).forEach((k, i) => {
      norm[k] = score[k] / cnt[k];
      const isRight = norm[k] > 0.5;
      poles[k] = isRight ? DIMS5[k].right : DIMS5[k].left;
      strength.push({ dim: k, s: Math.abs(norm[k] - 0.5) * 2 + (4 - i) * 0.001, norm: norm[k] });
    });
    strength.sort((x, y) => y.s - x.s);
    const mainK = strength[0], subK = strength[1];
    const main = POLE[mainK.dim + (mainK.norm > 0.5 ? '_R' : '_L')];
    const sub = POLE[subK.dim + (subK.norm > 0.5 ? '_R' : '_L')];
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
    const nickname = `${SECOND_MODIFIER[subK.dim + (subK.norm > 0.5 ? '_R' : '_L')]}${MAIN_IDENTITY[mainK.dim + (mainK.norm > 0.5 ? '_R' : '_L')]}`;
    // 五维 → 八维稳定基线
    const E = norm.E, O = norm.O, A = norm.A, C = norm.C, N = norm.N;
    const base8D = {
      safety: clamp(2.2 + 1.8 * N + 0.3 * C, 1, 5),
      vitality: clamp(1.6 + 2.2 * E, 1, 5),
      wealth: clamp(2.6 + 0.6 * C - 0.4 * A, 1, 5),
      beauty: clamp(1.8 + 2.0 * O + 0.4 * A, 1, 5),
      boredom: clamp(3.6 - 1.6 * O - 0.4 * E, 1, 5),
      depression: clamp(3.4 - 1.2 * N, 1, 5),
      humanity: clamp(1.8 + 1.8 * A + 0.4 * O, 1, 5),
      social: clamp(1.6 + 2.2 * E, 1, 5),
    };

    const blurb = `你是「${nickname}」——${main.label}型的漫游者：${main.desc}。` +
      `同时带着${sub.label}的气质：${sub.desc}。`;

    return {
      nickname, main, sub, poles, score, norm, base8D, blurb,
      poleList: Object.keys(DIMS5).map(k => ({ dim: k, label: poles[k], strong: Math.abs(norm[k] - 0.5) * 2 > 0.6 })),
    };
  }

  /* ---------- 心情解析（关键词 → 八维 + 情境约束） ---------- */
  const MOOD_RULES = [
    { keys: ['累', '疲惫', '疲倦', '乏', '困', '心力'], adj: { safety: .6, vitality: -1.0, depression: -.8, comfortUp: 0 }, note: '疲惫 → 想被空间温柔接住' },
    { keys: ['开心', '高兴', '兴奋', '心情好', '快乐', '爽'], adj: { vitality: 1.0, social: .8, boredom: -.8 }, note: '好心情 → 想要热闹与烟火气' },
    { keys: ['烦', '烦躁', '焦虑', '压力', '烦心', 'emo', '难过', '伤心', '低落'], adj: { depression: -1.0, vitality: -.6, safety: .5 }, note: '心烦 → 想躲开喧闹，去开阔的地方透口气' },
    { keys: ['安静', '静一静', '独处', '一个人呆', '想静静'], adj: { social: -1.2, vitality: -.6, depression: -.4 }, note: '想安静 → 社交调低，独处友好' },
    { keys: ['热闹', '人多', '烟火气', '人气'], adj: { social: 1.0, vitality: .8 }, note: '想热闹 → 社交与活力拉满' },
    { keys: ['老房子', '老街', '古建', '历史', '老城', '旧居', '巷子'], adj: { humanity: 1.2, beauty: .6, boredom: -.6 }, note: '老房子 → 人文与岁月感加分' },
    { keys: ['树', '绿', '公园', '植物', '草地', '河边', '水'], adj: { depression: -.8, beauty: .8, vitality: .2 }, note: '自然绿意 → 舒缓与疗愈' },
    { keys: ['拍照', '出片', '照片', '打卡'], adj: { beauty: 1.0, wealth: .3 }, note: '想拍照 → 高颜值场景优先' },
    { keys: ['下雨', '雨'], adj: { safety: .4, depression: -.3, comfort: 0 }, note: '有雨 → 备好室内与檐下节点' },
    { keys: ['冷', '热', '晒'], adj: { safety: .3 }, note: '天气在意 → 室内节点加权' },
    { keys: ['咖啡', '奶茶', '喝点什么', '喝点', '茶'], adj: { wealth: .5, social: .3, safety: .2 }, note: '想喝点什么 → 途中安排可停留的铺面' },
    { keys: ['吃饭', '吃点', '小吃', '觅食', '正餐', '想吃'], adj: { wealth: .5, vitality: .3 }, note: '想吃饭 → 觅食节点加权' },
    { keys: ['鞋不好', '高跟鞋', '脚疼', '脚累', '鞋磨脚', '不好走'], adj: { safety: .4, vitality: -.5 }, note: '鞋子不好走 → 缩短路线，路面友好优先' },
    { keys: ['东西重', '拿着重', '背着重', '拎着', '有点重', '太重'], adj: { safety: .4, vitality: -.6, boredom: .3 }, note: '负重 → 减少绕路，尽快安排可歇脚的点' },
  ];
  const PEOPLE_RULES = [
    { keys: ['一个人', '独自', '自己', ' solo', '独行'], v: 'solo', label: '独行' },
    { keys: ['朋友', '闺蜜', '哥们', '同学'], v: 'friends', label: '与朋友' },
    { keys: ['对象', '男朋友', '女朋友', '恋人', '情侣', '另一半'], v: 'couple', label: '与对象' },
    { keys: ['家人', '爸妈', '父母', '孩子', '带娃'], v: 'family', label: '与家人' },
  ];
  const TIME_RULES = [
    { keys: ['早上', '上午', '清晨', '早起'], v: 'morning', label: '上午' },
    { keys: ['中午', '正午'], v: 'noon', label: '正午' },
    { keys: ['下午', '午后'], v: 'afternoon', label: '下午' },
    { keys: ['傍晚', '黄昏', '夕阳', '日落'], v: 'evening', label: '傍晚' },
    { keys: ['晚上', '夜里', '夜晚', '夜宵'], v: 'night', label: '夜晚' },
  ];
  const DUR_RULES = [
    { keys: ['一小时', '1小时', '半小时', '随便走走', '一小会'], v: 'short', label: '约 1 小时' },
    { keys: ['两三个小时', '2-3小时', '两三小时', '三小时', '3小时', '半天', '大半天'], v: 'medium', label: '约 2-3 小时' },
    { keys: ['想走久一点', '走久一点', '多走一会', '一天', '整天', '全天'], v: 'long', label: '大半天以上' },
  ];

  function kwHit(t, k) {
    // 1 = 正向命中, -1 = 被否定（不想热闹）, 0 = 未命中
    let res = 0, i = t.indexOf(k);
    while (i !== -1) {
      const pre = t.slice(Math.max(0, i - 3), i);
      if (!/不|别|讨厌|远离|抗拒|拒绝|嫌/.test(pre)) return 1;
      res = -1;
      i = t.indexOf(k, i + 1);
    }
    return res;
  }

  function parseMood(text) {
    const t = text || '';
    const mood8D = {}; DIMS.forEach(d => mood8D[d.key] = 3);
    const adj = [];
    MOOD_RULES.forEach(r => {
      const hits = r.keys.map(k => kwHit(t, k));
      if (hits.includes(1)) {
        adj.push(r);
        Object.entries(r.adj).forEach(([k, v]) => { if (mood8D[k] !== undefined) mood8D[k] = clamp(mood8D[k] + v, 1, 5); });
      } else if (hits.includes(-1)) {
        // 反向命中：如"不想热闹"→ 轻度调低社交与活力
        adj.push({ ...r, note: r.note.replace('→', '（反向）→') });
        Object.entries(r.adj).forEach(([k, v]) => { if (mood8D[k] !== undefined) mood8D[k] = clamp(mood8D[k] - v * 0.7, 1, 5); });
      }
    });
    const find = rules => rules.find(r => r.keys.some(k => t.includes(k)));
    const people = find(PEOPLE_RULES), time = find(TIME_RULES), dur = find(DUR_RULES);
    if (people && people.v === 'solo') mood8D.social = clamp(mood8D.social - 0.8, 1, 5);
    if (people && people.v !== 'solo') mood8D.social = clamp(mood8D.social + 0.6, 1, 5);
    return {
      mood8D, adj,
      constraints: {
        people: people ? people.v : null, peopleLabel: people ? people.label : null,
        time: time ? time.v : null, timeLabel: time ? time.label : null,
        duration: dur ? dur.v : null, durationLabel: dur ? dur.label : null,
      },
    };
  }

  /* ---------- 融合 / 匹配 / 路线 ---------- */
  function fuse(base, mood) {
    const o = {};
    DIMS.forEach(d => {
      const explicit = Math.abs(mood[d.key] - 3) > 0.05;
      const w = explicit ? 0.6 : 0.4;
      o[d.key] = clamp(w * mood[d.key] + (1 - w) * base[d.key], 1, 5);
    });
    return o;
  }

  function matchScore(node, demand, challenge, base, heatScale) {
    let num = 0, den = 0;
    DIMS.forEach(d => {
      const w = Math.abs(demand[d.key] - 3) + 0.25;
      const m = 1 - Math.abs(demand[d.key] - node.profile[d.key]) / 4;
      num += w * Math.max(0, m); den += w;
    });
    const sim = num / den;
    const pen = node.heat * (challenge ? 0.06 : 0.15) * (heatScale || 1);
    let bonus = 0;
    if (challenge && base) {
      let n1 = 0, n2 = 0;
      DIMS.forEach(d => {
        const w = Math.abs(base[d.key] - 3) + 0.25;
        const m = 1 - Math.abs(base[d.key] - node.profile[d.key]) / 4;
        n1 += w * Math.max(0, m); n2 += w;
      });
      bonus = (1 - n1 / n2) * 0.18 * sim;
    }
    return clamp(sim - pen + bonus, 0, 1);
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const dominantDim = n => DIMS.reduce((best, d) => n.profile[d.key] > n.profile[best.key] ? d : best, DIMS[0]).key;
  function orderWalkStops(selected, start) {
    if (selected.length < 3 || selected.length > 8) return selected;
    let best = selected, bestLength = Infinity;
    const visit = (remaining, path, length) => {
      if (!remaining.length) {
        if (length < bestLength) { bestLength = length; best = path; }
        return;
      }
      if (length >= bestLength) return;
      remaining.forEach((item, index) => {
        const from = path.length ? path[path.length - 1].n : start;
        const nextRemaining = remaining.slice(0, index).concat(remaining.slice(index + 1));
        visit(nextRemaining, path.concat(item), length + dist(from, item.n));
      });
    };
    visit(selected, [], 0);
    return best;
  }

  // opts: { duration, startNode(从当前所在节点续排), exclude(已走过节点id), stopsN(指定站数), heatScale(临时避人流) }
  function genRoute(demand, challenge, base, duration, opts) {
    opts = opts || {};
    const stops = opts.stopsN || (challenge ? 7 : duration === 'short' ? 3 : duration === 'long' ? 7 : 5);
    const heatScale = opts.heatScale || 1;
    const scored = SPACE_NODES
      .filter(n => !(opts.exclude || []).includes(n.id))
      .map(n => ({ n, s: matchScore(n, demand, challenge, base, heatScale) })).sort((a, b) => b.s - a.s);
    const eligible = scored.filter(item => item.s >= .6);
    const candidatePool = (eligible.length ? eligible : scored).slice(0, 15);
    const used = new Set();
    let cur = opts.startNode || { x: 100, y: 200 }; // 默认起点：老门东牌坊
    const selected = [];
    for (let i = 0; i < stops; i++) {
      const cands = candidatePool.filter(x => !used.has(x.n.id) && dist(cur, x.n) <= 720);
      if (!cands.length) break;
      let best = null, bestScore = -1;
      cands.forEach(x => {
        const d = dist(cur, x.n);
        const distPen = d / 720 * 0.12;
        const recent = selected.slice(-2).map(s => dominantDim(s.n));
        const repPen = recent.includes(dominantDim(x.n)) ? 0.06 : 0;
        const sc = x.s - distPen - repPen;
        if (sc > bestScore) { bestScore = sc; best = x; }
      });
      if (!best) break;
      selected.push(best); used.add(best.n.id); cur = best.n;
    }
    const routeStart = opts.startNode || { x: 100, y: 200 };
    const ordered = orderWalkStops(selected, routeStart);
    const startPt = opts.startNode ? [opts.startNode] : [];
    const chain = startPt.concat(ordered.map(s => s.n));
    const km = chain.length > 1
      ? (chain.reduce((acc, n, i) => i ? acc + dist(chain[i - 1], n) : 0, 0) / 600 * 1.35).toFixed(1)
      : '0.5';
    const mins = Math.round(selected.length * 9 + parseFloat(km) * 12);
    return { stops: ordered, km, mins };
  }

  /* ---------- 跳过测试时的中性人格 ---------- */
  function buildNeutralPersona() {
    const poles = { E: '隐逸派', O: '意象派', A: '情怀派', C: '随兴派', N: '稳静派' };
    const base8D = {};
    DIMS.forEach(d => base8D[d.key] = 3);
    return {
      nickname: '自在漫游客', main: POLE.E_L, sub: POLE.A_R, poles,
      score: null, norm: { E: .5, O: .5, A: .5, C: .5, N: .5 }, base8D,
      blurb: '你选择跳过测试——没关系，我们边走边认识你。聊聊今天的心情，一样能为你找到合适的路线；走得多了，你的空间人格会慢慢清晰。',
      neutral: true,
      poleList: [{ dim: 'E', label: '待了解' }],
    };
  }

  return {
    DIMS, SPACE_NODES, QUIZ, DIMS5, POLE, sceneSVG,
    buildPersona, buildNeutralPersona, parseMood, fuse, matchScore, genRoute, dominantDim, clamp, dist,
  };
})();
