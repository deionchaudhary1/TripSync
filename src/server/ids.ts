import { randomInt } from "node:crypto";

// Excludes ambiguous characters (0/O, 1/I/L) for easy reading off a screen during a demo.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateTripCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[randomInt(CODE_CHARS.length)];
  }
  return code;
}
