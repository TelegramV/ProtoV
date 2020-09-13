import {Constructor} from "protov-tl/lib/types";

export type long = string;

export interface Transporter {
    readonly isReady: any;

    transport(buffer: ArrayBuffer): void;
}

export interface Storage {
    getItem(key: string): Promise<any>;

    setItem(key: string, value: any): Promise<any | void>;

    removeItem(key: string): Promise<any | void>;
}

export interface MessagesHandler {
    readonly requests: Map<long, RPCRequest>;

    handle(message_id: long, message: Constructor): Promise<any>;
}

export type RPCRequest = {
    name: string;
    params: any;
    resolve: any;
    reject: any;
}