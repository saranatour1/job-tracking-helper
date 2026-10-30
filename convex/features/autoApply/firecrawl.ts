// Firecrawl drives the application form: one scrape opens a browser session, then
// `interact` runs Playwright code in it with `page` in scope. Each script prints one
// JSON line, which is read back and checked here before anything trusts it. The page is
// someone else's site: its text is data, never instructions.
import { ConvexError } from "convex/values"
import { apiKeyOf } from "../workflows/sources"
import { post, record, text } from "../workflows/sources/source"
import type { Fill } from "./match"

const api = "https://api.firecrawl.dev/v2"

const keyOrThrow = () => {
  const apiKey = apiKeyOf("firecrawl")
  if (!apiKey) throw new ConvexError("Auto-apply needs a Firecrawl key.")
  return apiKey
}

/** Opens the page in a browser session that later calls can act on. 1 credit. */
export const scrape = async (url: string) => {
  const data = record(
    record(
      await post(
        `${api}/scrape`,
        keyOrThrow(),
        { url, formats: ["markdown"], onlyMainContent: false, waitFor: 2500 },
        (status) => status === 402
      )
    ).data
  )
  const scrapeId = text(record(data.metadata).scrapeId)
  if (!scrapeId) throw new Error("Firecrawl gave no scrape id")
  return { scrapeId, markdown: text(data.markdown) }
}

/** Runs a script in the session and returns the JSON line it printed. */
export const interact = async (scrapeId: string, code: string, timeout: number) => {
  const res = record(
    await post(
      `${api}/scrape/${scrapeId}/interact`,
      keyOrThrow(),
      { code, language: "node", timeout },
      (status) => status === 402
    )
  )
  const out = text(res.result) || text(res.stdout)
  const line = out
    .trim()
    .split("\n")
    .reverse()
    .find((l: string) => l.startsWith("{"))
  if (!line)
    throw new Error(
      `The form script printed nothing${text(res.stderr) ? `: ${text(res.stderr).slice(0, 200)}` : ""}`
    )
  return JSON.parse(line) as unknown
}

export const endSession = async (scrapeId: string) => {
  await fetch(`${api}/scrape/${scrapeId}/interact`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${keyOrThrow()}` },
  })
}

// Greenhouse embedded on a company site keeps the form in an iframe.
const frame = `const frame = (await page.locator('iframe#grnhse_iframe').count()) ? page.frameLocator('iframe#grnhse_iframe') : page;`

/** Finds the application form (clicking Apply if the page hides it) and lists its fields. */
export const readFormScript = () => `
${frame}
const out = { login: false, captcha: false, fields: null, submit: null };
const hasForm = async () => (await frame.locator('form').filter({ has: frame.locator('input,select,textarea') }).count()) > 0;
if (!(await hasForm())) {
  const apply = page.getByRole('link', { name: /apply/i }).or(page.getByRole('button', { name: /apply/i })).first();
  if (await apply.count()) { await apply.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500); }
}
out.login = (await frame.locator('input[type=password]').count()) > 0 || /\\/(login|sign-?in)\\b/i.test(page.url());
out.captcha = (await frame.locator('iframe[src*="recaptcha/api2/bframe"], iframe[src*="hcaptcha.com"], .cf-turnstile').filter({ visible: true }).count()) > 0;
const read = await frame.locator('body').evaluate((body) => {
  const forms = [...body.querySelectorAll('form')];
  const score = (f) => f.querySelectorAll('input:not([type=hidden]),select,textarea').length + (f.querySelector('input[type=file]') ? 20 : 0);
  const form = forms.sort((a, b) => score(b) - score(a))[0];
  if (!form) return null;
  const text = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
  const labelOf = (el) => {
    const byFor = el.id && form.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    const wrap = el.closest('label');
    const near = el.closest('fieldset,.field,[class*=field],[class*=question],.form-group')?.querySelector('label,legend,[class*=label]');
    return text(byFor) || el.getAttribute('aria-label') || text(wrap) || text(near) || el.placeholder || '';
  };
  const seen = new Set(); const fields = [];
  [...form.querySelectorAll('input:not([type=hidden]),select,textarea,[role=combobox]')].forEach((el, i) => {
    const type = el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.getAttribute('role') === 'combobox' ? 'custom' : (el.type || 'text');
    if (type === 'submit' || type === 'button') return;
    const grouped = (type === 'radio' || type === 'checkbox') && el.name;
    if (grouped && seen.has(el.name)) { const f = fields.find((x) => x.name === el.name); if (f) f.options.push(text(el.closest('label')) || el.value); return; }
    if (grouped) seen.add(el.name);
    const own = labelOf(el);
    const legend = grouped ? text(el.closest('fieldset')?.querySelector('legend')) : '';
    const selector = el.id ? '#' + CSS.escape(el.id) : el.name ? '[name="' + el.name + '"]' : 'form input,form select,form textarea >> nth=' + i;
    fields.push({ selector, name: el.name || '', type, label: (legend || own).replace(/\\s*\\*\\s*$/, ''),
      required: el.required || el.getAttribute('aria-required') === 'true' || /\\*\\s*$/.test(own),
      options: type === 'select' ? [...el.options].map((o) => o.text.trim()).filter(Boolean) : grouped ? [text(el.closest('label')) || el.value] : [] });
  });
  const submit = form.querySelector('button[type=submit],input[type=submit]') ?? [...form.querySelectorAll('button')].find((b) => /submit|apply|send/i.test(b.textContent ?? ''));
  return { fields, submit: submit ? (submit.id ? '#' + CSS.escape(submit.id) : 'form button[type=submit]') : null };
});
if (read) { out.fields = read.fields; out.submit = read.submit; }
console.log(JSON.stringify(out));
`

export type FillPlan = {
  fills: (Fill & { type: string })[]
  consent: string[]
  resume?: { url: string; name: string; mimeType: string; selector: string }
}

/** Uploads the resume, fills every planned field, ticks consent boxes, and reads back
 * what didn't stick. The plan is data in the script; JSON.stringify keeps it inert. */
export const fillScript = (plan: FillPlan) => `
${frame}
const plan = ${JSON.stringify(plan)};
const unfilled = [];
if (plan.resume) {
  try {
    const res = await page.request.get(plan.resume.url);
    const buffer = await res.body();
    await frame.locator(plan.resume.selector).first().setInputFiles({ name: plan.resume.name, mimeType: plan.resume.mimeType, buffer });
    await page.waitForTimeout(3000);
  } catch (e) { unfilled.push({ label: 'Resume', reason: String(e).slice(0, 120) }); }
}
for (const f of plan.fills) {
  const el = frame.locator(f.selector).first();
  try {
    if (f.type === 'select') await el.selectOption({ label: f.value });
    else if (f.type === 'radio' || f.type === 'checkbox') await frame.getByLabel(f.value, { exact: false }).first().check();
    else if (f.type === 'custom') {
      await el.click();
      await page.keyboard.type(f.value);
      await frame.locator('[role=option]').filter({ hasText: f.value }).first().click({ timeout: 3000 });
    } else await el.fill(f.value);
  } catch (e) { unfilled.push({ label: f.selector, reason: String(e).slice(0, 120) }); }
}
for (const c of plan.consent) { try { await frame.locator(c).first().check(); } catch (e) { unfilled.push({ label: c, reason: String(e).slice(0, 120) }); } }
await page.keyboard.press('Tab');
const errors = await frame.locator('[aria-invalid=true], .field-error, .error-message, [role=alert]').filter({ visible: true }).allInnerTexts().catch(() => []);
console.log(JSON.stringify({ unfilled, errors: errors.slice(0, 20) }));
`

/** Clicks submit and watches for a confirmation, an error, or a CAPTCHA. */
export const submitScript = (submit: string | null | undefined) => `
${frame}
const before = page.url();
await frame.locator(${JSON.stringify(submit || "form button[type=submit]")}).first().click();
const deadline = Date.now() + 25000;
let outcome = 'unknown', found = '';
const confirmed = /thank you for (applying|your application)|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)|vielen dank/i;
while (Date.now() < deadline) {
  await page.waitForTimeout(1000);
  const body = (await page.locator('body').innerText().catch(() => '')).slice(0, 20000);
  const url = page.url();
  if (await page.locator('iframe[src*="hcaptcha.com"], iframe[src*="recaptcha/api2/bframe"]').filter({ visible: true }).count()) { outcome = 'captcha'; break; }
  const errs = await frame.locator('[aria-invalid=true], .field-error, .error-message, [role=alert]').filter({ visible: true }).allInnerTexts().catch(() => []);
  if (errs.length) { outcome = 'errors'; found = errs.join(' | '); break; }
  if ((url !== before && /thanks|confirmation|submitted|success/i.test(url)) || confirmed.test(body)) {
    outcome = 'confirmed'; found = (body.match(confirmed)?.[0] ?? body.slice(0, 300)); break;
  }
}
console.log(JSON.stringify({ outcome, url: page.url(), text: found.slice(0, 500) }));
`
