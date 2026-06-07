import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mikeyjsa.elpresidente',
  appName: 'El Presidente',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
    allowNavigation: ['elpresidente-production.up.railway.app', '*.railway.app'],
  },
}

export default config
