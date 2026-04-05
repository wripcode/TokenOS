// test-fixtures/sample.ts — used by test-phase1.ts
// This file exercises all the constructs the parser should extract.

import { readFile } from "fs/promises";
import { join } from "path";

// A simple function
export function add(a: number, b: number): number {
  return a + b;
}

// A function that calls another
export function greet(name: string): string {
  const msg = formatMessage(name);
  return msg;
}

function formatMessage(name: string): string {
  return `Hello, ${name}!`;
}

// A class with methods
export class Calculator {
  private value: number;

  constructor(initial = 0) {
    this.value = initial;
  }

  add(n: number): Calculator {
    this.value = add(this.value, n);
    return this;
  }

  subtract(n: number): Calculator {
    this.value -= n;
    return this;
  }

  result(): number {
    return this.value;
  }
}

// An async function
export async function loadConfig(configPath: string): Promise<Record<string, unknown>> {
  const raw = await readFile(join(configPath, "config.json"), "utf-8");
  return JSON.parse(raw) as Record<string, unknown>;
}
