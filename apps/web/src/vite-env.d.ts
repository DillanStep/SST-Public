/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_SST_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare const __SST_WEB_VERSION__: string
