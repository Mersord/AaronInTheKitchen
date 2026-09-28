# Measurement conventions

This copy starts in Metric. The small Metric / US selector applies to ingredients,
method text, oven temperatures and measured pan dimensions on all 43 recipe pages.
The browser remembers the last selected system when local storage is available.
Without JavaScript, the complete recipe is still readable in Metric.

## Conversion rules

- 1 US customary cup = 236.5882365 mL (not a 250 mL metric cup).
- 1 US tablespoon = 14.78676478125 mL; 1 US teaspoon = 4.92892159375 mL.
- 1 US fluid ounce = 29.5735295625 mL. Fluid ounces are volume, not weight.
- 1 avoirdupois ounce = 28.349523125 g; 1 pound = 453.59237 g.
- A stated American stick of butter is treated as 4 oz by weight.
- 1 inch = 2.54 cm. Converting dimensions does not change recipe yield or guarantee
  that a different commercially labelled pan will be a suitable substitute.
- C = (F - 32) x 5 / 9. Explicit source oven-setting pairs within 5 C of the exact
  conversion retain the source's conventional rounded settings. Larger conflicts
  retain Celsius and recalculate Fahrenheit, with a visible note. This is NOT an
  automatic conversion between fan and conventional ovens.

Exact source metric weights and volumes are retained. Converted display values
are rounded at the final step only, generally to whole grams or millilitres for
larger amounts and finer increments for small amounts. Temperatures are shown to
at most one decimal place. Cup fractions are used when the rounding error is no
more than 1.5%; otherwise a decimal is shown. Very small mass amounts may need a
precision scale.

Both versions are saved directly in the HTML as `data-metric` and `data-us` values.
The switch reads those values; it never converts an already rounded display value
back into the other system. Repeated switching therefore does not cause drift.

## Dry ingredients are NOT treated like water

A cup of flour and a cup of sugar have different weights. For supported ingredients,
the following ingredient-specific estimates are used from King Arthur Baking's
Ingredient Weight Chart. Brown sugar means packed brown sugar; flour assumes the
chart's normal measuring method. Packing, brand and ingredient condition can change
actual weights. A scale is preferable, especially for baking.

| Ingredient | Grams per US cup used |
| --- | ---: |
| All-purpose / bread flour | 120 |
| Granulated white sugar | 198 |
| Packed brown sugar | 213 |
| Powdered / confectioners' sugar | 113 |
| Cocoa powder | 84 |
| Cornstarch | 112 |
| Tapioca starch | 113 |
| Potato starch | 152 |
| Panko breadcrumbs | 50 |
| Dried breadcrumbs | 112 |
| Uncooked long-grain white rice | 198 |
| Cream cheese, mascarpone, ricotta | 227 |

The chart's spoon-weight entries are also used: baking powder 4 g per teaspoon,
baking soda 6 g per teaspoon, and fine/table salt 6 g per teaspoon. Fine sea salt is
treated as fine/table salt, not coarse salt or an unspecified salt blend. These
remain estimates; use the original weighed quantity when precision matters.

For ingredients without a supported density (including mixed spices, unspecified
sea salt, and liquids originally weighed in grams), **no density is invented**.
Volume becomes mL/L in Metric; source mass becomes oz/lb in US. Thus some spices
are shown in mL rather than grams. An mL amount is measured by volume, not weighed.
Cheese, butter, meat and other weighed ingredients can remain oz/lb in US rather
than being forced into cups. Counts of eggs, cans and cloves, pinches and 'to taste'
remain unchanged. Packaging sizes should be checked before substituting products.

## Conflicting source amounts

The supplied export itself sometimes mixes contradictory quantities. Where it
presents an approximate US/Metric equivalent, the explicit metric quantity takes
precedence and the other view is calculated from it. Conflicts greater than 10%,
and mass/volume conflicts without a supported density, receive a visible recipe
note. Impossible-to-resolve alternatives remain clearly described in the notes,
not silently treated as equivalent. For example, 500 g of rice is not treated as
three US cups, and 680 g of evaporated milk is not assumed to equal 500 mL.

The source recipe wording has not been kitchen-tested. Converting units cannot
resolve missing ingredients, ambiguous amounts or other source-recipe defects.
The brioche export, for example, omits the main-dough ingredient list and never
states its butter quantity. It is flagged; no invented quantities were added.

## Explicit food-safety corrections

Three unsafe source directions in two recipes were corrected and logged:

- Southern Fried Chicken: a 65-74 C internal-temperature range was replaced with
  at least 74 C / 165 F in every piece, measured without touching bone.
- Southern Fried Chicken: advice to leave raw chicken out until room temperature
  was replaced with keeping it refrigerated until ready to coat and cook.
- Lemon Pie: a four-hour countertop holding instruction was replaced with prompt
  refrigeration, under two hours total at room temperature (under one hour when
  above 32 C / 90 F).

These are identified as food-safety edits in the affected pages; they are not
presented as merely unit conversion. This does not constitute a comprehensive
food-safety review of every recipe.

## Sources

NIST, SI Units - Volume:
https://www.nist.gov/pml/owm/si-units-volume

NIST, Metric Kitchen:
https://www.nist.gov/pml/owm/metric-si/metric-kitchen

NIST, Unit Conversion:
https://www.nist.gov/pml/owm/metric-si/unit-conversion

King Arthur Baking, Ingredient Weight Chart:
https://www.kingarthurbaking.com/learn/ingredient-weight-chart

USDA FSIS, Safe Minimum Internal Temperature Chart:
https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/safe-temperature-chart

USDA FSIS, Steps to Keep Food Safe:
https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/steps-keep-food-safe

The numerical conversion audit, source notes and exact food-safety edits are in
`_build/measurement-audit.json`. This is an implementation audit, not a claim that
all source recipes have been independently verified or kitchen-tested.
