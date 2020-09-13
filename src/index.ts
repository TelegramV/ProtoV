import TelegramApplication from "./application/TelegramApplication";
// import {JsonSchema} from "protov-tl";
//
// const application = new TelegramApplication({
//     main_dc_id: 2,
//     layer: 117,
//     schema: new JsonSchema(import("./schema_combine_117.json")),
//     api_id: 1147988,
//     api_hash: "4acddf30a6113bfe220f7fd67ab7f468",
//     app_version: "0.5.0"
// });
//
// application.invoke("help.getNearestDc").then(NearestDc => {
//     console.log(NearestDc);
// });
//
// application.start().then(() => {
//     console.log("[Telegram] started");
// });

export {TelegramApplication};