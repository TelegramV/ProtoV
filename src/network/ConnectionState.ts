import BigInteger from "big-integer";

class ConnectionState {
    messageId = BigInteger(0);
    seqNo = 0;
    timeOffset = 0;

    nextSeqNo(contentRelated: boolean = true): number {
        let seqNo = this.seqNo * 2;

        if (contentRelated) {
            seqNo++;
            this.seqNo++;
        }

        return seqNo;
    }

    nextMessageId(): string {
        const now = new Date().getTime() / 1000 + this.timeOffset;
        const nanoseconds = Math.floor((now - Math.floor(now)) * 1e9);

        let newMsgId = BigInteger(Math.floor(now))
            .shiftLeft(32)
            .or(BigInteger(nanoseconds).shiftLeft(2));

        if (this.messageId.greaterOrEquals(newMsgId)) {
            newMsgId = this.messageId.plus(4);
        }

        this.messageId = newMsgId;

        return newMsgId.toString(10);
    }
}

export default ConnectionState;