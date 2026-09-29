import { construction } from "./construction.js";
import { healthcare } from "./healthcare.js";
import { facilities } from "./facilities.js";

const FIXTURES = {
  construction,
  healthcare,
  facilities,
};

export function loadFixture(industryId) {
  return FIXTURES[industryId] || construction;
}

/** Deep-ish clone so in-demo edits do not mutate the seed. */
export function cloneFixture(industryId) {
  return structuredClone(loadFixture(industryId));
}
