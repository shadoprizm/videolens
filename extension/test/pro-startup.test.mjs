import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/pro.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const pro = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function mockChrome(localState, containsPermission) {
  let permissionRequests = 0;
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({ ...localState }),
        set: async () => undefined,
        remove: async () => undefined,
      },
    },
    permissions: {
      contains: containsPermission,
      request: async () => {
        permissionRequests += 1;
        throw new Error("Permission prompts require a user gesture.");
      },
    },
  };
  return () => permissionRequests;
}

test("startup recovery never requests optional permission without a user gesture", async () => {
  const permissionRequests = mockChrome(
    { proPairingNonce: "stale-pairing", proDeviceId: "device-1" },
    async () => false,
  );
  const originalFetch = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = async () => {
    fetches += 1;
    throw new Error("fetch should not run");
  };

  try {
    assert.equal(await pro.resumeProConnection(20), null);
    assert.equal(permissionRequests(), 0);
    assert.equal(fetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("startup recovery stops a hanging Pro request at its deadline", async () => {
  mockChrome(
    { proPairingNonce: "pending-pairing", proDeviceId: "device-1" },
    async () => true,
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () => {
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });

  const startedAt = Date.now();
  try {
    assert.equal(await pro.resumeProConnection(25), null);
    assert.ok(Date.now() - startedAt < 500, "recovery should not hang past its deadline");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Firefox requests the optional account data permission with Pro access", async () => {
  const originalChrome = globalThis.chrome;
  let requested;
  globalThis.chrome = {
    runtime: { getURL: () => "moz-extension://videolens/" },
    permissions: {
      contains: async () => false,
      request: async (permissions) => {
        requested = permissions;
        return true;
      },
    },
  };

  try {
    assert.equal(await pro.ensureProHostPermission(), true);
    assert.deepEqual(requested, {
      origins: ["https://videolens.io/*"],
      data_collection: ["personallyIdentifyingInfo"],
    });
  } finally {
    globalThis.chrome = originalChrome;
  }
});

test("Firefox declining optional diagnostics still completes a failed report without prompting", async () => {
  const originalChrome=globalThis.chrome, originalFetch=globalThis.fetch;
  let sent, prompts=0;
  globalThis.chrome={runtime:{getURL:()=>"moz-extension://videolens/"},permissions:{contains:async()=>false,request:async()=>{prompts++;return false;}}};
  globalThis.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return Response.json({ok:true});};
  try {
    await pro.completeManagedReport("fixture","report",null,false,true,{stage:"frames",code:"source",sourceType:"local_file",mode:"tutorial"});
    assert.equal(sent.status,"failed");assert.equal(sent.sourceType,"local_file");assert.equal(sent.mode,"tutorial");assert.equal(sent.failureStage,undefined);assert.equal(sent.failureCode,undefined);assert.equal(prompts,0);
  } finally {globalThis.chrome=originalChrome;globalThis.fetch=originalFetch;}
});

test("Firefox feedback is not transmitted when optional interaction consent is declined", async () => {
  const originalChrome=globalThis.chrome, originalFetch=globalThis.fetch;
  let fetches=0, requested;
  globalThis.chrome={runtime:{getURL:()=>"moz-extension://videolens/"},permissions:{request:async(p)=>{requested=p;return false;}}};
  globalThis.fetch=async()=>{fetches++;return Response.json({ok:true});};
  try {await assert.rejects(pro.submitReportFeedback("fixture","report","helpful"),/declined/);assert.equal(fetches,0);assert.deepEqual(requested,{data_collection:["technicalAndInteraction"]});}
  finally {globalThis.chrome=originalChrome;globalThis.fetch=originalFetch;}
});

test("Firefox consented diagnostics and feedback are bounded to the managed report", async () => {
  const originalChrome=globalThis.chrome, originalFetch=globalThis.fetch;
  const sent=[];
  globalThis.chrome={runtime:{getURL:()=>"moz-extension://videolens/"},permissions:{contains:async()=>true,request:async()=>true}};
  globalThis.fetch=async(_url,init)=>{sent.push(JSON.parse(init.body));return Response.json({ok:true});};
  try {await pro.completeManagedReport("fixture","report",null,false,true,{stage:"frames",code:"source",sourceType:"local_file",mode:"tutorial"});await pro.submitReportFeedback("fixture","report","helpful");assert.equal(sent[0].failureStage,"frames");assert.equal(sent[0].failureCode,"source");assert.deepEqual(sent[1],{event:"feedback_helpful",reportId:"report"});}
  finally {globalThis.chrome=originalChrome;globalThis.fetch=originalFetch;}
});
