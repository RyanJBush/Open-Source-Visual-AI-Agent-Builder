import {LABEL, LIMIT, PROVIDERS, TYPES, parseWorkflow, plan, providerSpec} from './contract.mjs';

const $ = id => document.getElementById(id);
const icons = {input:'↳',prompt:'{ }',model:'✧',output:'↗'};
const descriptions = {input:'Text request',prompt:'Literal template',output:'Text result'};
const describe = n => n.type !== 'model' ? descriptions[n.type] : n.config.model + ' · ' + (providerSpec(n.config.provider)?.short ?? 'unknown provider');
const modeNames = {'classify':'Classify request','simulate-failure':'Simulate provider failure'};
const defaults = [{x:42,y:50},{x:315,y:50},{x:315,y:225},{x:586,y:225}];
let workflow, selected, source, revision = 0, running = false, scale = 1, fit = true, overview = false;
const position = n => n.position ?? defaults[TYPES.indexOf(n.type)];
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function button(title, action, cls) {
  const b = el('button',cls,title);
  b.type = 'button';
  b.onclick = action;
  return b;
}
function notice(text = '') { $('notice').textContent = text; $('notice').hidden = !text; }
function validate() {
  let error;
  try { plan(workflow); } catch (err) { error = err.message; }
  $('valid').textContent = error || '● Valid workflow';
  $('valid').className = error ? 'bad' : 'good';
  $('run').disabled = !!error || running;
  $('export').disabled = !!error;
}
function changed() {
  revision++;
  notice();
  $('run-state').textContent = 'Idle';
  $('trace-body').replaceChildren(el('p','muted','Run the workflow to inspect each step.'));
  validate();
}
function selectNode(id) {
  selected = id;
  for (const b of $('nodes').children) {
    b.classList.toggle('selected',b.dataset.id === id);
    b.querySelector('.node-main').setAttribute('aria-pressed',String(b.dataset.id === id));
  }
  inspector();
}
function layout() {
  const width = Math.max(830,...workflow.nodes.map(n => position(n).x + 239));
  const height = Math.max(345,...workflow.nodes.map(n => position(n).y + 115));
  if (fit) {
    const widthScale = $('viewport').clientWidth / width;
    scale = overview ? Math.min(1,widthScale,$('viewport').clientHeight / height) : Math.min(1,Math.max(.69,widthScale));
  }
  $('plane').style.width = width + 'px';
  $('plane').style.height = height + 'px';
  $('plane').style.zoom = scale;
  for (const box of $('nodes').children) {
    const n = workflow.nodes.find(v => v.id === box.dataset.id);
    box.style.left = position(n).x + 'px';
    box.style.top = position(n).y + 'px';
  }
  const paths = workflow.edges.flatMap(edge => {
    const a = position(workflow.nodes.find(n => n.id === edge.from));
    const b = position(workflow.nodes.find(n => n.id === edge.to));
    const x = a.x + 202, y = a.y + 43, u = b.x, v = b.y + 43;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');
    const mid = (y+v)/2;
    const d = u > x || Math.abs(y-v) < 60
      ? 'M '+x+' '+y+' C '+(x+45)+' '+y+' '+(u-45)+' '+v+' '+u+' '+v
      : 'M '+x+' '+y+' Q '+(x+25)+' '+y+' '+(x+25)+' '+(y+(mid-y)/2)+' T '+x+' '+mid+' H '+u+' Q '+(u-25)+' '+mid+' '+(u-25)+' '+(mid+(v-mid)/2)+' T '+u+' '+v;
    path.setAttribute('d',d);
    const arrow = document.createElementNS('http://www.w3.org/2000/svg','path');
    arrow.setAttribute('d','M '+(u-20)+' '+(v-4)+' l 7 4 -7 4');
    return [path,arrow];
  });
  $('wires').replaceChildren(...paths);
}
function connect(id,side) {
  if (side === 'out') {
    source = source === id ? null : id;
    notice(source ? 'Select the incoming port on the destination node.' : '');
  } else if (source) {
    const edge = {from:source,to:id};
    source = null;
    if (workflow.edges.some(e => e.from === edge.from || e.to === edge.to))
      notice('Disconnect the existing edge on that port first.');
    else {
      workflow.edges.push(edge);
      changed();
    }
  } else notice('Select an outgoing port first.');
  draw();
}
function draggable(box,n) {
  box.addEventListener('pointerdown',event => {
    if (event.button !== 0 || event.target.closest('.port')) return;
    selectNode(n.id);
    const start = {...position(n)}, x = event.clientX, y = event.clientY;
    let moved = false;
    box.setPointerCapture(event.pointerId);
    function move(e) {
      if (Math.abs(e.clientX-x) + Math.abs(e.clientY-y) < 3 && !moved) return;
      moved = true;
      fit = false;
      const coord = (v,delta) => Math.max(0,Math.min(2400,Math.round(v + delta/scale)));
      n.position = {x:coord(start.x,e.clientX-x),y:coord(start.y,e.clientY-y)};
      layout();
    }
    function finish() {
      box.removeEventListener('pointermove',move);
      box.removeEventListener('lostpointercapture',finish);
    }
    box.addEventListener('pointermove',move);
    box.addEventListener('lostpointercapture',finish);
  });
}
function draw() {
  $('nodes').replaceChildren(...workflow.nodes.map(n => {
    const box = el('div','node '+n.type);
    box.dataset.id = n.id;
    const glyph = el('span','glyph',icons[n.type]);
    glyph.setAttribute('aria-hidden','true');
    const main = button('',() => selectNode(n.id),'node-main');
    main.setAttribute('aria-label','Inspect '+LABEL[n.type]);
    main.append(el('span','node-name',LABEL[n.type]),el('span','node-desc',describe(n)));
    box.append(glyph,main);
    for (const side of ['in','out']) {
      if ((side === 'in' && n.type === 'input') || (side === 'out' && n.type === 'output')) continue;
      const port = button('',() => connect(n.id,side),'port '+side);
      port.classList.toggle('active',side === 'out' && source === n.id);
      port.setAttribute('aria-label',LABEL[n.type]+' '+(side === 'in' ? 'incoming' : 'outgoing')+' port');
      port.title = port.getAttribute('aria-label');
      box.append(port);
    }
    draggable(box,n);
    return box;
  }));
  layout();
  selectNode(selected);
  validate();
}
function inspector() {
  const n = workflow.nodes.find(node => node.id === selected);
  const panel = $('inspector');
  panel.replaceChildren(el('span','glyph '+n.type,icons[n.type]),el('h3','',LABEL[n.type]),el('p','hint',n.id+' · '+describe(n)));
  if (n.type === 'input' || n.type === 'prompt') {
    const input = n.type === 'input', key = input ? 'text' : 'template';
    const field = el('textarea'), label = el('label','',input ? 'Synthetic request' : 'Prompt template');
    field.id = 'config-text'; label.htmlFor = field.id; field.value = n.config[key];
    field.maxLength = input ? LIMIT.input : LIMIT.template;
    field.oninput = () => { n.config[key] = field.value; changed(); };
    panel.append(label,field,el('p','hint',input ? 'Use synthetic text without credentials.' : 'Insert {{input}} once to include the request.'));
  } else if (n.type === 'model') {
    const spec = providerSpec(n.config.provider);
    const providerLabel = el('label','','Provider'), provider = el('select');
    provider.id = 'provider'; providerLabel.htmlFor = provider.id;
    for (const [p,s] of Object.entries(PROVIDERS)) provider.add(new Option(s.name+' · '+s.models[0],p));
    provider.value = n.config.provider;
    provider.onchange = () => {
      const next = PROVIDERS[provider.value];
      n.config.provider = provider.value; n.config.model = next.models[0];
      if (!next.modes.includes(n.config.mode)) n.config.mode = next.modes[0];
      changed(); draw();
    };
    const label = el('label',''), mode = el('select');
    label.textContent = n.config.provider === 'local-stub' ? 'Stub behavior' : 'Behavior';
    mode.id = 'mode'; label.htmlFor = mode.id;
    for (const v of spec?.modes ?? []) mode.add(new Option(modeNames[v],v));
    mode.value = n.config.mode;
    mode.onchange = () => { n.config.mode = mode.value; changed(); };
    const hint = n.config.provider === 'local-stub' ? 'Local deterministic provider. One call per run.'
      : 'Runs on this computer through Ollama. The server must be started with RELAY_ENABLE_OLLAMA=1. One call per run.';
    panel.append(providerLabel,provider,label,mode,el('p','hint',hint));
  } else panel.append(el('p','hint','Returns the text received from the model.'));
  panel.append(el('div','subhead','Connections'));
  const links = workflow.edges.filter(e => e.from === n.id || e.to === n.id);
  if (!links.length) panel.append(el('p','hint','No connected ports.'));
  for (const edge of links) {
    const label = id => LABEL[workflow.nodes.find(node => node.id === id).type];
    const row = el('div','edge');
    row.append(el('span','',label(edge.from)+' → '+label(edge.to)),button('Disconnect',() => {
      workflow.edges = workflow.edges.filter(e => e !== edge);
      source = null; changed(); draw();
    }));
    panel.append(row);
  }
}
function trace(result) {
  $('run-state').textContent = result.status + ' · '+result.calls+' model call'+(result.calls === 1 ? '' : 's')+' · '+(providerSpec(result.provider)?.short ?? result.provider);
  const list = el('div','steps');
  for (const step of result.steps) {
    const item = el('div','step '+step.state);
    item.append(el('strong','',LABEL[step.type]),el('small','',step.state),el('pre','',step.error ?? step.text ?? 'Downstream step skipped.'));
    list.append(item);
  }
  $('trace-body').replaceChildren(list);
}
$('run').onclick = async () => {
  const rev = revision;
  running = true; validate(); notice(); $('run-state').textContent = 'Running…';
  try {
    const response = await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(workflow),signal:AbortSignal.timeout(LIMIT.clientMs)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    if (rev === revision) trace(data);
  } catch (err) {
    if (rev === revision) {
      $('run-state').textContent = 'Request failed';
      $('trace-body').replaceChildren();
      notice(err.message);
    }
  } finally { running = false; validate(); }
};
$('export').onclick = () => {
  $('json-preview').value = JSON.stringify(workflow,null,2)+'\n';
  $('export-dialog').showModal();
};
$('close-export').onclick = () => $('export-dialog').close();
$('save-json').onclick = () => {
  const url = 'data:application/json;charset=utf-8,'+encodeURIComponent($('json-preview').value);
  const link = el('a'); link.href = url; link.download = 'relay-workflow.json'; document.body.append(link); link.click(); link.remove();
};
$('import').onclick = () => $('file').click();
$('file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    if (file.size > LIMIT.bytes) throw new Error('Workflow exceeds the 32 KiB limit.');
    load(parseWorkflow(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())));
  } catch (err) { notice('Import rejected. '+err.message); }
};
function load(data) {
  workflow = data; selected = workflow.nodes.find(n => n.type === 'input').id; source = null; fit = true; overview = false;
  changed(); draw();
}
$('fit').onclick = () => { fit = true; overview = true; layout(); $('viewport').scrollTo(0,0); };
new ResizeObserver(() => { if (workflow) layout(); }).observe($('viewport'));
try {
  const response = await fetch('/example.json');
  if (!response.ok) throw new Error('Could not load the synthetic fixture.');
  load(parseWorkflow(await response.text()));
} catch (err) { notice(err.message); }
