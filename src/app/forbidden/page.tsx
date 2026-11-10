import Link from 'next/link'
export default function ForbiddenPage() { return <main className="mx-auto max-w-xl space-y-4 p-10"><h1 className="text-2xl font-semibold">Không có quyền truy cập</h1><p>Tài khoản chưa được cấp quyền vào chức năng này. Liên hệ quản trị viên.</p><Link href="/orders" className="text-primary underline">Quay lại</Link></main> }
