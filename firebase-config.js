// Cấu hình Firebase để đồng bộ dữ liệu giữa các máy.
// Để null => web chỉ lưu dữ liệu trên trình duyệt của từng máy.
// Các giá trị này KHÔNG phải mật khẩu: Firebase thiết kế để chúng nằm công khai trong web.
// Quyền đọc/ghi dữ liệu được khóa bằng Firestore Rules (xem file firestore.rules).
window.FIREBASE_CONFIG = null;
