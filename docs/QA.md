# Kế hoạch và kết quả QA

Các ca kiểm thử dùng phân vùng tương đương (EP), phân tích giá trị biên (BVA), bảng quyết định ưu đãi, chuyển trạng thái và cạnh tranh đồng thời. Đây là áp dụng kỹ thuật kiểm thử, không phải tuyên bố chứng nhận ISO/ISTQB.

## Ma trận

| Miền | Phân vùng hợp lệ/không hợp lệ | Biên/ca đặc biệt |
|---|---|---|
| Họ tên | Unicode chữ + khoảng trắng / số, dấu, trống | 1, 2, 50, 51 |
| SĐT | 03/05/07/08/09 + 8 chữ số / đầu số khác, ký tự | 9, 10, 11 chữ số; trùng |
| Email | bỏ trống / đúng định dạng / sai | chuẩn hóa chữ thường, quá 100; unique DB |
| Mật khẩu | đủ 4 lớp / thiếu một lớp | 7, 8, 32, 33 |
| Ngày đặt | D…D+7 / trước D, sau D+7 | D−1, D, D+7, D+8 |
| Lead-time | ≥30 phút / nhỏ hơn | 30 phút−1ms, đúng 30 phút |
| Lưới giờ | 08–24, bước 15 / lệch lưới, ngoài giờ | 07:45, 08:00, 23:30+30, 23:45+30 |
| Thời lượng | 30…360 bội 15 / ngoài khoảng hoặc lẻ | 29,30,31,345,360,361 |
| Check-in | trong ±15 / ngoài | −15m−1ms, −15m, +15m, +15m+1ms |
| Hủy mở nhầm | OPEN, ≤180s / quá hạn | 179999,180000,180001 ms |
| Block tính tiền | <5, dư <8, dư ≥8 | 4:59,5,7:59,8,14,15,22:59,23 |
| Vắt khung | một khung / nhiều khung | 17:45–18:15,17:53–18:08,17:59:30 |
| Giá | 20k…500k bội 1k / ngoài biên, sai bước | 19999,20000,21000,499000,500000,501000 |
| Khung giá | phủ kín / gap / overlap / rỗng | lệch 1 phút, sai đầu/cuối, thứ tự ngược |
| Sinh nhật | trùng / không trùng / không có ngày sinh | chỉ giảm tiền giờ; subtotal đổi tầng |
| Hạn mức | <300k / 300k…499999 / ≥500k | 299999,300000,499999,500000,500001 |
| Voucher | 4–10 chữ hoa/số, còn hạn/lượt / sai | mã 3,4,10,11; giảm4,5,50,51; cap9999,10000 |
| Cộng dồn | birthday → tier → voucher | trần giảm, đơn tối thiểu bằng/thiếu1đ |
| Thanh toán | đủ/dư / thiếu / lặp | total−1,total,total+change, trả đồng thời |
| Báo cáo | from≤to≤D, ≤365 / đảo, tương lai, quá dài | 365/366 ngày; chỉ paid; export rỗng |
| Xung đột | một commit / yêu cầu còn lại lỗi409 | cùng bàn/cùng slot, cùng account/hai bàn, voucher cuối |

## Bằng chứng tự động

- `tests/unit/billing.test.ts`: giá, block, phân đoạn khung, giây, 24:00, sinh nhật, hạn mức, voucher và input lỗi. Coverage `lib/billing.ts`: 100% statements, branches, functions, lines.
- `tests/unit/validation.test.ts`: EP/BVA cho đăng ký, đặt bàn, voucher, báo cáo, múi giờ.
- `tests/unit/transactions.test.ts`: giả lập P2034 để xác minh retry thành công, hết giới hạn và lỗi không được retry. Giả lập này không phải phép đo deadlock trên tải sản xuất.
- `tests/integration/api.test.ts`: Supertest với PostgreSQL thật, 24 ca; gồm các Promise đồng thời đến Express, kiểm tra số bản ghi và trạng thái thực trong DB. Không mock Prisma trong nhóm này.
- `tests/e2e/flows.spec.ts`: 3 ca Chromium trên ứng dụng chạy thật; hai tab nhận trạng thái mới, thêm dịch vụ, thanh toán/tiền thừa, khách đăng ký/đặt/hủy, điều hướng quản trị, mobile 390px không tràn ngang. Fixtures có ID riêng và được dọn khi kết thúc.

Lần xác minh tại workspace: 140 unit tests, 24 integration tests, 3 E2E tests; typecheck và production build thành công. Các ảnh kiểm tra sinh trong `test-results/desktop.png` và `test-results/mobile.png`; coverage HTML ở `coverage/lcov-report/index.html`.

Không suy diễn coverage 100% thuật toán thành không có lỗi toàn hệ thống. Chưa chạy load test nhiều quán, Safari/Firefox, kiểm toán accessibility đầy đủ, xâm nhập bảo mật hoặc đối soát ngân hàng thật. Việc chọn ngưỡng sinh nhật/hạn mức, giây làm tròn và đuôi 24:00 được ghi rõ ở BUSINESS_RULES để người nghiệm thu đánh giá.
