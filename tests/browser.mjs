import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {listen} from '../server.mjs';
import {dispatch} from './transport.mjs';

const require = createRequire(import.meta.url);
const paths = [process.env.RELAY_BROWSER_MODULES || process.cwd()];
const version = require(require.resolve('playwright-core/package.json',{paths})).version;
assert.equal(version,'1.63.0','Install the pinned optional browser driver.');
const {chromium} = require(require.resolve('playwright-core',{paths}));
const routed = process.argv.includes('--in-process');
const dir = await mkdtemp(join(tmpdir(),'relay-check-'));
let server, browser;
try {
  let port = 4316;
  if (!routed) {
    server = listen(0); await once(server,'listening'); port = server.address().port;
  }
  const origin = 'http://127.0.0.1:'+port;
  browser = await chromium.launch({channel:process.env.RELAY_BROWSER_CHANNEL || 'chrome',headless:true,downloadsPath:dir});
  const page = await browser.newPage({viewport:{width:1360,height:850},acceptDownloads:true});
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror',err => errors.push(err.message));
  if (routed) await page.route(origin+'/**',async route => {
    const u = new URL(route.request().url());
    if (u.origin !== origin) return route.abort();
    const request = route.request(), data = request.postDataBuffer();
    const res = await dispatch(request.method(),u.pathname+u.search,request.headers(),data ? [data] : [],port);
    await route.fulfill(res);
  });
  const btn = name => page.getByRole('button',{name,exact:true});
  const run = async () => {
    const pending = page.waitForResponse(r => r.url() === origin+'/api/run');
    await btn('Run workflow').click();
    const response = await pending; assert.equal(response.status(),200);
    const trace = await response.json();
    await page.waitForFunction(status => document.querySelector('#run-state').textContent.startsWith(status),trace.status);
    assert.deepEqual(await page.locator('.step small').allTextContents(),trace.steps.map(s => s.state));
    assert.deepEqual(await page.locator('.step pre').allTextContents(),trace.steps.map(s => s.error ?? s.text ?? 'Downstream step skipped.'));
    return trace;
  };
  const cli = path => spawnSync(process.execPath,['cli.mjs',path],{encoding:'utf8'});
  await page.goto(origin);
  await btn('Run workflow').waitFor();
  const baseline = await run(), reference = cli('examples/support.json');
  assert.equal(reference.status,0,reference.stderr);
  assert.deepEqual(baseline,JSON.parse(reference.stdout));
  console.log('PASS rendered default trace equals CLI fixture');
  await page.getByLabel('Synthetic request').fill('My login is locked.');
  const edited = await run(); assert.equal(edited.output,'account');
  const before = await page.locator('[data-id="ticket"]').boundingBox();
  await page.mouse.move(before.x+55,before.y+30); await page.mouse.down();
  await page.mouse.move(before.x+87,before.y+54,{steps:4}); await page.mouse.up();
  const after = await page.locator('[data-id="ticket"]').boundingBox();
  assert.ok(after.x > before.x+10 && after.y > before.y+10);
  assert.deepEqual(await run(),edited);
  console.log('PASS input editing and pointer drag preserve expected behavior');
  await btn('Disconnect').click();
  assert.equal(await btn('Run workflow').isDisabled(),true);
  assert.match(await page.locator('#valid').textContent(),/three edges/);
  await btn('Input outgoing port').click(); await btn('Prompt Template incoming port').click();
  assert.deepEqual(await run(),edited);
  console.log('PASS visual disconnect, validation and port reconnection');
  await btn('Inspect Prompt Template').click();
  await page.getByLabel('Prompt template',{exact:true}).fill('Request text: {{env}}');
  assert.equal(await btn('Run workflow').isDisabled(),true);
  await page.getByLabel('Prompt template',{exact:true}).fill('Request text: {{input}}');
  const configured = await run(); assert.equal(configured.steps[1].text,'Request text: My login is locked.');
  await btn('Export JSON').click();
  const path = join(dir,'relay-workflow.json');
  const serialized = await page.getByLabel('Workflow JSON').inputValue();
  const downloading = page.waitForEvent('download');
  await btn('Download JSON').click();
  const download = await downloading;
  assert.equal(download.suggestedFilename(),'relay-workflow.json');
  if (!routed || process.argv.includes('--check-download')) {
    await download.saveAs(path);
    assert.equal(await readFile(path,'utf8'),serialized);
  } else {
    const data = download.url();
    assert.ok(data.startsWith('data:application/json;charset=utf-8,'));
    const payload = decodeURIComponent(data.slice(data.indexOf(',')+1));
    assert.equal(payload,serialized);
    await writeFile(path,payload);
  }
  await btn('Close').click();
  const fromFile = cli(path);
  assert.equal(fromFile.status,0,fromFile.stderr); assert.deepEqual(JSON.parse(fromFile.stdout),configured);
  const file = JSON.parse(await readFile(path,'utf8'));
  assert.notEqual(file.nodes[0].position.x,42);
  await page.reload(); assert.equal((await run()).output,'billing');
  await page.locator('#file').setInputFiles(path);
  await page.waitForFunction(() => document.querySelector('#config-text')?.value === 'My login is locked.');
  assert.deepEqual(await run(),configured);
  await page.locator('#file').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  await page.getByRole('alert').filter({hasText:'Import rejected.'}).waitFor();
  assert.deepEqual(await run(),configured);
  console.log('PASS configured export, CLI replay, import and invalid import retention');
  await btn('Inspect Model').click();
  await page.getByLabel('Stub behavior').selectOption('simulate-failure');
  const failure = await run();
  assert.deepEqual(failure.steps.map(s=>s.state),['succeeded','succeeded','failed','skipped']);
  assert.match(await page.locator('.step.failed').textContent(),/Model.*Stub provider failed/);
  console.log('PASS failed model and skipped output rendered');
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await btn('Fit canvas').click();
  const fitted = await page.locator('[data-id="label"]').boundingBox();
  assert.ok(fitted.x+fitted.width <= 390);
  await btn('Inspect Input').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.getByLabel('Synthetic request').inputValue(),'My login is locked.');
  console.log('PASS narrow viewport and keyboard node selection');
  if (process.env.RELAY_CAPTURE) {
    await page.setViewportSize({width:1360,height:850}); await page.reload(); await run();
    await page.screenshot({path:process.env.RELAY_CAPTURE,fullPage:true});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS no uncaught page errors; Chrome '+browser.version()+'; transport '+(routed?'in-process handler':'live loopback HTTP'));
} finally {
  if (browser) await browser.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(dir,{recursive:true,force:true});
}
