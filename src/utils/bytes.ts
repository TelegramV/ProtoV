import BigInteger from "big-integer";
import {randomBuffer, randomInteger} from "./random";

export function concat(...uint8Arrays: Uint8Array[]): Uint8Array {
    let length = 0;

    for (let i = 0; i < uint8Arrays.length; i++) {
        length += uint8Arrays[i].length;
    }

    const uint8Array = new Uint8Array(length);

    let offset = 0;

    for (let i = 0; i < uint8Arrays.length; i++) {
        uint8Array.set(uint8Arrays[i], offset);
        offset += uint8Arrays[i].length;
    }

    return uint8Array;
}

export function substr(bytes: Uint8Array, start: number, length: number): Uint8Array {
    return bytes.slice(start, start + length);
}

export function compare(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false;
    }

    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }

    return true;
}

export function fromBigInteger(bigInt: BigInteger.BigInteger): Uint8Array {
    return new Uint8Array(bigInt.toArray(256).value);
}

export function reverseEndian(buffer: Uint8Array): Uint8Array { //changes endian to opposite
    for (let i = 0; i < buffer.length; i += 4) {
        let holder = buffer[i];
        buffer[i] = buffer[i + 3];
        buffer[i + 3] = holder;
        holder = buffer[i + 1];
        buffer[i + 1] = buffer[i + 2];
        buffer[i + 2] = holder;
    }

    return buffer;
}

export function modPow(x: Uint8Array, y: Uint8Array, m: Uint8Array): Uint8Array {
    const xBig = BigInteger(toHex(x), 16);
    const yBig = BigInteger(toHex(y), 16);
    const mBig = BigInteger(toHex(m), 16);

    return fromBigInteger(xBig.modPow(yBig, mBig));
}

export function fromHex(hex: string): Uint8Array {
    const bytes = [];
    let start = 0;

    if (hex.length % 2) {
        bytes.push(parseInt(hex.charAt(0), 16));
        start++;
    }

    for (let i = start; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }

    return new Uint8Array(bytes);
}

export function toHex(bytes: Uint8Array): string {
    const arr = [];

    for (let i = 0; i < bytes.length; i++) {
        arr.push((bytes[i] < 16 ? '0' : '') + (bytes[i] || 0).toString(16));
    }

    return arr.join("");
}

export function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
    const c = new Uint8Array(a.length);

    for (let i = 0; i < a.length; ++i) {
        c[i] = a[i] ^ b[i];
    }

    return c;
}

export function toBigIntegerBE(data: Uint8Array): BigInteger.BigInteger {
    return BigInteger.fromArray(Array.from(data), 256, false);
}

export function toBigIntegerLE(data: Uint8Array): BigInteger.BigInteger {
    return toBigIntegerBE(data.reverse());
}

export function padding16(length: number): Uint8Array {
    return randomBuffer((16 - (length % 16)) + 16 * (1 + randomInteger(5)));
}

export function uInt8(arrayBuffer: ArrayBuffer): Uint8Array {
    return new Uint8Array(arrayBuffer);
}