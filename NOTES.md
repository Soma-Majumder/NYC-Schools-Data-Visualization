# NYC School Report Card — dataset notes

Source: `https://data.cityofnewyork.us/resource/dnpx-dfnc.json`
Sample pulled: `?$limit=1000` → saved to `data/raw_sample.json` (1000 rows, 316 KB)
Full dataset: ~1.5M rows — do not pull without a `$where` filter.

## What one row is

One row = **one school, one metric, one year** (and, it turns out, one `report_type`).
It is *not* "a school" — a single DBN shows up across dozens/hundreds of rows,
one per metric. In the 1000-row sample there were only **26 distinct DBNs**
but **214 distinct `metric_variable_name` values**.

To get "a school," you must `group by dbn` (and pick a `school_year` +
`report_type`) and pivot metrics into columns — never treat two rows with
the same `dbn` as comparable on their own.

## Columns that actually matter

| Column | Notes |
|---|---|
| `dbn` | School ID. The grouping key. |
| `school_name` | Human-readable, redundant with `dbn`. |
| `school_year` | The year the metric covers (e.g. `2020` = 2020-21 school year). |
| `report_year` | The year the report was *published* — one year after `school_year`. Don't confuse the two. |
| `report_type` | `EMS`, `HS`, or `HST`. **Same DBN can appear under more than one report_type** (e.g. a 6-12 school reports as both EMS and HS) — same metric, same year, different value. Group key is really `dbn + metric_variable_name + school_year + report_type`, not just the first three. |
| `school_type` | Elementary / Middle / High School, etc. |
| `metric_variable_name` | The metric ID. **Filter to exactly one of these before comparing `metric_value` across rows** — ~214+ distinct values seen in just 1000 rows (docs say ~290 across the full set). |
| `metric_display_name` | Human label for the metric. Mostly 1:1 with `metric_variable_name`, but 24 of 214 variable names mapped to more than one display name in the sample — don't assume the label is a reliable dedup key on its own. |
| `number_of_students` | Denominator/population size behind the metric — important for suppressed values (see below). |
| `metric_value` | The actual number, as a **string** (e.g. `"0.904"`), needs casting to float. Appears to mostly be a proportion (0–1 range) but not guaranteed for every metric — check `metric_display_name` per metric before assuming a scale. |

## The one surprise

**`metric_value` is often missing from the row entirely — not `null`, just absent as a key.**
209 of 1000 sample rows (~21%) had no `metric_value` field at all. Naively doing
`row["metric_value"]` throws a `KeyError`; you need `row.get("metric_value")`.

These missing-value rows aren't random — they cluster on small-population subgroup
metrics (e.g. `chronic_absent_ems_allei` "...Native American" with
`number_of_students: "2"`). Looks like NYC DOE suppresses metrics when the
subgroup is too small to report reliably, and Socrata's JSON export just
drops the field rather than emitting `null`. Any pipeline needs to handle
"metric wasn't reported" as a distinct case from "metric was zero."

## Next steps (not yet done)

- Decide on a canonical grouping key: `(dbn, school_year, report_type)` per school-row,
  pivoting `metric_variable_name` → columns.
- Pull metric name → display name lookup once, resolve the 24 ambiguous cases.
- Query with `$where=metric_variable_name='...'` to pull one metric at a time
  instead of the full 1.5M-row table.
