import pako from "pako";

export function gzip_compress(data: Uint8Array): Uint8Array {
    return pako.deflate(data);
}

export function gzip_decompress(data: Uint8Array): Uint8Array {
    return pako.inflate(data);
}