/*
  Blog loader
  -----------
  Reads /data/posts.json (a manifest of markdown filenames), fetches each
  file from /blog/posts/, parses a YAML-lite front-matter block, and:

    - on blog.html: renders a card grid (title, date, tags, cover, excerpt)
    - on post.html?slug=<filename-without-.md>: renders the full post

  Uses marked.js (CDN) to render Markdown to HTML.

  To add a post: write a .md file in blog/posts/ with a front-matter block
  (see any existing post for the format), add its filename to
  data/posts.json, commit, push. Set "published: false" in the front-matter
  to keep it hidden until you're ready.
*/
(function () {
  // blog.html lives at site root; the post viewer lives at /blog/post.html;
  // markdown source files live in /blog/posts/. Each page sets
  // window.BLOG_PATHS before loading this script (see blog.html / blog/post.html).
  const paths = window.BLOG_PATHS || { postsDir: 'blog/posts/', manifest: 'data/posts.json', postViewer: 'blog/post.html' };
  const POSTS_DIR = paths.postsDir;
  const MANIFEST = paths.manifest;

  function parseFrontMatter(raw) {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!match) return { meta: {}, body: raw };
    const [, fmBlock, body] = match;
    const meta = {};
    fmBlock.split('\n').forEach(line => {
      const idx = line.indexOf(':');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else if (val === 'true') {
        val = true;
      } else if (val === 'false') {
        val = false;
      } else {
        val = val.replace(/^["']|["']$/g, '');
      }
      meta[key] = val;
    });
    return { meta, body };
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function excerpt(markdownBody, len) {
    const plain = markdownBody
      .replace(/```[\s\S]*?```/g, '')
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/[#>*_`~-]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > len ? plain.slice(0, len).trim() + '…' : plain;
  }

  function formatDate(d) {
    try {
      const date = new Date(d);
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
      return d;
    }
  }

  async function fetchManifest() {
    const res = await fetch(MANIFEST, { cache: 'no-store' });
    return res.json();
  }

  async function fetchPost(filename) {
    const res = await fetch(POSTS_DIR + filename, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not load ' + filename);
    const raw = await res.text();
    const { meta, body } = parseFrontMatter(raw);
    const slug = filename.replace(/\.md$/, '');
    return { slug, filename, meta, body };
  }

  async function loadAllPosts() {
    const manifest = await fetchManifest();
    const files = manifest.posts || [];
    const posts = await Promise.all(files.map(fetchPost));
    posts.sort((a, b) => new Date(b.meta.date) - new Date(a.meta.date));
    return posts;
  }

  function renderCard(post) {
    const { meta, body, slug } = post;
    const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? [meta.tags] : []);
    const postUrl = paths.postViewer + '?slug=' + encodeURIComponent(slug);
    const cover = meta.cover
      ? `<a href="${postUrl}"><img src="${escapeHtml(meta.cover)}" alt="" style="width:100%;height:160px;object-fit:cover;border-radius:3px;margin-bottom:14px;border:1px solid var(--panel-line);"></a>`
      : '';
    return `
    <div class="post">
      ${cover}
      <span class="post-date">${escapeHtml(formatDate(meta.date))}</span>
      <a href="${postUrl}">
        <h3>${escapeHtml(meta.title || slug)}</h3>
      </a>
      <p>${escapeHtml(excerpt(body, 160))}</p>
      ${tags.length ? `<div class="tags" style="margin-top:12px;">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
    </div>`;
  }

  async function initIndex() {
    const grid = document.querySelector('.posts');
    const emptyState = document.querySelector('.empty-state');
    if (!grid) return;

    let posts;
    try {
      posts = await loadAllPosts();
    } catch (err) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    posts = posts.filter(p => p.meta.published !== false);

    if (posts.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    }
    if (emptyState) emptyState.style.display = 'none';
    grid.innerHTML = posts.map(renderCard).join('\n');
  }

  async function initPost() {
    const container = document.getElementById('post-content');
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    const slug = params.get('slug');
    if (!slug) {
      container.innerHTML = '<p>No post specified.</p>';
      return;
    }

    let post;
    try {
      post = await fetchPost(slug + '.md');
    } catch (err) {
      container.innerHTML = '<p>Post not found.</p>';
      return;
    }

    if (post.meta.published === false) {
      container.innerHTML = '<p>This post is not yet published.</p>';
      return;
    }

    const tags = Array.isArray(post.meta.tags) ? post.meta.tags : (post.meta.tags ? [post.meta.tags] : []);
    document.title = (post.meta.title || post.slug) + ' — Blog';

    const headHtml = `
      <span class="post-date">${escapeHtml(formatDate(post.meta.date))}</span>
      <h1 style="margin-top:8px;">${escapeHtml(post.meta.title || post.slug)}</h1>
      ${tags.length ? `<div class="tags" style="margin-bottom:24px;">${tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
      ${post.meta.cover ? `<img src="${escapeHtml(post.meta.cover)}" alt="" style="width:100%;border-radius:4px;border:1px solid var(--panel-line);margin-bottom:28px;">` : ''}
    `;

    const bodyHtml = window.marked ? window.marked.parse(post.body) : `<pre>${escapeHtml(post.body)}</pre>`;

    container.innerHTML = headHtml + `<div class="post-body">${bodyHtml}</div>`;

    if (window.hljs) {
      container.querySelectorAll('pre code').forEach(block => window.hljs.highlightElement(block));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    initIndex();
    initPost();
  });
})();
