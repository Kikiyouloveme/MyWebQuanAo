# Mã nguồn cũ (không còn sử dụng)

Đây là phiên bản HTML/CSS/JS thuần trước khi dự án chuyển sang React.
**Ứng dụng đang chạy thật là bản React ở thư mục `client/`** — thư mục này chỉ
được giữ lại để tra cứu, không có file nào ở đây được server nạp lúc chạy.

Nội dung đã được chuyển sang React:

| File cũ | Thay bằng |
|---|---|
| `index.html` | `client/src/pages/home.tsx` |
| `shop.html` | `client/src/pages/shop.tsx` |
| `product.html` | `client/src/pages/product.tsx` |
| `checkout.html` | `client/src/pages/checkout.tsx` |
| `payment.html` | `client/src/pages/payment.tsx` |
| `account.html` | `client/src/pages/account.tsx` |
| `admin.html` | `client/src/pages/admin.tsx` |
| `about.html` | `client/src/pages/content.tsx` → `About` |
| `contact.html` | `client/src/pages/content.tsx` → `Contact` |
| `news.html` | `client/src/pages/content.tsx` → `News` |
| `assets/css/style.css` | `client/src/globals.css` (Tailwind) |
| `assets/js/*` | `client/src/` |

Có thể xóa thư mục này khi không cần đối chiếu nữa.
