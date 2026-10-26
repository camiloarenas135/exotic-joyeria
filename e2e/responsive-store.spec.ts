import { test as base, expect } from '@playwright/test';

const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => localStorage.setItem('vip_registered', 'x'));
    await use(page);
  },
});

const PAGES = ['/', '/catalogo', '/categoria/anillos', '/categoria/insumos?page=2', '/buscar?q=anillo', '/emprendedor', '/mayoristas', '/ruta-inexistente'];
const WIDTHS = [360, 412, 768];

for (const width of WIDTHS) {
  for (const url of PAGES) {
    test(`sin scroll horizontal a ${width}px: ${url}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(url);
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        offenders: [...document.querySelectorAll('main *, header *')]
          .filter((e) => {
            const b = e.getBoundingClientRect();
            return b.width > 0 && b.right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed';
          })
          .slice(0, 4)
          .map((e) => `${e.tagName}.${String(e.className).slice(0, 50)}`),
      }));
      expect(r.sw, JSON.stringify(r.offenders)).toBeLessThanOrEqual(r.iw);
    });
  }
}
