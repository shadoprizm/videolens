import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/analyze.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const source = bundle.outputFiles[0].text;
const analyze = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("follow-up requests use the model's supported default sampling settings", async () => {
  let requestBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "The answer [00:00]." } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const answer = await analyze.askQuestion(
      { kind: "byok", apiKey: "test-key" },
      "What happened?",
      { segments: [] },
      null,
    );

    assert.equal(answer, "The answer [00:00].");
    assert.equal(requestBody.model, "gpt-5.6-terra");
    assert.equal(requestBody.temperature, undefined);
    assert.match(requestBody.messages[1].content, /NEW QUESTION: What happened\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("follow-up answers are explicitly requested in the report language", async () => {
  let requestBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({ choices: [{ message: { content: "答案见 [00:00]。" } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const answer = await analyze.askQuestion(
      { kind: "byok", apiKey: "test-key" },
      "发生了什么？",
      { segments: [] },
      null,
      "zh-CN",
    );

    assert.equal(answer, "答案见 [00:00]。");
    assert.match(requestBody.messages[0].content, /简体中文 \(zh-CN\)/);
    assert.equal(requestBody.temperature, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("analysis persists the requested output language", async () => {
  let requestBody;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({
          summary: "中文摘要",
          findings: [],
          recommendations: [],
          tasks: [],
          limitations: [],
          confidence: "high",
        }) } }],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await analyze.analyzeTimeline(
      { kind: "byok", apiKey: "test-key" },
      { segments: [] },
      { sourceType: "youtube", title: "测试", url: null, durationSeconds: 30, limitations: [] },
      "general",
      "总结视频",
      "zh-CN",
    );

    assert.equal(result.outputLanguage, "zh-CN");
    assert.match(requestBody.messages[0].content, /简体中文 \(zh-CN\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("follow-up prompts preserve every new report language", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: "Localized [00:00]." } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    for (const language of ["es", "ro", "hi"]) {
      await analyze.askQuestion({ kind: "byok", apiKey: "test-key" }, "Question", { segments: [] }, null, language);
    }
    assert.match(requests[0].messages[0].content, /Español \(Latinoamérica\) \(es\)/);
    assert.match(requests[1].messages[0].content, /Română \(ro\)/);
    assert.match(requests[2].messages[0].content, /हिन्दी \(hi\)/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
