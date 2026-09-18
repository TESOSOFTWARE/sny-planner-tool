'use client'

import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { customerSchema, type CustomerInput } from '@/lib/validations/customer'
import { type SerializedCustomer } from './CustomerTable'

interface Props {
  customer: SerializedCustomer | null
  onClose: () => void
  onSaved: () => void
}

const inputCls = (hasError: boolean) => [
  'w-full bg-transparent border-[0.5px] rounded px-md py-[10px]',
  'text-on-surface placeholder:text-outline',
  'focus:outline-none focus:border-primary focus:border-b-2 transition-colors',
  'font-noto text-body-md',
  hasError ? 'border-error' : 'border-outline-variant',
].join(' ')

export default function CustomerModal({ customer, onClose, onSaved }: Props) {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CustomerInput>({
    resolver: zodResolver(customerSchema)
  })

  useEffect(() => {
    if (customer) {
      reset({
        name: customer.name,
        address: customer.address ?? undefined,
        tel: customer.tel ?? undefined,
        fax: customer.fax ?? undefined,
        contact: customer.contact ?? undefined,
        country: customer.country ?? undefined,
        note: customer.note ?? undefined,
      })
    } else {
      reset({
        name: '',
        address: '', tel: '', fax: '', contact: '', country: '', note: ''
      })
    }
  }, [customer, reset])

  const onSubmit = async (data: CustomerInput) => {
    try {
      const url = customer ? `/api/customers/${customer.id}` : '/api/customers'
      const method = customer ? 'PATCH' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      
      const json = await res.json()
      if (!res.ok || !json.success) {
        alert(json.error || 'Đã có lỗi xảy ra')
        return
      }

      onSaved()
    } catch (err) {
      alert('Network error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        
        <div className="px-lg py-md border-b border-[0.5px] border-outline-variant flex items-center justify-between shrink-0">
          <h2 className="text-headline-sm font-inter font-semibold text-on-surface">
            {customer ? 'Sửa thông tin khách hàng' : 'Thêm khách hàng mới'}
          </h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center text-secondary transition-colors">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-lg overflow-y-auto">
          <form id="customer-form" onSubmit={handleSubmit(onSubmit)} className="space-y-md">
            <div>
              <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Tên công ty *</label>
              <input type="text" className={inputCls(!!errors.name)} {...register('name')} placeholder="Ví dụ: SNY Korea Co., Ltd." />
              {errors.name && <p className="text-error text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Quốc gia</label>
                <input type="text" className={inputCls(!!errors.country)} {...register('country')} placeholder="Ví dụ: Korea" />
                {errors.country && <p className="text-error text-xs mt-1">{errors.country.message}</p>}
              </div>
              <div>
                <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Người liên hệ</label>
                <input type="text" className={inputCls(!!errors.contact)} {...register('contact')} placeholder="Ví dụ: Yuna Yeo / Manager" />
                {errors.contact && <p className="text-error text-xs mt-1">{errors.contact.message}</p>}
              </div>
            </div>

            <div>
              <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Địa chỉ</label>
              <input type="text" className={inputCls(!!errors.address)} {...register('address')} />
              {errors.address && <p className="text-error text-xs mt-1">{errors.address.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-md">
              <div>
                <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Số điện thoại</label>
                <input type="text" className={inputCls(!!errors.tel)} {...register('tel')} />
                {errors.tel && <p className="text-error text-xs mt-1">{errors.tel.message}</p>}
              </div>
              <div>
                <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Fax</label>
                <input type="text" className={inputCls(!!errors.fax)} {...register('fax')} />
                {errors.fax && <p className="text-error text-xs mt-1">{errors.fax.message}</p>}
              </div>
            </div>

            <div>
              <label className="text-label-sm font-inter font-medium text-on-surface-variant block mb-1">Ghi chú nội bộ</label>
              <textarea className={inputCls(!!errors.note) + " min-h-[80px]"} {...register('note')} />
              {errors.note && <p className="text-error text-xs mt-1">{errors.note.message}</p>}
            </div>
          </form>
        </div>

        <div className="px-lg py-md border-t border-[0.5px] border-outline-variant flex justify-end gap-sm shrink-0 bg-surface-container-lowest rounded-b-xl">
          <button onClick={onClose} type="button" className="px-4 py-2 text-sm font-medium border border-primary text-primary rounded-md hover:bg-surface-container">
            Hủy
          </button>
          <button type="submit" form="customer-form" disabled={isSubmitting} className="px-4 py-2 text-sm font-medium bg-primary text-on-primary rounded-md hover:bg-primary/90 disabled:opacity-50">
            {isSubmitting ? 'Đang lưu...' : 'Lưu khách hàng'}
          </button>
        </div>
        
      </div>
    </div>
  )
}
