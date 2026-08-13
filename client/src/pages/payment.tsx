import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, ShieldAlert, Loader2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, ApiError, type Order } from "@/lib/api";
import { money } from "@/lib/utils";

export default function Payment() {
  const { orderId } = useParams();
  const [params] = useSearchParams();
  const cod = params.get("cod") === "1";
  const vnp = params.get("vnp"); // paid | failed | invalid | notfound

  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (vnp === "invalid" || vnp === "notfound") return;
    api.get<Order>("/api/orders/" + orderId)
      .then(setOrder)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Không tải được đơn hàng"));
  }, [orderId, vnp]);

  async function payAgain() {
    setRedirecting(true);
    try {
      const { url } = await api.post<{ url: string }>("/api/payment/vnpay/create", { orderId });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không tạo được liên kết thanh toán");
      setRedirecting(false);
    }
  }

  /* --- chữ ký callback không hợp lệ --- */
  if (vnp === "invalid") {
    return (
      <Shell>
        <ShieldAlert className="mx-auto size-10 text-destructive" />
        <h1 className="mt-3 font-display text-xl font-bold uppercase">Giao dịch không hợp lệ</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Dữ liệu trả về từ cổng thanh toán không vượt qua bước xác thực chữ ký hoặc số tiền không khớp.
          Giao dịch đã bị từ chối để bảo vệ tài khoản của bạn. Đơn hàng chưa bị trừ tiền.
        </p>
        <div className="mt-6 grid gap-2.5">
          <Button asChild><Link to="/orders">Xem đơn hàng của tôi</Link></Button>
          <Button variant="outline" asChild><Link to="/shop">Tiếp tục mua sắm</Link></Button>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <h1 className="font-display text-xl font-bold uppercase">{error}</h1>
        <Button className="mt-6" asChild><Link to="/orders">Đơn hàng của tôi</Link></Button>
      </Shell>
    );
  }

  if (!order) {
    return <Shell><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /></Shell>;
  }

  const info = (
    <>
      <h1 className="font-display text-2xl font-bold uppercase">Đơn hàng {order.id}</h1>
      <p className="mt-2 font-display text-4xl font-bold">{money(order.total)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {order.items.length} sản phẩm · Giao tới {order.shippingAddress.fullName}
      </p>
    </>
  );

  const actions = (
    <div className="mt-6 grid gap-2.5">
      <Button asChild><Link to={`/orders/${order.id}`}><Package /> Theo dõi đơn hàng</Link></Button>
      <Button variant="outline" asChild><Link to="/shop">Tiếp tục mua sắm</Link></Button>
    </div>
  );

  /* --- COD --- */
  if (cod || (order.payMethod === "cod" && order.payStatus !== "paid")) {
    return (
      <Shell>
        {info}
        <p className="mt-6 flex items-center justify-center gap-2 font-medium text-emerald-700">
          <CheckCircle2 className="size-5" /> Đặt hàng thành công!
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Bạn sẽ thanh toán khi nhận hàng. Email xác nhận đã được gửi tới {order.customerEmail}.
        </p>
        {actions}
      </Shell>
    );
  }

  /* --- Đã thanh toán --- */
  if (order.payStatus === "paid") {
    return (
      <Shell>
        <Badge variant="success" className="mb-4">Đã thanh toán</Badge>
        {info}
        <p className="mt-6 flex items-center justify-center gap-2 font-medium text-emerald-700">
          <CheckCircle2 className="size-5" /> Thanh toán thành công qua VNPay
        </p>
        {order.payment?.transactionNo && (
          <p className="mt-2 text-sm text-muted-foreground">
            Mã giao dịch: <b className="text-foreground">{order.payment.transactionNo}</b>
            {order.payment.bankCode ? ` · Ngân hàng: ${order.payment.bankCode}` : ""}
          </p>
        )}
        {actions}
      </Shell>
    );
  }

  /* --- Thất bại hoặc chờ thanh toán --- */
  const failed = order.payStatus === "failed" || vnp === "failed";
  return (
    <Shell>
      {failed ? (
        <>
          <XCircle className="mx-auto size-10 text-destructive" />
          <h1 className="mt-3 font-display text-xl font-bold uppercase">Thanh toán chưa thành công</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {order.payment?.message || "Giao dịch không hoàn tất."} Đơn hàng vẫn được giữ, bạn có thể thanh toán lại.
          </p>
        </>
      ) : (
        <>
          <Badge variant="warning" className="mb-4">Chờ thanh toán</Badge>
          {info}
          <p className="mt-4 text-sm text-muted-foreground">
            Đơn hàng chưa được thanh toán. Nhấn nút bên dưới để tới cổng VNPay.
          </p>
        </>
      )}
      <div className="mt-6 grid gap-2.5">
        <Button variant="brand" onClick={payAgain} disabled={redirecting}>
          {redirecting ? <><Loader2 className="animate-spin" /> Đang chuyển hướng…</> : "Thanh toán qua VNPay"}
        </Button>
        <Button variant="outline" asChild><Link to={`/orders/${order.id}`}>Để sau</Link></Button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-16">
      <div className="rounded-lg border border-border bg-card p-6 text-center shadow-sm sm:p-8">{children}</div>
    </div>
  );
}
