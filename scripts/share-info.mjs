#!/usr/bin/env node
/**
 * Share URLs for the office host (agent3).
 * Public guests use Tailscale Funnel (no VPN). Override with env if needed.
 */
const PORT = process.env.PORT || '5173'
const HOST = process.env.HOST_IP || '100.67.207.114'
const FUNNEL_HOST = process.env.FUNNEL_HOST || 'agent3s-imac.tail91abbd.ts.net'

console.log(`
TrueID Office — โฮสต์หลัก (agent3)
────────────────────────────────────────
คนนอก / ไม่ต้อง VPN:   https://${FUNNEL_HOST}/
  (Tailscale Funnel — ใบรับรอง trust ได้, ไมค์/แชร์จอใช้ได้)

ใน Tailscale (สำรอง):  http://${HOST}:${PORT}/
เครื่องโฮสต์เอง:         http://localhost:${PORT}/

สำคัญ
• โฮสต์รันผ่าน pm2 / Jenkins webhook → เปิด Funnel ให้เอง
• ส่งลิงก์ Funnel ให้เพื่อน — อย่าส่ง IP เครื่องตัวเอง
• รีสตาร์ทมือ: bash scripts/jenkins-restart.sh
`)
