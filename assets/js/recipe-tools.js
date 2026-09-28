/* Aaron in the Kitchen: measurement preferences and opt-in recipe videos.
 * Both unit values are precomputed in the HTML: never convert a rounded value
 * back and forth. No libraries, API keys, or network requests for conversion.
 */
(() => {
  'use strict';
  if (!document.body.classList.contains('recipe-page')) return;
  const storageKey = 'aaron.kitchen.measurements.v1';
  const measures = Array.from(document.querySelectorAll('.measure'));
  const controls = Array.from(document.querySelectorAll('[data-unit]'));
  const allowed = value => value === 'metric' || value === 'us';
  const stored = () => { try { return localStorage.getItem(storageKey); } catch (_) { return null; } };
  let query = null;
  try { query = new URLSearchParams(location.search).get('units'); } catch (_) { /* Default is metric. */ }
  let current = allowed(query) ? query : (allowed(stored()) ? stored() : 'metric');

  function setUnits(value, announce = false) {
    if (!allowed(value)) return;
    current = value;
    measures.forEach(node => {
      const label = node.dataset[value];
      if (typeof label === 'string' && label.length) node.textContent = label;
    });
    document.body.dataset.units = value;
    controls.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.unit === value)));
    document.querySelectorAll('[data-current-units]').forEach(node => {
      node.textContent = value === 'metric' ? 'Metric measurements' : 'US measurements';
    });
    // Refresh the accessible checklist label without replacing the checkbox.
    // Checked ingredients, focus, and the existing checklist storage survive.
    document.querySelectorAll('.ingredient-item').forEach(item => {
      const checkbox = item.querySelector('.ingredient-checkbox');
      const copy = item.querySelector('.ingredient-copy');
      if (checkbox && copy) checkbox.setAttribute('aria-label', copy.textContent.replace(/\s+/g, ' ').trim());
    });
    if (announce) {
      const status = document.querySelector('[data-unit-status]');
      if (status) status.textContent = value === 'metric'
        ? 'Metric units selected for ingredients, instructions, temperatures and pan sizes.'
        : 'US units selected for ingredients, instructions, temperatures and pan sizes.';
      try { localStorage.setItem(storageKey, value); } catch (_) { /* Still works without storage. */ }
    }
  }
  document.querySelectorAll('.measurement-control').forEach(node => { node.hidden = false; });
  controls.forEach((button, index) => {
    button.addEventListener('click', () => setUnits(button.dataset.unit, true));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const target = event.key === 'Home' ? controls[0] : event.key === 'End'
        ? controls[controls.length - 1] : controls[(index + 1) % controls.length];
      target.focus();
      setUnits(target.dataset.unit, true);
    });
  });
  setUnits(current);
  window.addEventListener('storage', event => {
    if (event.key === storageKey) setUnits(allowed(event.newValue) ? event.newValue : 'metric');
  });

  document.querySelectorAll('a[href="#measurement-notes"]').forEach(link => {
    link.addEventListener('click', () => {
      const details = document.getElementById('measurement-notes');
      if (details) details.open = true;
    });
  });

  const shell = document.querySelector('[data-video-slug]');
  if (!shell) return;
  const candidate = (window.AARON_VIDEOS || {})[shell.dataset.videoSlug];
  const id = typeof candidate === 'string' && /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null;
  const caption = document.querySelector('[data-video-caption]');
  if (!id) {
    if (caption) caption.textContent = 'The original video URL was not included in the export. The recipe text is available below.';
    return;
  }
  shell.dataset.videoId = id;
  shell.classList.add('has-video');
  shell.querySelector('[data-video-missing]')?.setAttribute('hidden', '');
  const playButton = shell.querySelector('[data-load-video]');
  if (playButton) playButton.hidden = false;
  const jump = document.querySelector('[data-video-jump]');
  if (jump) jump.hidden = false;
  const watchURL = `https://www.youtube.com/watch?v=${id}`;
  const originalLink = shell.querySelector('[data-video-original]');
  if (originalLink) { originalLink.href = watchURL; originalLink.textContent = 'Watch on YouTube \u2197'; }
  if (caption) {
    caption.textContent = 'The YouTube player loads only when you press play. ';
    const external = document.createElement('a');
    external.href = watchURL;
    external.target = '_blank';
    external.rel = 'noopener noreferrer';
    external.textContent = 'Open on YouTube \u2197';
    caption.appendChild(external);
    if (location.protocol === 'file:') {
      const localNotice = document.createElement('span');
      localNotice.className = 'video-local-notice';
      localNotice.textContent = 'For embedded playback, use a local web server or a hosted copy. See README.md for the one-line preview command.';
      caption.appendChild(localNotice);
    }
  }
  function loadVideo(start = 0) {
    const seconds = Math.max(0, Math.floor(Number(start) || 0));
    const frame = document.createElement('iframe');
    frame.title = `${shell.dataset.videoTitle || 'Recipe'} - Aaron in the Kitchen on YouTube`;
    frame.src = `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&autoplay=1&start=${seconds}`;
    frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.allowFullscreen = true;
    frame.className = 'recipe-video-frame';
    frame.setAttribute('width', '1280');
    frame.setAttribute('height', '720');
    shell.replaceChildren(frame);
    shell.classList.add('is-playing');
  }
  playButton?.addEventListener('click', () => loadVideo(0));

  function timestamp(value) {
    if (/^\d+(?:s)?$/.test(value)) return parseInt(value, 10);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(value);
    return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
  }
  // Only timestamps for THIS recipe's video seek the embedded player.
  // Links to a different recipe (e.g. frosting or pie crust) stay external.
  document.querySelectorAll('.recipe-body a[href]').forEach(link => {
    let url;
    try { url = new URL(link.href); } catch (_) { return; }
    const host = url.hostname.replace(/^www\./, '');
    if (!['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) return;
    const linkedID = host === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
    const time = url.searchParams.get('t') || url.searchParams.get('start');
    if (linkedID !== id || !time) return;
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      loadVideo(timestamp(time));
      shell.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  });
})();
