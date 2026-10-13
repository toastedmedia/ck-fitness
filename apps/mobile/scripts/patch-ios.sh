#!/bin/bash
# Run by the cloud build after `cap add ios`. Sets the iPhone-only settings Apple asks about.
set -e
PLIST="apps/mobile/ios/App/App/Info.plist"
PB=/usr/libexec/PlistBuddy
set_str() { "$PB" -c "Set :$1 $2" "$PLIST" 2>/dev/null || "$PB" -c "Add :$1 string $2" "$PLIST"; }
set_bool() { "$PB" -c "Set :$1 $2" "$PLIST" 2>/dev/null || "$PB" -c "Add :$1 bool $2" "$PLIST"; }

# iPhone home-screen labels cut off after about 11 characters, so the icon says "Chardikala".
set_str CFBundleDisplayName "Chardikala"
set_str NSPhotoLibraryUsageDescription "Choose photos for your progress photos and community posts. They stay private unless you share them."
set_str NSCameraUsageDescription "Take a photo for your progress photos or a community post."
set_bool ITSAppUsesNonExemptEncryption false

# iPhone, portrait only (keeps layouts predictable and avoids iPad review requirements).
"$PB" -c "Delete :UISupportedInterfaceOrientations" "$PLIST" 2>/dev/null || true
"$PB" -c "Add :UISupportedInterfaceOrientations array" "$PLIST"
"$PB" -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PLIST"
"$PB" -c "Delete :UISupportedInterfaceOrientations~ipad" "$PLIST" 2>/dev/null || true

# Marketing version shown in the App Store. Build numbers are set by the cloud build.
VERSION=$(node -p "require('./apps/mobile/package.json').version")
set_str CFBundleShortVersionString "$VERSION"

# iPhone only (no iPad build): TARGETED_DEVICE_FAMILY 1 = iPhone.
PBX="apps/mobile/ios/App/App.xcodeproj/project.pbxproj"
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' "$PBX"
echo "iPhone settings patched (version $VERSION)"
