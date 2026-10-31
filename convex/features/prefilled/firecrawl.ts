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
  return { value: JSON.parse(line) as unknown, liveUrl: text(res.interactiveLiveViewUrl) }
}

export const endSession = async (scrapeId: string) => {
  await fetch(`${api}/scrape/${scrapeId}/interact`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${keyOrThrow()}` },
  })
}

// Greenhouse embedded on a company site keeps the form in an iframe.
const frame = `const frame = (await page.locator('iframe#grnhse_iframe').count()) ? page.frameLocator('iframe#grnhse_iframe') : page;`

// A pick list's own options. A page can hold other lists, like a phone field's hidden 244
// countries, so this goes by the list the field names, or else the one showing.
const listOf = `const listOf = async (el) => { const id = await el.getAttribute('aria-controls'); return id ? frame.locator('[id=' + JSON.stringify(id) + ']') : frame.locator('[role=listbox]').filter({ visible: true }).first(); };`

export const readFormScript = () => `
${frame}
${listOf}
const out = { login: false, captcha: false, fields: null, submit: null };
const inputs = 'input:not([type=hidden]),select,textarea';
// Ashby keeps its form outside any <form>, so an upload field counts too.
const hasForm = async () => (await frame.locator('form').filter({ has: frame.locator(inputs) }).count()) > 0 || (await frame.locator('input[type=file]').count()) > 0;
if (!(await hasForm())) {
  const apply = page.getByRole('link', { name: /apply/i }).or(page.getByRole('button', { name: /apply/i })).first();
  if (await apply.count()) { await apply.click().catch(() => {}); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500); }
}
out.login = (await frame.locator('input[type=password]').count()) > 0 || /\\/(login|sign-?in)\\b/i.test(page.url());
out.captcha = (await frame.locator('iframe[src*="recaptcha/api2/bframe"], iframe[src*="recaptcha/enterprise/bframe"], iframe[src*="hcaptcha.com"], .cf-turnstile').filter({ visible: true }).count()) > 0;
const read = await frame.locator('body').evaluate((body) => {
  const forms = [...body.querySelectorAll('form')];
  const score = (f) => f.querySelectorAll('input:not([type=hidden]),select,textarea').length + (f.querySelector('input[type=file]') ? 20 : 0);
  const best = forms.sort((a, b) => score(b) - score(a))[0];
  const root = best && score(best) > 0 ? best : body;
  const text = (el) => (el?.textContent ?? '').replace(/\\s+/g, ' ').trim();
  const entryOf = (el) => el.closest('fieldset,.field,[class*=field],[class*=question],.form-group');
  const labelOf = (el) => {
    const byFor = el.id && root.querySelector('label[for="' + CSS.escape(el.id) + '"]');
    const wrap = el.closest('label');
    const near = entryOf(el)?.querySelector('label,legend,[class*=label]');
    return text(byFor) || el.getAttribute('aria-label') || text(wrap) || text(near) || el.placeholder || '';
  };
  const optionOf = (el) => text(el.id && root.querySelector('label[for="' + CSS.escape(el.id) + '"]')) || text(el.closest('label')) || el.value;
  const byName = (el) => '[name=' + JSON.stringify(el.name) + ']';
  const seen = new Set(); const fields = [];
  [...root.querySelectorAll('input:not([type=hidden]),select,textarea,[role=combobox]')].forEach((el, i) => {
    // Not questions: a pick list's hidden twin, a search box, reCAPTCHA's field, autofill's upload.
    if (el.getAttribute('aria-hidden') === 'true' || el.type === 'search' || el.name?.startsWith('g-recaptcha') || el.closest('[class*=autofill]')) return;
    const yesNo = el.type === 'checkbox' && el.name && [...el.parentElement.querySelectorAll(':scope > button')].map(text).join() === 'Yes,No';
    const type = yesNo ? 'yesno' : el.tagName === 'SELECT' ? 'select' : el.tagName === 'TEXTAREA' ? 'textarea' : el.getAttribute('role') === 'combobox' ? 'custom' : (el.type || 'text');
    if (type === 'submit' || type === 'button') return;
    const grouped = (type === 'radio' || type === 'checkbox') && el.name;
    if (grouped && seen.has(el.name)) { const f = fields.find((x) => x.name === el.name); if (f) f.options.push(optionOf(el)); return; }
    if (grouped) seen.add(el.name);
    const own = labelOf(el);
    const head = entryOf(el)?.querySelector('label,legend,[class*=label]');
    // A group's question is its heading: its first input's own label is just an option.
    const legend = grouped ? text(el.closest('fieldset')?.querySelector('legend')) || text(head && !head.contains(el) && head.htmlFor !== el.id ? head : null) : '';
    if (!el.id && !el.name) el.setAttribute('data-jth-field', String(i));
    const selector = grouped || yesNo ? byName(el) : el.id ? '#' + CSS.escape(el.id) : el.name ? byName(el) : '[data-jth-field="' + i + '"]';
    fields.push({ selector, name: el.name || el.id || '', type, label: (legend || own).replace(/\\s*\\*\\s*$/, ''),
      required: el.required || el.getAttribute('aria-required') === 'true' || /\\*\\s*$/.test(own) || /required/i.test(head?.className ?? ''),
      options: type === 'select' ? [...el.options].map((o) => o.text.trim()).filter(Boolean) : yesNo ? ['Yes', 'No'] : grouped ? [optionOf(el)] : [] });
  });
  const submit = root.querySelector('button[type=submit],input[type=submit]') ?? [...root.querySelectorAll('button')].find((b) => /submit|apply|send/i.test(b.textContent ?? ''));
  if (submit && !submit.id && submit.type !== 'submit') submit.setAttribute('data-jth-submit', '');
  return { fields, submit: !submit ? null : submit.id ? '#' + CSS.escape(submit.id) : submit.type === 'submit' ? 'button[type=submit],input[type=submit]' : '[data-jth-submit]' };
});
if (read) {
  out.fields = read.fields; out.submit = read.submit;
  // A pick list shows its options only while it's open. A long one, like every country,
  // is left to type into.
  for (const f of out.fields.filter((x) => x.type === 'custom')) {
    const el = frame.locator(f.selector).first();
    try {
      await el.click({ timeout: 3000 });
      await page.waitForTimeout(300);
      const texts = await (await listOf(el)).locator('[role=option]').allInnerTexts();
      if (texts.length <= 30) f.options = texts.map((t) => t.trim()).filter(Boolean);
      await page.keyboard.press('Escape');
    } catch {}
  }
}
console.log(JSON.stringify(out));
`

export type FillPlan = {
  fills: (Fill & { type: string; label: string })[]
  consent: string[]
  resume?: { url: string; name: string; mimeType: string; selector: string }
  show?: string
}

export const fillScript = (plan: FillPlan) => `
${frame}
${listOf}
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
    else if (f.type === 'yesno') await el.locator('xpath=..').getByRole('button', { name: f.value, exact: true }).click();
    else if (f.type === 'radio' || f.type === 'checkbox') {
      // Scoped to this question's own inputs: another question has its own Yes and No.
      const done = await frame.locator(f.selector).evaluateAll((els, value) => {
        const text = (n) => (n?.textContent ?? '').replace(/\\s+/g, ' ').trim();
        const match = els.find((e) => (text(e.id && e.ownerDocument.querySelector('label[for="' + CSS.escape(e.id) + '"]')) || text(e.closest('label')) || e.value) === value);
        match?.click();
        return Boolean(match);
      }, f.value);
      if (!done) throw new Error('no option ' + f.value);
    } else if (f.type === 'custom') {
      let picked = false;
      for (const value of [f.value, f.fallback].filter(Boolean)) {
        await el.click();
        await el.fill('');
        await page.keyboard.type(value);
        const list = await listOf(el);
        const near = list.locator('[role=option]').filter({ hasText: value }).first();
        // A city search answers from a server, so give it a moment.
        await near.waitFor({ timeout: 2500 }).catch(() => {});
        const exact = list.getByRole('option', { name: value, exact: true });
        const choice = (await exact.count()) ? exact.first() : near;
        if (await choice.count()) { await choice.click({ timeout: 3000 }); picked = true; break; }
      }
      if (!picked) throw new Error('no option for ' + f.value);
    } else await el.fill(f.value);
  } catch (e) { unfilled.push({ label: f.label || f.selector, reason: String(e).slice(0, 120) }); }
}
for (const c of plan.consent) { try { await frame.locator(c).first().check(); } catch (e) { unfilled.push({ label: c, reason: String(e).slice(0, 120) }); } }
await page.keyboard.press('Tab');
// The live view shrinks a wide desktop to fit its pane, so the form is enlarged to stay readable.
for (const root of [page, frame]) await root.locator('html').evaluate((h) => { h.style.zoom = '2'; }, undefined, { timeout: 3000 }).catch(() => {});
if (plan.show) {
  const el = frame.locator(plan.show).first();
  await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await el.focus({ timeout: 3000 }).catch(() => {});
  await el.evaluate((n) => { n.style.outline = '3px solid #7c5cff'; n.style.outlineOffset = '2px'; setTimeout(() => { n.style.outline = ''; n.style.outlineOffset = ''; }, 3000); }, undefined, { timeout: 3000 }).catch(() => {});
}
const errors = await frame.locator('[aria-invalid=true], .field-error, .error-message, [role=alert]').filter({ visible: true }).allInnerTexts().catch(() => []);
console.log(JSON.stringify({ unfilled, errors: errors.map((e) => e.trim()).filter(Boolean).slice(0, 20) }));
`

export const confirmScript = () => `
${frame}
const confirmed = /thank you for (applying|your application)|thanks for applying|application (has been |was )?(submitted|received)|we('ve| have) received your application|successfully (submitted|applied)|vielen dank/i;
const inFrame = await frame.locator('body').innerText().catch(() => '');
const inPage = await page.locator('body').innerText().catch(() => '');
const body = (inFrame + ' ' + inPage).slice(0, 40000);
const match = body.match(confirmed);
const byUrl = /\\/(thanks|confirmation|submitted|success)\\b/i.test(page.url());
console.log(JSON.stringify({ confirmed: Boolean(match) || byUrl, text: (match?.[0] ?? (byUrl ? page.url() : '')).slice(0, 300) }));
`
