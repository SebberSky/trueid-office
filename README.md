# TrueID Office

Virtual workspace สำหรับอีเมลองค์กร `@truedigital.com` และ `@muze.co.th`

## Features

- **Login** จำกัดโดเมนอีเมลองค์กร
- **สร้างตัวละคร** ชาย / หญิง / สัตว์ — ทรงผม สีผิว/ขน เสื้อ กางเกง (preview สมจริงขึ้น)
- **แมพ 3D** terrain มีความสูงตามประเภทพื้น (น้ำ ทราย หญ้า หิน กำแพง) + กล้อง third-person
- **ห้องจำกัดความจุ** Focus Pod, Meeting Room, Lounge, Huddle
- **ไมค์ + แชร์จอ** เมื่ออยู่ในห้อง (WebRTC)
- **แชท 2 ช่อง**
  - **Global** — ทั้งออฟฟิศ (BroadcastChannel)
  - **Room WebRTC** — เฉพาะคนในห้องเดียวกัน (RTCDataChannel)

## Run

```bash
npm install
npm run dev
```

Dev server ใช้ **HTTPS** (self-signed) เพื่อให้เบราว์เซอร์ขอสิทธิ์ไมค์ / แชร์จอได้เมื่อเปิดผ่าน IP ใน LAN  
ครั้งแรกให้กด **Advanced → Proceed** (หรือ Allow) ที่คำเตือนใบรับรอง แล้วใช้ลิงก์ `https://…` ที่ Vite แสดง — อย่าใช้ `http://`

เปิดสองแท็บด้วยอีเมลคนละอันเพื่อทดสอบเจอเพื่อนในแมพ คุยในห้อง และแชท

## Controls

- `WASD` หรือลูกศร — เดิน
- เข้าในพื้นที่ห้องเพื่อเปิดไมค์ / แชร์จอ / Room chat
- Global chat ใช้ได้ทุกที่ในแมพ
