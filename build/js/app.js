const coin = "LTC";
const ordinalsExplorerUrl = "https://ordinalslite.com"; // TODO: Replace with LitecoinLabs explorer
const baseMempoolUrl = "https://litecoinspace.org";
const networkName = "mainnet";
const baseMempoolApiUrl = `${baseMempoolUrl}/api`;
const litecoinPriceApiUrl =
  "https://api.coingecko.com/api/v3/simple/price?ids=litecoin&vs_currencies=usd";
const nostrRelayUrl = "wss://nostr.ordinalslite.market"; // TODO: Remove Nostr, replace with centralized DB for performance
const collectionsRepo = "litecoinlabs/collections";
const exchangeName = "ordinalslite.market";
const feeLevel = "hourFee"; // "fastestFee" || "halfHourFee" || "hourFee" || "economyFee" || "minimumFee"
const dustLimit = 3_000; // https://litecoin.info/index.php/Transaction_fees implies a dust limit of 100k, but in testing 3k was fine...
const dummyUtxoValue = dustLimit;
const nostrOrderEventKind = 802;
const txHexByIdCache = {};
const urlParams = new URLSearchParams(window.location.search);
const numberOfDummyUtxosToCreate = 2;
const platformFeeAddress = "ltc1qpj7npp4dl82f805n9lpwwypx89wt832awqkuss";
const wallets = [
  {
    name: "Litescribe",
    url: "https://github.com/ynohtna92/extension-ltc/releases",
  },
].sort((a, b) => 0.5 - Math.random());
const walletsListHtml = wallets
  .map((x) => `<a href="${x.url}" target="_blank">${x.name}</a>`)
  .join(" or ");

let inscriptionIdentifier = urlParams.get("number");
let collectionSlug = urlParams.get("slug");
let inscriptionNumber;
let bitcoinPrice;
let recommendedFeeRate;
let sellerSignedPsbt;
let network;
let payerUtxos = [];
let dummyUtxos = [];
let paymentUtxos;
let inscription;
let nostrRelay;
let modulesInitializedPromise;
let installedWalletName;
let isWalletInstalled;
let connectAppConfig;
let connectUserSession;

let listInscriptionForSale;
let generateSalePsbt;
let submitSignedSalePsbt;
let buyInscriptionNow;
let updatePayerAddress;
let generateDummyUtxos;
let generatePSBTGeneratingDummyUtxos;
let btnBuyInscriptionNow;

async function selectUtxos(utxos, amount, vins, vouts, recommendedFeeRate) {
  console.log("selectUtxos called");
  const selectedUtxos = [];
  let selectedAmount = 0;

  // Sort descending by value, and filter out dummy utxos
  utxos = utxos
    .filter((x) => x.value > dummyUtxoValue)
    .sort((a, b) => b.value - a.value);

  for (const utxo of utxos) {
    // Never spend a utxo that contains an inscription for cardinal purposes
    if (await doesUtxoContainInscription(utxo)) {
      continue;
    }
    selectedUtxos.push(utxo);
    selectedAmount += utxo.value;

    if (
      selectedAmount >=
      amount +
        dummyUtxoValue +
        calculateFee(vins + selectedUtxos.length, vouts, recommendedFeeRate)
    ) {
      break;
    }
  }

  if (selectedAmount < amount) {
    throw new Error(`Not enough cardinal spendable funds.
Address has:  ${satToBtc(selectedAmount)} ${coin}
Needed:          ${satToBtc(amount)} ${coin}

UTXOs:
${utxos.map((x) => `${x.txid}:${x.vout}`).join("\n")}`);
  }

  return selectedUtxos;
}

function base64ToHex(str) {
  console.log("base64ToHex called");
  return atob(str)
    .split("")
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

function getInstalledWalletName() {
  console.log("getInstalledWalletName called");
  if (typeof window.litescribe !== "undefined") {
    return "Litescribe";
  }

  /* TODO: Implement LTC forks of Hiro, Xverse, OrdinalSafe
  if (window?.StacksProvider?.psbtRequest) {
    return "Hiro";
  }

  if (window?.BitcoinProvider?.signTransaction?.toString()?.includes("Psbt")) {
    return "Xverse";
  }

  if (typeof window.ordinalSafe !== "undefined") {
    return "OrdinalSafe";
  } */
}

/* async function getHiroWalletAddresses() {
  return new Promise((resolve, reject) => {
    if (!connectUserSession.isUserSignedIn()) {
      connect.showConnect({
        connectUserSession,
        network: Object.getPrototypeOf(
          connect.getDefaultPsbtRequestOptions({}).network.__proto__.constructor
        ).fromName("mainnet"),
        appDetails: {
          name: "OpenOrdex",
          icon: window.location.origin + "/img/favicon/apple-touch-icon.png",
        },
        onFinish: () => {
          resolve({
            cardinal:
              connectUserSession.loadUserData().profile.btcAddress.p2wpkh
                .mainnet,
            ordinal:
              connectUserSession.loadUserData().profile.btcAddress.p2tr.mainnet,
          });
        },
        onCancel: () => {
          resolve();
        },
      });
    } else {
      resolve({
        cardinal:
          connectUserSession.loadUserData().profile.btcAddress.p2wpkh.mainnet,
        ordinal:
          connectUserSession.loadUserData().profile.btcAddress.p2tr.mainnet,
      });
    }
  });
}*/

/**
 * getWalletAddress(type = 'cardinal')
 * @param {undefined | 'cardinal' | 'ordinal'} type
 * @returns {string | undefined}
 */
async function getWalletAddress(type = "cardinal") {
  console.log("getWalletAddress called");
  if (typeof window.litescribe !== "undefined") {
    return (await litescribe.requestAccounts())?.[0];
  }

  /* TODO: Implement LTC forks of Hiro, Xverse, OrdinalSafe
  if (typeof window.StacksProvider !== "undefined") {
    return (await getHiroWalletAddresses())?.[type];
  }

  if (typeof window.ordinalSafe !== "undefined") {
    return (await ordinalSafe.requestAccounts())?.[0];
  } */
}

function removeHashFromUrl() {
  console.log("removeHashFromUrl called");
  const uri = window.location.toString();

  if (uri.indexOf("#") > 0) {
    const cleanUri = uri.substring(0, uri.indexOf("#"));

    window.history.replaceState({}, document.title, cleanUri);
  }
}

async function getLowestPriceSellPSBTForUtxo(utxo) {
  console.log("getLowestPriceSellPSBTForUtxo called");
  await nostrRelay.connect();
  const orders = (
    await nostrRelay.list([
      {
        kinds: [nostrOrderEventKind],
        "#u": [utxo],
      },
    ])
  )
    .filter((a) => a.tags.find((x) => x?.[0] == "s")?.[1])
    .sort(
      (a, b) =>
        Number(a.tags.find((x) => x?.[0] == "s")[1]) -
        Number(b.tags.find((x) => x?.[0] == "s")[1])
    );

  for (const order of orders) {
    const price = validateSellerPSBTAndExtractPrice(order.content, utxo);
    if (price == Number(order.tags.find((x) => x?.[0] == "s")[1])) {
      return order.content;
    }
  }
}

function validateSellerPSBTAndExtractPrice(sellerSignedPsbtBase64, utxo) {
  console.log("validateSellerPSBTAndExtractPrice called");
  try {
    sellerSignedPsbt = bitcoin.Psbt.fromBase64(sellerSignedPsbtBase64, {
      network,
    });
    const sellerInput = sellerSignedPsbt.txInputs[0];
    const sellerSignedPsbtInput = `${sellerInput.hash
      .reverse()
      .toString("hex")}:${sellerInput.index}`;

    if (sellerSignedPsbtInput != utxo) {
      throw `Seller signed PSBT does not match this inscription\n\n${sellerSignedPsbtInput}\n!=\n${utxo}`;
    }

    if (
      sellerSignedPsbt.txInputs.length != 1 ||
      sellerSignedPsbt.txInputs.length != 1
    ) {
      throw `Invalid seller signed PSBT`;
    }

    try {
      sellerSignedPsbt.extractTransaction(true);
    } catch (e) {
      if (e.message == "Not finalized") {
        throw "PSBT not signed";
      } else if (e.message != "Outputs are spending more than Inputs") {
        throw "Invalid PSBT " + e.message || e;
      }
    }

    const sellerOutput = sellerSignedPsbt.txOutputs[0];
    price = sellerOutput.value;

    return Number(price);
  } catch (e) {
    console.error(e);
  }
}

function publishSellerPsbt(
  signedSalePsbt,
  inscriptionId,
  inscriptionNumber,
  inscriptionUtxo,
  priceInSats
) {
  console.log("publishSellerPsbt called");
  return new Promise(async (resolve, reject) => {
    try {
      await nostrRelay.connect();

      let sk = window.NostrTools.generatePrivateKey();
      let pk = window.NostrTools.getPublicKey(sk);

      let event = {
        kind: nostrOrderEventKind,
        pubkey: pk,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["n", networkName], // Network name (e.g. "mainnet", "signet")
          ["t", "sell"], // Type of order (e.g. "sell", "buy")
          ["i", inscriptionId], // Inscription ID
          ["m", inscriptionNumber], // Inscription number
          ["u", inscriptionUtxo], // Inscription UTXO
          ["s", priceInSats.toString()], // Price in sats
          ["x", exchangeName], // Exchange name (e.g. "openordex")
        ],
        content: signedSalePsbt,
      };
      event.id = window.NostrTools.getEventHash(event);
      event.sig = window.NostrTools.signEvent(event, sk);

      let pub = nostrRelay.publish(event);
      pub.on("ok", () => {
        console.log(`${nostrRelay.url} has accepted our order`);
        resolve();
      });
      pub.on("failed", (reason) => {
        reject(`Failed to publish PSBT to ${relay.url}: ${reason}`);
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function doesUtxoContainInscription(utxo) {
  console.log("doesUtxoContainInscription called");
  const html = await fetch(
    `${ordinalsExplorerUrl}/output/${utxo.txid}:${utxo.vout}`
  ).then((response) => response.text());

  return html.match(/class=thumbnails/) !== null;
}

function calculateFee(
  vins,
  vouts,
  recommendedFeeRate,
  includeChangeOutput = true
) {
  console.log("calculateFee called");
  const baseTxSize = 10;
  const inSize = 180;
  const outSize = 34;

  const txSize =
    baseTxSize +
    vins * inSize +
    vouts * outSize +
    includeChangeOutput * outSize;
  const fee = txSize * recommendedFeeRate;

  return fee;
}

function getExplorerLink(inscriptionId) {
  console.log("getExplorerLink called");
  return `${ordinalsExplorerUrl}/inscription/${inscriptionId.replace(
    ":",
    "i"
  )}`;
}

async function getTxHexById(txId) {
  console.log("getTxHexById called");
  if (!txHexByIdCache[txId]) {
    txHexByIdCache[txId] = await fetch(
      `${baseMempoolApiUrl}/tx/${txId}/hex`
    ).then((response) => response.text());
  }

  return txHexByIdCache[txId];
}

async function getAddressMempoolTxIds(address) {
  console.log("getAddressMempoolTxIds called");
  return await fetch(`${baseMempoolApiUrl}/address/${address}/txs/mempool`)
    .then((response) => response.json())
    .then((txs) => txs.map((tx) => tx.txid));
}

async function getAddressUtxos(address) {
  console.log("getAddressUtxos called");
  return await fetch(`${baseMempoolApiUrl}/address/${address}/utxo`).then(
    (response) => response.json()
  );
}

function openInscription() {
  console.log("openInscription called");
  var inscriptionIdentifier = document.getElementById(
    "inscriptionIdentifier"
  ).value;
  if (inscriptionIdentifier) {
    document.location = "inscription.html?number=" + inscriptionIdentifier;
  }
}

async function getInscriptionIdByNumber(inscriptionNumber) {
  console.log("getInscriptionIdByNumber called");
  const html = await fetch(
    ordinalsExplorerUrl + "/inscriptions/" + inscriptionNumber
  ).then((response) => response.text());

  return html.match(/\/inscription\/(.*?)>/)[1];
}

async function getCollection(collectionSlug) {
  console.log("getCollection called");
  if (collectionSlug == "under-10") {
    return await fetch(`/static/under-10.json`).then((response) =>
      response.json()
    );
  }

  const [meta, inscriptions] = await Promise.all([
    fetch(
      `https://raw.githubusercontent.com/${collectionsRepo}/main/collections/${collectionSlug}/meta.json`
    ).then((response) => response.json()),
    fetch(
      `https://raw.githubusercontent.com/${collectionsRepo}/main/collections/${collectionSlug}/inscriptions.json`
    ).then((response) => response.json()),
  ]);

  return {
    ...meta,
    inscriptions,
  };
}

async function getCollections() {
  console.log("getCollections called");
  return fetch(`/static/collections.json`)
    .then((response) => response.json())
    .then((collections) => collections.sort((a, b) => 0.5 - Math.random()));
}

function satsToFormattedDollarString(sats, _bitcoinPrice) {
  console.log("satsToFormattedDollarString called");
  return (satToBtc(sats) * _bitcoinPrice).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function* getLatestOrders(limit, nostrLimit = 20, filters = {}) {
  console.log("getLatestOrders called");
  await nostrRelay.connect();
  const latestOrders = [];
  const inscriptionDataCache = {};

  const orders = await nostrRelay.list([
    {
      kinds: [nostrOrderEventKind],
      limit: nostrLimit,
      ...filters,
    },
  ]);

  for (const order of orders) {
    try {
      if (!order.tags.find((x) => x?.[0] == "s")?.[1]) {
        continue;
      }
      const inscriptionId = order.tags.find((x) => x?.[0] == "i")[1];
      if (latestOrders.find((x) => x.inscriptionId == inscriptionId)) {
        continue;
      }

      const inscriptionData =
        inscriptionDataCache[inscriptionId] ||
        (await getInscriptionDataById(inscriptionId));
      inscriptionDataCache[inscriptionId] = inscriptionData;
      const validatedPrice = validateSellerPSBTAndExtractPrice(
        order.content,
        inscriptionData.output
      );
      if (!validatedPrice) {
        continue;
      }

      const ord = {
        title: `Buy for ${satToBtc(
          validatedPrice
        )} ${coin} ($${satsToFormattedDollarString(
          validatedPrice,
          await bitcoinPrice
        )})`,
        number: inscriptionData.number,
        inscriptionId,
      };
      latestOrders.push(ord);
      yield ord;

      if (latestOrders.length >= limit) {
        break;
      }
    } catch (e) {
      console.error(e);
    }
  }

  return latestOrders;
}

function copyInput(btn, inputId) {
  console.log("copyInput called");
  const input = document.getElementById(inputId);
  input.select();
  input.setSelectionRange(0, 9999999);

  navigator.clipboard.writeText(input.value);

  const originalBtnTest = btn.textContent;
  btn.textContent = "Copied!";
  setTimeout(() => (btn.textContent = originalBtnTest), 200);
}

function downloadInput(inputId, filename) {
  console.log("downloadInput called");
  const input = document.getElementById(inputId);
  const hiddenElement = document.createElement("a");
  hiddenElement.href = "data:attachment/text," + encodeURI(input.value);
  hiddenElement.target = "_blank";
  hiddenElement.download = filename;
  hiddenElement.click();
}

const toXOnly = (pubKey) =>
  pubKey.length === 32 ? pubKey : pubKey.slice(1, 33);
const range = (n) => Array.from(Array(n).keys());

async function signPSBTUsingWallet(psbtBase64) {
  console.log("signPSBTUsingWallet called");
  await getWalletAddress();

  if (installedWalletName == "Litescribe") {
    return await litescribe.signPsbt(base64ToHex(psbtBase64));
  }

  /* TODO: Implement LTC forks of Hiro, Xverse, OrdinalSafe
  } else if (installedWalletName == "Hiro") {
    return new Promise((resolve, reject) => {
      connect.openPsbtRequestPopup({
        appDetails: {
          name: "OpenOrdex",
          icon: window.location.origin + "/img/favicon/apple-touch-icon.png",
        },
        hex: base64ToHex(psbtBase64),
        network: Object.getPrototypeOf(
          connect.getDefaultPsbtRequestOptions({}).network.__proto__.constructor
        ).fromName("mainnet"),
        allowedSighash: [0x01, 0x02, 0x03, 0x81, 0x82, 0x83],
        signAtIndex: range(bitcoin.Psbt.fromBase64(psbtBase64).inputCount),
        onFinish: (data) => {
          resolve(data.hex);
        },
        onCancel: () => {
          reject(new Error("Hiro wallet canceled signing request"));
        },
      });
    });
  } else if (installedWalletName == "OrdinalSafe") {
    return await ordinalSafe.signPsbt(base64ToHex(psbtBase64));
  } */
}

async function signPSBTUsingWalletIntoInput(inputId, signedInputId) {
  console.log("signPSBTUsingWalletIntoInput called");
  const input = document.getElementById(inputId);
  const signedInput = document.getElementById(signedInputId);

  try {
    signedInput.value = await signPSBTUsingWallet(input.value);
  } catch (e) {
    console.error(e);
    alert(e.message);
  }
}

async function signPSBTUsingWalletAndBroadcast(inputId) {
  console.log("signPSBTUsingWalletAndBroadcast called");
  const input = document.getElementById(inputId);

  try {
    const signedPsbtHex = await signPSBTUsingWallet(input.value);
    const signedPsbt = bitcoin.Psbt.fromHex(signedPsbtHex);
    /*if (installedWalletName == "Hiro") {
      for (let i = 0; i < signedPsbt.data.inputs.length; i++) {
        try {
          signedPsbt.finalizeInput(i);
        } catch (e) {
          console.error(e);
        }
      }
    }*/

    const txHex = signedPsbt.extractTransaction().toHex();
    const res = await fetch(`${baseMempoolApiUrl}/tx`, {
      method: "post",
      body: txHex,
    });
    if (res.status != 200) {
      return alert(
        `Mempool API returned ${res.status} ${
          res.statusText
        }\n\n${await res.text()}`
      );
    }

    const txId = await res.text();
    alert("Transaction signed and broadcasted to mempool successfully");
    window.open(`${baseMempoolUrl}/tx/${txId}`, "_blank");
  } catch (e) {
    console.error(e);
    alert(e?.message || e);
  }
}

async function getInscriptionDataById(
  inscriptionId,
  verifyIsInscriptionNumber
) {
  console.log("getInscriptionDataById called");
  const html = await fetch(
    ordinalsExplorerUrl + "/inscription/" + inscriptionId
  ).then((response) => response.text());

  const data = [...html.matchAll(/<dt>(.*?)<\/dt>\s*<dd.*?>(.*?)<\/dd>/gm)]
    .map((x) => {
      x[2] = x[2].replace(/<.*?>/gm, "");
      return x;
    })
    .reduce((a, b) => {
      return { ...a, [b[1]]: b[2] };
    }, {});

  const error = `Inscription ${
    verifyIsInscriptionNumber || inscriptionId
  } not found (maybe you're on signet and looking for a mainnet inscription or vice versa)`;
  try {
    data.number = html.match(/<h1>Inscription (\d*)<\/h1>/)[1];
  } catch {
    throw new Error(error);
  }
  if (
    verifyIsInscriptionNumber &&
    String(data.number) != String(verifyIsInscriptionNumber)
  ) {
    throw new Error(error);
  }

  return data;
}

function sanitizeHTML(str) {
  console.log("sanitizeHTML called");
  var temp = document.createElement("div");
  temp.textContent = str;
  return temp.innerHTML;
}

function getHashQueryStringParam(paramName) {
  console.log("getHashQueryStringParam called");
  const params = new URLSearchParams(window.location.hash.substr(1));
  return params.get(paramName);
}

async function generatePSBTListingInscriptionForSale(
  ordinalOutput,
  price,
  paymentAddress
) {
  console.log("generatePSBTListingInscriptionForSale called");
  let psbt = new bitcoin.Psbt({ network });

  const [ordinalUtxoTxId, ordinalUtxoVout] = ordinalOutput.split(":");
  const tx = bitcoin.Transaction.fromHex(await getTxHexById(ordinalUtxoTxId));
  /*if (installedWalletName != "Hiro") {
    for (const output in tx.outs) {
      try {
        tx.setWitness(parseInt(output), []);
      } catch {}
    }
  }*/

  const input = {
    hash: ordinalUtxoTxId,
    index: parseInt(ordinalUtxoVout),
    nonWitnessUtxo: tx.toBuffer(),
    witnessUtxo: tx.outs[ordinalUtxoVout],
    sighashType:
      bitcoin.Transaction.SIGHASH_SINGLE |
      bitcoin.Transaction.SIGHASH_ANYONECANPAY,
  };
  /*if (installedWalletName == "Hiro") {
    await getWalletAddress();
    input.tapInternalKey = toXOnly(
      tx
        .toBuffer()
        .__proto__.constructor(
          connectUserSession.loadUserData().profile.btcPublicKey.p2tr,
          "hex"
        )
    );
  }*/

  psbt.addInput(input);

  psbt.addOutput({
    address: paymentAddress,
    value: price,
  });

  return psbt.toBase64();
}

function btcToSat(btc) {
  console.log("btcToSat called");
  return Math.floor(Number(btc) * Math.pow(10, 8));
}

function satToBtc(sat) {
  console.log("satToBtc called");
  return Number(sat) / Math.pow(10, 8);
}

async function main() {
  console.log("main called");
  bitcoinPrice = fetch(litecoinPriceApiUrl)
    .then((response) => response.json())
    .then((data) => data?.litecoin?.usd);

  if (window.NostrTools) {
    nostrRelay = window.NostrTools.relayInit(nostrRelayUrl);
    nostrRelay.connect();
  }

  modulesInitializedPromise = new Promise((resolve) => {
    const interval = setInterval(() => {
      if (window.bitcoin && window.secp256k1 && window.connect) {
        bitcoin.initEccLib(secp256k1);
        installedWalletName = getInstalledWalletName();
        isWalletInstalled = Boolean(getInstalledWalletName());
        if (isWalletInstalled) {
          [...document.getElementsByClassName("btnsSignWithWallet")].map(
            (el) => (el.style.display = "revert")
          );
          [...document.getElementsByClassName("walletName")].map(
            (el) => (el.textContent = installedWalletName)
          );
        } else {
          [...document.getElementsByClassName("walletSuggestions")].map(
            (el) => (el.style.display = "revert")
          );
          [...document.getElementsByClassName("walletsList")].map(
            (el) => (el.innerHTML = walletsListHtml)
          );
        }
        /*if (installedWalletName == "Hiro") {
          connectAppConfig = new connect.AppConfig([
            "store_write",
            "publish_data",
          ]);
          connectUserSession = new connect.UserSession({ connectAppConfig });
        }*/
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });

  if (window.location.pathname.startsWith("/inscription")) {
    recommendedFeeRate = fetch(`${baseMempoolApiUrl}/v1/fees/recommended`)
      .then((response) => response.json())
      .then((data) => data[feeLevel]);

    inscriptionPage();
  } else if (window.location.pathname.startsWith("/collections")) {
    collectionsPage();
  } else if (window.location.pathname.startsWith("/collection")) {
    collectionPage();
  } else if (window.location.pathname.startsWith("/listings")) {
    listingsPage();
  } else {
    homePage();
  }

  closeDialogsOnClickOutside();
}

async function inscriptionPage() {
  console.log("inscriptionPage called");
  await modulesInitializedPromise;
  network = bitcoin.networks.bitcoin;

  let inscriptionID;

  if (
    Number(inscriptionIdentifier).toString() == inscriptionIdentifier.toString()
  ) {
    inscriptionID = await getInscriptionIdByNumber(inscriptionIdentifier);
    inscriptionNumber = inscriptionIdentifier;
  } else {
    inscriptionID = inscriptionIdentifier;
  }

  try {
    inscription = await getInscriptionDataById(
      inscriptionID,
      inscriptionNumber
    );
    inscriptionNumber = inscriptionNumber || inscription.number;
  } catch (e) {
    return alert(e.message);
  }

  for (const span of document.getElementsByClassName("inscriptionNumber")) {
    span.textContent = inscriptionNumber;
  }

  for (const span of document.getElementsByClassName("dummyUtxoValue")) {
    span.textContent = dummyUtxoValue;
  }

  document.getElementById(
    "preview"
  ).src = `${ordinalsExplorerUrl}/preview/${inscriptionID}`;

  document.getElementById("inscriptionId").value = inscription.id;
  document.getElementById("owner").value = inscription.address;
  document.getElementById("paymentAddress").value = inscription.address;
  document.getElementById("utxo").value = inscription.output;

  const utxoValue = satToBtc(inscription["output value"]);
  document.getElementById("utxoValue").value = `${utxoValue} ${coin}`;
  document.getElementById("utxoValue").value += ` ($${(
    utxoValue * (await bitcoinPrice)
  ).toFixed(2)})`;

  document.getElementById("explorerLink").href = getExplorerLink(
    inscription.id
  );

  const processSellerPsbt = async (_sellerSignedPsbt) => {
    console.log("processSellerPsbt called");
    const sellerSignedPsbtBase64 = (_sellerSignedPsbt || "")
      .trim()
      .replaceAll(" ", "+");
    if (sellerSignedPsbtBase64) {
      sellerSignedPsbt = bitcoin.Psbt.fromBase64(sellerSignedPsbtBase64, {
        network,
      });
      const sellerInput = sellerSignedPsbt.txInputs[0];
      const sellerSignedPsbtInput = `${sellerInput.hash
        .reverse()
        .toString("hex")}:${sellerInput.index}`;

      if (sellerSignedPsbtInput != inscription.output) {
        throw `Seller signed PSBT does not match this inscription\n\n${sellerSignedPsbtInput}\n!=\n${inscription.output}`;
      }

      if (
        sellerSignedPsbt.txInputs.length != 1 ||
        sellerSignedPsbt.txInputs.length != 1
      ) {
        throw `Invalid seller signed PSBT`;
      }

      const sellerOutput = sellerSignedPsbt.txOutputs[0];
      price = sellerOutput.value;
      const sellerOutputValueBtc = satToBtc(price);
      const sellPriceText = `${sellerOutputValueBtc} ${coin} ($${(
        sellerOutputValueBtc * (await bitcoinPrice)
      ).toFixed(2)})`;
      document.getElementById("btnBuyInscriptionNow").style.display = "revert";
      document.getElementById(
        "btnBuyInscriptionNow"
      ).textContent = `Buy Inscription ${inscriptionNumber} Now For ${sellPriceText}`;

      for (const span of document.getElementsByClassName("price")) {
        span.textContent = sellPriceText;
      }
    }
  };

  listInscriptionForSale = async () => {
    console.log("listInscriptionForSale called");
    document.getElementById("listDialog").showModal();
  };

  let price;
  let psbt;

  generateSalePsbt = async () => {
    console.log("generateSalePsbt called");
    price = Number(document.getElementById("price").value);

    if (btcToSat(price) <= dustLimit) {
      alert(
        `Price is below dust limit (${dustLimit} lit). Operation cancelled.`
      );
      return;
    }

    const paymentAddress = document.getElementById("paymentAddress").value;
    psbt = await generatePSBTListingInscriptionForSale(
      inscription.output,
      btcToSat(price),
      paymentAddress
    );

    document.getElementById("saleStep1").style.display = "none";
    document.getElementById("saleStep2").style.display = "revert";

    for (const span of document.getElementsByClassName("price")) {
      span.textContent = price;
    }

    document.getElementById("generatedSalePsbt").value = psbt;
  };

  submitSignedSalePsbt = async () => {
    console.log("submitSignedSalePsbt called");
    const btn = document.getElementById("btnSubmitSignedSalePsbt");
    const originalBtnTest = btn.textContent;
    btn.textContent = "Submitting...";
    document.getElementById("btnSubmitSignedSalePsbt").disabled = true;

    setTimeout(async () => {
      const signedContent = document.getElementById("signedSalePsbt").value;
      let signedSalePsbt;
      if (
        signedContent.startsWith("02000000") ||
        signedContent.startsWith("01000000")
      ) {
        const sellerSignedTx = bitcoin.Transaction.fromHex(signedContent);
        const sellerSignedInput = sellerSignedTx.ins[0];
        signedSalePsbt = bitcoin.Psbt.fromBase64(psbt, { network });

        if (sellerSignedInput?.script?.length) {
          signedSalePsbt.updateInput(0, {
            finalScriptSig: sellerSignedInput.script,
          });
        }
        if (sellerSignedInput?.witness?.[0]?.length) {
          signedSalePsbt.updateInput(0, {
            finalScriptWitness: witnessStackToScriptWitness(
              sellerSignedInput.witness
            ),
          });
        }

        signedSalePsbt = signedSalePsbt.toBase64();
      } else if (signedContent.match(/^[0-9a-fA-F]+$/)) {
        signedSalePsbt = bitcoin.Psbt.fromHex(signedContent, {
          network,
        }).toBase64();
      } else {
        signedSalePsbt = document.getElementById("signedSalePsbt").value;
      }

      try {
        let testPsbt = bitcoin.Psbt.fromBase64(signedSalePsbt, { network });
        /*if (installedWalletName == "Hiro") {
          for (let i = 0; i < testPsbt.data.inputs.length; i++) {
            if (
              testPsbt.data.inputs[i].tapKeySig?.length &&
              !testPsbt.data.inputs[i]?.finalScriptWitness?.length
            ) {
              testPsbt.updateInput(i, {
                finalScriptWitness: testPsbt.data.inputs[
                  i
                ].tapKeySig.__proto__.constructor([
                  1,
                  65,
                  ...testPsbt.data.inputs[i].tapKeySig,
                ]),
              });
            }
          }
          signedSalePsbt = testPsbt.toBase64();
        }*/
        testPsbt.extractTransaction(true);
      } catch (e) {
        console.error(e);
        if (e.message == "Not finalized") {
          document.getElementById("btnSubmitSignedSalePsbt").textContent =
            originalBtnTest;
          document.getElementById("btnSubmitSignedSalePsbt").disabled = false;

          return alert(
            "Please sign and finalize the PSBT before submitting it"
          );
        } else if (e.message != "Outputs are spending more than Inputs") {
          document.getElementById("btnSubmitSignedSalePsbt").textContent =
            originalBtnTest;
          document.getElementById("btnSubmitSignedSalePsbt").disabled = false;

          return alert("Invalid PSBT: " + e.message || e);
        }
      }

      if (document.getElementById("publicPsbt").checked) {
        try {
          await publishSellerPsbt(
            signedSalePsbt,
            inscription.id,
            inscription.number,
            inscription.output,
            btcToSat(price)
          );
          removeHashFromUrl();
          return window.location.reload();
        } catch (e) {
          console.error(e);
          alert("Error publishing seller PSBT: " + e.message || e);
        }
      } else {
        document.location.hash = "sellerSignedPsbt=" + signedSalePsbt;
      }

      document.getElementById("btnSubmitSignedSalePsbt").textContent =
        originalBtnTest;
      document.getElementById("listDialog").close();
      try {
        processSellerPsbt(getHashQueryStringParam("sellerSignedPsbt"));
      } catch (e) {
        alert(e);
      }
    }, 350);
  };

  buyInscriptionNow = async () => {
    console.log("buyInscriptionNow called");
    document.getElementById("payerAddress").value =
      (await getWalletAddress("cardinal")) ||
      localStorage.getItem("payerAddress") ||
      "";
    if (document.getElementById("payerAddress").value) {
      updatePayerAddress();
    }
    document.getElementById("receiverAddress").value =
      (await getWalletAddress("ordinal")) ||
      localStorage.getItem("receiverAddress") ||
      "";

    document.getElementById("buyDialog").showModal();
  };

  function hideDummyUtxoElements() {
    console.log("hideDummyUtxoElements called");
    for (const el of document.getElementsByClassName("notDummy")) {
      el.style.display = "revert";
    }

    for (const el of document.getElementsByClassName("dummy")) {
      el.style.display = "none";
    }
  }

  function showDummyUtxoElements() {
    console.log("showDummyUtxoElements called");
    for (const el of document.getElementsByClassName("notDummy")) {
      el.style.display = "none";
    }

    for (const el of document.getElementsByClassName("dummy")) {
      el.style.display = "revert";
    }
  }

  updatePayerAddress = async () => {
    console.log("updatePayerAddress called");
    const payerAddress = document.getElementById("payerAddress").value;
    document.getElementById("receiverAddress").placeholder = payerAddress;
    localStorage.setItem("payerAddress", payerAddress);

    document.getElementById("loadingUTXOs").style.display = "block";
    try {
      payerUtxos = await getAddressUtxos(payerAddress);
    } catch (e) {
      document.getElementById("payerAddress").classList.add("is-invalid");
      document.getElementById("btnBuyInscription").disabled = true;
      hideDummyUtxoElements();
      return console.error(e);
    } finally {
      document.getElementById("loadingUTXOs").style.display = "none";
    }

    const potentialDummyUtxos = payerUtxos.filter(
      (utxo) => utxo.value <= dummyUtxoValue
    );
    dummyUtxos = [];

    let dummyUtxosFound = 0;

    for (const potentialDummyUtxo of potentialDummyUtxos) {
      if (dummyUtxosFound >= numberOfDummyUtxosToCreate) {
        break;
      }

      if (!(await doesUtxoContainInscription(potentialDummyUtxo))) {
        hideDummyUtxoElements();
        dummyUtxos.push(potentialDummyUtxo);
        dummyUtxosFound++;
      }
    }

    let minimumValueRequired;
    let vins;
    let vouts;

    if (!dummyUtxos.length) {
      showDummyUtxoElements();

      minimumValueRequired = numberOfDummyUtxosToCreate * dummyUtxoValue;
      vins = 0;
      vouts = numberOfDummyUtxosToCreate;
    } else {
      hideDummyUtxoElements();

      minimumValueRequired =
        price + numberOfDummyUtxosToCreate * dummyUtxoValue;
      vins = 1;
      vouts = 2 + numberOfDummyUtxosToCreate;
    }

    try {
      paymentUtxos = await selectUtxos(
        payerUtxos,
        minimumValueRequired,
        vins,
        vouts,
        await recommendedFeeRate
      );
    } catch (e) {
      paymentUtxos = undefined;
      console.error(e);
      document.getElementById("payerAddress").classList.add("is-invalid");
      document.getElementById("btnBuyInscription").disabled = true;
      return alert(e);
    }

    document.getElementById("payerAddress").classList.remove("is-invalid");
    document.getElementById("btnBuyInscription").disabled = false;
  };

  document.getElementById("btnGenerateDummyUtxos").onclick = async () => {
    const payerAddress = document.getElementById("payerAddress").value;

    psbt = await generatePSBTGeneratingDummyUtxos(
      payerAddress,
      numberOfDummyUtxosToCreate,
      paymentUtxos
    );

    if (!!psbt) {
      await displayBuyPsbt(
        psbt,
        payerAddress,
        `Sign and broadcast this transaction to create a dummy UTXO`,
        `Dummy UTXO created successfully! Refresh the page to buy the inscription.`
      );
    }
  };

  generatePSBTGeneratingDummyUtxos = async (
    payerAddress,
    numberOfDummyUtxosToCreate,
    payerUtxos
  ) => {
    console.log("generatePSBTGeneratingDummyUtxos called");
    const psbt = new bitcoin.Psbt({ network });
    let totalValue = 0;

    if (!payerUtxos?.length) {
      alert(
        "Couldn't find any funds in your address to make dummy UTXOs with, please top up first"
      );
      return;
    }

    for (const utxo of payerUtxos) {
      const tx = bitcoin.Transaction.fromHex(await getTxHexById(utxo.txid));
      for (const output in tx.outs) {
        try {
          tx.setWitness(parseInt(output), []);
        } catch {}
      }

      /*if (installedWalletName === "OrdinalSafe") {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          // nonWitnessUtxo: tx.toBuffer(),
          witnessUtxo: tx.outs[utxo.vout],
        });
      } else {*/
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: tx.toBuffer(),
        // witnessUtxo: tx.outs[utxo.vout],
      });
      //}

      totalValue += utxo.value;
    }

    for (let i = 0; i < numberOfDummyUtxosToCreate; i++) {
      psbt.addOutput({
        address: payerAddress,
        value: dummyUtxoValue,
      });
    }

    const fee = calculateFee(
      psbt.txInputs.length,
      psbt.txOutputs.length,
      await recommendedFeeRate
    );

    // Change utxo
    psbt.addOutput({
      address: payerAddress,
      value: totalValue - numberOfDummyUtxosToCreate * dummyUtxoValue - fee,
    });

    return psbt.toBase64();
  };

  generatePSBTBuyingInscription = async (
    payerAddress,
    receiverAddress,
    price,
    paymentUtxos,
    dummyUtxos
  ) => {
    console.log("generatePSBTBuyingInscription called");
    const psbt = new bitcoin.Psbt({ network });
    let totalValue = 0;
    let totalPaymentValue = 0;

    // Add two dummy utxos as inputs
    dummyUtxos = dummyUtxos.slice(0, 2);
    for (let i = 0; i < dummyUtxos.length; i++) {
      const dummyUtxo = dummyUtxos[i];
      // Add dummy utxo input
      const tx = bitcoin.Transaction.fromHex(
        await getTxHexById(dummyUtxo.txid)
      );
      for (const output in tx.outs) {
        try {
          tx.setWitness(parseInt(output), []);
        } catch {}
      }

      /*if (installedWalletName === "OrdinalSafe") {
      psbt.addInput({
        hash: dummyUtxo.txid,
        index: dummyUtxo.vout,
        // nonWitnessUtxo: tx.toBuffer(),
        witnessUtxo: tx.outs[dummyUtxo.vout],
      });
    } else {*/
      psbt.addInput({
        hash: dummyUtxo.txid,
        index: dummyUtxo.vout,
        nonWitnessUtxo: tx.toBuffer(),
        // witnessUtxo: tx.outs[dummyUtxo.vout],
      });
      //}
    }

    // Add receiving dummy output
    psbt.addOutput({
      address: receiverAddress,
      value: dummyUtxoValue,
    });

    // Add inscription output
    psbt.addOutput({
      address: receiverAddress,
      value: Number(inscription["output value"]),
    });

    // Add payer signed input
    psbt.addInput({
      ...sellerSignedPsbt.data.globalMap.unsignedTx.tx.ins[0],
      ...sellerSignedPsbt.data.inputs[0],
    });
    // Add payer output
    psbt.addOutput({
      ...sellerSignedPsbt.data.globalMap.unsignedTx.tx.outs[0],
    });

    // Add platform service fee
    const platformFee =
      parseInt(0.05 * price) <= dustLimit ? dustLimit : parseInt(0.05 * price);

    psbt.addOutput({
      address: platformFeeAddress,
      value: platformFee,
    });

    // Add payment utxo inputs
    for (const utxo of paymentUtxos) {
      const tx = bitcoin.Transaction.fromHex(await getTxHexById(utxo.txid));
      for (const output in tx.outs) {
        try {
          tx.setWitness(parseInt(output), []);
        } catch {}
      }

      /*if (installedWalletName === "OrdinalSafe") {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          // nonWitnessUtxo: tx.toBuffer(),
          witnessUtxo: tx.outs[utxo.vout],
        });
      } else {*/
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: tx.toBuffer(),
        // witnessUtxo: tx.outs[utxo.vout],
      });
      //}

      totalValue += utxo.value;
      totalPaymentValue += utxo.value;
    }

    // Create new dummy utxo output for the next purchase
    psbt.addOutput({
      address: payerAddress,
      value: dummyUtxoValue,
    });

    const fee = calculateFee(
      psbt.txInputs.length,
      psbt.txOutputs.length,
      await recommendedFeeRate
    );

    const changeValue =
      totalValue - dummyUtxoValue * 2 - price - platformFee - fee;

    if (changeValue < 0) {
      throw `Your wallet address doesn't have enough funds to buy this inscription.
Price:          ${satToBtc(price)} ${coin}
Fees:       ${satToBtc(fee + platformFee + dummyUtxoValue * 2)} ${coin}
You have:   ${satToBtc(totalPaymentValue)} ${coin}
Required:   ${satToBtc(totalValue - changeValue)} ${coin}
Missing:     ${satToBtc(-changeValue)} ${coin}`;
    }

    // Change utxo
    psbt.addOutput({
      address: payerAddress,
      value: changeValue,
    });

    return psbt.toBase64();
  };

  displayBuyPsbt = async (psbt, payerAddress, title, successMessage) => {
    console.log("displayBuyPsbt called");
    document.getElementById("buyStep1").style.display = "none";
    document.getElementById("buyStep2").style.display = "revert";

    document.getElementById("generatedBuyPsbtTitle").textContent = title;
    document.getElementById("generatedBuyPsbt").value = psbt;
    new QRCode("buyPsbtQrCode", {
      width: 300,
      height: 300,
      correctLevel: QRCode.CorrectLevel.L,
    }).makeCode(psbt);

    const payerCurrentMempoolTxIds = await getAddressMempoolTxIds(payerAddress);
    const interval = setInterval(async () => {
      const txId = (await getAddressMempoolTxIds(payerAddress)).find(
        (txId) => !payerCurrentMempoolTxIds.includes(txId)
      );

      if (txId) {
        clearInterval(interval);
        document.getElementById(
          "buyStatusMessage"
        ).innerHTML = `${successMessage}
<br><br>
See transaction details on <a href="${baseMempoolUrl}/tx/${txId}" target="_blank">block explorer</a>.`;
      }
    }, 5_000);
  };

  document.getElementById("btnBuyInscription").onclick = async () => {
    const receiverAddress =
      document.getElementById("receiverAddress").value ||
      document.getElementById("receiverAddress").placeholder;
    const payerAddress = document.getElementById("payerAddress").value;

    try {
      psbt = await generatePSBTBuyingInscription(
        payerAddress,
        receiverAddress,
        price,
        paymentUtxos,
        dummyUtxos
      );
    } catch (e) {
      return alert(e);
    }

    const sellerOutputValueBtc = satToBtc(price);
    const sellPriceText = `${sellerOutputValueBtc} ${coin} ($${(
      sellerOutputValueBtc * (await bitcoinPrice)
    ).toFixed(2)})`;
    await displayBuyPsbt(
      psbt,
      payerAddress,
      `Sign and broadcast this transaction to buy inscription #${inscriptionNumber} for ${sellPriceText}`,
      `Success! Inscription #${inscriptionNumber} bought successfully for ${sellPriceText}!`
    );
  };

  sellerSignedPsbt = getHashQueryStringParam("sellerSignedPsbt");
  if (!sellerSignedPsbt) {
    sellerSignedPsbt = await getLowestPriceSellPSBTForUtxo(inscription.output);
  }
  if (sellerSignedPsbt) {
    try {
      processSellerPsbt(sellerSignedPsbt);
    } catch (e) {
      alert(e);
    }
  }

  document.getElementById("price").setAttribute("min", satToBtc(dustLimit));
}

async function collectionPage() {
  console.log("collectionPage called");
  try {
    let collection;
    try {
      collection = await getCollection(collectionSlug);
    } catch {
      throw new Error(`Collection ${collectionSlug} not found`);
    }

    document.getElementById("collectionName").textContent = collection.name;
    document.title = collection.name;
    document.getElementById(
      "supply"
    ).textContent = `${collection.inscriptions.length}/${collection.supply}`;
    document.getElementById(
      "collectionIcon"
    ).src = `${ordinalsExplorerUrl}/preview/${collection.inscription_icon}`;
    document.getElementById("collectionDescription").textContent =
      collection.description.replaceAll("\n", "<br>");

    if (collection.twitter_link) {
      document.getElementById("twitter").href = collection.twitter_link;
      document.getElementById("twitter").style.display = "revert";
    }
    if (collection.discord_link) {
      document.getElementById("discord").href = collection.discord_link;
      document.getElementById("discord").style.display = "revert";
    }
    if (collection.website_link) {
      document.getElementById("website").href = collection.website_link;
      document.getElementById("website").style.display = "revert";
    }

    const inscriptionsContainer = document.getElementById(
      "inscriptionsContainer"
    );

    // Create a DocumentFragment
    const inscriptionsFragment = document.createDocumentFragment();

    for (const inscription of collection.inscriptions) {
      const inscriptionElement = document.createElement("a");
      inscriptionElement.href = `/inscription.html?number=${inscription.id}`;
      inscriptionElement.target = `_blank`;
      inscriptionElement.className = `collectionLink`;
      inscriptionElement.innerHTML = `
                <div class="card card-tertiary w-100 fmxw-300">
                    <div class="card-header text-center">
                        <span id="inscriptionName">${sanitizeHTML(
                          inscription.meta.name
                        )}</span>
                    </div>
                    <div class="card-body" style="padding: 6px 7px 7px 7px" id="inscription_${
                      inscription.id
                    }">
                        <iframe style="pointer-events: none" sandbox=allow-scripts
                            scrolling=no loading=lazy
                            src="${ordinalsExplorerUrl}/preview/${inscription.id.replaceAll(
        '"',
        ""
      )}"></iframe>
                    </div>
                </div>`;
      // Append to the DocumentFragment instead of directly to the DOM
      inscriptionsFragment.appendChild(inscriptionElement);
    }

    // Append the DocumentFragment to the DOM, triggering only one reflow
    inscriptionsContainer.appendChild(inscriptionsFragment);

    const orders = getLatestOrders(
      collection.inscriptions.length,
      collection.inscriptions.length * 2,
      { "#i": collection.inscriptions.map((x) => x.id) }
    );

    for await (const order of orders) {
      const button = document.createElement("button");
      button.className = "btn btn-block btn-primary mt-2";
      button.setAttribute("style", "max-width:185px; max-height: revert");
      button.textContent = order.title;

      document
        .getElementById(`inscription_${order.inscriptionId}`)
        .appendChild(button);
      inscriptionElement = document.getElementById(
        `inscription_${order.inscriptionId}`
      ).parentElement.parentElement;
      inscriptionElement.parentElement.insertBefore(
        inscriptionElement,
        inscriptionElement.parentElement.firstChild
      );
    }
  } catch (e) {
    console.error(e);
    alert(`Error fetching collection ${collectionSlug}:\n` + e.message);
  } finally {
    document.getElementById("listingsLoading").style.display = "none";
  }
}

function displayCollections(displayedCollections) {
  console.log("displayCollections called");
  const collectionsContainer = document.getElementById("collectionsContainer");
  collectionsContainer.innerHTML = "";

  // Create a DocumentFragment
  const collectionsFragment = document.createDocumentFragment();

  for (const collection of displayedCollections) {
    const collectionElement = document.createElement("a");
    collectionElement.href = `/collection.html?slug=${collection.slug}`;
    collectionElement.target = `_blank`;
    collectionElement.innerHTML = `
            <div class="card card-tertiary w-100 fmxw-300">
                <div class="card-header text-center">
                    <span>${sanitizeHTML(collection.name)}</span>
                </div>
                <div class="card-body" style="padding: 6px 7px 7px 7px">
                    <iframe style="pointer-events: none" sandbox=allow-scripts
                        scrolling=no loading=lazy
                        src="${ordinalsExplorerUrl}/preview/${collection.inscription_icon?.replaceAll(
      '"',
      ""
    )}"></iframe>
                </div>
            </div>`;
    // Append to the DocumentFragment instead of directly to the DOM
    collectionsFragment.appendChild(collectionElement);
  }
  // Append the DocumentFragment to the DOM, triggering only one reflow
  collectionsContainer.appendChild(collectionsFragment);
}

function searchCollections(searchTerm) {
  console.log("searchCollections called");
  displayCollections(
    window.allCollections
      .filter((x) => x.name.toLowerCase().includes(searchTerm.toLowerCase()))
      .slice(0, 12)
  );
}

async function loadCollections(limit, featuredCollections = []) {
  console.log("loadCollections called");
  try {
    window.allCollections = await getCollections();

    let displayedCollections = allCollections.slice(0, limit || 999999);
    displayedCollections = featuredCollections
      .concat(displayedCollections.slice(featuredCollections.length))
      .sort((a, b) => 0.5 - Math.random());

    displayCollections(displayedCollections);
  } catch (e) {
    console.error(e);
    console.error(`Error fetching collections:\n` + e.message);
  }
}

async function loadLatestOrders(limit = 8, nostrLimit = 25) {
  console.log("loadLatestOrders called");
  try {
    const orders = getLatestOrders(limit, nostrLimit);

    const ordersContainer = document.getElementById("ordersContainer");
    ordersContainer.innerHTML = "";

    // Create a DocumentFragment
    const ordersFragment = document.createDocumentFragment();

    for await (const order of orders) {
      const orderElement = document.createElement("a");
      orderElement.href = `/inscription.html?number=${order.inscriptionId}`;
      orderElement.target = `_blank`;
      orderElement.innerHTML = `
                <div class="card card-tertiary w-100 fmxw-300">
                    <div class="card-header text-center">
                        <span>Inscription #${order.number}</span>
                    </div>
                    <div class="card-body" style="padding: 6px 7px 7px 7px">
                        <iframe style="pointer-events: none" sandbox=allow-scripts
                            scrolling=no loading=lazy
                            src="${ordinalsExplorerUrl}/preview/${
        order.inscriptionId
      }"></iframe>
                        <button class="btn btn-block btn-primary mt-2" style="max-width:185px; max-height: revert">${sanitizeHTML(
                          order.title
                        )}</button>
                    </div>
                </div>`;
      // Append to the DocumentFragment instead of directly to the DOM
      ordersFragment.appendChild(orderElement);
    }

    // Append the DocumentFragment to the DOM, triggering only one reflow
    ordersContainer.appendChild(ordersFragment);
  } catch (e) {
    console.error(e);
    console.error(`Error fetching orders:\n` + e.message);
  }
}

async function homePage() {
  console.log("homePage called");
  loadCollections(12, [
    {
      name: "<10",
      inscription_icon:
        "8611ba0b661b22d3bd53b44b607bc2255c66631c71eac97b47dd279a5c06a107i0",
      slug: "under-10",
    },
  ]);

  await modulesInitializedPromise;
  loadLatestOrders();
}

async function collectionsPage() {
  console.log("collectionsPage called");
  await modulesInitializedPromise;
  loadCollections();
}

async function listingsPage() {
  console.log("listingsPage called");
  await modulesInitializedPromise;
  loadLatestOrders(100, 200);
}

function closeDialogsOnClickOutside() {
  console.log("closeDialogsOnClickOutside called");
  document.addEventListener("click", function (event) {
    const dialogs = document.querySelectorAll("dialog");
    dialogs.forEach((dialog) => {
      if (dialog.open) {
        const rect = dialog.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        ) {
          dialog.close();
        }
      }
    });
  });
}

window.onload = main();
