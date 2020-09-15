# ProtoV

Telegram Application with JavaScript.

## Install
NPM:
```shell script
npm install protov
```

Yarn:
```shell script
yarn add protov
```

## Basic Example

```javascript
const ProtoV = require("protov");
const schema = require("protov-tl-schema");

const app = new ProtoV({
    layer: 113,
    schema: schema,
    main_dc_id: 2,
    api_id: 123456,
    api_hash: "",
    app_version: "0.1.0"
});

app.start().then(() => {
    console.log("started");
    
    app.invoke("help.getNearestDc")
       .then(NearestDc => console.log(NearestDc))
       .catch(e => console.error(e));
});
```