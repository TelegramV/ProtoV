import BigInteger from "big-integer";
import {fromBigInteger, toBigIntegerBE} from "../utils/bytes";

function rsa_encrypt(data: Uint8Array, public_key: { modulus: string; exponent: string; }): Uint8Array {
    const N = BigInteger(public_key.modulus, 16);
    const E = BigInteger(public_key.exponent, 16);
    const X = toBigIntegerBE(data);

    return fromBigInteger(X.modPow(E, N));
}

export default rsa_encrypt;