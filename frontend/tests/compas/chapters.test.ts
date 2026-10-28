import assert from "node:assert/strict";
import test from "node:test";
import { ACTS, CHAPTERS, chapterOf } from "../../src/features/demo/chapters.ts";

test("the story has one chapter per act, in order", () => {
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.act), [...ACTS]);
  for (const act of ACTS) assert.equal(chapterOf(act).act, act);
});

test("every chapter has a title and says what to do", () => {
  for (const chapter of CHAPTERS) {
    assert.ok(chapter.title.length > 0 && chapter.move.length > 0);
  }
});
