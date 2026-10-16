export type MissedHost = boolean

declare module 'claude-code' {
  interface PluginState {
    noti: { hostsAsk: MissedHost }
  }
}
