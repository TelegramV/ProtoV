import MemoryStorage from "./MemoryStorage";
import Connection from "../network/Connection";
import {randomBuffer} from "../utils/random";
import logger from "../utils/log";
import {Storage} from "../types";
import {Constructor, Schema} from "protov-tl/lib/types";

interface Config {
    api_id: number;
    api_hash: string;
    app_version: string;
    main_dc_id?: number;
    layer: number;
    schema: Schema;
    session_id?: Uint8Array;
    storage?: Storage;
}

const LOG = logger("[Telegram]");

class TelegramApplication {
    config: Config & { session_id: Uint8Array; };
    storage: Storage;
    user: any;
    connections: Map<number, Connection>;
    _isReady: boolean;

    constructor(config: Config) {
        // @ts-ignore
        this.config = config;

        if (!this.config.session_id) {
            this.config.session_id = randomBuffer(8);
        }

        if (!this.config.main_dc_id) {
            this.config.main_dc_id = 2;
        }

        if (this.config.storage) {
            this.storage = this.config.storage;
        } else {
            this.storage = new MemoryStorage();
        }

        this.connections = new Map();
        this._isReady = false;
    }

    get mainConnection() {
        return this.connections.get(this.config.main_dc_id!);
    }

    get isReady() {
        return this._isReady && this.mainConnection;
    }

    async isSignedIn() {
        if (this.user) {
            return true;
        }

        try {
            return this.user = await this.mainConnection!.invokeMethod("users.getUsers", {
                id: [
                    {
                        _: "inputUserSelf"
                    }
                ]
            });
        } catch (e) {
            if (e && e.type === "AUTH_KEY_UNREGISTERED") {
                LOG("user is not logged in");
                return false;
            }

            throw e;
        }
    }

    async invoke<P = any, R = any>(name: string, params: P | any = {}, props: { dcId?: number; } = {}): Promise<R> {
        let {
            dcId,
        } = props;

        if (dcId == null) {
            dcId = this.config.main_dc_id!;
        }

        const connection = this.getConnection(dcId);

        return connection.invokeMethod(name, params);
    }

    async start(): Promise<any> {
        if (this.isReady) {
            LOG("already started, ignoring");
            return Promise.reject();
        }

        this.getConnection(this.config.main_dc_id!);

        try {
            this.user = await this.mainConnection!.invokeMethod("users.getUsers", {
                id: [
                    {
                        _: "inputUserSelf"
                    }
                ]
            });
            console.log("logged in");
        } catch (e) {
            if (e && e.type === "AUTH_KEY_UNREGISTERED") {
                LOG("user is not logged in");
            } else {
                throw e;
            }
        }

        this._isReady = true;

        return this.user;
    }

    async setMainConnection(dcId: number): Promise<Connection> {
        if (dcId !== this.mainConnection!.dcId) {
            this.mainConnection!.withUpdates = false;
            this.mainConnection!.doPinging = false;

            this.config.main_dc_id = dcId;

            return this.getConnection(dcId);
        }

        return this.mainConnection!;
    }

    getConnection(dcId: number): Connection {
        console.info("getConnection", dcId);
        let connection = this.connections.get(dcId);

        if (!connection) {
            connection = new Connection(this, {
                withUpdates: dcId === this.config.main_dc_id,
                dcId,
            });

            this.connections.set(dcId, connection);

            connection.init({
                doPinging: dcId === this.config.main_dc_id,
            });
        }

        return connection;
    }

    onUpdate = (update: Constructor) => {
        LOG("update:", update);
    };
}

export default TelegramApplication;