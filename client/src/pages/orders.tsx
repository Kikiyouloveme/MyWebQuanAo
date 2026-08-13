import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderCard } from "@/components/order-card";
import { api, ApiError, ORDER_STATUS_LABEL, type Order } from "@/lib/api";
import { cn } from "@/lib/utils";

const FILTERS = [
  { value: "", label: "Tất cả" },
  { value: "pending", label: "Chờ xác nhận" },
  { value: "shipped", label: "Đang giao" },
  { value: "delivered", label: "Đã giao" },
  { value: "cancelled", label: "Đã hủy" },
];

export default function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<Order[]>("/api/orders/mine")
      .then(setOrders)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Không tải được đơn hàng"));
  }, []);

  const visible = orders?.filter((o) => !filter || o.status === filter) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20">
      <div className="py-10">
        <nav aria-label="Đường dẫn" className="text-xs uppercase tracking-widest text-muted-foreground">
          <Link to="/account" className="hover:text-brand">Tài khoản</Link> / Đơn hàng
        </nav>
        <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight">
          Đơn hàng<span className="text-brand">.</span>
        </h1>
      </div>

      <div className="-mx-5 mb-6 flex gap-2 overflow-x-auto px-5 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              "h-11 shrink-0 cursor-pointer rounded-full border px-4 font-display text-xs font-bold uppercase tracking-wider transition-colors",
              filter === f.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-destructive">{error}</p>}

      {!orders ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)}</div>
      ) : !visible.length ? (
        <div className="rounded-lg border border-dashed border-border py-20 text-center">
          <Package className="mx-auto size-7 text-muted-foreground" />
          <p className="mt-3 font-medium">
            {filter ? `Không có đơn nào ở trạng thái "${ORDER_STATUS_LABEL[filter]}"` : "Chưa có đơn hàng nào"}
          </p>
          {!filter && (
            <>
              <p className="mt-1 text-sm text-muted-foreground">Các đơn bạn đặt sẽ xuất hiện ở đây.</p>
              <Button className="mt-5" asChild><Link to="/shop">Bắt đầu mua sắm</Link></Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">{visible.map((o) => <OrderCard key={o.id} order={o} />)}</div>
      )}
    </div>
  );
}
