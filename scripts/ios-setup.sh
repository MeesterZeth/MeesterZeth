#!/bin/bash
# Zet de iOS-instellingen goed die Capacitor niet zelf regelt.
# Draai dit op je Mac vanuit de projectmap:  npm run ios:setup
# Je kunt het veilig vaker draaien.
set -e
cd "$(dirname "$0")/.."

# Google AdMob app-ID. Nu het TEST-ID van Google; vervang door je eigen ID uit AdMob vóór publicatie.
ADMOB_APP_ID="ca-app-pub-3940256099942544~1458002511"

PLIST="ios/App/App/Info.plist"
PBX="ios/App/App.xcodeproj/project.pbxproj"
if [ ! -f "$PLIST" ]; then
  echo "Geen iOS-project gevonden. Draai eerst: npx cap add ios"
  exit 1
fi

# Reclame (Google AdMob)
plutil -replace GADApplicationIdentifier -string "$ADMOB_APP_ID" "$PLIST"
plutil -replace SKAdNetworkItems -json '[{"SKAdNetworkIdentifier":"cstr6suwn9.skadnetwork"}]' "$PLIST"

# Tekst bij Apple's vraag "Sta toe dat Eilandrijk je volgt" (verplicht, anders crasht de app bij de vraag)
plutil -replace NSUserTrackingUsageDescription -string "This lets us show ads that better match your interests. You can still play everything if you decline. / Hiermee tonen we advertenties die beter bij je passen. Weigeren mag: je kunt gewoon alles spelen." "$PLIST"

# Geen eigen versleuteling: scheelt een vraag bij elke upload naar Apple
plutil -replace ITSAppUsesNonExemptEncryption -bool NO "$PLIST"

# Alleen staand scherm (portrait)
plutil -replace UISupportedInterfaceOrientations -json '["UIInterfaceOrientationPortrait"]' "$PLIST"

# Alleen iPhone, geen iPad
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX"

echo "✅ iOS-instellingen staan goed (reclame, volg-vraag, alleen iPhone, staand scherm)."
