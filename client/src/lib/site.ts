/**
 * Thông tin cửa hàng hiển thị ra ngoài.
 *
 * Để TRỐNG những mục chưa có thật — giao diện tự ẩn mục trống thay vì hiển thị
 * số điện thoại/email không tồn tại. Điền vào đây khi cửa hàng đã có kênh liên hệ
 * chính thức, hoặc đặt biến môi trường tương ứng lúc build.
 */
export const SITE = {
  name: "VELATHIER",
  tagline: "Wear the basics well",
  description: "Thời trang cơ bản làm kỹ — cotton dày dặn, phom chuẩn, đường may bền.",

  /** Email hỗ trợ khách hàng. Bỏ trống nếu chưa có hộp thư chính thức. */
  email: import.meta.env.VITE_SHOP_EMAIL ?? "",
  /** Hotline. Bỏ trống nếu chưa có tổng đài. */
  phone: import.meta.env.VITE_SHOP_PHONE ?? "",
  /** Địa chỉ cửa hàng. Bỏ trống nếu chưa có mặt bằng mở cửa đón khách. */
  address: import.meta.env.VITE_SHOP_ADDRESS ?? "",
  /** Giờ mở cửa — chỉ có ý nghĩa khi đã có địa chỉ. */
  openingHours: import.meta.env.VITE_SHOP_HOURS ?? "",
} as const;

/** Có kênh liên hệ trực tiếp nào đã được cấu hình chưa */
export const hasDirectContact = Boolean(SITE.email || SITE.phone);

/** Chính sách đã được chốt — chỉ nêu những gì hệ thống thực sự thi hành */
export const POLICIES = {
  freeShippingThreshold: 750_000,
  flatShippingFee: 40_000,
  returnWindowDays: 7,
} as const;
