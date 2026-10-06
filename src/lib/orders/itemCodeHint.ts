/**
 * Cảnh báo không chặn (non-blocking) cho trường Item Code của một dòng đơn hàng.
 * @param lines Danh sách chuỗi itemCode của tất cả các dòng trong cùng PI
 * @param index Vị trí (0-based) của dòng hiện tại
 * @param extraWarning Cảnh báo phụ (ví dụ xung đột màu giữa mã hàng và form)
 * @returns Danh sách câu cảnh báo (rỗng nếu không có cảnh báo)
 */
export function itemCodeWarnings(lines: string[], index: number, extraWarning?: string): string[] {
  const code = lines[index]?.trim() ?? ''
  if (!code) return []

  const out: string[] = []

  // Cảnh báo phụ nếu có (ví dụ xung đột màu)
  if (extraWarning) {
    out.push(extraWarning)
  }

  // Trùng mã với dòng khác trong cùng PI (so sánh chính xác theo chuỗi phân biệt hoa thường)
  const dup = lines.findIndex((c, i) => i !== index && (c ?? '').trim() === code)
  if (dup >= 0) {
    out.push(`Trùng mã với Dòng #${dup + 1} — xác nhận nếu cố ý.`)
  }

  return out
}
