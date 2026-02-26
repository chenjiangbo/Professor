export type InterpretationMode = 'concise' | 'detailed' | 'none'

export const DEFAULT_INTERPRETATION_MODE: InterpretationMode = 'concise'
export const DEFAULT_INTERPRETATION_MODE_SETTING_KEY = 'default_interpretation_mode'

export function normalizeInterpretationMode(value: unknown): InterpretationMode {
  if (value === 'detailed') return 'detailed'
  if (value === 'none') return 'none'
  return 'concise'
}
