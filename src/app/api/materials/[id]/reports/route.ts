// [MoM §3.1] Source snapshots for one material/month, never stock writes.
import { NextRequest,NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
export async function GET(req:NextRequest,{params}:{params:{id:string}}){
  const month=req.nextUrl.searchParams.get('month')
  if(!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({success:false,error:'Cần tháng YYYY-MM hợp lệ.'},{status:422})
  const start=new Date(`${month}-01T00:00:00Z`),end=new Date(start)
  end.setUTCMonth(end.getUTCMonth()+1)
  try{
    const exists=await prisma.material.findUnique({where:{id:params.id},select:{id:true}})
    if(!exists) return NextResponse.json({success:false,error:'Không tìm thấy vật tư.'},{status:404})
    const reports=await prisma.materialReportSnapshot.findMany({where:{materialId:params.id,reportDate:{gte:start,lt:end}},orderBy:{reportDate:'asc'},select:{reportDate:true,payload:true}})
    return NextResponse.json({success:true,reports:reports.map(r=>({reportDate:r.reportDate.toISOString().slice(0,10),payload:r.payload}))})
  }catch{return NextResponse.json({success:false,error:'Không tải được lịch sử báo cáo.'},{status:500})}
}