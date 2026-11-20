import {open} from 'node:fs/promises';
import {LIMIT, parseWorkflow} from './public/contract.mjs';
import {execute} from './engine.mjs';

try {
  if (process.argv.length !== 3) throw new Error('Usage: node cli.mjs PATH_TO_WORKFLOW.json');
  const handle = await open(process.argv[2],'r');
  let bytes;
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Choose a workflow file.');
    const buffer = Buffer.alloc(LIMIT.bytes + 1);
    let size = 0;
    while (size < buffer.length) {
      const {bytesRead} = await handle.read(buffer,size,buffer.length-size,null);
      if (!bytesRead) break;
      size += bytesRead;
    }
    if (size > LIMIT.bytes) throw new Error('Workflow exceeds the 32 KiB limit.');
    bytes = buffer.subarray(0,size);
  } finally { await handle.close(); }
  const result = await execute(parseWorkflow(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));
  console.log(JSON.stringify(result,null,2));
  process.exitCode = result.status === 'succeeded' ? 0 : 1;
} catch (err) {
  console.error(JSON.stringify({error:err.message}));
  process.exitCode = 2;
}
