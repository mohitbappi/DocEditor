// src/utils/polyfills.ts
/**
 * Polyfills for Hermes JS engine (React Native).
 *
 * Hermes does not implement:
 *   - TextDecoder / TextEncoder  ← needed by mammoth.js for DOCX parsing
 *   - Blob (partial)
 *
 * We use the 'text-encoding' package which is a spec-compliant
 * pure-JS implementation that works on Hermes.
 *
 * Install: npm install text-encoding
 *          npm install --save-dev @types/text-encoding
 */

// @ts-ignore — text-encoding has no default export typing
import { TextDecoder, TextEncoder } from 'text-encoding';

// Attach to global so any library that does `new TextDecoder()` finds it
if (typeof globalThis?.TextDecoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).TextDecoder = TextDecoder;
}

if (typeof globalThis?.TextEncoder === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).TextEncoder = TextEncoder;
}
