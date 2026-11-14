# MEDNAV — NASA OSD-575 Data Handoff

## Purpose
Display real research lab results in a separate NASA Lab Results panel.
This is not an Investigation API v1 request or a diagnostic rule set.

## Files
- data/nasa/OSD-575/raw/
  Original metadata ZIP and two source CSV files. Keep unchanged.
- data/nasa/OSD-575/processed/nasa_lab_results.json
  Converted data for backend/frontend integration.

## Source
Study: OSD-575
URL: https://osdr.nasa.gov/bio/repo/data/studies/OSD-575
Dataset label: real_nasa_osdr
Schema: mednav-lab-draft-1
Population: Inspiration4 commercial crew.
Do not merge these crew IDs with synthetic crew A01-A04.

## Contents
- Crew IDs: C001, C002, C003, C004
- 7 sampling timepoints per crew
- 28 samples
- 19 measurement fields per sample
- 532 measurement slots
- 509 numeric values
- 23 missing values stored as null

## Timepoints
Pre-flight: L-92, L-44, L-3
Post-flight: R+1, R+45, R+82, R+194

L means launch; R means return.
Do not treat these as daily records or a continuous 30-day series.
Display in the order above, not alphabetical order.
day_offset uses its associated time_anchor, not one shared origin.

## Measurement fields
- metric: measurement identifier
- unit_from_source_header: source-header unit notation
- value: numeric value or null
- missing: true when value is null
- source_value_text: original value text
- source_column: original CSV column
- reference_min / reference_max: source bounds or null
- source_reference_min_text / source_reference_max_text:
  original bound text

A null unit may indicate a ratio; it does not automatically mean
the unit was lost. Check the submitted CSV when making display labels.

Missing reference bounds are not missing measurements.
Retain the original source text to distinguish these cases.

## QA status
Member 4 ran the CSV-to-JSON checks locally and reported:
PASS: 4 crew, 7 timepoints each
PASS: 28 unique samples match the CSV
PASS: 532 measurement slots and reference ranges match
PASS: 23 missing values preserved as null
PASS: Source labels and units preserved

This verifies conversion against the transformed CSV.
Backend, UI and clinical validation are not established by these checks.

## Member 2 actions
1. Review and agree this draft schema before integration.
2. Load the JSON separately from synthetic health-check records.
3. Coordinate any new API endpoint or field with the team.
4. Preserve null values, units, source labels and sample IDs.
5. Provide backend run instructions for integration testing.

## Member 1 display requirements
- Crew selector
- Measurement selector
- Values at the seven actual sampling timepoints
- "Not available" for null measurements
- Visible source: NASA OSDR — OSD-575
- Separate real research and synthetic demo views

## Member 3 boundary
Do not convert source reference ranges into emergency thresholds,
diagnoses or treatment rules.
Retain synthetic scenarios for decision-engine testing.
