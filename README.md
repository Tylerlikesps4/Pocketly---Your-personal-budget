### Pocketly – Your personal budget

Track your income and expenses, set monthly budgets by category, and see how much you have left. Understand your spending with clear charts, month-over-month trends, and plain-English insights like “Dining is 32% over budget.”

Manage recurring bills and salary entries, convert between currencies, and scan receipts to fill in expense details for review. Import transactions or export backups with CSV support.

Keep your financial records on your device, with no bank connection required.


## Source code

This repository contains a source snapshot of the Pocketly mobile app, including its Expo frontend, Express API, branded assets, tests, and pinned dependency lockfile. The mobile project's active repository remains managed by Manus; this GitHub copy is separate and does not automatically sync future edits.

### Stack

Expo Router and React Native with TypeScript, React Native Web, NativeWind, and an Express/tRPC API. Financial records use local storage: browser storage on web and AsyncStorage on native mobile. Supabase, Firebase, and Cloudflare Workers are not integrated in this snapshot.

### Development

Use a Node.js version compatible with the installed Expo SDK 57 and the pinned pnpm 9.12.0 package manager.

```sh
npx --yes pnpm@9.12.0 install --frozen-lockfile
npx --yes pnpm@9.12.0 dev
```

The supplied development command starts Expo/Metro on port 8081 and the API on port 3000. Native preview requires an Expo Go version compatible with the installed SDK or a matching development build.

For development outside Manus, configure `EXPO_PUBLIC_API_BASE_URL` to an address reachable from the device running the app. A physical phone cannot reach your computer through `localhost`; use its accessible network address for local development and HTTPS for a hosted API. Configure the API's CORS allowlist for your frontend origin. Do not commit `.env` files, database passwords, private keys, or tokens. Starter Manus OAuth/database adapters require their own environment configuration if you choose to use them; the budget screens do not currently use cloud database persistence or login.

```sh
npx --yes pnpm@9.12.0 check
npx --yes pnpm@9.12.0 lint
npx --yes pnpm@9.12.0 test
```

### Feature and privacy boundaries

Recurring schedules create ledger entries while the app is open or when it reopens. They do not make payments, connect to a bank, or run a closed-app server scheduler.

Currency conversion uses cached ECB reference rates from Frankfurter. Existing transactions retain their saved accounting amounts and original currency metadata.

Browser receipt OCR runs locally with Tesseract.js, using downloaded engine/model assets. Native receipt scans send the selected image to `/api/receipts/ocr` for temporary, in-memory Tesseract processing. Review the extracted expense before saving. Receipt images and personal financial records are not included in this repository.

CSV import/export is supported. Cloud sync, a full JSON backup button, and a Supabase migration flow have been discussed but are not implemented in this source snapshot.
