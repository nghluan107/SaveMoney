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

## Cấu trúc

| File | Nội dung |
|---|---|
| `index.html` | Bố cục trang |
| `styles.css` | Giao diện, màu Sáng / Tối |
| `app.js` | Xử lý dữ liệu, biểu đồ |
| `build.ps1` | Gộp 3 file trên thành `dist/so-thu-chi.html` (một file duy nhất) |
