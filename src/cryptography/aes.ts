import {IGE} from "@cryptography/aes";
import {reverseEndian} from "../utils/bytes";

export function aes_ige_decrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    return reverseEndian(new Uint8Array(new IGE(key, iv).decrypt(data).buffer));
}

export function aes_ige_encrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
    return reverseEndian(new Uint8Array(new IGE(key, iv).encrypt(data).buffer));
}