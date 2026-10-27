# Play Store Deployment Guide — kredibble-app

End-to-end guide for creating the app in Google Play Console and shipping releases through the CI/CD pipeline.

Project: `com.kredibble_it.god` (Global Opportunity Desk / G.O.D)
Repo: `KredibbleIT/Global-Opportunities`
EAS project ID: `9d567049-d386-4b4b-b386-6ea3e826d473`

---

## 1. Prerequisites

| Item | Source / Value |
|------|----------------|
| Google Play Console account | Owner account for `kredibble-it` |
| Service account key JSON | Google Cloud Console → IAM & Admin → Service Accounts → Create key (JSON) |
| `EXPO_TOKEN` GitHub secret | `eas login` → `eas whoami` token; set in repo Settings → Secrets and variables → Actions |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` GitHub secret | The raw service account key JSON |
| EAS project | `kredibble-it/kredibble-app` (already created via `eas init`) |

### GitHub secrets to configure

In **Settings → Secrets and variables → Actions** on the `Global-Opportunities` repo:

- `EXPO_TOKEN` — EAS auth token (enables `eas whoami`, `eas build`, `eas submit`)
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — raw service account key JSON (used to authenticate `eas submit` with the Play Developer API)

---

## 2. Create the app in Play Console

This is a **one-time manual step**. EAS `submit` cannot create a new app; it can only upload to an app that already exists.

1. Open [Google Play Console](https://play.google.com/console).
2. **All apps → Create app**.
   - App name: `Global Opportunity Desk`
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free
   - Package name: `com.kredibble_it.god`
   - Click **Create**.
3. **Setup → App integrity → Play App Signing**.
   - You must opt into Play App Signing before you can upload an AAB.
   - Generate an upload key (or let Google generate one). Keep the upload key secure — you need it for future uploads if you manage your own key.
4. **Setup → App signing → Export upload certificate** (optional but recommended) — save the certificate fingerprint for your records.

---

## 3. First release (must be manual)

EAS `submit` can update an existing app but cannot create the initial release. Upload the first AAB manually:

1. Build the AAB locally or via CI:

   ```bash
   # local
   cd kredibble-app
   eas build --platform android --profile production --non-interactive
   ```

   or wait for the **Build Android Store (AAB)** job to finish on GitHub Actions and download the AAB artifact.

2. In Play Console: **Releases → Internal track → Create release**.
   - Release name: `Internal release v1.0.0`
   - Release notes: `First release of Global Opportunity Desk — jobs, internships, scholarships, grants and events across Africa.`
   - Upload the AAB (version 1.0.0, code 1).
   - **Review** → **Start rollout to Internal track**.

3. **Add testers**: Setup → Internal track → Testers → Add your email (or a Google Group). Without testers, the release exists but no one can install it (this is the expected warning in Play Console).

4. **Complete the store listing** (required before any release can go live):
   - **Grow → Store presence → Main store listing**
     - App title: `Global Opportunity Desk`
     - Short description: `Find jobs, internships, scholarships, grants and events across Africa.` (70 chars)
     - Full description: copy from `STORE-LISTINGS.md`
     - Screenshots: phone + tablet (required for Play Store review)
     - App icon: `assets/images/icon.png`
     - Feature graphic: 1024×500
     - Privacy policy URL: required (host it publicly and link here)
     - Content rating questionnaire: complete it
   - **Setup → App content**: complete the target audience and data-safety forms.

5. Once the internal release is rolled out and the store listing is complete, **Publish** the app.

> After this one-time manual upload, every subsequent `eas submit` run in CI will work automatically.

---

## 4. CI/CD pipeline (ongoing submissions)

The `CD App` workflow (`.github/workflows/cd-app.yml`) runs on pushes to `main` and does:

1. **Verify** — lint, typecheck, tests (`kredibble-app`)
2. **Build Android Store (AAB)** — `eas build --platform android --profile production --non-interactive`
3. **Submit Android to Play Store** — `eas submit --platform android --latest --non-interactive`
4. **Publish EAS Update (Staging / Production)** — OTA updates

### How submit authenticates

`kredibble-app/eas.json` (`submit.production.android.serviceAccountKeyPath`) points at `google-play-service-account.json`.

The `Configure Play Store credentials` step in `cd-app.yml` writes that file from the `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret:

```json
{
  "type": "service_account",
  "project_id": "...",
  "private_key_id": "...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "...",
  "client_id": "...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "..."
}
```

The secret may be provided either raw or wrapped as `{ "google_play": { "serviceAccountKey": {...} } }`; the workflow normalizes both.

### Submitting a new version

1. Bump `version` and `versionCode` in `app.json` (e.g. `1.0.1` / `2`).
2. Commit and push to `main`.
3. The CD workflow builds a new AAB and submits it to the **Internal track**.
4. Promote the release to **Closed testing** → **Production** manually in Play Console when ready.

---

## 5. OTA updates (EAS Updates)

Staging and production EAS Updates are published automatically by the CD workflow (`eas update --channel staging` / `--channel production`). Users on a compatible build receive these instantly without a Play Store review.

Channel → runtimeVersion policy: `appVersion` (see `app.json`). An OTA update only applies if the runtime version matches the installed build.

---

## 6. Versioning rules

| Change | `version` | `versionCode` | Action |
|--------|-----------|---------------|--------|
| Bug fix / OTA-only | no bump | no bump | `eas update` only |
| Native code / new dependencies | bump patch (`1.0.1`) | increment by 1 | `eas build` + `eas submit` |
| New features / breaking | bump minor or major | increment by 1 | `eas build` + `eas submit` |

Never reuse a `versionCode`. Google Play rejects uploads with a code that already exists.

---

## 7. Troubleshooting

### `Google Service Account Keys cannot be set up in --non-interactive mode`
Cause: `eas submit` could not find configured Play credentials.  
Fix: Ensure `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` is set in GitHub secrets and `eas.json` has `submit.production.android.serviceAccountKeyPath`. The workflow writes `google-play-service-account.json` before submitting.

### `Google Play cannot find the app`
Cause: The app `com.kredibble_it.god` does not exist in Play Console yet.  
Fix: Complete Step 2 (create app) and Step 3 (manual first upload). After that, `eas submit` works.

### `This release will not be available to any users`
Cause: No testers assigned to the Internal track.  
Fix: Setup → Internal track → Testers → add emails / Google Groups. This warning is informational; the release upload still succeeds.

### `No deobfuscation file associated with this App Bundle`
Cause: R8/ProGuard is not enabled (default for Expo).  
Fix: Ignore unless you explicitly enabled code shrinking in `android/app/build.gradle` or `eas.json`.

### `versionCode 1 already exists`
Cause: Re-uploading the same build code.  
Fix: Increment `versionCode` in `app.json` before rebuilding.

---

## 8. Releasing to Production

1. Internal track: upload via CI (`eas submit`), add internal testers, verify.
2. Closed testing: create a closed track, add testers, promote from Internal.
3. Production: create a production release, promote from Closed testing, complete store listing, publish.

Production releases require full store listing completion (screenshots, description, privacy policy, content rating, target audience, data safety).

---

## 9. Files reference

| File | Purpose |
|------|---------|
| `kredibble-app/app.json` | App identity, version, package name, EAS project |
| `kredibble-app/eas.json` | EAS build/submit profiles; `submit.production.android.serviceAccountKeyPath` |
| `.github/workflows/cd-app.yml` | CI/CD: build AAB, submit to Play, publish OTA updates |
| `kredibble-app/STORE-LISTINGS.md` | Store listing copy (descriptions, keywords, screenshots notes) |
