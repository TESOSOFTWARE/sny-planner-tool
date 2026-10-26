'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { AssignmentDetail } from './DetailModal'
import { lineLabel } from '@/lib/schedule/piDisplay'
import { useScheduleModalFocus } from './useModalFocus'
import { useAssignmentDates } from './useAssignmentDates'
import { calcOrderStatus } from '@/lib/orderStatus'
import { scheduleDay } from '@/lib/schedule/importSafety'
import { factoryDateToISO } from '@/lib/schedule/assignmentDates'
import { calculateProductionDays, countWorkingDays, type FactoryCalendar } from '@/lib/schedule/productionDuration'
import { weekdayLabel } from '@/lib/schedule/dateMode'
import { estimateWovenBeforeStop, validSplitPlanningValue } from '@/lib/schedule/estimatedWoven'
import { resolveAssignmentDates, type AssignmentDatePlan } from '@/lib/schedule/assignmentDates'
import { calculateOrderWeight, type OrderWeightInput } from '@/lib/calculations/orderWeight'
import { planGroupSplit } from '@/lib/schedule/groupSplit'
import { sameSpecGroup } from '@/lib/schedule/specGroup'

const machines = Array.from({length:40},(_,i)=>`M-${String(i+1).padStart(3,'0')}`)
const displayDate = (day:string) => day.split('-').reverse().join('/')

export default function TransferAssignmentModal({assignment,groupMembers,onClose,onSuccess}:{assignment:AssignmentDetail;groupMembers?:AssignmentDetail[];onClose:()=>void;onSuccess:()=>void}) {
  const running = calcOrderStatus([assignment]) === 'RUNNING'
  const members = useMemo(() => groupMembers && groupMembers.length > 1 ? groupMembers : [assignment], [groupMembers, assignment])
  const grouped = running && members.length > 1
  const groupError = useMemo(() => {
    if (!grouped) return ''
    if (!members.some(row => row.id === assignment.id) ||
      new Set(members.map(row => row.id)).size !== members.length ||
      new Set(members.map(row => row.order.id)).size !== members.length)
      return 'Nhóm có dòng trùng hoặc đã thay đổi; đóng hộp và tải lại lịch.'
    for (const row of members) {
      if (row.machineId !== assignment.machineId || !sameSpecGroup(row.order, assignment.order) ||
        scheduleDay(row.startDate) !== scheduleDay(assignment.startDate) || scheduleDay(row.endDate) !== scheduleDay(assignment.endDate))
        return 'Thành viên không còn cùng nhóm; đóng hộp và tải lại lịch.'
      if (!validSplitPlanningValue(Number(row.allocatedMeters)) ||
        !validSplitPlanningValue(Number(row.estimatedDailyOutput)) ||
        Number(row.estimatedDailyOutput) !== Number(assignment.estimatedDailyOutput))
        return `Dòng ${lineLabel(row.order)} của nhóm chưa có số mét / năng suất hợp lệ hoặc khác năng suất nhóm; sửa dòng đó trong Chi tiết trước.`
    }
    return ''
  }, [grouped, members, assignment])
  const [mode,setMode] = useState<'TRANSFER'|'SWAP'>('TRANSFER')
  const [machine,setMachine] = useState(machines.find(m=>m!==assignment.machineId)??'')
  const [start,setStart] = useState(scheduleDay(assignment.startDate))
  // Ngày người dùng nhập; khi khác `start` nghĩa là đã tự dời khỏi ngày nghỉ (0810-24).
  const [requestedStart,setRequestedStart] = useState(scheduleDay(assignment.startDate))
  const [end,setEnd] = useState(scheduleDay(assignment.endDate))
  const [meters,setMeters] = useState(assignment.allocatedMeters??'')
  const [output,setOutput] = useState(assignment.estimatedDailyOutput??'')
  const [targetOutputInput,setTargetOutputInput] = useState('')
  const [targetOutputEdited,setTargetOutputEdited] = useState(false)
  const sourceMeters = assignment.allocatedMeters ?? meters
  const sourceOutput = assignment.estimatedDailyOutput ?? output
  // Máy hư + phân công đã lưu đủ số mét và năng suất: hiện dạng chữ, không hiện ô nhập (0810-25 H2).
  const sourceSaved = running && (grouped || (assignment.allocatedMeters != null && assignment.estimatedDailyOutput != null))
  const targetOutput = targetOutputEdited ? targetOutputInput : sourceOutput
  const [choices,setChoices] = useState<AssignmentDetail[]>([])
  const [targetId,setTargetId] = useState('')
  const [choiceError,setChoiceError] = useState('')
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [calendar,setCalendar] = useState<FactoryCalendar|null>(null)
  const [calendarError,setCalendarError] = useState('')
  const [stop,setStop] = useState(scheduleDay(new Date()))
  const [targetStart,setTargetStart] = useState(scheduleDay(new Date()))
  const [lineAssignmentCount,setLineAssignmentCount] = useState<number|null>(null)
  const [metersHint,setMetersHint] = useState<number|null>(null)
  const splitKey = JSON.stringify([stop,targetStart,sourceMeters,sourceOutput,targetOutput,grouped?members:null])
  const [splitResult,setSplitResult] = useState<{key:string;estimate:NonNullable<ReturnType<typeof estimateWovenBeforeStop>>;group:NonNullable<ReturnType<typeof planGroupSplit>>|null;plan:AssignmentDatePlan;calendar:FactoryCalendar}|null>(null)
  const [splitError,setSplitError] = useState('')
  const modalRef = useRef<HTMLDivElement>(null)
  useScheduleModalFocus(true,onClose,modalRef)
  const dates = useAssignmentDates({enabled:!running&&mode==='TRANSFER',startDate:start,endDate:end,allocatedMeters:meters,estimatedDailyOutput:output,setEndDate:setEnd,originalStartDate:scheduleDay(assignment.startDate),autoOnFormulaChange:true})
  // Tự áp ngày đã dời (CN → T2) vào ô Bắt đầu khi đang tự tính.
  useEffect(()=>{if(running||mode!=='TRANSFER'||dates.mode!=='COMPUTED'||!dates.plan)return;if(dates.plan.startDate!==start)setStart(dates.plan.startDate)},[running,mode,dates.mode,dates.plan,start])
  const target = choices.find(a=>a.id===targetId)
  const split = splitResult?.key===splitKey?splitResult:null
  const afterStart = running?split?.plan.startDate??targetStart:mode==='SWAP'?scheduleDay(assignment.startDate):dates.plan?.startDate??start
  const afterEnd = running?split?.plan.endDate??'':mode==='SWAP'?scheduleDay(assignment.endDate):dates.plan?.endDate??end
  const afterMachine = mode==='SWAP'?target?.machineId??'—':machine
  const preservedDateWarning = dates.mode === 'PRESERVED' && dates.plan && !dates.plan.estimate && dates.plan.startDate === start
    && (dates.plan.suggestedStartDate !== start || dates.plan.warnings.length > 0)
    ? `Giữ ngày đã lưu; ${displayDate(dates.plan.suggestedStartDate !== start ? start : dates.plan.endDate)} là ngày nghỉ.` : undefined

  useEffect(()=>{let active=true;void(async()=>{try{const res=await fetch('/api/assignments');const data:AssignmentDetail[]=await res.json();if(!res.ok||!Array.isArray(data))throw new Error('Không tải được phân công để đảo máy.');if(active){setLineAssignmentCount(data.filter(a=>a.order.id===assignment.order.id).length);setChoices(data.filter(a=>a.id!==assignment.id&&a.machineId!==assignment.machineId&&calcOrderStatus([a])==='SCHEDULED'))}}catch(e){if(active)setChoiceError(e instanceof Error?e.message:'Không tải được phân công.')}})();return()=>{active=false}},[assignment.id,assignment.machineId,assignment.order.id])
  useEffect(()=>{if(!running||grouped||lineAssignmentCount!==1||assignment.allocatedMeters)return;let active=true;void(async()=>{try{const res=await fetch(`/api/orders/pi/${encodeURIComponent(assignment.order.piNumber)}`);const data=await res.json();if(!res.ok||!data.success)return;const line=data.orders.find((o:{id:string})=>o.id===assignment.order.id);if(!line)return;const input:OrderWeightInput={orderType:line.orderType,qty:line.qty,widthM:line.widthM,lengthM:line.lengthM,gsm:line.gsm,rollLength:line.rollLength==null?null:Number(line.rollLength),pieceLength:line.pieceLength==null?null:Number(line.pieceLength)};const hint=calculateOrderWeight(input).totalMeters;if(active&&hint&&validSplitPlanningValue(hint))setMetersHint(hint)}catch{/* Gợi ý không thay cho số mét người dùng nhập. */}})();return()=>{active=false}},[running,grouped,lineAssignmentCount,assignment.allocatedMeters,assignment.order.id,assignment.order.piNumber])
  useEffect(()=>{
    if(!running)return
    let active=true;setSplitResult(null);setSplitError('')
    if(groupError){setSplitError(groupError);return}
    if(!validSplitPlanningValue(Number(sourceMeters))||!validSplitPlanningValue(Number(sourceOutput))||!validSplitPlanningValue(Number(targetOutput))){setSplitError('Nhập số mét phân công, năng suất máy cũ và máy đích lớn hơn 0, tối đa 2 chữ số thập phân.');return}
    if(stop<scheduleDay(assignment.startDate)||stop>scheduleDay(assignment.endDate)){setSplitError('Ngày máy dừng phải nằm trong lịch phân công hiện tại.');return}
    if(!targetStart||targetStart<stop){setSplitError('Ngày bắt đầu trên máy đích không được trước ngày máy dừng.');return}
    const load=async(from:string,to:string)=>{const res=await fetch(`/api/calendar?from=${from}&to=${to}`);const data=await res.json();if(!res.ok||!data.success)throw new Error('Không tải được lịch nghỉ để xem trước.');return data.calendar as FactoryCalendar}
    void(async()=>{try{
      const originalCalendar=await load(scheduleDay(assignment.startDate),stop)
      const group=grouped?planGroupSplit({calendar:originalCalendar,members:members.map(row=>({id:row.id,allocatedMeters:Number(row.allocatedMeters)})),dailyOutput:Number(sourceOutput),start:scheduleDay(assignment.startDate),stopDate:stop}):null
      const estimate=grouped?group:estimateWovenBeforeStop(originalCalendar,scheduleDay(assignment.startDate),stop,Number(sourceMeters),Number(sourceOutput))
      if(!estimate)throw new Error('Không tính được phần đã dệt theo lịch.')
      if(estimate.remainingMeters<=0)throw new Error('Không còn mét để chuyển.')
      const plan=await resolveAssignmentDates({startDate:targetStart,allocatedMeters:estimate.remainingMeters,estimatedDailyOutput:targetOutput,computeEnd:true,adjustStart:true},load)
      const finalCalendar=await load(scheduleDay(assignment.startDate),[scheduleDay(assignment.endDate),plan.endDate].sort().at(-1)!)
      if(active)setSplitResult({key:splitKey,estimate,group,plan,calendar:finalCalendar})
    }catch(e){if(active)setSplitError(e instanceof Error?e.message:'Không tính được lịch chuyển máy.')}})()
    return()=>{active=false}
  },[running,grouped,members,groupError,splitKey,stop,targetStart,sourceMeters,sourceOutput,targetOutput,assignment.startDate,assignment.endDate])
  useEffect(()=>{let active=true;setCalendar(null);setCalendarError('');const from=[scheduleDay(assignment.startDate),afterStart,target?scheduleDay(target.startDate):afterStart].sort()[0];const to=[scheduleDay(assignment.endDate),afterEnd,target?scheduleDay(target.endDate):afterEnd].sort().at(-1);void(async()=>{try{const res=await fetch(`/api/calendar?from=${from}&to=${to}`);const data=await res.json();if(!res.ok||!data.success)throw new Error('Không tải được lịch nghỉ để xem trước.');if(active)setCalendar(data.calendar)}catch(e){if(active)setCalendarError(e instanceof Error?e.message:'Không tải được lịch nghỉ.')}})();return()=>{active=false}},[assignment.startDate,assignment.endDate,afterStart,afterEnd,target])
  const previewCalendar = running?split?.calendar??null:calendar
  const days = (from:string,to:string) => previewCalendar?countWorkingDays(previewCalendar,from,to):null
  const oldEnd = scheduleDay(assignment.endDate)
  const delta = !previewCalendar?null:afterEnd===oldEnd?0:afterEnd>oldEnd?(days(oldEnd,afterEnd)??0)-(days(oldEnd,oldEnd)??0):-((days(afterEnd,oldEnd)??0)-(days(afterEnd,afterEnd)??0))
  const formulaDays = calculateProductionDays(meters, output)
  const transferFormulaLine = formulaDays === null
    ? 'Nhập số mét và năng suất để tự tính ngày kết thúc.'
    : `${Number(meters).toLocaleString('vi-VN')} m ÷ ${Number(output).toLocaleString('vi-VN')} m/ngày = ${(dates.plan?.estimate?.requiredWorkingDays ?? formulaDays).toLocaleString('vi-VN')} ngày làm việc (làm tròn lên, đã bỏ ngày nghỉ)`
  const confirm = async () => {
    if(busy||(running&&(!split||!!splitError||!!groupError)))return
    setError('');setBusy(true)
    try {
      const res = running?await fetch('/api/assignments/split',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:assignment.id,stopDate:stop,targetMachineId:machine,targetStartDate:targetStart,...(assignment.allocatedMeters==null?{sourceAllocatedMeters:Number(sourceMeters)}:{}),...(assignment.estimatedDailyOutput==null?{sourceDailyOutput:Number(sourceOutput)}:{}),targetDailyOutput:Number(targetOutput)})}):mode==='SWAP'?await fetch('/api/assignments/swap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({aId:assignment.id,bId:targetId})}):await fetch(`/api/assignments/${assignment.id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({machineId:machine,startDate:factoryDateToISO(afterStart),endDate:factoryDateToISO(afterEnd),endDateSource:dates.endDateSource,allocatedMeters:meters===''?null:Number(meters),estimatedDailyOutput:output===''?null:Number(output)})})
      const data = await res.json()
      if(!res.ok)throw new Error(data.message??'Không thể chuyển máy.')
      if (running && data.group) toast.success(`Đã chuyển nhóm ${data.group.size} dòng: còn ${Number(data.group.remainingMeters).toLocaleString('vi-VN')} m sang ${machine}.`)
      onSuccess();onClose()
    } catch(e) {setError(e instanceof Error?e.message:'Không thể chuyển máy.')} finally {setBusy(false)}
  }
  const inputClass='w-full rounded border border-outline-variant bg-white px-3 py-2 text-sm'
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><div ref={modalRef} role="dialog" aria-modal="true" aria-label="Chuyển máy" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface p-4 space-y-3">
    <h3 className="font-semibold">Chuyển máy — {assignment.order.piNumber} · Dòng {lineLabel(assignment.order)}</h3>
    {running?<p>Máy hư: phần đã dệt ở lại máy cũ, phần còn lại chuyển sang máy đích. Số đã dệt là ước tính theo lịch.{grouped?' Chuyển cả nhóm cùng lúc.':''}</p>:<div className="flex gap-4"><label><input type="radio" name="transfer-mode" checked={mode==='TRANSFER'} disabled={busy} onChange={()=>setMode('TRANSFER')}/> Chuyển sang máy khác</label><label><input type="radio" name="transfer-mode" checked={mode==='SWAP'} disabled={busy} onChange={()=>setMode('SWAP')}/> Đảo với phân công khác</label></div>}
    {running&&<label className="block text-sm">Ngày máy dừng<input aria-label="Ngày máy dừng" className={inputClass} type="date" value={stop} min={scheduleDay(assignment.startDate)} max={scheduleDay(assignment.endDate)} disabled={busy} onChange={e=>setStop(e.target.value)}/></label>}
    {running&&metersHint!==null&&<p className="text-sm">Gợi ý tổng mét của dòng (chỉ một phân công): {metersHint.toLocaleString('vi-VN')} m. <button type="button" disabled={busy} onClick={()=>setMeters(String(metersHint))} className="text-primary underline">Dùng số mét gợi ý</button></p>}
    {mode==='TRANSFER'&&<div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 text-sm">Máy đích<select aria-label="Máy đích" className={inputClass} value={machine} disabled={busy} onChange={e=>setMachine(e.target.value)}>{machines.filter(m=>m!==assignment.machineId).map(m=><option key={m}>{m}</option>)}</select></label>
      <label className="text-sm">Bắt đầu<input aria-label="Bắt đầu" className={inputClass} type="date" value={running?targetStart:start} disabled={busy} onChange={e=>{if(running)setTargetStart(e.target.value);else{setStart(e.target.value);setRequestedStart(e.target.value)}}}/>{!running&&requestedStart!==start&&<span className="block text-xs text-secondary">{weekdayLabel(requestedStart)} {displayDate(requestedStart)} nghỉ → dời {displayDate(start)}</span>}</label>
      {!running&&<label className="text-sm">Kết thúc<input aria-label="Kết thúc" className={inputClass} type="date" value={end} disabled={busy} onChange={e=>dates.setManualEndDate(e.target.value)}/>{mode==='TRANSFER'&&<span className="block text-xs text-secondary">{dates.mode==='MANUAL'?<>Sửa tay · <button type="button" disabled={busy} onClick={dates.useComputedDates} className="text-primary underline">Dùng ngày hệ thống tính</button></>:dates.mode==='PRESERVED'?'Giữ ngày đã lưu':'Tự tính'}</span>}</label>}
      {!sourceSaved&&<><label className="text-sm">Số mét phân công<input aria-label="Số mét phân công" className={inputClass} type="number" min="0.01" step="0.01" value={running?sourceMeters:meters} disabled={busy} onChange={e=>setMeters(e.target.value)}/></label>
      <label className="text-sm">{running?'Năng suất máy cũ (m/ngày)':'Năng suất (m/ngày)'}<input aria-label={running?'Năng suất máy cũ (m/ngày)':'Năng suất (m/ngày)'} className={inputClass} type="number" min="0.01" step="0.01" value={running?sourceOutput:output} disabled={busy} onChange={e=>setOutput(e.target.value)}/></label></>}
      {sourceSaved&&!grouped&&<p className="col-span-2 text-sm">Phân công gốc: <span className="font-mono">{Number(sourceMeters).toLocaleString('vi-VN')} m · {Number(sourceOutput).toLocaleString('vi-VN')} m/ngày</span> · {assignment.machineId} {displayDate(scheduleDay(assignment.startDate))} → {displayDate(scheduleDay(assignment.endDate))}</p>}
      {grouped&&<p className="col-span-2 text-sm">Nhóm {members.length} dòng trên {assignment.machineId} · năng suất cả máy {Number(sourceOutput).toLocaleString('vi-VN')} m/ngày.</p>}
      {running&&<label className="col-span-2 text-sm">Năng suất máy đích (m/ngày){grouped&&<span className="block text-xs text-secondary">Áp dụng một lần cho cả nhóm.</span>}<input aria-label="Năng suất máy đích (m/ngày)" className={inputClass} type="number" min="0.01" step="0.01" value={targetOutput} disabled={busy} onChange={e=>{setTargetOutputEdited(true);setTargetOutputInput(e.target.value)}}/></label>}
    </div>}
    {!running&&mode==='SWAP'&&<label className="block text-sm">Phân công để đảo<select aria-label="Phân công để đảo" className={inputClass} value={targetId} disabled={busy} onChange={e=>setTargetId(e.target.value)}><option value="">Chọn phân công chưa bắt đầu…</option>{choices.map(a=><option key={a.id} value={a.id}>{a.machineId} · {a.order.piNumber} · {displayDate(scheduleDay(a.startDate))} → {displayDate(scheduleDay(a.endDate))}</option>)}</select>{choiceError&&<span role="alert" className="text-error">{choiceError}</span>}</label>}
    {running&&<section aria-label="Ước tính theo lịch" className="rounded border border-outline-variant p-3 text-sm space-y-1">
      <h4 className="font-medium">Xem trước — chưa lưu</h4>
      {split?.group&&<>
        <p>Nhóm {members.length} dòng · tổng {split.group.groupTotal.toLocaleString('vi-VN')} m · ước đã dệt {split.group.estimatedWovenMeters.toLocaleString('vi-VN')} m · còn {split.group.remainingMeters.toLocaleString('vi-VN')} m</p>
        <div className="overflow-x-auto"><table className="w-full text-xs tabular-nums">
          <thead><tr><th className="text-left">Dòng</th><th className="text-right">Mét</th><th className="text-right">Ước đã dệt</th><th className="text-right">Còn lại</th></tr></thead>
          <tbody>{split.group.perMember.map(row=>{
            const member=members.find(item=>item.id===row.id)!
            return <tr key={row.id}><td className="py-1">{member.order.piNumber} · Dòng {lineLabel(member.order)}</td><td className="text-right">{Number(member.allocatedMeters).toLocaleString('vi-VN')}</td><td className="text-right">{row.woven.toLocaleString('vi-VN')}</td><td className="text-right">{row.remaining.toLocaleString('vi-VN')}</td></tr>
          })}</tbody>
        </table></div>
      </>}
      {splitError?<p role="alert" className="text-error">{splitError}</p>:!split?<p role="status">Đang tính phần còn lại theo lịch nghỉ…</p>:<>
        {split.estimate.estimatedWovenMeters===0?<p>Giữ trên {assignment.machineId}: không còn phần đã dệt — chuyển {grouped?'cả nhóm':'cả phân công'}.</p>:<p>Giữ trên {assignment.machineId}: {displayDate(scheduleDay(assignment.startDate))} → {displayDate(split.estimate.lastWorkingDate!)} · đã dệt ~{split.estimate.estimatedWovenMeters.toLocaleString('vi-VN')} m (ước tính)</p>}
        <p>Chuyển {machine}: {displayDate(afterStart)} → {displayDate(afterEnd)} · {split.estimate.remainingMeters.toLocaleString('vi-VN')} m ÷ {Number(targetOutput).toLocaleString('vi-VN')} m/ngày → {split.plan.estimate?.requiredWorkingDays} ngày làm việc</p>
        <p>Hoàn thành: {displayDate(oldEnd)} → {displayDate(afterEnd)} ({delta===null?'—':delta>0?`trễ ${delta}`:delta<0?`sớm ${-delta}`:'không lệch'} ngày làm việc)</p>
      </>}
    </section>}
    {!running&&mode==='SWAP'&&<><h4 className="font-medium">Xem trước — chưa lưu</h4><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="text-left">Trước</th><th className="text-left">Sau</th></tr></thead><tbody><tr><td>{assignment.machineId} · {displayDate(scheduleDay(assignment.startDate))} → {displayDate(oldEnd)} · {days(scheduleDay(assignment.startDate),oldEnd)??'—'} ngày làm việc</td><td>{afterMachine} · {displayDate(afterStart)} → {displayDate(afterEnd)} · {days(afterStart,afterEnd)??'—'} ngày làm việc</td></tr>{mode==='SWAP'&&target&&<tr><td>{target.machineId} · {target.order.piNumber} · {displayDate(scheduleDay(target.startDate))} → {displayDate(scheduleDay(target.endDate))}</td><td>{assignment.machineId} · {target.order.piNumber} · {displayDate(scheduleDay(target.startDate))} → {displayDate(scheduleDay(target.endDate))} · {days(scheduleDay(target.startDate),scheduleDay(target.endDate))??'—'} ngày làm việc</td></tr>}</tbody></table></div><p>Hoàn thành cũ: {displayDate(oldEnd)} · mới: {displayDate(afterEnd)} · {delta===null?'—':delta>0?`trễ ${delta}`:delta<0?`sớm ${-delta}`:'không lệch'} ngày làm việc.</p></>}
    {!running&&mode==='TRANSFER'&&<section aria-live="polite" className="rounded-lg border border-outline-variant bg-surface-container p-3 text-sm space-y-1">
      <p className="text-on-surface">{transferFormulaLine}</p>
      <p className="text-on-surface">{machine} · {displayDate(afterStart)} → {displayDate(afterEnd)} · {days(afterStart,afterEnd)??'—'} ngày làm việc{delta===null?'':` · ${delta>0?`trễ ${delta}`:delta<0?`sớm ${-delta}`:'không lệch'} ngày làm việc so với lịch cũ (${assignment.machineId} · kết thúc ${displayDate(oldEnd)})`}</p>
      {dates.loading&&<p className="text-secondary">Đang tính theo lịch nghỉ…</p>}
      {dates.recalculatedFromManual&&<p className="text-secondary">Đã tính lại theo công thức — bỏ ngày sửa tay.</p>}
      {preservedDateWarning&&<p role="status" className="text-secondary">{preservedDateWarning}</p>}
      {dates.error&&<p role="alert" className="text-error">{dates.error}</p>}
      {!dates.error&&dates.plan?.warnings.map(warning=><p key={warning} role="status" className="text-error">{warning}</p>)}
    </section>}
    {calendarError&&<p role="alert" className="text-error">{calendarError}</p>}{error&&<p role="alert" className="text-error">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="rounded border border-outline px-4 py-2">Huỷ</button><button type="button" disabled={busy||(running?(!split||!!splitError||!!groupError):!!calendarError||!calendar||(mode==='SWAP'?(!targetId||!!choiceError):(dates.loading||!!dates.error||!dates.plan)))} onClick={confirm} className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50">{busy?'Đang lưu…':grouped?`Chuyển ${members.length} dòng sang ${machine}`:mode==='SWAP'?'Xác nhận đảo':'Xác nhận chuyển'}</button></div>
  </div></div>
}


