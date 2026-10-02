import { SettingsPanel } from '@/components/SettingsPanel'

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-lg py-4">
      <h1 className="px-4 pb-2 font-display text-xl font-semibold sm:px-0">Settings</h1>
      <SettingsPanel />
    </div>
  )
}
