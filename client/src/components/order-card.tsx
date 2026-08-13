import { Link } from "react-router-dom";
import { ChevronRight, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/utils";
import {
  ORDER_STATUS_LABEL, ORDER_STATUS_TONE, PAY_STATUS_LABEL, PAY_STATUS_TONE,
  type Order,
} from "@/lib/api";

/** Thẻ tóm tắt đơn hàng — dùng ở danh sách đơn của khách */
export function OrderCard({ order }: { order: Order }) {
  return (
    <Link
      to={`/orders/${order.id}`}
      className="block rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <b className="font-display">{order.id}</b>
          <span className="text-xs text-muted-foreground">
            {new Date(order.createdAt).toLocaleDateString("vi-VN")}
          </span>
        </span>
        <span className="flex flex-wrap gap-1.5">
          <Badge variant={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status] || order.status}</Badge>
          <Badge variant={PAY_STATUS_TONE[order.payStatus]}>{PAY_STATUS_LABEL[order.payStatus]}</Badge>
        </span>
      </div>

      <div className="mt-3 flex gap-2 overflow-hidden">
        {order.items.slice(0, 4).map((item) => (
          <img
            key={item.variantId}
            src={item.img}
            alt=""
            width={48}
            height={60}
            className="h-15 w-12 shrink-0 rounded border border-border object-cover"
          />
        ))}
        {order.items.length > 4 && (
          <span className="grid h-15 w-12 shrink-0 place-items-center rounded border border-border text-xs text-muted-foreground">
            +{order.items.length - 4}
          </span>
        )}
      </div>

      <p className="mt-3 line-clamp-1 text-sm text-muted-foreground">
        {order.items.map((i) => `${i.title} (${i.color}/${i.size}) ×${i.qty}`).join(" · ")}
      </p>

      {order.shipping?.trackingNumber && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Truck className="size-3.5" /> {order.shipping.carrier} — {order.shipping.trackingNumber}
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <span className="font-display font-bold">{money(order.total)}</span>
        <span className="flex items-center gap-1 text-sm text-brand">
          Xem chi tiết <ChevronRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
