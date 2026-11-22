# Fadeproof

Een studieplanner en game in één, voor studenten. Fadeproof houdt per onderwerp bij hoe goed je het nog weet,
plant elk onderwerp in **net voordat je het zou vergeten**, en voorspelt hoeveel je op de tentamendag nog weet.

- Twee thema's die het hele scherm vullen: **Auto's** (de stad bij nacht) en **Rich life** (een haven vol jachten)
- Herhalen via *active recall*: aantekeningen dicht, opschrijven wat je weet, eerlijk beoordelen
- Automatisch weekplan, tentamenvoorspelling per vak, XP, levels, munten, reeksen en prestaties
- Nederlands en Engels, werkt volledig offline
- Verdienmodel: **beloonde video's** waar de gebruiker zelf voor kiest (geen banners, geen onderbrekingen)

## Zelf proberen op je computer

```bash
npm start        # opent op http://localhost:8081
```
In de browser zijn advertenties **nagespeeld** (testmodus van 3 seconden).

## Mappen

```
www/index.html         de hele app (HTML, CSS en JavaScript)
www/fonts/             lettertypes, lokaal meegeleverd (werkt offline)
www/vendor/native.js   gebundelde iPhone-plugins (wordt gemaakt met: npm run build:native)
src/native.js          welke iPhone-plugins de app gebruikt
scripts/ios-setup.sh   zet de iOS-instellingen goed (reclame, volg-vraag, alleen iPhone)
assets/                app-icoon (1024×1024) en opstartscherm
store/screenshots/     App Store-screenshots (NL en EN, 1290×2796)
docs/                  stappenplan, winkelteksten, privacybeleid, verdienmodel
```

## Naar de App Store

Volg [docs/APP-STORE-STAPPEN.md](docs/APP-STORE-STAPPEN.md).
