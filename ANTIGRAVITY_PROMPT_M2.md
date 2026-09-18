# Antigravity Prompt — SNY Planner Tool, M2 Functional Machine Schedule

## ROLE
You are a careful Senior Full-Stack Engineer working on a production handover project.
Priority order: correctness > simplicity > speed.
You plan before you code. You stop when uncertain. You never guess.

## CONTEXT
Read `CLAUDE.md` at the project root before doing anything else.
If CLAUDE.md and this prompt conflict → CLAUDE.md wins.

Project summary:
- Web app replacing Excel for SNY factory (Vietnam)
- Stack: Next.js 14 App Router + TypeScript + Tailwind + Prisma 5.22.0 + PostgreSQL (Neon.tech)
- Phase 1 complete (S0–S5 + R1 UI redesign + Bulk paste)
- M2 goal: replace mock Schedule page with real machine scheduling

## BUSINESS RULES (confirmed by SNY)
1. 40 machines: M-001 to M-040 (fixed, no DB table needed)
2. Each machine slot = 1 machine × 1 day
3. Each slot can have at most 1 order assigned
4. Assignment stores: orderId + machineId + startDate + endDate
5. 1 order runs on exactly 1 machine at a time
6. Planner manually assigns orders to machines — no auto-scheduling

## DATABASE SCHEMA CHANGES
Add new model to prisma/schema.prisma:

model MachineAssignment {
  id          String   @id @default(cuid())
  machineId   String
  orderId     String
  startDate   DateTime
  endDate     DateTime
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  order       ProductionOrder @relation(fields: [orderId], references: [id], onDelete: Cascade)
  @@unique([machineId, startDate])
}

Also add relation to ProductionOrder model:
  assignments MachineAssignment[]

## SPRINT M2 GOAL
1. Grid: 40 machines x days of selected month
2. Each cell shows assigned order (PI Number) if exists
3. Click empty cell → modal to assign an order
4. Click assigned cell → modal to view/remove assignment
5. Month navigation (prev/next)
6. Remove MOCK banner — this is now real data

## MANDATORY WORKFLOW

### Phase A — PLAN FIRST
Generate docs/specs/m2-machine-schedule.md
STOP after plan. Wait for Tung approval.

### Phase B — BUILD

Task 1: Schema migration
- Add MachineAssignment model to prisma/schema.prisma
- Add assignments relation to ProductionOrder
- Run npx prisma db push + npx prisma generate

Task 2: API routes
Create src/app/api/assignments/route.ts:
- GET: fetch assignments for given month (query: year, month)
- POST: create assignment (body: machineId, orderId, startDate, endDate)
- Validate slot not already taken

Create src/app/api/assignments/[id]/route.ts:
- DELETE: remove assignment by id

Task 3: Schedule page functional
Update src/app/schedule/page.tsx:
- "use client" component
- Fetch assignments when month changes
- Remove MOCK banner
- Grid: 40 rows (M-001 to M-040) x days in month
- Empty cell: click → AssignModal
- Assigned cell: show PI Number badge, click → DetailModal
- Weekend columns: slightly different background

Task 4: AssignModal
Create src/components/schedule/AssignModal.tsx:
- Props: machineId, date, orders, onAssigned, onClose
- Dropdown: select order from list
- Start date: pre-filled with clicked date
- End date: date picker (required)
- POST to /api/assignments on submit

Task 5: DetailModal
Create src/components/schedule/DetailModal.tsx:
- Props: assignment, onRemoved, onClose
- Show: PI Number, Customer, Machine, Start/End date
- DELETE to /api/assignments/[id] on remove

### Phase C — VERIFY
1. tsc --noEmit → 0 errors
2. npx prisma db push → schema synced
3. npm run dev → no errors
4. /schedule → grid 40 machines x days, no MOCK banner
5. Click empty cell → AssignModal opens
6. Assign order → cell shows PI Number
7. Click assigned cell → DetailModal
8. Remove → cell empty again
9. Month nav works
10. CLAUDE.md NOT modified
11. All /api/orders/* routes untouched

DO NOT COMMIT. Tung commits.

## STOP CONDITIONS
- Need new npm package
- Any /api/orders/* file needs to change
- Step fails twice

## OUT OF SCOPE
- Auto-scheduling / AI suggest
- Capacity calculation
- Multiple orders per slot
- Gantt chart
- Auth / roles
- Drag-drop rescheduling
