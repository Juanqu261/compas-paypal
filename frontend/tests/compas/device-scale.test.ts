import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVICE_HEIGHT,
  DEVICE_WIDTH,
  MAX_SCALE,
  MIN_SCALE,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  deviceScale,
} from "../../src/components/phone/device-scale.ts";

test("the screen has a phone's proportions", () => {
  const ratio = SCREEN_WIDTH / SCREEN_HEIGHT;
  assert.ok(ratio > 0.45 && ratio < 0.48, `ratio ${ratio}`);
});

test("a tall window stops at the largest size, which is smaller than the logical one", () => {
  assert.equal(deviceScale(1400), MAX_SCALE);
  assert.equal(deviceScale(5000), MAX_SCALE);
  assert.ok(MAX_SCALE < 1);
});

test("a shorter window scales the whole device down, keeping its proportions", () => {
  const scale = deviceScale(800);
  assert.ok(scale < MAX_SCALE && scale > MIN_SCALE);
  const ratio = (DEVICE_WIDTH * scale) / (DEVICE_HEIGHT * scale);
  assert.equal(ratio, DEVICE_WIDTH / DEVICE_HEIGHT);
});

test("a very short window stops shrinking so the text stays readable", () => {
  assert.equal(deviceScale(300), MIN_SCALE);
  assert.equal(deviceScale(0), MIN_SCALE);
});
