// Verdienmodel: in-app aankopen en (optionele) advertenties.
//
// In de browser draait alles in TESTMODUS: aankopen en reclame worden nagespeeld.
// In de echte app (Capacitor op iOS/Android) worden de native plugins gebruikt via window.NativePlugins
// (zie src/native.js, gebundeld naar www/vendor/native.js):
//   - RevenueCat  (@revenuecat/purchases-capacitor) voor App Store / Google Play aankopen
//   - AdMob       (@capacitor-community/admob)       voor beloonde video's en tussenadvertenties
// Volgorde bij het opstarten (verplicht in Europa):
//   1. Google-toestemmingsvenster (UMP/GDPR) als dat nodig is
//   2. Apple-vraag "Sta toe dat Eilandrijk je volgt" (App Tracking Transparency)
//   3. Pas daarna advertenties laden
// Zie docs/APP-STORE-STAPPEN.md voor het instellen van de sleutels en product-ID's.
import * as storage from './storage.js';

export const CONFIG = {
  revenueCatApiKeyIOS: 'appl_iugDlKhqswxEmSGOMpRlrmlgEbf', // publieke RevenueCat-sleutel (mag in de app staan)
  revenueCatApiKeyAndroid: 'goog_VUL_HIER_JE_SLEUTEL_IN',
  // TESTMODUS VOOR RECLAME: zet op false voor de versie die naar de App Store gaat.
  // Zolang dit true is, toont de app testreclame van Google (veilig voor TestFlight: kijken of
  // klikken op je eigen echte reclame kan je AdMob-account in de problemen brengen).
  useTestAds: true,
  // Eigen AdMob-advertentieblokken (Eilandrijk, iOS)
  admobRewardedIOS: 'ca-app-pub-8082305216822147/2710711129', // "Startgoud" (Beloond)
  admobInterstitialIOS: 'ca-app-pub-8082305216822147/2024315416', // "Tussen levels" (Interstitial)
  // Google-testadvertenties (worden gebruikt zolang useTestAds true is)
  testRewardedIOS: 'ca-app-pub-3940256099942544/1712485313',
  testInterstitialIOS: 'ca-app-pub-3940256099942544/4411468910',
  admobRewardedAndroid: 'ca-app-pub-3940256099942544/5224354917',
  admobInterstitialAndroid: 'ca-app-pub-3940256099942544/1033173712',
  interstitialEvery: 3, // na elke 3e gespeelde level (alleen gratis versie)
};

export const PRODUCTS = {
  premium: { id: 'nl.meesterzeth.eilandrijk.premium', price: '€ 3,99' },
  colors: { id: 'nl.meesterzeth.eilandrijk.kleuren', price: '€ 1,99' },
};

export const COLORS = [
  { id: 'blauw', name: 'Blauw', value: '#2f7de1', pack: false },
  { id: 'smaragd', name: 'Smaragd', value: '#12a37f', pack: true },
  { id: 'oranje', name: 'Oranje', value: '#f27a1a', pack: true },
  { id: 'roze', name: 'Roze', value: '#e0569b', pack: true },
  { id: 'zwart', name: 'Nacht', value: '#2b2d42', pack: true },
  { id: 'turkoois', name: 'Turkoois', value: '#0fb5c4', pack: true },
];

const NP = () => window.NativePlugins || null;
const cap = () => (NP() && NP().Capacitor) || window.Capacitor || null;
export const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
const platform = () => (cap() && cap().getPlatform ? cap().getPlatform() : 'web');
const Purchases = () => (isNative() && NP() ? NP().Purchases : null);
const AdMob = () => (isNative() && NP() ? NP().AdMob : null);

let nativeProducts = {};
let purchasesReady = false;
let adsReady = false;
let canShowAds = false;
let privacyOptionsRequired = false;
let mockAdUI = null; // functie(duurSeconden, beloond) -> Promise<boolean>, gezet door de UI

export function setMockAdUI(fn) { mockAdUI = fn; }

export function owns(productKey) {
  return storage.load().owned.includes(productKey);
}

function grant(productKey) {
  storage.update(s => { if (!s.owned.includes(productKey)) s.owned.push(productKey); });
}

function applyCustomerInfo(info) {
  if (!info) return;
  const active = (info.entitlements && info.entitlements.active) || {};
  const ids = new Set([...Object.keys(active), ...(info.allPurchasedProductIdentifiers || [])]);
  for (const [k, p] of Object.entries(PRODUCTS)) {
    if (ids.has(k) || ids.has(p.id)) grant(k);
  }
}

async function setupPurchases() {
  const P = Purchases();
  if (!P) return;
  const apiKey = platform() === 'ios' ? CONFIG.revenueCatApiKeyIOS : CONFIG.revenueCatApiKeyAndroid;
  if (apiKey.includes('VUL_HIER')) { console.warn('RevenueCat-sleutel nog niet ingevuld'); return; }
  await P.configure({ apiKey });
  purchasesReady = true;
  // Premium en Kleurenpakket zijn eenmalige aankopen, geen abonnementen.
  const res = await P.getProducts({ productIdentifiers: Object.values(PRODUCTS).map(p => p.id), type: 'NON_SUBSCRIPTION' });
  for (const prod of (res && res.products) || []) {
    nativeProducts[prod.identifier] = prod;
    const entry = Object.values(PRODUCTS).find(p => p.id === prod.identifier);
    if (entry && prod.priceString) entry.price = prod.priceString; // prijs in lokale valuta
  }
  const info = await P.getCustomerInfo();
  applyCustomerInfo(info && (info.customerInfo || info));
}

async function setupAds() {
  const A = AdMob();
  if (!A || owns('premium')) return;
  // 1. Google-toestemming (Europa). Toont alleen een venster als het nodig is.
  try {
    let info = await A.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') info = await A.showConsentForm();
    canShowAds = info.canRequestAds !== false;
    privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
  } catch (e) {
    console.warn('Toestemmingsvenster niet beschikbaar', e);
    canShowAds = true; // buiten Europa of zonder venster: gewone (niet-gepersonaliseerde) reclame
  }
  // 2. Apple: mag de app volgen? (iOS 14+). Weigeren mag: dan krijg je niet-gepersonaliseerde reclame.
  if (platform() === 'ios') {
    try {
      const s = await A.trackingAuthorizationStatus();
      if (s && s.status === 'notDetermined') await A.requestTrackingAuthorization();
    } catch (e) { console.warn('Volg-vraag niet beschikbaar', e); }
  }
  // 3. Reclame starten.
  if (canShowAds) {
    await A.initialize({});
    adsReady = true;
  }
}

export async function init() {
  if (!isNative()) return;
  try { await setupPurchases(); } catch (e) { console.warn('Aankopen niet beschikbaar', e); }
  try { await setupAds(); } catch (e) { console.warn('Reclame niet beschikbaar', e); }
}

// Geeft { ok, cancelled } terug.
export async function purchase(productKey) {
  const prod = PRODUCTS[productKey];
  if (isNative()) {
    const P = Purchases();
    const storeProduct = nativeProducts[prod.id];
    if (!P || !purchasesReady || !storeProduct) return false;
    try {
      const res = await P.purchaseStoreProduct({ product: storeProduct });
      applyCustomerInfo(res && res.customerInfo);
      return owns(productKey);
    } catch (e) {
      if (!(e && (e.userCancelled || (e.data && e.data.userCancelled)))) console.warn('Aankoop mislukt', e);
      return false;
    }
  }
  // Testmodus in de browser: direct toekennen, er wordt niets afgeschreven.
  grant(productKey);
  return true;
}

export async function restore() {
  const P = Purchases();
  if (P && purchasesReady) {
    try {
      const res = await P.restorePurchases();
      applyCustomerInfo(res && (res.customerInfo || res));
    } catch (e) { console.warn('Herstellen mislukt', e); }
  }
  return Object.keys(PRODUCTS).filter(owns);
}

// Moet de speler zijn reclame-toestemming kunnen wijzigen? (verplicht in Europa)
export function privacyOptionsAvailable() { return isNative() && privacyOptionsRequired; }
export async function showPrivacyOptions() {
  const A = AdMob();
  if (!A) return;
  try { await A.showPrivacyOptionsForm(); } catch (e) { console.warn('Privacyvenster niet beschikbaar', e); }
}

const adIds = () => {
  if (platform() !== 'ios') return { rewarded: CONFIG.admobRewardedAndroid, inter: CONFIG.admobInterstitialAndroid };
  if (CONFIG.useTestAds) return { rewarded: CONFIG.testRewardedIOS, inter: CONFIG.testInterstitialIOS };
  return { rewarded: CONFIG.admobRewardedIOS, inter: CONFIG.admobInterstitialIOS };
};

// Beloonde video: speler kiest er zelf voor. Geeft true als de beloning verdiend is.
export async function showRewardedAd() {
  if (isNative()) {
    const A = AdMob();
    if (!A || !adsReady) return false;
    try {
      await A.prepareRewardVideoAd({ adId: adIds().rewarded });
      const reward = await A.showRewardVideoAd();
      return !!reward;
    } catch (e) {
      console.warn('Reclame niet beschikbaar', e);
      return false;
    }
  }
  return mockAdUI ? mockAdUI(5, true) : true;
}

// Tussenadvertentie na elke paar levels, nooit voor Premium-spelers.
export async function maybeShowInterstitial() {
  if (owns('premium')) return;
  const played = storage.load().levelsPlayed;
  if (played === 0 || played % CONFIG.interstitialEvery !== 0) return;
  if (isNative()) {
    const A = AdMob();
    if (!A || !adsReady) return;
    try {
      await A.prepareInterstitial({ adId: adIds().inter });
      await A.showInterstitial();
    } catch (e) { console.warn('Reclame niet beschikbaar', e); }
    return;
  }
  if (mockAdUI) await mockAdUI(3, false);
}

// Trillen op de telefoon (licht of zwaar).
export function haptic(heavy = false) {
  const H = isNative() && NP() ? NP().Haptics : null;
  if (H && H.impact) { H.impact({ style: heavy ? 'HEAVY' : 'LIGHT' }).catch(() => {}); return; }
  if (navigator.vibrate) navigator.vibrate(heavy ? 40 : 15);
}
