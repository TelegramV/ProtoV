import Connection from "./Connection";
import WebSocket from "ws";
import {CTR} from "@cryptography/aes";
import {Buffer} from "buffer/";
import {randomInteger} from "../utils/random";
import {reverseEndian, uInt8} from "../utils/bytes";
import logger from "../utils/log";
import {Transporter} from "../types";

const LOG = logger("[SocketTransporter]");

function getDcUrl(dcId: number): string {
    const subdomain = ["pluto", "venus", "aurora", "vesta", "flora"][dcId - 1];

    return `wss://${subdomain}.web.telegram.org/apiws`;
}

class SocketTransporter implements Transporter {
    readonly connection: Connection;
    readonly dcUrl: string;

    isConnected: boolean;
    isConnecting: boolean;

    queue: ArrayBuffer[];
    webSocket?: WebSocket;

    aesEncryptor?: CTR;
    aesDecryptor?: CTR;

    constructor(connection: Connection) {
        this.connection = connection;

        this.dcUrl = getDcUrl(this.connection.dcId);

        this.isConnected = false;
        this.isConnecting = false;

        this.queue = [];
    }

    get isReady() {
        return this.webSocket && this.webSocket.OPEN && this.isConnected;
    }

    transport(buffer: ArrayBuffer) {
        if (!this.isConnected) {
            if (!this.isConnecting) {
                this.isConnecting = true;

                this.queue.push(buffer);

                if (!this.webSocket) {
                    this.initTransportation();
                }
            } else {
                this.queue.push(buffer);
            }

            return;
        }

        if (!this.aesDecryptor || !this.aesEncryptor) {
            this.initObfuscation();
        }

        this.send(buffer);
    }

    protected initTransportation() {
        this.webSocket = new WebSocket(this.dcUrl, "binary");
        this.webSocket.binaryType = "arraybuffer";

        this.webSocket.onopen = () => {
            this.isConnected = true;
            this.isConnecting = false;

            while (this.queue.length) {
                this.transport(this.queue.shift()!);
            }

            this.onConnect();
        };

        this.webSocket.onmessage = (event: WebSocket.MessageEvent) => {
            const message = this.receive(event);

            if (message.byteLength <= 4) {
                throw new Error("PROTOCOL_VIOLATION");
            }

            this.connection.receiveMessage(message);
        };

        this.webSocket.onerror = (event: WebSocket.ErrorEvent) => {
            console.error("SOCK_ERROR", event.error);
        };

        this.webSocket.onclose = (event: WebSocket.CloseEvent) => {
            this.isConnected = false;

            this.onDisconnect();
        };
    }

    protected initObfuscation() {
        if (!this.webSocket) {
            throw new Error("webSocket is not initialized");
        }

        const outBuffer = new Buffer(64);
        const obfuscationBuffer = new Buffer(64);
        let obfuscationBufferOffset = 0;

        while (true) {
            const f = randomInteger(0xFFFFFFFF);
            const s = randomInteger(0xFFFFFFFF);

            if (
                (f & 0xFF) !== 0xef &&
                f !== 0xdddddddd &&
                f !== 0xeeeeeeee &&
                f !== 0x504f5354 &&
                f !== 0x474554 &&
                f !== 0x48454144 &&
                s !== 0x00000000
            ) {
                obfuscationBuffer.writeUInt32LE(f, obfuscationBufferOffset);
                obfuscationBufferOffset += 4;
                obfuscationBuffer.writeUInt32LE(s, obfuscationBufferOffset);
                obfuscationBufferOffset += 4;
                break;
            }
        }

        for (let i = 0; i < 12; ++i) {
            obfuscationBuffer.writeUInt32LE(randomInteger(0xFFFFFFFF), obfuscationBufferOffset);
            obfuscationBufferOffset += 4;
        }

        obfuscationBuffer.writeUInt32LE(0xeeeeeeee, obfuscationBufferOffset);
        obfuscationBufferOffset += 4;

        obfuscationBuffer.writeUInt8(0xfe, obfuscationBufferOffset);
        ++obfuscationBufferOffset;
        obfuscationBuffer.writeUInt8(0xff, obfuscationBufferOffset);
        ++obfuscationBufferOffset;

        obfuscationBuffer.writeUInt16LE(randomInteger(0xFFFF), obfuscationBufferOffset);

        outBuffer.set(obfuscationBuffer.slice(0, 56));

        this.aesEncryptor = new CTR(obfuscationBuffer.slice(8, 40), obfuscationBuffer.slice(40, 56));

        const encryptedBytes = reverseEndian(uInt8(this.aesEncryptor.encrypt(obfuscationBuffer).buffer));

        outBuffer.set(encryptedBytes.slice(56, 64), 56);

        obfuscationBuffer.reverse();

        this.aesDecryptor = new CTR(obfuscationBuffer.slice(8, 40), obfuscationBuffer.slice(40, 56));

        this.webSocket.send(outBuffer.buffer);
    }

    protected send(buffer: ArrayBuffer, cb?: (err?: Error) => void) {
        if (!this.webSocket) {
            throw new Error("webSocket is not initialized");
        }

        if (!this.aesEncryptor) {
            throw new Error("aesEncryptor is not initialized");
        }

        const outBuffer = new Buffer(buffer.byteLength + 4);
        outBuffer.writeUInt32LE(buffer.byteLength, 0);
        outBuffer.set(Buffer.from(buffer), 4);

        this.webSocket.send(reverseEndian(uInt8(this.aesEncryptor.encrypt(outBuffer).buffer)), cb);
    }

    protected receive(ev: WebSocket.MessageEvent): Uint8Array {
        if (!this.aesDecryptor) {
            throw new Error("aesDecryptor is not initialized");
        }

        return reverseEndian(uInt8(this.aesDecryptor.decrypt(uInt8(ev.data as ArrayBuffer)).buffer)).slice(4);
    }

    protected onConnect() {
        LOG(`[${this.connection.dcId}] connected`);

        this.connection.onConnect.call(this.connection);
    }

    protected onDisconnect() {
        LOG(`[${this.connection.dcId}] disconnected`);

        this.cleanup();
        this.connection.onDisconnect.call(this.connection);
    }

    protected cleanup() {
        LOG(`[${this.connection.dcId}] cleanup`, this.connection.dcId);

        if (this.webSocket?.OPEN) {
            this.webSocket.close();
        }

        this.webSocket = undefined;

        this.aesDecryptor = undefined;
        this.aesEncryptor = undefined;

        this.isConnected = false;
        this.isConnecting = false;
    }
}

export default SocketTransporter;