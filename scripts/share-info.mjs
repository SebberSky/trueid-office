#!/usr/bin/env node
/**
 * Share URLs for the office host (agent3 / fixed Tailscale IP).
 * Override with: HOST_IP=x.x.x.x PORT=5173 npm run share-info
 */
const PORT = process.env.PORT || '5173'
const HOST = process.env.HOST_IP || '100.67.207.114'

console.log(`
TrueID Office — โฮสต์หลัก
────────────────────────────────────────
คนอื่นเปิด (Tailscale):  https://${HOST}:${PORT}/
  (ถ้าโฮสต์ยังรันแค่ HTTP ชั่วคราว: http://${HOST}:${PORT}/)

เครื่องโฮสต์เอง:         https://localhost:${PORT}/

สำคัญ
• โฮสต์ = agent3s-imac (${HOST}) — อย่าส่ง IP เครื่องอื่น
• ไมค์/แชร์จอต้องเป็น https:// (บนโฮสต์รันโค้ดล่าสุดที่มี basic-ssl)
• ครั้งแรกกด Advanced → Proceed ที่คำเตือนใบรับรอง
• โฮสต์ต้องรัน npm run dev ค้างไว้
`)
