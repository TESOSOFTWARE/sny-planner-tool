import { z } from "zod";

export const createAssignmentSchema = z.object({
  machineId: z.string().regex(/^M-0(0[1-9]|[1-3][0-9]|40)$/, "Machine ID must be between M-001 and M-040"),
  orderId: z.string().min(1, "Order ID is required"),
  startDate: z.string().datetime({ message: "Invalid date format. Must be UTC ISO string." }),
  endDate: z.string().datetime({ message: "Invalid date format. Must be UTC ISO string." }),
  // Số mét phân công (optional, dùng khi chia đơn trên nhiều máy)
  allocatedMeters: z.number().positive("Số mét phải lớn hơn 0").optional(),
  // Sản lượng dự kiến (m/ngày) — optional, nhập tay khi assign
  estimatedDailyOutput: z.number().positive("Sản lượng phải lớn hơn 0").optional(),
});

export const updateAssignmentSchema = z.object({
  machineId: z.string().regex(/^M-0(0[1-9]|[1-3][0-9]|40)$/, "Machine ID must be between M-001 and M-040").optional(),
  orderId: z.string().min(1).optional(),
  startDate: z.string().datetime({ message: "Invalid date format. Must be UTC ISO string." }).optional(),
  endDate: z.string().datetime({ message: "Invalid date format. Must be UTC ISO string." }).optional(),
  // Sản lượng dự kiến (m/ngày) — optional, có thể cập nhật sau
  estimatedDailyOutput: z.number().positive("Sản lượng phải lớn hơn 0").optional(),
});
