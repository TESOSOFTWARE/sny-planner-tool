'use client'
import {useEffect,useState} from 'react'
import {type FactoryCalendar} from '@/lib/schedule/productionDuration'
import {calcOrderStatus,STATUS_CONFIG} from '@/lib/orderStatus'
import {lineLabel,formatOrderSpec,orderTotalMeters,savedIntervalRange,type MachineInterval} from '@/lib/schedule/piDisplay'
import OrderMachines from './OrderMachines'
import {scheduleDay} from '@/lib/schedule/importSafety'

type Line={id:string;subLineIndex:number;isPlaceholder?:boolean;customer:string;itemCode:string|null;meshType:string|null;gsm:number|null;color:string|null;mbCode:string|null;widthM:number|null;lengthM:number|null;qty:number|null;orderType?:string;rollLength?:string|null;pieceLength?:string|null;assignments:MachineInterval[]}
type Assignment=MachineInterval&{order:{id:string}}
export default function PiOrderPanel({piNumber,selectedOrderId,onLineCount}:{piNumber:string;selectedOrderId?:string;onLineCount?:(piNumber:string,count:number|null)=>void}){
 const [loadedPi,setLoadedPi]=useState<string|null>(null)
 const [lines,setLines]=useState<Line[]>([]),[rows,setRows]=useState<Assignment[]>([]),[calendar,setCalendar]=useState<FactoryCalendar|null>(null),[error,setError]=useState(''),[calendarError,setCalendarError]=useState(''),[loading,setLoading]=useState(true)
 useEffect(()=>{let active=true;setLoadedPi(null);setLoading(true);setError('');setCalendar(null);setCalendarError('');
  void(async()=>{try{const [lr,ar]=await Promise.all([fetch(`/api/orders/pi/${encodeURIComponent(piNumber)}`),fetch(`/api/assignments?piNumber=${encodeURIComponent(piNumber)}`)]);const [data,assignments]=await Promise.all([lr.json(),ar.json()]);if(!lr.ok||!data.success||!ar.ok)throw new Error(data.error??'Không tải được thông tin PI');if(!active)return;setLines(data.orders);setLoadedPi(piNumber);setRows(assignments);const range=savedIntervalRange(assignments);if(range){try{const cr=await fetch(`/api/calendar?from=${range.from}&to=${range.to}`);const cd=await cr.json();if(!cr.ok||!cd.success)throw new Error('Không tải được lịch nghỉ để tính số ngày làm việc.');if(active)setCalendar(cd.calendar)}catch{if(active)setCalendarError('Không tải được lịch nghỉ để tính số ngày làm việc.')}}}catch(e){if(active)setError(e instanceof Error?e.message:'Không tải được thông tin PI')}finally{if(active)setLoading(false)}})();return()=>{active=false}},[piNumber])
 useEffect(()=>{onLineCount?.(piNumber,loading||error||loadedPi!==piNumber?null:lines.length)},[piNumber,loadedPi,lines,loading,error,onLineCount])
 if(loading)return <p role="status" className="py-2 text-xs text-secondary">Đang tải các dòng PI…</p>
 if(error)return <p role="alert" className="py-2 text-xs text-error">{error}</p>
 const fmt=(v:number|null|undefined)=>v==null?'—':v.toLocaleString('vi-VN')
 return <section aria-label={`Thông tin PI ${piNumber}`} className="mt-3 space-y-3 rounded border border-outline-variant p-3">
 <h4 className="text-sm font-semibold text-primary">PI {piNumber} · {lines[0]?.customer??'—'}</h4>
 <div className="overflow-x-auto"><table className="w-full min-w-[760px] lg:min-w-0 lg:table-fixed text-xs [&_th]:break-words [&_td]:break-words [&_td]:[overflow-wrap:anywhere]"><colgroup><col className="w-[5%]"/><col className="w-[12%]"/><col className="w-[12%]"/><col className="w-[7%]"/><col className="w-[13%]"/><col className="w-[16%]"/><col className="w-[10%]"/><col className="w-[25%]"/></colgroup><thead><tr>{['Dòng','Item Code','Loại lưới','GSM','Màu + MB','Quy cách','Tổng dòng (m)','Máy + ngày'].map(h=><th key={h} className="p-1 text-left text-secondary">{h}</th>)}</tr></thead><tbody>{lines.map(line=>{const assigned=rows.filter(r=>r.order.id===line.id);const status=calcOrderStatus(assigned);const meters=orderTotalMeters(line);return <tr key={line.id} className={`border-t border-outline-variant ${line.id===selectedOrderId?'bg-amber-100':''}`}><td className="p-1">{lineLabel(line)}</td><td className="p-1">{line.itemCode??'—'}</td><td className="p-1">{line.meshType??'—'}</td><td className="p-1">{fmt(line.gsm)}</td><td className="p-1">{[line.color,line.mbCode].filter(Boolean).join(' ')||'—'}</td><td className="p-1">{formatOrderSpec(line) || '—'}</td><td className="p-1">{fmt(meters)}</td><td className="p-1"><span>{STATUS_CONFIG[status].label}</span>{assigned.map(r=><div key={r.id}>{r.machineId} · {scheduleDay(r.startDate).split('-').reverse().join('/')} → {scheduleDay(r.endDate).split('-').reverse().join('/')}</div>)}</td></tr>})}</tbody></table></div>
 <OrderMachines rows={rows} calendar={calendar} error={calendarError}/>
 </section>
}
