import {SHA256} from "./hash";
import {concat, substr} from "../utils/bytes";
import {aes_ige_decrypt, aes_ige_encrypt} from "./aes";
import {randomBuffer} from "../utils/random";

type X = 0 | 8;

function compute_msg_key(plaintext: Uint8Array, auth_key: Uint8Array, x = 0) {
    let without_padding = concat(substr(auth_key, 88 + x, 32), plaintext);

    if (without_padding.length % 16 !== 0) {
        without_padding = concat(without_padding, randomBuffer(16 - (without_padding.length % 16)));
    }

    const msg_key_large = SHA256(without_padding);

    return substr(msg_key_large, 8, 16);
}

function compute_auth_key_and_iv(auth_key: Uint8Array, msg_key: Uint8Array, x: X) {
    const sha256_a = SHA256(concat(msg_key, substr(auth_key, x, 36)));
    const sha256_b = SHA256(concat(substr(auth_key, 40 + x, 36), msg_key));
    const aes_key = concat(substr(sha256_a, 0, 8), substr(sha256_b, 8, 16), substr(sha256_a, 24, 8));
    const aes_iv = concat(substr(sha256_b, 0, 8), substr(sha256_a, 8, 16), substr(sha256_b, 24, 8));

    return {
        aes_key,
        aes_iv
    };
}

function decrypt(data: Uint8Array, auth_key: Uint8Array, msg_key: Uint8Array, x: X = 0) {
    const {aes_key, aes_iv} = compute_auth_key_and_iv(auth_key, msg_key, x);

    return aes_ige_decrypt(data, aes_key, aes_iv);
}

function encrypt(data: Uint8Array, auth_key: Uint8Array, msg_key: Uint8Array, x: X = 0) {
    const {aes_key, aes_iv} = compute_auth_key_and_iv(auth_key, msg_key, x);

    return aes_ige_encrypt(data, aes_key, aes_iv);
}

export function encrypt_message(data: Uint8Array, auth_key: Uint8Array, x: X = 0) {
    const msg_key = compute_msg_key(data, auth_key, x);
    const encrypted_data = encrypt(data, auth_key, msg_key, x);

    return {
        encrypted_data: encrypted_data,
        msg_key: msg_key
    };
}

export function decrypt_message(data: Uint8Array, auth_key: Uint8Array, msg_key: Uint8Array, x: X = 8) {
    const decrypted_data = decrypt(data, auth_key, msg_key, x);
    const encrypted_msg_key = compute_msg_key(decrypted_data, auth_key, x);

    return {
        decrypted_data: decrypted_data,
        msg_key: encrypted_msg_key
    };
}