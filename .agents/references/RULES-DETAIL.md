# SNY Planner — domain contracts & API/Excel detail (tách từ AGENTS.md v1.1)

> File detail cho AGENTS.md index. AGENTS.md chỉ giữ index ~30 dòng; nội dung dưới đây là luật đầy đủ, không rút gọn.

## Domain contracts
- A PI can contain multiple lines with different specifications. Check field ownership in schema and handlers before moving fields between header and line.
- Total metres depend on order type: meters uses total length; rolls uses quantity × roll length; pieces uses quantity × piece length. Area = width × total metres; contractual kg = area × GSM / 1000.
- GSM fields (`gsm`, `productionGsm`, `rawFabricGsm`, `coatingGsm`, `finishedGsm`) accept at most two decimal places without rounding inputs; preserve each existing range and nullable rule. Integer counts remain integers.
- Preserve historical PO values `qtySqm` and `totalWeightKgs`; recalculate only through intended create/edit behavior. Do not bulk rewrite history without approval.
- Internal yarn need currently uses `productionGsm ?? gsm` and a 1.05 factor. This is not a universal factory loss rule; do not invent tolerances, rounding, MB rates or new formulas.
- Draft orders may reserve machine slots through placeholder assignments. One order can use multiple machines; conflicting intervals on one machine must be rejected using established date-boundary semantics.
- Reassignment and schedule replacement must preserve links between real output and orders. Check concurrency, not only sequential overlap checks.
- UI DONE derived from elapsed schedule does not prove production, packing or delivery completion. Distinguish calculated UI status from stored `status`.
- Keep `KnittingDailyOutput` (machine/day totals) and `KnittingDailyDetail` (detail breakdown) distinct. Legacy `cumulativeMeters` is not actual cumulative output; do not remove it without compatibility analysis and approval.
- Machine/day totals must not be assumed to belong in full to every order using that machine. Check allocation before changing progress calculations.
- Preserve Rolling `metricLabel` verbatim and merged-date behavior assigning the first day. Unknown SMALL/BIG meaning blocks reinterpretation, not raw metric import or reconciliation; do not invent a daily split.
- `ProductionOrder.beamCount` means số dàn, not Work Order beam count. Do not reinterpret Warping placeholder fields or migrate them solely from inferred workbook semantics.
- Missing data is not zero. Preserve units, source provenance and `dataSource`; do not automatically fuzzy-match ambiguous PI/customer references.
- Manual A/B catalog and immutable per-line recipe snapshots remain proposed until approved and implemented. Existing ColorPreset is not proof that recipe versioning exists.

## API, database and Excel changes
- Trace affected UI, endpoint, validator/parser, persistence and consumers before editing. Preserve response contracts, decimal precision and Vietnamese domain errors.
- Validate untrusted requests and workbook cells server-side with existing validators. Keep Prisma and secrets server-only; use existing client lifecycle and bounded queries.
- Prefer Prisma APIs; any necessary raw SQL must be safely parameterized, never concatenated from untrusted input, and DB execution still needs approval.
- Dependent writes need suitable transactions and concurrency controls. A transaction alone does not prevent overlap or duplicate imports. Keep workbook parsing and network calls outside transactions.
- Preview must not write. Confirm must revalidate payload and relevant current state; explicitly define atomicity or partial success with accurate per-row outcomes/counts.
- Identical re-imports must not duplicate output or inventory effects. Derive identity and replacement scope from actual schema/source; PI plus date is not a universal key.
- Inspect representative sanitized fixtures: headers, units, 1900/1904 date system, merged cells, footer boundaries and date-only semantics. Preserve UTC-safe conversion and Vietnam display dates.
- Respect upload/row/cell limits; reject unsupported formats. Do not execute workbook macros/formulas. Escape formula-leading user text when exporting spreadsheets.
- Keep decimal arithmetic precise until defined serialization/formatting. Investigate UV representation against source before any conversion or backfill.
- Preserve existing UI design, keyboard access, labels, focus, loading/error/empty states. Use narrow client boundaries; no persistent caching for inventory/progress without invalidation rules.
- Work Order calculators, automatic MB/FR/loss/A/B selection, purchasing, automatic stock deduction, auth and AI scheduling are outside the current tranche, not permanently forbidden. New scope needs explicit agreement and applicable approval.
