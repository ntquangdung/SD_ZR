# FB Pulse Tracker

Ứng dụng React/TypeScript dùng để đọc dữ liệu hoạt động Facebook từ file ZIP hoặc JSON, tổng hợp comment/reaction/media và xuất báo cáo Excel.

## Chức năng chính

- Nhập trực tiếp file ZIP Facebook Takeout hoặc file JSON tương thích.
- Nhận diện comment văn bản, comment có media và reaction của comment/bài viết.
- Khôi phục `Post URL` từ dữ liệu URL thật trong gói Facebook khi nguồn không cung cấp link trực tiếp cho comment.
- Lọc, thống kê và hiển thị dữ liệu theo tài khoản.
- Xuất Excel Unicode, hạn chế lỗi font tiếng Việt và loại bỏ các dòng trống không có dữ liệu.
- Đăng nhập và lưu dữ liệu ứng dụng bằng Firebase.

> Lưu ý: Facebook Takeout thường không cung cấp `comment_id`. Vì vậy, URL bài viết có thể được ghép theo dữ liệu nhóm và thời gian gần nhất; ứng dụng không tự tạo URL comment giả.

### Quy tắc ghép Post URL

- Chỉ ghép từ reaction của bài viết thuộc đúng tài khoản và đúng tên nhóm.
- Ưu tiên reaction gần thời điểm comment nhất; tối đa 7 ngày. Các kết quả quá 1 giờ được đánh dấu độ tin cậy thấp trong dữ liệu nội bộ.
- Một bài viết có thể có nhiều comment, vì vậy cùng một Post URL được phép xuất hiện ở nhiều dòng và không bị xóa khi trùng.
- Nếu gói Facebook không có reaction phù hợp, Post URL được để trống thay vì tạo link giả.

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
