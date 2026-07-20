import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.madamgy.app',
  appName: 'MadamGy',
  webDir: '../web/dist',
  plugins: {
    Keyboard: {
      resize: 'body',
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#FEF8F8',
      androidSplashResourceName: 'splash',
    },
  },
};

export default config;
