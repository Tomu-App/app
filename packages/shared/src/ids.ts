import { randomBytes, toBase64Url } from "./encoding.ts";

export const DOC_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const DOC_KEY_RE = /^[A-Za-z0-9_-]{43}$/;
export const OP_ID_RE = DOC_ID_RE;
export const CLIENT_ID_RE = DOC_ID_RE;

/** 16 random bytes, 22 characters. Addresses a document (list or label) on the server. */
export const newDocId = (): string => toBase64Url(randomBytes(16));
/** 32 random bytes (AES-256), 43 characters. Never sent to the server. */
export const newDocKey = (): string => toBase64Url(randomBytes(32));
export const newOpId = (): string => toBase64Url(randomBytes(16));
/** Random per device. */
export const newClientId = (): string => toBase64Url(randomBytes(16));
