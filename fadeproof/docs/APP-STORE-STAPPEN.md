# Stappenplan: Fadeproof in de App Store

Fadeproof is gebouwd met gewone webtechniek. Met **Capacitor** wordt het een echte iPhone-app.
Alle stappen hieronder doe je op je **Mac**, vanuit de map `fadeproof`.

## Wat heb je nodig?

- [x] Een Mac met **Xcode** (gratis in de Mac App Store)
- [x] Een **Apple Developer-account** ($99 per jaar)
- [ ] **Node.js** 20 of nieuwer (nodejs.org)
- [ ] Een iPhone om op te testen
- [ ] Een gratis **Google AdMob**-account (admob.google.com)

## Stap 1 – iOS-project maken

```bash
cd fadeproof
npm install
npm run build:native
npx cap add ios
npm run ios:setup
npx @capacitor/assets generate --ios
npx cap sync ios
npx cap open ios          # opent Xcode
```

In Xcode:
1. Klik links op **App** → tabblad **Signing & Capabilities** → kies bij *Team* je Apple Developer-account.
2. Controleer dat de *Bundle Identifier* `nl.meesterzeth.fadeproof` is.
3. Sluit je iPhone aan, kies hem bovenaan en druk op ▶︎ om de app te testen.

**Later een nieuwe versie van de app binnenhalen?** Vervang `www`, `src`, `scripts` en `package.json` en draai:
```bash
npm run ios:update
```

## Stap 2 – Advertenties instellen (AdMob)

Nu staan er **testadvertenties** van Google in. Die zijn veilig om mee te testen.

1. Maak een account op **admob.google.com** en voeg een iOS-app toe met de naam *Fadeproof*.
2. Maak één advertentie-unit van het type **Rewarded** (beloond).
3. Vervang de test-ID's door je eigen ID's:
   - **App-ID** (`ca-app-pub-…~…`) → in `scripts/ios-setup.sh` bij `ADMOB_APP_ID`, en draai daarna `npm run ios:setup`
   - **Rewarded-ID** (`ca-app-pub-…/…`) → in `www/index.html`, zoek `rewardedId:`
4. Ga in AdMob naar **Privacy & messaging** en maak een **GDPR-bericht** (Europese toestemming). Publiceer het.
   Maak **geen** IDFA-bericht aan: de app stelt de vraag van Apple zelf.
5. Draai `npx cap sync ios` en test opnieuw.

> ⚠️ Klik nooit op je eigen échte advertenties. Google kan je account dan blokkeren. Test altijd met de test-ID's
> of zet je iPhone als testtoestel in AdMob (Instellingen → Testapparaten).

**Zo werkt de reclame in de app:**
- Bij de eerste keer openen (na de uitleg) toont Google het toestemmingsvenster (verplicht in Europa).
- Daarna stelt iOS de vraag "Sta toe dat Fadeproof je volgt". Weigeren mag; de app werkt dan precies hetzelfde.
- In **Profiel → Winkel** kan de gebruiker zelf een video kijken: **+15 munten** (5× per dag) of
  **een gratis reeksredder** (1× per dag). Er zijn geen banners en de app onderbreekt nooit.
- In Europa staat onderaan **Profiel** een knop **Advertentie-instellingen**, zodat de gebruiker zijn keuze kan wijzigen.

## Stap 3 – App aanmaken in App Store Connect

1. Ga naar **appstoreconnect.apple.com** → **Apps** → **+** → *Nieuwe app*.
   - Platform: iOS · Naam: *Fadeproof: Studieplanner* · Primaire taal: Nederlands
   - Bundle-ID: `nl.meesterzeth.fadeproof` · SKU: `fadeproof`
2. Vul de teksten in uit [APP-STORE-TEKSTEN.md](APP-STORE-TEKSTEN.md). Voeg Engels toe als extra taal.
3. Upload de screenshots uit `store/screenshots/nl` en `store/screenshots/en` bij **iPhone 6,9"**/**6,7"**.
4. Categorie: **Onderwijs** (Education). Tweede categorie: **Productiviteit**.
5. **Privacybeleid-URL**: zet `docs/PRIVACYBELEID.md` en `docs/PRIVACY-POLICY-EN.md` online
   (bijvoorbeeld via GitHub Pages of een gratis Notion-pagina) en vul de link in.

## Stap 4 – App Privacy (privacylabels)

Fadeproof zelf verzamelt niets: alle voortgang blijft op het toestel. **Google AdMob** verzamelt wel gegevens.
Vul in App Store Connect bij **App Privacy** in (controleer dit met Google's pagina
*"Data disclosure for Apple's App Store privacy section"* voor AdMob):

| Gegevenstype | Gebruikt voor | Gekoppeld aan identiteit? | Tracking? |
|---|---|---|---|
| Identificatoren → Apparaat-ID | Advertenties van derden | Nee | Ja |
| Gebruiksgegevens → Productinteractie | Advertenties van derden, Analyse | Nee | Ja |
| Gebruiksgegevens → Advertentiegegevens | Advertenties van derden | Nee | Ja |
| Locatie → Globale locatie | Advertenties van derden | Nee | Ja |
| Diagnostiek → Prestatiegegevens | Analyse | Nee | Nee |

## Stap 5 – Leeftijdsclassificatie

Beantwoord alle inhoudsvragen met **Geen**. Bij *Advertenties* kies je **Ja**.
De advertenties zijn ingesteld op maximaal "Parental Guidance". Verwachte uitkomst: **4+**.

## Stap 6 – Testen met TestFlight

1. Xcode → **Product → Archive** → **Distribute App** → **App Store Connect** → *Upload*.
2. In App Store Connect → **TestFlight**: nodig vrienden of medestudenten uit.
3. Vraag ze: snap je wat je moet doen? Welk thema kies je? Wat mis je?

## Stap 7 – Insturen voor review

Kies de build, vul de laatste velden in en klik **Insturen voor review**. Dit kun je bij *Notities voor de reviewer* zetten:

> Fadeproof is a study planner. No account or login is needed. Ads are rewarded videos only and are always opt-in
> (Profile → Shop → "Watch a video"). In Europe the Google consent form appears after the onboarding,
> followed by the App Tracking Transparency prompt. All study data stays on the device.

Een review duurt meestal 1 tot 3 dagen.

## Checklist: waar Apple vaak op afkeurt (al geregeld)

- [x] Geen "binnenkort"-knoppen of prijzen zonder echte in-app-aankoop → het **Pro-tabblad is verborgen in de app**
- [x] Geen limiet op vakken zonder manier om die op te heffen → **in de app onbeperkt vakken**
- [x] Werkt zonder internet → lettertypes en alles zitten in de app
- [x] Volg-vraag (ATT) met uitleg, en de app werkt ook als je weigert
- [x] Europese toestemming (Google UMP) vóór advertenties, en een knop om die te wijzigen
- [x] Geen merklogo's van anderen (auto's en jachten zijn eigen ontwerpen)
- [x] Geen account nodig → je hoeft geen "account verwijderen"-functie te hebben
- [x] Notch en home-balk worden netjes vrijgehouden; alleen staand scherm; alleen iPhone
- [x] Voortgang wordt bewaard met iOS-voorkeuren (wordt niet zomaar door iOS gewist)

## Later: Pro als echte aankoop

Wil je later Pro verkopen (bijvoorbeeld € 3,99 per maand)? Dan moet dat via **in-app-aankopen van Apple**.
Gebruik daarvoor RevenueCat, net als bij Eilandrijk. Zet daarna het Pro-tabblad weer aan in de app
(zoek in `www/index.html` op `a.pro`) en voeg een knop **Aankopen herstellen** toe; die is verplicht.
