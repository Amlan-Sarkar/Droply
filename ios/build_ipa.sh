#!/bin/bash
set -e

echo "=========================================="
echo "  Building Droply Standalone for iOS"
echo "=========================================="

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

rm -rf build Droply-iOS.ipa
mkdir -p build

echo "==> Syncing web UI assets into ios/web..."
rm -rf web
cp -r ../web ./web

echo "==> Running xcodebuild..."
xcodebuild -project Droply.xcodeproj \
  -scheme Droply \
  -configuration Release \
  -sdk iphoneos \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  build

echo "==> Packaging into Payload archive..."
mkdir -p build/Payload
APP_PATH=$(find build/DerivedData -name "Droply.app" -type d | head -n 1)
if [ -z "$APP_PATH" ]; then
  echo "Error: Droply.app not found in build/DerivedData!"
  exit 1
fi
echo "Found app bundle at: $APP_PATH"
cp -r "$APP_PATH" build/Payload/

echo "==> Compressing Droply-iOS.ipa..."
cd build
zip -q -r ../Droply-iOS.ipa Payload
cd ..

echo "==> Successfully created Droply-iOS.ipa!"
ls -lh Droply-iOS.ipa
cp Droply-iOS.ipa ../Droply-iOS.ipa
