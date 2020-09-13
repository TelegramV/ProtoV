import Connection from "./Connection";

function parse_rpc_error(error: any) {
    return {
        code: !error.error_code || error.error_code <= 0 ? 500 : error.error_code,
        type: ((error.error_message || "").match(/^([A-Z_0-9]+\b)(: (.+))?/) || [])[1] || "UNKNOWN",
        error: error,
    };
}

const ALWAYS_DO_RESEND_ON_FLOOD = [
    "messages.getHistory",
    "upload.getFile",
];

class MessagesProcessor {
    connection: Connection;
    handlers: Map<string, any>;

    constructor(connection: Connection) {
        this.connection = connection;
        this.handlers = new Map();
    }

    process_pong = (pong: any, message_id: any, session_id: any) => {
        //
    };

    process_bad_msg_notification = (bad_msg_notification: any, message_id: any, session_id: any) => {
        // todo: reinvoke
        console.warn("bad_msg_notification", bad_msg_notification, this.handlers.get(bad_msg_notification.bad_msg_id), "todo: handle it by resending message");
    };

    process_msg_detailed_info = (msg_detailed_info: any, message_id: any, session_id: any) => {
        // console.warn("msg_detailed_info", msg_detailed_info)
    };

    process_msg_new_detailed_info = (msg_new_detailed_info: any, message_id: any, session_id: any) => {
        // console.warn("msg_new_detailed_info", msg_new_detailed_info)
    };

    process_new_session_created = (new_session_created: any, message_id: any, session_id: any) => {
        // MTProtoInternal.processUpdate(new_session_created);
    };

    process_bad_server_salt = (bad_server_salt: any, message_id: any, session_id: any) => {
        console.log("process_bad_server_salt");
        // this.connection.updateServerSalt(bad_server_salt.new_server_salt).then(() => {
        //     this.connection.reinvoke(bad_server_salt.bad_msg_id);
        // });
    };

    process_msgs_ack = (msgs_ack: any, message_id: any, session_id: any) => {
        this.connection.ackMessages(msgs_ack.msg_ids);
    };

    process_message = (message: any, message_id: any, session_id: any) => {
        this.process(message.body, message.msg_id, session_id);
    };

    process_msg_container = (msg_container: any, message_id: any, session_id: any) => {
        msg_container.messages.forEach((message: any) => {
            this.process(message, message.msg_id, session_id);
        });
    };

    process_rpc_result = (rpc_result: any, message_id: any, session_id: any) => {
        this.connection.ackMessages([message_id]);

        const handler = this.handlers.get(rpc_result.req_msg_id);

        if (!handler) {
            console.error("no pending invokation found", rpc_result.req_msg_id, rpc_result.result, this.handlers);
            return;
        }

        if (rpc_result.result._ === "rpc_error") {
            const error = {
                method: handler.name,
                params: handler.params,
                dcId: this.connection.dcId,
                ...parse_rpc_error(rpc_result.result)
            };

            // if (error.type === "AUTH_KEY_UNREGISTERED" && error.method !== "users.getUsers") { // WTF, why are we checking if user logged in by this method?
            //     // MTProtoInternal.authKeyUnregistered();
            // } else if (error.type && error.type.startsWith("FLOOD_WAIT_")) {
            //     const fwTime = parseInt(error.type.substring("FLOOD_WAIT_".length));
            //
            //     if (fwTime <= 30 || ALWAYS_DO_RESEND_ON_FLOOD.includes(handler.name)) {
            //         console.warn(error.type, handler);
            //
            //         return setTimeout(() => this.connection.reinvoke(rpc_result.req_msg_id), (fwTime * 1000) + 1000);
            //     }
            // } else if (error.code === 500 && error.type !== "UNKNOWN") {
            //     // next try in 1 second
            //     console.error("will be reinvoked", error);
            //     return setTimeout(() => this.connection.reinvoke(rpc_result.req_msg_id), 1000);
            // } else if (error.code === 303) {
            //     if (
            //         error.type.startsWith("PHONE_MIGRATE") ||
            //         error.type.startsWith("USER_MIGRATE") ||
            //         error.type.startsWith("NETWORK_MIGRATE")
            //     ) {
            //         const dcId = parseInt(error.type.match(/^(PHONE_MIGRATE_|NETWORK_MIGRATE_|USER_MIGRATE_)(\d+)/)[2]);
            //
            //         return this.connection.application.setMainConnection(dcId).then(connection => {
            //             this.handlers.delete(message_id);
            //
            //             return connection.invokeMethod(handler.name, handler.params, {useSecondTransporter: handler.useSecondTransporter})
            //                 .then(handler.resolve)
            //                 .catch(handler.reject);
            //         });
            //     } else if (error.type.startsWith("FILE_MIGRATE")) {
            //         const dcId = parseInt(error.type.match(/^(FILE_MIGRATE_)(\d+)/)[2]);
            //
            //         const connection = this.connection.application.getConnection(dcId);
            //
            //         this.handlers.delete(message_id);
            //
            //         return connection.invokeMethod(handler.name, handler.params, {useSecondTransporter: handler.useSecondTransporter})
            //             .then(handler.resolve)
            //             .catch(handler.reject);
            //     }
            // }

            handler.reject(error);
            this.handlers.delete(rpc_result.req_msg_id);
        } else {
            handler.resolve(rpc_result.result);
            this.handlers.delete(rpc_result.req_msg_id);
        }
    };

    process(message: any, message_id: any, session_id: any) {
        if (!message || !message._) {
            console.error("invalid message", message_id, session_id, message);
            return;
        }

        switch (message._) {
            case "rpc_result":
                return this.process_rpc_result(message, message_id, session_id);
            case "msg_container":
                return this.process_msg_container(message, message_id, session_id);
            case "message":
                return this.process_message(message, message_id, session_id);
            case "pong":
                return this.process_pong(message, message_id, session_id);
            case "msgs_ack":
                return this.process_msgs_ack(message, message_id, session_id);
            case "bad_server_salt":
                return this.process_bad_server_salt(message, message_id, session_id);
            case "new_session_created":
                return this.process_new_session_created(message, message_id, session_id);
            case "msg_new_detailed_info":
                return this.process_msg_new_detailed_info(message, message_id, session_id);
            case "msg_detailed_info":
                return this.process_msg_detailed_info(message, message_id, session_id);
            case "bad_msg_notification":
                return this.process_bad_msg_notification(message, message_id, session_id);
            case "messageEmpty":
                console.log("messageEmpty");
                return null;

            default:
                // MTProtoInternal.processUpdate(message);
                return;
        }
    }
}

export default MessagesProcessor;