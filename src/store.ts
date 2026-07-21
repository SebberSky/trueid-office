import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import type { AppScreen, CharacterLook, UserSession } from './types'
import { normalizeAnimalKind } from './types'
import { DEFAULT_LOOK } from './character/drawCharacter'
import { fetchAppearance, putAppearance } from './net/OfficeSocket'

const ALLOWED_DOMAINS = ['truedigital.com', 'muze.co.th']

function normalizeLook(look: CharacterLook): CharacterLook {
  return {
    ...look,
    animalKind: normalizeAnimalKind(look.animalKind),
    displayName: look.displayName.trim().slice(0, 10),
  }
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
  loginError: string | null
  loginBusy: boolean
  setDraftLook: (patch: Partial<CharacterLook>) => void
  login: (email: string) => Promise<boolean>
  saveCharacter: () => void
  logout: () => void
  goWorld: () => void
  goCreator: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      screen: 'login',
      session: null,
      draftLook: { ...DEFAULT_LOOK },
      loginError: null,
      loginBusy: false,

      setDraftLook: (patch) =>
        set((s) => ({ draftLook: { ...s.draftLook, ...patch } })),

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
        try {
          remote = await fetchAppearance(trimmed)
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

      logout: () =>
        set({
          session: null,
          screen: 'login',
          loginError: null,
          loginBusy: false,
          draftLook: { ...DEFAULT_LOOK },
        }),

      goWorld: () => set({ screen: 'world' }),
      goCreator: () => set({ screen: 'creator' }),
    }),
    {
      name: 'trueid-office-session',
      partialize: (s) => ({ session: s.session, draftLook: s.draftLook, screen: s.screen }),
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
        }
      },
    },
  ),
)
