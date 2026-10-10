/* Aaron's Recipe Studio - admin-only enhancements, no repository writes here.
 * Uses documented Decap widget, initialization, preview and event APIs.
 */
(() => {
  'use strict';
  const CATEGORY = { 'main-dishes': 'Main Dishes', desserts: 'Desserts', breakfast: 'Breakfast', sides: 'Sides' };
  const FRACTIONS = { '\u00bc': .25, '\u00bd': .5, '\u00be': .75, '\u2150': 1/7, '\u2151': 1/9, '\u2152': .1, '\u2153': 1/3, '\u2154': 2/3, '\u2155': .2, '\u2156': .4, '\u2157': .6, '\u2158': .8, '\u2159': 1/6, '\u215a': 5/6, '\u215b': .125, '\u215c': .375, '\u215d': .625, '\u215e': .875 };
  const root = new URL('../', location.href);
  let configuration;
  const blank = value => value === undefined || value === null || String(value).trim() === '';
  const cleanText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[\s*_#`]/g, '').trim();
  const pretty = value => Number(value.toFixed(8)).toString();

  function parseAmount(value) {
    if (blank(value)) return { ok: true, value: null };
    if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? { ok: true, value } : { ok: false };
    let text = String(value).trim().replace(/\u2044/g, '/');
    const tail = text.slice(-1);
    if (Object.prototype.hasOwnProperty.call(FRACTIONS, tail)) {
      const whole = text.slice(0, -1).trim();
      if (whole && !/^\d+$/.test(whole)) return { ok: false };
      return { ok: true, value: Number(whole || 0) + FRACTIONS[tail] };
    }
    const mixed = text.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);
    if (mixed) {
      const denominator = Number(mixed[3]);
      const result = Number(mixed[1] || 0) + Number(mixed[2]) / denominator;
      return denominator > 0 && Number.isFinite(result) ? { ok: true, value: result } : { ok: false };
    }
    if (!/^\+?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(text)) return { ok: false };
    const result = Number(text.replace(',', '.'));
    return Number.isFinite(result) ? { ok: true, value: result } : { ok: false };
  }

  function videoId(value) {
    const text = String(value || '').trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(text)) return text;
    let url;
    try { url = new URL(text); } catch (_) { return null; }
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let candidate;
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'youtu.be') candidate = parts[0];
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      candidate = ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : url.searchParams.get('v');
    }
    return /^[a-zA-Z0-9_-]{11}$/.test(candidate || '') ? candidate : null;
  }

  function checks(data) {
    const groups = Array.isArray(data.ingredient_groups) ? data.ingredient_groups : [];
    const steps = Array.isArray(data.steps) ? data.steps : [];
    const ingredients = groups.some(group => cleanText(group.body) || (group.items || []).some(item => cleanText(item.ingredient)));
    const emptySteps = steps.filter(step => !cleanText(step.body)).length;
    return [
      { ok: !!cleanText(data.title), text: 'Recipe name', help: 'Add a name so readers can find this recipe.', required: true },
      { ok: !!CATEGORY[data.category], text: 'Category', help: 'Choose a category for the recipe directories.', required: true },
      { ok: ingredients, text: 'Ingredients', help: 'Add ingredients as formatted text or measured rows.', required: true },
      { ok: steps.length > 0 && emptySteps === 0, text: 'Cooking instructions', help: emptySteps ? `${emptySteps} step(s) still have no instructions.` : 'Add at least one cooking step.', required: true },
      { ok: !!cleanText(data.description), text: 'Short introduction', help: 'Optional: a sentence describing the recipe.', required: false },
      { ok: !!cleanText(data.servings), text: 'Servings or yield', help: 'Optional: helps readers judge the amount.', required: false },
      { ok: !!videoId(data.video_url), text: 'YouTube link', help: blank(data.video_url) ? 'Optional: add the recipe video.' : 'The link is not a recognised HTTPS YouTube URL or video ID.', required: !blank(data.video_url) },
      { ok: !data.image || !!cleanText(data.image_alt), text: 'Picture description', help: 'Add a useful description for your recipe picture.', required: false }
    ];
  }

  function enhanceConfig(original) {
    // Clone first: never edit the fetched configuration or recipe data in-place.
    const config = JSON.parse(JSON.stringify(original));
    if (!config || !Array.isArray(config.collections)) throw new Error('No CMS collections found.');
    const collection = config.collections.find(item => item.name === 'recipes');
    if (!collection || !Array.isArray(collection.fields)) return config;
    const fields = new Map(collection.fields.map(field => [field.name, field]));
    const set = (name, values) => { if (fields.has(name)) Object.assign(fields.get(name), values); };
    set('title', { hint: 'Give the recipe a clear, recognisable name. Existing recipe addresses stay unchanged when a title is edited.' });
    set('published', { hint: 'On = include in the next website build. Off = keep out of the website. Use Publish to save either choice. Hidden entries are not private in a public repository.' });
    set('description', { hint: 'A short, inviting introduction. The preview updates as you write.' });
    set('servings', { hint: 'For example: 4 people, 6-8 portions, or 12 muffins.' });
    set('video_url', { widget: 'aaron-youtube', hint: 'Paste a YouTube link or video ID. The thumbnail helps you check the selection; availability and embedding still need a live test.' });
    set('image_alt', { hint: 'Describe the food in the picture, rather than writing "image of". Example: Strawberry tiramisu in a glass serving dish.' });
    set('nav_title', { hint: 'Advanced / optional. Only needed when the full recipe name is too long for a menu.' });
    set('order', { hint: 'Advanced / optional. Lower numbers appear earlier in recipe listings.' });
    const groupField = fields.get('ingredient_groups');
    if (groupField) {
      groupField.hint = 'Use one group for a simple recipe, or separate Cake, Filling and Frosting. Do not enter the same ingredient in both formatted text and measured rows.';
      const rows = (groupField.fields || []).find(field => field.name === 'items');
      if (rows) {
        const amount = (rows.fields || []).find(field => field.name === 'amount');
        if (amount && amount.widget === 'number') Object.assign(amount, { widget: 'aaron-amount', hint: 'Accepts 0.5, 0,5, 1/2, or 1 1/2. Saved as a number. Leave blank for an unspecified amount; put "to taste" in the note.' });
        rows.hint = 'Add one row per ingredient. These rows use the existing Metric / US conversion system.';
      }
    }
    set('steps', { hint: 'Give steps short headings. Use the list controls to reorder them. Start with metric measurements; the public site creates the US version when it builds.' });
    const preferred = ['title', 'published', 'category', 'description', 'servings', 'prep_minutes', 'cook_minutes', 'video_url', 'image', 'image_alt', 'ingredient_groups', 'steps', 'notes', 'nav_title', 'order'];
    const known = preferred.filter(name => fields.has(name)).map(name => fields.get(name));
    collection.fields = [...known, ...collection.fields.filter(field => !preferred.includes(field.name))];
    collection.view_filters = collection.view_filters || [];
    Object.entries(CATEGORY).forEach(([value, label]) => {
      if (!collection.view_filters.some(filter => filter.field === 'category' && filter.pattern === value)) {
        collection.view_filters.push({ label, field: 'category', pattern: value });
      }
    });
    collection.description = 'Your recipe collection. Filter by category or visibility, open a recipe, and check the live preview before publishing. Publishing saves to GitHub; the website updates after its build.';
    // Authentication, permissions, deletion, branch, format, filenames and all
    // required/default values are deliberately inherited, never replaced.
    return config;
  }

  function registerWidgets() {
    const { CMS, createClass, h } = window;
    const thumb = (id, onError) => h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: 'YouTube video thumbnail', referrerPolicy: 'no-referrer', loading: 'lazy', onError });
    const Video = createClass({
      getInitialState() { return { failed: false }; },
      componentWillReceiveProps(next) { if (next.value !== this.props.value) this.setState({ failed: false }); },
      isValid() {
        return blank(this.props.value) || videoId(this.props.value) ? true : { error: { message: 'Use an HTTPS YouTube / youtu.be link or an 11-character video ID, not embed HTML.' } };
      },
      render() {
        const value = this.props.value || '';
        const id = videoId(value);
        return h('div', { className: 'studio-video-control' },
          h('input', { id: this.props.forID, type: 'text', value, className: this.props.classNameWrapper, placeholder: 'https://www.youtube.com/watch?v=...', spellCheck: false, autoCapitalize: 'none', onChange: event => this.props.onChange(event.target.value), 'aria-describedby': this.props.forID + '-feedback', 'aria-invalid': !blank(value) && !id }),
          id ? h('div', { className: 'studio-video-card' },
            !this.state.failed && thumb(id, () => this.setState({ failed: true })),
            h('div', {}, h('strong', {}, 'Video linked'),
              h('p', { id: this.props.forID + '-feedback' }, this.state.failed ? 'Thumbnail could not load. Use the link to check the video.' : 'Check that the thumbnail belongs to this recipe.'),
              h('div', { className: 'studio-inline-actions' }, h('a', { href: `https://www.youtube.com/watch?v=${id}`, target: '_blank', rel: 'noopener noreferrer' }, 'Check video'),
                String(value).trim() !== `https://www.youtube.com/watch?v=${id}` && h('button', { type: 'button', onClick: () => this.props.onChange(`https://www.youtube.com/watch?v=${id}`) }, 'Use clean link')))) :
          !blank(value) && h('p', { className: 'studio-field-error', id: this.props.forID + '-feedback', role: 'status' }, 'This does not look like a YouTube link. Paste the video URL, not its embed code.'));
      }
    });
    const Amount = createClass({
      getInitialState() { return { text: blank(this.props.value) ? '' : String(this.props.value) }; },
      componentWillReceiveProps(next) {
        if (next.value !== this.props.value && next.value !== this.lastEmitted) this.setState({ text: blank(next.value) ? '' : String(next.value) });
      },
      isValid() {
        const parsed = parseAmount(this.state.text);
        if (!parsed.ok) return { error: { message: 'Enter a non-negative amount, such as 250, 0.5, 1/2 or 1 1/2. Use the note for words such as "to taste".' } };
        const min = this.props.field.get('min');
        const max = this.props.field.get('max') ?? 1000000;
        if (parsed.value !== null && ((typeof min === 'number' && parsed.value < min) || (typeof max === 'number' && parsed.value > max))) return { error: { message: 'The amount is outside the allowed range.' } };
        return true;
      },
      change(event) {
        const text = event.target.value;
        const parsed = parseAmount(text);
        this.setState({ text });
        // Invalid input stays invalid in Decap, rather than silently saving the
        // previous valid number. isValid blocks it until corrected.
        this.lastEmitted = parsed.ok ? parsed.value : text;
        this.props.onChange(this.lastEmitted);
      },
      render() {
        const parsed = parseAmount(this.state.text);
        const message = !parsed.ok ? 'Try 250, 0.5, 1/2, or 1 1/2.' : parsed.value !== null && String(parsed.value) !== this.state.text.trim() ? 'Saved as ' + pretty(parsed.value) : '';
        return h('div', { className: 'studio-amount-control' },
          h('input', { id: this.props.forID, className: this.props.classNameWrapper, type: 'text', inputMode: 'text', value: this.state.text, autoComplete: 'off', placeholder: 'e.g. 250 or 1/2', onChange: this.change, 'aria-invalid': !parsed.ok, 'aria-describedby': this.props.forID + '-feedback' }),
          h('small', { id: this.props.forID + '-feedback', className: parsed.ok ? 'studio-field-hint' : 'studio-field-error', role: 'status' }, message));
      }
    });
    CMS.registerWidget('aaron-youtube', Video);
    CMS.registerWidget('aaron-amount', Amount);
  }

  function notify(text) {
    const node = document.getElementById('studio-notification');
    if (!node) return;
    node.textContent = text;
    node.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { node.hidden = true; }, 14000);
  }

  function install(config) {
    configuration = config;
    const dock = document.getElementById('studio-dock');
    if (dock) {
      dock.hidden = false;
      const repo = config && config.backend && config.backend.repo;
      const buildLink = document.getElementById('studio-build-link');
      if (buildLink && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '')) {
        buildLink.href = 'https://github.com/' + repo + '/actions';
        buildLink.hidden = false;
      }
    }
    if (window.CMS && window.CMS.registerEventListener) {
      window.CMS.registerEventListener({ name: 'postSave', handler: () => {
        notify('Saved to GitHub. The website build may still be running; this is not a deployment confirmation.');
      } });
    }
  }

  window.AaronStudio = { parseAmount, videoId, checks, enhanceConfig, registerWidgets, install, pretty, CATEGORY, root, getConfig: () => configuration };
})();
