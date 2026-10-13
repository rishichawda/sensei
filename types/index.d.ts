export type MapView = {
  topic: string | null
  ledger: unknown | null
  selected: string | null
}

declare module 'claude-code' {
  interface PluginState {
    sensei: { view: MapView }
  }
}
