/* A safe, live metric-content preview using Decap's own field renderers. */
(() => {
  'use strict';
  const { CMS, createClass, h } = window;
  const root = new URL('../', location.href);
  CMS.registerPreviewStyle(new URL('assets/css/styles.css', root).href);
  CMS.registerPreviewStyle(`
    body { background:#fff; margin:0; padding:24px; }
    .cms-preview { max-width:1040px; margin:0 auto; }
    .cms-preview .recipe-body { max-width:850px; margin:auto; }
    .cms-preview-note { font:12px/1.6 system-ui,sans-serif; padding:12px 16px; background:#f8f5f0; color:#665644; border-radius:6px; }
    .cms-preview .line-title { margin:36px 0; }
    .cms-preview .recipe-prose img { max-width:100%; }
    .cms-preview figure { margin:24px 0; }
    .cms-preview figure img { width:100%; max-height:420px; object-fit:cover; border-radius:8px; }
    .cms-preview .preview-meta { text-align:center; font:14px/1.6 system-ui,sans-serif; color:#776958; }
    .cms-preview .recipe-prose { overflow-wrap:anywhere; }
  `, { raw: true });
  const heading = (value, className = 'recipe-section-title') => h('h2', { className: 'line-title ' + className }, h('span', {}, value));
  const Preview = createClass({
    render() {
      const entry = this.props.entry;
      const data = entry.get('data');
      const image = data.get('image');
      const sections = [];
      const stepWidgets = this.props.widgetsFor('steps');
      this.props.widgetsFor('ingredient_groups').forEach((group, i) => {
        const items = group.getIn(['data', 'items']);
        sections.push({ position: Math.min(Number(group.getIn(['data', 'after_step'])) || 0, stepWidgets.size), node: h('section', { className: 'recipe-block ingredient-group', key: 'g' + i },
          h('h3', { className: 'recipe-subheading' }, group.getIn(['data', 'title']) || 'Ingredients'),
          h('div', { className: 'recipe-prose' }, group.getIn(['widgets', 'body']),
            items && h('ul', {}, items.map((item, j) => {
              const amount = item.get('amount');
              const unit = item.get('unit');
              return h('li', { key: j },
                (amount !== null && amount !== undefined && amount !== '' ? amount + (unit && unit !== 'piece' ? ' ' + unit : '') + ' ' : ''),
                h('strong', {}, item.get('ingredient')),
                item.get('note') ? ' - ' + item.get('note') : '');
            }).toArray()))) });
      });
      const steps = stepWidgets.map((step, i) => h('section', { className: 'recipe-block method-block', key: 's' + i },
        h('h3', { className: 'recipe-subheading' }, step.getIn(['data', 'title']) || 'Step ' + (i + 1)),
        h('div', { className: 'recipe-prose' }, step.getIn(['widgets', 'body']))));
      const content = [heading('Ingredients List'), ...sections.filter(s => s.position === 0).map(s => s.node), heading('Step-by-Step Cooking Instructions')];
      steps.forEach((step, i) => {
        content.push(step);
        content.push(...sections.filter(s => s.position === i + 1).map(s => s.node));
      });
      return h('article', { className: 'cms-preview recipe-article' },
        h('p', { className: 'cms-preview-note' }, 'Content preview. Measurement conversion, checklists and the YouTube player are applied when the website builds. Publishing saves your changes to GitHub; allow the publishing workflow to finish.'),
        h('h1', { className: 'line-title recipe-title' }, h('span', {}, data.get('title') || 'Your new recipe')),
        data.get('description') && h('p', { className: 'section-intro' }, data.get('description')),
        h('p', { className: 'preview-meta' }, (data.get('category') || '').replace('-', ' '), data.get('published') ? ' | Visible on website' : ' | Not visible on website'),
        image && h('figure', {}, h('img', { src: String(this.props.getAsset(image)), alt: data.get('image_alt') || '' })),
        data.get('video_url') && h('p', { className: 'preview-meta' }, 'YouTube video: ' + data.get('video_url')),
        h('div', { className: 'recipe-body' }, ...content, this.props.widgetFor('notes')));
    }
  });
  CMS.registerPreviewTemplate('recipes', Preview);
})();
