import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudio } from '../src/audio.js';

// Minimal stand-in for the browser's AudioContext.
function fakeContext(state) {
  const node = () => ({
    connect() {}, start() {}, stop() {},
    gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  });
  const ctx = {
    state, currentTime: 0, sampleRate: 8000, destination: {}, resumes: 0,
    resume() { ctx.resumes++; ctx.state = 'running'; return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; return Promise.resolve(); },
    createGain: node, createOscillator: node, createBufferSource: node, createBiquadFilter: node,
    createDynamicsCompressor: node,
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len) }),
  };
  return ctx;
}
function withContext(state, fn) {
  const ctx = fakeContext(state);
  globalThis.AudioContext = function AudioContext() { return ctx; };
  try { fn(ctx); } finally { delete globalThis.AudioContext; }
}

test('unlock resumes a suspended context', () => {
  withContext('suspended', (ctx) => {
    const audio = createAudio();
    audio.unlock();
    assert.equal(ctx.resumes, 1);
  });
});

test('unlock also recovers from an iOS interruption', () => {
  withContext('running', (ctx) => {
    const audio = createAudio();
    audio.unlock();
    ctx.state = 'interrupted';
    assert.equal(audio.play('tap'), false);
    audio.unlock();
    assert.equal(ctx.resumes, 1);
    assert.equal(audio.play('tap'), true);
  });
});

test('every sound can be synthesised, and mute silences them', () => {
  withContext('running', (ctx) => {
    const audio = createAudio();
    audio.unlock();
    for (const name of audio.names) {
      ctx.currentTime += 10;
      assert.equal(audio.play(name), true, name);
    }
    audio.setMuted(true);
    ctx.currentTime += 10;
    assert.equal(audio.play('tap'), false);
  });
});

test('without Web Audio the game carries on silently', () => {
  const audio = createAudio();
  audio.unlock();
  assert.equal(audio.play('tap'), false);
});
