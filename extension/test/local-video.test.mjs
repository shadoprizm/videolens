import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const load = async (entry, plugins = []) => {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'browser', plugins });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};
const { seekVideoFrame, VideoFrameTimeout } = await load('src/lib/videoFrame.ts');
const local = await load('src/lib/localFile.ts');
class Video extends EventTarget {
  duration = 17.585;
  readyState = 1;
  seeking = false;
  currentTime = 0;
  error = null;
  emit(name) { this.dispatchEvent(new Event(name)); }
}

test('initial frame waits for decoded data even when no seek occurs', async () => {
  const video = new Video();
  const promise = seekVideoFrame(video, 0);
  video.readyState = 2;
  video.emit('loadeddata');
  await promise;
});
test('seeked before decoded data waits for canplay instead of failing', async () => {
  const video = new Video();
  let completed = false;
  const promise = seekVideoFrame(video, 10).then(() => { completed = true; });
  video.emit('seeked');
  await Promise.resolve();
  assert.equal(completed, false);
  video.readyState = 2;
  video.emit('canplay');
  await promise;
});
test('decoded state recovers an omitted media event without a paint callback', async () => {
  const video = new Video();
  const promise = seekVideoFrame(video, 10);
  video.readyState = 2;
  await promise;
});
test('a working decoder taking more than the former three seconds succeeds', async () => {
  const video = new Video();
  const promise = seekVideoFrame(video, 10);
  const timer = setTimeout(() => { video.readyState = 2; video.emit('loadeddata'); }, 3100);
  try { await promise; } finally { clearTimeout(timer); }
});
test('a genuine decoder stall remains bounded and reports the position', async () => {
  await assert.rejects(seekVideoFrame(new Video(), 10.5, 20), error => error instanceof VideoFrameTimeout && /10.50/.test(error.message));
});
test('decode errors and invalid seeks reject promptly', async () => {
  const video = new Video();
  const promise = seekVideoFrame(video, 5);
  video.error = { code: 3 };
  video.emit('error');
  await assert.rejects(promise, /could not decode/);
  Object.defineProperty(video, 'currentTime', { get: () => 0, set: () => { throw new Error('seek rejected'); } });
  video.error = null;
  await assert.rejects(seekVideoFrame(video, 5), /seek rejected/);
});
test('short clips use the requested frame budget and cover the incident interval', () => {
  for (const cap of [8, 20, 40]) {
    const stamps = local.localFrameTimestamps(17.585, cap);
    assert.equal(stamps.length, cap);
    assert.equal(stamps[0], 0);
    assert.ok(stamps.every((t, i) => t < 17.585 && (!i || t > stamps[i - 1])));
  }
  const stamps = local.localFrameTimestamps(17.585, 40);
  assert.ok(stamps.filter(t => t >= 10 && t <= 12).length >= 4);
  assert.equal(local.localFrameTimestamps(3600, 40).length, 40);
});

test('one decoder restart preserves frames and retries the failed moment', async () => {
  const recovery = await load('src/lib/localFile.ts', [{ name: 'controlled-stall', setup(builder) {
    builder.onLoad({ filter: /videoFrame\.ts$/ }, () => ({ contents: `
      export class VideoFrameTimeout extends Error {}
      export async function seekVideoFrame(video, time) {
        globalThis.seekCalls.push([video.name, time]);
        if (video.name === 'original' && time === 1) throw new VideoFrameTimeout();
      }`, loader: 'ts' }));
  } }]);
  const saved = { document: globalThis.document, create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  const revoked = [];
  const makeVideo = name => Object.assign(new Video(), {
    name, videoWidth: 1920, videoHeight: 1080, pause() {}, removeAttribute() {},
    load() { if (this.src) queueMicrotask(() => this.emit('loadedmetadata')); },
  });
  globalThis.seekCalls = [];
  globalThis.document = { createElement: kind => kind === 'video' ? makeVideo('reopened') : {
    getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,test',
  } };
  URL.createObjectURL = () => 'blob:reopened';
  URL.revokeObjectURL = url => revoked.push(url);
  const source = { file: {}, objectUrl: 'blob:original', video: makeVideo('original'), duration: 17.585 };
  try {
    const frames = await recovery.captureLocalFrames(source, [0, 1, 2], () => {});
    assert.deepEqual(frames.map(f => f.timestamp), [0, 1, 2]);
    assert.deepEqual(globalThis.seekCalls, [['original', 0], ['original', 1], ['reopened', 1], ['reopened', 2]]);
    assert.equal(source.video.name, 'reopened');
    assert.deepEqual(revoked, ['blob:original']);
    recovery.closeLocalVideo(source);
    assert.deepEqual(revoked, ['blob:original', 'blob:reopened']);
  } finally {
    globalThis.document = saved.document;
    URL.createObjectURL = saved.create;
    URL.revokeObjectURL = saved.revoke;
    delete globalThis.seekCalls;
  }
});
