const coininfo = require("coininfo");
const bitcoin = require("bitcoinjs-lib");
const litecoinNetwork = coininfo.litecoin.main.toBitcoinJS();
bitcoin.networks.bitcoin = litecoinNetwork;
module.exports = bitcoin;
