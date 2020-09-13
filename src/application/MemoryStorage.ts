import {Storage} from "../types";

class MemoryStorage implements Storage {
    data: Map<any, any> = new Map();

    getItem(key: string): Promise<any> {
        return Promise.resolve(this.data.get(key));
    }

    removeItem(key: string): Promise<any> {
        return Promise.resolve(this.data.delete(key));
    }

    setItem(key: string, value: any): Promise<any> {
        return Promise.resolve(this.data.set(key, value));
    }
}

export default MemoryStorage;