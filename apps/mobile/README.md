# Mobile app

The Expo (iOS and Android) client. It talks to the same API as the web apps.
Moved verbatim from the root `README.md`.

```bash
pnpm --filter @newax/mobile start        # then scan the QR code with Expo Go
```

It talks to the same API. Point it at one with `EXPO_PUBLIC_API_URL`; with
nothing set it uses `http://localhost:3001/api/v1`, except on Android, where the
emulator reaches the host on `10.0.2.2`. A phone on your wi-fi needs your
machine's LAN address rather than localhost:

```bash
EXPO_PUBLIC_API_URL="http://192.168.1.20:3001/api/v1" pnpm --filter @newax/mobile start
```

Sign in with any of the seeded accounts above — a tailor lands on their queue
rather than the shop.

**Push notifications** tell a customer when their garment moves on. Add
`expo_push` to `NOTIFICATION_CHANNELS` to switch them on; the app registers the
handset on sign-in, and no provider credentials are needed. Delivery has not been
exercised against a real handset — that needs a device and an EAS project id in
`app.json`.

Store builds go through EAS, with development, preview and production profiles in
`apps/mobile/eas.json`:

```bash
cd apps/mobile
npx eas build --profile preview --platform android
npx eas build --profile production --platform all
```
