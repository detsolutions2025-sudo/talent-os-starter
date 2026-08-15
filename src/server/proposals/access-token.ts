import { createHash, randomBytes } from "node:crypto";

export function generateRawProposalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashProposalToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
