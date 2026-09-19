# FB Pulse Tracker

Ứng dụng React/TypeScript dùng để đọc dữ liệu hoạt động Facebook từ file ZIP hoặc JSON, tổng hợp comment/reaction/media và xuất báo cáo Excel.

## Chức năng chính

- Nhập trực tiếp file ZIP Facebook Takeout hoặc file JSON tương thích.
- Nhận diện comment văn bản, comment có media và reaction của comment/bài viết.
- Khôi phục `Post URL` từ dữ liệu URL thật trong gói Facebook khi nguồn không cung cấp link trực tiếp cho comment.
- Lọc, thống kê và hiển thị dữ liệu theo tài khoản.
- Xuất Excel Unicode, hạn chế lỗi font tiếng Việt và loại bỏ các dòng trống không có dữ liệu.
- Báo cáo URL trùng trong Excel: thống kê số lần xuất hiện và liên kết tới đúng sheet/dòng/ô nguồn.
- Đăng nhập và lưu dữ liệu ứng dụng bằng Firebase.

> Lưu ý: Facebook Takeout thường không cung cấp `comment_id`. Vì vậy, URL bài viết có thể được ghép theo dữ liệu nhóm và thời gian gần nhất; ứng dụng không tự tạo URL comment giả.

### Quy tắc ghép Post URL

- Chỉ ghép từ reaction của bài viết thuộc đúng tài khoản và đúng tên nhóm.
- Ưu tiên reaction gần thời điểm comment nhất; tối đa 7 ngày. Các kết quả quá 1 giờ được đánh dấu độ tin cậy thấp trong dữ liệu nội bộ.
- Một bài viết có thể có nhiều comment, vì vậy cùng một Post URL được phép xuất hiện ở nhiều dòng và không bị xóa khi trùng.
- Nếu gói Facebook không có reaction phù hợp, Post URL được để trống thay vì tạo link giả.

### Báo cáo URL trùng trong Excel

Nhấn **Export tất cả** hoặc **Export theo lựa chọn**. Ngoài các sheet tài khoản như trước, file Excel có thêm:

- **URL trùng - Tổng hợp**: mỗi URL xuất hiện từ 2 lần trở lên, số lần xuất hiện, số comment/reaction, số tên tài khoản/lần nhập và liên kết đến chi tiết.
- **URL trùng - Chi tiết**: từng lần xuất hiện, tài khoản, mã lần nhập (Import ID), loại hoạt động, nội dung, thời gian, tên sheet, số dòng và ô URL. Nhấn liên kết vị trí để chuyển đến đúng ô cột G trong sheet tài khoản.

Báo cáo đối chiếu URL hợp lệ đang xuất ở cột **Comment URL / Post URL (G)**, sau khi áp dụng lựa chọn/bộ lọc xuất. URL được chuẩn hóa bằng cùng hàm với dữ liệu xuất; giữ nguyên tham số như `comment_id`, `reply_comment_id` và phần `#...`, không suy đoán các URL khác nhau là cùng bài viết. Không tính URL trống hoặc không hợp lệ.

Các dòng comment, comment media, reaction và reaction comment đều được giữ nguyên. **Trùng URL không có nghĩa là trùng bình luận**: nhiều hoạt động có thể cùng dẫn tới một bài viết, hoặc một dữ liệu được nhập nhiều lần. Báo cáo không xác nhận tính chính xác của link đã ghép hay trạng thái hiển thị trên Facebook. Vị trí là vị trí trong file Excel lúc xuất, không phải chỉ số record trong JSON; nên tra cứu trước khi tự sắp xếp, chèn hoặc xóa dòng. Nếu không có URL trùng, hai sheet sẽ thông báo rõ.

Do giới hạn hyperlink của Excel, báo cáo hỗ trợ tối đa 32.765 vị trí trùng mỗi lần xuất (mỗi vị trí có 2 liên kết). Nếu vượt giới hạn, ứng dụng thông báo để thu hẹp khoảng ngày/lựa chọn thay vì xuất thiếu dòng. Số tên tài khoản được tính theo tên hiển thị, không phải ID Facebook.

## Yêu cầu

- Node.js 22 trở lên
- npm
- Một Firebase Web App đã bật Authentication và Firestore

## Chạy local

```bash
npm ci
```

Sao chép `.env.example` thành `.env.local`, sau đó điền cấu hình Firebase Web App:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

Khởi chạy ứng dụng:

```bash
npm run dev
```

Vite sẽ hiển thị địa chỉ local, thường là `http://localhost:5173`.

## Kiểm tra trước khi phát hành

```bash
npm test
npm run lint
npm run build
```

## Triển khai GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` tự động build và deploy mỗi khi có commit mới trên nhánh `main`.

Trong repository GitHub, tạo sáu Actions Secrets có tên giống các biến `VITE_FIREBASE_*` trong `.env.example`. Không commit `.env.local`, dữ liệu Facebook, file ZIP, thư mục `dist` hoặc `node_modules`.

Sau khi bật **Settings → Pages → Source: GitHub Actions**, website mặc định của repository này là:

`https://ntquangdung.github.io/SD_ZR/`

## Cấu trúc chính

- `src/`: giao diện, xử lý dữ liệu và tích hợp Firebase.
- `src/utils/facebookImport.ts`: đọc dữ liệu Facebook ZIP/JSON.
- `src/utils/nativeJsonImport.ts`: đọc định dạng JSON nội bộ.
- `tools/`: công cụ chuyển đổi Excel/JSON và đóng gói ZIP.
- `.github/workflows/`: CI/CD cho GitHub Pages.
