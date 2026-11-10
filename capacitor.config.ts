import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.hourglass.planner',
  appName: 'Hourglass',
  webDir: 'dist',
  android: {
    backgroundColor: '#0d1a13',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_hourglass',
      iconColor: '#e56b55',
    },
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
