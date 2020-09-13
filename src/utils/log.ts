function logger(prefix?: string) {
    return (...message: any[]) => {
        if (prefix) {
            console.debug(prefix, ...message);
        } else {
            console.debug(...message);
        }
    };
}

export default logger;