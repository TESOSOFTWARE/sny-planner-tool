import { OrderStatus, STATUS_CONFIG } from '@/lib/orderStatus'

interface Props {
  status: OrderStatus
}

export default function OrderStatusBadge({ status }: Props) {
  const config = STATUS_CONFIG[status]

  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-inter font-medium tracking-wide whitespace-nowrap"
      style={{
        backgroundColor: config.bg,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  )
}
