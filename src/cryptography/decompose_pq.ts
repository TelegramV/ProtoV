import {fromBigInteger, toBigIntegerLE} from "../utils/bytes";
import {randomInteger} from "../utils/random";
import big, {BigInteger} from "big-integer";

function min(a: BigInteger, b: BigInteger): BigInteger {
    if (a.compareTo(b) < 0) {
        return a;
    }

    return b;
}

function abs(a: BigInteger, b: BigInteger): BigInteger {
    if (a.compareTo(b) > 0) {
        return a.subtract(b);
    }

    return b.subtract(a);
}

function decompose_pq(pq: Uint8Array): { p: Uint8Array; q: Uint8Array } {
    const pqBig = toBigIntegerLE(pq.reverse());

    const big0 = big(0);
    const big1 = big(1);
    const big2 = big(2);

    if (pqBig.remainder(big2).equals(big0)) {
        return {
            p: fromBigInteger(big2),
            q: fromBigInteger(pqBig.divide(big2))
        };
    }

    let y = big1.add(big(randomInteger(64)).mod(pqBig.subtract(big1))),
        c = big1.add(big(randomInteger(64)).mod(pqBig.subtract(big1))),
        m = big1.add(big(randomInteger(64)).mod(pqBig.subtract(big1)));

    let g = big1,
        r = big1,
        q = big1;

    let x = big0,
        ys = big0;

    while (g.equals(big1)) {
        x = y;

        for (let i = big0; i.compareTo(r) < 0; i = i.add(big1)) {
            y = y.pow(big2).mod(pqBig).add(c).remainder(pqBig);
        }

        let k = big0;

        while (k.compareTo(r) < 0 && g.equals(big1)) {
            ys = y;

            for (let i = big0; i < min(m, r.subtract(k)); i = i.add(big1)) {
                y = y.pow(big2).mod(pqBig).add(c).mod(pqBig);
                q = q.multiply(abs(x, y)).mod(pqBig);
            }

            g = big.gcd(q, pqBig);
            k = k.add(m);
        }

        r = r.multiply(big2);
    }

    if (g.equals(pqBig)) {
        while (true) {
            ys = ys.pow(big2).mod(pqBig).add(c).remainder(pqBig);
            // @ts-ignore
            g = abs(x, ys).gcd(pqBig);

            if (g.compareTo(big1) > 0) {
                break;
            }
        }
    }

    const p = g;
    q = pqBig.divide(p);

    return (p.compareTo(q) < 0) ? {
        p: fromBigInteger(p),
        q: fromBigInteger(q)
    } : {
        p: fromBigInteger(q),
        q: fromBigInteger(p)
    };
}

export default decompose_pq;