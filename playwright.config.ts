import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 45000, use: { baseURL: 'http://localhost:3000', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' }, reporter: [['list'],['html',{open:'never'}]] });
