export type InterpretationMode = 'concise' | 'detailed'

export const DEFAULT_INTERPRETATION_MODE: InterpretationMode = 'concise'
export const DEFAULT_INTERPRETATION_MODE_SETTING_KEY = 'default_interpretation_mode'

export function normalizeInterpretationMode(value: unknown): InterpretationMode {
  return value === 'detailed' ? 'detailed' : 'concise'
}
