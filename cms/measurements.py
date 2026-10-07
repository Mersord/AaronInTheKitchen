"""Deterministic, conservative conversions for newly edited recipe content.

Imported, unedited content retains its original paired measurements instead.
Mass is NEVER converted to volume without an explicitly supplied cup weight.
This module has no external dependencies and does not round-trip displayed values.
"""
from __future__ import annotations
import html
import math
import re
from fractions import Fraction

CUP_ML = 236.5882365
OZ_G = 28.349523125
LB_G = 453.59237
FRACTIONS = {'\u00bc': .25, '\u00bd': .5, '\u00be': .75, '\u2153': 1/3,
             '\u2154': 2/3, '\u215b': .125, '\u215c': .375, '\u215d': .625, '\u215e': .875}
UNITS = {
    'g': ('mass', 1), 'gram': ('mass', 1), 'grams': ('mass', 1),
    'kg': ('mass', 1000), 'kilogram': ('mass', 1000), 'kilograms': ('mass', 1000),
    'oz': ('mass', OZ_G), 'ounce': ('mass', OZ_G), 'ounces': ('mass', OZ_G),
    'lb': ('mass', LB_G), 'lbs': ('mass', LB_G), 'pound': ('mass', LB_G), 'pounds': ('mass', LB_G),
    'ml': ('volume', 1), 'millilitre': ('volume', 1), 'millilitres': ('volume', 1),
    'milliliter': ('volume', 1), 'milliliters': ('volume', 1),
    'l': ('volume', 1000), 'litre': ('volume', 1000), 'litres': ('volume', 1000),
    'liter': ('volume', 1000), 'liters': ('volume', 1000),
    'cup': ('volume', CUP_ML), 'cups': ('volume', CUP_ML),
    'tbsp': ('volume', CUP_ML/16), 'tablespoon': ('volume', CUP_ML/16), 'tablespoons': ('volume', CUP_ML/16),
    'tsp': ('volume', CUP_ML/48), 'teaspoon': ('volume', CUP_ML/48), 'teaspoons': ('volume', CUP_ML/48),
    'fl oz': ('volume', CUP_ML/8), 'fluid ounce': ('volume', CUP_ML/8), 'fluid ounces': ('volume', CUP_ML/8),
    'cm': ('length', 1), 'centimeter': ('length', 1), 'centimeters': ('length', 1),
    'centimetre': ('length', 1), 'centimetres': ('length', 1),
    'mm': ('length', .1), 'in': ('length', 2.54), 'inch': ('length', 2.54), 'inches': ('length', 2.54),
    '\u00b0c': ('temperature', 1), '\u00b0f': ('fahrenheit', 1),
}
NUM = r'[+\-\u2212]?(?:\d+\s+\d+/\d+|\d+/\d+|\d+(?:[.,]\d+)?\s*[\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e]|[\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e]|\d+(?:[.,]\d+)?)'
UNIT = '(?:' + '|'.join(re.escape(u) for u in sorted(UNITS, key=len, reverse=True)) + ')'
# Match ranges and dimensions as a single group: 20-25 cm, 20 x 30 cm.
PATTERN = re.compile(r'(?<![\w/.-])(?P<values>' + NUM + r'(?:\s*(?:[\u2013\u2014-]|[x\u00d7]|to)\s*' + NUM + r')*)\s*(?:[-\u2011]\s*)?(?P<unit>' + UNIT + r')(?![\w])', re.I)
SEP = re.compile(r'(?<=[\d\u00bc\u00bd\u00be\u2153\u2154\u215b\u215c\u215d\u215e])\s*(\u2013|\u2014|-|x|\u00d7|to)\s*')


def number(value: str | int | float) -> float:
    s = str(value).strip().replace(',', '.').replace('\u2212', '-')
    for glyph, n in FRACTIONS.items():
        if glyph in s:
            return (float(s.replace(glyph, '').strip()) if s.replace(glyph, '').strip() else 0) + n
    if ' ' in s and '/' in s:
        a, b = s.split(None, 1)
        return float(a) + float(Fraction(b))
    result = float(Fraction(s)) if '/' in s else float(s)
    if not math.isfinite(result):
        raise ValueError('Quantity must be a finite number.')
    return result


def decimal(value: float, digits: int = 2) -> str:
    # Tiny quantities must not be rounded to zero.
    if value and abs(value) < 0.01:
        return f'{value:.4g}'
    return f'{value:.{digits}f}'.rstrip('0').rstrip('.')


def kitchen(value: float) -> str:
    """Use familiar fractions only when they are within 1% of the value."""
    for den in (1, 2, 3, 4, 8):
        n = round(value * den)
        if n and abs(n/den - value) <= max(abs(value) * .01, .00001):
            whole, remainder = divmod(n, den)
            if not remainder:
                return str(whole)
            fraction = str(Fraction(remainder, den))
            return f'{whole} {fraction}' if whole else fraction
    return decimal(value)


def converted(values: list[float], unit: str, cup_weight: float | None = None) -> tuple[list[str], str, list[str], str]:
    key = re.sub(r'\s+', ' ', unit.lower().strip())
    if key not in UNITS:
        raise ValueError(f'Unsupported measurement unit: {unit}')
    kind, factor = UNITS[key]
    v = [q * factor for q in values]
    maximum = max(map(abs, v))
    if kind == 'mass':
        metric_factor, metric_unit = (1000, 'kg') if maximum >= 1000 else (1, 'g')
        if cup_weight:
            if not 1 <= cup_weight <= 1500:
                raise ValueError('Grams per US cup must be between 1 and 1500.')
            us = [q/cup_weight for q in v]
            if max(us) < .25:
                us, us_unit = [q*16 for q in us], 'tbsp'
            else:
                us_unit = 'cups'
        else:
            uf, us_unit = (LB_G, 'lb') if maximum >= LB_G else (OZ_G, 'oz')
            us = [q/uf for q in v]
        return [decimal(q/metric_factor) for q in v], metric_unit, [kitchen(q) for q in us], us_unit
    if kind == 'volume':
        mf, mu = (1000, 'L') if maximum >= 1000 else (1, 'mL')
        uf, uu = (CUP_ML/48, 'tsp') if maximum < CUP_ML/16 else ((CUP_ML/16, 'tbsp') if maximum < CUP_ML/4 else (CUP_ML, 'cups'))
        return [decimal(q/mf) for q in v], mu, [kitchen(q/uf) for q in v], uu
    if kind == 'length':
        return [decimal(q) for q in v], 'cm', [kitchen(q/2.54) for q in v], 'in'
    c = [(q - 32) * 5/9 for q in v] if kind == 'fahrenheit' else v
    f = [q * 9/5 + 32 for q in c]
    return [decimal(q, 1) for q in c], '\u00b0C', [decimal(q, 1) for q in f], '\u00b0F'


def pair(amount: str | int | float, unit: str, cup_weight: float | None = None) -> tuple[str, str]:
    parts = SEP.split(str(amount).strip())
    values = [number(x) for x in parts[::2]]
    if any(v < 0 for v in values) and unit.lower() not in ('\u00b0c', '\u00b0f'):
        raise ValueError('Ingredient quantities must not be negative.')
    metric, mu, us, uu = converted(values, unit, cup_weight)
    separators = [' \u00d7 ' if s in ('x', '\u00d7') else '\u2013' for s in parts[1::2]]
    def join(v: list[str], u: str) -> str:
        out = v[0]
        for separator, value in zip(separators, v[1:]):
            out += separator + value
        if u == 'cups' and len(v) == 1 and v[0] == '1':
            u = 'cup'
        return out + ' ' + u
    return join(metric, mu), join(us, uu)


def span(amount: str | int | float, unit: str, cup_weight: float | None = None, us_override: str = '') -> str:
    metric, us = pair(amount, unit, cup_weight)
    if us_override.strip():
        us = us_override.strip()
    source = f'{amount} {unit}'
    note = 'Converted from the editor value. Cup/spoon measures are US volume.'
    if cup_weight:
        note += f' Ingredient-specific estimate: {cup_weight:g} g per US cup.'
    return '<span class="measure" data-metric="{}" data-us="{}" data-original="{}" title="{}">{}</span>'.format(*[html.escape(x, quote=True) for x in (metric, us, source, note, metric)])


def convert_text(text: str) -> str:
    """Returns escaped text with measurement spans; never executes markup."""
    out, cursor = [], 0
    for m in PATTERN.finditer(text):
        out.append(html.escape(text[cursor:m.start()]))
        try:
            out.append(span(m['values'], m['unit']))
        except (ValueError, ZeroDivisionError):
            out.append(html.escape(m[0]))
        cursor = m.end()
    out.append(html.escape(text[cursor:]))
    return ''.join(out)
