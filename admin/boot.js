/* The CDN version is pinned. No GitHub client secret or owner token belongs here. */
(() => {
  'use strict';
  window.CMS_MANUAL_INIT = true;
  const message = document.getElementById('cms-loading-message');
  const loading = document.getElementById('cms-loading');
  const base = new URL('.', location.href);
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('The editor library could not load. Check your connection or whether the CDN is blocked.'));
      document.head.appendChild(script);
    });
  }
  async function start() {
    const response = await fetch(new URL('config.yml', base), { cache: 'no-store' });
    if (!response.ok) throw new Error('The one-time CMS import has not been completed. Run "Aaron CMS - 1. Import current recipes" in GitHub Actions first, then publish the site.');
    const configuration = await response.text();
    if (configuration.includes('configure-your-worker.invalid')) throw new Error('The GitHub login service is not configured yet. Complete the setup guide and run the import workflow.');
    await loadScript('https://unpkg.com/decap-cms@3.15.1/dist/decap-cms.js');
    await loadScript(new URL('preview.js', base).href);
    const observer = new MutationObserver(() => {
      if (document.querySelector('#nc-root > *')) {
        loading.hidden = true;
        observer.disconnect();
      }
    });
    observer.observe(document.getElementById('nc-root'), { childList: true, subtree: true });
    window.CMS.init();
  }
  start().catch(error => { message.textContent = error.message; });
})();
