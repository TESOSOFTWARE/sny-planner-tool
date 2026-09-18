# Implementation Plan: Order Status Badge + Filter

## Goal
Thêm tự động tính toán trạng thái đơn hàng (PENDING, SCHEDULED, RUNNING, DONE) dựa trên thời gian xếp máy, và thêm bộ lọc danh sách trên Order List.

## Logic tính status (pseudocode đầy đủ)
```typescript
import { MachineAssignment } from '@prisma/client'

export type OrderStatus = 'PENDING' | 'SCHEDULED' | 'RUNNING' | 'DONE'

export function calcOrderStatus(
  assignments: Pick<MachineAssignment, 'startDate' | 'endDate'>[]
): OrderStatus {
  if (!assignments || assignments.length === 0) return 'PENDING'

  // today = ngày hiện tại theo UTC+7
  const now = new Date()
  const todayUTC7 = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  todayUTC7.setUTCHours(0, 0, 0, 0)

  const statuses = assignments.map(a => {
    const start = new Date(a.startDate)
    const end = new Date(a.endDate)
    if (end < todayUTC7) return 'DONE'
    if (start <= todayUTC7 && todayUTC7 <= end) return 'RUNNING'
    if (start > todayUTC7) return 'SCHEDULED'
    return 'PENDING'
  })

  if (statuses.includes('RUNNING')) return 'RUNNING'
  if (statuses.includes('SCHEDULED')) return 'SCHEDULED'
  if (statuses.every(s => s === 'DONE')) return 'DONE'
  return 'PENDING'
}

export const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Chưa lên lịch', color: '#6B7280', bg: '#F3F4F6' },
  SCHEDULED: { label: 'Đã lên lịch',   color: '#2563EB', bg: '#EFF6FF' },
  RUNNING:   { label: 'Đang sản xuất', color: '#16A34A', bg: '#F0FDF4' },
  DONE:      { label: 'Hoàn thành',    color: '#002444', bg: '#EBF0F7' },
}
```

## Files to create/modify
1. `src/lib/orderStatus.ts` (NEW): Chứa logic `calcOrderStatus` và `STATUS_CONFIG`.
2. `src/components/orders/OrderStatusBadge.tsx` (NEW): Render UI badge dựa trên `STATUS_CONFIG`.
3. `src/types/index.ts` (MODIFIED): Thêm trường `assignments?: { startDate: string; endDate: string }[]` vào `SerializedProductionOrder`.
4. `src/app/orders/page.tsx` (MODIFIED): Thêm query include `assignments` và gửi status hoặc assignments xuống client.
5. `src/components/orders/OrderTable.tsx` (MODIFIED): Hiển thị filter tabs và OrderStatusBadge. Xử lý filter ở client.
6. `src/app/orders/summary/page.tsx` (MODIFIED): Include `assignments` vào query.
7. `src/components/orders/POSummaryTable.tsx` (MODIFIED): Tính PI group status và hiển thị OrderStatusBadge ở dòng header.
8. `src/app/orders/[id]/page.tsx` (MODIFIED): Include `assignments`.
9. `src/components/orders/OrderDetail.tsx` (MODIFIED): Thêm badge dưới PI Number.

## Steps (max 8)
1. Tạo `src/lib/orderStatus.ts`.
2. Tạo `src/components/orders/OrderStatusBadge.tsx`.
3. Cập nhật type `SerializedProductionOrder` trong `src/types/index.ts`.
4. Sửa DB queries ở 3 page (Orders List, PO Summary, Order Detail) để lấy thêm thông tin `assignments`.
5. Cập nhật `OrderTable.tsx` thêm logic lọc UI & render badge.
6. Cập nhật `POSummaryTable.tsx` tính status gộp & render badge.
7. Cập nhật `OrderDetail.tsx` render badge.

## Risks
- API `GET /api/orders/[id]` (vốn đang được PROTECTED không cho phép sửa) không include `assignments`. Do đó nếu `OrderDetail` gọi lại API để refetch, data `assignments` sẽ bị rớt.
- `startDate` & `endDate` dạng Date của Prisma cần format thành string khi serialize.

## Manual tests
- Orders chưa có trong bảng MachineAssignment -> PENDING.
- Đã test 3 trạng thái filter hoạt động chính xác ở `/orders`.
- `tsc --noEmit` thành công.

## Out of Scope
- Thay đổi CSDL (không thêm cột status vào database).
- Tạo API endpoints riêng để quản lý status.
