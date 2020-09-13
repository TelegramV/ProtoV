import {compare, concat, fromBigInteger, padding16} from "../utils/bytes";
import {decrypt_message, encrypt_message} from "../cryptography/telegram";
import TelegramApplication from "../application/TelegramApplication";
import ConnectionState from "./ConnectionState";
import Authorization from "./Authorization";
import TL from "../tl";
import {randomBuffer} from "../utils/random";
import SocketTransporter from "./SocketTransporter";
import {long, MessagesHandler, Transporter} from "../types";
import BasicMessageHandler from "./BasicMessageHandler";
import BigInteger from "big-integer";

class Connection {
    application: TelegramApplication;

    dcId: any;
    sessionId: Uint8Array;
    state: ConnectionState;

    authorization: Authorization;
    transporter: Transporter;

    messageHandler: MessagesHandler;
    unencryptedProcessor: any;

    isSocketConnected: boolean;
    withUpdates: boolean;
    doPinging: boolean;
    isInitialized: boolean;
    didInitConnection: boolean;

    queue: { name: string; params?: any; resolve: any; reject: any; }[];

    constructor(application: TelegramApplication, props: any) {
        this.application = application;
        this.dcId = props.dcId;
        this.sessionId = randomBuffer(8);
        this.state = new ConnectionState();

        this.authorization = new Authorization(this);
        this.transporter = new SocketTransporter(this);
        this.messageHandler = new BasicMessageHandler(this);

        this.isSocketConnected = false;
        this.withUpdates = props.withUpdates;
        this.doPinging = false;
        this.isInitialized = false;
        this.didInitConnection = false;

        this.queue = [];
    }

    get isMain() {
        return this.application.mainConnection === this;
    }

    get isReady() {
        return this.transporter.isReady &&
            this.isSocketConnected &&
            this.authorization &&
            this.authorization.isAuthorized &&
            !this.authorization.isAuthorizing &&
            this.isInitialized;
    }

    async init(props: { doPinging?: boolean; } = {}) {
        const {
            doPinging = false,
        } = props;

        this.doPinging = doPinging;

        if (this.isInitialized) {
            console.warn("already initialized");
            return this.authorization.authKey;
        }

        const authKey = await this.application.storage.getItem(`authKey${this.dcId}`);
        const serverSalt = await this.application.storage.getItem(`serverSalt${this.dcId}`);

        this.authorization.setAuthKey(authKey);
        this.authorization.serverSalt = serverSalt;

        if (
            !this.authorization.isAuthorized ||
            !this.authorization.authKey
        ) {
            await this.authorization.authorize();
        }

        await this.application.storage.setItem(`authKey${this.dcId}`, this.authorization.authKey);
        await this.application.storage.setItem(`serverSalt${this.dcId}`, this.authorization.serverSalt);

        this.isInitialized = true;

        if (
            this.application.mainConnection!.dcId !== this.dcId &&
            !await this.application.storage.getItem(`imported${this.dcId}`) &&
            await this.application.isSignedIn()
        ) {
            const ExportedAuthorization = await this.application.mainConnection!.invokeMethod("auth.exportAuthorization", {
                dc_id: this.dcId
            });

            await this.invokeMethod("auth.importAuthorization", ExportedAuthorization);

            await this.application.storage.setItem(`imported${this.dcId}`, true);
        }

        await this.onReady();

        // if (doPinging) {
        //     this.startPinging();
        // }

        return this.authorization.authKey;
    }

    sendMessage(message_id: string, message_data: Uint8Array, contentRelated: boolean = true) {
        const message = TL.packer(this.application.config.schema)
            .write(this.authorization.serverSalt)
            .write(this.sessionId)
            .long(message_id)
            .int(this.state.nextSeqNo(contentRelated))
            .int(message_data.length)
            .write(message_data)
            .toByteArray();

        const encrypted = encrypt_message(concat(message, padding16(message.length)), this.authorization.authKey);

        const encrypted_data = TL.packer(this.application.config.schema)
            .write(this.authorization.authKeyId)
            .write(encrypted.msg_key)
            .write(encrypted.encrypted_data)
            .toByteArray();

        this.transporter.transport(encrypted_data.buffer);
    }

    sendUnencryptedMessage(message_data: Uint8Array) {
        const message = TL.packer(this.application.config.schema)
            .long("0") // auth_key_id
            .long(this.state.nextMessageId()) // message_id
            .int(message_data.length) // message_data_length
            .write(message_data) // message_data
            .toByteArray();

        this.transporter.transport(message.buffer);
    }

    invokeUnencryptedMethod(name: string, params ?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            this.unencryptedProcessor = {resolve, reject};

            this.sendUnencryptedMessage(TL.packMethod(this.application.config.schema, name, params));
        });
    }

    invokeMethod(name: string, params ?: any): Promise<any> {
        if (!this.isReady) {
            return new Promise<any>((resolve, reject) => {
                this.queue.push({name, params, resolve, reject});
            });
        }

        const packer = TL.packer(this.application.config.schema);

        if (!this.withUpdates) {
            packer.id(0xbf9459b7); // invokeWithoutUpdates
        }

        packer
            .id(0xda9b0d0d) // invokeWithLayer
            .int(this.application.config.layer);

        if (!this.didInitConnection) {
            packer
                .id(0xc1cd5ea9) // initConnection
                .int(0) //flags
                .int(this.application.config.api_id) // api_id
                .string("Unknown") // device_model
                .string("Unknown Platform") // system_version
                .string(this.application.config.app_version) // app_version
                .string("en") // system_lang_code
                .string("tdesktop") // lang_pack
                .string("en"); // lang_code

            this.didInitConnection = true;
        }

        packer.method(name, params);

        return new Promise((resolve, reject) => {
            const message_id = this.state.nextMessageId();

            this.messageHandler.requests.set(message_id, {
                name,
                params,
                resolve,
                reject,
            });

            this.sendMessage(
                message_id,
                packer.toByteArray(),
                true,
            );
        });
    }

    ackMessages(msg_ids: string[]) {
        this.sendMessage(
            this.state.nextMessageId(),
            TL.pack(this.application.config.schema, {
                _: "msgs_ack",
                msg_ids: msg_ids
            }),
            false
        );
    }

    receiveMessage(buffer: ArrayBuffer) {
        let unpacker = TL.unpacker(this.application.config.schema, buffer);

        const auth_key_id = unpacker.read(8);

        if (auth_key_id.every((byte: number) => byte === 0)) { // unencrypted message
            // Unencrypted Message
            // auth_key_id:int64    message_id:int64    message_data_length:int32    message_data:bytes

            unpacker.long(); // message_id
            unpacker.int(); // message_data_length

            if (this.unencryptedProcessor) {
                try {
                    this.unencryptedProcessor.resolve(
                        unpacker.unpack() // message_data
                    );
                } catch (e) {
                    this.unencryptedProcessor.reject(e);
                }
            } else {
                console.error("received unencrypted message, but no handler was found.");
            }
        } else {
            if (!compare(auth_key_id, this.authorization.authKeyId)) {
                throw new Error(`${this.dcId} : invalid server auth_key_id`);
            }

            // Encrypted Message
            // auth_key_id:int64    msg_key:int128     encrypted_data:bytes

            const msg_key = unpacker.read(16);
            const encrypted_data = unpacker.read(buffer.byteLength - unpacker.offset);

            const decrypted_message = decrypt_message(encrypted_data, this.authorization.authKey, msg_key, 8);

            // encrypted_data
            // salt:int64    session_id:int64    message_id:int64    seq_no:int32    message_data_length:int32    message_data:bytes    padding:bytes

            unpacker = TL.unpacker(this.application.config.schema, decrypted_message.decrypted_data);

            const salt = unpacker.read(8); // todo: check salt
            const session_id = unpacker.read(8);
            const message_id = unpacker.long();
            const seq_no = unpacker.int();
            const message_data_length = unpacker.int();

            this.messageHandler.handle(
                message_id,
                unpacker.unpack(), // message_data + padding
            );
        }
    }

    onConnect() {
        this.isSocketConnected = true;
    }

    onDisconnect() {
        this.isSocketConnected = false;
        this.didInitConnection = false;
    }

    async onReady() {
        for (const {name, params, resolve, reject} of this.queue) {
            await this.invokeMethod(name, params)
                .then(resolve)
                .catch(reject);
        }
    }

    updateServerSalt(new_server_salt: long): Promise<any> {
        this.authorization.serverSalt = fromBigInteger(BigInteger(new_server_salt));

        return this.application.storage.setItem(`serverSalt${this.dcId}`, new_server_salt);
    }
}

export default Connection;