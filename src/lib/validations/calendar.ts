import { z } from "zod";

const DATE_LABEL = /^\d{4}-\d{2}-\d{2}$/;

/** Nhãn ngày 'YYYY-MM-DD' và phải là ngày có thật (chặn 2026-02-30). */
export const dateLabelSchema = z
  .string()
  .regex(DATE_LABEL, "Ngày phải có dạng YYYY-MM-DD")
  .refine(value => {
    const date = new Date(value + "T00:00:00.000Z");
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Ngày không tồn tại");

/** Khoảng ngày để nạp lịch; `to` không được trước `from`. */
export const calendarRangeSchema = z
  .object({ from: dateLabelSchema, to: dateLabelSchema })
  .refine(r => r.from <= r.to, { message: "Khoảng ngày không hợp lệ: `to` trước `from`" });

/**
 * Đánh dấu một ngày là nghỉ / lễ / làm bù.
 * isWorking suy ra từ kind nên client không gửi được tổ hợp mâu thuẫn
 * (vd kind=HOLIDAY nhưng isWorking=true).
 */
export const upsertCalendarDaySchema = z.object({
  date: dateLabelSchema,
  kind: z.enum(["HOLIDAY", "CLOSURE", "MAKEUP"]),
  note: z.string().max(500).nullable().optional(),
});

/** Xoá ngoại lệ, trả ngày về theo quy tắc tuần/tháng. */
export const deleteCalendarDaySchema = z.object({ date: dateLabelSchema });

/** MAKEUP là ngày làm bù; hai loại còn lại là ngày nghỉ. */
export function isWorkingFromKind(kind: "HOLIDAY" | "CLOSURE" | "MAKEUP"): boolean {
  return kind === "MAKEUP";
}

export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có dạng YYYY-MM, từ 01 đến 12");

export const calendarMonthSchema = z.object({
  yearMonth: yearMonthSchema,
  nonWorkingWeekdays: z.array(z.number().int().min(0).max(6))
    .transform(days => Array.from(new Set(days)).sort((a, b) => a - b))
    .refine(days => days.length <= 6, "Không thể nghỉ cả 7 ngày trong tuần"),
  note: z.string().trim().max(500).nullable().optional(),
});

export const calendarBatchSchema = z.object({
  days: z.array(upsertCalendarDaySchema).max(366, "Tối đa 366 ngày mỗi lần"),
}).refine(body => new Set(body.days.map(day => day.date)).size === body.days.length, {
  message: "Danh sách có ngày trùng nhau",
});
