export type PinboardAsk = string

declare module 'claude-code' {
  interface PluginState {
    pinboard: { ask: PinboardAsk }
  }
}
