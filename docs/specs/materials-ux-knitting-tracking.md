# Implementation Plan

## Goal
Resolve 3 issues:
1. **Materials UX**: Provide a slide-in panel for materials to easily view history, set thresholds, and add manual transactions.
2. **Knitting Template**: Generate an Excel template for users to download and fill in daily knitting reports.
3. **Production Tracking Debug**: Investigate why "Đã SX" is 0m on the PO Summary.

## Files to create/modify
1. **`src/components/materials/MaterialSidePanel.tsx`** [NEW] - The slide-in panel component.
2. **`src/app/materials/page.tsx`** [MODIFY] - Add row click handler to `MaterialsTable`, mount `MaterialSidePanel`, add download template button.
3. **`src/components/materials/MaterialsTable.tsx`** [MODIFY] - Add `onClick` prop to rows to open the panel.
4. **`src/app/api/knitting/template/route.ts`** [NEW] - API route to generate and download the Excel template using SheetJS.

## Task 1: Materials slide-in panel — fields, UX flow
- **UX Flow**: Click on a material row in `MaterialsTable` -> side panel slides in from the right (400px width) with a semi-transparent backdrop. The list remains visible behind the backdrop.
- **Section A (Info & Threshold)**: Displays material name and `currentStock`. Includes an input for `minThreshold` and a Save button. Submitting uses `PATCH /api/materials/[id]`.
- **Section B (Manual Transaction)**: A quick form for `txType` (Nhập, Xuất sử dụng, etc.), `quantityKg`, `txDate` (defaults to today), and `note`. Submitting uses `POST /api/materials/[id]/transactions`.
- **Section C (History)**: Fetches the 10 most recent transactions using `GET /api/materials/[id]/transactions` and displays them with color-coded badges (Nhập = green, Xuất = amber, Hỏng/Từ chối = red).
- **Update**: Both Section A and B actions will trigger a data refresh for the panel and the main page (updating the main table's stock and badge).

## Task 2: Knitting template — format, download flow
- Create a `GET` endpoint at `/api/knitting/template`.
- Use `xlsx` (SheetJS) to construct a workbook with a single sheet named `KNITTING`.
- Generate rows for `MACHINE 1`, `MACHINE 2`, and `MACHINE 3`.
- **MACHINE 1 row**: Column C (index 2) = "MACHINE 1", Column O (index 14) = `new Date()` (Today's date).
- **TOTAL rows**: For each machine, Column A (index 0) = machine number (1, 2, 3), Column C = "TOTAL", Column I (index 8) = sample meters (e.g., 1500).
- Add cell comments for instructions ("Điền số mét thực tế của ngày vào đây") to the total cells.
- Add a "Tải file mẫu" button in `/materials` next to the "Import Knitting" button. Clicking triggers a download of the generated file.

## Task 3: Production tracking debug — root cause + fix
- **Investigation Result**: The root cause is **Case A (Không có data trùng khớp)**.
- **Details**: I wrote a script to check the database (`scripts/check-overlap.js`). There are 120 `KnittingDailyOutput` records (with report dates around April 27, 2026) and 17 `MachineAssignment` records (with start dates around May 2, 2026).
- **Conclusion**: There is **no overlap** between the assigned dates (`startDate` to `endDate`) and the available `KnittingDailyOutput.reportDate` records. The calculation logic in `GET /api/knitting/progress/[orderId]` is perfectly correct in returning 0 because no production was recorded on those assigned machines *during the assigned time window*.
- **Fix**: No code fix is needed. We just need to inform the user (Loan/Dung) to import actual knitting data for the dates the machines are scheduled.

## Steps (max 12)
1. Build `src/components/materials/MaterialSidePanel.tsx` with all 3 sections (Threshold, Transaction, History).
2. Modify `src/components/materials/MaterialsTable.tsx` to make rows clickable and pass an `onRowClick` handler.
3. Modify `src/app/materials/page.tsx` to handle panel state, render `MaterialSidePanel`, and add the "Tải file mẫu" button.
4. Build `src/app/api/knitting/template/route.ts` using SheetJS to create the KNITTING template with sample data.
5. Verify types and run `tsc --noEmit`.

## Risks
- SheetJS cell comments might not be fully supported in the free version when exporting, but we can try using `cell.c` array for comments or provide instructions in a dedicated cell if comments fail.

## Manual tests
- Click a material row -> panel opens from the right.
- Save threshold -> badge updates in the background table.
- Add transaction -> `currentStock` updates immediately in panel and table, history list prepends new transaction.
- Close panel -> works clicking X or backdrop.
- Download template -> file `.xlsx` downloads, has `KNITTING` sheet, columns properly aligned for parsing.

## Out of Scope
- Fixing the parser to read multiple sheets.
- Modifying the existing Excel import flow.
- Modifying protected API routes.
