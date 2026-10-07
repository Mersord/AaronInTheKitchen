import unittest
from measurements import pair, span, convert_text, number


class MeasurementTests(unittest.TestCase):
    def test_mass_is_not_assumed_to_be_water(self):
        metric, us = pair(250, 'g')
        self.assertEqual(metric, '250 g')
        self.assertIn('oz', us)
        self.assertNotIn('cup', us)

    def test_known_cup_weight(self):
        self.assertEqual(pair(240, 'g', 120), ('240 g', '2 cups'))

    def test_us_cup_volume(self):
        self.assertEqual(pair(2, 'cups'), ('473.18 mL', '2 cups'))

    def test_oven_temperature(self):
        self.assertEqual(pair(350, '\u00b0F'), ('176.7 \u00b0C', '350 \u00b0F'))
        self.assertEqual(pair(180, '\u00b0C'), ('180 \u00b0C', '356 \u00b0F'))

    def test_freezer_temperature(self):
        self.assertEqual(pair(-18, '\u00b0C'), ('-18 \u00b0C', '-0.4 \u00b0F'))
        self.assertIn('data-us="-0.4 \u00b0F"', convert_text('Freeze at -18\u00b0C.'))
        self.assertEqual(pair('-18--10', '\u00b0C'), ('-18\u2013-10 \u00b0C', '-0.4\u201314 \u00b0F'))

    def test_pan_dimensions(self):
        self.assertEqual(pair('9 x 13', 'in'), ('22.86 \u00d7 33.02 cm', '9 \u00d7 13 in'))

    def test_fraction(self):
        self.assertEqual(number('1 1/2'), 1.5)
        self.assertEqual(number('1\u00bd'), 1.5)

    def test_range(self):
        self.assertEqual(pair('1-2', 'cups'), ('236.59\u2013473.18 mL', '1\u20132 cups'))

    def test_counts_and_times_not_converted(self):
        self.assertEqual(convert_text('2 eggs; cook for 20 minutes (1:23).'), '2 eggs; cook for 20 minutes (1:23).')

    def test_no_html_execution(self):
        self.assertIn('&lt;script&gt;', convert_text('<script>alert(1)</script>'))
        self.assertNotIn('<script>', span(10, 'g', us_override='<script>'))

    def test_explicit_override(self):
        self.assertIn('data-us="1 cup"', span(200, 'g', us_override='1 cup'))

    def test_no_zero_for_small_measurement(self):
        self.assertNotEqual(pair(.1, 'g')[1], '0 oz')

    def test_prose_conversion(self):
        value = convert_text('Add 200 g flour and bake at 180 \u00b0C.')
        self.assertEqual(value.count('class="measure"'), 2)
        self.assertIn('data-metric="200 g"', value)
        self.assertIn('data-us="356 \u00b0F"', value)


if __name__ == '__main__':
    unittest.main()
