import { describe, expect, it } from "vitest";
import {
  captureScreenshotArgs,
  clickElementArgs,
  readPageArgs,
  selectOptionArgs,
  toolDefinitions,
  validateToolArguments,
} from "../../src/agent/tools";

describe("tool schemas", () => {
  it("exposes the five declared tools", () => {
    expect(toolDefinitions.map((tool) => tool.name).sort()).toEqual([
      "captureScreenshot",
      "clickElement",
      "fillField",
      "readPage",
      "selectOption",
    ]);
  });

  it("validates fillField arguments", () => {
    expect(validateToolArguments("fillField", { selector: "#a", value: "x" })).toEqual({
      selector: "#a",
      value: "x",
    });
    expect(() => validateToolArguments("fillField", { selector: 1 })).toThrow();
  });

  it("validates clickElement arguments", () => {
    expect(clickElementArgs.parse({ selector: "button" }).selector).toBe("button");
    expect(() => clickElementArgs.parse({})).toThrow();
  });

  it("validates selectOption arguments", () => {
    expect(selectOptionArgs.parse({ selector: "s", value: "v" }).value).toBe("v");
    expect(() => selectOptionArgs.parse({ selector: "s" })).toThrow();
  });

  it("readPage defaults mode to full", () => {
    expect(readPageArgs.parse({}).mode).toBe("full");
    expect(readPageArgs.parse({ mode: "selection" }).mode).toBe("selection");
  });

  it("captureScreenshot takes no arguments", () => {
    expect(captureScreenshotArgs.parse({})).toEqual({});
  });

  it("rejects unknown tools", () => {
    expect(() => validateToolArguments("doesNotExist", {})).toThrow();
  });
});
