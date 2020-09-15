import Connection from "./Connection";
import {compare, concat, fromHex, modPow, toHex, xor} from "../utils/bytes";
import {SHA1} from "../cryptography/hash";
import {aes_ige_decrypt, aes_ige_encrypt} from "../cryptography/aes";
import TL from "../tl";
import BigInteger from "big-integer";
import rsa_key from "../cryptography/rsa_key";
import decompose_pq from "../cryptography/decompose_pq";
import rsa_encrypt from "../cryptography/rsa_encrypt";
import {randomBuffer} from "../utils/random";
import logger from "../utils/log";

const LOG = logger("[Authorization]");

class Authorization {
    authKey: Uint8Array | any;
    authKeyHash: Uint8Array | any;
    authKeyId: Uint8Array | any;
    authKeyAux: Uint8Array | any;
    serverSalt: Uint8Array | any;
    sessionId: Uint8Array;

    connection: Connection;

    isAuthorized: boolean;
    isAuthorizing: boolean;

    constructor(connection: Connection, authKey?: Uint8Array) {
        this.connection = connection;

        this.isAuthorizing = false;
        this.isAuthorized = false;

        this.sessionId = randomBuffer(8);

        if (authKey) {
            this.setAuthKey.call(this, authKey);
            this.isAuthorizing = false;
            this.isAuthorized = true;
        }
    }

    setAuthKey(authKey: Uint8Array): void {
        this.authKey = authKey;

        if (this.authKey) {
            this.authKeyHash = SHA1(this.authKey);
            this.authKeyAux = this.authKeyHash.slice(0, 8);
            this.authKeyId = this.authKeyHash.slice(-8);
            this.isAuthorizing = false;
            this.isAuthorized = true;
        } else {
            this.isAuthorizing = false;
            this.isAuthorized = true;
        }
    }

    async authorize(force = false): Promise<Uint8Array | undefined> {
        if (!this.authKey || force) {
            LOG(`[${this.connection.dcId}] authorizing`);

            const nonce = randomBuffer(16);

            this.isAuthorized = false;
            this.isAuthorizing = true;

            const ResPQ = await this.connection.invokeUnencryptedMethod("mtproto/req_pq", {
                nonce,
            });

            if (!compare(nonce, ResPQ.nonce)) {
                throw new Error("Invalid nonce");
            }

            const pk = rsa_key(ResPQ.server_public_key_fingerprints);

            if (!pk) {
                throw new Error(`No public key found`);
            }

            const P_Q = decompose_pq(ResPQ.pq);

            const new_nonce = randomBuffer(32);

            const data = TL.pack(this.connection.application.schema, {
                _: "mtproto/p_q_inner_data",
                pq: ResPQ.pq,
                p: P_Q.p,
                q: P_Q.q,
                nonce: nonce,
                server_nonce: ResPQ.server_nonce,
                new_nonce: new_nonce,
            });

            let data_with_hash = concat(SHA1(data), data);

            if (data_with_hash.length < 255) {
                data_with_hash = concat(data_with_hash, randomBuffer(255 - data_with_hash.length));
            }

            const encrypted_data = rsa_encrypt(data_with_hash, pk);

            const ServerDHParams = await this.connection.invokeUnencryptedMethod("mtproto/req_DH_params", {
                nonce: nonce,
                server_nonce: ResPQ.server_nonce,
                p: P_Q.p,
                q: P_Q.q,
                public_key_fingerprint: pk.fingerprint,
                encrypted_data: encrypted_data
            });

            if (ServerDHParams._ !== "mtproto/server_DH_params_ok") {
                throw new Error(ServerDHParams._);
            }

            if (!compare(nonce, ServerDHParams.nonce)) {
                throw new Error("Server_DH_Params invalid nonce");
            }

            if (!compare(ResPQ.server_nonce, ServerDHParams.server_nonce)) {
                throw new Error("Server_DH_Params invalid server_nonce");
            }

            const tmp_aes_key = concat(
                SHA1(concat(new_nonce, ResPQ.server_nonce)),
                SHA1(concat(ResPQ.server_nonce, new_nonce)).slice(0, 12)
            );

            const tmp_aes_iv = concat(
                SHA1(concat(ResPQ.server_nonce, new_nonce)).slice(12),
                SHA1(concat(new_nonce, new_nonce)),
                new_nonce.slice(0, 4)
            );

            const answer_with_hash = aes_ige_decrypt(ServerDHParams.encrypted_answer, tmp_aes_key, tmp_aes_iv);

            const hash = answer_with_hash.slice(0, 20);
            const answer_with_padding = answer_with_hash.slice(20);

            const Server_DH_inner_data_Unpacker = TL.unpacker(this.connection.application.schema, answer_with_padding.buffer);
            const Server_DH_inner_data = Server_DH_inner_data_Unpacker.unpack();

            const answer = answer_with_padding.slice(0, Server_DH_inner_data_Unpacker.offset);

            if (Server_DH_inner_data._ !== "mtproto/server_DH_inner_data") {
                throw new Error("invalid server_DH_inner_data" + Server_DH_inner_data._);
            }

            if (!compare(nonce, Server_DH_inner_data.nonce)) {
                throw new Error("server_DH_inner_data invalid nonce");
            }

            if (!compare(ResPQ.server_nonce, Server_DH_inner_data.server_nonce)) {
                throw new Error("server_DH_inner_data invalid server_nonce");
            }

            const dh_prime_hex = toHex(Server_DH_inner_data.dh_prime);
            const g_a_hex = toHex(Server_DH_inner_data.g_a);

            if (Server_DH_inner_data.g !== 3 ||
                dh_prime_hex !== "c71caeb9c6b1c9048e6c522f70f13f73980d40238e3e21c14934d037563d930f48198a0aa7c14058229493d22530f4dbfa336f6e0ac925139543aed44cce7c3720fd51f69458705ac68cd4fe6b6b13abdc9746512969328454f18faf8c595f642477fe96bb2a941d5bcd1d4ac8cc49880708fa9b378e3c4f3a9060bee67cf9a4a4a695811051907e162753b56b0f6b410dba74d8a84b2a14b3144e0ef1284754fd17ed950d5965b4b9dd46582db1178d169c6bc465b0d6ff9ca3928fef5b9ae4e418fc15e83ebea0f87fa9ff5eed70050ded2849f47bf959d956850ce929851f0d8115f635b105ee2e4e15d04b2454bf6f4fadf034b10403119cd8e3b92fcc5b"
            ) {
                // The verified value is from https://core.telegram.org/mtproto/security_guidelines
                throw new Error("DH params are not verified: unknown dh_prime");
            }

            const g_a_Big = BigInteger(g_a_hex, 16);
            const dh_prime_Big = BigInteger(dh_prime_hex, 16);

            if (g_a_Big.compareTo(BigInteger.one) <= 0) {
                throw new Error("gA <= 1");
            }

            if (g_a_Big.compareTo(dh_prime_Big.subtract(BigInteger.one)) >= 0) {
                throw new Error("gA >= dhPrime - 1");
            }

            const two_Big = BigInteger(2);
            const two_pow_2048_64_Big = two_Big.pow(BigInteger(2048 - 64));

            if (g_a_Big.compareTo(two_pow_2048_64_Big) === -1) {
                throw new Error("gA < 2^{2048-64}");
            }

            if (g_a_Big.compareTo(dh_prime_Big.subtract(two_pow_2048_64_Big)) > 0) {
                throw new Error("gA > dhPrime - 2^{2048-64}");
            }

            if (!compare(hash, SHA1(answer))) {
                throw new Error("server_DH_inner_data SHA1-hash mismatch");
            }

            // TODO: uncomment
            // this.connection.state.applyServerTime(Server_DH_inner_data.server_time);

            let isAuthorized = false;
            let retry = 0;

            while (!isAuthorized) {
                const g_bytes = fromHex(Server_DH_inner_data.g.toString(16));
                const b = randomBuffer(256);
                const g_b = modPow(g_bytes, b, Server_DH_inner_data.dh_prime);

                const Client_DH_Inner_Data = TL.pack(this.connection.application.schema, {
                    _: "mtproto/client_DH_inner_data",
                    nonce: nonce,
                    server_nonce: ResPQ.server_nonce,
                    retry_id: String(retry++),
                    g_b: g_b
                });

                let data_with_hash = concat(SHA1(Client_DH_Inner_Data), Client_DH_Inner_Data);

                if (data_with_hash.length % 16 !== 0) {
                    data_with_hash = concat(data_with_hash, randomBuffer(16 - (data_with_hash.length % 16)));
                }

                const encrypted_data = aes_ige_encrypt(data_with_hash, tmp_aes_key, tmp_aes_iv);

                let Set_client_DH_params_answer = await this.connection.invokeUnencryptedMethod("mtproto/set_client_DH_params", {
                    nonce: nonce,
                    server_nonce: ResPQ.server_nonce,
                    encrypted_data: encrypted_data,
                });

                if (
                    Set_client_DH_params_answer._ !== "mtproto/dh_gen_ok" &&
                    Set_client_DH_params_answer._ !== "mtproto/dh_gen_retry" &&
                    Set_client_DH_params_answer._ !== "mtproto/dh_gen_fail"
                ) {
                    throw new Error(Set_client_DH_params_answer._);
                }

                if (!compare(nonce, Set_client_DH_params_answer.nonce)) {
                    throw new Error("Set_client_DH_params_answer invalid nonce");
                }

                if (!compare(ResPQ.server_nonce, Set_client_DH_params_answer.server_nonce)) {
                    throw new Error("Set_client_DH_params_answer bad server_nonce");
                }

                this.setAuthKey(modPow(Server_DH_inner_data.g_a, b, Server_DH_inner_data.dh_prime));

                switch (Set_client_DH_params_answer._) {
                    case "mtproto/dh_gen_ok":
                        LOG(`[${this.connection.dcId}] dh_gen_ok`);

                        const new_nonce_hash1 = SHA1(concat(new_nonce, new Uint8Array([1]), this.authKeyAux)).slice(-16);

                        if (!compare(new_nonce_hash1, Set_client_DH_params_answer.new_nonce_hash1)) {
                            throw new Error("Set_client_DH_params_answer.new_nonce_hash1 != new_nonce_hash1");
                        }

                        this.serverSalt = xor(new_nonce.slice(0, 8), ResPQ.server_nonce.slice(0, 8));

                        isAuthorized = true;
                        this.isAuthorized = true;
                        this.isAuthorizing = false;

                        return this.authKey;

                    case "mtproto/dh_gen_retry":
                        LOG(`[${this.connection.dcId}] dh_gen_retry`);

                        const new_nonce_hash2 = SHA1(concat(new_nonce, new Uint8Array([2]), this.authKeyAux)).slice(-16);

                        if (!compare(new_nonce_hash2, Set_client_DH_params_answer.new_nonce_hash2)) {
                            throw new Error("Set_client_DH_params_answer.new_nonce_hash2 != new_nonce_hash2");
                        }

                        isAuthorized = false;

                        break;

                    case "mtproto/dh_gen_fail":
                        const new_nonce_hash3 = SHA1(concat(new_nonce, new Uint8Array([3]), this.authKeyAux)).slice(-16);

                        isAuthorized = false;
                        this.isAuthorizing = false;

                        if (!compare(new_nonce_hash3, Set_client_DH_params_answer.new_nonce_hash3)) {
                            throw new Error("Set_client_DH_params_answer.new_nonce_hash3 != new_nonce_hash3");
                        }

                        throw new Error("Set_client_DH_params_answer dh_gen_fail");
                }
            }
        } else {

        }
    }
}

export default Authorization;