// A marisa-trie file, read: the keys that begin with some bytes. The Ukrainian stress dictionary is one
// (stress-uk.ts). libmarisa writes a trie as a tree in LOUDS form: a node's children are a run of 1 bits,
// ended by a 0. A node's label is one byte, or a link to a longer one, kept in the next trie (read from its
// node up to its root) or, in the last, in the tail. The file's own indexes for rank and select, and its
// cache, are passed over: this reader makes its own.
//
// Ported from libmarisa (github.com/s-yata/marisa-trie, lib/marisa/grimoire: trie/louds-trie.cc,
// trie/tail.cc, vector/bit-vector.h, vector/flat-vector.h), which is under the BSD 2-clause licence:
//
//   Copyright (c) 2010-2025, Susumu Yata. All rights reserved.
//
//   Redistribution and use in source and binary forms, with or without modification, are permitted
//   provided that the following conditions are met:
//   - Redistributions of source code must retain the above copyright notice, this list of conditions and
//     the following disclaimer.
//   - Redistributions in binary form must reproduce the above copyright notice, this list of conditions
//     and the following disclaimer in the documentation and/or other materials provided with the
//     distribution.
//
//   THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED
//   WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A
//   PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
//   ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
//   LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
//   INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
//   TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
//   ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

/** The file, read from its start: numbers little-endian, and a vector as its bytes, padded to eight. */
class Reader {
  at = 0;
  readonly bytes: Buffer;
  constructor(bytes: Buffer) {
    this.bytes = bytes;
  }
  u32(): number {
    const value = this.bytes.readUInt32LE(this.at);
    this.at += 4;
    return value;
  }
  u64(): number {
    const value = Number(this.bytes.readBigUInt64LE(this.at));
    this.at += 8;
    return value;
  }
  vector(): Buffer {
    const size = this.u64();
    const data = this.bytes.subarray(this.at, this.at + size);
    this.at += size + ((8 - (size % 8)) % 8);
    return data;
  }
}

/** A bit-vector: bit `i` is in byte `i >> 3`, from its lowest. */
class Bits {
  readonly size: number;
  readonly #bytes: Buffer;
  /** The 1 bits before each byte. */
  readonly #before: Uint32Array;
  #zeros: Uint32Array | undefined;
  #ones: Uint32Array | undefined;

  constructor(reader: Reader) {
    this.#bytes = reader.vector();
    this.size = reader.u32();
    reader.u32(); // how many are 1
    reader.vector(); // its ranks
    reader.vector(); // its select of 0
    reader.vector(); // its select of 1
    this.#before = new Uint32Array(this.#bytes.length + 1);
    for (let i = 0; i < this.#bytes.length; i++) this.#before[i + 1] = this.#before[i]! + COUNT[this.#bytes[i]!]!;
  }

  get(i: number): boolean {
    return ((this.#bytes[i >> 3]! >> (i & 7)) & 1) === 1;
  }

  /** The 1 bits before bit `i`. */
  rank1(i: number): number {
    return this.#before[i >> 3]! + COUNT[this.#bytes[i >> 3]! & ((1 << (i & 7)) - 1)]!;
  }

  #places(): void {
    const ones = this.#before[this.#bytes.length]!;
    const total = this.#bytes.length * 8;
    this.#ones = new Uint32Array(ones);
    this.#zeros = new Uint32Array(total - ones);
    let one = 0;
    let zero = 0;
    for (let i = 0; i < total; i++) {
      if (this.get(i)) this.#ones[one++] = i;
      else this.#zeros[zero++] = i;
    }
  }

  /** Where the 0 bit number `k` is, counted from 0. */
  select0(k: number): number {
    if (!this.#zeros) this.#places();
    return this.#zeros![k]!;
  }

  /** Where the 1 bit number `k` is, counted from 0. */
  select1(k: number): number {
    if (!this.#ones) this.#places();
    return this.#ones![k]!;
  }
}

/** The 1 bits of each byte. */
const COUNT = Uint8Array.from({ length: 256 }, (_, byte) => {
  let count = 0;
  for (let b = byte; b; b >>= 1) count += b & 1;
  return count;
});

/** Numbers of the same few bits each, packed one after another. */
class Flat {
  readonly #bytes: Buffer;
  readonly #bits: number;
  constructor(reader: Reader) {
    this.#bytes = reader.vector();
    this.#bits = reader.u32();
    reader.u32(); // its mask
    reader.u64(); // how many
  }
  get(i: number): number {
    const at = i * this.#bits;
    const byte = Math.floor(at / 8);
    // Five bytes hold any 32 bits, wherever they begin; past the end is nothing.
    let value = 0;
    for (let k = 4; k >= 0; k--) value = value * 256 + (this.#bytes[byte + k] ?? 0);
    return Math.floor(value / 2 ** (at % 8)) % 2 ** this.#bits;
  }
}

/** One trie of the file, and the next, which holds its longer labels. */
class Louds {
  readonly louds: Bits;
  readonly terminal: Bits;
  readonly #link: Bits;
  readonly #bases: Buffer;
  readonly #extras: Flat;
  readonly #tail: Buffer;
  readonly #ends: Bits;
  readonly #next: Louds | undefined;
  /** How many children the root has: they are nodes 1 to this. */
  readonly #first: number;

  constructor(reader: Reader) {
    this.louds = new Bits(reader);
    this.terminal = new Bits(reader);
    this.#link = new Bits(reader);
    this.#bases = reader.vector();
    this.#extras = new Flat(reader);
    this.#tail = reader.vector();
    this.#ends = new Bits(reader);
    if (this.#link.rank1(this.#link.size) !== 0 && this.#tail.length === 0) this.#next = new Louds(reader);
    reader.vector(); // its cache
    this.#first = reader.u32();
    reader.u32(); // its settings
  }

  /** A node's children: a run of 1 bits after the node's own 0. */
  *children(node: number): Generator<number> {
    let at = this.louds.select0(node) + 1;
    for (let child = at - node - 1; this.louds.get(at); child++, at++) yield child;
  }

  /** A node's label, added to `out`. */
  label(node: number, out: number[]): void {
    if (this.#link.get(node)) this.#linked(this.#bases[node]! | (this.#extras.get(this.#link.rank1(node)) * 256), out);
    else out.push(this.#bases[node]!);
  }

  /** A longer label: in the next trie, or in the tail, whose labels end at a 0 byte, or where its bits say. */
  #linked(link: number, out: number[]): void {
    if (this.#next) return this.#next.#up(link, out);
    if (this.#ends.size === 0) for (let at = link; this.#tail[at] !== 0; at++) out.push(this.#tail[at]!);
    else {
      let at = link;
      do out.push(this.#tail[at]!);
      while (!this.#ends.get(at++));
    }
  }

  /** The labels from a node up to the root: a label of the trie before, in its order. */
  #up(node: number, out: number[]): void {
    for (;;) {
      this.label(node, out);
      if (node <= this.#first) return;
      node = this.louds.select1(node) - node - 1;
    }
  }
}

const HEADER = "We love Marisa.\0";

/** A trie read from a marisa-trie file. */
export class Marisa {
  readonly #trie: Louds;

  constructor(file: Buffer) {
    if (file.subarray(0, HEADER.length).toString("latin1") !== HEADER) throw new Error("no marisa-trie file: it does not begin with its header");
    const reader = new Reader(file);
    reader.at = HEADER.length;
    this.#trie = new Louds(reader);
    if (reader.at !== file.length) throw new Error(`no marisa-trie file this reads: ${file.length - reader.at} bytes are left after its tries`);
  }

  /** Each key that begins with `prefix`, without it. */
  after(prefix: Uint8Array): Uint8Array[] {
    const trie = this.#trie;
    let node = 0;
    let at = 0;
    let rest: number[] = [];
    walk: while (at < prefix.length) {
      for (const child of trie.children(node)) {
        const label: number[] = [];
        trie.label(child, label);
        if (label[0] !== prefix[at]) continue;
        let k = 0;
        while (k < label.length && at < prefix.length && label[k] === prefix[at]) k++, at++;
        // The label and the prefix part ways: no key has it.
        if (k < label.length && at < prefix.length) return [];
        rest = label.slice(k);
        node = child;
        continue walk;
      }
      return [];
    }
    const found: Uint8Array[] = [];
    const under = (from: number, bytes: number[]): void => {
      if (trie.terminal.get(from)) found.push(Uint8Array.from(bytes));
      for (const child of trie.children(from)) {
        const longer = [...bytes];
        trie.label(child, longer);
        under(child, longer);
      }
    };
    under(node, rest);
    return found;
  }
}
