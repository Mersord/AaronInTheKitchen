/* Preview is read-only. It never changes fields, recipe quantities or slugs. */
(() => {
  'use strict';
  const { CMS, createClass, h, AaronStudio: Studio } = window;
  const root = new URL('../', location.href);
  const array = value => value && typeof value.toArray === 'function' ? value.toArray() : Array.isArray(value) ? value : [];
  const plain = value => value && typeof value.toJS === 'function' ? value.toJS() : value || {};
  const at = (value, path) => value && typeof value.getIn === 'function' ? value.getIn(path) : path.reduce((part, key) => part && part[key], value);
  const heading = (text, key) => h('h2', { className: 'studio-section-heading', key }, text);
  CMS.registerPreviewStyle(new URL('admin/preview.css?v=20261010-1', root).href);
  function asset(value, getAsset) {
    if (!value) return '';
    try {
      const resolved = String(getAsset(value));
      const url = new URL(resolved, root);
      if (['https:', 'http:', 'blob:'].includes(url.protocol) || /^data:image\/(?:png|jpeg|webp|gif);/i.test(resolved)) return url.href;
    } catch (_) { /* A missing asset is displayed without a broken URL. */ }
    return '';
  }
  const Preview = createClass({
    getInitialState() { return { narrow: false, failedVideo: '', failedImage: '' }; },
    render() {
      const entry = this.props.entry;
      const data = plain(entry.get('data'));
      const id = Studio.videoId(data.video_url);
      const groups = array(this.props.widgetsFor('ingredient_groups'));
      const steps = array(this.props.widgetsFor('steps'));
      const checks = Studio.checks(data);
      const needed = checks.filter(item => !item.ok && item.required).length;
      const suggestions = checks.filter(item => !item.ok && !item.required).length;
      const image = asset(data.image, this.props.getAsset);
      const rawSlug = entry.get('slug') || '';
      const savedSlug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(rawSlug) && !location.hash.includes('/new') ? rawSlug : '';
      const content = [];
      function ingredient(group, i) {
        const groupData = plain(at(group, ['data']));
        const rows = Array.isArray(groupData.items) ? groupData.items : [];
        return h('section', { key: 'ingredients-' + i, className: 'studio-ingredient-section' },
          h('h3', {}, groupData.title || 'Ingredients'),
          h('div', { className: 'studio-prose' }, at(group, ['widgets', 'body'])),
          rows.length > 0 && h('ul', { className: 'studio-ingredient-rows' }, rows.map((row, j) => {
            const quantity = Studio.parseAmount(row.amount);
            const amount = quantity.ok && quantity.value !== null ? Studio.pretty(quantity.value) : row.amount || '';
            return h('li', { key: j },
              h('span', { className: 'studio-ingredient-quantity' }, amount === '' ? '' : amount + (row.unit && row.unit !== 'piece' ? ' ' + row.unit : '')),
              h('span', {}, h('strong', {}, row.ingredient || 'Ingredient'), row.note ? ', ' + row.note : ''));
          })));
      }
      function ingredientsAt(position) {
        return groups.flatMap((group, i) => {
          const after = Math.max(0, Math.min(Number(at(group, ['data', 'after_step'])) || 0, steps.length));
          return after === position ? [ingredient(group, i)] : [];
        });
      }
      content.push(heading('Ingredients', 'ingredients'), ...ingredientsAt(0), heading('The method', 'method'));
      steps.forEach((step, i) => {
        content.push(h('section', { key: 'step-' + i, className: 'studio-step' },
          h('div', { className: 'studio-step-number', 'aria-hidden': true }, String(i + 1).padStart(2, '0')),
          h('div', {}, h('h3', {}, at(step, ['data', 'title']) || 'Step ' + (i + 1)),
            h('div', { className: 'studio-prose' }, at(step, ['widgets', 'body'])))), ...ingredientsAt(i + 1));
      });
      if (!groups.length) content.splice(1, 0, h('p', { className: 'studio-empty', key: 'empty-ingredients' }, 'Your ingredients will appear here.'));
      if (!steps.length) content.push(h('p', { className: 'studio-empty', key: 'empty-steps' }, 'Your cooking steps will appear here.'));
      const meta = [];
      if (data.servings) meta.push(['Yield', String(data.servings)]);
      if (data.prep_minutes !== undefined && data.prep_minutes !== null && data.prep_minutes !== '') meta.push(['Prep', data.prep_minutes + ' min']);
      if (data.cook_minutes !== undefined && data.cook_minutes !== null && data.cook_minutes !== '') meta.push(['Cook', data.cook_minutes + ' min']);
      return h('div', { className: 'studio-preview' },
        h('div', { className: 'studio-preview-toolbar' },
          h('div', {}, h('strong', {}, 'Recipe preview'), h('small', {}, 'Your edits, not the deployed page')),
          h('div', { className: 'studio-preview-width', role: 'group', 'aria-label': 'Preview width' },
            h('button', { type: 'button', 'aria-pressed': !this.state.narrow, onClick: () => this.setState({ narrow: false }) }, 'Reading'),
            h('button', { type: 'button', 'aria-pressed': this.state.narrow, onClick: () => this.setState({ narrow: true }) }, 'Narrow'))),
        h('details', { className: 'studio-review' },
          h('summary', {}, h('span', {}, 'Before publishing'), h('span', { className: needed ? 'studio-check-count needs-review' : 'studio-check-count' }, needed ? needed + ' to review' : suggestions ? suggestions + ' optional tips' : 'Basics filled in')),
          h('ul', {}, checks.map((item, i) => h('li', { key: i, className: item.ok ? 'is-complete' : 'is-incomplete' },
            h('span', { className: 'studio-check-icon', 'aria-hidden': true }, item.ok ? '\u2713' : '\u00b7'),
            h('div', {}, h('strong', {}, item.text), !item.ok && h('small', {}, item.help))))),
          h('p', {}, 'A writing checklist, not a food-safety check or a successful-build guarantee.')),
        h('article', { className: 'studio-paper' + (this.state.narrow ? ' is-narrow' : '') },
          h('div', { className: 'studio-paper-header' },
            h('div', { className: 'studio-kicker' }, h('span', {}, Studio.CATEGORY[data.category] || 'Your recipe'),
              h('span', { className: data.published === true ? 'studio-status visible' : 'studio-status' }, data.published === true ? 'Included in next build' : 'Hidden from website')),
            h('h1', {}, data.title || 'Something delicious starts here'),
            data.description && h('p', { className: 'studio-intro' }, data.description),
            meta.length > 0 && h('dl', { className: 'studio-meta' }, meta.map(([name, value]) => h('div', { key: name }, h('dt', {}, name), h('dd', {}, value))))),
          id ? h('figure', { className: 'studio-preview-media' },
            h('a', { href: `https://www.youtube.com/watch?v=${id}`, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Check recipe video on YouTube (new tab)' },
              this.state.failedVideo !== id ? h('img', { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, alt: 'Thumbnail for the recipe video', referrerPolicy: 'no-referrer', onError: () => this.setState({ failedVideo: id }) }) : h('div', { className: 'studio-media-fallback' }, 'Video linked - open to check it'),
              h('span', { className: 'studio-play', 'aria-hidden': true }, '\u25b6')),
            h('figcaption', {}, 'Video thumbnail. Opens YouTube in a new tab.')) :
            image && h('figure', { className: 'studio-preview-media' }, this.state.failedImage === image ? h('div', { className: 'studio-media-fallback' }, 'Recipe picture is unavailable in this preview. Check the image field.') : h('img', { src: image, alt: data.image_alt || '', onError: () => this.setState({ failedImage: image }) })),
          h('div', { className: 'studio-paper-body' }, ...content,
            data.notes && h('aside', { className: 'studio-recipe-notes' }, h('h2', {}, 'Kitchen notes'), h('div', { className: 'studio-prose' }, this.props.widgetFor('notes')))),
          h('footer', { className: 'studio-preview-footer' },
            h('p', {}, 'Measurements shown as entered. Metric / US conversion, checklists and the video player are applied by the website build.'),
            savedSlug && h('a', { href: new URL('recipes/' + savedSlug + '.html', root).href, target: '_blank', rel: 'noopener' }, 'Open public recipe (last successful build)'))));
    }
  });
  CMS.registerPreviewTemplate('recipes', Preview);
})();
