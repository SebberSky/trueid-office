import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { AppScreen, CharacterLook, Facing, UserSession } from './types'
import { normalizeAnimalKind } from './types'
import { DEFAULT_LOOK } from './character/drawCharacter'
import { fetchAppearance, putAppearance } from './net/OfficeSocket'

const ALLOWED_DOMAINS = ['truedigital.com', 'muze.co.th']

export type LastPose = { x: number; y: number; facing: Facing }

function normalizeLook(look: CharacterLook): CharacterLook {
  return {
    ...look,
    animalKind: normalizeAnimalKind(look.animalKind),
    displayName: look.displayName.trim().slice(0, 10),
  }
}

function normalizePose(raw: unknown): LastPose | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const x = Number(o.x)
  const y = Number(o.y)
  const facing = o.facing
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (facing !== 'down' && facing !== 'up' && facing !== 'left' && facing !== 'right') return null
  return { x, y, facing }
}

export function isAllowedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  const at = normalized.lastIndexOf('@')
  if (at < 1) return false
  const domain = normalized.slice(at + 1)
  return ALLOWED_DOMAINS.includes(domain)
}

interface AppState {
  screen: AppScreen
  session: UserSession | null
  draftLook: CharacterLook
  /** Server-remembered map pose for this email (cross-device). */
  lastPose: LastPose | null
  loginError: string | null
  loginBusy: boolean
  setDraftLook: (patch: Partial<CharacterLook>) => void
  setLastPose: (pose: LastPose | null) => void
  login: (email: string) => Promise<boolean>
  saveCharacter: () => void
  logout: (reason?: string) => void
  goWorld: () => void
  goCreator: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'login',
      session: null,
      draftLook: { ...DEFAULT_LOOK },
      lastPose: null,
      loginError: null,
      loginBusy: false,

      setDraftLook: (patch) =>
        set((s) => ({ draftLook: { ...s.draftLook, ...patch } })),

      setLastPose: (pose) => set({ lastPose: pose }),

      login: async (email) => {
        const trimmed = email.trim().toLowerCase()
        if (!isAllowedEmail(trimmed)) {
          set({
            loginError: 'ใช้อีเมล @truedigital.com หรือ @muze.co.th เท่านั้น',
            loginBusy: false,
          })
          return false
        }

        set({ loginBusy: true, loginError: null })
        let remote: CharacterLook | null = null
        let remotePose: LastPose | null = null
        try {
          const data = await fetchAppearance(trimmed)
          remote = data.look
          remotePose = normalizePose(data.lastPose)
        } catch {
          /* server down — fall back to local */
        }

        const existing = get().session
        const id = existing?.email === trimmed ? existing.id : nanoid(10)
        const fallbackName = trimmed.split('@')[0]

        if (remote) {
          const look = normalizeLook(remote)
          set({
            loginBusy: false,
            loginError: null,
            session: { id, email: trimmed, look },
            draftLook: look,
            lastPose: remotePose,
            screen: 'world',
          })
          return true
        }

        const look = normalizeLook(
          existing?.email === trimmed
            ? existing.look
            : { ...DEFAULT_LOOK, displayName: fallbackName },
        )

        set({
          loginBusy: false,
          loginError: null,
          session: { id, email: trimmed, look },
          draftLook: look,
          lastPose: existing?.email === trimmed ? get().lastPose : remotePose,
          screen: existing?.email === trimmed && look.displayName ? 'world' : 'creator',
        })
        return true
      },

      saveCharacter: () => {
        const { session, draftLook } = get()
        if (!session) return
        const name = draftLook.displayName.trim() || session.email.split('@')[0]
        const look = normalizeLook({ ...draftLook, displayName: name })
        set({
          session: { ...session, look },
          draftLook: look,
          screen: 'world',
        })
        void putAppearance(session.email, look)
      },

      logout: (reason) =>
        set({
          session: null,
          screen: 'login',
          loginError: reason ?? null,
          loginBusy: false,
          draftLook: { ...DEFAULT_LOOK },
          lastPose: null,
        }),

      goWorld: () => set({ screen: 'world' }),
      goCreator: () => set({ screen: 'creator' }),
    }),
    {
      name: 'trueid-office-session',
      partialize: (s) => ({
        session: s.session,
        draftLook: s.draftLook,
        screen: s.screen,
        lastPose: s.lastPose,
      }),
      merge: (persisted, current) => {
        const p = persisted as Partial<AppState> | undefined
        const session = p?.session
          ? { ...p.session, look: normalizeLook(p.session.look) }
          : current.session
        const draftLook = p?.draftLook ? normalizeLook(p.draftLook) : current.draftLook
        return {
          ...current,
          ...p,
          session,
          draftLook,
          lastPose: normalizePose(p?.lastPose) ?? current.lastPose,
        }
      },
    },
  ),
)
