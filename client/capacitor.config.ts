import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'uz.finmodel.app',
  appName: 'FinModel ERP',
  webDir: 'dist',
  server: {
    url: 'https://finmodel-erp-uz.vercel.app',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
};

export default config;
