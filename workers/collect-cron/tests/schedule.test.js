import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { SCHEDULE, due, dispatch } from "../src/index.js";

const names = (date) => due(new Date(date)).map((j) => j.workflow + (j.inputs ? ":" + j.inputs.tier : ""));

test("charging prices every two hours", () => {
  assert.ok(names("2026-11-10T02:37:00Z").includes("collect-charging-data.yml:hourly"));
  assert.ok(!names("2026-11-10T03:37:00Z").includes("collect-charging-data.yml:hourly"));
  const perDay = Array.from({ length: 24 }, (_, h) => names(`2026-11-10T${String(h).padStart(2, "0")}:37:00Z`))
    .flat()
    .filter((n) => n === "collect-charging-data.yml:hourly").length;
  assert.equal(perDay, 12);
});

test("daily, weekly and monthly jobs", () => {
  assert.ok(names("2026-11-10T03:37:00Z").includes("collect-charging-data.yml:daily"));
  assert.ok(names("2026-11-09T05:37:00Z").includes("collect-charging-data.yml:weekly")); // Monday
  assert.ok(!names("2026-11-10T05:37:00Z").includes("collect-charging-data.yml:weekly")); // Tuesday
  assert.ok(names("2026-12-03T05:37:00Z").includes("collect-vehicle-catalog.yml"));
  assert.ok(!names("2026-12-04T05:37:00Z").includes("collect-vehicle-catalog.yml"));
});

test("every scheduled workflow exists and can be started by hand", () => {
  const dir = new URL("../../../.github/workflows/", import.meta.url);
  const files = readdirSync(dir);
  for (const job of SCHEDULE) {
    assert.ok(files.includes(job.workflow), job.workflow);
    assert.match(readFileSync(new URL(job.workflow, dir), "utf8"), /workflow_dispatch:/, job.workflow);
  }
});

test("workflows no longer rely on GitHub's schedule", () => {
  const dir = new URL("../../../.github/workflows/", import.meta.url);
  for (const job of SCHEDULE) {
    assert.doesNotMatch(readFileSync(new URL(job.workflow, dir), "utf8"), /^\s+schedule:/m, job.workflow);
  }
});

test("dispatch posts to the GitHub API", async () => {
  let call;
  await dispatch({ workflow: "x.yml", inputs: { tier: "daily" } }, "T", async (url, init) => {
    call = { url, init };
    return { status: 204, text: async () => "" };
  });
  assert.equal(call.url, "https://api.github.com/repos/spikinglabs/cars/actions/workflows/x.yml/dispatches");
  assert.equal(call.init.headers.Authorization, "Bearer T");
  assert.deepEqual(JSON.parse(call.init.body), { ref: "main", inputs: { tier: "daily" } });
  await assert.rejects(dispatch({ workflow: "x.yml" }, "T", async () => ({ status: 404, text: async () => "Not Found" })), /HTTP 404/);
});
