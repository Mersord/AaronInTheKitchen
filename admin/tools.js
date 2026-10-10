(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const format = number => Number(number.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2, useGrouping: false });
  const conversions = {
    'g-oz': [n => n / 28.349523125, 'oz'], 'oz-g': [n => n * 28.349523125, 'g'],
    'kg-lb': [n => n / .45359237, 'lb'], 'lb-kg': [n => n * .45359237, 'kg'],
    'ml-cup': [n => n / 236.5882365, 'US cups'], 'cup-ml': [n => n * 236.5882365, 'mL'],
    'c-f': [n => n * 9 / 5 + 32, '\u00b0F'], 'f-c': [n => (n - 32) * 5 / 9, '\u00b0C'],
    'cm-in': [n => n / 2.54, 'in'], 'in-cm': [n => n * 2.54, 'cm']
  };
  let fractionValue = '', measureValue = '';
  function updateFraction() {
    const parsed = window.AaronStudio.parseAmount($('fraction').value);
    fractionValue = parsed.ok && parsed.value !== null ? window.AaronStudio.pretty(parsed.value) : '';
    $('fraction-result').textContent = fractionValue || 'Enter a valid fraction or number.';
    $('fraction-copy').disabled = !fractionValue;
  }
  function updateMeasure() {
    const kind = $('conversion').value;
    let text = $('measure').value.trim();
    let sign = 1;
    if (['c-f', 'f-c'].includes(kind) && text.startsWith('-')) { sign = -1; text = text.slice(1); }
    const parsed = window.AaronStudio.parseAmount(text);
    const conversion = conversions[kind];
    measureValue = parsed.ok && parsed.value !== null && conversion ? format(conversion[0](sign * parsed.value)) + ' ' + conversion[1] : '';
    $('measure-result').textContent = measureValue || 'Enter a valid amount.';
    $('measure-copy').disabled = !measureValue;
  }
  async function copy(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      $('copy-status').textContent = 'Copied: ' + value;
    } catch (_) {
      $('copy-status').textContent = 'Clipboard access is unavailable. Select and copy this value: ' + value;
    }
  }
  $('fraction').addEventListener('input', updateFraction);
  $('measure').addEventListener('input', updateMeasure);
  $('conversion').addEventListener('change', updateMeasure);
  $('fraction-copy').addEventListener('click', () => copy(fractionValue));
  $('measure-copy').addEventListener('click', () => copy(measureValue));
  document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', () => copy(button.dataset.copy)));
  updateFraction(); updateMeasure();
})();
