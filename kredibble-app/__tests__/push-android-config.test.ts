// GOD-T77: broadcasts never arrived as phone pushes. Android push goes through Firebase Cloud Messaging, and the app was
// built without its google-services.json, so getExpoPushTokenAsync failed on every phone, no token reached the API and
// no push was ever sent. app.config.js now puts the file in the Android build.

/* eslint-disable @typescript-eslint/no-require-imports */
const appJson = require('../app.json');
const appConfig = require('../app.config.js');

type AndroidConfig = { package: string; googleServicesFile?: string };
type ExpoConfig = { android: AndroidConfig; extra: { eas: { projectId: string } } };

const build = (): ExpoConfig => appConfig({ config: appJson.expo });

describe('GOD-T77: the Android build carries the Firebase config push needs', () => {
  const saved = { file: process.env.GOOGLE_SERVICES_JSON, easBuild: process.env.EAS_BUILD };
  afterEach(() => {
    if (saved.file === undefined) delete process.env.GOOGLE_SERVICES_JSON;
    else process.env.GOOGLE_SERVICES_JSON = saved.file;
    if (saved.easBuild === undefined) delete process.env.EAS_BUILD;
    else process.env.EAS_BUILD = saved.easBuild;
    jest.restoreAllMocks();
  });

  it('uses the EAS file variable GOOGLE_SERVICES_JSON and keeps the rest of app.json', () => {
    process.env.GOOGLE_SERVICES_JSON = '/home/expo/workingdir/google-services.json';
    const config = build();
    expect(config.android.googleServicesFile).toBe('/home/expo/workingdir/google-services.json');
    expect(config.android.package).toBe('com.kredibble_it.god');
    expect(config.extra.eas.projectId).toBe(appJson.expo.extra.eas.projectId);
  });

  it('falls back to a local google-services.json next to the config, and to nothing without one', () => {
    delete process.env.GOOGLE_SERVICES_JSON;
    expect(appConfig.googleServicesFile({}, () => true)).toBe('./google-services.json');
    expect(appConfig.googleServicesFile({}, () => false)).toBeUndefined();
  });

  it('an EAS build without the file says pushes will not work; a local start stays quiet', () => {
    delete process.env.GOOGLE_SERVICES_JSON;
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const local = appConfig.googleServicesFile();
    if (local) return; // a developer's own google-services.json is present: nothing to warn about
    build();
    expect(warn).not.toHaveBeenCalled();
    process.env.EAS_BUILD = 'true';
    const config = build();
    expect(config.android.googleServicesFile).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('GOOGLE_SERVICES_JSON'));
  });
});
