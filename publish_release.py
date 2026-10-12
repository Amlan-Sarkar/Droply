import os
import sys
import io
import zipfile
import urllib.request
import json

TOKEN = "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"
REPO = "Amlan-Sarkar/Droply"
TAG = "v1.2.4"
NAME = "Droply v1.2.4 - Windows & Android Release"

BODY = """### 🪟 Windows (Stable)

| Platform | Package | Direct Link |
| :--- | :--- | :--- |
| 🪟 **Windows 10 / 11** | Standalone ZIP (x64) | [Download Droply-Windows-x64.zip](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-Windows-x64.zip) |

*Tested on Windows 11. Includes playlist extraction, automatic folder creation, and taskbar branding. No Python required. Extract and run `Droply.exe`.*

---

### 🤖 Android (Experimental)

| Platform | Package | Direct Link |
| :--- | :--- | :--- |
| 🤖 **Android (7.0+)** | Standalone APK | [Download Droply-Android.apk](https://github.com/Amlan-Sarkar/Droply/releases/download/v1.2.4/Droply-Android.apk) |

> [!WARNING]
> **Android is currently experimental:** The Android APK is provided for testing and community validation. Core download flows, storage paths, and UI interactions are under active development and may behave unexpectedly while mobile issues are being resolved."""

HEADERS = {
    "User-Agent": "Droply-Publisher",
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}

def download_artifact(artifact_id, out_name):
    print(f"\n[1/2] Downloading build artifact {artifact_id}...")
    url = f"https://api.github.com/repos/{REPO}/actions/artifacts/{artifact_id}/zip"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    print(f"Downloaded {len(data)/(1024*1024):.2f} MB. Unpacking inner file...")
    zf = zipfile.ZipFile(io.BytesIO(data))
    for fname in zf.namelist():
        content = zf.read(fname)
        with open(out_name, "wb") as f:
            f.write(content)
        print(f"✓ Saved {out_name} ({len(content)/(1024*1024):.2f} MB)")
        return out_name
    raise Exception("No file found in artifact archive")

def create_or_get_release():
    print(f"\n[Release] Checking if release {TAG} exists...")
    try:
        url = f"https://api.github.com/repos/{REPO}/releases/tags/{TAG}"
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req) as resp:
            rel = json.loads(resp.read().decode())
            print(f"✓ Found existing release ID: {rel['id']}")
            return rel
    except Exception:
        pass

    print(f"Creating new GitHub Release {TAG}...")
    url = f"https://api.github.com/repos/{REPO}/releases"
    payload = json.dumps({
        "tag_name": TAG,
        "name": NAME,
        "body": BODY,
        "draft": False,
        "prerelease": False
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers=HEADERS, method="POST")
    with urllib.request.urlopen(req) as resp:
        rel = json.loads(resp.read().decode())
        print(f"✓ Successfully created release {TAG} (ID: {rel['id']})")
        return rel

def upload_asset(upload_url_tmpl, file_path, asset_name, content_type):
    base_upload_url = upload_url_tmpl.split("{")[0]
    upload_url = f"{base_upload_url}?name={asset_name}"
    print(f"\n[Upload] Uploading {asset_name} to GitHub release...")
    
    with open(file_path, "rb") as f:
        data = f.read()
        
    upload_headers = {
        "User-Agent": "Droply-Publisher",
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": content_type,
        "Content-Length": str(len(data))
    }
    req = urllib.request.Request(upload_url, data=data, headers=upload_headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        asset = json.loads(resp.read().decode())
        print(f"✓ Uploaded {asset_name} ({asset['size']/(1024*1024):.2f} MB) successfully!")
        return asset

def main():
    print("=" * 60)
    print("  Droply v1.2.4 Release Publisher (Windows & Android)")
    print("=" * 60)

    win_file = "Droply-Windows-x64.zip"
    apk_file = "Droply-Android.apk"

    # Download from Run 38248364935 artifacts
    download_artifact(11746815602, win_file)
    download_artifact(11747690149, apk_file)

    # Create release
    rel = create_or_get_release()
    upload_url_tmpl = rel["upload_url"]

    # Delete existing asset if present before upload
    existing_assets = {a["name"]: a["id"] for a in rel.get("assets", [])}
    for asset_name, path, ctype in [
        ("Droply-Windows-x64.zip", win_file, "application/zip"),
        ("Droply-Android.apk", apk_file, "application/vnd.android.package-archive")
    ]:
        if asset_name in existing_assets:
            print(f"Replacing existing asset {asset_name} (ID: {existing_assets[asset_name]})...")
            del_url = f"https://api.github.com/repos/{REPO}/releases/assets/{existing_assets[asset_name]}"
            del_req = urllib.request.Request(del_url, headers=HEADERS, method="DELETE")
            try:
                urllib.request.urlopen(del_req)
            except Exception:
                pass
        upload_asset(upload_url_tmpl, path, asset_name, ctype)

    print("\n" + "=" * 60)
    print("SUCCESS! Release v1.2.4 is published and visible on GitHub!")
    print(f"View it at: https://github.com/{REPO}/releases/tag/{TAG}")
    print("=" * 60)

if __name__ == "__main__":
    main()
