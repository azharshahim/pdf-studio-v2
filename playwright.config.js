import { defineConfig, devices } from '@playwright/test';

/**
 * Tests de bout en bout de l'édition directe.
 *
 * Trois moteurs (Chromium, Firefox, WebKit) en 390 × 844 tactile, plus un
 * profil Samsung Internet (même moteur que Chromium, mais en-tête
 * `SamsungBrowser`, pour vérifier les garde-fous et le repli `textarea`).
 *
 * Le serveur de développement est lancé une fois (ou réutilisé s'il tourne
 * déjà). Sur une machine sans dépendances système :
 *   npx playwright install --with-deps chromium firefox webkit
 */

const PORT = Number(process.env.PW_PORT || 5173);
const HOST = process.env.PW_HOST || '127.0.0.1';
const baseURL = process.env.PW_BASE_URL || `http://${HOST}:${PORT}`;

// 390 × 844 tactile. Le facteur d'échelle reste à 1 : au-delà, le rendu
// pdf.js au zoom d'édition multiplie la mémoire des canevas (les machines
// d'intégration continue n'ont pas toujours 4 Go disponibles).
const MOBILE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 };

const CHROMIUM_ARGS = {
  launchOptions: {
    args: [
      '--disable-dev-shm-usage',
      // Les machines de test n'ont parfois que 2 Go : on évite le cache
      // arrière-plan et la rasterisation GPU, gros consommateurs de mémoire.
      '--disable-back-forward-cache',
      '--disable-gpu',
    ],
  },
};

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36';
const SAMSUNG_UA =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (Android 14; Mobile; rv:152.0) Gecko/152.0 Firefox/152.0';
const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

/**
 * WebKit a parfois besoin d'un lanceur maison (bibliothèques système). On
 * peut fournir `PW_WEBKIT_EXECUTABLE` sans modifier la configuration.
 */
const webkitLaunch = process.env.PW_WEBKIT_EXECUTABLE
  ? { launchOptions: { executablePath: process.env.PW_WEBKIT_EXECUTABLE } }
  : {};

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './tests/e2e/.artifacts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'off',
    video: 'off',
    screenshot: 'only-on-failure',
  },
  // `PW_NO_WEBSERVER=1` permet de viser un serveur déjà lancé (par exemple
  // `npm run build && npx vite preview`), utile sur une machine à mémoire
  // limitée où Vite consomme trop.
  webServer: process.env.PW_NO_WEBSERVER
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Pixel 7'],
        ...MOBILE,
        userAgent: ANDROID_UA,
        hasTouch: true,
        isMobile: true,
        ...CHROMIUM_ARGS,
      },
    },
    {
      name: 'firefox',
      use: {
        ...MOBILE,
        userAgent: FIREFOX_UA,
        hasTouch: true,
        isMobile: false,
        browserName: 'firefox',
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['iPhone 14'],
        ...MOBILE,
        userAgent: IOS_UA,
        hasTouch: true,
        isMobile: true,
        ...webkitLaunch,
      },
    },
    {
      name: 'samsung',
      use: {
        ...devices['Pixel 7'],
        ...MOBILE,
        userAgent: SAMSUNG_UA,
        hasTouch: true,
        isMobile: true,
        ...CHROMIUM_ARGS,
      },
    },
  ],
});
