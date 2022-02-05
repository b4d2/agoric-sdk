#! /usr/bin/env node
/* global process, BigUint64Array */
// frcat - print out the contents of a flight recorder

import '@endo/init';

import { makeMemoryMappedCircularBuffer } from './flight-recorder.js';

const main = async () => {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw Error('no flight-recorder.bin files specified');
  }

  for await (const file of files) {
    const { readCircBuf } = makeMemoryMappedCircularBuffer({
      circularBufferFile: file,
      circularBufferSize: null,
    });

    let offset = 0;
    for (;;) {
      const lenBuf = new BigUint64Array(1);
      const { done } = readCircBuf(new Uint8Array(lenBuf.buffer), offset);
      if (done) {
        break;
      }
      offset += 8;
      const len = Number(lenBuf[0]);

      const { done: done2, value: buf } = readCircBuf(
        new Uint8Array(len),
        offset,
      );
      if (done2) {
        break;
      }
      offset += len;
      const bufStr = new TextDecoder().decode(buf);
      if (bufStr[0] === '\n') {
        process.stdout.write(bufStr.slice(1));
      } else {
        process.stdout.write(bufStr);
      }
      if (process.stdout.write('\n')) {
        // eslint-disable-next-line no-continue
        continue;
      }

      // If the buffer is full, wait for stdout to drain.
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => process.stdout.once('drain', resolve));
    }
  }
};

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
