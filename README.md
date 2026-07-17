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

`pm2` อยู่ใน `devDependencies` แล้ว — Jenkins ใช้ `npx pm2` หลัง `npm ci` ไม่ต้องติด global  
(ออปชัน) ครั้งแรกบนเครื่องโฮสต์ถ้าอยากให้ขึ้นหลังรีบูต: `npx pm2 startup` แล้วทำตามที่มันบอก

ACL Tailscale ต้องมี `nodeAttrs` → `"attr": ["funnel"]` แล้ว

### Funnel บน macOS (ครั้งเดียวบน agent3)

Jenkins ไม่ได้อยู่ใน GUI session — คำสั่ง `tailscale funnel` จาก job จะขึ้นว่า start แต่ **config ไม่ค้าง**  
ติดตั้ง LaunchAgent ครั้งเดียวใน **Terminal บนหน้าจอเครื่อง** (user `agent3`):

```bash
cd ~/apps/trueid-office
bash scripts/install-funnel-agent.sh
npm run funnel:on
```

จากนั้นทุก Jenkins deploy จะ `touch .funnel-request` ให้ Agent เปิด Funnel ใน GUI session  
URL ต้องตอบ 2xx/3xx ไม่งั้น **build แดง** — ไม่นับว่า deploy สำเร็จถ้าเข้าจาก public ไม่ได้

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
