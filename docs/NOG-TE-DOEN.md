# Eilandrijk – nog te doen tot de App Store

Vink af wat klaar is. Bij elke stap staat wie wat doet.

## ✅ Al gedaan
- [x] Spel gemaakt, getest en verbeterd (versie 1.0.1)
- [x] Apple Developer-account, Paid Apps-overeenkomst, bankgegevens en belastingformulier
- [x] App aangemaakt in App Store Connect ("Eilandrijk: Strategie")
- [x] Eerste versie geüpload en via TestFlight op je eigen iPhone
- [x] Producten Premium en Kleurenpakket aangemaakt
- [x] Support- en privacypagina gemaakt

## 1. RevenueCat (aankopen) – jij, ± 30 min
- [x] Account en project "Eilandrijk" aanmaken op revenuecat.com
- [x] App toevoegen: App Store, bundle ID `nl.meesterzeth.eilandrijk`
- [x] In-App Purchase Key maken bij Apple (Users and Access → Integrations → In-App Purchase), het .p8-bestand downloaden en **goed bewaren**
- [x] .p8-bestand, Key ID en Issuer ID in RevenueCat zetten
- [x] Producten toevoegen: `nl.meesterzeth.eilandrijk.premium` en `nl.meesterzeth.eilandrijk.kleuren`
- [x] Rechten (entitlements) `premium` en `colors` aanmaken en koppelen aan de producten
- [x] De **publieke sleutel** (begint met `appl_`) naar Claude sturen

## 2. AdMob (reclame) – jij, ± 30 min
- [x] Account aanmaken op admob.google.com
- [x] App toevoegen: platform iOS, "Staat de app al in de winkel?" → Nee, naam Eilandrijk
- [x] Twee advertentie-eenheden maken: **Rewarded** (beloonde video) en **Interstitial** (tussenadvertentie)
- [ ] Bij **Privacy & messaging**: een **GDPR-bericht** (Europa) en een **IDFA-uitleg** (iOS) maken en publiceren
- [x] Het **App-ID** (`ca-app-pub-…~…`) en de **twee advertentie-ID's** (`ca-app-pub-…/…`) naar Claude sturen

## 3. Claude zet de sleutels in de app
- [x] Claude vult de RevenueCat-sleutel en de AdMob-ID's in
- [ ] **Vóór de App Store-versie:** in `www/js/store.js` `useTestAds: true` → `false` zetten (Claude doet dit), dan opnieuw uploaden

## 4. Nieuwe versie uploaden – jij, ± 20 min
- [ ] Nieuwe ZIP van GitHub downloaden, `www`, `src`, `scripts` en `package.json` vervangen
- [ ] In Terminal: `cd ~/Documents/eilandrijk` en `npm run ios:update`
- [ ] In Xcode bij **General** het **Build**-nummer met 1 ophogen (bijv. 1 → 2)
- [ ] **Any iOS Device** kiezen → **Product → Archive** → **Distribute App → App Store Connect → Upload**

## 5. Testen op je iPhone via TestFlight – jij
- [ ] Premium kopen (in TestFlight is dat gratis: het is een test)
- [ ] Aankopen herstellen
- [ ] Toestemmingsvenster (Europa) en volg-vraag verschijnen
- [ ] Testadvertentie bekijken (beloonde video)

## 6. Medestudenten laten testen (optioneel) – jij
- [ ] TestFlight → Test Information invullen (beschrijving, feedback-mail, privacy-URL)
- [ ] Groep "Medestudenten" bij External Testing, build toevoegen, **Submit for Review**
- [ ] Na goedkeuring: **Public Link** aanzetten en doorsturen

## 7. Beslissingen – jij
- [ ] KvK-check doen op kvk.nl ("Moet ik mij inschrijven?")
- [ ] DSA: handelaar (trader) ja, en welk adres, telefoon en e-mail je openbaar zet
- [ ] Supportpagina staat op openbaar (controleren in een privévenster)

## 8. De App Store-pagina invullen – jij, met hulp van Claude
- [ ] **App Information:** categorie Games → Strategy, leeftijdsclassificatie (vragenlijst), content rights
- [ ] **Pricing and Availability:** gratis, alle landen behalve China
- [ ] **App Privacy:** vragenlijst over gegevens (reclame via AdMob, aankopen via RevenueCat)
- [ ] **Versie 1.0:** screenshots uit `store/screenshots`, teksten uit `docs/APP-STORE-TEKSTEN.md`
- [ ] Support-URL: `https://claude.ai/artifact/C7YiKVce1wFsuhrsr8kPAw`
- [ ] Privacy-URL: `https://claude.ai/artifact/C7YiKVce1wFsuhrsr8kPAw#privacy`
- [ ] Build kiezen en de twee **In-App Purchases** toevoegen
- [ ] App Review Information: contactgegevens, geen inlog nodig

## 9. Insturen 🚀
- [ ] **Add for Review → Submit**
- [ ] Wachten op Apple (meestal 1–3 dagen)
- [ ] Goedgekeurd? Op **Release** drukken!

## Daarna
- Reviews lezen en beantwoorden
- Feedback verzamelen en naar Claude sturen voor updates
- Inkomsten bijhouden voor de belastingaangifte
