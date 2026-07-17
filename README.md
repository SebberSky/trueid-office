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

## Run (โฮสต์ = agent3)

รันบนเครื่อง **`agent3s-imac`** (`100.67.207.114`) เท่านั้น:

```bash
npm install
npm run dev
```

### ให้คนอื่นเข้า

| ใคร | URL |
|-----|-----|
| คนอื่นใน Tailscale | **`https://100.67.207.114:5173/`** |
| คนที่นั่งที่เครื่องโฮสต์ | `https://localhost:5173/` |

```bash
npm run share-info
```

1. โฮสต์รัน `npm run dev` ค้างไว้ (ต้องเป็นโค้ดที่มี HTTPS / `@vitejs/plugin-basic-ssl`)
2. ส่งให้เพื่อนเฉพาะ **`https://100.67.207.114:5173/`** — อย่าส่ง IP เครื่องตัวเอง
3. ครั้งแรกกด **Advanced → Proceed**
4. ตอนนี้ถ้าเปิดแล้วเจอแค่ `http://…` แปลว่าโฮสต์ยังรัน build/preview แบบ HTTP เก่า → ให้อัปเดตโค้ดแล้วรัน `npm run dev` ใหม่

**หมายเหตุ:** บนเครื่องโฮสต์เองใช้ `localhost` อย่าเปิด IP ตัวเอง (macOS + HTTPS กับ LAN/Tailscale IP ของตัวเองมักพัง)

เปิดสองเครื่องด้วยอีเมลคนละอันเพื่อทดสอบ

## Jenkins (webhook → รีสตาร์ทโฮสต์)

Webhook ไม่ควรรัน `npm run dev` ตรงๆ ใน job (จบ job แล้ว process ตาย)  
ให้ Jenkins สั่ง **pm2 restart** บน agent3 แทน

### ครั้งแรกบน agent3 (Jenkins agent)

```bash
npm i -g pm2
pm2 startup   # ทำตามที่ pm2 บอก เพื่อให้ขึ้นหลังรีบูต
```

ใส่ label เครื่องนี้ใน Jenkins ว่า `agent3` (ให้ตรงกับ `Jenkinsfile`)

### Job

1. New Item → Pipeline  
2. Pipeline from SCM → repo นี้ → Script Path: `Jenkinsfile`  
3. (ออปชัน) ปลั๊กอิน **Generic Webhook Trigger** — สร้าง webhook URL แล้วยิงเข้าไปเมื่ออยากรีสตาร์ท  
   หรือผูก GitHub/Bitbucket hook ตอนมี push

Job จะทำ: `checkout` → `npm ci` → `pm2 start|restart trueid-office` แล้วจบ — แอปยังรันต่อใต้ pm2

รีสตาร์ทมือบนโฮสต์:

```bash
bash scripts/jenkins-restart.sh
```

## Controls

- `WASD` หรือลูกศร — เดิน
- เข้าในพื้นที่ห้องเพื่อเปิดไมค์ / แชร์จอ / Room chat
- Global chat ใช้ได้ทุกที่ในแมพ
