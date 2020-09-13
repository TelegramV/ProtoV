// @ts-ignore
import Rusha from "rusha";
import jsSha256 from "js-sha256";

const rusha = new Rusha();

export function SHA1(data: Uint8Array): Uint8Array {
    return new Uint8Array(rusha.rawDigest(data).buffer);
}

export function SHA256(data: Uint8Array): Uint8Array {
    return new Uint8Array(jsSha256.sha256.arrayBuffer(data));
}