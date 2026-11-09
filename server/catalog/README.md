# Địa chỉ Việt Nam

`vietnam-divisions.json` là bản dữ liệu tải ngày 2026-09-15 từ
https://provinces.open-api.vn/api/v2/?depth=2 (34 tỉnh/thành, 3.321 phường/xã).
Nguồn và tài liệu: https://github.com/hongquan/vn-open-api-provinces

Dùng mã tỉnh và mã phường/xã để kiểm tra quan hệ địa chỉ trên server.
Client chỉ tải danh sách tỉnh và danh sách phường/xã của tỉnh đang chọn.
Không gửi thông tin khách hàng tới nhà cung cấp dữ liệu.
Khi cập nhật, thay file bằng dữ liệu cùng cấu trúc và chạy test checkout.
