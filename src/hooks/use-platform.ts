import { useMemo } from 'react'
import { Capacitor } from '@capacitor/core'

interface PlatformFeatures {
  /** Running inside Capacitor native shell */
  isNative: boolean
  /** Running in a web browser */
  isWeb: boolean
  /** iOS native */
  isIOS: boolean
  /** Android native */
  isAndroid: boolean
  /** Native camera available */
  camera: boolean
  /** Push notifications available */
  push: boolean
  /** Biometric auth available */
  biometrics: boolean
  /** Native share sheet available */
  nativeShare: boolean
}

export function usePlatform(): PlatformFeatures {
  return useMemo(() => {
    const isNative = Capacitor.isNativePlatform()
    const platform = Capacitor.getPlatform()
    const isIOS = platform === 'ios'
    const isAndroid = platform === 'android'

    return {
      isNative,
      isWeb: !isNative,
      isIOS,
      isAndroid,
      camera: isNative,
      push: isNative,
      biometrics: isNative,
      nativeShare: isNative || 'share' in navigator,
    }
  }, [])
}
