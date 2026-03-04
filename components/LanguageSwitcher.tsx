import type { AppLanguage } from '~/hooks/useAppLanguage'

type Props = {
  language: AppLanguage
  onChange: (language: AppLanguage) => void
}

export default function LanguageSwitcher({ language, onChange }: Props) {
  return (
    <select
      aria-label="Language switch"
      value={language}
      onChange={(e) => onChange(e.target.value as AppLanguage)}
      className="h-9 rounded-md border border-border-strong bg-white px-2 text-sm text-text-main dark:border-white/20 dark:bg-black/30 dark:text-white"
    >
      <option value="zh-CN">中文</option>
      <option value="en-US">English</option>
    </select>
  )
}
