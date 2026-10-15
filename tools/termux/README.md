# ALICE Termux → Pixel (rootless)

This is a **local** Python/ADB control utility for Android Termux, not a remotely exposed management endpoint. It does not create a tunnel, bypass Android permissions or connect ChatGPT to the phone.

## Install on the Pixel in Termux

```sh
pkg update
pkg install python android-tools
curl -fsSLo alice_phone.py https://raw.githubusercontent.com/Zweeback/alicealpha/feat/termux-phone-bridge-20261014/tools/termux/alice_phone.py
python alice_phone.py doctor
```

For battery telemetry, optionally install the Termux:API Android app and `pkg install termux-api`. The status output explicitly marks unavailable signals.

## One-time wireless debugging pairing

1. On the **same Pixel**, open Settings → Developer options → Wireless debugging.
2. Tap **Pair device with pairing code**. Take the displayed `HOST:PAIR_PORT` and pairing code.
3. In Termux run `python alice_phone.py pair HOST:PAIR_PORT` and enter the Android code when prompted.
4. Return to the main **Wireless debugging** screen and read the **different** debugging port.
5. Run `python alice_phone.py connect HOST:DEBUG_PORT` and `python alice_phone.py devices`.

The port changes across sessions. On the same device, localhost (`127.0.0.1`) often works when Android displays another local address, but use the displayed address first.

## Verified CLI surfaces

```sh
python alice_phone.py status
python alice_phone.py doctor
python alice_phone.py devices
python alice_phone.py home
python alice_phone.py back
python alice_phone.py tap 420 800
python alice_phone.py swipe 200 800 200 200 450
```

Input actions fail closed without **exactly one** device in ADB's `device` state. No arbitrary shell command, app permission escalation, anonymous HTTP endpoint, filesystem access or automatic remote execution is exposed.

**Important:** Termux cannot install the normal systemd/sudo-dependent SentinelX daemon. A separate reviewed, authenticated outbound transport and explicit command policy would be needed for ChatGPT remote operation.

Run offline unit tests with:

```sh
python -m unittest discover -s tools/termux -p 'test_*.py' -v
```

This code is intended for your own phone and requires Android's pairing permission. 