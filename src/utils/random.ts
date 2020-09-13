import crypto from "crypto";

export function randomInteger(max = 1024): number {
    return Math.floor(Math.random() * max);
}

export function randomBuffer(length: number): Uint8Array {
    return new Uint8Array(crypto.randomBytes(length));
}