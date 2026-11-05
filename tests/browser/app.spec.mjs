import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function loadPreview(page) {
  await page.goto('./');
  await expect(page.locator('nav [data-nav="oral"]')).toBeVisible();
  await expect(page.locator('.local-badge')).toContainText('Repository');
}

async function databaseSnapshot(page, name = 'vokabeltrainer-englisch-test') {
  return page.evaluate(async dbName => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    return new Promise((resolve, reject) => {
      const request = db.transaction('vocabularies').objectStore('vocabularies').getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const snapshot = request.result.map(v => ({ id: v.id, learning: v.learning, history: v.history }));
        db.close();
        resolve(snapshot);
      };
    });
  }, name);
}

test('repository vocabulary loads, can be searched and keeps navigation accessible', async ({ page }) => {
  await loadPreview(page);
  await page.locator('nav [data-nav="vocab"]').click();
  await expect(page.locator('.vocab-list .vocab-item').first()).toBeVisible();
  await page.locator('#vocab-search').fill('school');
  await expect(page.locator('.vocab-list')).toContainText('school');
  await page.locator('#vocab-search').fill('not-a-real-vocabulary-xyz');
  await expect(page.locator('.vocab-list')).toContainText('Keine passenden Vokabeln');
  await page.locator('nav [data-nav="progress"]').click();
  await expect(page.locator('h2')).toHaveText('Fortschritt');
  await expect(page.locator('#export-progress')).toBeVisible();
});

test('oral quiz has ten distinct questions, a summary, continue and stop', async ({ page }) => {
  await loadPreview(page);
  const before = await databaseSnapshot(page);
  await page.locator('nav [data-nav="oral"]').click();
  await page.locator('#start-oral').click();
  const shownQuestions = new Set();

  for (let i = 1; i <= 10; i++) {
    await expect(page.locator('.badge').first()).toContainText('Frage ' + i + ' von 10');
    await expect(page.locator('.question-word')).toHaveCount(2);
    const question = await page.locator('.question-word').first().textContent();
    shownQuestions.add(question);
    await page.locator('[data-oral-result="' + (i % 3 ? 'correct' : 'wrong') + '"]').click();
  }

  expect(shownQuestions.size).toBe(10);
  await expect(page.getByRole('heading', { name: 'Runde 1 abgeschlossen' })).toBeVisible();
  await expect(page.locator('#continue-oral')).toBeVisible();
  await expect(page.locator('[data-oral-result]')).toHaveCount(0);
  const after = await databaseSnapshot(page);
  expect(after).toEqual(before);

  await page.locator('#continue-oral').click();
  await expect(page.locator('.badge').first()).toContainText('Runde 2 · Frage 1 von 10');
  await page.locator('#stop-oral').click();
  await expect(page.locator('#start-oral')).toBeVisible();
});

test('input, multiple choice and cloze modes still work and save learning progress', async ({ page }) => {
  await loadPreview(page);
  const before = await databaseSnapshot(page);
  await page.locator('[data-mode="input"]').click();
  if (await page.locator('#setup-next').count()) await page.locator('#setup-next').click();
  await page.locator('#start-learning').click();
  await page.locator('#answer-input').fill('not-a-real-translation-xyz');
  await page.locator('#answer-form button[type="submit"]').click();
  await expect(page.locator('.feedback')).toContainText('Noch nicht richtig');
  await page.locator('#next-question').click();
  await expect(page.locator('#answer-input')).toBeVisible();
  await page.locator('#stop-learning').click();

  await page.locator('[data-mode="choice"]').click();
  if (await page.locator('#setup-next').count()) await page.locator('#setup-next').click();
  await page.locator('#start-learning').click();
  await expect(page.locator('.mc-grid button')).toHaveCount(4);
  await page.locator('.mc-grid button').first().click();
  await expect(page.locator('.feedback')).toBeVisible();
  await page.locator('#stop-learning').click();

  await page.locator('[data-mode="cloze"]').click();
  await page.locator('#start-learning').click();
  await expect(page.locator('.mc-grid button')).toHaveCount(4);
  await page.locator('.mc-grid button').first().click();
  await expect(page.locator('.feedback')).toBeVisible();
  await page.locator('#stop-learning').click();

  const after = await databaseSnapshot(page);
  expect(after.reduce((sum, v) => sum + v.history.length, 0))
    .toBe(before.reduce((sum, v) => sum + v.history.length, 0) + 3);
});

test('progress export downloads a valid backup', async ({ page }) => {
  await loadPreview(page);
  await page.locator('nav [data-nav="progress"]').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#export-progress').click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^vokabeltrainer-lernstand-\d{4}-\d\d-\d\d\.json$/);
  const backup = JSON.parse(await readFile(await download.path(), 'utf8'));
  expect(backup.format).toBe('vokabeltrainer-learning-progress');
  expect(backup.progress.length).toBeGreaterThan(100);
  await page.locator('#progress-file').setInputFiles({
    name: 'lernstand.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup))
  });
  await expect(page.getByRole('status')).toContainText('Lernstände wiederhergestellt');
});

test('production and preview store progress separately under the same origin', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('nav [data-nav="learn"]')).toBeVisible();
  await databaseSnapshot(page, 'vokabeltrainer-englisch');
  await loadPreview(page);
  await databaseSnapshot(page, 'vokabeltrainer-englisch-test');
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name));
  expect(dbs).toContain('vokabeltrainer-englisch');
  expect(dbs).toContain('vokabeltrainer-englisch-test');
});

test('mobile and desktop layouts keep all four nav tabs visible in one row', async ({ page }) => {
  await loadPreview(page);
  const state = await page.evaluate(() => {
    const links = [...document.querySelectorAll('.nav button')].map(el => el.getBoundingClientRect());
    const nav = document.querySelector('.nav').getBoundingClientRect();
    return {
      count: links.length,
      rowY: links.map(rect => Math.round(rect.top)),
      fitsWidth: document.documentElement.scrollWidth <= window.innerWidth + 1,
      navVisible: nav.bottom <= window.innerHeight + 1
    };
  });
  expect(state.count).toBe(4);
  expect(new Set(state.rowY).size).toBe(1);
  expect(state.fitsWidth).toBeTruthy();
  expect(state.navVisible).toBeTruthy();
  await page.locator('nav [data-nav="oral"]').click();
  await page.locator('#start-oral').click();
  await expect(page.locator('[data-oral-result="wrong"]')).toBeVisible();
  await expect(page.locator('[data-oral-result="correct"]')).toBeVisible();
});
