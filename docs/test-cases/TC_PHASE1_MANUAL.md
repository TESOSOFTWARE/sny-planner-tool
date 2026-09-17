# SNY Planner — Manual Test Cases (Phase 1)

**Project:** SNY Planner  
**Version:** v1.0-phase1  
**Prepared by:** QC  
**Last updated:** 2026-06-10  

---

## Summary Table

| TC | Name | Module | Priority | Status |
|---|---|---|---|---|
| TC-01 | Create new order — required fields only | M1 | High | [ ] |
| TC-02 | Create new order — with optional fields | M1 | Medium | [ ] |
| TC-03 | Create duplicate PI Number + sub-line | M1 | High | [ ] |
| TC-04 | Edit existing order | M1 | High | [ ] |
| TC-05 | Delete order with confirmation | M1 | High | [ ] |
| TC-06 | Search by PI Number | M1 | High | [ ] |
| TC-07 | Search by Customer name | M1 | Medium | [ ] |
| TC-08 | Import Excel file | M1 | High | [ ] |
| TC-09 | Bulk paste from Excel | M1 | High | [ ] |
| TC-10 | After save new order → redirect to detail page | M1 | High | [ ] |
| TC-11 | "Assign to machine" button opens modal from order detail | M1→M2 | High | [ ] |
| TC-12 | Assign order to machine with valid dates | M1→M2 | High | [ ] |
| TC-13 | Overlapping dates on same machine → 409 error in Vietnamese | M1→M2 | High | [ ] |
| TC-14 | Start date after end date → client validation error | M1→M2 | High | [ ] |
| TC-15 | Schedule page shows 40 machines | M2 | High | [ ] |
| TC-16 | Navigate prev/next month → grid updates | M2 | High | [ ] |
| TC-17 | Click empty cell → AssignModal opens pre-filled | M2 | High | [ ] |
| TC-18 | Assign from grid cell → PI badge appears | M2 | High | [ ] |
| TC-19 | Click assigned cell → DetailModal shows correct info | M2 | High | [ ] |
| TC-20 | Edit assignment → change end date → grid updates | M2 | High | [ ] |
| TC-21 | Remove assignment → cell becomes empty | M2 | High | [ ] |
| TC-22 | Overlap check from grid → assign already-booked machine | M2 | High | [ ] |
| TC-23 | Primary buttons have navy fill | UI | Medium | [ ] |
| TC-24 | Secondary buttons have outline style | UI | Medium | [ ] |
| TC-25 | Destructive buttons have red outline | UI | Medium | [ ] |
| TC-26 | Side nav icons render correctly | UI | Low | [ ] |
| TC-27 | App loads on Vercel production URL | UI | High | [ ] |

---

## M1 — Production Orders

---

## TC-01: Create new order — required fields only

**Module:** M1  
**Priority:** High  
**Precondition:** User is on `/orders/new`. Database is accessible.

**Steps:**
1. Navigate to `/orders/new`
2. Fill in **PI Number** (e.g. `PI-TEST-001`)
3. Fill in **Sub-line** (e.g. `0`)
4. Fill in **Customer** (e.g. `ADIDAS VIETNAM`)
5. Fill in **Order Date** (e.g. `2026-06-01`)
6. Fill in **Width (m)** (e.g. `4.0`)
7. Fill in **Length (m)** (e.g. `12000`)
8. Fill in **GSM** (e.g. `165`)
9. Fill in **Color** (e.g. `BLACK`)
10. Leave all optional fields empty
11. Click **Save order**

**Expected result:**
- Browser redirects to `/orders/[new-id]`
- Order detail page shows all entered values correctly
- Color is uppercase (BLACK)
- Status shows `PENDING`

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-02: Create new order — with optional fields (Thông số kỹ thuật)

**Module:** M1  
**Priority:** Medium  
**Precondition:** User is on `/orders/new`.

**Steps:**
1. Fill in all required fields (as in TC-01, use a different PI Number e.g. `PI-TEST-002`)
2. Click **Optional fields** to expand the optional section
3. Fill in **Quantity (rolls)**: `10`
4. Fill in **UV %**: `3.50`
5. Check **Flame-Retardant (FR) treatment required**
6. Fill in **Description**: `Test description`
7. Fill in **Remark**: `Test remark`
8. Fill in **Thể loại lưới**: `Dệt kim`
9. Fill in **Số kim**: `28`
10. Fill in **Số dàn**: `4`
11. Click **Save order**

**Expected result:**
- Redirected to order detail page
- All optional fields display under "Optional details" section
- "Thông số kỹ thuật" section shows: Dệt kim / 28 / 4
- FR Treatment shows "Required"

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-03: Create duplicate PI Number + sub-line

**Module:** M1  
**Priority:** High  
**Precondition:** Order `PI-TEST-001` sub-line `0` already exists in the database (created in TC-01).

**Steps:**
1. Navigate to `/orders/new`
2. Fill in **PI Number**: `PI-TEST-001`
3. Fill in **Sub-line**: `0`
4. Fill in all other required fields with valid data
5. Click **Save order**

**Expected result:**
- Form does NOT submit successfully
- Red error banner appears below the form header
- Error message contains: `PI Number "PI-TEST-001" with sub-line 0 already exists`
- User remains on the `/orders/new` page

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-04: Edit existing order

**Module:** M1  
**Priority:** High  
**Precondition:** At least one order exists. User is on the order detail page (`/orders/[id]`).

**Steps:**
1. Open any order detail page
2. Click **Edit** button (navy outline)
3. Change **Customer** to a new value (e.g. `NIKE VIETNAM`)
4. Change **Color** to `WHITE`
5. Change **Số kim** to `32`
6. Click **Save changes**

**Expected result:**
- Page returns to view mode
- Updated Customer, Color (WHITE, uppercase), and Số kim (32) values display correctly
- "Last Updated" timestamp reflects current time

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-05: Delete order with confirmation

**Module:** M1  
**Priority:** High  
**Precondition:** At least one order exists that is NOT assigned to a machine. User is on the order detail page.

**Steps:**
1. Open an order detail page
2. Note the PI Number displayed
3. Click **Delete** button (red outline)
4. Confirm the delete dialog appears with the correct PI Number
5. Click **Confirm Delete**

**Expected result:**
- Browser redirects to `/orders`
- The deleted order no longer appears in the orders table
- A search for the deleted PI Number returns no results

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-06: Search by PI Number

**Module:** M1  
**Priority:** High  
**Precondition:** At least 5 orders exist with different PI Numbers.

**Steps:**
1. Navigate to `/orders`
2. Locate the search/filter input in the orders table
3. Type part of a known PI Number (e.g. `PI-2024`)
4. Observe the table results

**Expected result:**
- Table filters in real-time (no page reload)
- Only orders whose PI Number matches the search string are shown
- Clearing the search input restores the full list

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-07: Search by Customer name

**Module:** M1  
**Priority:** Medium  
**Precondition:** At least 2 different customers exist in the orders table.

**Steps:**
1. Navigate to `/orders`
2. Type a known customer name (e.g. `ADIDAS`) in the search input
3. Observe the table results

**Expected result:**
- Only orders matching that customer name are shown
- Search is case-insensitive

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-08: Import Excel file

**Module:** M1  
**Priority:** High  
**Precondition:** A valid `ORDER_LIST.xlsx` file is available. File contains at least 3 rows with valid data.

**Steps:**
1. Navigate to `/orders`
2. Click **Import Excel** button (navy outline)
3. In the modal, click **Browse file** and select the `.xlsx` file
4. Verify the file name appears with a green checkmark
5. Click **Parse file →**
6. Review the preview table — confirm data looks correct
7. Click **Confirm Import**

**Expected result:**
- Modal transitions to a success screen
- Success message shows number of rows imported and duplicates skipped
- After closing modal, the orders table refreshes and shows the new orders

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-09: Bulk paste from Excel

**Module:** M1  
**Priority:** High  
**Precondition:** User has Excel open with order rows copied to clipboard.

**Steps:**
1. Navigate to `/orders/bulk`
2. Click inside the textarea (labelled "Copy rows from Excel and paste here")
3. Press `Ctrl+V` to paste the copied Excel rows
4. Verify the preview table populates with parsed rows
5. Review data in the preview for accuracy
6. Click **Import [N] orders**

**Expected result:**
- Preview table shows correctly parsed data from clipboard
- After import, success message displays count
- New orders appear in `/orders`

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-10: After save new order → redirect to detail page

**Module:** M1  
**Priority:** High  
**Precondition:** User is on `/orders/new`.

**Steps:**
1. Navigate to `/orders/new`
2. Fill in all required fields with valid data (unique PI Number)
3. Click **Save order**
4. Observe browser behavior immediately after clicking

**Expected result:**
- No success banner appears
- Browser immediately navigates to `/orders/[new-id]` (the newly created order's detail page)
- All submitted values are visible on the detail page

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## M1 → M2 Link

---

## TC-11: "Assign to machine" button opens modal from order detail

**Module:** M1→M2  
**Priority:** High  
**Precondition:** User is on any order detail page (`/orders/[id]`). The order is NOT already assigned to a machine.

**Steps:**
1. Open any order detail page
2. Locate the **Assign to machine** button in the top-right action bar
3. Click **Assign to machine**

**Expected result:**
- A modal titled "Assign to machine" appears
- Modal shows the order's PI Number and Customer name (read-only)
- Modal has: Machine dropdown (M-001…M-040), Start Date picker, End Date picker
- Cancel and Assign buttons are visible

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-12: Assign order to machine with valid dates

**Module:** M1→M2  
**Priority:** High  
**Precondition:** Modal is open from TC-11. The selected machine is free during the chosen date range.

**Steps:**
1. Select a machine from the dropdown (e.g. `M-010`)
2. Set **Ngày bắt đầu** (Start Date) to `2026-07-01`
3. Set **Ngày kết thúc** (End Date) to `2026-07-15`
4. Click **Assign**

**Expected result:**
- Modal shows "Đã xếp lịch thành công" with a green checkmark
- Modal closes automatically after ~1.5 seconds
- Navigating to `/schedule` and selecting July 2026 shows the PI badge on M-010 across days 1–15

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-13: Overlapping dates on same machine → 409 error in Vietnamese

**Module:** M1→M2  
**Priority:** High  
**Precondition:** Machine M-010 is already assigned for 2026-07-01 to 2026-07-15 (from TC-12). A second unassigned order exists.

**Steps:**
1. Open a different order detail page
2. Click **Assign to machine**
3. Select machine `M-010`
4. Set Start Date: `2026-07-10`
5. Set End Date: `2026-07-20`
6. Click **Assign**

**Expected result:**
- Modal does NOT close
- Inline error message appears (yellow/amber banner): `Máy đã được xếp lịch trong khoảng thời gian này`
- The assignment is NOT created

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-14: Start date after end date → client validation error

**Module:** M1→M2  
**Priority:** High  
**Precondition:** "Assign to machine" modal is open.

**Steps:**
1. Select any machine
2. Set **Start Date** to `2026-07-20`
3. Set **End Date** to `2026-07-10` (before start date)
4. Click **Assign**

**Expected result:**
- Form does NOT submit to the server
- Inline error appears: `End Date cannot be before Start Date`
- No network request is made (verify in browser DevTools Network tab — optional)

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## M2 — Machine Schedule

---

## TC-15: Schedule page shows 40 machines

**Module:** M2  
**Priority:** High  
**Precondition:** User is logged in and can access the app.

**Steps:**
1. Navigate to `/schedule`
2. Count the rows in the machine grid (left-most column)

**Expected result:**
- Exactly 40 machine rows are visible: `M-001` to `M-040`
- Each row label is in monospace font
- The page header shows `40 machines`

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-16: Navigate prev/next month → grid updates correctly

**Module:** M2  
**Priority:** High  
**Precondition:** User is on `/schedule` page.

**Steps:**
1. Note the currently displayed month (e.g. June 2026)
2. Click the **chevron_left** (`<`) button
3. Note the new month displayed (e.g. May 2026)
4. Verify the number of columns matches the days in May (31)
5. Click the **chevron_right** (`>`) button twice
6. Verify July 2026 is shown with 31 columns

**Expected result:**
- Month label updates correctly on each click
- Column count matches actual days in the displayed month
- Weekend columns (Sa, Su) appear in a lighter colour
- Assignments for each month load correctly (no stale data)

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-17: Click empty cell → AssignModal opens with pre-filled date

**Module:** M2  
**Priority:** High  
**Precondition:** At least one empty cell exists in the schedule grid.

**Steps:**
1. Navigate to `/schedule`
2. Click any empty cell in the grid (e.g. M-005, day 5)

**Expected result:**
- "Assign Order" modal opens
- **Machine** field is pre-filled with the correct machine ID (e.g. `M-005`) and is read-only
- **Start Date** field is pre-filled with the clicked date in DD/MM/YYYY format and is read-only
- **End Date** picker defaults to the same day as Start Date
- Order dropdown is present and populated

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-18: Assign from grid cell → PI badge appears on grid

**Module:** M2  
**Priority:** High  
**Precondition:** AssignModal is open for M-005, day 5. An unassigned order exists.

**Steps:**
1. Select an order from the dropdown
2. Set End Date to day 10 of the same month
3. Click **Assign**

**Expected result:**
- Modal closes
- Grid refreshes automatically
- A navy/primary coloured badge with the PI Number appears across M-005, days 5–10
- Badge starts with a left-rounded corner on day 5 and right-rounded corner on day 10

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-19: Click assigned cell → DetailModal shows correct info

**Module:** M2  
**Priority:** High  
**Precondition:** At least one assignment exists on the grid (from TC-18).

**Steps:**
1. Click on any day within an assigned cell range

**Expected result:**
- "Assignment Details" modal opens
- Displays: PI Number, Customer, Machine ID, Duration (start date — end date) in DD/MM/YYYY format
- **Edit** button (navy outline) and **Remove** button (red outline) are visible

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-20: Edit assignment — change end date → grid updates

**Module:** M2  
**Priority:** High  
**Precondition:** DetailModal is open for an existing assignment.

**Steps:**
1. Click **Edit** in DetailModal
2. Modal switches to edit mode showing the same fields pre-filled
3. Change the **End Date** to 5 days later
4. Click **Save**

**Expected result:**
- Modal closes
- Grid refreshes
- The assignment badge now extends to the new end date
- The original end date cell is no longer highlighted

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-21: Remove assignment → cell becomes empty

**Module:** M2  
**Priority:** High  
**Precondition:** DetailModal is open for an existing assignment.

**Steps:**
1. Click **Remove** in the DetailModal
2. Confirm the browser's confirmation dialog (if any)

**Expected result:**
- Modal closes
- Grid refreshes
- All cells previously covered by the removed assignment are now empty/clickable
- Clicking one of those cells opens the AssignModal (not DetailModal)

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-22: Overlap check from grid — assign already-booked machine

**Module:** M2  
**Priority:** High  
**Precondition:** M-005 is assigned for days 5–10. User clicks an empty cell on M-005 for a different day overlapping that range.

**Steps:**
1. Click on M-005, day 8 (within an existing assignment — this should open DetailModal, not AssignModal)
2. Instead, click on M-005, day 12 (empty cell after the assignment)
3. In AssignModal, select any order
4. Set End Date to day 15
5. Manually change Start Date back to day 8 (if the UI allows — or note it is pre-filled)
6. Click **Assign**

> *Note: If the Start Date is locked to the clicked day, test by using the "Assign to machine" button from order detail (TC-13 scenario) to attempt a POST with overlapping dates.*

**Expected result:**
- Server returns 409
- Inline error message: `Máy đã được xếp lịch trong khoảng thời gian này`
- No duplicate or overlapping assignment is created

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## UI / General

---

## TC-23: Primary buttons have navy fill

**Module:** UI  
**Priority:** Medium  
**Precondition:** App is accessible.

**Steps:**
1. Navigate to `/orders/new` — observe **Save order** button
2. Open AssignModal from `/schedule` — observe **Assign** button
3. Open DetailModal in edit mode — observe **Save** button

**Expected result:**
- All three buttons have a solid navy background (`#002444`)
- Text is white
- No border visible
- Hover state: slightly lighter navy background

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-24: Secondary buttons have outline style

**Module:** UI  
**Priority:** Medium  
**Precondition:** App is accessible.

**Steps:**
1. Navigate to `/orders` — observe **Import Excel** and **Bulk paste** buttons
2. On `/orders/new` — observe **Cancel** button
3. On any order detail page — observe **Edit** button
4. Open any modal — observe **Cancel** button inside modal

**Expected result:**
- All buttons have: transparent background, navy (`#002444`) border, navy text
- Hover state: light grey background
- Height is consistent (`h-9`) across all secondary buttons

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-25: Destructive buttons have red outline

**Module:** UI  
**Priority:** Medium  
**Precondition:** User is on an order detail page and the schedule DetailModal.

**Steps:**
1. On order detail page — observe **Delete** button
2. In the delete confirmation dialog — observe **Confirm Delete** button
3. Open DetailModal on `/schedule` — observe **Remove** button

**Expected result:**
- All destructive buttons have: transparent background, red (`#ba1a1a`) border, red text
- Hover state: light red tint background
- No solid fill on any destructive button

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-26: Side nav icons render correctly (not raw text)

**Module:** UI  
**Priority:** Low  
**Precondition:** App is loaded in any modern browser with internet access (for Google Fonts CDN).

**Steps:**
1. Load any page of the app
2. Observe the left-hand side navigation bar
3. Check each nav item icon (Dashboard, Production, Inventory, Reports, Settings)

**Expected result:**
- Each icon renders as a recognisable Material Symbol glyph (e.g. a house for Dashboard, a factory icon for Production)
- None of the icons display as raw text strings (e.g. "dashboard", "factory")
- Icons appear at approximately 20px size

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

## TC-27: App loads on Vercel production URL

**Module:** UI  
**Priority:** High  
**Precondition:** The latest commit has been deployed to Vercel. Production URL is known.

**Steps:**
1. Open the Vercel production URL in an incognito browser window
2. Verify the page loads without a 500 error or blank screen
3. Navigate to `/orders`
4. Navigate to `/schedule`
5. Navigate to `/orders/new`

**Expected result:**
- All three pages load without errors
- Data from the Neon.tech database is visible on `/orders` (if orders exist)
- No "Internal server error" or Prisma connection errors in the UI
- Build logs on Vercel show `✓ Compiled successfully`

**Status:** [ ] Pass  [ ] Fail  [ ] Skip  
**Notes:** ___

---

*End of test case document — Phase 1*
