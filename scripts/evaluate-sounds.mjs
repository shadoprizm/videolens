// Run with existing Gateway credentials; never prints credentials or raw audio.
// Example: vercel env run -e production -- node /path/to/scripts/evaluate-sounds.mjs /path/to/public-test.wav
import { createRequire } from 'node:module';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(new URL('../site/package.json',import.meta.url));
const {build}=require('esbuild');
if(!process.argv[2])throw Error('Supply a mono PCM16 WAV (16/24 kHz, at most 60 seconds).');
const token=process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
if(!token)throw Error('Run with existing AI Gateway authentication.');
const base=join(root,'site/node_modules/.cache');mkdirSync(base,{recursive:true});const temp=mkdtempSync(join(base,'sound-eval-'));
try{
 await build({entryPoints:[join(root,'site/api/_lib/sound.ts')],bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(temp,'sound.mjs')});
 const {analyzeSound}=await import(pathToFileURL(join(temp,'sound.mjs')));
 const started=Date.now();const result=await analyzeSound(readFileSync(process.argv[2]),{kind:'gateway',token,authMethod:process.env.AI_GATEWAY_API_KEY?'api-key':'oidc'});
 console.log(JSON.stringify({elapsedMs:Date.now()-started,...result},null,2));
}finally{rmSync(temp,{recursive:true,force:true});}
