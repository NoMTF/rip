/**
 * 那些秋叶 — Those Autumn Leaves
 * 一座为已逝跨性别姐妹而建的赛博墓碑
 *
 * 致敬 https://www.one-among.us/ — 愿被记住的人，永不被忘记。
 *
 * 部署：
 *   npm install
 *   npm run dev      # 本地预览
 *   npm run deploy   # 推送至 Cloudflare Workers
 */

// ─────────────────────────────────────────────────────────────────────────────
// 悼念数据（示例 / Template Entries）
// 部署时请替换为经家属或本人生前同意的真实条目。
// 命名借自诗词意象，仅作模板示意，并非指代任何具体个人。
// ─────────────────────────────────────────────────────────────────────────────
const MEMORIALS = [
  {
    id: 'autumn-01',
    name: '林秋',
    nameEn: 'Lin Qiu',
    pronouns: 'she / her / 她',
    birth: '1995-04-12',
    departure: '2019-11-08',
    age: 24,
    location: '上海',
    epitaph: '愿你在彼岸做最真实的自己',
    epitaphEn: 'May you be your truest self on the other shore.',
    bio: '她爱画水彩，爱在雨夜听老唱片。她说她想成为一个温柔的人，后来她真的做到了。她离开时，窗外的桂花刚刚谢去。',
    bioEn: 'She loved watercolours and old records on rainy nights. She wished to become someone gentle — and so she did. When she left, the osmanthus was just beginning to fall.',
    tags: ['画家', '诗人']
  },
  {
    id: 'autumn-02',
    name: '沈月',
    nameEn: 'Shen Yue',
    pronouns: 'she / her / 她',
    birth: '1992-07-20',
    departure: '2021-03-14',
    age: 28,
    location: '成都',
    epitaph: '愿你不再害怕镜中的自己',
    epitaphEn: 'May you no longer fear the face in the mirror.',
    bio: '她在二十八岁那年第一次穿上裙子，照片里她笑得像孩子。她说镜子里那个人，她终于认识了。',
    bioEn: 'At twenty-eight, she wore a dress for the first time, and laughed in the photograph like a child. The person in the mirror — she said — was finally someone she knew.',
    tags: ['程序员', '猫奴']
  },
  {
    id: 'autumn-03',
    name: '苏雪',
    nameEn: 'Su Xue',
    pronouns: 'she / her / 她',
    birth: '1998-12-25',
    departure: '2022-08-30',
    age: 23,
    location: '北京',
    epitaph: '你是冬日里融化的第一片雪',
    epitaphEn: 'You were the first snow to melt into winter.',
    bio: '她说自己像一片错落人间的雪，在阳光下化为水，渗入土地，长出春天。她留下的最后一句话是："请别为我难过。"',
    bioEn: 'She said she was a snowflake that fell out of place — melting into water, into soil, into the spring. Her last words were: "Please do not grieve for me."',
    tags: ['学生', '钢琴']
  },
  {
    id: 'autumn-04',
    name: '顾星',
    nameEn: 'Gu Xing',
    pronouns: 'she / her / 她',
    birth: '1989-02-03',
    departure: '2020-06-21',
    age: 31,
    location: '广州',
    epitaph: '回望时，星辰仍在',
    epitaphEn: 'Look back — the stars are still there.',
    bio: '她做了十年程序员，最后两年开始写诗。她写道："我们这一代人，是替后来者扛过黑夜的人。"',
    bioEn: 'Ten years a programmer, two years a poet. She wrote: "Our generation is the one that carries the night, so the next may walk in dawn."',
    tags: ['工程师', '写作者']
  },
  {
    id: 'autumn-05',
    name: '程岚',
    nameEn: 'Cheng Lan',
    pronouns: 'she / her / 她',
    birth: '1996-09-17',
    departure: '2023-02-11',
    age: 26,
    location: '杭州',
    epitaph: '远山如黛，请你记得',
    epitaphEn: 'The far mountains remember you in mist.',
    bio: '她爱徒步，爱独自去高原。她说山顶的风让她觉得自由，无关性别，只关乎活着本身。',
    bioEn: 'She loved hiking, loved going alone to the high plateaus. The wind on the summit, she said, felt like freedom — beyond gender, only the bare fact of being alive.',
    tags: ['登山者', '摄影']
  },
  {
    id: 'autumn-06',
    name: '江南',
    nameEn: 'Jiang Nan',
    pronouns: 'she / her / 她',
    birth: '1993-05-04',
    departure: '2018-10-25',
    age: 25,
    location: '南京',
    epitaph: '春水未老，江南未远',
    epitaphEn: 'The spring waters have not aged; the south is not far.',
    bio: '她是音乐学院的学生，主修古琴。她说古琴的音色让她想起雨打芭蕉，想起温柔的母亲，想起从未到来过的某种平静。',
    bioEn: 'A guqin student at the conservatory. The strings, she said, sounded like rain on banana leaves, like a gentle mother, like a peace that had never quite arrived.',
    tags: ['音乐人', '古琴']
  }
];

// ─────────────────────────────────────────────────────────────────────────────
// 路由
// ─────────────────────────────────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API：所有悼念数据
    if (path === '/api/memorials') {
      return json(MEMORIALS);
    }

    // API：单个悼念
    const matchOne = path.match(/^\/api\/memorials\/([\w-]+)$/);
    if (matchOne) {
      const m = MEMORIALS.find(x => x.id === matchOne[1]);
      return m ? json(m) : json({ error: 'not_found' }, 404);
    }

    // 单人详情页
    const matchPage = path.match(/^\/memorial\/([\w-]+)$/);
    if (matchPage) {
      const m = MEMORIALS.find(x => x.id === matchPage[1]);
      if (!m) return notFound();
      return html(renderDetailPage(m));
    }

    // 首页
    if (path === '/' || path === '/index.html') {
      return html(renderHomePage());
    }

    return notFound();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 响应辅助
// ─────────────────────────────────────────────────────────────────────────────
function html(body) {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}
function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}
function notFound() {
  return html(renderNotFound());
}

// ─────────────────────────────────────────────────────────────────────────────
// 页面：通用骨架
// ─────────────────────────────────────────────────────────────────────────────
function shell({ title, description, content, ogImage }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#0a0e1a">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
<title>${escapeHtml(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Noto+Serif+SC:wght@300;400;500;700&display=swap">
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(faviconSvg())}">
<style>${baseStyles()}</style>
</head>
<body>
<canvas id="leaves" aria-hidden="true"></canvas>
<div class="vignette" aria-hidden="true"></div>
<div class="flag-ribbon" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
${content}
<script>${baseScripts()}</script>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 首页
// ─────────────────────────────────────────────────────────────────────────────
function renderHomePage() {
  const cards = MEMORIALS.map((m, i) => `
    <a class="memorial-card reveal" style="--i:${i}" href="/memorial/${m.id}" data-id="${m.id}">
      <div class="card-photo" aria-hidden="true">
        <div class="photo-frame">
          <div class="photo-initial">${escapeHtml(m.name[0])}</div>
          <div class="photo-mist"></div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-name">
          <span class="name-zh">${escapeHtml(m.name)}</span>
          <span class="name-en">${escapeHtml(m.nameEn)}</span>
        </div>
        <div class="card-dates">
          <time>${formatDate(m.birth)}</time>
          <span class="dash">—</span>
          <time>${formatDate(m.departure)}</time>
        </div>
        <p class="card-epitaph">${escapeHtml(m.epitaph)}</p>
        <p class="card-epitaph-en">${escapeHtml(m.epitaphEn)}</p>
        <div class="card-tags">${m.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>
      </div>
      <div class="card-glow" aria-hidden="true"></div>
    </a>`).join('');

  const content = `
<header class="hero">
  <div class="hero-inner">
    <div class="hero-mark reveal" aria-hidden="true">
      ${transFlagSvg(48)}
    </div>
    <h1 class="hero-title">
      <span class="reveal" style="--i:1">那</span><span class="reveal" style="--i:2">些</span><span class="reveal" style="--i:3">秋</span><span class="reveal" style="--i:4">叶</span>
    </h1>
    <p class="hero-sub reveal" style="--i:5">Those Autumn Leaves</p>
    <p class="hero-tag reveal" style="--i:6">— 一座为已逝跨性别姐妹而建的赛博墓碑 —</p>
    <p class="hero-poem reveal" style="--i:7">
      她们曾来过，曾活过，曾成为自己。<br>
      <em>They were here. They were alive. They became themselves.</em>
    </p>
    <a class="hero-cta reveal" style="--i:8" href="#wall">
      <span>步入花园</span>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 5v14m0 0l-6-6m6 6l6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
    </a>
  </div>
  <div class="hero-scroll" aria-hidden="true"><div></div></div>
</header>

<section class="quote-section">
  <blockquote class="reveal">
    <p class="quote-zh">"我们都是夜里的星，<br>各自坠落，互为光亮。"</p>
    <p class="quote-en"><em>"We are stars in the night —<br>each one falling, each one becoming light for the other."</em></p>
  </blockquote>
</section>

<main id="wall" class="wall">
  <header class="wall-header reveal">
    <h2>悼念之墙 <span>· In Memoriam ·</span></h2>
    <p>每一片秋叶都是一段未竟的春天。<br><em>Every fallen leaf is a spring unfinished.</em></p>
  </header>
  <div class="grid">
    ${cards}
  </div>
</main>

<section class="candle-section reveal">
  <div class="candle-frame">
    <div class="candle">
      <div class="flame">
        <div class="flame-inner"></div>
      </div>
      <div class="wick"></div>
      <div class="body"></div>
    </div>
    <h3>为她们点一支烛</h3>
    <p class="en"><em>Light a candle for them</em></p>
    <button id="lightCandle" class="candle-btn">
      <span class="default-text">点燃</span>
      <span class="lit-text">已为她们点燃 · 共 <strong id="candleCount">0</strong> 支</span>
    </button>
  </div>
</section>

<footer class="site-footer">
  <div class="flag-bar" aria-hidden="true"></div>
  <p>这是一份正在生长的纪念。<br>若你愿为某位姐妹添上一片叶，请通过 issue / PR 联系我们。</p>
  <p class="en"><em>This memorial grows. To add a leaf, contact us via issue or PR.</em></p>
  <p class="credit">致敬 <a href="https://www.one-among.us/" target="_blank" rel="noopener">one-among.us</a> — 愿被记住的人，永不被忘记。</p>
  <p class="tiny">Built with care · Cloudflare Workers · ${new Date().getFullYear()}</p>
</footer>`;

  return shell({
    title: '那些秋叶 · Those Autumn Leaves',
    description: '一座为已逝跨性别姐妹而建的赛博墓碑。她们曾来过，曾活过，曾成为自己。',
    content
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 详情页
// ─────────────────────────────────────────────────────────────────────────────
function renderDetailPage(m) {
  const content = `
<nav class="detail-nav">
  <a href="/" class="back">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    回到花园
  </a>
</nav>

<article class="detail">
  <header class="detail-header reveal">
    <div class="detail-photo">
      <div class="photo-frame large">
        <div class="photo-initial">${escapeHtml(m.name[0])}</div>
        <div class="photo-mist"></div>
        <div class="photo-halo"></div>
      </div>
    </div>
    <div class="detail-name">
      <h1>
        <span class="zh">${escapeHtml(m.name)}</span>
        <span class="en"><em>${escapeHtml(m.nameEn)}</em></span>
      </h1>
      <p class="pronouns">${escapeHtml(m.pronouns)}</p>
      <p class="dates">
        <time>${formatDate(m.birth)}</time>
        <span class="butterfly">✦</span>
        <time>${formatDate(m.departure)}</time>
      </p>
      <p class="meta">${escapeHtml(m.location)} · 享年 ${m.age} 岁</p>
      <div class="detail-tags">${m.tags.map(t => `<span>${escapeHtml(t)}</span>`).join('')}</div>
    </div>
  </header>

  <section class="epitaph-section reveal">
    <p class="epitaph-zh">"${escapeHtml(m.epitaph)}"</p>
    <p class="epitaph-en"><em>"${escapeHtml(m.epitaphEn)}"</em></p>
  </section>

  <section class="bio-section reveal">
    <h2>她的故事 <span class="en"><em>Her Story</em></span></h2>
    <p class="bio-zh">${escapeHtml(m.bio)}</p>
    <p class="bio-en"><em>${escapeHtml(m.bioEn)}</em></p>
  </section>

  <section class="actions reveal">
    <button class="action-btn" data-action="flower">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 2c2 2 2 5 0 7m0 0c-2-2-5-2-7 0m7 0c2-2 5-2 7 0m-7 0c-2 2-2 5 0 7m0 0v8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
      </svg>
      <span>献一朵花 · Lay a flower</span>
      <em class="count" data-count="flower">0</em>
    </button>
    <button class="action-btn" data-action="candle">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3c-1.5 2 1.5 3 0 5-1.5-2 1.5-3 0-5z" fill="currentColor"/>
        <rect x="9" y="9" width="6" height="11" rx="1" stroke="currentColor" stroke-width="1.3"/>
      </svg>
      <span>点一支烛 · Light a candle</span>
      <em class="count" data-count="candle">0</em>
    </button>
  </section>

  <section class="next-section reveal">
    ${renderNextLink(m.id)}
  </section>
</article>

<footer class="site-footer">
  <div class="flag-bar" aria-hidden="true"></div>
  <p class="credit">致敬 <a href="https://www.one-among.us/" target="_blank" rel="noopener">one-among.us</a></p>
</footer>`;

  return shell({
    title: `${m.name} · ${m.nameEn} — 那些秋叶`,
    description: `${m.epitaph} — ${m.bio}`,
    content
  });
}

function renderNextLink(currentId) {
  const idx = MEMORIALS.findIndex(m => m.id === currentId);
  const next = MEMORIALS[(idx + 1) % MEMORIALS.length];
  return `
    <p class="next-label">下一位姐妹 · Next</p>
    <a class="next-card" href="/memorial/${next.id}">
      <span class="next-name">${escapeHtml(next.name)} <em>· ${escapeHtml(next.nameEn)}</em></span>
      <span class="next-epitaph">${escapeHtml(next.epitaph)}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────────────────────────────────────
function renderNotFound() {
  const content = `
<main class="not-found">
  <div class="reveal">
    <h1>404</h1>
    <p class="zh">此处不应有人。<br>愿你寻找的那位，正在某处安好。</p>
    <p class="en"><em>No one is here.<br>May the one you seek be at peace, somewhere.</em></p>
    <a href="/">回到花园 · Return to the garden</a>
  </div>
</main>`;
  return shell({
    title: '404 · 那些秋叶',
    description: '此处不应有人。',
    content
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SVG 资产
// ─────────────────────────────────────────────────────────────────────────────
function transFlagSvg(size = 48) {
  return `<svg width="${size}" height="${size * 0.6}" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="trans flag">
    <rect x="0" y="0"  width="100" height="12" fill="#5BCEFA"/>
    <rect x="0" y="12" width="100" height="12" fill="#F5A9B8"/>
    <rect x="0" y="24" width="100" height="12" fill="#FFFFFF"/>
    <rect x="0" y="36" width="100" height="12" fill="#F5A9B8"/>
    <rect x="0" y="48" width="100" height="12" fill="#5BCEFA"/>
  </svg>`;
}

function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="15" fill="#0a0e1a"/><path d="M10 18 Q16 8 22 18 T22 22 Q16 26 10 22 Z" fill="#F5A9B8" opacity=".9"/><circle cx="16" cy="14" r="2" fill="#5BCEFA"/></svg>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 样式
// ─────────────────────────────────────────────────────────────────────────────
function baseStyles() {
  return `
:root {
  --bg-0: #07090f;
  --bg-1: #0a0e1a;
  --bg-2: #141a2c;
  --ink: #e8ecf3;
  --ink-2: #b6bccb;
  --ink-3: #7e8597;
  --gold: #d8b97a;
  --gold-glow: rgba(216,185,122,.5);
  --pink: #f5a9b8;
  --blue: #5bcefa;
  --white: #ffffff;
  --rule: rgba(255,255,255,.08);
  --card: rgba(255,255,255,.035);
  --card-hover: rgba(255,255,255,.06);
  --serif-zh: 'Noto Serif SC', 'Songti SC', 'STSong', serif;
  --serif-en: 'Cormorant Garamond', Georgia, serif;
  --transition: cubic-bezier(.22,.61,.36,1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--serif-zh);
  color: var(--ink);
  background: radial-gradient(ellipse at top, var(--bg-2) 0%, var(--bg-1) 30%, var(--bg-0) 100%);
  min-height: 100vh;
  line-height: 1.7;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
body::before {
  content: '';
  position: fixed; inset: 0;
  background:
    radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,.4), transparent),
    radial-gradient(1px 1px at 60% 70%, rgba(255,255,255,.3), transparent),
    radial-gradient(1px 1px at 80% 20%, rgba(255,255,255,.35), transparent),
    radial-gradient(1px 1px at 35% 85%, rgba(255,255,255,.25), transparent),
    radial-gradient(1px 1px at 90% 50%, rgba(255,255,255,.2), transparent),
    radial-gradient(2px 2px at 10% 60%, rgba(245,169,184,.35), transparent),
    radial-gradient(2px 2px at 75% 15%, rgba(91,206,250,.3), transparent);
  background-size: 100% 100%;
  z-index: -2;
  animation: starfield 120s linear infinite;
  opacity: .9;
}
@keyframes starfield {
  0% { transform: translateY(0); } 100% { transform: translateY(-50px); }
}

#leaves {
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 1;
}

.vignette {
  position: fixed; inset: 0;
  pointer-events: none;
  z-index: 2;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,.45) 100%);
}

.flag-ribbon {
  position: fixed; top: 0; left: 0; right: 0;
  height: 4px;
  display: flex;
  z-index: 50;
  opacity: .85;
}
.flag-ribbon span { flex: 1; }
.flag-ribbon span:nth-child(1) { background: var(--blue); }
.flag-ribbon span:nth-child(2) { background: var(--pink); }
.flag-ribbon span:nth-child(3) { background: var(--white); }
.flag-ribbon span:nth-child(4) { background: var(--pink); }
.flag-ribbon span:nth-child(5) { background: var(--blue); }

/* ─── Reveal animation ─────────────────────────────────────── */
.reveal {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity 1.4s var(--transition), transform 1.4s var(--transition);
  transition-delay: calc(var(--i, 0) * 90ms);
}
.reveal.in { opacity: 1; transform: none; }
@media (prefers-reduced-motion: reduce) {
  .reveal { opacity: 1; transform: none; transition: none; }
}

/* ─── Hero ─────────────────────────────────────────────────── */
.hero {
  position: relative;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 6rem 1.5rem 4rem;
  z-index: 3;
}
.hero-inner { text-align: center; max-width: 720px; }
.hero-mark { display: inline-block; padding: 0 1rem 1.5rem; opacity: .9; }
.hero-mark svg { box-shadow: 0 8px 32px rgba(91,206,250,.25); border-radius: 4px; }

.hero-title {
  font-family: var(--serif-zh);
  font-weight: 300;
  font-size: clamp(3rem, 9vw, 5.5rem);
  letter-spacing: .35em;
  margin-left: .35em;
  background: linear-gradient(180deg, #ffffff 0%, #c9d2e3 60%, #7e8597 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  text-shadow: 0 0 60px rgba(245,169,184,.15);
  line-height: 1.15;
}
.hero-title span {
  display: inline-block;
}

.hero-sub {
  font-family: var(--serif-en);
  font-style: italic;
  font-weight: 300;
  font-size: clamp(1.1rem, 2.4vw, 1.6rem);
  letter-spacing: .12em;
  color: var(--ink-2);
  margin-top: .8rem;
}

.hero-tag {
  font-size: .95rem;
  letter-spacing: .25em;
  color: var(--ink-3);
  margin-top: 1.6rem;
}

.hero-poem {
  font-size: clamp(1rem, 1.6vw, 1.15rem);
  margin-top: 2.4rem;
  color: var(--ink-2);
  line-height: 2;
}
.hero-poem em { font-family: var(--serif-en); color: var(--ink-3); }

.hero-cta {
  display: inline-flex; align-items: center; gap: .6rem;
  margin-top: 2.8rem;
  padding: .9rem 2rem;
  border: 1px solid rgba(216,185,122,.35);
  border-radius: 999px;
  color: var(--gold);
  text-decoration: none;
  font-size: .95rem;
  letter-spacing: .25em;
  transition: all .5s var(--transition);
  background: rgba(216,185,122,.04);
  backdrop-filter: blur(8px);
}
.hero-cta:hover {
  border-color: rgba(216,185,122,.7);
  background: rgba(216,185,122,.08);
  box-shadow: 0 0 30px rgba(216,185,122,.2);
  transform: translateY(-2px);
}
.hero-cta svg { transition: transform .5s var(--transition); }
.hero-cta:hover svg { transform: translateY(3px); }

.hero-scroll {
  position: absolute;
  bottom: 2.5rem; left: 50%; transform: translateX(-50%);
  width: 1px; height: 60px;
  background: linear-gradient(180deg, transparent, var(--ink-3), transparent);
  overflow: hidden;
}
.hero-scroll div {
  position: absolute; top: -30%;
  width: 100%; height: 30%;
  background: linear-gradient(180deg, transparent, var(--gold));
  animation: scroll-down 2.4s ease-in-out infinite;
}
@keyframes scroll-down {
  0% { top: -30%; } 100% { top: 100%; }
}

/* ─── Quote ────────────────────────────────────────────────── */
.quote-section {
  padding: 6rem 1.5rem;
  text-align: center;
  position: relative;
  z-index: 3;
}
.quote-section blockquote {
  max-width: 640px; margin: 0 auto;
  position: relative; padding: 2rem;
}
.quote-section blockquote::before,
.quote-section blockquote::after {
  position: absolute;
  font-family: var(--serif-en);
  font-size: 5rem;
  color: rgba(216,185,122,.25);
  line-height: 1;
}
.quote-section blockquote::before { content: '"'; top: 0; left: 0; }
.quote-section blockquote::after { content: '"'; bottom: -2rem; right: 0; }
.quote-zh {
  font-size: clamp(1.2rem, 2.4vw, 1.6rem);
  letter-spacing: .15em;
  line-height: 2.2;
  color: var(--ink);
}
.quote-en {
  margin-top: 1.6rem;
  font-family: var(--serif-en);
  font-size: clamp(1rem, 1.8vw, 1.15rem);
  color: var(--ink-3);
  line-height: 1.8;
}

/* ─── Wall ─────────────────────────────────────────────────── */
.wall {
  max-width: 1180px;
  margin: 0 auto;
  padding: 4rem 1.5rem 6rem;
  position: relative;
  z-index: 3;
}
.wall-header {
  text-align: center;
  margin-bottom: 4rem;
}
.wall-header h2 {
  font-weight: 400;
  font-size: clamp(1.8rem, 3.5vw, 2.4rem);
  letter-spacing: .25em;
  color: var(--ink);
}
.wall-header h2 span {
  display: block;
  font-family: var(--serif-en);
  font-style: italic;
  font-size: .65em;
  letter-spacing: .3em;
  color: var(--gold);
  margin-top: .6rem;
}
.wall-header p {
  margin-top: 1.6rem;
  color: var(--ink-3);
  font-size: 1rem;
  letter-spacing: .08em;
}
.wall-header p em { font-family: var(--serif-en); }

.grid {
  display: grid;
  gap: 1.6rem;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
}

.memorial-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.8rem 1.6rem 1.6rem;
  border: 1px solid var(--rule);
  border-radius: 16px;
  background: linear-gradient(180deg, var(--card), rgba(255,255,255,.01));
  text-decoration: none;
  color: inherit;
  overflow: hidden;
  transition: transform .7s var(--transition), border-color .7s var(--transition), background .7s var(--transition);
  backdrop-filter: blur(6px);
}
.memorial-card::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, rgba(245,169,184,.06), transparent 40%, rgba(91,206,250,.04));
  opacity: 0;
  transition: opacity .7s var(--transition);
  pointer-events: none;
}
.memorial-card:hover {
  transform: translateY(-6px);
  border-color: rgba(245,169,184,.3);
  background: linear-gradient(180deg, var(--card-hover), rgba(255,255,255,.015));
}
.memorial-card:hover::before { opacity: 1; }
.memorial-card:hover .photo-frame { transform: scale(1.04); }
.memorial-card:hover .card-glow { opacity: 1; }

.card-photo {
  display: flex; justify-content: center;
  margin-bottom: 1.6rem;
}
.photo-frame {
  position: relative;
  width: 96px; height: 96px;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(245,169,184,.18), rgba(91,206,250,.18));
  display: grid; place-items: center;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,.12);
  transition: transform .8s var(--transition);
  box-shadow: 0 0 0 1px rgba(255,255,255,.04), 0 12px 40px rgba(0,0,0,.4);
}
.photo-frame.large { width: 160px; height: 160px; }
.photo-initial {
  font-family: var(--serif-zh);
  font-size: 2.4rem;
  font-weight: 300;
  color: rgba(255,255,255,.85);
  letter-spacing: 0;
}
.photo-frame.large .photo-initial { font-size: 4rem; }
.photo-mist {
  position: absolute; inset: 0;
  background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.18), transparent 60%);
  mix-blend-mode: overlay;
  animation: mist 8s ease-in-out infinite;
}
@keyframes mist {
  0%,100% { transform: rotate(0deg) scale(1); }
  50% { transform: rotate(180deg) scale(1.2); }
}
.photo-halo {
  position: absolute; inset: -8px;
  border-radius: 50%;
  background: conic-gradient(from 0deg, var(--blue), var(--pink), var(--white), var(--pink), var(--blue));
  opacity: .35;
  filter: blur(14px);
  z-index: -1;
  animation: halo 12s linear infinite;
}
@keyframes halo { to { transform: rotate(360deg); } }

.card-body { text-align: center; }
.card-name {
  display: flex; flex-direction: column; gap: .2rem;
  margin-bottom: .6rem;
}
.name-zh {
  font-size: 1.4rem;
  letter-spacing: .2em;
  color: var(--ink);
}
.name-en {
  font-family: var(--serif-en);
  font-style: italic;
  font-size: .95rem;
  color: var(--ink-3);
  letter-spacing: .12em;
}
.card-dates {
  display: inline-flex; align-items: center; gap: .6rem;
  font-family: var(--serif-en);
  font-size: .85rem;
  color: var(--gold);
  letter-spacing: .1em;
  margin-top: .4rem;
}
.card-dates .dash { opacity: .6; }
.card-epitaph {
  margin-top: 1.2rem;
  font-size: .95rem;
  color: var(--ink-2);
  line-height: 1.8;
  letter-spacing: .06em;
}
.card-epitaph-en {
  margin-top: .4rem;
  font-family: var(--serif-en);
  font-style: italic;
  font-size: .85rem;
  color: var(--ink-3);
  line-height: 1.6;
}
.card-tags {
  display: flex; justify-content: center; flex-wrap: wrap; gap: .5rem;
  margin-top: 1.2rem;
}
.card-tags span {
  font-size: .72rem;
  padding: .25rem .7rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink-3);
  letter-spacing: .1em;
}
.card-glow {
  position: absolute;
  inset: -1px;
  border-radius: 16px;
  background: radial-gradient(600px circle at var(--mx, 50%) var(--my, 50%), rgba(245,169,184,.12), transparent 40%);
  opacity: 0;
  transition: opacity .5s var(--transition);
  pointer-events: none;
}

/* ─── Candle ───────────────────────────────────────────────── */
.candle-section {
  padding: 5rem 1.5rem 6rem;
  text-align: center;
  position: relative;
  z-index: 3;
}
.candle-frame {
  max-width: 460px;
  margin: 0 auto;
  padding: 3rem 2rem;
  border: 1px solid var(--rule);
  border-radius: 20px;
  background: linear-gradient(180deg, rgba(255,255,255,.03), transparent);
  backdrop-filter: blur(10px);
}
.candle {
  width: 60px; height: 120px;
  margin: 0 auto 2rem;
  position: relative;
}
.candle .body {
  position: absolute; bottom: 0; left: 50%; transform: translateX(-50%);
  width: 30px; height: 70px;
  background: linear-gradient(180deg, #f6e9c8 0%, #d8c189 100%);
  border-radius: 4px 4px 2px 2px;
  box-shadow: inset -3px 0 0 rgba(0,0,0,.15), 0 4px 24px rgba(216,185,122,.2);
}
.candle .wick {
  position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
  width: 2px; height: 8px;
  background: #2a1a0a;
}
.candle .flame {
  position: absolute; bottom: 78px; left: 50%; transform: translateX(-50%);
  width: 16px; height: 24px;
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  background: radial-gradient(circle at 50% 80%, #fff8c8, #ffaa3a 50%, #ff5a3a 80%);
  filter: drop-shadow(0 0 12px rgba(255,170,58,.6)) drop-shadow(0 0 24px rgba(255,90,58,.35));
  animation: flicker 2.4s ease-in-out infinite;
  transform-origin: bottom center;
  opacity: 0;
  transition: opacity 1s ease;
}
.candle.lit .flame { opacity: 1; }
.candle .flame-inner {
  position: absolute; inset: 30% 30% 10% 30%;
  background: radial-gradient(circle, #fff8c8, transparent 70%);
  border-radius: 50%;
}
@keyframes flicker {
  0%,100% { transform: translateX(-50%) scaleY(1) rotate(-1deg); }
  25% { transform: translateX(-50%) scaleY(1.05) rotate(2deg); }
  50% { transform: translateX(-50%) scaleY(.96) rotate(-2deg); }
  75% { transform: translateX(-50%) scaleY(1.03) rotate(1deg); }
}
.candle-section h3 {
  font-weight: 400;
  font-size: 1.4rem;
  letter-spacing: .25em;
  color: var(--ink);
}
.candle-section .en {
  font-family: var(--serif-en);
  color: var(--ink-3);
  font-size: 1rem;
  margin-top: .4rem;
}
.candle-btn {
  margin-top: 2rem;
  padding: .8rem 2rem;
  background: transparent;
  border: 1px solid var(--gold);
  color: var(--gold);
  border-radius: 999px;
  font-family: inherit;
  font-size: .95rem;
  letter-spacing: .2em;
  cursor: pointer;
  transition: all .5s var(--transition);
}
.candle-btn:hover {
  background: rgba(216,185,122,.08);
  box-shadow: 0 0 24px rgba(216,185,122,.3);
}
.candle-btn .lit-text { display: none; }
.candle-btn.lit .default-text { display: none; }
.candle-btn.lit .lit-text { display: inline; }
.candle-btn strong { color: var(--ink); font-weight: 500; }

/* ─── Footer ───────────────────────────────────────────────── */
.site-footer {
  text-align: center;
  padding: 4rem 1.5rem 5rem;
  border-top: 1px solid var(--rule);
  position: relative;
  z-index: 3;
  color: var(--ink-3);
  font-size: .9rem;
  line-height: 1.9;
}
.flag-bar {
  position: absolute; top: -1px; left: 50%; transform: translateX(-50%);
  width: 120px; height: 3px;
  background: linear-gradient(90deg, var(--blue), var(--pink), var(--white), var(--pink), var(--blue));
  border-radius: 999px;
}
.site-footer .en {
  font-family: var(--serif-en);
  font-size: .85rem;
  margin-top: .4rem;
}
.site-footer .credit {
  margin-top: 2rem;
  font-size: .85rem;
  letter-spacing: .08em;
}
.site-footer .credit a {
  color: var(--gold);
  text-decoration: none;
  border-bottom: 1px dotted rgba(216,185,122,.4);
}
.site-footer .tiny {
  margin-top: 1rem;
  font-size: .72rem;
  letter-spacing: .25em;
  color: rgba(255,255,255,.18);
}

/* ─── Detail page ──────────────────────────────────────────── */
.detail-nav {
  max-width: 760px; margin: 0 auto;
  padding: 2.5rem 1.5rem 0;
  position: relative; z-index: 3;
}
.detail-nav .back {
  display: inline-flex; align-items: center; gap: .4rem;
  color: var(--ink-3);
  text-decoration: none;
  font-size: .9rem;
  letter-spacing: .15em;
  transition: color .4s var(--transition);
}
.detail-nav .back:hover { color: var(--gold); }

.detail {
  max-width: 760px; margin: 0 auto;
  padding: 3rem 1.5rem 4rem;
  position: relative; z-index: 3;
}
.detail-header {
  display: grid; gap: 2.4rem;
  text-align: center;
  margin-bottom: 4rem;
}
@media (min-width: 720px) {
  .detail-header { grid-template-columns: auto 1fr; text-align: left; align-items: center; }
}
.detail-photo { display: flex; justify-content: center; }
.detail-name h1 {
  font-weight: 300;
}
.detail-name h1 .zh {
  display: block;
  font-size: clamp(2.2rem, 4.5vw, 3rem);
  letter-spacing: .2em;
  color: var(--ink);
  margin-bottom: .2rem;
}
.detail-name h1 .en {
  display: block;
  font-family: var(--serif-en);
  font-style: italic;
  font-size: 1.2rem;
  color: var(--ink-3);
  letter-spacing: .12em;
}
.detail-name .pronouns {
  margin-top: 1rem;
  font-family: var(--serif-en);
  color: var(--gold);
  font-size: .95rem;
  letter-spacing: .15em;
}
.detail-name .dates {
  margin-top: .6rem;
  display: inline-flex; align-items: center; gap: .8rem;
  font-family: var(--serif-en);
  font-size: 1.1rem;
  color: var(--ink-2);
  letter-spacing: .1em;
}
.detail-name .butterfly { color: var(--gold); }
.detail-name .meta {
  margin-top: .4rem;
  font-size: .9rem;
  color: var(--ink-3);
  letter-spacing: .15em;
}
.detail-tags {
  margin-top: 1rem;
  display: flex; flex-wrap: wrap; gap: .5rem;
  justify-content: center;
}
@media (min-width: 720px) {
  .detail-tags { justify-content: flex-start; }
}
.detail-tags span {
  font-size: .75rem;
  padding: .3rem .8rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  color: var(--ink-3);
  letter-spacing: .1em;
}

.epitaph-section {
  text-align: center;
  padding: 3rem 1rem;
  border-top: 1px solid var(--rule);
  border-bottom: 1px solid var(--rule);
  margin-bottom: 3rem;
}
.epitaph-zh {
  font-size: clamp(1.3rem, 3vw, 1.8rem);
  letter-spacing: .2em;
  line-height: 2;
  color: var(--ink);
}
.epitaph-en {
  margin-top: 1rem;
  font-family: var(--serif-en);
  font-size: 1.1rem;
  color: var(--ink-3);
  letter-spacing: .08em;
}

.bio-section { margin-bottom: 3rem; }
.bio-section h2 {
  font-weight: 400;
  font-size: 1.3rem;
  letter-spacing: .25em;
  color: var(--ink);
  margin-bottom: 1.6rem;
  padding-bottom: .6rem;
  border-bottom: 1px solid var(--rule);
}
.bio-section h2 .en {
  font-family: var(--serif-en);
  font-size: .9rem;
  color: var(--gold);
  margin-left: .8rem;
  letter-spacing: .15em;
}
.bio-zh {
  font-size: 1.05rem;
  line-height: 2;
  color: var(--ink-2);
  letter-spacing: .04em;
}
.bio-en {
  margin-top: 1.2rem;
  font-family: var(--serif-en);
  font-size: 1rem;
  line-height: 1.9;
  color: var(--ink-3);
}

.actions {
  display: grid; gap: 1rem;
  grid-template-columns: 1fr;
  margin-bottom: 3rem;
}
@media (min-width: 560px) {
  .actions { grid-template-columns: 1fr 1fr; }
}
.action-btn {
  display: flex; align-items: center; gap: .8rem;
  padding: 1rem 1.4rem;
  background: var(--card);
  border: 1px solid var(--rule);
  border-radius: 14px;
  color: var(--ink);
  font-family: inherit;
  font-size: .95rem;
  letter-spacing: .08em;
  cursor: pointer;
  transition: all .5s var(--transition);
}
.action-btn:hover {
  border-color: rgba(216,185,122,.5);
  background: var(--card-hover);
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(0,0,0,.3);
}
.action-btn svg { color: var(--gold); flex-shrink: 0; }
.action-btn span { flex: 1; text-align: left; }
.action-btn .count {
  font-family: var(--serif-en);
  font-style: normal;
  color: var(--gold);
  font-size: 1rem;
  font-weight: 500;
}
.action-btn.bumped {
  animation: bump .6s var(--transition);
}
@keyframes bump {
  0% { transform: scale(1); }
  40% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.next-section {
  padding: 2rem 0 1rem;
  border-top: 1px solid var(--rule);
}
.next-label {
  font-size: .8rem;
  letter-spacing: .3em;
  color: var(--ink-3);
  margin-bottom: 1rem;
}
.next-card {
  display: flex; align-items: center; gap: 1rem;
  padding: 1.4rem;
  border: 1px solid var(--rule);
  border-radius: 14px;
  text-decoration: none;
  color: inherit;
  transition: all .5s var(--transition);
}
.next-card:hover {
  border-color: rgba(245,169,184,.4);
  background: var(--card);
  transform: translateX(4px);
}
.next-card .next-name {
  display: block;
  font-size: 1.1rem;
  letter-spacing: .15em;
  color: var(--ink);
}
.next-card .next-name em {
  font-family: var(--serif-en);
  color: var(--ink-3);
  font-size: .9rem;
}
.next-card .next-epitaph {
  display: block;
  font-size: .85rem;
  color: var(--ink-3);
  margin-top: .3rem;
}
.next-card svg {
  margin-left: auto;
  color: var(--gold);
  flex-shrink: 0;
}

/* ─── 404 ──────────────────────────────────────────────────── */
.not-found {
  min-height: 80vh;
  display: grid; place-items: center;
  text-align: center;
  padding: 2rem;
  position: relative; z-index: 3;
}
.not-found h1 {
  font-family: var(--serif-en);
  font-weight: 300;
  font-size: clamp(5rem, 14vw, 9rem);
  color: var(--gold);
  letter-spacing: .1em;
}
.not-found .zh { font-size: 1.2rem; line-height: 2; letter-spacing: .12em; margin-top: 1rem; }
.not-found .en { font-family: var(--serif-en); color: var(--ink-3); margin-top: 1rem; }
.not-found a {
  display: inline-block; margin-top: 2.5rem;
  padding: .7rem 1.8rem;
  border: 1px solid var(--gold);
  border-radius: 999px;
  color: var(--gold);
  text-decoration: none;
  letter-spacing: .15em;
  transition: all .5s var(--transition);
}
.not-found a:hover { background: rgba(216,185,122,.08); }

/* ─── Selection ────────────────────────────────────────────── */
::selection { background: rgba(245,169,184,.3); color: var(--white); }

/* ─── Mobile tweaks ────────────────────────────────────────── */
@media (max-width: 540px) {
  .hero-title { letter-spacing: .25em; margin-left: .25em; }
  .grid { gap: 1.2rem; }
  .quote-section { padding: 4rem 1.5rem; }
}
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 客户端脚本：落叶 / 滚动揭示 / 卡片光斑 / 蜡烛 / 献花计数
// ─────────────────────────────────────────────────────────────────────────────
function baseScripts() {
  return `
(() => {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ─── 落叶 / 花瓣画布 ─────────────────────────────────────
  const cv = document.getElementById('leaves');
  const ctx = cv.getContext('2d', { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W, H;
  function resize() {
    W = cv.width = innerWidth * DPR;
    H = cv.height = innerHeight * DPR;
    cv.style.width = innerWidth + 'px';
    cv.style.height = innerHeight + 'px';
  }
  resize();
  addEventListener('resize', resize);

  const COLORS = [
    'rgba(245,169,184,0.55)',   // 跨性别旗 粉
    'rgba(91,206,250,0.45)',    // 跨性别旗 蓝
    'rgba(255,255,255,0.55)',   // 白
    'rgba(216,185,122,0.45)',   // 烛金
    'rgba(232,180,160,0.4)'     // 暖橙
  ];
  const TWO_PI = Math.PI * 2;

  class Leaf {
    constructor() { this.reset(true); }
    reset(initial) {
      this.x = Math.random() * W;
      this.y = initial ? Math.random() * H : -40 * DPR;
      this.size = (8 + Math.random() * 14) * DPR;
      this.vy = (.4 + Math.random() * .9) * DPR;
      this.vx = (Math.random() - .5) * .6 * DPR;
      this.rot = Math.random() * TWO_PI;
      this.vr = (Math.random() - .5) * 0.02;
      this.color = COLORS[(Math.random() * COLORS.length) | 0];
      this.swing = Math.random() * 2 + 1;
      this.swingSpeed = .005 + Math.random() * .01;
      this.t = Math.random() * 1000;
      this.alpha = .5 + Math.random() * .5;
    }
    step() {
      this.t += this.swingSpeed;
      this.x += this.vx + Math.sin(this.t) * this.swing * .3;
      this.y += this.vy;
      this.rot += this.vr;
      if (this.y > H + 40 * DPR || this.x < -40 * DPR || this.x > W + 40 * DPR) this.reset(false);
    }
    draw() {
      ctx.save();
      ctx.globalAlpha = this.alpha;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      ctx.fillStyle = this.color;
      ctx.shadowBlur = 8 * DPR;
      ctx.shadowColor = this.color;
      // 叶片形状（贝塞尔）
      const s = this.size;
      ctx.beginPath();
      ctx.moveTo(0, -s);
      ctx.bezierCurveTo(s * .8, -s * .8, s * .8, s * .8, 0, s);
      ctx.bezierCurveTo(-s * .8, s * .8, -s * .8, -s * .8, 0, -s);
      ctx.fill();
      ctx.restore();
    }
  }

  const COUNT = reduce ? 0 : Math.min(60, Math.round(innerWidth / 22));
  const leaves = Array.from({ length: COUNT }, () => new Leaf());
  let raf;
  function loop() {
    ctx.clearRect(0, 0, W, H);
    for (const l of leaves) { l.step(); l.draw(); }
    raf = requestAnimationFrame(loop);
  }
  if (!reduce) loop();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else if (!reduce) loop();
  });

  // ─── 滚动揭示 ─────────────────────────────────────────
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }
  }, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // ─── 卡片鼠标光斑 ────────────────────────────────────
  document.querySelectorAll('.memorial-card').forEach(card => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });
  });

  // ─── 蜡烛点燃（首页） ─────────────────────────────────
  const candleBtn = document.getElementById('lightCandle');
  const candleCount = document.getElementById('candleCount');
  if (candleBtn) {
    const KEY = 'autumn-leaves-candles';
    const KEY_LIT = 'autumn-leaves-candle-lit';
    const candle = document.querySelector('.candle');
    const update = () => {
      const n = parseInt(localStorage.getItem(KEY) || '0', 10);
      candleCount.textContent = String(n);
      if (localStorage.getItem(KEY_LIT) === '1') {
        candle.classList.add('lit');
        candleBtn.classList.add('lit');
      }
    };
    candleBtn.addEventListener('click', () => {
      if (localStorage.getItem(KEY_LIT) === '1') return;
      const n = parseInt(localStorage.getItem(KEY) || '0', 10) + 1;
      localStorage.setItem(KEY, String(n));
      localStorage.setItem(KEY_LIT, '1');
      candle.classList.add('lit');
      candleBtn.classList.add('lit');
      candleCount.textContent = String(n);
    });
    update();
  }

  // ─── 详情页 献花 / 点烛 ──────────────────────────────
  document.querySelectorAll('.action-btn').forEach(btn => {
    const action = btn.dataset.action;
    const id = location.pathname.split('/').pop();
    const key = 'memorial-' + id + '-' + action;
    const display = btn.querySelector('[data-count]');
    display.textContent = localStorage.getItem(key) || '0';
    btn.addEventListener('click', () => {
      const n = (parseInt(localStorage.getItem(key) || '0', 10) + 1);
      localStorage.setItem(key, String(n));
      display.textContent = String(n);
      btn.classList.remove('bumped');
      void btn.offsetWidth; // restart
      btn.classList.add('bumped');
    });
  });
})();
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}
