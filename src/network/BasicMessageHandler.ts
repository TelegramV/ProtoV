import {long, MessagesHandler, RPCRequest} from "../types";
import Connection from "./Connection";
import {Constructor} from "protov-tl/lib/types";

function parseRPCError(error: any) {
    return {
        code: !error.error_code || error.error_code <= 0 ? 500 : error.error_code,
        type: ((error.error_message || "").match(/^([A-Z_0-9]+\b)(: (.+))?/) || [])[1] || "UNKNOWN",
        error: error,
    };
}

class BasicMessageHandler implements MessagesHandler {
    connection: Connection;
    requests: Map<long, RPCRequest>;

    constructor(connection: Connection) {
        this.connection = connection;
        this.requests = new Map();
    }

    handleRPCResult(message_id: long, rpc_result: Constructor): Promise<any> {
        this.connection.ackMessages([message_id]);

        const request = this.requests.get(rpc_result.req_msg_id);

        if (!request) {
            return Promise.reject("no rpc request found");
        }

        if (rpc_result.result._ === "rpc_error") {
            const error = {
                request: {
                    name: request.name,
                    params: request.params,
                },
                dcId: this.connection.dcId,
                ...parseRPCError(rpc_result.result),
            };

            if (error.type && error.type.startsWith("FLOOD_WAIT_")) {
                const fwTime = parseInt(error.type.substring("FLOOD_WAIT_".length));

                if (fwTime <= 30) {
                    setTimeout(() => this.resend(rpc_result.req_msg_id), (fwTime * 1000) + 1000);

                    return Promise.resolve();
                }
            } else if (error.code === 500 && error.type !== "UNKNOWN") {
                setTimeout(() => this.resend(rpc_result.req_msg_id), 1000);

                return Promise.resolve();
            } else if (error.code === 303) {
                if (
                    error.type.startsWith("PHONE_MIGRATE") ||
                    error.type.startsWith("USER_MIGRATE") ||
                    error.type.startsWith("NETWORK_MIGRATE")
                ) {
                    const dcId = parseInt(error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2]);

                    return this.connection.application.setMainConnection(dcId).then(connection => {
                        this.requests.delete(message_id);

                        return connection.invokeMethod(request.name, request.params)
                            .then(request.resolve)
                            .catch(request.reject);
                    });
                } else if (error.type.startsWith("FILE_MIGRATE")) {
                    const dcId = parseInt(error.type.match(/^(FILE_MIGRATE_)(\d+)/)[2]);

                    const connection = this.connection.application.getConnection(dcId);

                    this.requests.delete(message_id);

                    return connection.invokeMethod(request.name, request.params)
                        .then(request.resolve)
                        .catch(request.reject);
                }
            }

            this.requests.delete(rpc_result.req_msg_id);

            return request.reject(error);
        } else {
            this.requests.delete(rpc_result.req_msg_id);

            return request.resolve(rpc_result.result);
        }
    }

    async handleMsgContainer(message_id: long, msg_container: Constructor): Promise<void> {
        for (const message of msg_container.messages) {
            await this.handle(message.msg_id, message);
        }
    }

    handleMessage(message_id: long, message: Constructor): Promise<any> {
        return this.handle(message.msg_id, message.body);
    }

    async handleMsgsAck(message_id: long, msgs_ack: Constructor): Promise<void> {
        this.connection.ackMessages(msgs_ack.msg_ids);
    }

    handleBadServerSalt(message_id: long, bad_server_salt: Constructor): Promise<any> {
        return this.connection.updateServerSalt(bad_server_salt.new_server_salt)
            .then(() => this.resend(bad_server_salt.bad_msg_id));
    }

    handleNewSessionCreated(message_id: long, new_session_created: Constructor): Promise<any> {
        return Promise.resolve();
    }

    handleMsgNewDetailedInfo(message_id: long, msg_new_detailed_info: Constructor): Promise<any> {
        return Promise.resolve();
    }

    handleMsgDetailedInfo(message_id: long, msg_detailed_info: Constructor): Promise<any> {
        return Promise.resolve();
    }

    handleBadMsgNotification(message_id: long, bad_msg_notification: Constructor): Promise<any> {
        return Promise.resolve();
    }

    handle(message_id: long, message: Constructor): Promise<any> {
        if (!message || !message._) {
            return Promise.reject("invalid message");
        }

        switch (message._) {
            case "rpc_result":
                return this.handleRPCResult(message_id, message);
            case "msg_container":
                return this.handleMsgContainer(message_id, message);
            case "message":
                return this.handleMessage(message_id, message);
            case "pong":
                return Promise.resolve();
            case "msgs_ack":
                return this.handleMsgsAck(message_id, message);
            case "bad_server_salt":
                return this.handleBadServerSalt(message_id, message);
            case "new_session_created":
                return this.handleNewSessionCreated(message_id, message);
            case "msg_new_detailed_info":
                return this.handleMsgNewDetailedInfo(message_id, message);
            case "msg_detailed_info":
                return this.handleMsgDetailedInfo(message_id, message);
            case "bad_msg_notification":
                return this.handleBadMsgNotification(message_id, message);
            case "messageEmpty":
                return Promise.resolve("messageEmpty");
        }

        return Promise.resolve(this.connection.application.onUpdate(message));
    }

    resend(message_id: long): Promise<any> {
        const request = this.requests.get(message_id);

        if (!request) {
            return Promise.reject("no rpc request found");
        }

        this.requests.delete(message_id);

        return this.connection.invokeMethod(request.name, request.params)
            .then(request.resolve)
            .catch(request.reject);
    }
}

export default BasicMessageHandler;