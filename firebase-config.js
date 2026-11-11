// Cấu hình Firebase để đồng bộ dữ liệu giữa các máy.
// Để null => web chỉ lưu dữ liệu trên trình duyệt của từng máy.
// Các giá trị này KHÔNG phải mật khẩu: Firebase thiết kế để chúng nằm công khai trong web.
// Quyền đọc/ghi dữ liệu được khóa bằng Firestore Rules (xem file firestore.rules).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyB98xPz-YDFAmMQy2RDrB8tj-gp7dF_mm4",
  authDomain: "savemoney-77558.firebaseapp.com",
  projectId: "savemoney-77558",
  storageBucket: "savemoney-77558.firebasestorage.app",
  messagingSenderId: "1072118662698",
  appId: "1:1072118662698:web:e1a6dc1e9f005be50ee553"
};
