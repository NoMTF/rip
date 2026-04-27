import { DurableObject } from 'cloudflare:workers';

/**
 * 勿忘我 · rip.lgbt
 */

const SITE = {
  title: '勿忘我',
  subtitle: 'rip.lgbt',
  description: '一份为逝去的跨性别者、性别多元者与友跨人士保留名字的纪念索引。',
  dataHost: 'https://data.one-among.us'
};

const SUBMISSION_TO_EMAIL = 'wangyanluo233@gmail.com';
const RESEND_EMAILS_ENDPOINT = 'https://api.resend.com/emails';

export default {
  async fetch(request, env) {
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

      if (path === '/api/submissions') {
        return handleSubmission(request, env);
      }

      const apiOne = path.match(/^\/api\/memorials\/([^/]+)$/);
      if (apiOne) {
        const profile = await getProfile(apiOne[1]);
        return profile ? json(profile) : json({ error: 'not_found' }, 404);
      }

      const engagement = path.match(/^\/api\/memorials\/([^/]+)\/engagement$/);
      if (engagement) {
        return handleEngagement(request, env, engagement[1], 'summary');
      }

      const comments = path.match(/^\/api\/memorials\/([^/]+)\/comments$/);
      if (comments) {
        return handleEngagement(request, env, comments[1], 'comments');
      }

      const flowers = path.match(/^\/api\/memorials\/([^/]+)\/flowers$/);
      if (flowers) {
        return handleEngagement(request, env, flowers[1], 'flowers');
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

      if (path === '/submit') {
        return html(renderSubmitPage());
      }

      return notFound();
    } catch (error) {
      return html(renderErrorPage(error), 502);
    }
  }
};

const COMMENT_LIMIT = 1000;
const AUTHOR_LIMIT = 40;
const COMMENT_COOLDOWN_MS = 30_000;
const FLOWER_COOLDOWN_MS = 86_400_000;
const SUBMISSION_BODY_LIMIT = 30_000;
const SUBMISSION_COOLDOWN_MS = 120_000;

export class MemorialEngagement extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS comments (
          id TEXT PRIMARY KEY,
          author TEXT NOT NULL,
          content TEXT NOT NULL,
          ip_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          hidden_at TEXT
        );
        CREATE INDEX IF NOT EXISTS comments_visible_idx
          ON comments(hidden_at, created_at);
        CREATE INDEX IF NOT EXISTS comments_ip_idx
          ON comments(ip_hash, created_at);

        CREATE TABLE IF NOT EXISTS flowers (
          id TEXT PRIMARY KEY,
          total INTEGER NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS flower_events (
          id TEXT PRIMARY KEY,
          ip_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS flower_events_ip_idx
          ON flower_events(ip_hash, created_at);

        CREATE TABLE IF NOT EXISTS submission_events (
          id TEXT PRIMARY KEY,
          ip_hash TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS submission_events_ip_idx
          ON submission_events(ip_hash, created_at);
      `);
    });
  }

  getSummary() {
    return {
      flowers: this.getFlowerCount(),
      comments: this.getComments()
    };
  }

  getComments() {
    return this.sql.exec(`
      SELECT id, author, content, created_at AS createdAt
      FROM comments
      WHERE hidden_at IS NULL
      ORDER BY created_at DESC
      LIMIT 200
    `).toArray();
  }

  addComment(payload) {
    const author = cleanAuthor(payload?.author);
    const content = cleanComment(payload?.content);
    const ipHash = String(payload?.ipHash || 'unknown');

    if (!content) {
      return { ok: false, error: 'empty_content', message: '留言不能为空。' };
    }

    const latest = this.sql.exec(`
      SELECT created_at AS createdAt
      FROM comments
      WHERE ip_hash = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, ipHash).toArray()[0];

    if (latest && Date.now() - Date.parse(latest.createdAt) < COMMENT_COOLDOWN_MS) {
      return { ok: false, error: 'too_fast', message: '留言太快了，请稍后再试。' };
    }

    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    this.sql.exec(`
      INSERT INTO comments (id, author, content, ip_hash, created_at)
      VALUES (?, ?, ?, ?, ?)
    `, id, author, content, ipHash, createdAt);

    const comment = this.sql.exec(`
      SELECT id, author, content, created_at AS createdAt
      FROM comments
      WHERE id = ?
    `, id).toArray()[0];

    return { ok: true, comment, comments: this.getComments(), flowers: this.getFlowerCount() };
  }

  addFlower(payload) {
    const ipHash = String(payload?.ipHash || 'unknown');
    const latest = this.sql.exec(`
      SELECT created_at AS createdAt
      FROM flower_events
      WHERE ip_hash = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, ipHash).toArray()[0];

    if (latest && Date.now() - Date.parse(latest.createdAt) < FLOWER_COOLDOWN_MS) {
      return { ok: true, counted: false, flowers: this.getFlowerCount() };
    }

    const createdAt = new Date().toISOString();
    this.sql.exec(`
      INSERT INTO flower_events (id, ip_hash, created_at)
      VALUES (?, ?, ?)
    `, crypto.randomUUID(), ipHash, createdAt);
    this.sql.exec(`
      INSERT INTO flowers (id, total, updated_at)
      VALUES ('main', 1, ?)
      ON CONFLICT(id) DO UPDATE SET
        total = total + 1,
        updated_at = excluded.updated_at
    `, createdAt);

    return { ok: true, counted: true, flowers: this.getFlowerCount() };
  }

  getFlowerCount() {
    const row = this.sql.exec("SELECT total FROM flowers WHERE id = 'main'").toArray()[0];
    return Number(row?.total || 0);
  }

  recordSubmission(payload) {
    const ipHash = String(payload?.ipHash || 'unknown');
    const latest = this.sql.exec(`
      SELECT created_at AS createdAt
      FROM submission_events
      WHERE ip_hash = ?
      ORDER BY created_at DESC
      LIMIT 1
    `, ipHash).toArray()[0];

    if (latest && Date.now() - Date.parse(latest.createdAt) < SUBMISSION_COOLDOWN_MS) {
      return { ok: false, error: 'too_fast', message: '提交太快了，请稍后再试。' };
    }

    this.sql.exec(`
      INSERT INTO submission_events (id, ip_hash, created_at)
      VALUES (?, ?, ?)
    `, crypto.randomUUID(), ipHash, new Date().toISOString());

    return { ok: true };
  }
}

async function getPeople() {
  const list = await fetchJson('/people-list.json');
  return list
    .map(normalizePerson)
    .filter(person => person.id && person.name);
}

async function getPerson(inputId) {
  const people = await getPeople();
  const decodedId = decodeURIComponent(inputId);
  return people.find(item => item.id === decodedId || item.path === decodedId) || null;
}

async function getProfile(inputId) {
  const person = await getPerson(inputId);
  if (!person) return null;

  const [infoResult, pageResult] = await Promise.allSettled([
    fetchJson(`/people/${encodeURIComponent(person.path)}/info.json`),
    fetchText(`/people/${encodeURIComponent(person.path)}/page.md`)
  ]);

  const info = infoResult.status === 'fulfilled' ? infoResult.value : null;
  const pageMarkdown = pageResult.status === 'fulfilled' ? pageResult.value : '';
  return normalizeProfile(person, info, pageMarkdown);
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

async function fetchText(path) {
  const response = await fetch(`${SITE.dataHost}${path}`, {
    headers: { accept: 'text/markdown,text/plain,*/*' },
    cf: {
      cacheTtl: 900,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to read memorial page: ${response.status}`);
  }

  return response.text();
}

async function handleEngagement(request, env, inputId, action) {
  if (!env?.ENGAGEMENT) {
    return dynamicJson({ error: 'engagement_unavailable' }, 503);
  }

  const person = await getPerson(inputId);
  if (!person) return dynamicJson({ error: 'not_found' }, 404);

  const stub = env.ENGAGEMENT.getByName(`person:${person.path}`);
  const ipHash = await hashVisitor(request, env);

  if (action === 'summary') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return dynamicJson(await stub.getSummary());
  }

  if (action === 'comments') {
    if (request.method === 'GET') {
      return dynamicJson({ comments: (await stub.getSummary()).comments });
    }
    if (request.method !== 'POST') return methodNotAllowed('GET, POST');

    let payload;
    try {
      payload = await readJsonBody(request);
    } catch (error) {
      return dynamicJson({ ok: false, error: 'bad_request', message: error.message }, 400);
    }

    if (payload.website) {
      return dynamicJson({ ok: true, ignored: true }, 202);
    }

    const result = await stub.addComment({
      author: payload.author,
      content: payload.content,
      ipHash
    });
    return dynamicJson(result, result.ok ? 201 : result.error === 'too_fast' ? 429 : 400);
  }

  if (action === 'flowers') {
    if (request.method === 'GET') {
      return dynamicJson({ flowers: (await stub.getSummary()).flowers });
    }
    if (request.method !== 'POST') return methodNotAllowed('GET, POST');
    return dynamicJson(await stub.addFlower({ ipHash }));
  }

  return dynamicJson({ error: 'not_found' }, 404);
}

async function handleSubmission(request, env) {
  if (request.method !== 'POST') return methodNotAllowed('POST');

  let payload;
  try {
    payload = await readJsonBody(request, SUBMISSION_BODY_LIMIT);
  } catch (error) {
    return dynamicJson({ ok: false, error: 'bad_request', message: error.message }, 400);
  }

  if (payload.website) {
    return dynamicJson({ ok: true, ignored: true }, 202);
  }

  const submission = normalizeSubmission(payload);
  const errors = validateSubmission(submission);
  if (errors.length) {
    return dynamicJson({ ok: false, error: 'validation_error', message: errors[0], errors }, 400);
  }

  if (!env?.RESEND_API_KEY) {
    return dynamicJson({
      ok: false,
      error: 'email_not_configured',
      message: '投稿邮件暂未配置，请稍后再试。'
    }, 503);
  }

  const ipHash = await hashVisitor(request, env);
  if (env?.ENGAGEMENT) {
    const throttle = await env.ENGAGEMENT.getByName('submission:global').recordSubmission({ ipHash });
    if (!throttle.ok) return dynamicJson(throttle, 429);
  }

  const markdown = buildSubmissionMarkdown(submission);
  const email = await sendSubmissionEmail(env, submission, markdown, request);
  if (!email.ok) {
    return dynamicJson({
      ok: false,
      error: 'email_failed',
      message: '投稿邮件发送失败，请稍后再试。',
      detail: email.message
    }, 502);
  }

  return dynamicJson({ ok: true, id: email.id, message: '投稿已发送。' }, 201);
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

function normalizeProfile(person, info, pageMarkdown = '') {
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
    contentHtml: renderMarkdown(cleanMemorialMarkdown(stripFrontmatter(pageMarkdown)), person.path),
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

function toContentAssetUrl(template, personPath) {
  if (!template) return '';
  const value = String(template).trim().replaceAll('${path}', `${SITE.dataHost}/people/${encodeURIComponent(personPath)}`);
  if (isSafeUrl(value)) return value;
  if (value.startsWith('/')) return `${SITE.dataHost}${value}`;
  return '';
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

function dynamicJson(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

function methodNotAllowed(allow) {
  return new Response(JSON.stringify({ error: 'method_not_allowed' }, null, 2), {
    status: 405,
    headers: {
      allow,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

async function readJsonBody(request, maxLength = 4096) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxLength) {
    throw new Error('Request body is too large');
  }

  const text = await request.text();
  if (text.length > maxLength) {
    throw new Error('Request body is too large');
  }

  if (!text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON body');
  }
}

async function hashVisitor(request, env) {
  const address = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'local';
  const userAgent = request.headers.get('user-agent') || 'unknown';
  const salt = env?.IP_HASH_SALT || SITE.subtitle;
  const data = new TextEncoder().encode(`${salt}:${address}:${userAgent}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function cleanAuthor(value) {
  return String(value || '访客')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AUTHOR_LIMIT) || '访客';
}

function cleanComment(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, COMMENT_LIMIT);
}

function normalizeSubmission(payload) {
  const fields = [
    'entryId',
    'displayName',
    'avatar',
    'description',
    'location',
    'birthDate',
    'deathDate',
    'submitterName',
    'submitterContact',
    'relationship',
    'contentWarnings',
    'intro',
    'life',
    'death',
    'remembrance',
    'alias',
    'age',
    'identity',
    'pronouns',
    'links',
    'images',
    'works',
    'sources',
    'sourceNote',
    'custom'
  ];
  return Object.fromEntries(fields.map(field => [field, cleanSubmissionText(payload?.[field])]));
}

function cleanSubmissionText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, 6000);
}

function validateSubmission(submission) {
  const errors = [];
  const required = [
    ['entryId', '请填写条目ID。'],
    ['displayName', '请填写展示名。'],
    ['avatar', '请填写头像；没有头像请写 none。'],
    ['description', '请填写一句话简介。'],
    ['location', '请填写地区；不公开请写“地区未公开”。'],
    ['birthDate', '请填写出生日期；不公开请写“出生日期未公开”。'],
    ['deathDate', '请填写逝世日期。'],
    ['submitterContact', '请填写投稿人联系方式，便于维护者核对。']
  ];

  for (const [field, message] of required) {
    if (!submission[field]) errors.push(message);
  }

  if (!/^[A-Za-z0-9_ -]{2,80}$/.test(submission.entryId || '')) {
    errors.push('条目ID 建议只使用英文、数字、下划线、短横线或空格，长度 2-80。');
  }

  if (!submission.intro && !submission.life && !submission.death && !submission.remembrance) {
    errors.push('正文至少填写“简介 / 生平与记忆 / 离世 / 念想”中的一项。');
  }

  return errors;
}

function buildSubmissionMarkdown(submission) {
  const section = (title, body) => body ? `## ${title}\n\n${body}\n` : '';
  const meta = [
    ['条目ID', submission.entryId],
    ['展示名', submission.displayName],
    ['头像', submission.avatar],
    ['一句话简介', submission.description],
    ['地区', submission.location],
    ['出生日期', submission.birthDate],
    ['逝世日期', submission.deathDate],
    ['昵称', submission.alias],
    ['年龄', submission.age],
    ['身份表述', submission.identity],
    ['代词', submission.pronouns],
    ['内容提醒', submission.contentWarnings],
    ['投稿人称呼', submission.submitterName],
    ['投稿人联系方式', submission.submitterContact],
    ['与逝者关系', submission.relationship]
  ].filter(([, value]) => value);

  return `# 勿忘我投稿：${submission.displayName}

## 基础信息

${meta.map(([key, value]) => `- ${key}：${value}`).join('\n')}

${section('简介', submission.intro)}
${section('生平与记忆', submission.life)}
${section('离世', submission.death)}
${section('念想', submission.remembrance)}
${section('公开链接', submission.links)}
${section('图片', submission.images)}
${section('作品', submission.works)}
${section('资料来源', submission.sources)}
${section('资料/授权说明', submission.sourceNote)}
${section('自选附加项', submission.custom)}
---

提交时间：${new Date().toISOString()}
`.trim();
}

async function sendSubmissionEmail(env, submission, markdown, request) {
  const from = env.SUBMISSION_FROM_EMAIL || '勿忘我投稿 <onboarding@resend.dev>';
  const to = env.SUBMISSION_TO_EMAIL || SUBMISSION_TO_EMAIL;
  const subjectName = submission.displayName.slice(0, 80);
  const body = {
    from,
    to: [to],
    subject: `新的勿忘我投稿：${subjectName}`,
    text: markdown,
    html: `<div style="font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#111">
      <h1 style="font-size:22px;margin:0 0 16px">新的勿忘我投稿：${escapeHtml(subjectName)}</h1>
      <pre style="white-space:pre-wrap;background:#f6f7f9;border:1px solid #e5e7eb;border-radius:8px;padding:16px;font:14px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace">${escapeHtml(markdown)}</pre>
    </div>`,
    tags: [
      { name: 'source', value: 'rip_lgbt_submission' }
    ]
  };

  if (isEmail(submission.submitterContact)) {
    body.reply_to = submission.submitterContact;
  }

  const idempotencyKey = await hashText(`${request.headers.get('cf-ray') || crypto.randomUUID()}:${submission.entryId}:${Date.now()}`);
  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': idempotencyKey
    },
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    return { ok: false, message: result.message || result.error || `Resend returned ${response.status}` };
  }

  return { ok: true, id: result.id };
}

async function hashText(value) {
  const data = new TextEncoder().encode(String(value));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
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
  <nav class="header-links" aria-label="页面导航">
    <a href="/submit">投稿</a>
  </nav>
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

function renderSubmitPage() {
  return shell({
    title: `投稿 · ${SITE.title}`,
    description: '向勿忘我提交新的纪念条目。',
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
    <a href="/submit">投稿</a>
  </nav>
</header>

<main class="submit-page">
  <section class="submit-hero" aria-labelledby="submit-title">
    <p class="eyebrow">SUBMISSION</p>
    <h1 id="submit-title">提交纪念条目</h1>
    <p class="lede">请尽量写清楚事实、授权和想留下的话。投稿会整理成 Markdown 发到维护者邮箱，不会立刻公开。</p>
  </section>

  <form class="submission-form" data-submission-form>
    <section class="submission-panel" aria-labelledby="required-title">
      <div class="panel-heading">
        <p class="eyebrow">REQUIRED</p>
        <h2 id="required-title">必填</h2>
        <p>缺失会严重影响页面排版和基础识别；不公开的信息请直接写“未公开”，不要留空。</p>
      </div>
      <div class="field-grid">
        ${renderField('条目ID', 'entryId', 'text', 'example_id', '用于生成网址，例如 /memorial/example_id。建议英文、数字、下划线。')}
        ${renderField('展示名', 'displayName', 'text', 'Akiball', '页面标题。可以是真名、网名、常用 ID 或“无名逝者”。')}
        ${renderField('头像', 'avatar', 'text', 'profile.jpg / none', '用于列表和详情页顶部；没有头像写 none，授权不确定请说明。')}
        ${renderField('一句话简介', 'description', 'text', '一个温柔、热爱游戏和做饭的跨性别女孩。', '列表摘要和详情页顶部介绍，建议 20-60 字。')}
        ${renderField('地区', 'location', 'text', '广东深圳 / 地区未公开', '生活、常住、出生或主要被联系到的地区；不确定写“地区未公开”。')}
        ${renderField('出生日期', 'birthDate', 'text', '2007-02-12 / 出生日期未公开', '可写 YYYY-MM-DD、YYYY-MM、YYYY；不公开请写明。')}
        ${renderField('逝世日期', 'deathDate', 'text', '2025-06-19 / unknown', '用于排序和展示；不确定可以写 YYYY、YYYY-MM 或 unknown。')}
        ${renderField('投稿人联系方式', 'submitterContact', 'text', '邮箱 / Telegram / 其他联系方式', '只发给维护者核对，不公开。')}
        ${renderField('投稿人称呼', 'submitterName', 'text', '你的称呼', '只发给维护者核对，不公开。')}
        ${renderField('与逝者关系', 'relationship', 'text', '朋友 / 亲属 / 伴侣 / 社群成员', '帮助维护者判断资料来源，不公开。')}
      </div>
    </section>

    <section class="submission-panel" aria-labelledby="conditional-title">
      <div class="panel-heading">
        <p class="eyebrow">CONTENT</p>
        <h2 id="conditional-title">选择性必填</h2>
        <p>正文至少填写一项。正文越完整，页面越不像空档案；推荐至少写“简介 + 念想”。</p>
      </div>
      <div class="field-grid single">
        ${renderTextarea('内容提醒', 'contentWarnings', '自杀、精神健康、家暴、性暴力、校园暴力、药物、仇恨犯罪、死亡细节；没有就写“无明显内容提醒”。', '给读者的创伤内容提示。')}
        ${renderTextarea('简介', 'intro', '写 ta 是谁：常用名字、性格、爱好、给朋友留下的印象。', '这是读者进入页面后最需要知道的基础介绍。')}
        ${renderTextarea('生平与记忆', 'life', '写 ta 怎样活过：爱好、作品、关系、社群经历、朋友记得的小事。', '不是简历，而是具体的人生片段。')}
        ${renderTextarea('离世', 'death', '写公开且适合发布的离世信息；不写未确认传闻和过度死亡细节。', '只保留必要事实，避免让死亡细节覆盖 ta 的一生。')}
        ${renderTextarea('念想', 'remembrance', '写活着的人想留给 ta 的话：晚安、谢谢、对不起、我记得你、愿你不再痛苦。', '“念想”就是纪念、道别、祝福、感谢、遗憾、想念；不是资料介绍。')}
      </div>
    </section>

    <section class="submission-panel" aria-labelledby="optional-title">
      <div class="panel-heading">
        <p class="eyebrow">OPTIONAL</p>
        <h2 id="optional-title">选填</h2>
        <p>这些内容可以丰富页面效果；没有就空着。</p>
      </div>
      <div class="field-grid">
        ${renderField('昵称', 'alias', 'text', 'Aki、小盐、折耳猫', 'ta 的昵称、常用 ID、朋友常叫的名字。')}
        ${renderField('年龄', 'age', 'text', '18', '逝世时年龄，不确定可以不填。')}
        ${renderField('身份表述', 'identity', 'text', '跨性别女性 / 非二元 / 性别多元', '仅在适合公开且有依据时填写，不要猜测。')}
        ${renderField('代词', 'pronouns', 'text', '她 / 他 / ta / they', 'ta 希望被如何称呼；没有公开信息可不填。')}
        ${renderTextarea('公开链接', 'links', 'twitter: https://...\nblog: https://...', '公开主页、社交账号、博客、作品页；不要提交私人账号。')}
        ${renderTextarea('图片', 'images', 'profile.jpg：公开头像，可用于页面头像。\nphoto1.jpg：朋友提供，已同意公开。', '列出图片文件、内容、来源和是否允许公开。')}
        ${renderTextarea('作品', 'works', '作品名：链接或说明', '文章、音乐、视频、项目、绘画、游戏、代码等。')}
        ${renderTextarea('资料来源', 'sources', '公开报道、讣告、朋友说明、社交平台公开内容。', '用于维护者核对事实，不一定展示。')}
        ${renderTextarea('资料/授权说明', 'sourceNote', '头像/照片是否允许公开；哪些信息只供核对。', '保护隐私和授权边界。')}
      </div>
    </section>

    <section class="submission-panel" aria-labelledby="custom-title">
      <div class="panel-heading">
        <p class="eyebrow">CUSTOM</p>
        <h2 id="custom-title">自选</h2>
        <p>投稿人自创附加项。不保证单独排版，但会作为正文素材发给维护者。</p>
      </div>
      ${renderTextarea('自选附加项', 'custom', '喜欢的事物：\n喜欢的歌：\n重要日期：\n纪念色：\n想保留的一句话：', '任何你觉得重要、但上面没覆盖的内容。')}
    </section>

    <label class="hp-field" aria-hidden="true">
      <span>Website</span>
      <input name="website" tabindex="-1" autocomplete="off">
    </label>

    <div class="submission-actions">
      <button class="button primary" type="submit">发送投稿</button>
      <p class="comment-status" data-submission-status role="status"></p>
    </div>
  </form>
</main>

${renderFooter()}
`
  });
}

function renderField(label, name, type, placeholder, help) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <input name="${escapeAttr(name)}" type="${escapeAttr(type)}" placeholder="${escapeAttr(placeholder)}">
      <small>${escapeHtml(help)}</small>
    </label>`;
}

function renderTextarea(label, name, placeholder, help) {
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <textarea name="${escapeAttr(name)}" rows="5" placeholder="${escapeAttr(placeholder)}"></textarea>
      <small>${escapeHtml(help)}</small>
    </label>`;
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
  const flowerAction = `
        <div class="profile-actions">
          <button class="flower-button compact" type="button" data-flower-button aria-label="为 ${escapeAttr(profile.name)} 献花">
            <span aria-hidden="true">✦</span>
            <span>献花</span>
            <strong data-flower-count>0</strong>
          </button>
          <a class="button quiet" href="#remembrance">留言</a>
        </div>`;
  const story = profile.contentHtml
    ? `<section class="profile-section story-section" aria-labelledby="story-title">
      <h2 id="story-title">纪念正文</h2>
      <div class="story">${profile.contentHtml}</div>
    </section>`
    : '';
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
        ${flowerAction}
      </div>
    </header>

    <section class="profile-section" aria-labelledby="facts-title">
      <h2 id="facts-title">公开信息</h2>
      <dl class="facts">
        ${facts}
      </dl>
    </section>

    ${story}

    ${renderEngagementSection(profile)}

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

function renderEngagementSection(profile) {
  return `
    <section id="remembrance" class="profile-section engagement-section" data-engagement data-person-id="${escapeAttr(profile.path)}" aria-labelledby="remembrance-title">
      <div class="engagement-head">
        <div>
          <p class="eyebrow">REMEMBRANCE</p>
          <h2 id="remembrance-title">献花与留言</h2>
        </div>
        <button class="flower-button" type="button" data-flower-button aria-label="为 ${escapeAttr(profile.name)} 献花">
          <span aria-hidden="true">✦</span>
          <span>献花</span>
          <strong data-flower-count>0</strong>
        </button>
      </div>

      <div class="comment-shell">
        <form class="comment-form" data-comment-form>
          <label>
            <span>称呼</span>
            <input name="author" maxlength="${AUTHOR_LIMIT}" autocomplete="name" placeholder="访客">
          </label>
          <label>
            <span>留言</span>
            <textarea name="content" maxlength="${COMMENT_LIMIT}" rows="5" required placeholder="写下一句想留下的话"></textarea>
          </label>
          <label class="hp-field" aria-hidden="true">
            <span>Website</span>
            <input name="website" tabindex="-1" autocomplete="off">
          </label>
          <div class="comment-actions">
            <button class="button primary" type="submit">发送留言</button>
            <p class="comment-status" data-comment-status role="status"></p>
          </div>
        </form>

        <div class="comments-area">
          <div class="comments-title">
            <h3>留言</h3>
            <span data-comment-count>0 条</span>
          </div>
          <ol class="comments-list" data-comments-list>
            <li class="comment-empty">正在读取留言…</li>
          </ol>
        </div>
      </div>
    </section>`;
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
  <p class="footer-actions">
    <a class="button primary" href="/submit">提交纪念条目</a>
  </p>
</footer>`;
}

function baseStyles() {
  return `
:root {
  color-scheme: dark;
  --paper: #050509;
  --paper-2: #0d0d16;
  --ink: #fbf7ff;
  --muted: #b8b1c3;
  --faint: #7f7a89;
  --line: rgba(251, 247, 255, .13);
  --line-strong: rgba(251, 247, 255, .24);
  --petal: #f5a9b8;
  --petal-dark: #f5a9b8;
  --blue: #5bcefa;
  --rose: #f5a9b8;
  --card: rgba(11, 12, 20, .72);
  --shadow: 0 28px 90px rgba(0, 0, 0, .36);
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
    linear-gradient(120deg, rgba(91, 206, 250, .12), transparent 26%, transparent 72%, rgba(245, 169, 184, .14)),
    linear-gradient(180deg, #050509 0%, #0b0c15 56%, #08060b 100%),
    var(--paper);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  pointer-events: none;
  opacity: .18;
  background-image:
    linear-gradient(rgba(251, 247, 255, .05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(251, 247, 255, .05) 1px, transparent 1px),
    linear-gradient(120deg, transparent 0%, rgba(91, 206, 250, .08) 48%, rgba(245, 169, 184, .08) 52%, transparent 100%);
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

.facts {
  display: grid;
  gap: .55rem;
  margin: 0;
}

.story-section {
  padding-top: 2.4rem;
}

.story {
  max-width: 760px;
  color: #26221d;
  font-size: 1rem;
  line-height: 1.95;
}

.story h3,
.story h4,
.story h5,
.story h6 {
  margin: 2.1rem 0 .8rem;
  font-family: var(--serif);
  line-height: 1.35;
}

.story h3 { font-size: 1.55rem; }
.story h4 { font-size: 1.28rem; }
.story h5,
.story h6 { font-size: 1.08rem; }

.story p {
  margin: 1rem 0;
}

.story blockquote {
  margin: 1.4rem 0;
  padding: .15rem 0 .15rem 1.1rem;
  border-left: 3px solid var(--petal);
  color: #4d463d;
}

.story blockquote p {
  margin: .7rem 0;
}

.story ul,
.story ol {
  padding-left: 1.35rem;
}

.story li {
  margin: .45rem 0;
}

.story a {
  color: var(--petal-dark);
}

.story code {
  padding: .12rem .3rem;
  border: 1px solid var(--line);
  border-radius: 4px;
  background: rgba(255, 255, 255, .5);
}

.story-details {
  margin: 1rem 0;
  padding: .9rem 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, .34);
}

.story-details summary {
  cursor: pointer;
  color: var(--petal-dark);
  font-weight: 700;
}

.story-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: .75rem;
  margin: 1.4rem 0;
}

.story-gallery img,
.story-inline-image {
  display: block;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgba(255, 255, 255, .5);
}

.story-gallery img {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}

.story-inline-image {
  margin: 1rem 0;
  height: auto;
}

.footnotes {
  margin-top: 2rem;
  padding-top: 1rem;
  border-top: 1px solid var(--line);
  color: var(--muted);
  font-size: .92rem;
}

.footnotes ol {
  padding-left: 1.25rem;
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

.site-header {
  background: rgba(5, 5, 9, .72);
  box-shadow: 0 1px 0 rgba(255, 255, 255, .06);
}

.brand-mark,
.petal,
.profile-mark {
  border: 1px solid transparent;
  color: var(--ink);
  background:
    linear-gradient(var(--paper-2), var(--paper-2)) padding-box,
    linear-gradient(145deg, var(--blue), #fff, var(--rose)) border-box;
  box-shadow: 0 12px 38px rgba(91, 206, 250, .14);
}

.brand strong {
  color: var(--ink);
}

.brand small,
.header-links,
.back-link,
.result-count {
  color: var(--muted);
}

.eyebrow {
  color: var(--blue);
}

.hero {
  position: relative;
  min-height: min(720px, calc(100svh - 8rem));
  padding-top: clamp(3.6rem, 8vw, 6.4rem);
  padding-bottom: clamp(2.6rem, 5vw, 3.8rem);
}

.hero::before {
  content: "";
  position: absolute;
  left: 0;
  top: clamp(3rem, 9vw, 7rem);
  width: min(22rem, 52vw);
  height: 2px;
  background: linear-gradient(90deg, var(--blue), #fff, var(--rose), transparent);
  opacity: .8;
}

.hero-copy,
.hero-panel,
.care-note,
.section-head,
.profile-hero,
.profile-section,
.person-card {
  animation: rise .72s cubic-bezier(.2, .78, .2, 1) both;
}

.hero-panel,
.person-link,
.care-note,
.profile-section,
.story-details,
.external-links a,
.comment-form,
.comments-area {
  border-color: var(--line);
  background: linear-gradient(180deg, rgba(255, 255, 255, .08), rgba(255, 255, 255, .035));
  box-shadow: var(--shadow);
}

.hero-panel {
  backdrop-filter: blur(22px);
}

.hero-panel div,
.profile-hero,
.profile-section,
.site-footer {
  border-color: var(--line);
}

.button,
.search input,
.comment-form input,
.comment-form textarea {
  color: var(--ink);
  border-color: var(--line-strong);
  background: rgba(255, 255, 255, .07);
}

.button.primary {
  color: #07070b;
  border-color: transparent;
  background: linear-gradient(135deg, var(--blue), #fff 48%, var(--rose));
  box-shadow: 0 14px 38px rgba(245, 169, 184, .16);
}

.button.quiet {
  color: var(--ink);
}

.button:hover,
.person-link:hover,
.external-links a:hover {
  border-color: rgba(255, 255, 255, .36);
}

.person-link {
  background: rgba(255, 255, 255, .055);
  backdrop-filter: blur(14px);
}

.person-link:hover {
  background: rgba(255, 255, 255, .095);
}

.person-avatar,
.profile-avatar,
.story-gallery img,
.story-inline-image {
  border-color: rgba(255, 255, 255, .18);
  background: rgba(255, 255, 255, .06);
}

.person-name,
.profile h1,
.profile-desc,
.story {
  color: var(--ink);
}

.person-date,
.person-id,
.person-desc,
.profile-copy,
.fact-row dt,
.footnotes,
.not-found p,
.site-footer {
  color: var(--muted);
}

.profile-date,
.story a,
.story-details summary {
  color: var(--blue);
}

.story {
  max-width: 780px;
}

.story blockquote {
  border-left-color: var(--rose);
  color: #ded6e5;
  background: linear-gradient(90deg, rgba(245, 169, 184, .08), transparent);
}

.story code {
  border-color: var(--line);
  background: rgba(255, 255, 255, .08);
}

.fact-row {
  border-bottom-color: rgba(255, 255, 255, .08);
}

.external-links a {
  background: rgba(255, 255, 255, .06);
}

.engagement-section {
  margin: 2rem 0;
  padding: clamp(1.2rem, 3vw, 2rem);
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: calc(var(--radius) + 6px);
  background:
    linear-gradient(135deg, rgba(91, 206, 250, .11), transparent 28%),
    linear-gradient(315deg, rgba(245, 169, 184, .12), transparent 32%),
    rgba(255, 255, 255, .055);
  box-shadow: var(--shadow);
}

.engagement-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.engagement-head h2 {
  margin-bottom: 0;
}

.flower-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .55rem;
  min-height: 2.75rem;
  padding: .7rem .9rem;
  border: 1px solid transparent;
  border-radius: 999px;
  color: #07070b;
  font: inherit;
  font-weight: 750;
  cursor: pointer;
  background:
    linear-gradient(135deg, var(--blue), #fff 48%, var(--rose)) padding-box,
    linear-gradient(135deg, var(--blue), var(--rose)) border-box;
  box-shadow: 0 18px 42px rgba(91, 206, 250, .14);
  transition: transform .18s ease, filter .18s ease, opacity .18s ease;
}

.flower-button.compact {
  min-height: 2.6rem;
}

.flower-button:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.flower-button:disabled {
  cursor: wait;
  opacity: .74;
}

.flower-button[data-bloom="true"] {
  animation: bloom .52s ease;
}

.flower-button strong {
  min-width: 1.8rem;
  padding: .15rem .45rem;
  border-radius: 999px;
  color: var(--ink);
  background: rgba(5, 5, 9, .76);
}

.comment-shell {
  display: grid;
  grid-template-columns: minmax(260px, .9fr) minmax(0, 1.1fr);
  gap: 1rem;
}

.comment-form,
.comments-area {
  padding: 1rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.comment-form {
  display: grid;
  gap: .85rem;
}

.comment-form label {
  display: grid;
  gap: .4rem;
  color: var(--muted);
  font-size: .9rem;
}

.comment-form input,
.comment-form textarea {
  width: 100%;
  border-radius: var(--radius);
  padding: .75rem .85rem;
  font: inherit;
  outline: none;
  resize: vertical;
}

.comment-form input:focus,
.comment-form textarea:focus,
.search input:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(91, 206, 250, .16);
}

.hp-field {
  position: absolute;
  left: -100vw;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.comment-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: .75rem;
}

.comment-status {
  margin: 0;
  color: var(--muted);
  font-size: .9rem;
}

.comment-status[data-tone="ok"] {
  color: var(--blue);
}

.comment-status[data-tone="error"] {
  color: var(--rose);
}

.comments-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: .85rem;
}

.comments-title h3 {
  font-size: 1.2rem;
}

.comments-title span {
  color: var(--muted);
  font-size: .9rem;
}

.comments-list {
  display: grid;
  gap: .75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.comment-item {
  padding: .85rem;
  border: 1px solid rgba(255, 255, 255, .1);
  border-radius: var(--radius);
  background: rgba(5, 5, 9, .34);
}

.comment-meta {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: .75rem;
  color: var(--muted);
  font-size: .86rem;
}

.comment-meta strong {
  color: var(--ink);
}

.comment-content {
  margin: .55rem 0 0;
  color: #eee8f4;
  line-height: 1.75;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.comment-empty {
  color: var(--muted);
  line-height: 1.7;
}

.submit-page {
  max-width: 1080px;
  padding: clamp(3rem, 7vw, 5rem) 0 5rem;
}

.submit-hero {
  max-width: 820px;
  margin-bottom: 2rem;
  animation: rise .72s cubic-bezier(.2, .78, .2, 1) both;
}

.submit-hero h1 {
  font-size: clamp(3.2rem, 10vw, 6.8rem);
  line-height: .96;
}

.submission-form {
  display: grid;
  gap: 1rem;
}

.submission-panel {
  padding: clamp(1.1rem, 3vw, 1.6rem);
  border: 1px solid var(--line);
  border-radius: calc(var(--radius) + 6px);
  background:
    linear-gradient(135deg, rgba(91, 206, 250, .08), transparent 28%),
    linear-gradient(315deg, rgba(245, 169, 184, .09), transparent 32%),
    rgba(255, 255, 255, .055);
  box-shadow: var(--shadow);
  animation: rise .72s cubic-bezier(.2, .78, .2, 1) both;
}

.panel-heading {
  max-width: 760px;
  margin-bottom: 1rem;
}

.panel-heading h2 {
  margin-bottom: .45rem;
  font-size: clamp(1.65rem, 4vw, 2.4rem);
}

.panel-heading p:last-child {
  margin: 0;
  color: var(--muted);
  line-height: 1.75;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: .9rem;
}

.field-grid.single {
  grid-template-columns: 1fr;
}

.field {
  display: grid;
  gap: .42rem;
}

.field span {
  color: var(--ink);
  font-weight: 760;
}

.field small {
  color: var(--muted);
  line-height: 1.55;
}

.field input,
.field textarea {
  width: 100%;
  min-height: 2.8rem;
  padding: .75rem .85rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--ink);
  font: inherit;
  background: rgba(255, 255, 255, .07);
  outline: none;
}

.field textarea {
  min-height: 8.6rem;
  resize: vertical;
  line-height: 1.7;
}

.field input:focus,
.field textarea:focus {
  border-color: var(--blue);
  box-shadow: 0 0 0 3px rgba(91, 206, 250, .16);
}

.submission-actions {
  position: sticky;
  bottom: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: .9rem 0;
  background: linear-gradient(180deg, transparent, rgba(5, 5, 9, .92) 28%);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes bloom {
  0% { transform: scale(1); }
  45% { transform: scale(1.08); }
  100% { transform: scale(1); }
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

.footer-actions {
  margin-top: 1rem !important;
}

.footer-actions .button {
  min-height: 2.55rem;
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

  .comment-shell {
    grid-template-columns: 1fr;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .engagement-head {
    align-items: flex-start;
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

  .engagement-head,
  .comment-actions,
  .submission-actions,
  .profile-actions {
    display: grid;
  }

  .flower-button {
    width: 100%;
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
    animation: none !important;
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

(() => {
  const root = document.querySelector('[data-engagement]');
  if (!root) return;

  const personId = root.dataset.personId;
  const countNodes = Array.from(document.querySelectorAll('[data-flower-count]'));
  const flowerButtons = Array.from(document.querySelectorAll('[data-flower-button]'));
  const list = root.querySelector('[data-comments-list]');
  const count = root.querySelector('[data-comment-count]');
  const form = root.querySelector('[data-comment-form]');
  const status = root.querySelector('[data-comment-status]');

  const setFlowerCount = value => {
    for (const node of countNodes) node.textContent = String(value || 0);
  };

  const setStatus = (message, tone = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  const formatDate = value => {
    try {
      return new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    } catch {
      return value || '';
    }
  };

  const renderComments = comments => {
    if (!list || !count) return;
    count.textContent = (comments?.length || 0) + ' 条';
    list.replaceChildren();

    if (!comments?.length) {
      const empty = document.createElement('li');
      empty.className = 'comment-empty';
      empty.textContent = '还没有留言。';
      list.append(empty);
      return;
    }

    for (const item of comments) {
      const li = document.createElement('li');
      li.className = 'comment-item';

      const meta = document.createElement('div');
      meta.className = 'comment-meta';

      const author = document.createElement('strong');
      author.textContent = item.author || '访客';

      const time = document.createElement('time');
      time.dateTime = item.createdAt || '';
      time.textContent = formatDate(item.createdAt);

      const content = document.createElement('p');
      content.className = 'comment-content';
      content.textContent = item.content || '';

      meta.append(author, time);
      li.append(meta, content);
      list.append(li);
    }
  };

  const load = async () => {
    try {
      const response = await fetch('/api/memorials/' + encodeURIComponent(personId) + '/engagement');
      const data = await response.json();
      setFlowerCount(data.flowers);
      renderComments(data.comments);
    } catch {
      if (list) {
        list.replaceChildren(Object.assign(document.createElement('li'), {
          className: 'comment-empty',
          textContent: '留言暂时读取失败。'
        }));
      }
    }
  };

  for (const button of flowerButtons) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch('/api/memorials/' + encodeURIComponent(personId) + '/flowers', {
          method: 'POST'
        });
        const data = await response.json();
        setFlowerCount(data.flowers);
        for (const item of flowerButtons) {
          item.dataset.bloom = 'true';
          setTimeout(() => { delete item.dataset.bloom; }, 540);
        }
      } finally {
        button.disabled = false;
      }
    });
  }

  if (form) {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = new FormData(form);
      const payload = {
        author: data.get('author'),
        content: data.get('content'),
        website: data.get('website')
      };

      setStatus('发送中…');
      form.querySelector('button[type="submit"]').disabled = true;

      try {
        const response = await fetch('/api/memorials/' + encodeURIComponent(personId) + '/comments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (!response.ok || !result.ok) {
          setStatus(result.message || '留言没有发送成功。', 'error');
          return;
        }

        form.reset();
        setStatus('已留下。', 'ok');
        renderComments(result.comments || []);
      } catch {
        setStatus('留言没有发送成功。', 'error');
      } finally {
        form.querySelector('button[type="submit"]').disabled = false;
      }
    });
  }

  load();
})();

(() => {
  const form = document.querySelector('[data-submission-form]');
  if (!form) return;

  const status = form.querySelector('[data-submission-status]');
  const submit = form.querySelector('button[type="submit"]');
  const fields = [
    'entryId',
    'displayName',
    'avatar',
    'description',
    'location',
    'birthDate',
    'deathDate',
    'submitterName',
    'submitterContact',
    'relationship',
    'contentWarnings',
    'intro',
    'life',
    'death',
    'remembrance',
    'alias',
    'age',
    'identity',
    'pronouns',
    'links',
    'images',
    'works',
    'sources',
    'sourceNote',
    'custom',
    'website'
  ];

  const setStatus = (message, tone = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.tone = tone;
  };

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const data = new FormData(form);
    const payload = Object.fromEntries(fields.map(field => [field, data.get(field) || '']));

    setStatus('发送中…');
    submit.disabled = true;

    try {
      const response = await fetch('/api/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setStatus(result.message || '投稿没有发送成功。', 'error');
        return;
      }

      form.reset();
      setStatus('已发送到维护者邮箱。', 'ok');
    } catch {
      setStatus('投稿没有发送成功。', 'error');
    } finally {
      submit.disabled = false;
    }
  });
})();
`;
}

function stripFrontmatter(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---\n')) return text.trim();
  const end = text.indexOf('\n---', 4);
  if (end === -1) return text.trim();
  const nextLine = text.indexOf('\n', end + 4);
  if (nextLine === -1) return '';
  return text.slice(nextLine + 1).trim();
}

function cleanMemorialMarkdown(markdown) {
  const sourcePattern = /One\s+Among\s+Us|one-among\.us|\u90a3\u4e9b\u79cb\u53f6|\u6761\u76ee\u8d21\u732e|\u672c\u4e34\u65f6\u9875\u9762|Github\s*\u6570\u636e\u5e93|GitHub\s*\u6570\u636e\u5e93/i;
  return String(markdown || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block => block && !sourcePattern.test(block))
    .join('\n\n')
    .trim();
}

function renderMarkdown(markdown, personPath) {
  const preprocessed = preprocessMarkdown(markdown);
  const { lines, footnotes } = extractFootnotes(preprocessed.split('\n'));
  let html = renderMarkdownLines(lines, personPath);

  if (footnotes.length) {
    html += `<section class="footnotes" aria-label="脚注"><ol>${footnotes.map(note => `
      <li id="fn-${escapeAttr(note.id)}">${renderInline(note.content, personPath)}</li>`).join('')}</ol></section>`;
  }

  return html.trim();
}

function preprocessMarkdown(markdown) {
  let text = String(markdown || '').replace(/\r\n/g, '\n');

  text = text.replace(/<!--[\s\S]*?-->/g, '\n');
  text = text.replace(
    /<([a-z][a-z0-9:-]*)\b[^>]*style\s*=\s*["'][^"']*(?:font-size\s*:\s*0(?:\.\d+)?px|display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
    '\n'
  );
  text = text.replace(/<PhotoScroll\s+photos=\{\[([\s\S]*?)\]\}\s*\/?>/gi, (_, photos) => galleryToken(photos));
  text = text.replace(/<PhotoScroll\s+photos=\{(\[[\s\S]*?\])\}\s*\/?>/gi, (_, photos) => galleryToken(photos));
  text = text.replace(/<summary>([\s\S]*?)<\/summary>/gi, (_, summary) => `\n\n[[SUMMARY:${encodeURIComponent(summary.trim())}]]\n\n`);
  text = text.replace(/<details[^>]*>/gi, '\n\n[[DETAILS_OPEN]]\n\n');
  text = text.replace(/<\/details>/gi, '\n\n[[DETAILS_CLOSE]]\n\n');
  text = text.replace(/<\/?BlurBlock[^>]*>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<div[^>]*>\s*<\/div>/gi, '\n');
  text = text.replace(/<\/?[A-Z][A-Za-z0-9]*(?:\s[^>]*)?\/?>/g, '\n');

  return text;
}

function galleryToken(markup) {
  const photos = [];
  String(markup || '').replace(/['"]([^'"]+)['"]/g, (_, url) => {
    photos.push(encodeURIComponent(url));
    return '';
  });

  return photos.length ? `\n\n[[GALLERY:${photos.join('|')}]]\n\n` : '\n';
}

function extractFootnotes(lines) {
  const body = [];
  const footnotes = [];

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\[\^([^\]]+)\]:\s*(.*)$/);
    if (!match) {
      body.push(lines[i]);
      continue;
    }

    const [, id, firstLine] = match;
    const noteLines = [firstLine];
    while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]) && lines[i + 1].trim()) {
      noteLines.push(lines[i + 1].trim());
      i++;
    }
    footnotes.push({ id, content: noteLines.join(' ') });
  }

  return { lines: body, footnotes };
}

function renderMarkdownLines(lines, personPath) {
  let html = '';
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html += `<p>${renderInline(paragraph.join('\n'), personPath).replace(/\n/g, '<br>')}</p>`;
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    if (trimmed === '[[DETAILS_OPEN]]') {
      flushParagraph();
      html += '<details class="story-details">';
      continue;
    }

    if (trimmed === '[[DETAILS_CLOSE]]') {
      flushParagraph();
      html += '</details>';
      continue;
    }

    const summary = trimmed.match(/^\[\[SUMMARY:(.*)\]\]$/);
    if (summary) {
      flushParagraph();
      html += `<summary>${renderInline(decodeURIComponent(summary[1]), personPath)}</summary>`;
      continue;
    }

    const gallery = trimmed.match(/^\[\[GALLERY:(.*)\]\]$/);
    if (gallery) {
      flushParagraph();
      html += renderGallery(gallery[1], personPath);
      continue;
    }

    const heading = trimmed.match(/^(#{2,5})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = Math.min(heading[1].length + 1, 6);
      html += `<h${level}>${renderInline(heading[2], personPath)}</h${level}>`;
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      flushParagraph();
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      i--;
      html += `<blockquote>${quoteLines.map(item => `<p>${renderInline(item, personPath)}</p>`).join('')}</blockquote>`;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i++;
      }
      i--;
      html += `<ul>${items.map(item => `<li>${renderInline(item, personPath)}</li>`).join('')}</ul>`;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      const items = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      i--;
      html += `<ol>${items.map(item => `<li>${renderInline(item, personPath)}</li>`).join('')}</ol>`;
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  return html;
}

function renderGallery(value, personPath) {
  const urls = String(value || '')
    .split('|')
    .map(item => toContentAssetUrl(decodeURIComponent(item), personPath))
    .filter(Boolean);

  if (!urls.length) return '';

  return `<div class="story-gallery">${urls.map(url => `
    <img src="${escapeAttr(url)}" alt="" loading="lazy" decoding="async">`).join('')}</div>`;
}

function renderInline(value, personPath) {
  let html = escapeHtml(value);

  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    const src = toContentAssetUrl(decodeHtml(url), personPath);
    return src ? `<img class="story-inline-image" src="${escapeAttr(src)}" alt="${escapeAttr(decodeHtml(alt))}" loading="lazy" decoding="async">` : '';
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const href = decodeHtml(url);
    return isSafeUrl(href)
      ? `<a href="${escapeAttr(href)}" target="_blank" rel="noopener">${label}</a>`
      : label;
  });

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  html = html.replace(/\[\^([^\]]+)\]/g, '<sup>[$1]</sup>');

  return html;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
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
