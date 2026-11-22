// Brug naar de echte iPhone/Android-onderdelen (aankopen, reclame, trillen).
// Dit bestand wordt met esbuild gebundeld naar www/vendor/native.js (npm run build:native).
// In de browser vallen de onderdelen terug op testmodus; op een telefoon praten ze met iOS/Android.
import { Capacitor } from '@capacitor/core';
import { AdMob } from '@capacitor-community/admob';
import { Purchases } from '@revenuecat/purchases-capacitor';
import { Haptics } from '@capacitor/haptics';

window.NativePlugins = { Capacitor, AdMob, Purchases, Haptics };
