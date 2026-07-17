/*
  Case Files loader
  ------------------
  Reads /data/casefiles.json and renders the card grid on case-files.html.

  To publish a writeup: open data/casefiles.json, find the machine, set
  "published": true, commit, push. No HTML editing required.

  Card states:
    - published: true   -> full linked card, green "Full write-up available" status
    - published: false  -> locked/redacted teaser card, no link, status shows
                            "Full write-up: pending retirement" (active) or
                            "Full write-up: locked" (retired but not yet published)
*/
(function () {
  const GRID_ID = 'files-grid';

  function diffLabel(d) {
    if (!d || d === 'n/a') return '';
    return d.charAt(0).toUpperCase() + d.slice(1);
  }

  function fileTab(entry) {
    const parts = [];
    if (entry.view === 'machine') {
      parts.push(diffLabel(entry.difficulty));
      if (entry.os) parts.push(entry.os);
    } else {
      parts.push('CTF Challenge');
      if (entry.os) parts.push(entry.os);
    }
    return parts.filter(Boolean).join(' · ');
  }

  function statusBadge(entry) {
    if (entry.published) {
      return `<span class="status" style="border-color:#2f6b3a;color:#2f6b3a;">Full write-up available</span>`;
    }
    if (entry.status === 'active') {
      return `<span class="status">Full write-up: pending retirement</span>`;
    }
    return `<span class="status">Full write-up: locked</span>`;
  }

  function tagsHtml(entry) {
    return (entry.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('\n        ');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCard(entry) {
    const tab = fileTab(entry) + (entry.status === 'retired' ? '' : '');
    const titleInner = escapeHtml(entry.title);

    const redactedStrip = entry.published ? '' : `<div class="redacted-strip"></div>`;

    const clickableAttrs = entry.published
      ? ` class="file file-clickable" data-href="${escapeHtml(entry.file)}" tabindex="0" role="link"`
      : ` class="file"`;

    return `
    <div${clickableAttrs} data-view="${entry.view}" data-diff="${entry.difficulty}" data-slug="${entry.slug}">
      <span class="file-tab">${escapeHtml(tab)}</span>
      <h3>${titleInner}</h3>
      <div class="meta">${escapeHtml(entry.platform || '')}</div>
      <div class="tags">
        ${tagsHtml(entry)}
      </div>
      <p>${escapeHtml(entry.summary || '')}</p>
      ${redactedStrip}
      ${statusBadge(entry)}
    </div>`;
  }

  async function init() {
    const grid = document.getElementById(GRID_ID);
    if (!grid) return;

    let data;
    try {
      const res = await fetch('data/casefiles.json', { cache: 'no-store' });
      data = await res.json();
    } catch (err) {
      grid.innerHTML = `<p style="color:var(--muted);font-family:'IBM Plex Mono',monospace;font-size:0.85rem;">Could not load case file index. (${escapeHtml(err.message)})</p>`;
      return;
    }

    const machines = (data.machines || []).slice();

    // Sort: published first within each view isn't necessary — keep JSON order,
    // but push unpublished ("locked") entries to the end of their view so the
    // grid leads with readable content.
    machines.sort((a, b) => {
      if (a.view !== b.view) return 0;
      if (a.published === b.published) return 0;
      return a.published ? -1 : 1;
    });

    grid.innerHTML = machines.map(renderCard).join('\n');

    // Whole-card click/keyboard navigation for published entries. Delegated
    // on the grid so it works for every card without per-card listeners.
    grid.addEventListener('click', (e) => {
      const card = e.target.closest('.file-clickable');
      if (card && card.dataset.href) window.location.href = card.dataset.href;
    });
    grid.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.file-clickable');
      if (card && card.dataset.href) {
        e.preventDefault();
        window.location.href = card.dataset.href;
      }
    });

    // Re-bind the existing toggle/filter script logic by dispatching a custom
    // event the inline script listens for, OR simply re-run the same filter
    // logic here if the page's own script already queries at load time after
    // this script runs (see case-files.html — this script is loaded before
    // the filter script and completes before DOMContentLoaded fires because
    // of the await; if timing ever changes, dispatch 'casefiles:rendered').
    document.dispatchEvent(new CustomEvent('casefiles:rendered'));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
