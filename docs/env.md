# Agoric SDK Environment Variables

```js
process.env.DOCUMENTATION // for power users
```

This file describes environment variables that influence the execution of the
Agoric SDK.

<!--
## Template

**Add to a new section in alphabetical order.**

Affects:

Purpose:

Description:

Lifetime:

-->

## CHAIN_BOOTSTRAP_VAT_CONFIG

Affects: `ag-chain-cosmos`, `ag-solo`

Purpose: to set the specifier for the chain/sim-chain's `vatconfig.json`

Description: defaults to `@agoric/vats/decentral-config.json`

Lifetime: until we don't want to allow user control of the chain's vat config

## CXXFLAGS

Affects: yarn, agoric install

Purpose: add compilation flags to Node.js C++ addons

Description: defaults to `-std=c++14` if not set (empty string doesn't default)

Lifetime: probably forever (until all supported Node versions work with
`CXXFLAGS=''`)

## DEBUG

Affects: agoric (CLI), ag-chain-cosmos, ag-solo

Purpose: to change the meaning of `console.log` and other console methods

Description: uses `anylogger` to change whether the following methods (in order
of increasing severity) are active for a given context:

1. `console.debug`
2. `console.log`
3. `console.info`
4. `console.warn`
5. `console.error`

If not set, then default (`console.info` and above) logging is enabled.
(`console.log` and `console.debug` logging is disabled.)

If set to an empty string, or running in `ag-chain-cosmos start` mode, don't
print any logs.  This is part of "consensus mode."

If set to a value that contains the substring `agoric`, then print all console
messages for the entire SDK.

Otherwise, set to a comma-separated list of prefixes, where each prefix is the
context given to `makeConsole`.  For example:

- `DEBUG=SwingSet:ls` enable all console messages for liveslots, regardless of vat.
- `DEBUG=SwingSet:ls:v13` enable for liveslots in vat 13.
- `DEBUG=SwingSet:vat` enable for user code, regardless of vat.
- `DEBUG=SwingSet:vat,SwingSet:ls` enable for liveslots and user code, all vats

## END_BLOCK_SPIN_MS

Affects: cosmic-swingset

Purpose: simulating load to explore scalability of the Cosmos SDK.

Description: Number of milliseconds to busy-wait during every block's
end-of-block processing for `ag-chain-cosmos` and the sim-chain.

Lifetime: until we have a more consistent load testing regimen

## FAKE_CURRENCIES

Affects: cosmic-swingset

Purpose: allow the creation of pretend tokens

Description: When nonempty, create pretend prepopulated tokens like "moola" and
"simoleans".

Lifetime: until chain is mature enough not to need any pretend tokens

## OTEL_EXPORTER_PROMETHEUS_HOST
## OTEL_EXPORTER_PROMETHEUS_PORT

Affects: cosmic-swingset

Purpose: enabling Prometheus metrics exports

Description: When either is set, these are the host IP and port number to use
for the Prometheus scrape endpoint to export telemetry.

Lifetime: until we decide not to support Prometheus for metrics export

## SOLO_SLOGFILE

Same as SLOGFILE, but for solo instead of chain.

Lifetime: ?

## SOLO_SLOGSENDER

Same as SLOGSENDER, but for solo instead of chain.

Lifetime: ?

## SOLO_MAX_DEBUG_LENGTH

Affects: solo

Purpose: reduce the size of each individual `console.debug` output

Description: defaults to no limit, set to a decimal byte count to reduce the
output

Lifetime: Until CI no longer balks on long output, or our source bundles aren't delivered via messages to the sim-chain

## SLOGFILE

Affects: cosmic-swingset

Purpose: record an on-chain Swingset LOG file

Description: when nonempty, use the value as an absolute path to which SwingSet
debug logs should be written.

Lifetime: ?

## SLOGSENDER

Affects: cosmic-swingset

Purpose: intercept the SwingSet LOG file in realtime

Description: when nonempty, use the value as a module specifier.  The module
will be loaded by `@agoric/telemetry/src/make-slog-sender.js`, via
`import(moduleSpec)`, and then the exported `makeSlogSender` function creates a
`slogSender`.  Then, every time a SLOG object is written by SwingSet,
`slogSender(slogObject)` will be called.

The default is `'@agoric/telemetry/src/flight-recorder.js'`, which writes to an
mmap'ed circular buffer.

## SWINGSET_WORKER_TYPE

Affects: solo

Purpose: select the default Worker type (default `xs-worker`)

Description: default `xs-worker`, but you can use `local` to run vats within the
same Node.js process (to facilitate debugging).
