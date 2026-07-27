import { defineNpc } from '../define'
import type { InteractConfig } from '../interact/types'

/** Public synthetic demo sheet — not real business metrics. */
const REPORT_SHEET_ID = '1wfAaSKJviI4K8MfTHGXRbVcyoMIPgl5_JA1H6flYx4w'

const reportFields = {
  month: 'Month',
  newSubs: 'New Subscribers',
  cancelled: 'Cancelled',
  netGrowth: 'Net Growth',
  active: 'Active Subscribers',
  conversion: 'Conversion Rate',
  churn: 'Churn Rate',
  mrr: 'MRR (USD)',
  arpu: 'ARPU (USD)',
}

/**
 * Mixed dialogue demo: hub menu + linear gossip chain + random one-liners,
 * plus a data-backed branch that reads a live Google Sheet report.
 */
const janitorInteract: InteractConfig = {
  startNode: 'hub',
  nodes: {
    hub: {
      id: 'hub',
      say: 'เอ้ย คุณ{displayName} แวะมาคุยด้วยเหรอ? วันนี้แม่บ้านได้ยินเรื่องในออฟฟิศเพียบเลย…',
      choices: [
        { id: 'random', label: 'ขอเรื่องสุ่มหน่อยสิ', next: 'random_pool' },
        { id: 'story', label: 'เล่าเรื่องออฟฟิศให้ฟังยาวๆ', next: 'linear_1' },
        { id: 'topics', label: 'เลือกเรื่องเอง', next: 'topics' },
        { id: 'leak', label: 'ได้ยินว่าเธอเห็นแฟ้มลับของบริษัท…', next: 'leak_tease' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    leak_tease: {
      id: 'leak_tease',
      say: 'ชู่ว์… เบาเสียงหน่อยคุณ{displayName}! เมื่อเช้าแม่บ้านเก็บกวาดห้องประชุมใหญ่ แล้วเจอแฟ้มรายงานยอดสมาชิกวางทิ้งไว้บนโต๊ะ ยังไม่ได้เอาไปคืนเลย… อยากรู้มั้ยล่ะ?',
      choices: [
        { id: 'latest', label: 'ขอดูเดือนล่าสุดพอ', next: 'leak_latest' },
        { id: 'all', label: 'ขอดูทุกเดือนเลย', next: 'leak_all' },
        { id: 'hub', label: 'ไม่ดีกว่า เดี๋ยวโดนไล่ออก', next: 'hub' },
      ],
    },
    leak_latest: {
      id: 'leak_latest',
      source: {
        type: 'api',
        provider: 'google-sheet',
        config: {
          sheetId: REPORT_SHEET_ID,
          row: 'last',
          fields: reportFields,
        },
      },
      loadingLabel: 'กำลังแอบเปิดแฟ้ม…',
      say: 'เอ้า ฟังนะ… เดือน {month} มีสมาชิกใหม่ {newSubs} คน ยกเลิกไป {cancelled} คน สุทธิโตขึ้น {netGrowth} คน ตอนนี้มีสมาชิกใช้งานอยู่ {active} คน\nรายได้ต่อเดือน {mrr} ดอลลาร์ เฉลี่ยหัวละ {arpu} ดอลลาร์ อัตราปิดการขาย {conversion} ส่วนคนหนีไป {churn}\n…แม่บ้านอ่านไม่ค่อยออกหรอกนะ แต่ตัวเลขมันเยอะดี',
      onError: {
        text: 'โอ๊ย… แฟ้มหาย! เมื่อกี้ยังวางอยู่ตรงนี้เลย สงสัยมีคนเอาไปเก็บแล้ว เดี๋ยวมาถามใหม่นะคุณ{displayName}',
      },
      choices: [
        { id: 'all', label: 'ขอดูทุกเดือนด้วย', next: 'leak_all' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    leak_all: {
      id: 'leak_all',
      source: {
        type: 'api',
        provider: 'google-sheet',
        config: {
          sheetId: REPORT_SHEET_ID,
          fields: reportFields,
          rowsTemplate: '• {month} — สมาชิกใช้งาน {active} คน (โตสุทธิ {netGrowth}) รายได้ {mrr} ดอลลาร์',
        },
      },
      loadingLabel: 'กำลังแอบถ่ายรูปแฟ้ม…',
      say: 'แม่บ้านแอบเปิดดูทั้ง {rowCount} เดือนเลยนะ ห้ามบอกใคร!\n{rows}\nเห็นมั้ยล่ะ… ยอดขึ้นทุกเดือนแบบนี้ ปีนี้โบนัสน่าจะดีนะ',
      onError: {
        next: 'leak_failed',
      },
      choices: [
        { id: 'latest', label: 'ขอดูเดือนล่าสุดชัดๆ', next: 'leak_latest' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    leak_failed: {
      id: 'leak_failed',
      say: 'เอ๊ะ… มีคนเดินมา! แม่บ้านรีบยัดแฟ้มกลับลิ้นชักไปแล้ว ไว้ตอนไม่มีคนค่อยมาใหม่นะคุณ{displayName}',
      choices: [
        { id: 'retry', label: 'ลองใหม่อีกที', next: 'leak_tease' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    random_pool: {
      id: 'random_pool',
      randomFrom: ['gossip_coffee', 'gossip_elevator', 'gossip_ac'],
    },
    gossip_coffee: {
      id: 'gossip_coffee',
      say: 'กาแฟชั้น 3 หมดตั้งแต่วันพุธนะ ใครๆ ก็แย่งกันไปต้มเอง…',
      choices: [
        { id: 'again', label: 'ฮาดี ขออีกเรื่อง', next: 'random_pool' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    gossip_elevator: {
      id: 'gossip_elevator',
      say: 'ลิฟต์ตึกนี้ช้ามากเลยวันนี้ ได้ยินว่ามีประชุมใหญ่ชั้นบน แน่นไปหมด',
      choices: [
        { id: 'again', label: 'เล่าต่ออีกได้มั้ย', next: 'random_pool' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    gossip_ac: {
      id: 'gossip_ac',
      say: 'แอร์โซนประชุมดังตุบๆ ทั้งวัน แม่บ้านคิดว่าจะมีคนเอาแฟ้มไปอุดรูแน่ๆ',
      choices: [
        { id: 'again', label: 'เจออีกมั้ย', next: 'random_pool' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    linear_1: {
      id: 'linear_1',
      say: 'เมื่อเช้าเจ้านายเดินผ่านด้วยหน้าบึ้ง ไม่รู้ใครโดนเรียกเข้าห้องอีก…',
      choices: [{ id: 'next', label: 'ต่อไป', next: 'linear_2' }],
    },
    linear_2: {
      id: 'linear_2',
      say: 'แล้วที่กาแฟชั้น 3 หมดอีกแล้ว คนจากฝ่ายขายยกไปยกมาเป็นทีม',
      choices: [{ id: 'next', label: 'ต่อไป', next: 'linear_3' }],
    },
    linear_3: {
      id: 'linear_3',
      say: 'สรุปวันนี้ซุบซิบยาวเลยนะ คุณ{displayName} ฟังจนเมื่อยยัง?',
      choices: [
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    topics: {
      id: 'topics',
      say: 'อยากฟังเรื่องไหนดีล่ะ?',
      choices: [
        { id: 'boss', label: 'เรื่องเจ้านาย', next: 'topic_boss' },
        { id: 'coworker', label: 'เรื่องเพื่อนร่วมงาน', next: 'topic_coworker' },
        { id: 'hub', label: 'กลับ', next: 'hub' },
      ],
    },
    topic_boss: {
      id: 'topic_boss',
      say: 'เจ้านายสั่งพิมพ์เอกสารสีทั้งชุด แล้วบอกว่า “ลองดูก่อน” — แม่บ้านเสียดายหมึกจัง',
      choices: [
        { id: 'more', label: 'มีอีกมั้ย', next: 'topic_boss_2' },
        { id: 'topics', label: 'เลือกเรื่องอื่น', next: 'topics' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    topic_boss_2: {
      id: 'topic_boss_2',
      say: 'ได้ยินว่าปฏิทินประชุมเต็มถึงเย็นวันศุกร์ ใครวางแผนไปเที่ยวก็เตรียมใจไว้',
      choices: [
        { id: 'topics', label: 'เลือกเรื่องอื่น', next: 'topics' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    topic_coworker: {
      id: 'topic_coworker',
      say: 'เพื่อนร่วมงานโซนหน้าต่างเอาต้นไม้มาวางเพียบ แม่บ้านรดน้ำให้ทุกเช้าเลยนะ',
      choices: [
        { id: 'more', label: 'แล้วไงต่อ', next: 'topic_coworker_2' },
        { id: 'topics', label: 'เลือกเรื่องอื่น', next: 'topics' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
    topic_coworker_2: {
      id: 'topic_coworker_2',
      say: 'มีคนลืมกล่องข้าวในตู้เย็นมาสามวัน แม่บ้านยังไม่กล้าเปิดดู…',
      choices: [
        { id: 'topics', label: 'เลือกเรื่องอื่น', next: 'topics' },
        { id: 'hub', label: 'กลับเมนู', next: 'hub' },
        { id: 'bye', label: 'ลาก่อน' },
      ],
    },
  },
}

/** Plaza greeter on ลานกิจกรรม — gossip interaction (Phase 2). */
export const janitorGossip = defineNpc({
  npcKey: 'janitor-gossip',
  look: {
    displayName: 'แม่บ้าน',
    hairStyle: 'bun',
    hairColor: '#3f2d20',
    topStyle: 'vest',
    topColor: '#55705b',
  },
  // Center of plaza-main (ลานกิจกรรม).
  spawn: { x: 42, y: 26 },
  roomId: 'plaza-main',
  tags: ['gossip', 'janitor'],
  interact: janitorInteract,
})
