declare global {
  const RAVENS_VERSION: string
  const RAVENS_CHANNEL: string
}

export const InstallationVersion = typeof RAVENS_VERSION === "string" ? RAVENS_VERSION : "local"
export const InstallationChannel = typeof RAVENS_CHANNEL === "string" ? RAVENS_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
