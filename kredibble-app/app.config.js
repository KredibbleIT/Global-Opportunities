/**
 * App config on top of app.json (Expo passes app.json's `expo` object in as `config`).
 *
 * GOD-T77: Android push notifications go through Firebase Cloud Messaging, so the Android build must include the app's
 * google-services.json (`android.googleServicesFile`). Builds made before 22 Nov 2026 had none: getExpoPushTokenAsync failed
 * on every phone, no push token reached the API, and no broadcast ever arrived as a push. The file comes from, in order:
 *   1. the EAS environment variable GOOGLE_SERVICES_JSON, a "file" variable: EAS sets it to the file's path on the build
 *      machine, so the file is never committed;
 *   2. ./google-services.json next to this file, for a local build (it is gitignored).
 * Without either the app still builds, and an EAS build log says that pushes won't work.
 *
 * The server side of push (the FCM V1 service account key) is uploaded to EAS credentials, never to this repository.
 */
const fs = require('fs');
const path = require('path');

/**
 * The google-services.json the Android build should use, or undefined when there is none.
 * @param {Record<string, string | undefined>} [env] the environment to read (process.env)
 * @param {(file: string) => boolean} [exists] checks a path (fs.existsSync)
 * @returns {string | undefined}
 */
function googleServicesFile(env = process.env, exists = fs.existsSync) {
  if (env.GOOGLE_SERVICES_JSON) return env.GOOGLE_SERVICES_JSON;
  return exists(path.join(__dirname, 'google-services.json')) ? './google-services.json' : undefined;
}

module.exports = ({ config }) => {
  const file = googleServicesFile();
  if (!file && process.env.EAS_BUILD) {
    console.warn(
      '[app.config] No google-services.json: set the EAS file variable GOOGLE_SERVICES_JSON, or this Android build will not receive push notifications (GOD-T77).',
    );
  }
  return {
    ...config,
    android: { ...config.android, ...(file ? { googleServicesFile: file } : {}) },
  };
};

module.exports.googleServicesFile = googleServicesFile;
