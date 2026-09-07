/**
 * e2e-check.mjs
 * Recorre el flujo completo en un navegador real contra el build de demo:
 * cargar → autocorregir → corregir a mano → registrar → bitácora → móvil.
 *
 *   npx vite preview --config vite.demo.config.ts --port 4173
 *   node e2e-check.mjs
 */

import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

const errors = [];
page.on('pageerror', (error) => errors.push('PAGEERROR: ' + error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto('http://localhost:4173/', { waitUntil: 'domcontentloaded' });
await page.screenshot({ path: '/tmp/s0-upload.png' });

await page.getByRole('button', { name: /lote de ejemplo/i }).click();
await page.waitForSelector('text=ERRORES PENDIENTES', { timeout: 15000 });
await page.getByRole('button', { name: /Autocorregir todo/i }).click();
await page.waitForTimeout(600);

await page.getByRole('button', { name: /^Todas/ }).click();
await page.waitForTimeout(300);

async function editCell(excelRow, headerText, value) {
  const headers = (await page.locator('thead th').allInnerTexts()).map((h) => h.trim());
  const index = headers.findIndex((h) => h === headerText);
  if (index < 0) throw new Error(`No existe la columna «${headerText}»: ${JSON.stringify(headers)}`);

  const row = page.locator('tbody tr').filter({
    has: page.locator(`td:first-child span:text-is("${excelRow}")`),
  });
  const cell = row.locator('td').nth(index);
  await cell.dblclick();

  const field = cell.locator('input, select').first();
  const tag = await field.evaluate((node) => node.tagName);
  if (tag === 'SELECT') await field.selectOption(value);
  else await field.fill(value);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
}

await editCell('6', 'Lugar de expedición', 'Zipaquirá');
await editCell('6', 'Número de documento', '1026286999');
await editCell('5', 'Intensidad horaria', '120');
await editCell('5', 'Folio', '');
await editCell('5', 'Registro', '');
await page.waitForTimeout(400);

const audited = await page.locator('body').innerText();
console.log('¿lote perfecto?', audited.includes('Lote perfecto'));
await page.screenshot({ path: '/tmp/s1-clean.png' });

await page.getByPlaceholder('Nombre y grado').fill('CN Registro y Control');
await page.getByRole('button', { name: /Continuar al registro/i }).click();
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/s2-confirm.png' });

await page.getByRole('button', { name: /Generar Registro Oficial/i }).click();
await page.waitForSelector('text=Registro oficial generado', { timeout: 15000 });
await page.waitForTimeout(400);
await page.screenshot({ path: '/tmp/s3-receipt.png' });

const receipt = await page.locator('body').innerText();
console.log('código:', (receipt.match(/REG-\d{4}-\d{4}-\d{3}/) || [])[0]);
console.log('ubicación:', (receipt.match(/Libro \d+, folio \d+, registros \d+ a \d+/) || [])[0]);

await page.getByRole('button', { name: /Bitácora/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: '/tmp/s4-log.png' });
console.log('bitácora tiene el lote:', (await page.locator('body').innerText()).includes('REG-'));

await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
const mobile = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect();
    if (rect.right > vw + 1) {
      const parent = el.parentElement;
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 70),
        right: Math.round(rect.right),
        parentOverflowX: parent ? getComputedStyle(parent).overflowX : null,
      });
    }
  }
  return { vw, scrollWidth: document.documentElement.scrollWidth, offenders: offenders.slice(0, 5) };
});
console.log('móvil:', JSON.stringify(mobile, null, 1));
await page.screenshot({ path: '/tmp/s5-mobile.png' });

const relevant = errors.filter((error) => !/fonts\.g(oogleapis|static)\.com|ERR_TUNNEL/.test(error));
console.log('errores de consola:', relevant.length ? relevant : 'ninguno');

await browser.close();
