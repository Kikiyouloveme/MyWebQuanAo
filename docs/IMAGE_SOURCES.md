# Nguồn ảnh và giới hạn hình ảnh

Không tải/scrape ảnh Zara, Uniqlo, Nike hoặc dùng ảnh stock như ảnh đúng SKU. Chưa nhận được ảnh nhà cung cấp kèm quyền sử dụng; vì vậy catalog mới dùng SVG minh họa tự tạo, có nhãn minh họa ngay trên ảnh. Đây không phải ảnh chụp sản phẩm và chưa phải bản kỹ thuật sản xuất đã đo thực tế.

## Asset mới
| Nhóm | Đường dẫn | Nguồn / bằng chứng |
|---|---|---|
| Catalog 12 sản phẩm cũ, mỗi màu front/back | assets/img/catalog/*.svg | Source generator server/catalog-media.js, tạo cho project, không lấy tài nguyên bên ngoài |
| Blank regular/oversized/hoodie, trắng/đen, front/back | assets/img/custom/*.svg | server/migrate-custom-print.js; geometry 4:5, print zone cấu hình kèm theo |
| Artwork demo 1800px và 64px | assets/img/demo/artwork.svg, artwork-1800.png, artwork-low-resolution.png | SVG nguồn tự tạo cho project; PNG sinh bằng Sharp trong migration |
| Customer artwork | server/private/artwork | Người tải xác nhận quyền; original không public; không đưa vào catalog |
| Review photos | server/private/review-photos | Khách chủ đơn tải; chỉ derived WebP published review được public |

Metadata catalog: assetId, productId, color, viewType, localPath, altText, sourceName, sourceURL(null với nội bộ), licenseType=Project-authored SVG, licenseEvidence=generator path, attribution, verifiedAt=2026-11-07. Không gán một license bên thứ ba không có bằng chứng. Người vận hành chịu trách nhiệm quyền sử dụng các ảnh bổ sung sau này.

## Audit từng sản phẩm seed
| Product ID | Loại / chi tiết minh họa | Màu ánh xạ |
|---|---|---|
| tee-boxy-01 | Áo thun boxy, stamp ngực | Kem, Đen, Xanh rêu |
| tee-heavy-02 | Áo thun form regular, chữ tonal | Đen, Trắng |
| shirt-flannel-03 | Sơ mi dài tay, caro | Nâu đất, Xanh navy |
| hoodie-mono-04 | Hoodie, mũ/túi trước | Đen, Xám tiêu, Kem |
| jacket-coach-05 | Áo khoác dài tay, hàng nút | Xanh olive, Đen |
| varsity-06 | Varsity thân/tay tương phản | Kem/Đen, Navy/Trắng |
| pants-wide-07 | Quần ống rộng, đường ly | Đen, Be |
| pants-cargo-08 | Quần cargo, túi hộp | Xanh olive, Đen |
| shorts-sweat-09 | Quần short, dây rút | Xám tiêu, Đen |
| cap-6panel-10 | Mũ panel/lưỡi trai | Đen, Kem, Xanh olive |
| tote-canvas-11 | Tote quai dài | Kem, Đen |
| socks-crew-12 | Đôi tất đen/trắng | Đen/Trắng |

Mockup chỉ minh họa silhouette và màu gần đúng; không khẳng định texture, GSM, logo thêu/dập nổi hoặc sắc độ đã đối chiếu nhà cung cấp. Tất cả garments có asset riêng; không dùng hình áo cho quần/mũ/túi. Đã render contact sheet 12 loại để kiểm tra khác biệt hình dáng. Integration kiểm tra mọi media URL trả image/200.

Migration chỉ đổi ảnh placeholder `/assets/img/p/<seed-id>...` khi chưa có media, không đè gallery/ảnh upload hiện hữu. Các file placeholder cũ giữ làm fallback cho dữ liệu lịch sử. Thư viện ảnh Admin cho phép upload, gán màu/góc, sắp thứ tự và ghi bằng chứng nguồn. Bộ ảnh minh họa chưa đáp ứng chất lượng ảnh chụp thương mại; cần bổ sung ảnh sản phẩm thật được cấp phép trước bán hàng thực tế.
