import { expect } from "vitest";

export function expectContract(condition, message) {
  expect(condition, message).toBeTruthy();
}
