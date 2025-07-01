
// import { main } from "./shinbasen.js";
import { main, backtest } from "./shutsuba";

if (Bun.argv[2] === 'backtest'){
    await backtest(Bun.argv[3]);
} else {
    await main(Bun.argv[2]);
}

