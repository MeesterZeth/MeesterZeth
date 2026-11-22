// Brug naar de echte iPhone-onderdelen: opslag, reclame, trillen, statusbalk.
// Wordt met esbuild gebundeld naar www/vendor/native.js (npm run build:native).
// In de browser vallen alle onderdelen terug op testmodus; op de iPhone praten ze met iOS.
import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { Haptics } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { StatusBar } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

window.NativePlugins = { Capacitor, AdMob, Haptics, Preferences, StatusBar, SplashScreen };
