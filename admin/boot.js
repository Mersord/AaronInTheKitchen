/* Keep the same pinned Decap release and existing authentication configuration. */
(() => {
  'use strict';
  window.CMS_MANUAL_INIT = true;
  const base = new URL('.', location.href);
  const message = document.getElementById('cms-loading-message');
  const loading = document.getElementById('cms-loading');
  const basic = new URL(location.href).searchParams.get('basic') === '1';
  const version = '20261010-1';
  function script(src) {
    return new Promise((resolve, reject) => {
      const node = document.createElement('script');
      const timer = setTimeout(() => { node.remove(); reject(new Error('Loading the editor timed out. Check the connection and reload.')); }, 25000);
      node.src = src;
      node.onload = () => { clearTimeout(timer); resolve(); };
      node.onerror = () => { clearTimeout(timer); reject(new Error('An editor resource could not load. Check the connection or try Basic editor mode.')); };
      document.head.appendChild(node);
    });
  }
  const local = name => new URL(name + '?v=' + version, base).href;
  async function start() {
    const response = await fetch(new URL('config.yml', base), { cache: 'no-store' });
    if (!response.ok) throw new Error('The CMS configuration could not load. Keep your existing admin/config.yml in the repository and publish the site.');
    const source = await response.text();
    if (source.includes('configure-your-worker.invalid')) throw new Error('The GitHub login service is not configured yet. Keep the working admin/config.yml from your CMS setup.');
    await script('https://unpkg.com/decap-cms@3.15.1/dist/decap-cms.js');
    let config;
    if (!basic) {
      await script(local('studio.js'));
      try {
        // A bounded, same-origin config, using a pinned parser. No config is
        // rewritten in GitHub. Failure falls back to Decap's ordinary loader.
        if (source.length > 250000) throw new Error('Configuration is unusually large.');
        await script('https://cdn.jsdelivr.net/npm/js-yaml@4.3.2/dist/js-yaml.min.js');
        config = window.AaronStudio.enhanceConfig(window.jsyaml.load(source));
        window.AaronStudio.registerWidgets();
      } catch (_) {
        config = undefined;
        document.getElementById('studio-notification').textContent = 'Using standard fields because the enhanced configuration could not load. Your login and recipes are unchanged.';
        document.getElementById('studio-notification').hidden = false;
      }
      await script(local('preview.js'));
      window.AaronStudio.install(config);
    } else {
      document.body.classList.add('studio-basic');
      await script(local('preview-basic.js'));
    }
    const mount = document.getElementById('nc-root');
    const observer = new MutationObserver(() => {
      if (mount.children.length) { loading.hidden = true; observer.disconnect(); }
    });
    observer.observe(mount, { childList: true });
    if (config) window.CMS.init({ config: { ...config, load_config_file: false } });
    else window.CMS.init();
    if (mount.children.length) { loading.hidden = true; observer.disconnect(); }
  }
  start().catch(error => { message.textContent = error.message; loading.hidden = false; });
})();
