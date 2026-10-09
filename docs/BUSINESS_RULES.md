# Quy tắc vận hành

Mọi phép tính ngày/giờ dùng Việt Nam UTC+7, độc lập timezone hệ điều hành. Timestamp lưu dưới dạng instant UTC. Tiền được tính bằng VNĐ nguyên; phần lẻ tổng tiền giờ và từng mức giảm làm tròn đến đồng gần nhất.

## Tính giờ

1. `elapsedMinutes = floor((stop - start) / 60_000)`.
2. Nếu dưới 5 phút, số phút tính phí = 0.
3. Còn lại: `floor(elapsedMinutes / 15) × 15 + (elapsedMinutes % 15 >= 8 ? 15 : 0)`.
4. Timeline tính phí bắt đầu từ chính thời điểm mở và dài bằng số phút đã làm tròn. Chia timeline tại ranh giới bảng giá đã lưu khi mở phiên; cộng các khoản `thời lượng × giá giờ / 60`, sau đó làm tròn tổng đến VNĐ.
5. Không làm tròn từng khung riêng vì có thể tạo hoặc làm mất block khi vắt 18:00.
6. Nếu làm tròn lên khiến đuôi timeline vượt 24:00 tối đa 7 phút, đuôi này dùng đơn giá cuối ngày. Thời gian chơi thực không được vượt 24:00; bảo trì chốt đúng 24:00 dù server chạy lại hôm sau.

| Phiên chơi | Phút tính phí | Giá thường 60k, cao điểm 90k |
|---|---:|---:|
| 09:00–09:04:59 | 0 | 0đ |
| 09:00–09:05 | 0 | 0đ |
| 09:00–09:07:59 | 0 | 0đ |
| 09:00–09:08 | 15 | 15.000đ |
| 17:45–18:07 | 15 | 15.000đ |
| 17:45–18:08 | 30 | 37.500đ |
| 17:53–18:08 | 15 | 19.000đ |
| 23:52–24:00 | 15 | 22.500đ |

Việc phiên 5–7 phút vẫn miễn tiền giờ là hệ quả của quy tắc làm tròn xuống mà đề bài đưa ra. Nếu muốn tối thiểu 15 phút từ phút thứ 5, phải đổi cả quy tắc và các test tương ứng.

## Ưu đãi

- Sinh nhật: so sánh ngày/tháng sinh với ngày mở bàn; giảm 15% tiền giờ, không giảm dịch vụ. Snapshot lúc mở; đổi ngày hoặc hồ sơ về sau không đổi phiên đang tính.
- Hạn mức: lấy tiền giờ sau sinh nhật cộng dịch vụ. Từ 300.000 đến 499.999: giảm 5%; từ 500.000: giảm 10%.
- Voucher: tối đa một mã/hóa đơn, áp dụng cuối cùng. Điều kiện đơn tối thiểu xét trên tổng sau hai tầng tự động. Mức giảm = min(phần trăm × tổng đó, trần voucher). Mỗi thanh toán thành công tiêu thụ một lượt; xem báo giá không giữ hay tiêu thụ lượt.
- Voucher có hiệu lực cả ngày bắt đầu và ngày kết thúc theo UTC+7. Lượt cuối có thể hết giữa xem báo giá và trả tiền; server từ chối và không ghi hóa đơn.
- Sinh nhật 29/02 chỉ áp dụng vào 29/02; chưa có quy tắc thay thế 28/02 cho năm không nhuận.

## Đặt bàn và nhận bàn

- Ngày D dựa vào lúc server nhận yêu cầu; chấp nhận đến D+7 kể cả hai đầu.
- Đặt trước ít nhất 30 phút tính bằng timestamp, không làm tròn lead-time. Giờ bắt đầu theo lưới 15 phút; thời lượng 30–360, bội số 15. Kết thúc đúng 24:00 hợp lệ.
- Khoảng chiếm lịch `[startsAt, endsAt)`; hai đơn kết thúc/bắt đầu cùng thời điểm không chồng lấn.
- Một account có tối đa một đơn PENDING. Đơn hết hạn được giải phóng trước khi xét đơn mới.
- Check-in trong `[-900000,+900000]` millisecond so với giờ hẹn. Hết hạn khi **lớn hơn** +900000, không phải bằng.
- Job chạy mỗi 10 giây; các API đọc bản đồ/đặt/nhận bàn cũng thực hiện bảo trì, tránh dựa vào trình duyệt để hết hạn.
- Đặt lịch tương lai có thể thực hiện khi bàn đang có khách vãng lai; lịch dự kiến được hiển thị cho thu ngân. Không có cơ chế cưỡng chế chấm dứt cuộc chơi khi khách khác đến. Thu ngân phải đóng/thanh toán phiên trước; check-in trả TABLE_BUSY nếu bàn còn phiên hoạt động.
- Nhận bàn sớm có thể bị từ chối nếu phiên trước chưa kết thúc, dù đã vào cửa sổ check-in.

## Phiên và hóa đơn

`OPEN → STOPPED → PAID`, hoặc `OPEN → CANCELLED` trong 180 giây kể từ lúc mở. Hủy mở nhầm không tạo hóa đơn, không thu tiền, giải phóng bàn; những dịch vụ nhập nhầm trên phiên cũng không thu. Lịch liên quan chuyển CANCELLED.

Mở bàn ghi lại bảng giá và điều kiện sinh nhật. Khi STOPPED, tiền giờ đóng băng, không thêm dịch vụ. Bàn chỉ được giải phóng sau PAID/CANCELLED để tránh hóa đơn bị mất. Chốt giờ lặp an toàn; thanh toán lặp trả hóa đơn đã có, không tăng lượt voucher lần hai.

Client chỉ gửi `expectedTotal` để phát hiện báo giá cũ; server tự tính mọi khoản từ giá đã lưu và dịch vụ trong DB. Tiền khách đưa ≥ tổng. Chuyển khoản cần xác nhận đã nhận tiền; QR không là bằng chứng thanh toán.

## Báo cáo

Khoảng ngày báo cáo gồm cả hai ngày theo Việt Nam; query DB dùng `[đầu ngày from, đầu ngày to + 1 ngày)`. Ngày tính doanh thu là ngày thanh toán, không phải ngày mở. Chỉ Invoice có session PAID mới tính. Thuần = giờ + dịch vụ − mọi giảm giá; không dùng tiền khách đưa để tính doanh thu. Tối đa chênh lệch 365 ngày, nên có thể bao gồm 366 ngày lịch khi tính cả hai đầu.

## Một số mã API

| HTTP | Code | Ý nghĩa |
|---|---|---|
| 400 | VALIDATION_ERROR | Sai kiểu/định dạng/biên; có fieldErrors |
| 400 | BOOKING_DATE / BOOKING_LEAD_TIME / BOOKING_HOURS | Lịch ngoài điều kiện cho phép |
| 400 | CHECKIN_WINDOW | Chưa/không còn trong cửa sổ check-in |
| 400 | INVALID_RATES / INVALID_RATE | Khung giá hở, chồng, ngoài biên |
| 400 | INSUFFICIENT_PAYMENT | Khách đưa thiếu |
| 401 | UNAUTHENTICATED / INVALID_CREDENTIALS | Chưa đăng nhập/sai tài khoản |
| 403 | FORBIDDEN / INVALID_ORIGIN | Không đủ quyền/nguồn yêu cầu sai |
| 409 | TABLE_BUSY / TABLE_RESERVED | Bàn đang có khách/đang giữ |
| 409 | BOOKING_CONFLICT / PENDING_BOOKING_EXISTS | Trùng lịch/đã có đơn chờ |
| 409 | GRACE_EXPIRED / SESSION_LOCKED | Không còn cho phép thao tác |
| 409 | VOUCHER_UNAVAILABLE / QUOTE_CHANGED | Voucher hết hiệu lực/báo giá thay đổi |
| 409 | TRANSACTION_BUSY | Hết số lần retry, cho phép người dùng thử lại |
| 409 | DUPLICATE | Điện thoại/email/mã hoặc tài nguyên đã tồn tại |
