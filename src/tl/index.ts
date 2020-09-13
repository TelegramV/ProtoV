import {Packer, Unpacker} from "protov-tl";
import {long} from "../types";
import {Schema} from "protov-tl/lib/types";
import {fromBigInteger} from "../utils/bytes";
import BigInteger from "big-integer";
import {gzip_compress, gzip_decompress} from "../cryptography/gzip";

class BigIntegerPacker extends Packer {
    // @ts-ignore
    long(value: long): this {
        return this.write(
            fromBigInteger(BigInteger(value ?? "0", 10)).reverse(),
            8
        );
    }
}

class BigIntegerUnpacker extends Unpacker {
    // @ts-ignore
    long(): long {
        const low = this.uint();
        const high = this.uint();

        return BigInteger(high).shiftLeft(32).add(low).toString();
    }
}

const gzip = {
    compress(data: Uint8Array): Uint8Array {
        return gzip_compress(data);
    },
    decompress(data: Uint8Array): Uint8Array {
        return gzip_decompress(data);
    }
};

export default {
    packer: (schema: Schema): BigIntegerPacker => new BigIntegerPacker(schema, gzip),
    pack: (schema: Schema, constructor: any) => new BigIntegerPacker(schema, gzip).type(constructor).toByteArray(),
    packMethod: (schema: Schema, name: any, params: any = {}) => new BigIntegerPacker(schema, gzip).method(name, params).toByteArray(),

    unpacker: (schema: Schema, buffer: Uint8Array | ArrayBuffer) => new BigIntegerUnpacker(buffer, schema, gzip),
    unpack: (schema: Schema, buffer: Uint8Array | ArrayBuffer, type?: string) => new BigIntegerUnpacker(buffer, schema, gzip).unpack(type),
};