# Stappenplan: van webspel naar App Store

Het spel is gebouwd met gewone webtechniek (HTML, CSS en JavaScript). Met **Capacitor** verpak je het
als echte iOS- en Android-app. Je hoeft het spel daarvoor niet opnieuw te schrijven.

## Wat heb je nodig?

- [ ] Een **Mac** met **Xcode**. Voor iOS kan het niet zonder Mac. Huren kan ook, bijvoorbeeld via MacinCloud.
- [ ] Een **Apple Developer-account**: $99 per jaar (developer.apple.com).
- [ ] Een iPhone om op te testen. Dat mag een oude zijn.
- [ ] Node.js (versie 20 of nieuwer).
- [ ] Optioneel: een Google Play-account ($25, eenmalig) voor Android.

## Stap 1 – App maken met Capacitor

```bash
npm install
npx cap add ios
npx cap add android      # optioneel
npx cap sync
npx cap open ios         # opent Xcode
```
Kies in Xcode bij *Signing & Capabilities* je Team en voeg de capability **In-App Purchase** toe.
Zet bij *Deployment Info* het scherm op **Portrait**.

## Stap 1b – iOS-instellingen

Draai na `npx cap add ios` één keer:
```bash
npm run ios:setup
```
Dit zet de reclame-instellingen, de tekst bij Apple's volg-vraag, "alleen iPhone" en "alleen staand scherm" goed.

**Een nieuwe versie van het spel binnenhalen?** Vervang de mappen `www`, `src` en `scripts` en het bestand `package.json` door de nieuwe versie en draai:
```bash
npm run ios:update
```

## Stap 2 – Icoon en opstartscherm

Het icoon en het opstartscherm staan al klaar in de map `assets/`:
`icon-only.png` (1024×1024), `splash.png` en `splash-dark.png` (2732×2732). Draai alleen nog:
```bash
npx @capacitor/assets generate --ios
```
Trillen werkt op de iPhone via de plugin `@capacitor/haptics`. Die wordt meegenomen door `npm install` en `npx cap sync`.

## Stap 3 – Producten aanmaken in App Store Connect

1. Ga naar App Store Connect → **Mijn apps** → **+** → Nieuwe app. De bundle-ID is `nl.meesterzeth.eilandrijk`.
2. Vul bij **Overeenkomsten, belasting en bankgegevens** het *Paid Apps Agreement* in. Zonder dit werkt geen enkele aankoop.
3. Maak bij **In-app-aankopen** twee producten van het type **Non-Consumable**:
   - `nl.meesterzeth.eilandrijk.premium` → € 3,99
   - `nl.meesterzeth.eilandrijk.kleuren` → € 1,99
4. Meld je aan voor het **App Store Small Business Program**. Je betaalt dan 15 % in plaats van 30 % commissie.

## Stap 4 – Aankopen koppelen (RevenueCat)

RevenueCat is gratis tot $2.500 omzet per maand. Het regelt de lastige kant van aankopen, zoals bonnetjes controleren.

1. Maak een account op revenuecat.com en voeg je app toe.
2. Maak twee **entitlements**: `premium` en `colors`. Koppel daaraan de twee producten.
3. Plak de publieke API-sleutel in `www/js/store.js` bij `revenueCatApiKeyIOS`.

## Stap 5 – Advertenties (AdMob)

1. Maak een account op admob.google.com en voeg de app toe.
2. Maak een advertentie-unit **Rewarded** en een advertentie-unit **Interstitial**.
3. Zet de ID's in `www/js/store.js`. Tot dan staan er **testadvertenties** van Google. Klik nooit op je eigen echte advertenties!
4. Zet je AdMob-app-ID in `scripts/ios-setup.sh` (bij `ADMOB_APP_ID`) en draai `npm run ios:setup`.
5. Maak in AdMob bij **Privacy & messaging** een **GDPR-bericht** (Europese toestemming) en een **IDFA-uitleg** (iOS) aan en publiceer ze. De app toont die vensters automatisch.
6. De vraag "Sta toe dat Eilandrijk je volgt" (App Tracking Transparency) zit al in de app. De tekst erbij zet `npm run ios:setup` goed.

> ⚠️ De koppeling met RevenueCat en AdMob staat al klaar in `store.js`, maar is nog **niet op een echt toestel getest**.
> Test eerst met een **Sandbox-testaccount** (App Store Connect → Gebruikers en toegang → Sandbox)
> voordat je de app instuurt.

## Stap 6 – Testen met TestFlight

Kies in Xcode **Product → Archive** en daarna **Distribute App → App Store Connect**.
Nodig via TestFlight vrienden of medestudenten uit om te testen. Vraag ze om eerlijke feedback:
- Snappen ze de regels zonder uitleg?
- Op welk level haken ze af?

## Stap 7 – Insturen

Dit heb je nodig:
- [ ] Screenshots: staan klaar in `store/screenshots/nl` en `store/screenshots/en`
- [ ] Beschrijving, ondertitel en trefwoorden in het Nederlands en Engels: zie `docs/APP-STORE-TEKSTEN.md`
- [ ] Een **privacybeleid-URL**. Gebruik de teksten in `docs/PRIVACYBELEID.md` en `docs/PRIVACY-POLICY-EN.md` en zet die online, bijvoorbeeld via GitHub Pages.
- [ ] De **App Privacy**-vragenlijst. Door AdMob moet je aangeven: *Identifiers* en *Usage data* voor advertenties.
- [ ] Leeftijdsclassificatie: waarschijnlijk **9+** (milde fantasy-strijd, geen bloed)
- [ ] Een testaccount of uitleg voor de reviewer is niet nodig

Een review duurt meestal 1 tot 3 dagen.
