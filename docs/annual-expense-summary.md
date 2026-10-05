# Owner annual expense summary

Receipts now includes an owner-only calendar-year expense calculator. Calculate refreshes the existing paginated expense collection before computing supplier receipt totals in integer cents. Categories include parts/materials, equipment, vehicle/fuel, supplies, insurance, rent, utilities, marketing, subscriptions, payroll, professional services, fees and Other. Custom saved categories are retained.

This reports only logged expenses. Customer payment receipts remain separate. No bank charge import, payroll auto-import, tax rate or tax liability calculation is implied. The accountant CSV contains category totals and individual receipt records, with formula-safe cell escaping. Invalid amounts in the selected year and undated records are counted and excluded with a visible review notice; missing photos are counted separately. Dates must be calendar dates; receipt edits now validate dates and two-decimal nonnegative amounts. Recalculate refreshes after edits; a failed load clears the prior result and disables exports.

Calendar week/day styling matches the approved month navy/blue/white/yellow presentation and gives the existing transparent calendar logo a larger contained display. The original calendar-reference stylesheet and month renderer were not changed. New CSS selectors explicitly require week or day.

Validation: full release build passed, including annual boundary/cents/category tests, owner restriction and refresh-failure tests, formula-safe export, existing month calendar tests and all prior release gates. Browser screenshot verification could not run because the available Chromium package failed during environment initialization.
