export const runtimeConfig = {
  /** Single ravens backend URL — Vite proxies /ravens → ravens server */
  apiBaseUrl: import.meta.env.VITE_RAVENS_URL || '/ravens',
}
