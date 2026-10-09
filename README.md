# Cue Club — Quản lý quán Billiards

Ứng dụng tiếng Việt gồm khách hàng, thu ngân và quản trị; dữ liệu lưu trong PostgreSQL, cập nhật bàn qua Socket.io. Đây là mã nguồn ứng dụng chạy thật, không dùng dữ liệu giả hoặc localStorage để thay thế máy chủ.

## Chạy nhanh

Yêu cầu Node.js 22 và PostgreSQL 17+ có extension `btree_gist`.

```powershell
npm ci
Copy-Item .env.example .env
# Đặt JWT_SECRET ngẫu nhiên ít nhất 32 ký tự và SEED_ADMIN_PASSWORD trong .env.
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run dev
```

Nếu không có Docker: chạy `npm run db:local` trong terminal riêng. Công cụ này chạy PostgreSQL trên 127.0.0.1:5432, lưu dữ liệu ở `.data/postgres`, tạo `cueclub` và `cueclub_test` với UTF-8. Không chạy đồng thời với PostgreSQL khác dùng cùng cổng.

- Giao diện: http://localhost:3000
- API và Socket.io: http://localhost:4000
- Quản trị sau seed: `0900000000`, mật khẩu là `SEED_ADMIN_PASSWORD` trong `.env`.
- Seed có thể chạy lại: không ghi đè mật khẩu, bảng giá hoặc dữ liệu đang có.
- Khách hàng tự đăng ký từ màn hình đăng nhập; đăng ký không cho tự chọn vai trò.

Trong workspace Windows này đã có Node portable: `powershell -ExecutionPolicy Bypass -File scripts/local.ps1 -Task start`. Nếu chưa build, dùng `-Task build`; phát triển dùng `-Task dev`; cơ sở dữ liệu dùng `-Task db:local` ở terminal khác. `.env` hiện trỏ đến database UTF-8 cục bộ đã được khởi tạo. Các thư mục `.tools`, `.data`, `.env` được bỏ qua khỏi Git.

## Các chức năng

- Đăng ký/đăng nhập, băm mật khẩu bcrypt, cookie HttpOnly, phân quyền API CUSTOMER/CASHIER/ADMIN, giới hạn thử đăng nhập và kiểm tra nguồn yêu cầu.
- Sơ đồ 12 bàn mẫu, lọc khu vực/trạng thái, đồng hồ phiên, mở khách vãng lai hoặc thành viên, hủy mở nhầm, thêm/bớt dịch vụ.
- Đặt bàn D…D+7, lead-time 30 phút, thời lượng 30…360 phút theo bước 15, một lịch chờ/tài khoản, nhận bàn ±15 phút, tự hết hạn sau +15 phút.
- Chốt giờ, tính cước theo bảng giá đã chụp lúc mở, sinh nhật, hạn mức, voucher, tiền thừa, tiền mặt/chuyển khoản và hóa đơn bất biến.
- Quản trị các khung giá, tạo voucher có giới hạn lượt, báo cáo hóa đơn đã thanh toán và tải XLSX thật.
- Đồng bộ Socket.io giữa các phiên đăng nhập; tự tải lại dữ liệu khi kết nối lại và dự phòng polling 30 giây.

## Quyết định nghiệp vụ cần đọc

Chi tiết và ví dụ ở [docs/BUSINESS_RULES.md](docs/BUSINESS_RULES.md). Những điểm được chốt vì đề bài chưa quy định duy nhất:

1. Bỏ phần giây khi chọn block: 7:59 → 0 phút, 8:00 → 15 phút. Điều này đồng nghĩa phiên 5–7 phút cũng 0đ tiền giờ. Dịch vụ vẫn thu khi thanh toán thông thường.
2. Làm tròn tổng thời lượng một lần, phân bổ từ giờ mở qua các khung giá; không làm tròn riêng từng khung.
3. Sinh nhật trước; xét hạn mức trên tiền giờ sau giảm sinh nhật cộng dịch vụ; voucher áp dụng sau cùng.
4. Giờ đóng cửa 24:00 tự chốt phiên; nhân viên vẫn phải thanh toán để giải phóng bàn. Lịch đặt sắp đến không tự kết thúc phiên đang chơi; thu ngân xử lý trước khi nhận khách tiếp theo.
5. Tạo VietQR không tự chứng minh khách đã trả tiền. Thu ngân xác nhận chuyển khoản sau khi kiểm tra tài khoản.

## VietQR

Điền `VIETQR_BANK_BIN` (6 chữ số), `VIETQR_ACCOUNT`, `VIETQR_ACCOUNT_NAME` trong `.env`, khởi động lại API. Mã QR dùng tổng do server tính, nội dung tham chiếu phiên và URL encode. Chỉ sinh QR với hóa đơn >0đ. Khi thiếu cấu hình, giao diện hiển thị rõ thay vì tạo tài khoản mẫu.

Sử dụng [VietQR Quick Link chính thức](https://www.vietqr.io/en/danh-sach-api/link-tao-ma-nhanh/). Số tài khoản, tên chủ tài khoản, số tiền và tham chiếu hóa đơn được gửi tới dịch vụ ảnh VietQR khi hiển thị QR. Chưa tích hợp webhook ngân hàng hay đối soát tự động.

## Kiểm thử

```powershell
npm run typecheck
npm test
# Chỉ dùng database thử nghiệm có tên kết thúc bằng _test.
$env:DATABASE_URL = 'postgresql://cue:cue_local_password@localhost:5432/cueclub_test?schema=public'
npm run db:migrate
npm run test:integration
Remove-Item Env:DATABASE_URL
# Khởi động ứng dụng và seed admin trước khi chạy E2E.
npx playwright install chromium
npm run test:e2e
```

Integration tests xóa fixtures trong database `_test`; không dùng database vận hành. E2E tạo bàn và khách riêng, rồi dọn đúng các bản ghi đó. Không chạy các bộ này đồng thời trên cùng database thử nghiệm.

Kết quả kiểm chứng và ma trận phân vùng/biên: [docs/QA.md](docs/QA.md). `npm test` chặn CI nếu bất kỳ chỉ số coverage nào của `lib/billing.ts` dưới 100%. Con số này không phải coverage toàn hệ thống.

## Kiến trúc

```text
app/                       Next.js App Router + Tailwind + Framer Motion
components/ui/             Button/Dialog theo mẫu shadcn, Radix accessibility
lib/billing.ts             Thuật toán cước thuần, không I/O
lib/validation.ts          Zod, ràng buộc thời gian và dữ liệu
server/app.ts              Express REST API, auth, báo cáo và Excel
server/operations.ts       Mở bàn, snapshot giá, bảo trì hết hạn/đóng cửa
server/db.ts               Serializable transaction + advisory lock + retry
server/index.ts            Socket.io và lịch bảo trì mỗi 10 giây
prisma/                    Schema, migrations, seed
tests/                     Jest, Supertest/PostgreSQL, Playwright
```

Next.js 15.5 được dùng thay đề xuất 14 vì [chính sách hỗ trợ](https://nextjs.org/support-policy); App Router vẫn giữ nguyên. Phiên bản thực tế được khóa trong `package-lock.json`. Prisma 6 và PostgreSQL bảo vệ cả tầng ứng dụng lẫn ràng buộc cơ sở dữ liệu.

Toàn bộ thao tác thay đổi vận hành lấy cùng advisory lock trong transaction Serializable, nên có thứ tự khóa thống nhất. Lỗi `P2034` được thử lại tối đa 5 lần với backoff+jitter, rồi trả `409 TRANSACTION_BUSY`. Unique index một phiên hoạt động/bàn, một lịch chờ/tài khoản và exclusion constraint chống lịch chồng lấn bảo vệ thêm ở DB. Voucher và hóa đơn được cập nhật cùng transaction; session ID là khóa chống thanh toán lặp. Xem [tài liệu transaction Prisma](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions).

## Build và triển khai

```powershell
npm run build
npm start
```

Build hiện tạo trang chính tĩnh, khoảng 187 kB JavaScript lần tải đầu. Đây là số liệu build, không phải cam kết tốc độ mạng hay tải đồng thời.

Trước khi dùng với dữ liệu thật: dùng PostgreSQL được sao lưu, secret/mật khẩu riêng, HTTPS, đặt `WEB_ORIGIN` và `NEXT_PUBLIC_API_URL` đúng domain (cùng site để cookie SameSite hoạt động), chạy migration bằng tài khoản có quyền tạo `btree_gist`. `NEXT_PUBLIC_API_URL` cần có trước build. API mặc định bind loopback; reverse proxy chuyển tiếp HTTP và WebSocket đến cổng 4000. Không tự động seed mật khẩu mẫu trên production.

Thiết kế hiện phù hợp một quán, một tiến trình API. Advisory lock toàn quán ưu tiên tính đúng hơn thông lượng; khi mở rộng nhiều quán/máy chủ cần khóa theo quán và Socket.io adapter liên tiến trình. Chưa có kiểm thử tải lớn, kiểm toán bảo mật độc lập hoặc triển khai hosting công khai.
