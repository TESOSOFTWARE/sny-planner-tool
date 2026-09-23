# Customer requirement mapping and open decisions

This note records the requirements extracted from the handover chat and the
parts that still need a customer example before implementation. It is kept
alongside the code so the next change can be traced to an agreed input/output
rule instead of guessing from a screenshot.

## Confirmed and implemented in the current import flow

- Excel rows use `PI NUMBER` + `NO` as the identity. Blank `NO` values are
  generated from the unused numbers in the same PI group, so row order does not
  silently change an existing line.
- Preview and confirm share `importedOrderRowSchema`.
- Meter orders require total length. Roll orders require quantity + metres per
  roll and may leave total length blank. Piece orders require quantity + piece
  length.
- Excel can carry the same line fields as **New Order**: production GSM, MB
  code, mesh type, needle count, beam count, packing, line note, eyelet fields,
  delivery date, container size, order type, roll length and piece length.
- Existing order customer links can be backfilled with
  `scripts/seed-customers.ts --dry-run` first. Matching is case-insensitive;
  `--run` is the explicit write mode.
- If an import has the same `PI + NO` but different content, the preview marks
  a conflict and confirm leaves the stored order untouched. The supported next
  action is editing the order in the detail screen.
- Inventory reports use the selected group, date and report block. The report's
  `LAST STOCK` is the authoritative closing stock; identical retries do not
  create duplicate movements, same-day corrections require explicit approval,
  and older reports are rejected. Manual changes are protected by the snapshot
  provenance rules.
- Packing output is one six-field snapshot per calendar day. Filename changes
  do not create or delete days, and missing days remain in the database.

## Requirement needing a customer example

The chat includes a First Bar / Middle Bar / Back Bar colour table and asks for
“phần màu theo công thức”. The screenshots identify technical yarn/colour
values, but do not define a deterministic rule that can be applied to every
order. Before adding fields or calculations, please confirm one example in this
format:

| Input | Expected First Bar | Expected Middle Bar | Expected Back Bar |
|---|---|---|---|
| Customer, product/order type, colour, width, GSM, MB code, any heating flag | ? | ? | ? |

Also confirm whether each bar is a single colour, a list of colour/material
segments, or a reference to a colour preset. The implementation should then be
added to the customer-specific data model and preview/API together. A/B
selection and beam/MB formulas are excluded from the current plan until that
example and rule are approved.

## Inventory/report requirement needing scope

The repository already has the Materials module and material-report import
paths, and the baseline/same-day/older-report rules above are implemented. Any
future report that introduces additional columns or business formulas still
needs a concrete file header and field definitions. The handover does not say
whether that future request means:

1. a read-only report from existing material transactions,
2. an opening-stock/import workflow, or
3. a customer-specific Excel report with new columns and formulas.

Please provide the report name/file header and the expected columns (including
the definition of opening stock, inbound, outbound, reject and closing stock)
for any future extension.
