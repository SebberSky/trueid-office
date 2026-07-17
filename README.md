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

รันบนเครื่อง **`agent3s-imac`** เท่านั้น — ปกติใช้ **Jenkins webhook / pm2** ไม่รัน `dev` มือซ้ำ

### ให้คนอื่นเข้า (ไม่ต้อง VPN)

| ใคร | URL |
|-----|-----|
| คนนอก / ไม่ติด Tailscale | **`https://agent3s-imac.tail91abbd.ts.net/`** |
| เครื่องโฮสต์เอง | `http://localhost:5173/` |

```bash
npm run share-info
```

Webhook จะ: `npm ci` → `pm2 restart` (`dev:funnel`) → เปิด Tailscale Funnel ให้อัตโนมัติ

## Jenkins (webhook → รีสตาร์ทโฮสต์)

Webhook ไม่ควรรัน `npm run dev` ตรงๆ ใน job (จบ job แล้ว process ตาย)  
ให้ Jenkins สั่ง **pm2 restart + Funnel** บน agent3 แทน

### ครั้งแรกบน agent3 (Jenkins agent)

```bash
npm i -g pm2
pm2 startup   # ทำตามที่ pm2 บอก เพื่อให้ขึ้นหลังรีบูต
```

ใส่ label เครื่องนี้ใน Jenkins ว่า `agent3` (ให้ตรงกับ `Jenkinsfile`)  
ACL Tailscale ต้องมี `nodeAttrs` → `"attr": ["funnel"]` แล้ว

### Job

1. New Item → Pipeline  
2. Pipeline from SCM → repo นี้ → Script Path: `Jenkinsfile`  
3. (ออปชัน) ปลั๊กอิน **Generic Webhook Trigger** — สร้าง webhook URL แล้วยิงเข้าไปเมื่ออยากรีสตาร์ท  
   หรือผูก GitHub/Bitbucket hook ตอนมี push

Job จะทำ: `checkout` → `npm ci` → `pm2 start|restart trueid-office` → `scripts/enable-funnel.sh` แล้วจบ

รีสตาร์ทมือบนโฮสต์ (ชุดเดียวกับ webhook):

```bash
npm run restart:host
```

## Controls

- `WASD` หรือลูกศร — เดิน
- `Space` — กระโดด (visual เท่านั้น ไม่ข้ามกำแพง/terrain)
- เข้าในพื้นที่ห้องเพื่อเปิดไมค์ / แชร์จอ / Room chat
- Global chat ใช้ได้ทุกที่ในแมพ
