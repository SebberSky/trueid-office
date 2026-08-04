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
| คนนอก / ไม่ติด Tailscale | **`https://agent3s-imac.taildc5084.ts.net/office/`** |
| เครื่องโฮสต์เอง | `http://localhost:5173/office/` |

```bash
npm run share-info
```

Webhook จะ: `npm ci` → `pm2 restart` (`dev`)  
**Tailscale Funnel** คอนฟิกค้างบนโฮสต์แล้ว — deploy ไม่ต้องเปิด Funnel ใหม่

## Jenkins (webhook → รีสตาร์ทโฮสต์)

Webhook ไม่ควรรัน `npm run dev` ตรงๆ ใน job (จบ job แล้ว process ตาย)  
ให้ Jenkins สั่ง **pm2 restart** บน agent3 แทน (รีสตาร์ทแอปอย่างเดียว)

### ครั้งแรกบน agent3 (Jenkins agent)

`pm2` อยู่ใน `devDependencies` แล้ว — Jenkins ใช้ `npx pm2` หลัง `npm ci` ไม่ต้องติด global  
(ออปชัน) ครั้งแรกบนเครื่องโฮสต์ถ้าอยากให้ขึ้นหลังรีบูต: `npx pm2 startup` แล้วทำตามที่มันบอก

Funnel / Tailscale ตั้งครั้งเดียวบนโฮสต์แล้วทิ้งไว้ — ไม่ผูกในสคริปต์ deploy  

**Poker ใช้ Funnel `:443` ร่วมโฮสต์อยู่แล้ว** — อย่า `funnel --https=443` ทับทั้งพอร์ต  
ให้ mount แค่ path `/office` บน 443 แล้วปิด `:8443` ของ Office:

```bash
# บน agent3 — ดูว่า Poker อยู่ที่ 443 และ Office อยู่ที่ 8443
tailscale funnel status

# เพิ่ม Office บน 443 โดยไม่แตะ root ของ Poker
sudo tailscale funnel --bg --https=443 --set-path=/office http://127.0.0.1:5173

# ปิด Funnel :8443 ของ Office (ถ้ามี)
sudo tailscale funnel --https=8443 off
# หรือถ้า mount แบบมี path: sudo tailscale funnel --https=8443 --set-path=/office off
```

จากนั้นเข้าได้ที่ **`https://agent3s-imac.taildc5084.ts.net/office/`** (ไม่มีพอร์ต)  
Poker ยังอยู่ที่ root ของ `https://agent3s-imac.taildc5084.ts.net/` ตามเดิม  
Funnel อนุญาตแค่พอร์ต `443` / `8443` / `10000` — แชร์พอร์ตด้วย `--set-path`

### Job

1. New Item → Pipeline  
2. Pipeline from SCM → repo นี้ → Script Path: `Jenkinsfile`  
3. (ออปชัน) ปลั๊กอิน **Generic Webhook Trigger** — สร้าง webhook URL แล้วยิงเข้าไปเมื่ออยากรีสตาร์ท  
   หรือผูก GitHub/Bitbucket hook ตอนมี push

Job จะทำ: `checkout` → `npm ci` → `pm2 start|restart trueid-office` แล้วจบ

รีสตาร์ทมือบนโฮสต์ (ชุดเดียวกับ webhook):

```bash
npm run restart:host
```

## Controls

- `WASD` หรือลูกศร — เดิน
- `Space` — กระโดด (visual เท่านั้น ไม่ข้ามกำแพง/terrain)
- ลูกกลมเมาส์ / `+` `−` — ซูมกล้อง
  - ถ้าชี้ที่ข้อความหรือรายการตัวเลือกในกล่องคุย NPC ที่ยังเลื่อนได้ ลูกกลมจะเลื่อนเนื้อหาแทนซูม (หัวข้อกล่อง / ขอบบน-ล่างของสกอร์ลยังซูมได้ตามปกติ)
- เข้าใกล้ NPC แล้ว `T` หรือคลิก — เปิดกล่องคุย (Esc ปิด)
- เข้าในพื้นที่ห้องเพื่อเปิดไมค์ / แชร์จอ / Room chat
- Global chat ใช้ได้ทุกที่ในแมพ
