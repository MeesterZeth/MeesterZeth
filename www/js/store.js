// Verdienmodel: in-app aankopen en (optionele) advertenties.
//
// In de browser draait alles in TESTMODUS: aankopen en reclame worden gesimuleerd.
// In de echte app (Capacitor op iOS/Android) worden de native plugins gebruikt:
//   - RevenueCat  (@revenuecat/purchases-capacitor) voor App Store / Google Play aankopen
//   - AdMob       (@capacitor-community/admob)       voor beloonde video's en tussenadvertenties
// Zie docs/APP-STORE-STAPPEN.md voor het instellen van de sleutels en product-ID's.
import * as storage from './storage.js';

export const CONFIG = {
  revenueCatApiKeyIOS: 'appl_VUL_HIER_JE_SLEUTEL_IN',
  revenueCatApiKeyAndroid: 'goog_VUL_HIER_JE_SLEUTEL_IN',
  // Google-testadvertenties. Vervang door je eigen AdMob-ID's vóór publicatie.
  admobRewardedIOS: 'ca-app-pub-3940256099942544/1712485313',
  admobInterstitialIOS: 'ca-app-pub-3940256099942544/4411468910',
  admobRewardedAndroid: 'ca-app-pub-3940256099942544/5224354917',
  admobInterstitialAndroid: 'ca-app-pub-3940256099942544/1033173712',
  interstitialEvery: 3, // na elke 3e gespeelde level (alleen gratis versie)
};

export const PRODUCTS = {
  premium: {
    id: 'nl.meesterzeth.eilandrijk.premium',
    title: 'Premium',
    icon: '👑',
    price: '€ 3,99',
    desc: 'Alle 30 levels, geen advertenties en elke level +15 startgoud.',
  },
  colors: {
    id: 'nl.meesterzeth.eilandrijk.kleuren',
    title: 'Kleurenpakket',
    icon: '🎨',
    price: '€ 1,99',
    desc: 'Speel met 5 extra rijkskleuren. Puur voor de looks.',
  },
};

export const COLORS = [
  { id: 'blauw', name: 'Blauw', value: '#2f7de1', pack: false },
  { id: 'smaragd', name: 'Smaragd', value: '#12a37f', pack: true },
  { id: 'oranje', name: 'Oranje', value: '#f27a1a', pack: true },
  { id: 'roze', name: 'Roze', value: '#e0569b', pack: true },
  { id: 'zwart', name: 'Nacht', value: '#2b2d42', pack: true },
  { id: 'turkoois', name: 'Turkoois', value: '#0fb5c4', pack: true },
];

const cap = () => window.Capacitor;
export const isNative = () => !!(cap() && cap().isNativePlatform && cap().isNativePlatform());
const platform = () => (cap() && cap().getPlatform ? cap().getPlatform() : 'web');
const plugin = (...names) => {
  const P = cap() && cap().Plugins;
  if (!P) return null;
  for (const n of names) if (P[n]) return P[n];
  return null;
};
const Purchases = () => plugin('Purchases', 'PurchasesCapacitor');
const AdMob = () => plugin('AdMob');

let nativeProducts = {};
let mockAdUI = null; // functie(duurSeconden) -> Promise<boolean>, gezet door de UI

export function setMockAdUI(fn) { mockAdUI = fn; }

export function owns(productKey) {
  return storage.load().owned.includes(productKey);
}

function grant(productKey) {
  storage.update(s => { if (!s.owned.includes(productKey)) s.owned.push(productKey); });
}

function applyCustomerInfo(info) {
  const active = (info && info.entitlements && info.entitlements.active) || {};
  const ids = new Set([
    ...Object.keys(active),
    ...((info && info.allPurchasedProductIdentifiers) || []),
  ]);
  for (const [k, p] of Object.entries(PRODUCTS)) {
    if (ids.has(k) || ids.has(p.id)) grant(k);
  }
}

export async function init() {
  if (!isNative()) return;
  const P = Purchases();
  if (P) {
    try {
      const apiKey = platform() === 'ios' ? CONFIG.revenueCatApiKeyIOS : CONFIG.revenueCatApiKeyAndroid;
      await P.configure({ apiKey });
      const res = await P.getProducts({ productIdentifiers: Object.values(PRODUCTS).map(p => p.id) });
      for (const prod of (res && res.products) || []) {
        nativeProducts[prod.identifier] = prod;
        const entry = Object.values(PRODUCTS).find(p => p.id === prod.identifier);
        if (entry && prod.priceString) entry.price = prod.priceString; // prijs in lokale valuta
      }
      const info = await P.getCustomerInfo();
      applyCustomerInfo(info && (info.customerInfo || info));
    } catch (e) { console.warn('Aankopen niet beschikbaar', e); }
  }
  const A = AdMob();
  if (A && !owns('premium')) {
    try { await A.initialize({}); } catch (e) { console.warn('AdMob niet beschikbaar', e); }
  }
}

export async function purchase(productKey) {
  const prod = PRODUCTS[productKey];
  if (isNative() && Purchases()) {
    try {
      const res = await Purchases().purchaseStoreProduct({ product: nativeProducts[prod.id] });
      applyCustomerInfo(res && res.customerInfo);
      return owns(productKey);
    } catch (e) {
      console.warn('Aankoop geannuleerd of mislukt', e);
      return false;
    }
  }
  // Testmodus in de browser: direct toekennen, er wordt niets afgeschreven.
  grant(productKey);
  return true;
}

export async function restore() {
  if (isNative() && Purchases()) {
    try {
      const res = await Purchases().restorePurchases();
      applyCustomerInfo(res && (res.customerInfo || res));
    } catch (e) { console.warn('Herstellen mislukt', e); }
  }
  return Object.keys(PRODUCTS).filter(owns);
}

const adIds = () => (platform() === 'ios'
  ? { rewarded: CONFIG.admobRewardedIOS, inter: CONFIG.admobInterstitialIOS }
  : { rewarded: CONFIG.admobRewardedAndroid, inter: CONFIG.admobInterstitialAndroid });

// Beloonde video: speler kiest er zelf voor. Geeft true als de beloning verdiend is.
export async function showRewardedAd() {
  if (isNative() && AdMob()) {
    try {
      await AdMob().prepareRewardVideoAd({ adId: adIds().rewarded });
      const reward = await AdMob().showRewardVideoAd();
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
  if (isNative() && AdMob()) {
    try {
      await AdMob().prepareInterstitial({ adId: adIds().inter });
      await AdMob().showInterstitial();
    } catch (e) { console.warn('Reclame niet beschikbaar', e); }
    return;
  }
  if (mockAdUI) await mockAdUI(3, false);
}
