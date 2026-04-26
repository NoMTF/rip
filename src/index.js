/**
 * 勿忘我 · rip.lgbt
 */

const SITE = {
  title: '勿忘我',
  subtitle: 'rip.lgbt',
  description: '一份为逝去的跨性别者、性别多元者与友跨人士保留名字的纪念索引。',
  dataHost: 'https://data.one-among.us'
};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      if (path === '/api/memorials') {
        const people = await getPeople();
        return json({
          site: SITE.title,
          count: people.length,
          people
        });
      }

      const apiOne = path.match(/^\/api\/memorials\/([^/]+)$/);
      if (apiOne) {
        const profile = await getProfile(apiOne[1]);
        return profile ? json(profile) : json({ error: 'not_found' }, 404);
      }

      const pageOne = path.match(/^\/memorial\/([^/]+)$/);
      if (pageOne) {
        const profile = await getProfile(pageOne[1]);
        return profile ? html(renderDetailPage(profile)) : notFound();
      }

      if (path === '/' || path === '/index.html') {
        const people = await getPeople();
        return html(renderHomePage(people));
      }

      return notFound();
    } catch (error) {
      return html(renderErrorPage(error), 502);
    }
  }
};

async function getPeople() {
  const list = await fetchJson('/people-list.json');
  return list
    .map(normalizePerson)
    .filter(person => person.id && person.name);
}

async function getProfile(inputId) {
  const people = await getPeople();
  const decodedId = decodeURIComponent(inputId);
  const person = people.find(item => item.id === decodedId || item.path === decodedId);
  if (!person) return null;

  try {
    const info = await fetchJson(`/people/${encodeURIComponent(person.path)}/info.json`);
    return normalizeProfile(person, info);
  } catch {
    return normalizeProfile(person, null);
  }
}

async function fetchJson(path) {
  const response = await fetch(`${SITE.dataHost}${path}`, {
    headers: { accept: 'application/json' },
    cf: {
      cacheTtl: 900,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to read memorial data: ${response.status}`);
  }

  return response.json();
}

function normalizePerson(raw) {
  const path = String(raw.path || raw.id || '').trim();
  const id = String(raw.id || path).trim();
  const sortKey = String(raw.sortKey || '').trim();

  return {
    id,
    path,
    name: String(raw.name || id).trim(),
    desc: String(raw.desc || '').trim(),
    departure: normalizeDeparture(sortKey),
    sortKey,
    profileUrl: toSourceAssetUrl(raw.profileUrl, path)
  };
}

function normalizeProfile(person, info) {
  const facts = Array.isArray(info?.info)
    ? info.info
        .filter(pair => Array.isArray(pair) && pair.length >= 2)
        .map(pair => ({
          label: String(pair[0]),
          value: String(pair[1])
        }))
    : [];

  const websites = Array.isArray(info?.websites)
    ? info.websites
        .filter(pair => Array.isArray(pair) && pair.length >= 2 && isSafeUrl(pair[1]))
        .map(pair => ({
          label: String(pair[0]),
          url: String(pair[1])
        }))
    : [];

  return {
    ...person,
    name: String(info?.name || person.name),
    desc: String(info?.desc || person.desc || '').trim(),
    profileUrl: toSourceAssetUrl(info?.profileUrl || person.profileUrl, person.path),
    facts,
    websites,
    commentCount: Array.isArray(info?.comments) ? info.comments.length : 0
  };
}

function normalizeDeparture(sortKey) {
  if (!sortKey || sortKey === '0') return '';
  if (sortKey === '-1') return '日期未载';
  return sortKey;
}

function toSourceAssetUrl(template, personPath) {
  if (!template) return '';
  const value = String(template);
  if (isSafeUrl(value)) return value;
  if (!value.includes('${path}')) return '';
  return `${SITE.dataHost}/people/${encodeURIComponent(personPath)}${value.replace('${path}', '')}`;
}

function normalizePath(path) {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300'
    }
  });
}

function notFound() {
  return html(renderNotFound(), 404);
}

function renderHomePage(people) {
  const visibleDated = people.filter(person => isFullDate(person.departure));
  const latest = visibleDated[0]?.departure || '';
  const earliest = visibleDated[visibleDated.length - 1]?.departure || '';
  const cards = people.map(renderPersonCard).join('');

  return shell({
    title: `${SITE.title} · ${SITE.subtitle}`,
    description: SITE.description,
    content: `
<header class="site-header">
  <a class="brand" href="/" aria-label="${escapeAttr(SITE.title)}">
    <span class="brand-mark" aria-hidden="true">勿</span>
    <span>
      <strong>${escapeHtml(SITE.title)}</strong>
      <small>${escapeHtml(SITE.subtitle)}</small>
    </span>
  </a>
</header>

<main>
  <section class="hero" aria-labelledby="hero-title">
    <div class="hero-copy">
      <p class="eyebrow">REST IN PEACE · IN MEMORY</p>
      <h1 id="hero-title">勿忘我</h1>
      <p class="lede">名字不是装饰。名字是一个人来过、被爱过、仍应被温柔提起的证据。</p>
      <div class="hero-actions">
        <a class="button primary" href="#memorials">查看 ${people.length} 位</a>
      </div>
    </div>
    <aside class="hero-panel" aria-label="索引统计">
      <div>
        <span class="stat-number">${people.length}</span>
        <span class="stat-label">已同步条目</span>
      </div>
      <div>
        <span class="stat-number">${escapeHtml(formatYearRange(earliest, latest))}</span>
        <span class="stat-label">时间范围</span>
      </div>
      <div>
        <span class="stat-number">15m</span>
        <span class="stat-label">数据缓存</span>
      </div>
    </aside>
  </section>

  <section class="care-note" aria-label="阅读提醒">
    <p><strong>阅读提醒</strong>：原始条目可能包含自杀自伤、家庭暴力、性暴力、物质滥用等创伤内容。请在自己状态稳定时阅读；如果感到不适，请先离开页面并寻求可信赖的人或专业支持。</p>
  </section>

  <section id="memorials" class="memorials" aria-labelledby="memorials-title">
    <div class="section-head">
      <div>
        <p class="eyebrow">INDEX</p>
        <h2 id="memorials-title">纪念索引</h2>
      </div>
      <label class="search">
        <span class="visually-hidden">搜索姓名或日期</span>
        <input id="search" type="search" placeholder="搜索姓名、ID 或日期" autocomplete="off">
      </label>
    </div>
    <p id="resultCount" class="result-count">显示 ${people.length} 位</p>
    <div class="people-grid" data-grid>
      ${cards}
    </div>
  </section>
</main>

${renderFooter()}
`
  });
}

function renderPersonCard(person) {
  const searchText = [
    person.id,
    person.path,
    person.name,
    person.desc,
    person.departure
  ].join(' ').toLowerCase();

  const avatar = person.profileUrl
    ? `<img class="person-avatar" src="${escapeAttr(person.profileUrl)}" alt="" loading="lazy" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'petal',textContent:'${escapeAttr(firstGlyph(person.name))}'}))">`
    : `<span class="petal" aria-hidden="true">${escapeHtml(firstGlyph(person.name))}</span>`;
  const desc = person.desc
    ? `<span class="person-desc">${escapeHtml(person.desc)}</span>`
    : '';

  return `
<article class="person-card" data-person data-search="${escapeAttr(searchText)}">
  <a href="/memorial/${encodeURIComponent(person.path)}" class="person-link">
    ${avatar}
    <span class="person-main">
      <span class="person-name">${escapeHtml(person.name)}</span>
      <span class="person-date">${escapeHtml(formatDate(person.departure))}</span>
      ${desc}
    </span>
    <span class="person-id">${escapeHtml(person.id)}</span>
  </a>
</article>`;
}

function renderDetailPage(profile) {
  const avatar = profile.profileUrl
    ? `<img class="profile-avatar" src="${escapeAttr(profile.profileUrl)}" alt="" decoding="async" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'profile-mark',textContent:'${escapeAttr(firstGlyph(profile.name))}'}))">`
    : `<div class="profile-mark" aria-hidden="true">${escapeHtml(firstGlyph(profile.name))}</div>`;
  const desc = profile.desc || '此处保留这位逝者的基础信息。';
  const facts = profile.facts.length
    ? profile.facts.map(fact => `
      <div class="fact-row">
        <dt>${escapeHtml(fact.label)}</dt>
        <dd>${escapeHtml(fact.value)}</dd>
      </div>`).join('')
    : '<p class="empty">此条目的事实字段暂未公开。</p>';

  const websites = profile.websites.length
    ? profile.websites.map(site => `
      <a href="${escapeAttr(site.url)}" target="_blank" rel="noopener">${escapeHtml(site.label)}</a>`).join('')
    : '<span class="empty-inline">暂无公开链接</span>';

  return shell({
    title: `${profile.name} · ${SITE.title}`,
    description: `${profile.name} 的纪念索引页。`,
    content: `
<header class="site-header">
  <a class="brand" href="/" aria-label="返回首页">
    <span class="brand-mark" aria-hidden="true">勿</span>
    <span>
      <strong>${escapeHtml(SITE.title)}</strong>
      <small>${escapeHtml(SITE.subtitle)}</small>
    </span>
  </a>
  <nav class="header-links" aria-label="页面导航">
    <a href="/">索引</a>
  </nav>
</header>

<main>
  <article class="profile">
    <a class="back-link" href="/">返回索引</a>
    <header class="profile-hero">
      <div class="profile-photo">
        ${avatar}
      </div>
      <div>
        <p class="eyebrow">MEMORIAL ENTRY</p>
        <h1>${escapeHtml(profile.name)}</h1>
        <p class="profile-date">${escapeHtml(formatDate(profile.departure))}</p>
        <p class="profile-desc">${escapeHtml(desc)}</p>
      </div>
    </header>

    <section class="profile-section" aria-labelledby="facts-title">
      <h2 id="facts-title">公开信息</h2>
      <dl class="facts">
        ${facts}
      </dl>
    </section>

    <section class="profile-section" aria-labelledby="links-title">
      <h2 id="links-title">外部链接</h2>
      <div class="external-links">
        ${websites}
      </div>
    </section>
  </article>
</main>

${renderFooter()}
`
  });
}

function renderNotFound() {
  return shell({
    title: `404 · ${SITE.title}`,
    description: '未找到条目。',
    content: `
<main class="not-found">
  <div>
    <p class="eyebrow">404</p>
    <h1>这里没有找到名字</h1>
    <p>可能是链接已经变化，或这位逝者暂未收录。</p>
    <a class="button primary" href="/">回到索引</a>
  </div>
</main>`
  });
}

function renderErrorPage(error) {
  return shell({
    title: `数据暂不可用 · ${SITE.title}`,
    description: '数据源暂时不可用。',
    content: `
<main class="not-found">
  <div>
    <p class="eyebrow">DATA UNAVAILABLE</p>
    <h1>数据暂时读不到</h1>
    <p>人员数据暂时不可用，请稍后重试。</p>
    <p class="error-line">${escapeHtml(error?.message || 'Unknown error')}</p>
    <a class="button primary" href="/">回到首页</a>
  </div>
</main>`
  });
}

function shell({ title, description, content }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="${escapeAttr(description)}">
<meta name="theme-color" content="#f7f3ec">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
<meta property="og:type" content="website">
<title>${escapeHtml(title)}</title>
<style>${baseStyles()}</style>
</head>
<body>
${content}
<script>${baseScripts()}</script>
</body>
</html>`;
}

function renderFooter() {
  return `
<footer class="site-footer">
  <p><strong>${escapeHtml(SITE.title)}</strong> 是 ${escapeHtml(SITE.subtitle)} 的纪念索引实验。</p>
</footer>`;
}

function baseStyles() {
  return `
:root {
  color-scheme: light;
  --paper: #f7f3ec;
  --paper-2: #eee7db;
  --ink: #171512;
  --muted: #6f675d;
  --faint: #9c9388;
  --line: rgba(23, 21, 18, .13);
  --line-strong: rgba(23, 21, 18, .22);
  --petal: #5b8d86;
  --petal-dark: #2f5d57;
  --blue: #5b8aa0;
  --rose: #b56b7d;
  --card: rgba(255, 255, 255, .48);
  --shadow: 0 24px 70px rgba(51, 41, 28, .09);
  --radius: 8px;
  --serif: Georgia, 'Noto Serif SC', 'Songti SC', STSong, serif;
  --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }

html {
  scroll-behavior: smooth;
  background: var(--paper);
}

body {
  margin: 0;
  min-height: 100vh;
  color: var(--ink);
  font-family: var(--sans);
  background:
    linear-gradient(90deg, rgba(91, 138, 160, .08), transparent 22%, transparent 78%, rgba(181, 107, 125, .08)),
    radial-gradient(circle at top left, rgba(91, 141, 134, .14), transparent 32rem),
    var(--paper);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: .18;
  background-image:
    linear-gradient(rgba(23, 21, 18, .04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23, 21, 18, .04) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom, #000 0%, transparent 78%);
}

a {
  color: inherit;
  text-underline-offset: .18em;
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: .8rem clamp(1rem, 4vw, 3rem);
  border-bottom: 1px solid var(--line);
  background: rgba(247, 243, 236, .82);
  backdrop-filter: blur(18px);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: .75rem;
  text-decoration: none;
  min-width: 0;
}

.brand-mark {
  display: grid;
  place-items: center;
  width: 2.3rem;
  height: 2.3rem;
  border: 1px solid var(--line-strong);
  border-radius: 50%;
  color: var(--petal-dark);
  font-family: var(--serif);
  font-weight: 700;
  background: rgba(255,255,255,.38);
}

.brand strong,
.brand small {
  display: block;
  line-height: 1.1;
}

.brand strong {
  font-family: var(--serif);
  font-size: 1.05rem;
  letter-spacing: .08em;
}

.brand small {
  margin-top: .2rem;
  color: var(--muted);
  font-size: .72rem;
}

.header-links {
  display: flex;
  align-items: center;
  gap: .9rem;
  color: var(--muted);
  font-size: .9rem;
  white-space: nowrap;
}

.header-links a {
  text-decoration: none;
  border-bottom: 1px solid transparent;
}

.header-links a:hover {
  border-bottom-color: currentColor;
}

main {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
}

.hero {
  min-height: calc(100svh - 4rem);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  align-items: center;
  gap: clamp(2rem, 7vw, 6rem);
  padding: clamp(4rem, 10vw, 8rem) 0 clamp(3rem, 7vw, 5rem);
}

.hero-copy {
  max-width: 760px;
}

.eyebrow {
  margin: 0 0 1rem;
  color: var(--petal-dark);
  font-size: .76rem;
  font-weight: 700;
  letter-spacing: .18em;
}

h1,
h2,
h3 {
  margin: 0;
  font-family: var(--serif);
  font-weight: 500;
  letter-spacing: 0;
}

.hero h1 {
  font-size: clamp(4.6rem, 13vw, 9.5rem);
  line-height: .92;
}

.lede {
  max-width: 620px;
  margin: 1.4rem 0 0;
  font-family: var(--serif);
  font-size: clamp(1.2rem, 2.5vw, 1.8rem);
  line-height: 1.75;
}

.hero-actions,
.profile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: .8rem;
  margin-top: 2rem;
}

.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: .7rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink);
  text-decoration: none;
  font-weight: 650;
  background: rgba(255, 255, 255, .36);
}

.button.primary {
  color: #fff;
  border-color: var(--petal-dark);
  background: var(--petal-dark);
}

.button.quiet:hover,
.button.primary:hover {
  transform: translateY(-1px);
}

.hero-panel {
  display: grid;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--card);
  box-shadow: var(--shadow);
}

.hero-panel div {
  padding: 1.25rem;
  border-bottom: 1px solid var(--line);
}

.hero-panel div:last-child {
  border-bottom: 0;
}

.stat-number {
  display: block;
  font-family: var(--serif);
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1;
}

.stat-label {
  display: block;
  margin-top: .55rem;
  color: var(--muted);
  font-size: .9rem;
}

.care-note {
  margin: 0 0 4rem;
  padding: 1rem 1.1rem;
  border: 1px solid rgba(181, 107, 125, .28);
  border-radius: var(--radius);
  color: #483a3f;
  background: rgba(181, 107, 125, .08);
}

.care-note p {
  margin: 0;
  line-height: 1.8;
}

.memorials {
  padding: 0 0 5rem;
}

.section-head {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: .9rem;
}

.section-head h2 {
  font-size: clamp(2rem, 5vw, 3.5rem);
}

.search {
  width: min(100%, 360px);
}

.search input {
  width: 100%;
  min-height: 2.75rem;
  padding: .7rem .85rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink);
  font: inherit;
  background: rgba(255, 255, 255, .5);
  outline: none;
}

.search input:focus {
  border-color: var(--petal-dark);
  box-shadow: 0 0 0 3px rgba(91, 141, 134, .16);
}

.result-count {
  margin: 0 0 1rem;
  color: var(--muted);
}

.people-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: .75rem;
}

.person-card {
  min-width: 0;
}

.person-link {
  display: grid;
  grid-template-columns: 4rem minmax(0, 1fr);
  grid-template-rows: auto 1fr;
  gap: .85rem;
  min-height: 8.6rem;
  height: 100%;
  padding: .95rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  text-decoration: none;
  background: rgba(255, 255, 255, .42);
  transition: border-color .18s ease, transform .18s ease, background .18s ease;
}

.person-link:hover {
  transform: translateY(-2px);
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, .68);
}

.petal,
.profile-mark {
  display: grid;
  place-items: center;
  border: 1px solid rgba(91, 141, 134, .35);
  color: var(--petal-dark);
  font-family: var(--serif);
  background:
    radial-gradient(circle at 40% 35%, rgba(255,255,255,.78), transparent 35%),
    rgba(91, 141, 134, .11);
}

.petal {
  width: 4rem;
  height: 4rem;
  border-radius: 48% 52% 46% 54%;
  font-weight: 700;
}

.person-avatar {
  width: 4rem;
  height: 4rem;
  border-radius: 8px;
  object-fit: cover;
  border: 1px solid rgba(91, 141, 134, .28);
  background: rgba(255, 255, 255, .55);
}

.person-main {
  min-width: 0;
}

.person-name {
  display: block;
  overflow-wrap: anywhere;
  font-family: var(--serif);
  font-size: 1.25rem;
}

.person-date,
.person-id,
.person-desc {
  display: block;
  color: var(--muted);
  font-size: .88rem;
}

.person-date {
  margin-top: .55rem;
}

.person-desc {
  display: -webkit-box;
  margin-top: .45rem;
  overflow: hidden;
  line-height: 1.45;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.person-id {
  grid-column: 2;
  align-self: end;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile {
  max-width: 920px;
  margin: 0 auto;
  padding: 4rem 0 5rem;
}

.back-link {
  color: var(--muted);
  text-decoration: none;
}

.back-link:hover {
  color: var(--ink);
}

.profile-hero {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: clamp(1.4rem, 5vw, 3rem);
  align-items: start;
  margin-top: 1.8rem;
  padding-bottom: 2.5rem;
  border-bottom: 1px solid var(--line);
}

.profile-mark {
  width: clamp(6rem, 16vw, 9rem);
  height: clamp(6rem, 16vw, 9rem);
  border-radius: 50%;
  font-size: clamp(2.6rem, 8vw, 4.8rem);
}

.profile-photo {
  width: clamp(7rem, 18vw, 10rem);
}

.profile-avatar {
  display: block;
  width: clamp(7rem, 18vw, 10rem);
  height: clamp(7rem, 18vw, 10rem);
  object-fit: cover;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgba(255, 255, 255, .5);
  box-shadow: var(--shadow);
}

.profile h1 {
  overflow-wrap: anywhere;
  font-size: clamp(3rem, 10vw, 6rem);
  line-height: .98;
}

.profile-date {
  margin: 1rem 0 0;
  color: var(--petal-dark);
  font-weight: 700;
}

.profile-copy {
  max-width: 660px;
  margin: 1.2rem 0 0;
  color: var(--muted);
  line-height: 1.9;
}

.profile-desc {
  max-width: 660px;
  margin: 1.2rem 0 0;
  font-family: var(--serif);
  font-size: clamp(1.15rem, 2.4vw, 1.55rem);
  line-height: 1.65;
}

.profile-section {
  padding: 2rem 0;
  border-bottom: 1px solid var(--line);
}

.profile-section h2 {
  margin-bottom: 1rem;
  font-size: 1.6rem;
}

.profile-section.subtle {
  color: var(--muted);
}

.profile-section.subtle p {
  max-width: 720px;
  line-height: 1.9;
}

.facts {
  display: grid;
  gap: .55rem;
  margin: 0;
}

.fact-row {
  display: grid;
  grid-template-columns: minmax(5rem, 8rem) minmax(0, 1fr);
  gap: 1rem;
  padding: .8rem 0;
  border-bottom: 1px solid rgba(23, 21, 18, .08);
}

.fact-row:last-child {
  border-bottom: 0;
}

.fact-row dt {
  color: var(--muted);
}

.fact-row dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.external-links {
  display: flex;
  flex-wrap: wrap;
  gap: .65rem;
}

.external-links a {
  padding: .55rem .7rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  text-decoration: none;
  background: rgba(255,255,255,.38);
}

.external-links a:hover {
  border-color: var(--line-strong);
}

.empty,
.empty-inline {
  color: var(--muted);
}

.not-found {
  min-height: 80vh;
  display: grid;
  place-items: center;
  text-align: center;
}

.not-found > div {
  max-width: 560px;
}

.not-found h1 {
  font-size: clamp(2.5rem, 8vw, 5rem);
}

.not-found p {
  color: var(--muted);
  line-height: 1.8;
}

.error-line {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: .9rem;
}

.site-footer {
  width: min(1180px, calc(100% - 2rem));
  margin: 0 auto;
  padding: 2rem 0 3rem;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: .92rem;
  line-height: 1.8;
}

.site-footer p {
  margin: .3rem 0;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

[hidden] {
  display: none !important;
}

@media (max-width: 820px) {
  .site-header {
    align-items: flex-start;
  }

  .header-links {
    gap: .65rem;
    font-size: .82rem;
  }

  .hero {
    min-height: auto;
    grid-template-columns: 1fr;
    padding-top: 3rem;
  }

  .hero-panel {
    grid-template-columns: repeat(3, 1fr);
  }

  .hero-panel div {
    border-bottom: 0;
    border-right: 1px solid var(--line);
  }

  .hero-panel div:last-child {
    border-right: 0;
  }

  .section-head {
    display: grid;
    align-items: start;
  }

  .search {
    width: 100%;
  }
}

@media (max-width: 560px) {
  main,
  .site-footer {
    width: min(100% - 1rem, 1180px);
  }

  .site-header {
    position: static;
    padding-inline: .75rem;
  }

  .brand small {
    display: none;
  }

  .hero h1 {
    font-size: clamp(3.8rem, 19vw, 5.2rem);
  }

  .hero-panel {
    grid-template-columns: 1fr;
  }

  .hero-panel div {
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }

  .profile-hero {
    grid-template-columns: 1fr;
  }

  .fact-row {
    grid-template-columns: 1fr;
    gap: .3rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition: none !important;
  }
}
`;
}

function baseScripts() {
  return `
(() => {
  const input = document.getElementById('search');
  const cards = Array.from(document.querySelectorAll('[data-person]'));
  const result = document.getElementById('resultCount');

  if (!input || !cards.length) return;

  const update = () => {
    const q = input.value.trim().toLowerCase();
    let visible = 0;
    for (const card of cards) {
      const hit = !q || card.dataset.search.includes(q);
      card.hidden = !hit;
      if (hit) visible++;
    }
    if (result) result.textContent = '显示 ' + visible + ' 位';
  };

  input.addEventListener('input', update);
})();
`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function isSafeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function firstGlyph(value) {
  const chars = Array.from(String(value || '勿').trim());
  return chars[0] || '勿';
}

function isFullDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDate(value) {
  if (!value) return '日期待考';
  if (!isFullDate(value)) return value;
  const [year, month, day] = value.split('-');
  return `${year}.${month}.${day}`;
}

function formatYearRange(start, end) {
  if (!isFullDate(start) || !isFullDate(end)) return '时间待考';
  return `${start.slice(0, 4)}-${end.slice(0, 4)}`;
}
