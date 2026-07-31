export interface FeatureFlags {
  legacyGameBridge: boolean
}

export const featureFlags: Readonly<FeatureFlags> = Object.freeze({
  legacyGameBridge: true,
})
