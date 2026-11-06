import { expect, test } from "vitest";
import {
  CLIENT_ID_RE,
  DOC_ID_RE,
  DOC_KEY_RE,
  OP_ID_RE,
  newClientId,
  newDocId,
  newDocKey,
  newOpId,
} from "../src/ids.ts";

test("ids have the spec lengths", () => {
  expect(newDocId()).toMatch(DOC_ID_RE);
  expect(newDocKey()).toMatch(DOC_KEY_RE);
  expect(newOpId()).toMatch(OP_ID_RE);
  expect(newClientId()).toMatch(CLIENT_ID_RE);
});

test("ids are unique", () => {
  expect(new Set(Array.from({ length: 1000 }, newDocId)).size).toBe(1000);
});
