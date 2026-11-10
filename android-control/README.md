# ALICE Android Bridge 0.1 – Pilot

## Status

Source-level prototype of a consent-based Android AccessibilityService.
Not yet installed or tested on the user's Pixel 9a. No screen capture, text
entry, screen reading, password access, financial-app interactions, or
general autonomous phone control.

## Allowed commands

BACK, HOME, RECENTS, NOTIFICATIONS, QUICK_SETTINGS.

The installed app downloads the JSON file in remote/command.json every
15 seconds **only** after the user enables its AccessibilityService and
switches on 'Fernnavigation' inside the app. Every request must contain
the 24-character per-installation pairing value displayed by the app and
a unique id. Duplicate ids are ignored. The app can be stopped instantly.

Command example:
{"id":"move-home-001","pairing":"<code shown on phone>","action":"HOME"}

**Security**: This pilot channel uses a public GitHub branch and is suitable
ONLY for the five non-sensitive navigation actions above. Never put
passwords, phone contents, addresses, accounts, messages or sensitive
information into its command JSON. Never expand to sensitive actions without
replacing it with an encrypted private relay and explicit user approval.

## Build

GitHub Actions workflow:
.github/workflows/alice-android-bridge-apk.yml

After workflow succeeds, APK is a workflow artifact. It is not currently
proven to build or run on the device.

## Pairing

1. Install APK on Pixel 9a.
2. Because APK is sideloaded, Android 17 might require Apps -> ALICE
   Gerätebrücke -> 3-dot menu -> Allow restricted settings.
3. Enable 'ALICE Navigation' in Android Accessibility settings.
4. In the app enable remote navigation, then copy the pairing code into
   the ChatGPT conversation.
5. A trusted operator can update command.json in the repository branch.

Permissions must be granted by the phone owner; Android will not allow the
assistant to remotely grant Accessibility permission.

## Threat model

- The control endpoint is public/readable, but GitHub writes require repo
  permissions. The app does not send telemetry or screenshots.
- Pairing is not cryptographic authentication against repo compromise.
- Device never executes arbitrary shell, JS, URL or app-intent code.
- Kill switch is local app button or Android Accessibility toggle.
- Connectivity and polling can be interrupted by Android power management.
- Never assume a GitHub commit proves the device executed a command.
