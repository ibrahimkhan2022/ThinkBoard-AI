// Every automated test runs with the network switched off, so no test can ever
// reach a paid API by accident. Tests that need HTTP inject their own fake fetch.
globalThis.fetch = (() => {
  throw new Error("Network access is blocked in tests: inject a fake fetch instead.");
}) as typeof fetch;
