#!/usr/bin/env python3
"""Import the current static recipe site once, then build it from Decap content.

Run from the repository root. No HTML/CSS/JS source files are overwritten.
Commands: import, build. See CMS-SETUP.md before the first run.
"""
from __future__ import annotations
import argparse
import copy
import hashlib
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
from urllib.parse import urlparse, parse_qs, unquote
import xml.etree.ElementTree as ET

from bs4 import BeautifulSoup, NavigableString, Tag
from markdown_it import MarkdownIt
from markdownify import markdownify
import yaml
from measurements import convert_text, span, UNITS

ROOT = Path.cwd().resolve()
CATEGORIES = {'main-dishes': 'Main Dishes', 'desserts': 'Desserts', 'breakfast': 'Breakfast', 'sides': 'Sides'}
SLUG = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
MARKDOWN = MarkdownIt('commonmark', {'html': False, 'breaks': False})
SKIP_DIRS = {'.git', '.github', 'cms', 'content', 'oauth-worker', 'node_modules', '_site', '_build', '_export', 'tools', '__pycache__', '.venv', 'venv'}
PUBLIC_EXTENSIONS = {'.html', '.css', '.js', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico', '.avif', '.mp4', '.webm', '.woff', '.woff2', '.ttf', '.otf', '.pdf', '.xml'}


def soup(value: str) -> BeautifulSoup:
    return BeautifulSoup(value, 'html.parser')


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(value, encoding='utf-8')


def write_json(path: Path, value) -> None:
    write(path, json.dumps(value, indent=2, ensure_ascii=False) + '\n')


def inner(node: Tag) -> str:
    return node.decode_contents()


def append_html(node: Tag, text: str) -> None:
    fragment = soup(text)
    for child in list(fragment.contents):
        node.append(child.extract())


def text(node) -> str:
    return node.get_text(' ', strip=True) if node else ''


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def beneath(path: Path, base: Path = ROOT) -> Path:
    path = path.resolve()
    if not path.is_relative_to(base):
        raise ValueError(f'Path must stay inside {base}: {path}')
    return path


def video_id(value: str | None) -> str | None:
    value = (value or '').strip()
    if re.fullmatch(r'[A-Za-z0-9_-]{11}', value):
        return value
    try:
        u = urlparse(value)
        host = (u.hostname or '').lower().removeprefix('www.')
        if u.scheme != 'https' or u.username or u.password:
            return None
        if host == 'youtu.be':
            candidate = u.path.strip('/').split('/')[0]
        elif host in {'youtube.com', 'm.youtube.com', 'youtube-nocookie.com'}:
            parts = u.path.strip('/').split('/')
            candidate = parts[1] if len(parts) > 1 and parts[0] in {'embed', 'shorts', 'live'} else parse_qs(u.query).get('v', [''])[0]
        else:
            return None
        return candidate if re.fullmatch(r'[A-Za-z0-9_-]{11}', candidate or '') else None
    except (ValueError, TypeError):
        return None


def video_map(site: Path) -> dict:
    path = site / 'assets/js/recipe-videos.js'
    if not path.exists():
        return {}
    raw = path.read_text(encoding='utf-8')
    match = re.search(r'(?:window\.)?AARON_VIDEOS\s*=\s*', raw)
    if not match:
        raise ValueError('Unrecognised recipe-videos.js format. Import stopped to protect your current video links.')
    try:
        obj, _ = json.JSONDecoder().raw_decode(raw[match.end():])
    except json.JSONDecodeError as exc:
        raise ValueError('recipe-videos.js must contain a JSON object assigned to window.AARON_VIDEOS. Nothing has been overwritten.') from exc
    if not isinstance(obj, dict):
        raise ValueError('Recipe video map is not an object.')
    for key, value in obj.items():
        if value and not video_id(value):
            raise ValueError(f'Check video map value for {key}; it is not a recognised YouTube ID or URL.')
    return {k: video_id(v) for k, v in obj.items()}


def as_markdown(prose: Tag) -> str:
    cleaned = soup(inner(prose))
    for checkbox in cleaned.select('input'):
        checkbox.decompose()
    for measure in cleaned.select('.measure'):
        measure.replace_with(measure.get('data-metric') or measure.get_text())
    for wrapper in cleaned.select('.ingredient-copy'):
        wrapper.unwrap()
    return markdownify(str(cleaned), heading_style='ATX', bullets='-', strip=['span', 'div'], escape_underscores=False).strip()


def normalise_asset(value: str, site_url: str) -> str:
    value = str(value or '').strip().replace('\\', '/')
    if not value:
        return ''
    u = urlparse(value)
    if u.scheme:
        if u.scheme != 'https' or u.username or u.password:
            raise ValueError('Images must use an HTTPS address or a local upload.')
        base = urlparse(site_url)
        if u.netloc != base.netloc:
            return value
        value = u.path
    base_path = urlparse(site_url).path.rstrip('/')
    if base_path and value.startswith(base_path + '/'):
        value = value[len(base_path) + 1:]
    value = value.removeprefix('./').lstrip('/')
    while value.startswith('../'):
        value = value[3:]
    if '..' in PurePosixPath(unquote(value)).parts or '?' in value or '#' in value:
        raise ValueError(f'Unsafe or unsupported local image path: {value}')
    return value


def asset_href(value: str, prefix: str, settings: dict) -> str:
    clean = normalise_asset(value, settings['site_url'])
    return clean if clean.startswith('https://') else prefix + clean


def configure(settings: dict) -> None:
    config = yaml.safe_load((ROOT / 'cms/editor.yml').read_text())
    config['backend'].update({'repo': settings['repo'], 'branch': settings['branch'], 'base_url': settings['auth_url']})
    config['site_url'] = settings['site_url'] + '/'
    config['display_url'] = settings['site_url'] + '/'
    config['logo_url'] = settings['site_url'] + '/assets/images/favicon.svg'
    config['public_folder'] = urlparse(settings['site_url']).path.rstrip('/') + '/assets/uploads'
    write(ROOT / 'admin/config.yml', '# Generated by Aaron CMS setup. No passwords belong in this file.\n' + yaml.safe_dump(config, allow_unicode=True, sort_keys=False, width=110))


def import_site(args) -> None:
    site = beneath(ROOT / args.site_directory)
    site_url = args.site_url.rstrip('/')
    auth = urlparse(args.auth_url)
    if auth.scheme != 'https' or not auth.netloc or auth.path not in ('', '/') or auth.query or auth.fragment or auth.username or auth.password:
        raise ValueError('Auth URL must be an HTTPS origin, e.g. https://aaron-cms-auth.yourname.workers.dev (no /auth or /callback).')
    if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', args.repo):
        raise ValueError('Repository must have the form owner/repository.')
    if urlparse(site_url).scheme != 'https' or not urlparse(site_url).netloc:
        raise ValueError('Site URL must be an HTTPS URL.')
    settings_path = ROOT / 'cms/settings.json'
    if settings_path.exists():
        settings = read_json(settings_path)
        if settings['site_directory'] != str(site.relative_to(ROOT)):
            raise ValueError('Site directory differs from the existing import. Refusing to mix sites.')
        settings.update(repo=args.repo, branch=args.branch, auth_url=args.auth_url.rstrip('/'), site_url=site_url)
        configure(settings)
        write_json(settings_path, settings)
        print('Already imported: recipe content was NOT overwritten. Connection settings updated.')
        return
    if list((ROOT / 'content/recipes').glob('*.json')):
        raise ValueError('content/recipes already contains JSON files but no import manifest exists. Import stopped.')
    for required in ['index.html', 'recipes.html', 'assets/css/styles.css', 'assets/js/site.js', 'assets/js/recipe-tools.js']:
        if not (site / required).is_file():
            raise ValueError(f'Missing {required}. Choose the directory containing your current index.html in the setup workflow.')
    pages = sorted((site / 'recipes').glob('*.html'))
    if not pages:
        raise ValueError('No recipe HTML files found. Import stopped; no content was replaced.')
    directory = soup((site / 'recipes.html').read_text(encoding='utf-8'))
    cards = {c.get('data-recipe-id'): c for c in directory.select('.recipe-card[data-recipe-id]')}
    videos = video_map(site)
    navtitles = {}
    for a in directory.select('.nav-dropdown a[href]'):
        navtitles[Path(a['href']).stem] = text(a)
    recipes, caches, report = [], {}, {'recipes': [], 'source_hashes': {}, 'warnings': []}
    for order, page in enumerate(pages):
        slug = page.stem
        if not SLUG.fullmatch(slug):
            raise ValueError(f'Unsupported recipe filename {page.name}; use lower-case words and hyphens.')
        doc = soup(page.read_text(encoding='utf-8'))
        if not doc.select_one('.recipe-body') or not doc.select_one('.recipe-title'):
            raise ValueError(f'{page.name}: recipe layout is not the expected version. Import stopped.')
        card = cards.get(slug)
        cat = card.get('data-category') if card else None
        if cat not in CATEGORIES:
            crumbs = doc.select('.breadcrumbs a[href]')
            cat = Path(crumbs[-1]['href']).stem if crumbs else ''
        if cat not in CATEGORIES:
            raise ValueError(f'Cannot determine category for {slug}.')
        record = {'title': text(doc.select_one('.recipe-title')), 'nav_title': navtitles.get(slug, ''),
                  'category': cat, 'published': True, 'order': int(card.get('data-order', order)) if card else order,
                  'description': text(doc.select_one('.recipe-description')), 'servings': '',
                  'prep_minutes': None, 'cook_minutes': None, 'video_url': '', 'image': '', 'image_alt': '',
                  'ingredient_groups': [], 'steps': [], 'notes': ''}
        image = card.select_one('img') if card else None
        if image:
            record['image'] = normalise_asset(image.get('src', ''), site_url)
            record['image_alt'] = image.get('alt', '')
        vid = videos.get(slug)
        if not vid:
            for iframe in doc.select('iframe[src]'):
                vid = video_id(iframe['src'])
                if vid:
                    break
        if vid:
            record['video_url'] = 'https://www.youtube.com/watch?v=' + vid
        else:
            report['warnings'].append(f'{slug}: no video URL found; no replacement was guessed.')
        cache = {}
        blocks = doc.select('.recipe-body > .recipe-block')
        for idx, block in enumerate(blocks):
            key = block.get('id') or f'block-{idx + 1}'
            prose = block.select_one('.recipe-prose')
            if not prose:
                raise ValueError(f'{slug}: missing recipe-prose in {key}; import stopped to avoid losing content.')
            content = as_markdown(prose)
            heading = block.select_one('.recipe-subheading')
            cache[key] = {'markdown': content, 'html': inner(prose), 'id': key,
                          'title': text(heading), 'heading_html': inner(heading) if heading else ''}
            item = {'title': text(heading), 'body': content, '_key': key}
            if 'ingredient-group' in block.get('class', []):
                item['items'] = []
                item['after_step'] = len(record['steps'])
                record['ingredient_groups'].append(item)
            elif 'method-block' in block.get('class', []):
                record['steps'].append(item)
            else:
                raise ValueError(f'Unrecognised recipe block in {slug}.')
        known = {'recipe-section-title', 'measurement-bar', 'ingredient-help', 'checklist-tools', 'measurement-notes', 'quantity-notice', 'recipe-block'}
        for child in doc.select_one('.recipe-body').find_all(recursive=False):
            if not set(child.get('class', [])).intersection(known):
                raise ValueError(f'{slug}: unrecognised recipe content {child.name}. Import stopped instead of discarding it.')
        if not record['ingredient_groups'] or not record['steps']:
            raise ValueError(f'{slug}: ingredients or instructions missing.')
        recipes.append((slug, record))
        caches[slug] = cache
        report['recipes'].append({'slug': slug, 'ingredient_groups': len(record['ingredient_groups']), 'steps': len(record['steps']), 'video': bool(vid), 'measurement_spans': len(doc.select('.measure'))})
        report['source_hashes'][str(page.relative_to(site))] = sha(page)
    unknown_cards = set(cards) - {s for s, _ in recipes}
    if unknown_cards:
        raise ValueError('Directory links to missing recipe files: ' + ', '.join(sorted(unknown_cards)))
    settings = {'schema_version': 1, 'site_directory': str(site.relative_to(ROOT)), 'repo': args.repo,
                'branch': args.branch, 'site_url': site_url, 'auth_url': args.auth_url.rstrip('/'),
                'original_slugs': [s for s, _ in recipes]}
    # Write ONLY after every source page has passed the compatibility checks.
    for slug, record in recipes:
        write_json(ROOT / f'content/recipes/{slug}.json', record)
        write_json(ROOT / f'cms/imported/blocks/{slug}.json', caches[slug])
    template = next((p for p in pages if p.stem == 'strawberry-tiramisu'), pages[0])
    write(ROOT / 'cms/imported/recipe-template.html', template.read_text(encoding='utf-8'))
    write_json(ROOT / 'cms/imported/report.json', report)
    configure(settings)
    write_json(settings_path, settings)
    write(ROOT / 'assets/uploads/.gitkeep', '')
    print(f'Imported {len(recipes)} recipes from {site.relative_to(ROOT)}; retained {sum(x["video"] for x in report["recipes"])} video links.')
    print('No source HTML, CSS, JavaScript, images, or contact settings were overwritten.')


def render_markdown(value: str, cached: dict | None = None) -> str:
    if cached and value.strip() == cached['markdown'].strip():
        return cached['html']
    fragment = soup(MARKDOWN.render(str(value or '')))
    # Unit conversion operates on visible text nodes, never on URLs or markup.
    for node in list(fragment.find_all(string=True)):
        if any(parent.name in {'code', 'pre', 'script', 'style'} for parent in node.parents):
            continue
        converted = convert_text(str(node))
        pieces = list(soup(converted).contents)
        node.replace_with(*pieces)
    return str(fragment)


def validate_recipe(slug: str, data: dict) -> None:
    if not SLUG.fullmatch(slug):
        raise ValueError(f'Unsafe recipe filename: {slug}')
    if not isinstance(data, dict) or not str(data.get('title', '')).strip():
        raise ValueError(f'{slug}: a recipe title is required.')
    if data.get('category') not in CATEGORIES:
        raise ValueError(f'{slug}: choose one of the existing categories.')
    if not isinstance(data.get('published', False), bool):
        raise ValueError(f'{slug}: published must be true or false.')
    if data.get('video_url') and not video_id(data['video_url']):
        raise ValueError(f'{slug}: invalid YouTube link. Use an HTTPS YouTube watch, short, embed, or youtu.be link.')
    for key in ('prep_minutes', 'cook_minutes'):
        val = data.get(key)
        if val not in (None, '') and (not isinstance(val, (int, float)) or isinstance(val, bool) or not 0 <= val <= 100000):
            raise ValueError(f'{slug}: {key} must be a non-negative number.')
    for key in ('ingredient_groups', 'steps'):
        if not isinstance(data.get(key, []), list):
            raise ValueError(f'{slug}: {key} must be a list.')
    if data.get('published') and (not data.get('ingredient_groups') or not data.get('steps')):
        raise ValueError(f'{slug}: visible recipes need ingredients and instructions.')
    for group in data.get('ingredient_groups', []):
        if not isinstance(group, dict) or not isinstance(group.get('items', []), list):
            raise ValueError(f'{slug}: ingredient group is invalid.')
        position = group.get('after_step') or 0
        if not isinstance(position, int) or isinstance(position, bool) or position < 0:
            raise ValueError(f'{slug}: ingredient group position must be a non-negative whole number.')
        for item in group.get('items', []):
            if not str(item.get('ingredient', '')).strip():
                raise ValueError(f'{slug}: an ingredient row needs a name.')
            amount = item.get('amount')
            unit = item.get('unit') or 'piece'
            if amount not in (None, ''):
                if not isinstance(amount, (int, float)) or isinstance(amount, bool) or not 0 <= amount <= 1000000:
                    raise ValueError(f'{slug}: ingredient amount must be a non-negative number.')
                if unit != 'piece' and unit.lower() not in UNITS:
                    raise ValueError(f'{slug}: unsupported ingredient unit {unit}.')
            if item.get('grams_per_cup') not in (None, ''):
                weight = item['grams_per_cup']
                if not isinstance(weight, (int, float)) or not 1 <= weight <= 1500:
                    raise ValueError(f'{slug}: grams per cup must be a number between 1 and 1500.')


def add_checklists(doc: BeautifulSoup, slug: str) -> None:
    counter = 0
    for group in doc.select('.ingredient-group'):
        for ul in group.select('.recipe-prose > ul, .recipe-prose > ol'):
            ul['class'] = ['ingredient-list']
            for li in ul.find_all('li', recursive=False):
                counter += 1
                existing = li.select_one('.ingredient-checkbox')
                if existing:
                    existing.extract()
                copy_node = li.select_one('.ingredient-copy')
                if not copy_node:
                    copy_node = doc.new_tag('div', attrs={'class': 'ingredient-copy'})
                    for child in list(li.contents):
                        copy_node.append(child.extract())
                    li.append(copy_node)
                checkbox = doc.new_tag('input', attrs={'type': 'checkbox', 'class': 'ingredient-checkbox', 'id': f'ing-{slug}-{counter}', 'aria-label': text(copy_node)})
                li.insert(0, checkbox)
                li['class'] = ['ingredient-item']


def measured_item(item: dict) -> str:
    amount = item.get('amount')
    name = html.escape(item.get('ingredient', ''))
    unit = item.get('unit') or 'piece'
    amount_html = ''
    if amount not in (None, ''):
        if unit == 'piece':
            amount_html = html.escape(str(amount).removesuffix('.0')) + ' '
        else:
            amount_html = span(amount, unit, item.get('grams_per_cup') or None, item.get('us_override') or '') + ' '
    note = str(item.get('note', '') or '').strip()
    return '<li>' + amount_html + '<strong>' + name + '</strong>' + (' &mdash; ' + convert_text(note) if note else '') + '</li>'


def build_recipe(site: Path, slug: str, data: dict, settings: dict) -> BeautifulSoup:
    original = site / f'recipes/{slug}.html'
    template = original if original.is_file() else ROOT / 'cms/imported/recipe-template.html'
    doc = soup(template.read_text(encoding='utf-8'))
    cache_path = ROOT / f'cms/imported/blocks/{slug}.json'
    cache = read_json(cache_path) if cache_path.is_file() else {}
    title = data['title'].strip()
    doc.title.string = title + ' | Aaron in the Kitchen'
    doc.select_one('.recipe-title span').string = title
    doc.body['data-recipe'] = slug
    doc.body['data-units'] = 'metric'
    desc = data.get('description') or f'{title}: ingredients and step-by-step cooking instructions from Aaron in the Kitchen.'
    description = doc.select_one('meta[name="description"]')
    if description:
        description['content'] = desc
    for canonical in doc.select('link[rel="canonical"]'):
        canonical.decompose()
    doc.head.append(doc.new_tag('link', attrs={'rel': 'canonical', 'href': settings['site_url'] + f'/recipes/{slug}.html'}))
    crumb = doc.select_one('.breadcrumbs')
    if crumb:
        crumb.clear()
        append_html(crumb, f'<a href="../index.html">Home</a><span aria-hidden="true">/</span><a href="../{data["category"]}.html">{CATEGORIES[data["category"]]}</a><span aria-hidden="true">/</span><span aria-current="page">{html.escape(title)}</span>')
    for a in doc.select('.nav-category > a'):
        a.attrs.pop('aria-current', None)
        if a.get('href') == f'../{data["category"]}.html':
            a['aria-current'] = 'page'
    intro = doc.select_one('.recipe-intro')
    for old in intro.select('.recipe-description, .cms-recipe-meta'):
        old.decompose()
    toolbar = intro.select_one('.recipe-toolbar')
    if data.get('description'):
        p = doc.new_tag('p', attrs={'class': 'recipe-description section-intro'})
        p.string = data['description']
        toolbar.insert_before(p)
    meta = []
    if data.get('servings'):
        meta.append('Serves ' + str(data['servings']))
    if data.get('prep_minutes') not in (None, ''):
        meta.append('Prep: ' + str(data['prep_minutes']) + ' min')
    if data.get('cook_minutes') not in (None, ''):
        meta.append('Cook: ' + str(data['cook_minutes']) + ' min')
    if meta:
        p = doc.new_tag('p', attrs={'class': 'cms-recipe-meta section-intro'})
        p.string = ' | '.join(meta)
        toolbar.insert_before(p)
    shell = doc.select_one('[data-video-slug]')
    if shell:
        shell['data-video-slug'] = slug
        shell['data-video-title'] = title
        cover_title = shell.select_one('.video-cover-title')
        if cover_title:
            cover_title.string = title
        # JS still supplies the native YouTube player, using the generated video map.
    if not original.exists():
        for item in doc.select('.recipe-source-note, .video-original'):
            item.decompose()
        if shell and not data.get('video_url') and data.get('image'):
            shell.clear()
            shell.append(doc.new_tag('img', attrs={'src': asset_href(data['image'], '../', settings), 'alt': data.get('image_alt') or title, 'width': '1280', 'height': '720', 'style': 'width:100%;height:100%;object-fit:cover'}))
    missing = doc.select_one('[data-video-missing]')
    if missing and not data.get('video_url'):
        missing.string = 'No video has been added to this recipe yet.'
    body = doc.select_one('.recipe-body')
    # Keep the original unit controls, advice and recipe-specific quantity warnings.
    instructions_heading = copy.deepcopy(doc.select_one('#instructions'))
    ingredients_heading = doc.select_one('#ingredients')
    controls = []
    for child in list(body.children):
        if isinstance(child, Tag) and child.name == 'section' and 'recipe-block' in child.get('class', []):
            continue
        if isinstance(child, Tag) and child.get('id') == 'instructions':
            continue
        if isinstance(child, Tag) and not original.exists() and 'quantity-notice' in child.get('class', []):
            continue
        controls.append(copy.deepcopy(child))
    body.clear()
    for child in controls:
        body.append(child)
    if not original.exists():
        details = body.select_one('.measurement-notes > div')
        if details:
            details.clear()
            append_html(details, '<p>Metric is the default. US cups and spoons use US customary volume. Ounces (oz) indicate weight, not fluid ounces.</p><p>Weighed ingredients use oz or lb unless an ingredient-specific grams-per-cup value is supplied. Conversions are approximate; use a scale for baking. Counts and quantities described as to taste stay unchanged.</p>')
    used_ids = {'ingredients', 'instructions'}
    def block_id(item: dict, kind: str, i: int) -> str:
        key = item.get('_key', '')
        candidate = key if key in cache else f'{kind}-{i+1}'
        while candidate in used_ids:
            candidate += '-x'
        used_ids.add(candidate)
        return candidate
    ingredient_sections = []
    for idx, group in enumerate(data.get('ingredient_groups', [])):
        section = doc.new_tag('section', attrs={'class': 'recipe-block ingredient-group', 'id': block_id(group, 'ingredient-group', idx)})
        if group.get('title'):
            h = doc.new_tag('h3', attrs={'class': 'recipe-subheading'})
            saved = cache.get(group.get('_key'), {})
            append_html(h, saved['heading_html'] if saved.get('title') == group['title'] and 'heading_html' in saved else convert_text(group['title']))
            section.append(h)
        prose = doc.new_tag('div', attrs={'class': 'recipe-prose'})
        append_html(prose, render_markdown(group.get('body', ''), cache.get(group.get('_key'))))
        if group.get('items'):
            append_html(prose, '<ul>' + ''.join(measured_item(item) for item in group['items']) + '</ul>')
        section.append(prose)
        position = min(group.get('after_step') or 0, len(data.get('steps', [])))
        ingredient_sections.append((position, section))
    for position, section in ingredient_sections:
        if position == 0:
            body.append(section)
    if instructions_heading is None:
        instructions_heading = soup('<h2 class="line-title recipe-section-title" id="instructions"><span>Step-by-Step Cooking Instructions</span></h2>').h2
    body.append(instructions_heading)
    for idx, step in enumerate(data.get('steps', [])):
        section = doc.new_tag('section', attrs={'class': 'recipe-block method-block', 'id': block_id(step, 'step', idx)})
        if step.get('title'):
            h = doc.new_tag('h3', attrs={'class': 'recipe-subheading'})
            saved = cache.get(step.get('_key'), {})
            append_html(h, saved['heading_html'] if saved.get('title') == step['title'] and 'heading_html' in saved else convert_text(step['title']))
            section.append(h)
        prose = doc.new_tag('div', attrs={'class': 'recipe-prose'})
        append_html(prose, render_markdown(step.get('body', ''), cache.get(step.get('_key'))))
        section.append(prose)
        body.append(section)
        for position, ingredients in ingredient_sections:
            if position == idx + 1:
                body.append(ingredients)
    if data.get('notes'):
        append_html(body, '<section class="recipe-block method-block"><h3 class="recipe-subheading">Recipe notes</h3><div class="recipe-prose">' + render_markdown(data['notes']) + '</div></section>')
    add_checklists(doc, slug)
    return doc


def recipe_card(template: Tag, slug: str, data: dict, settings: dict, prefix: str = '') -> Tag:
    card = copy.deepcopy(template)
    card['data-category'] = data['category']
    card['data-order'] = str(data.get('order') or 0)
    card['data-recipe-id'] = slug
    card['data-title'] = data['title']
    card.select_one('a.card-link')['href'] = prefix + f'recipes/{slug}.html'
    card.select_one('h3').string = data['title']
    card.select_one('.eyebrow').string = CATEGORIES[data['category']]
    image = data.get('image') or 'assets/images/hero-placeholder.svg'
    img = card.select_one('img')
    img['src'] = asset_href(image, prefix, settings)
    img['alt'] = data.get('image_alt') or ''
    img.attrs.pop('srcset', None)
    placeholder = 'placeholder' in image or image.endswith('.svg')
    label = card.select_one('.card-image > span')
    if label and not placeholder:
        label.decompose()
    return card


def update_common(doc: BeautifulSoup, page: Path, records: list, settings: dict, card_template: Tag) -> None:
    depth = len(page.parts) - 1
    prefix = '../' * depth
    grouped = {c: [(s, d) for s, d in records if d['category'] == c] for c in CATEGORIES}
    for category, label in CATEGORIES.items():
        dropdown = doc.select_one('#nav-' + category)
        if dropdown:
            listing = dropdown.select_one('ul')
            if listing:
                listing.clear()
                for slug, data in grouped[category]:
                    append_html(listing, '<li><a href="' + prefix + f'recipes/{slug}.html">' + html.escape(data.get('nav_title') or data['title']) + '</a></li>')
            count = dropdown.select_one('.dropdown-overview span')
            if count:
                count.string = str(len(grouped[category]))
    for tab in doc.select('.category-tab'):
        key = Path(urlparse(tab.get('href', '')).path).stem
        amount = len(records) if key == 'recipes' else len(grouped.get(key, []))
        count = tab.select_one('span')
        if count:
            count.string = str(amount)
    for card in doc.select('.category-card'):
        a = card if card.name == 'a' else card.select_one('a')
        if not a:
            continue
        key = Path(a.get('href', '')).stem
        if key in grouped:
            for node in list(card.find_all(string=re.compile(r'^\s*\d+ recipes?\s*$'))):
                node.replace_with(str(len(grouped[key])) + ' recipes')
    related = doc.select_one('.related-grid')
    current = dict(records).get(doc.body.get('data-recipe')) if doc.body else None
    if related and current:
        category = current['category']
        candidates = [(s, d) for s, d in grouped[category] if s != doc.body.get('data-recipe')]
        if not candidates:
            candidates = [(s, d) for s, d in records if s != doc.body.get('data-recipe')]
        related.clear()
        for related_slug, related_data in candidates[:3]:
            related.append(recipe_card(card_template, related_slug, related_data, settings, prefix))
        browse = related.parent.select_one('.center-action a')
        if browse:
            browse['href'] = prefix + category + '.html'
            for node in list(browse.children):
                if isinstance(node, NavigableString):
                    node.extract()
            browse.insert(0, 'Browse ' + CATEGORIES[category].lower() + ' ')
    catalog = doc.select_one('[data-catalog]')
    if catalog:
        category = catalog.get('data-category', 'all')
        selected = records if category == 'all' else grouped.get(category, [])
        grid = catalog.select_one('.recipe-grid')
        if grid is None:
            raise ValueError(f'{page}: missing recipe grid.')
        grid.clear()
        for slug, data in selected:
            grid.append(recipe_card(card_template, slug, data, settings, prefix))
        count = catalog.select_one('#results-count')
        if count:
            count.string = str(len(selected)) + (' recipe' if len(selected) == 1 else ' recipes')
    else:
        lookup = dict(records)
        for card in doc.select('.recipe-card[data-recipe-id]'):
            slug = card.get('data-recipe-id')
            if slug in lookup:
                card.replace_with(recipe_card(card_template, slug, lookup[slug], settings, prefix))
            else:
                card.decompose()
    sitemap = doc.select_one('.site-map-grid')
    if sitemap:
        sitemap.clear()
        for category, label in CATEGORIES.items():
            section = soup(f'<section><h2><a href="{prefix}{category}.html">{label}</a><span>{len(grouped[category])} recipes</span></h2><ul></ul></section>').section
            for slug, data in grouped[category]:
                append_html(section.ul, f'<li><a href="{prefix}recipes/{slug}.html">{html.escape(data["title"])}</a></li>')
            sitemap.append(section)


def copy_public(site: Path, out: Path) -> None:
    # Whitelist static files; never publish content JSON, worker code, secrets or source caches.
    for source in site.rglob('*'):
        relative = source.relative_to(site)
        if any(part.startswith('.') and part != '.nojekyll' for part in relative.parts):
            continue
        if any(part in SKIP_DIRS for part in relative.parts) or source.is_symlink() or not source.is_file() or source.is_relative_to(out):
            continue
        if relative.parts[0] == 'admin':
            continue
        if source.suffix.lower() not in PUBLIC_EXTENSIONS and source.name not in {'CNAME', 'robots.txt', '.nojekyll', 'MEASUREMENTS.md'}:
            continue
        if relative.parts[0] == 'recipes' and source.suffix == '.html':
            continue
        target = out / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    shutil.copytree(ROOT / 'admin', out / 'admin', dirs_exist_ok=True)
    uploads = ROOT / 'assets/uploads'
    if uploads.exists():
        for source in uploads.rglob('*'):
            if source.is_file() and not source.is_symlink() and source.suffix.lower() in PUBLIC_EXTENSIONS:
                target = out / 'assets/uploads' / source.relative_to(uploads)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, target)
    write(out / '.nojekyll', '')


def verify_output(out: Path, records: list, settings: dict) -> dict:
    errors = []
    base = urlparse(settings['site_url']).path.rstrip('/')
    pages = [p for p in out.rglob('*.html') if 'admin' not in p.relative_to(out).parts]
    for page in pages:
        doc = soup(page.read_text(encoding='utf-8'))
        for node in doc.select('a[href], img[src], script[src], link[href]'):
            value = node.get('href', node.get('src', ''))
            u = urlparse(value)
            if u.scheme or u.netloc or not u.path:
                continue
            path = unquote(u.path)
            if path.startswith('/'):
                if base and not path.startswith(base + '/'):
                    errors.append(f'{page.relative_to(out)}: root-relative link misses the project path: {value}')
                    continue
                path = path[len(base):].lstrip('/') if base else path.lstrip('/')
                target = out / path
            else:
                target = page.parent / path
            target = target.resolve()
            if not target.is_relative_to(out) or not (target.is_file() or (target / 'index.html').is_file()):
                errors.append(f'{page.relative_to(out)}: missing local file {value}')
    recipe_files = sorted((out / 'recipes').glob('*.html'))
    if len(recipe_files) != len(records):
        errors.append('Published recipe count does not match generated files.')
    for slug, data in records:
        doc = soup((out / f'recipes/{slug}.html').read_text(encoding='utf-8'))
        ids = [n['id'] for n in doc.select('[id]')]
        if len(ids) != len(set(ids)):
            errors.append(f'{slug}: duplicate HTML IDs.')
        for measure in doc.select('.measure'):
            if not measure.get('data-metric') or not measure.get('data-us'):
                errors.append(f'{slug}: incomplete measurement pair.')
    if errors:
        raise ValueError('Build validation failed (the live site has not been deployed):\n' + '\n'.join(errors[:35]))
    return {'html_pages_checked': len(pages), 'published_recipes': len(records), 'local_links': 'passed', 'measurement_pairs': 'passed'}


def build_site(args) -> None:
    settings_path = ROOT / 'cms/settings.json'
    if not settings_path.is_file():
        raise ValueError('Run the one-time import workflow first.')
    settings = read_json(settings_path)
    site = beneath(ROOT / settings['site_directory'])
    out = beneath(ROOT / args.output)
    if out == ROOT or out == site or site.is_relative_to(out) or out.name not in {'_site', 'cms-preview', 'cms-test-output'}:
        raise ValueError('Output must be _site, cms-preview or cms-test-output inside the repository, and not the source directory.')
    records = []
    for path in sorted((ROOT / 'content/recipes').glob('*.json')):
        data = read_json(path)
        validate_recipe(path.stem, data)
        if data.get('published', False):
            records.append((path.stem, data))
    records.sort(key=lambda row: (float(row[1].get('order') or 0), row[1]['title'].lower()))
    if not list((ROOT / 'content/recipes').glob('*.json')):
        raise ValueError('No content files exist; refusing an accidental empty deployment.')
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    copy_public(site, out)
    directory = soup((site / 'recipes.html').read_text(encoding='utf-8'))
    card_template = directory.select_one('.recipe-card')
    if card_template is None:
        raise ValueError('No existing recipe card template was found.')
    search = []
    for slug, data in records:
        doc = build_recipe(site, slug, data, settings)
        update_common(doc, Path(f'recipes/{slug}.html'), records, settings, card_template)
        write(out / f'recipes/{slug}.html', str(doc))
        search.append({'slug': slug, 'title': data['title'], 'navTitle': data.get('nav_title') or data['title'], 'category': data['category'], 'order': data.get('order') or 0, 'ingredientText': ' '.join(text(x) for x in doc.select('.ingredient-group'))})
    for path in list(out.rglob('*.html')):
        rel = path.relative_to(out)
        if rel.parts[0] in {'recipes', 'admin'}:
            continue
        doc = soup(path.read_text(encoding='utf-8'))
        if doc.body:
            update_common(doc, rel, records, settings, card_template)
            write(path, str(doc))
    write(out / 'assets/js/recipes-data.js', '/* Generated from CMS recipe content. */\nwindow.AARON_RECIPES = ' + json.dumps(search, ensure_ascii=False) + ';\n')
    video_data = {slug: video_id(data.get('video_url')) for slug, data in records}
    write(out / 'assets/js/recipe-videos.js', '/* Generated from CMS recipe content. Edit videos in /admin/. */\nwindow.AARON_VIDEOS = ' + json.dumps(video_data, ensure_ascii=False, indent=2) + ';\n')
    site_map = ET.Element('urlset', {'xmlns': 'http://www.sitemaps.org/schemas/sitemap/0.9'})
    for path in sorted(out.rglob('*.html')):
        rel = path.relative_to(out)
        if rel.parts[0] == 'admin' or path.name in {'welcome.html', 'products.html'}:
            continue
        url = ET.SubElement(site_map, 'url')
        ET.SubElement(url, 'loc').text = settings['site_url'] + '/' + rel.as_posix()
    write(out / 'sitemap.xml', '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(site_map, encoding='unicode') + '\n')
    base = urlparse(settings['site_url']).path.rstrip('/')
    write(out / 'robots.txt', f'User-agent: *\nDisallow: {base}/admin/\nSitemap: {settings["site_url"]}/sitemap.xml\n')
    report = verify_output(out, records, settings)
    write_json(ROOT / 'cms/build-report.json', report)
    print(json.dumps(report, indent=2))
    print(f'Built {len(records)} recipes into {out.relative_to(ROOT)}. The original site files remain unchanged.')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    imp = sub.add_parser('import', help='Import the current website once. Never overwrites existing CMS recipes.')
    imp.add_argument('--site-directory', default='.')
    imp.add_argument('--repo', default='Mersord/AaronInTheKitchen')
    imp.add_argument('--branch', default='main')
    imp.add_argument('--site-url', default='https://mersord.github.io/AaronInTheKitchen')
    imp.add_argument('--auth-url', required=True)
    build = sub.add_parser('build', help='Generate the public website and validate its local links.')
    build.add_argument('--output', default='_site')
    args = parser.parse_args()
    try:
        import_site(args) if args.command == 'import' else build_site(args)
    except (ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        raise SystemExit(1)


if __name__ == '__main__':
    main()
