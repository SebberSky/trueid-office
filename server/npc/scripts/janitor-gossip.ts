import { defineNpc } from '../define'
import type { InteractConfig } from '../interact/types'

/**
 * Mixed dialogue demo: hub menu + linear gossip chain + random one-liners.
 * Phase 3 can attach `source: { type: 'api', provider: 'google-sheet', ... }` on a node.
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
