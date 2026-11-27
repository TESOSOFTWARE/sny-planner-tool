'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

type PlanStage = 'extruder' | 'warping' | 'knitting' | 'rolling' | 'packing' | 'sewing'
type Plan = {
  id: string; stage: PlanStage; planDate: string; machineId: string | null; shift: string | null
  orderRef: string | null; orderId: string | null; color: string | null; metricLabel: string
  plannedValue: string; unit: string; note: string | null
}
type PlanResponse = { success: boolean; error?: string; plans: Plan[] }
type PlanRow = { key: string; orderRef: string | null; orderId: string | null; color: string | null; metricLabel: string; unit: string; byDay: Map<number, Plan[]> }

const normalize = (value: string | null) => value?.trim().toUpperCase().replace(/\s+/g, ' ') ?? ''
const format = (value: number) => value.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

export default function ProductionPlanCalendar({ yearMonth, stage, refreshToken = 0 }: {
  yearMonth: string
  stage: PlanStage
  refreshToken?: number
}) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [year, month] = yearMonth.split('-').map(Number)
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const days = useMemo(() => Array.from({ length: dayCount }, (_, index) => index + 1), [dayCount])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const from = `${yearMonth}-01`
    const to = `${yearMonth}-${String(dayCount).padStart(2, '0')}`
    const query = new URLSearchParams({ stage, from, to })
    setLoading(true); setError('')
    void (async () => {
      try {
        const response = await fetch(`/api/production-plans?${query}`, { signal: controller.signal })
        const data = await response.json() as PlanResponse
        if (!response.ok || !data.success) throw new Error(data.error ?? 'Không tải được kế hoạch theo tháng.')
        if (active) setPlans(data.plans ?? [])
      } catch (problem) {
        if (active && !controller.signal.aborted) setError(problem instanceof Error ? problem.message : 'Không tải được kế hoạch theo tháng.')
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false; controller.abort() }
  }, [stage, yearMonth, dayCount, refreshToken, reload])

  const rows = useMemo(() => {
    const grouped = new Map<string, PlanRow>()
    for (const plan of plans) {
      const orderKey = plan.orderId ? `line:${plan.orderId}` : plan.orderRef ? `pi:${normalize(plan.orderRef)}|color:${normalize(plan.color)}` : `unlinked:${plan.id}`
      const key = `${orderKey}|metric:${normalize(plan.metricLabel)}|unit:${normalize(plan.unit)}`
      const row = grouped.get(key) ?? { key, orderRef: plan.orderRef, orderId: plan.orderId, color: plan.color, metricLabel: plan.metricLabel, unit: plan.unit, byDay: new Map<number, Plan[]>() }
      const day = Number(plan.planDate.slice(8, 10))
      row.byDay.set(day, [...(row.byDay.get(day) ?? []), plan])
      grouped.set(key, row)
    }
    return Array.from(grouped.values()).sort((left, right) => normalize(left.orderRef).localeCompare(normalize(right.orderRef)) || normalize(left.color).localeCompare(normalize(right.color)) || left.metricLabel.localeCompare(right.metricLabel))
  }, [plans])

  return <section aria-labelledby="stage-plan-calendar-title" className="mb-5 rounded-lg border border-outline-variant bg-surface-container-lowest p-3 shadow-sm md:p-4">
    <div className="flex flex-wrap items-end gap-3">
      <div className="mr-auto"><h2 id="stage-plan-calendar-title" className="text-base font-semibold text-primary">Kế hoạch nhập trực tiếp trên web · {yearMonth.split('-').reverse().join('/')}</h2><p className="mt-1 text-xs text-secondary">Kế hoạch Excel được hiển thị riêng ở khung phía trên theo đúng cấu trúc từng công đoạn.</p></div>
      <button type="button" className="rounded border border-outline px-3 py-2 text-sm disabled:opacity-50" disabled={loading} onClick={() => setReload(value => value + 1)}>{loading ? 'Đang tải…' : 'Tải lại kế hoạch'}</button>
    </div>
    {error ? <p role="alert" className="mt-3 text-sm text-error">{error}<button type="button" className="ml-3 underline" onClick={() => setReload(value => value + 1)}>Thử lại</button></p>
      : loading ? <p role="status" className="mt-3 text-sm">Đang tải kế hoạch…</p>
        : !rows.length ? <p role="status" className="mt-3 text-sm text-secondary">Chưa có kế hoạch nhập trực tiếp trên web cho công đoạn này trong tháng.</p>
          : <div data-plan-calendar-scroll className="mt-3 max-h-[48vh] overflow-auto rounded border border-outline-variant"><table className="w-full min-w-max border-separate border-spacing-0 text-xs"><thead className="sticky top-0 z-10 bg-surface-container"><tr>
            <th scope="col" className="sticky left-0 z-20 min-w-40 border-b border-r border-outline-variant bg-surface-container p-2 text-left">PI / dòng hàng</th>
            <th scope="col" className="min-w-28 border-b border-outline-variant p-2 text-left">Màu</th>
            <th scope="col" className="min-w-36 border-b border-outline-variant p-2 text-left">Chỉ tiêu / đơn vị</th>
            <th scope="col" className="min-w-28 border-b border-outline-variant p-2 text-right">Tổng tháng</th>
            {days.map(day => <th key={day} scope="col" className="min-w-36 border-b border-l border-outline-variant p-2 text-center">{day}</th>)}
          </tr></thead><tbody>{rows.map(row => {
            const monthTotal = Array.from(row.byDay.values()).flat().reduce((sum, plan) => sum + Number(plan.plannedValue), 0)
            return <tr key={row.key} className="border-t border-outline-variant align-top">
              <td className="sticky left-0 z-[1] border-r border-outline-variant bg-surface-container-lowest p-2 font-medium">{row.orderId ? <Link href={`/orders/${encodeURIComponent(row.orderId)}`} className="text-primary underline">{row.orderRef ?? 'Dòng hàng'}</Link> : row.orderRef ?? 'Chưa gắn PI'}{row.orderRef && !row.orderId && <span className="block text-[10px] font-normal text-secondary">Chưa gắn dòng hàng</span>}</td>
              <td className="p-2">{row.color ?? '—'}</td><td className="p-2">{row.metricLabel} · {row.unit}</td>
              <td className="p-2 text-right font-semibold tabular-nums">{format(monthTotal)} {row.unit}</td>
              {days.map(day => {
                const entries = row.byDay.get(day) ?? []
                return <td key={day} className={`border-l border-outline-variant p-2 ${entries.length ? 'bg-primary/5' : ''}`}>{entries.map(plan => <span key={plan.id} className="mb-1 block whitespace-nowrap"><strong className="tabular-nums">{format(Number(plan.plannedValue))} {plan.unit}</strong><span className="block text-[10px] text-secondary">{plan.machineId ?? 'Chưa phân máy'}{plan.shift ? ` · ${plan.shift === 'D' ? 'Ngày' : 'Đêm'}` : ''}</span></span>)}</td>
              })}
            </tr>
          })}</tbody></table></div>}
  </section>
}
