# Pocketly

- [x] Add, edit, and delete income and expense transactions with date, amount, category, and optional note; validate positive amounts and real dates.
- [x] Create and manage reusable categories for income and expenses; prevent deletion of referenced categories.
- [x] Set monthly spending budgets for individual expense categories. Show each category’s budget, amount spent, and amount remaining for the selected month.
- [x] Provide a mobile-first dashboard with monthly income, expenses, net balance, and overall budget progress. Visualize spending by category with a clear chart and category totals. Display a month-over-month income and spending trend chart.
- [x] Generate plain-English rule-based insights such as 'Dining is 32% over budget' and changes from the previous month.
- [x] Import transactions from CSV with validation, column mapping, duplicate handling, and an import summary. Export locally stored transactions and monthly budget data to CSV. Browser downloads and native named-file sharing are supported.
- [x] Persist all financial data in browser storage (device-local AsyncStorage on native); no budget or transaction data goes to the managed backend. Provide a clearly labeled separate sample-data view and a fresh personal budget. Never overwrite the personal budget while exploring sample data. Pause writes when existing stored data is unreadable until explicitly cleared.
- [x] Deliver cohesive mobile branding, configured app icons, and working Preview.

## Implementation evidence

TypeScript check and Expo lint pass. Vitest: 40 tests passed; one unused starter authenticated-logout integration test is skipped. Domain tests cover cents, date/month boundaries, budgets, percentage insights, persisted-data validation, CSV quoting, malformed quoted fields, mapping, duplicate suppression, and spreadsheet-safe export/import. Native filesystem/picker/sharing boundaries have four mocked unit tests, including named CSV attachment export and size validation.

Read-only implementation review confirmed required app flows and local-only financial storage. Its native text-only export finding was fixed with Expo filesystem and sharing, and a native file picker was added. Metro Web bundle compiles, and the fixed API health endpoint responds HTTP 200. Native release artifacts are built from the saved source using the Dashboard; no physical-device behavior or release build has been claimed.

## Requested extensions

- [x] Add recurring transactions for automatic monthly bills and salary deposits. Manage monthly schedules with start date, day of month, optional end date, category, note, amount, currency, and pause/resume/delete. Post due entries exactly once on app open/resume and while open; catch up missed months; clamp days 29–31 to short-month ends. Explain that local-only apps cannot run while closed and these are ledger entries, not actual bank payments.
- [x] Implement multi-currency support with automatic exchange-rate conversion. Choose a home currency; retain original amounts/currencies and the reference rate used when saving; convert totals and category budgets to the home currency. Automatically refresh and cache official reference rates, with last-updated and offline/error messaging. Preserve existing USD data and CSV compatibility; export/import original currency fields. Changing home currency re-expresses existing recorded amounts and budgets at the current reference rate after confirmation.
- [x] Add receipt scanning and OCR to auto-fill expense amount, merchant/note, date and currency when readable. Support receipt images from camera/photo/file on browser and Expo Go. Show progress, errors, cancellation and editable review; do not save until confirmed. Browser OCR runs on device. Native scanning uses temporary app-server OCR with a clear disclosure before scanning; receipt files and recognized text are not persisted on the server. Stored records remain local.
- [x] Preserve Pocketly’s established design, local financial storage, existing category budgets and transaction/CSV features, web Preview, and credential-safe Expo Go readiness.

## Extension evidence

TypeScript and Expo lint pass. The existing full suite passed 58 tests with one unused starter auth test skipped; affected receipt-boundary tests now pass six native capture/file/cancellation tests and three temporary OCR route tests. These cover explicit camera permissions, file size limits, temporary-copy cleanup, request validation, and pre-parser oversized-request rejection. Currency and recurring tests cover frozen cross-rates, home-currency migration, cached-rate blocking, short/leap month boundaries, catch-up idempotency, deletion watermarks, and zero-rounding protection. CSV regression coverage confirms offline original-currency/locked-home-amount round trips.

Live public ECB fetch and cross-currency conversion succeeded; live in-memory Tesseract OCR succeeded on the public engine sample. Web and iOS Metro bundles compile, the web Preview and API are healthy, and the private Expo credential remained in the runtime environment only. A read-only integration review identified native Files input and oversized global body parsing; both were fixed with a document-image picker and rate/size-guarded dedicated 12 MB OCR JSON parser mounted before broad API parsers. No physical-device camera check or native release build has been claimed.
