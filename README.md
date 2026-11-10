# 💰 Sổ Thu Chi Gia Đình

Website ghi lại các khoản thu chi hằng tháng và tiền tiết kiệm của gia đình, có biểu đồ minh họa và hai giao diện Sáng / Tối.

## Tính năng

- **Tổng quan:** tổng thu, tổng chi, số dư tháng, tổng tiết kiệm (so sánh với tháng trước); thanh ngân sách tháng.
- **Biểu đồ:** chi tiêu theo danh mục (biểu đồ tròn), thu & chi 6 tháng (biểu đồ cột), chi tiêu cộng dồn theo ngày so với tháng trước (biểu đồ đường), quỹ tiết kiệm 12 tháng.
- **Giao dịch:** thêm / sửa / xóa, lọc theo loại, danh mục, người ghi, tìm theo ghi chú.
- **Tiết kiệm:** mục tiêu (Quỹ khẩn cấp, Mua nhà, Du lịch…), tiến độ, số tiền cần gửi mỗi tháng để kịp hạn; lịch sử gửi / rút.
- **Cài đặt:** tên hai vợ chồng, ngân sách tháng, xuất / nhập dữ liệu (JSON), xuất giao dịch ra CSV để mở bằng Excel.
- Giao diện **Sáng / Tối**, dùng tốt trên điện thoại.

## Cách dùng

Mở file `index.html` bằng trình duyệt là chạy, không cần cài đặt. Cần có mạng để tải phông chữ và thư viện [Chart.js](https://www.chartjs.org/).

Dữ liệu được lưu trong trình duyệt (localStorage) của từng máy. Để dùng chung giữa hai máy, vào **Cài đặt → Xuất dữ liệu** rồi **Nhập dữ liệu từ file** trên máy kia.

## Đồng bộ giữa hai vợ chồng (Firebase)

Khi `firebase-config.js` có cấu hình, web yêu cầu đăng nhập Google và lưu dữ liệu trên Firebase Firestore: một người cập nhật thì người kia thấy ngay.

1. Vào https://console.firebase.google.com → **Create a project** (tắt Google Analytics cũng được).
2. **Build → Authentication → Get started → Sign-in method → Google → Enable → Save.**
3. **Authentication → Settings → Authorized domains → Add domain:** `nghluan107.github.io`.
4. **Build → Firestore Database → Create database** → chọn vùng `asia-southeast1` (Singapore) → **Start in production mode**.
5. **Firestore → Rules:** dán nội dung file `firestore.rules`, thay 2 email mẫu bằng email Google của vợ và chồng → **Publish**.
6. **Project settings (⚙️) → Your apps → Web (`</>`)** → đặt tên → **Register app** → sao chép đoạn `firebaseConfig` vào `firebase-config.js`:
   ```js
   window.FIREBASE_CONFIG = { apiKey: "...", authDomain: "...", projectId: "...", storageBucket: "...", messagingSenderId: "...", appId: "..." };
   ```
7. `git push` → mở web, đăng nhập Google. Vào **Cài đặt → Đưa dữ liệu đang có trên máy này lên kho chung** nếu đã nhập dữ liệu trước đó.

Các giá trị trong `firebaseConfig` không phải mật khẩu; dữ liệu được bảo vệ bằng Firestore Rules (chỉ 2 email trong danh sách mới đọc/ghi được).

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Bố cục trang |
| `styles.css` | Giao diện, màu Sáng / Tối |
| `app.js` | Xử lý dữ liệu, biểu đồ, đồng bộ |
| `firebase-config.js` | Cấu hình Firebase (để `null` nếu chỉ lưu trên máy) |
| `firestore.rules` | Quy tắc chỉ cho 2 email vợ chồng truy cập dữ liệu |
| `build.ps1` | Gộp 3 file trên thành `dist/so-thu-chi.html` (một file duy nhất) |
