// @ts-check
import { test, expect } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const checkA11y = async (page) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, `Axe violations:\n${JSON.stringify(results.violations, null, 2)}`).toHaveLength(0);
};

test('has title', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await expect(page).toHaveTitle(/Playwright/);
});

test('get started link', async ({ page }) => {
  await page.goto('https://playwright.dev/');
  await page.getByRole('link', { name: 'Get started' }).click();
  await expect(page.getByRole('heading', { name: 'Installation' })).toBeVisible();
});

test('accessibility scan for WebCP portal', async ({ page }) => {
  await page.goto('https://portal.manage-selfhost.microsoft.com/WebCP', { waitUntil: 'networkidle' });
  await checkA11y(page);
});

test('accessibility scan for microsoft.com', async ({ page }) => {
  await page.goto('https://microsoft.com', { waitUntil: 'networkidle' });
  await checkA11y(page);
});

test('all images have alt text', async ({ page }) => {
  await page.goto('https://portal.manage-selfhost.microsoft.com/WebCP', { waitUntil: 'networkidle' });

  const imagesWithoutAlt = await page.locator('img').evaluateAll((images) =>
    images
      .filter((img) => !img.alt || img.alt.trim() === '')
      .map((img) => img.src || img.outerHTML)
  );

  expect(imagesWithoutAlt, `Images missing alt text: ${imagesWithoutAlt.join(', ')}`).toHaveLength(0);
});

test('ARIA labels are present and valid', async ({ page }) => {
  await page.goto('https://portal.manage-selfhost.microsoft.com/WebCP', { waitUntil: 'networkidle' });

  const invalidAria = await page.locator('[aria-label], [aria-labelledby]').evaluateAll((elements) => {
    const invalid = [];

    elements.forEach((element) => {
      const ariaLabel = element.getAttribute('aria-label');
      const ariaLabelledby = element.getAttribute('aria-labelledby');

      if (ariaLabel !== null && ariaLabel.trim() === '') {
        invalid.push({ selector: element.tagName.toLowerCase(), reason: 'empty aria-label', value: ariaLabel });
      }

      if (ariaLabelledby) {
        const ids = ariaLabelledby.trim().split(/\s+/);
        const missingIds = ids.filter((id) => !document.getElementById(id));

        if (missingIds.length) {
          invalid.push({ selector: element.tagName.toLowerCase(), reason: 'missing aria-labelledby reference', value: missingIds.join(' ') });
        }
      }
    });

    return invalid;
  });

  expect(invalidAria, `Invalid ARIA labels found: ${JSON.stringify(invalidAria, null, 2)}`).toHaveLength(0);
});

test('keyboard navigation using Tab moves focus through interactive controls', async ({ page }) => {
  await page.goto('https://portal.manage-selfhost.microsoft.com/WebCP', { waitUntil: 'networkidle' });

  const focusableElements = await page.evaluate(() => {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled]):not([type="hidden"])',
      'textarea:not([disabled])',
      'select:not([disabled])',
      '[tabindex]:not([disabled])',
    ].join(',');

    return Array.from(document.querySelectorAll(selectors))
      .filter((el) => {
        if (el.hasAttribute('hidden')) return false;
        const style = window.getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none') return false;
        return el.tabIndex >= 0;
      })
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        role: el.getAttribute('role') || null,
        label: el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent?.trim() || null,
      }));
  });

  expect(focusableElements.length, 'Expected at least one focusable element on the page').toBeGreaterThan(0);

  await page.keyboard.press('Tab');

  const actualFocusSequence = [];
  const steps = Math.min(5, focusableElements.length);

  for (let i = 0; i < steps; i++) {
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        role: el.getAttribute('role') || null,
        label: el.getAttribute('aria-label') || el.getAttribute('name') || el.textContent?.trim() || null,
      };
    });
    actualFocusSequence.push(active);
    await page.keyboard.press('Tab');
  }

  expect(actualFocusSequence[0], 'First Tab focus should move to the first focusable element').toEqual(focusableElements[0]);
  expect(actualFocusSequence[1], 'Second Tab focus should move to the second focusable element').toEqual(focusableElements[1]);
  expect(actualFocusSequence.length, 'Expected Tab to move through multiple focusable elements').toBeGreaterThan(1);
});
