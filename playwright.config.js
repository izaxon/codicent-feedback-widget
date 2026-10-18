// @ts-check
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 20000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    browserName: 'chromium',
    launchOptions: {
      // Fake mikrofon så att MediaRecorder kan testas utan riktig hårdvara.
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    },
    permissions: ['microphone']
  }
});
