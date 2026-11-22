# Eilandrijk

Een strategiespel voor je telefoon. Je begint met een kleine hoofdstad op een eiland van zeshoeken.
Verover vakje voor vakje het eiland, beheer je goud en versla de computertegenstanders.

- **30 levels**: 1 t/m 10 gratis, 11 t/m 30 met Premium
- Korte potjes van 5 tot 15 minuten, goed te spelen met één hand
- Werkt zonder internet
- Beurttimer (uit, 30, 60 of 90 seconden), tussenstand, animaties en geluidseffecten
- Drie moeilijkheden (Normaal, Moeilijk, Meester) met kroontjes voor Meester-winst
- Zet terugnemen, verdedigingskaart, interactieve tutorial
- Automatisch opslaan: verder spelen waar je gebleven was
- Nederlands en Engels
- 8 prestaties, achtergrondmuziek, trillen bij gevechten

## Spelregels in het kort

| Eenheid | Kracht | Prijs | Soldij/beurt | Stappen |
|---|---|---|---|---|
| 🏹 Verkenner | 1 | 10 | 1 | 3 |
| ⚔️ Soldaat | 2 | 20 | 2 | 2 |
| 🐎 Ridder | 3 | 35 | 4 | 2 |
| 💣 Katapult | 4 | 50 | 6 | 1 |

- Elk vakje geeft 1 goud per beurt. Dorp en boerderij geven +2, je hoofdstad +3.
- Je verovert een vakje alleen als je kracht **groter** is dan de verdediging van dat vakje.
  Bos geeft +1, een toren verdedigt met 2, een hoofdstad met 2. De verdediging is nooit hoger dan 3.
- Eenheden kosten elke beurt soldij. Is je goud op, dan lopen je duurste eenheden weg.
- Je wint als je alle vijandelijke hoofdsteden hebt veroverd. Win je snel, dan krijg je 3 sterren.

## Zelf spelen op je computer

```bash
npm start            # of: python3 -m http.server 8080 -d www
```
Open daarna http://localhost:8080 en zet je browser in telefoonweergave.
Aankopen en reclame zijn in de browser **gesimuleerd** (testmodus).

```bash
npm test             # laat de computer alle 30 levels tegen zichzelf spelen
```

## Mappen

```
www/                 het spel zelf (HTML, CSS, JavaScript)
  js/game.js         spelregels, kaarten maken, levels
  js/ai.js           computertegenstanders
  js/render.js       tekenen van het speelveld (3D-tegels, zee, animaties)
  js/sprites.js      getekende kastelen, bomen en eenheden
  js/sfx.js          geluidseffecten
  js/store.js        verdienmodel: in-app aankopen en advertenties
  js/main.js         schermen, bediening, tutorial en opslaan
  js/i18n.js         alle teksten in het Nederlands en Engels
docs/                verdienmodel, stappenplan, winkelteksten, privacybeleid (NL/EN)
assets/              app-icoon en opstartscherm voor de App Store
store/screenshots/   screenshots voor de App Store (NL en EN)
tests/simulate.js    automatische test
capacitor.config.json  instellingen om er een iOS/Android-app van te maken
```

## Naar de App Store

Zie [docs/APP-STORE-STAPPEN.md](docs/APP-STORE-STAPPEN.md) en [docs/VERDIENMODEL.md](docs/VERDIENMODEL.md).

---

**Ook in deze repository:** [Fadeproof](fadeproof/README.md), een studieplanner-game voor studenten (map `fadeproof/`).
