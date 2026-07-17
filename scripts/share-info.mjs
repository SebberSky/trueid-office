#!/usr/bin/env node
/**
 * Share URLs for the office host (agent3).
 * Public guests use Tailscale Funnel (configured once on the host — not re-enabled by deploy).
 */
const PORT = process.env.PORT || '5173'
const HOST = process.env.HOST_IP || '100.67.207.114'
const FUNNEL_HOST = process.env.FUNNEL_HOST || 'agent3s-imac.tail91abbd.ts.net'

console.log(`
TrueID Office — โฮสต์หลัก (agent3)
────────────────────────────────────────
คนนอก / ไม่ต้อง VPN:   https://${FUNNEL_HOST}/
  (Tailscale Funnel — คอนฟิกค้างบนโฮสต์แล้ว)

ใน Tailscale (สำรอง):  http://${HOST}:${PORT}/
เครื่องโฮสต์เอง:         http://localhost:${PORT}/

สำคัญ
• โฮสต์รันผ่าน pm2 / Jenkins webhook (รีสตาร์ทแอปอย่างเดียว)
• Funnel ไม่ต้องเปิดใหม่ทุกครั้ง — คอนฟิกทิ้งไว้ที่เซิร์ฟเวอร์แล้ว
• ส่งลิงก์ Funnel ให้เพื่อน — อย่าส่ง IP เครื่องตัวเอง
• รีสตาร์ทมือ: bash scripts/jenkins-restart.sh
`)
