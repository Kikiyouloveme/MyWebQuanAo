/** Các trang nội dung: Giới thiệu, Liên hệ, Tin tức và trang 404. */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, Clock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/toast";
import { usePageMeta } from "@/lib/use-page-meta";
import { api, ApiError } from "@/lib/api";
import { SITE, POLICIES } from "@/lib/site";
import { cn } from "@/lib/utils";

function PageHeader({ eyebrow, title, lead }: { eyebrow: string; title: string; lead?: string }) {
  return (
    <header className="py-10">
      <nav aria-label="Đường dẫn" className="text-xs uppercase tracking-widest text-muted-foreground">
        <Link to="/" className="hover:text-brand">Trang chủ</Link> / {eyebrow}
      </nav>
      <h1 className="mt-2 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">
        {title}<span className="text-brand">.</span>
      </h1>
      {lead && <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">{lead}</p>}
    </header>
  );
}

/* ==================== GIỚI THIỆU ==================== */

export function About() {
  usePageMeta({
    title: "Về chúng tôi — VELATHIER",
    description: "VELATHIER là thương hiệu thời trang cơ bản: chất liệu tốt, phom dáng chuẩn, đường may bền. Tìm hiểu câu chuyện và cam kết của chúng tôi.",
  });

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20">
      <PageHeader
        eyebrow="Về chúng tôi"
        title="Về VELATHIER"
        lead="Chúng tôi tin rằng tủ đồ tốt không cần nhiều món — chỉ cần những món được làm kỹ."
      />

      <div className="space-y-8 text-[15px] leading-relaxed text-muted-foreground">
        <section>
          <h2 className="mb-3 font-display text-xl font-bold uppercase text-foreground">Triết lý</h2>
          <p>
            VELATHIER theo đuổi tinh thần &ldquo;ít mà chất&rdquo;. Thay vì chạy theo số lượng mẫu mã, chúng tôi
            tập trung vào những món đồ cơ bản mà bạn mặc gần như mỗi tuần: chiếc áo thun đứng phom sau
            hàng chục lần giặt, chiếc quần vừa vặn không cần chỉnh, chiếc áo khoác đủ bền để đi cùng bạn
            qua nhiều mùa.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-bold uppercase text-foreground">Chất liệu &amp; phom dáng</h2>
          <p>
            Áo thun dùng cotton compact 240–280gsm, dày dặn và ít xù. Quần dùng cotton twill hoặc tici
            đứng form, ít nhăn. Mỗi mẫu đều được may thử và mặc thử nhiều lần trước khi lên kệ — chúng tôi
            chỉnh phom cho tới khi thấy thực sự vừa vặn với vóc dáng người Việt.
          </p>
        </section>

        <section>
          <h2 className="mb-3 font-display text-xl font-bold uppercase text-foreground">Cam kết</h2>
          <ul className="space-y-2">
            <li>Miễn phí vận chuyển cho đơn hàng từ 750.000₫.</li>
            <li>Đổi hoặc trả trong 7 ngày kể từ khi nhận hàng, với sản phẩm còn nguyên tem và chưa qua sử dụng.</li>
            <li>Đổi hàng áp dụng cho sản phẩm cùng giá trị — ví dụ đổi size hoặc đổi màu. Muốn chuyển sang món giá khác, vui lòng trả hàng và đặt đơn mới.</li>
            <li>Khách đổi ý thì khách chịu phí vận chuyển chiều đổi/trả; sản phẩm lỗi hoặc giao sai thì cửa hàng chịu.</li>
            <li>Bảo hành đường may 30 ngày — lỗi từ khâu sản xuất, chúng tôi sửa hoặc đổi mới.</li>
            <li>Tư vấn size trước khi mua để hạn chế phải đổi trả.</li>
          </ul>
        </section>

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-2 font-display text-lg font-bold uppercase text-foreground">Cần hỗ trợ chọn size?</h2>
          <p className="mb-4">Nhắn cho chúng tôi chiều cao, cân nặng và phom bạn thích — chúng tôi sẽ gợi ý size phù hợp.</p>
          <Button asChild><Link to="/contact">Liên hệ tư vấn</Link></Button>
        </section>
      </div>
    </div>
  );
}

/* ==================== LIÊN HỆ ==================== */

/** Chỉ hiển thị kênh liên hệ đã được cấu hình thật — xem client/src/lib/site.ts */
const CONTACT_INFO = [
  SITE.email && { icon: Mail, label: "Email", value: SITE.email, href: `mailto:${SITE.email}` },
  SITE.phone && { icon: Phone, label: "Hotline", value: SITE.phone, href: `tel:${SITE.phone.replace(/\s/g, "")}` },
  SITE.address && { icon: MapPin, label: "Cửa hàng", value: SITE.address, href: undefined },
  SITE.openingHours && { icon: Clock, label: "Giờ mở cửa", value: SITE.openingHours, href: undefined },
].filter(Boolean) as { icon: typeof Mail; label: string; value: string; href?: string }[];

const SUBJECT_OPTIONS = [
  { value: "product", label: "Tư vấn sản phẩm / chọn size" },
  { value: "order", label: "Hỗ trợ đơn hàng" },
  { value: "return", label: "Đổi trả / hoàn tiền" },
  { value: "other", label: "Nội dung khác" },
];

export function Contact() {
  usePageMeta({
    title: "Liên hệ — VELATHIER",
    description: "Gửi yêu cầu hỗ trợ tới VELATHIER: tư vấn chọn size, hỗ trợ đơn hàng hoặc đổi trả. Chúng tôi phản hồi trong 1–2 ngày làm việc.",
  });

  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const get = (k: string) => String(data.get(k) || "").trim();

    setBusy(true);
    setError("");
    try {
      // Gửi thẳng vào hệ thống — nhân viên xem và xử lý ở khu vực quản trị
      const res = await api.post<{ message: string }>("/api/contact", {
        name: get("name"),
        email: get("email"),
        phone: get("phone") || undefined,
        subject: get("subject") || "other",
        orderId: get("orderId") || undefined,
        content: get("content"),
      });
      toast.success(res.message);
      setSent(true);
      form.reset();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không gửi được tin nhắn. Vui lòng thử lại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-5 pb-20">
      <PageHeader
        eyebrow="Liên hệ"
        title="Liên hệ"
        lead="Có câu hỏi về sản phẩm, đơn hàng hay chính sách đổi trả? Chúng tôi luôn sẵn sàng hỗ trợ."
      />

      <div className={cn("grid gap-8", CONTACT_INFO.length ? "lg:grid-cols-[1fr_1.2fr]" : "max-w-2xl")}>
        {CONTACT_INFO.length > 0 && (
          <div className="space-y-4">
            {CONTACT_INFO.map((item) => (
              <div key={item.label} className="flex gap-3.5 rounded-lg border border-border bg-card p-4">
                <item.icon className="mt-0.5 size-5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">{item.label}</p>
                  {item.href ? (
                    <a href={item.href} className="font-medium hover:text-brand">{item.value}</a>
                  ) : (
                    <p className="font-medium">{item.value}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {sent ? (
          <div className="rounded-lg border border-emerald-600/40 bg-emerald-50 p-6 text-center">
            <p className="font-display text-lg font-semibold text-emerald-900">Đã nhận tin nhắn của bạn</p>
            <p className="mt-2 text-sm leading-relaxed text-emerald-900">
              Chúng tôi sẽ phản hồi qua email trong vòng 1–2 ngày làm việc.
            </p>
            <Button variant="outline" className="mt-5" onClick={() => setSent(false)}>Gửi tin nhắn khác</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-5 sm:p-6" noValidate>
            <h2 className="font-display text-base font-bold uppercase">Gửi yêu cầu hỗ trợ</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="c-name">Họ tên *</Label>
                <Input id="c-name" name="name" required autoComplete="name" className="mt-2" />
              </div>
              <div>
                <Label htmlFor="c-phone">Số điện thoại</Label>
                <Input id="c-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0901234567" className="mt-2" />
              </div>
            </div>
            <div>
              <Label htmlFor="c-email">Email *</Label>
              <Input id="c-email" name="email" type="email" required autoComplete="email" className="mt-2" />
              <p className="mt-1.5 text-xs text-muted-foreground">Chúng tôi sẽ phản hồi qua địa chỉ này.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="c-subject">Chủ đề</Label>
                <select
                  id="c-subject" name="subject" defaultValue="product"
                  className="mt-2 h-10 w-full cursor-pointer rounded border border-input bg-background px-3 text-sm"
                >
                  {SUBJECT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="c-order">Mã đơn hàng</Label>
                <Input id="c-order" name="orderId" placeholder="DH1001 (nếu có)" className="mt-2" />
              </div>
            </div>
            <div>
              <Label htmlFor="c-content">Nội dung *</Label>
              <textarea
                id="c-content" name="content" rows={5} required minLength={10}
                placeholder="Mô tả cụ thể để chúng tôi hỗ trợ nhanh hơn…"
                className="mt-2 w-full rounded border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring"
              />
            </div>

            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}

            <Button disabled={busy} className="w-full">
              {busy ? <><Loader2 className="animate-spin" /> Đang gửi…</> : <><Send /> Gửi yêu cầu</>}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ==================== TIN TỨC ==================== */

const ARTICLES = [
  {
    date: "2026-08-01",
    title: "Bộ sưu tập FW26 đã lên kệ",
    excerpt: "12 thiết kế mới xoay quanh chất liệu cotton dày dặn và bảng màu đất — kem, đen, olive, nâu đất. Tập trung vào phom relaxed dễ mặc quanh năm.",
  },
  {
    date: "2026-07-20",
    title: "Hướng dẫn chọn size chuẩn",
    excerpt: "Phom relaxed của VELATHIER rộng hơn phom regular khoảng nửa size. Nếu bạn ở giữa hai size, chọn size nhỏ hơn để form ôm vừa phải.",
  },
  {
    date: "2026-07-10",
    title: "Miễn phí vận chuyển cho đơn từ 750.000₫",
    excerpt: "Áp dụng cho mọi đơn hàng toàn quốc. Phí ship được tự động miễn ở bước thanh toán sau khi đã trừ mã giảm giá, không cần nhập thêm mã nào.",
  },
  {
    date: "2026-06-28",
    title: "Bảo quản đồ cotton dày đúng cách",
    excerpt: "Giặt nước lạnh, lộn trái khi giặt và hạn chế sấy nóng — ba nguyên tắc giúp áo giữ phom và bền màu qua nhiều mùa.",
  },
  {
    date: "2026-06-15",
    title: "Chính sách đổi trả trong 7 ngày",
    excerpt: "Sản phẩm còn nguyên tem mác, chưa qua sử dụng được đổi sang món cùng giá trị hoặc hoàn tiền, trong vòng 7 ngày kể từ khi nhận hàng.",
  },
  {
    date: "2026-06-01",
    title: "Vì sao chúng tôi chọn cotton compact",
    excerpt: "Cotton compact có sợi xoắn chặt hơn cotton thường, nhờ vậy bề mặt ít xù lông và áo giữ được phom sau nhiều lần giặt.",
  },
];

export function News() {
  usePageMeta({
    title: "Tin tức — VELATHIER",
    description: "Cập nhật bộ sưu tập mới, hướng dẫn chọn size, cách bảo quản sản phẩm và các chính sách của VELATHIER.",
  });

  return (
    <div className="mx-auto max-w-5xl px-5 pb-20">
      <PageHeader
        eyebrow="Tin tức"
        title="Tin tức"
        lead="Bộ sưu tập mới, hướng dẫn chọn size và những điều hữu ích khi mua sắm tại VELATHIER."
      />

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ARTICLES.map((article) => (
          <article key={article.title} className="flex flex-col rounded-lg border border-border bg-card p-5">
            <time dateTime={article.date} className="text-xs font-bold uppercase tracking-widest text-brand">
              {new Date(article.date).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" })}
            </time>
            <h2 className="mt-2 font-display text-lg font-bold leading-snug">{article.title}</h2>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{article.excerpt}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ==================== 404 ==================== */

export function NotFound() {
  usePageMeta({ title: "Không tìm thấy trang — VELATHIER", noIndex: true });

  return (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <p className="font-display text-6xl font-bold text-brand">404</p>
      <h1 className="mt-4 font-display text-2xl font-bold uppercase">Không tìm thấy trang</h1>
      <p className="mt-3 leading-relaxed text-muted-foreground">
        Trang bạn tìm có thể đã được chuyển hoặc không còn tồn tại. Hãy thử quay lại trang chủ
        hoặc xem các sản phẩm đang có.
      </p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button asChild><Link to="/">Về trang chủ</Link></Button>
        <Button variant="outline" asChild><Link to="/shop">Xem sản phẩm</Link></Button>
      </div>
    </div>
  );
}
