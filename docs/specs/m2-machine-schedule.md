# Implementation Plan: M2 — Machine Schedule Functional

## Goal
Replace the mock scheduling grid with a real database-backed scheduling grid for 40 machines (`M-001` to `M-040`) across the days of a selected month. Planners can manually assign orders to machine slots (1 machine × 1 day), check overlaps to prevent double-booking, and remove assignments. All dates are normalized to start-of-day Vietnam time (UTC+7) before database persistence.

---

## File Tree

### New files
```
docs/specs/m2-machine-schedule.md             This specification
src/app/api/assignments/route.ts              GET (month assignments) & POST (create assignment)
src/app/api/assignments/[id]/route.ts         DELETE (remove assignment)
src/components/schedule/AssignModal.tsx       Modal to create new assignments
src/components/schedule/DetailModal.tsx       Modal to view/remove assignments
```

### Modified files
```
prisma/schema.prisma                          Add MachineAssignment model + relation to ProductionOrder
src/app/schedule/page.tsx                     Replace mock grid with functional client-side logic
```

### Protected files NOT touched
- `CLAUDE.md`
- `.env`
- `.env.local`
- All `src/app/api/orders/*` routes

---

## Dependencies

| Package | Reason | Already installed? | npm URL |
|---------|--------|--------------------|---------|
| `date-fns` | Date calculations (startOfDay, format) | ❌ No (Not in package.json) | https://www.npmjs.com/package/date-fns |

> **Timezone Implementation Note**:
> `date-fns-tz` is not installed. We will use the direct UTC offset approach (`+7 hours`) to translate between database UTC datetimes and Vietnam local dates for the calendar layout:
> ```typescript
> function toVNDate(utcDate: Date): Date {
>   return new Date(utcDate.getTime() + 7 * 60 * 60 * 1000)
> }
> ```

---

## Steps

1. **Update `prisma/schema.prisma`** — Add the `MachineAssignment` model with a unique constraint on `[machineId, startDate]`, and add the relation list to `ProductionOrder`.
2. **Execute Prisma Migration** — Run `npx prisma db push` to synchronize PostgreSQL and rebuild the client via `npx prisma generate`.
3. **Verify/Install `date-fns`** — Confirm if we should add `"date-fns": "^3.6.0"` to `package.json` to handle date arithmetic or if we should implement utility functions using pure JS `Date` objects.
4. **Create GET & POST route (`src/app/api/assignments/route.ts`)**
   - **GET**: Fetch all assignments where the start/end dates fall within the selected month.
   - **POST**: Validate body, normalize dates to Vietnam start-of-day (`T00:00:00+07:00`), perform an overlap check, insert records, and handle errors (e.g. 409 Conflict).
5. **Create DELETE route (`src/app/api/assignments/[id]/route.ts`)** — Delete assignment by ID.
6. **Create AssignModal (`src/components/schedule/AssignModal.tsx`)** — Order dropdown selector, start date indicator (Vietnam format DD/MM/YYYY), date picker for the end date, and POST submission.
7. **Create DetailModal (`src/components/schedule/DetailModal.tsx`)** — Display order number, customer, dates, and trigger deletion.
8. **Update Schedule Page (`src/app/schedule/page.tsx`)** — Dynamic state grid rendering assignments, modal hooks, and weekend highlights.
9. **Verification** — Verify via `npx tsc --noEmit` and `npm run build`.

---

## Risks

1. **Overlap Checks & Concurrency**
   * *Risk*: Two planners attempt to schedule the same machine simultaneously.
   * *Mitigation*: The DB unique constraint `@@unique([machineId, startDate])` acts as a fail-safe, while the API queries for overlap in a single transaction before inserts.

2. **Timezone Offset Rollover**
   * *Risk*: A date boundary shift (e.g. `2026-06-01` 00:00 Vietnam time represents `2026-05-31` 17:00 UTC) causes rendering cells to slide into the wrong month.
   * *Mitigation*: We normalize dates at the API level (suffixing `+07:00` offset) and translate back using absolute offset math (`+ 7 hours`) for comparison.

---

## Manual Verification Checklist

1. `/schedule` loads 40 rows (`M-001` to `M-040`) and columns corresponding to the current month.
2. Clicking an empty slot opens the `AssignModal` with pre-filled machine ID and start date.
3. Dropdown shows list of selectable orders (PI + Customer).
4. Creating an assignment renders the PI Number badge in the corresponding cells.
5. Clicking an assigned slot loads `DetailModal`.
6. Clicking "Remove assignment" frees up the slots immediately.
7. Overlap error prevents booking a machine if a conflict exists.
8. Navigation to previous/next months re-fetches assignments.
9. Prisma schema updates cleanly.
10. `api/orders/*` endpoints remain untouched.
