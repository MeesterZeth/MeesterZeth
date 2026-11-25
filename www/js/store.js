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
  useTestAds: false,
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

// ---------- Diagnose: wat werkt er wel en niet op dit toestel? ----------
export const diag = {
  native: false, platform: 'web', plugins: '',
  purchases: 'niet gestart', products: [], customer: '',
  consent: 'niet gestart', att: 'niet gestart', ads: 'niet gestart',
  lastPurchase: '', lastAd: '', log: [],
};
let problem = { purchase: '', ad: '' };
export function lastProblem(kind) { return problem[kind] || ''; }
function logd(msg) {
  const t = new Date();
  diag.log.push(`${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')} ${msg}`);
  if (diag.log.length > 40) diag.log.shift();
}
const errText = e => {
  if (!e) return 'onbekend';
  const parts = [e.code, e.message, e.errorMessage, e.data && e.data.readableErrorCode, e.data && e.data.message].filter(Boolean);
  return parts.length ? parts.join(' | ') : String(e);
};
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`${label}: geen antwoord na ${Math.round(ms / 1000)} s`)), ms)),
  ]);
}

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
  if (!P) { diag.purchases = 'plugin niet gevonden'; return; }
  const apiKey = platform() === 'ios' ? CONFIG.revenueCatApiKeyIOS : CONFIG.revenueCatApiKeyAndroid;
  if (apiKey.includes('VUL_HIER')) { diag.purchases = 'sleutel niet ingevuld'; return; }
  diag.purchases = 'verbinden…';
  await withTimeout(P.configure({ apiKey }), 15000, 'RevenueCat configure');
  purchasesReady = true;
  diag.purchases = 'verbonden';
  logd('RevenueCat verbonden');
  await loadProducts();
  try {
    const info = await withTimeout(P.getCustomerInfo(), 15000, 'getCustomerInfo');
    const ci = info && (info.customerInfo || info);
    applyCustomerInfo(ci);
    diag.customer = Object.keys((ci && ci.entitlements && ci.entitlements.active) || {}).join(', ') || 'geen aankopen';
  } catch (e) { diag.customer = 'fout: ' + errText(e); logd('getCustomerInfo fout: ' + errText(e)); }
}

// Producten (opnieuw) ophalen bij Apple. Wordt ook aangeroepen bij het openen van de winkel.
export async function loadProducts() {
  const P = Purchases();
  if (!P || !purchasesReady) return;
  try {
    // Premium en Kleurenpakket zijn eenmalige aankopen, geen abonnementen.
    const res = await withTimeout(P.getProducts({ productIdentifiers: Object.values(PRODUCTS).map(p => p.id), type: 'NON_SUBSCRIPTION' }), 15000, 'getProducts');
    const list = (res && res.products) || [];
    for (const prod of list) {
      nativeProducts[prod.identifier] = prod;
      const entry = Object.values(PRODUCTS).find(p => p.id === prod.identifier);
      if (entry && prod.priceString) entry.price = prod.priceString; // prijs in lokale valuta
    }
    diag.products = list.map(p => `${p.identifier} ${p.priceString || ''}`);
    logd(`Producten gevonden: ${list.length}`);
  } catch (e) {
    diag.products = ['fout: ' + errText(e)];
    logd('getProducts fout: ' + errText(e));
  }
}

async function setupAds() {
  const A = AdMob();
  if (!A) { diag.ads = 'plugin niet gevonden'; return; }
  if (owns('premium')) { diag.ads = 'uit (Premium)'; return; }
  // 1. Google-toestemming (Europa). Toont alleen een venster als het nodig is.
  try {
    diag.consent = 'opvragen…';
    let info = await withTimeout(A.requestConsentInfo(), 20000, 'requestConsentInfo');
    diag.consent = `status ${info.status}, venster ${info.isConsentFormAvailable ? 'beschikbaar' : 'niet beschikbaar'}`;
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
      info = await A.showConsentForm();
      diag.consent += ` → na venster: ${info.status}`;
    }
    canShowAds = info.canRequestAds !== false;
    privacyOptionsRequired = info.privacyOptionsRequirementStatus === 'REQUIRED';
  } catch (e) {
    diag.consent = 'fout: ' + errText(e);
    logd('Toestemming fout: ' + errText(e));
    canShowAds = true; // buiten Europa of zonder venster: gewone (niet-gepersonaliseerde) reclame
  }
  // 2. Apple: mag de app volgen? (iOS 14+). Weigeren mag: dan krijg je niet-gepersonaliseerde reclame.
  if (platform() === 'ios') {
    try {
      const s1 = await A.trackingAuthorizationStatus();
      if (s1 && s1.status === 'notDetermined') await A.requestTrackingAuthorization();
      const s2 = await A.trackingAuthorizationStatus();
      diag.att = (s2 && s2.status) || 'onbekend';
    } catch (e) { diag.att = 'fout: ' + errText(e); logd('Volg-vraag fout: ' + errText(e)); }
  }
  // 3. Reclame starten.
  if (canShowAds) {
    diag.ads = 'starten…';
    await withTimeout(A.initialize({}), 20000, 'AdMob initialize');
    adsReady = true;
    diag.ads = `klaar${CONFIG.useTestAds ? ' (testreclame)' : ''}`;
    logd('AdMob gestart');
  } else {
    diag.ads = 'geen toestemming voor reclame';
  }
}

// Aankopen en reclame starten tegelijk en los van elkaar: hangt de een, dan werkt de ander gewoon.
export async function init() {
  diag.native = isNative();
  diag.platform = platform();
  diag.plugins = NP() ? Object.keys(NP()).join(', ') : 'geen (native.js niet geladen)';
  if (!isNative()) { diag.purchases = diag.ads = 'testmodus (browser)'; return; }
  logd('Start');
  await Promise.allSettled([
    setupPurchases().catch(e => { diag.purchases = 'fout: ' + errText(e); logd('Aankopen fout: ' + errText(e)); }),
    setupAds().catch(e => { diag.ads = 'fout: ' + errText(e); logd('Reclame fout: ' + errText(e)); }),
  ]);
}

// Geeft true terug als de aankoop gelukt is. Bij mislukken: zie lastProblem('purchase').
export async function purchase(productKey) {
  const prod = PRODUCTS[productKey];
  problem.purchase = '';
  if (isNative()) {
    const P = Purchases();
    if (!P || !purchasesReady) { problem.purchase = 'notReady'; diag.lastPurchase = 'winkel niet verbonden'; return false; }
    if (!nativeProducts[prod.id]) await loadProducts();
    const storeProduct = nativeProducts[prod.id];
    if (!storeProduct) { problem.purchase = 'noProduct'; diag.lastPurchase = `${prod.id} niet gevonden bij Apple`; return false; }
    try {
      const res = await P.purchaseStoreProduct({ product: storeProduct });
      applyCustomerInfo(res && res.customerInfo);
      diag.lastPurchase = `gelukt: ${prod.id}`;
      if (!owns(productKey)) grant(productKey); // betaald bij Apple = toegang, ook als het recht nog niet doorkomt
      return true;
    } catch (e) {
      const cancelled = e && (e.userCancelled || (e.data && e.data.userCancelled) || e.code === '1');
      problem.purchase = cancelled ? 'cancelled' : 'error';
      diag.lastPurchase = (cancelled ? 'geannuleerd' : 'fout: ') + (cancelled ? '' : errText(e));
      logd('Aankoop: ' + diag.lastPurchase);
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
    problem.ad = '';
    if (!A || !adsReady) { problem.ad = 'notReady'; diag.lastAd = 'reclame niet gestart: ' + diag.ads; return false; }
    try {
      await withTimeout(A.prepareRewardVideoAd({ adId: adIds().rewarded }), 20000, 'reclame laden');
      const reward = await A.showRewardVideoAd();
      diag.lastAd = 'beloonde video bekeken';
      return !!reward;
    } catch (e) {
      problem.ad = 'error';
      diag.lastAd = 'fout: ' + errText(e);
      logd('Reclame: ' + diag.lastAd);
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

// Opnieuw proberen (vanuit het scherm met technische info).
export async function retry() {
  logd('Opnieuw proberen');
  if (!purchasesReady) await setupPurchases().catch(e => { diag.purchases = 'fout: ' + errText(e); });
  else await loadProducts();
  if (!adsReady) await setupAds().catch(e => { diag.ads = 'fout: ' + errText(e); });
}
