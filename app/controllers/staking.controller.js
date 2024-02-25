const axios = require("axios");
const fs = require("fs");
const cbor = require("cbor");

const createSendOrd = require("@unisat/ord-utils").createSendOrd;
const createSendBTC = require("@unisat/ord-utils").createSendBTC;
const bitcoin = require("bitcoinjs-lib");
// const fetch = require("node-fetch");
// const Request = require("node-fetch").Request;

const config = require("../config/auth.config");
const escrowConfig = require("../config/escrow.config");
const controller = require("./deepLake.controller");
const randomstring = require("randomstring");

const qs = require("qs");

const db = require("../models");
const brcStaking = db.brcStaking;
const odiStaking = db.odiStaking;
const aStaking = db.aStaking;
const xodiStaking = db.xodiStaking;
const bordStaking = db.bordStaking;
const cbrcStaking = db.cbrcStaking;

const User = db.user;

const APR = 0.01;
const BRC_PRICE = 1;
const ODI_PRICE = 1;
const A_PRICE = 1;
const testVersion = true;

const network = bitcoin.networks.testnet;
// const BLOCK_CYPHER_URL = 'https://api.blockcypher.com/v1/btc/test3';
// const OPENAPI_URL = 'https://api-testnet.unisat.io/wallet-v4';

const BLOCK_CYPHER_TOKEN = "773276f678a14967beb9ba24391f7000";
const OPENAPI_UNISAT_TOKEN =
  "50c50d3a720f82a3b93f164ff76989364bd49565b378b5c6a145c79251ee7672";
const MAGIC_EDEN_TOKEN = "8a9662e4-bf48-4c9c-a766-d316f88daeb4";
const adminAddress = testVersion
  ? "tb1p9w5uzcx8nnysa763syhsmmdqkvxavdnywrstcgah35lsdeq5305qwwmfnn"
  : "";
const OPENAPI_URL = testVersion
  ? "https://api-testnet.unisat.io/wallet-v4"
  : "https://api.unisat.io/wallet-v4";
const OPENAPI_UNISAT_URL = testVersion
  ? "https://open-api-testnet.unisat.io"
  : "https://open-api.unisat.io";
const BLOCK_CYPHER_URL = testVersion
  ? "https://api.blockcypher.com/v1/btc/test3"
  : "https://api.blockcypher.com/v1/btc/main";
const MEMPOOL_API = testVersion
  ? "https://mempool.space/testnet/api"
  : "https://mempool.space/api";
const SERVER_URL = testVersion
  ? "https://perfect-brc20-demo.netlify.app"
  : "https://perfect-brc20-demo.netlify.app";
const key = testVersion
  ? "cSD6USBNSpJUGKaSuPp1UzGX7NoJueZnDvj9psrgaoQSi6gQie8d"
  : "L1r71XBX1kcD6t7BWyzt7fmTV9VuFCU69tagiTQB5gkSTMf9gRxu";

// const bitcoin = require("bitcoinjs-lib");
const validator = require("@unisat/ord-utils/lib/OrdTransaction.js").validator;
const isTaprootInput =
  require("bitcoinjs-lib/src/psbt/bip371.js").isTaprootInput;
const ecc = require("@bitcoinerlab/secp256k1");
const { execSync } = require("child_process");
const { error } = require("console");
const xODIStaking = require("../models/xodiStaking.model");
const ECPairFactory = require("ecpair").ECPairFactory;

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

const toXOnly = (pubKey) =>
  pubKey.length == 32 ? pubKey : pubKey.slice(1, 33);

function tapTweakHash(pubKey, h) {
  return bitcoin.crypto.taggedHash(
    "TapTweak",
    Buffer.concat(h ? [pubKey, h] : [pubKey])
  );
}

function tweakSigner(signer, opts) {
  if (opts == null) opts = {};
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  let privateKey = signer.privateKey;
  if (!privateKey) {
    throw new Error("Private key is required for tweaking signer!");
  }
  if (signer.publicKey[0] == 3) {
    privateKey = ecc.privateNegate(privateKey);
  }

  const tweakedPrivateKey = ecc.privateAdd(
    privateKey,
    tapTweakHash(toXOnly(signer.publicKey), opts.tweakHash)
  );
  if (!tweakedPrivateKey) {
    throw new Error("Invalid tweaked private key!");
  }

  return ECPair.fromPrivateKey(Buffer.from(tweakedPrivateKey), {
    network: opts.network,
  });
}

function toPsbtNetwork(networkType) {
  if (networkType == 0) {
    return bitcoin.networks.bitcoin;
  } else {
    return bitcoin.networks.testnet;
  }
}

function publicKeyToPayment(publicKey, type, networkType) {
  const network = toPsbtNetwork(networkType);
  if (!publicKey) return null;
  const pubkey = Buffer.from(publicKey, "hex");
  if (type == 0) {
    return bitcoin.payments.p2pkh({
      pubkey,
      network,
    });
  } else if (type == 1 || type == 4) {
    return bitcoin.payments.p2wpkh({
      pubkey,
      network,
    });
  } else if (type == 2 || type == 5) {
    return bitcoin.payments.p2tr({
      internalPubkey: pubkey.slice(1, 33),
      network,
    });
  } else if (type == 3) {
    const data = bitcoin.payments.p2wpkh({
      pubkey,
      network,
    });
    return bitcoin.payments.p2sh({
      pubkey,
      network,
      redeem: data,
    });
  }
}

function publicKeyToAddress(publicKey, type, networkType) {
  const payment = publicKeyToPayment(publicKey, type, networkType);
  if (payment && payment.address) {
    return payment.address;
  } else {
    return "";
  }
}

function publicKeyToScriptPk(publicKey, type, networkType) {
  const payment = publicKeyToPayment(publicKey, type, networkType);
  return payment.output.toString("hex");
}

function randomWIF(networkType = 1) {
  const network = toPsbtNetwork(networkType);
  const keyPair = ECPair.makeRandom({ network });
  return keyPair.toWIF();
}

class LocalWallet {
  keyPair;
  address;
  pubkey;
  network;
  constructor(wif, networkType = 1, addressType = 2) {
    const network = toPsbtNetwork(networkType);
    const keyPair = ECPair.fromWIF(wif, network);
    this.keyPair = keyPair;
    this.pubkey = keyPair.publicKey.toString("hex");
    this.address = publicKeyToAddress(this.pubkey, addressType, networkType);
    this.network = network;
  }

  async signPsbt(psbt, opts) {
    const _opts = opts || {
      autoFinalized: true,
    };
    const psbtNetwork = this.network;
    const toSignInputs = [];

    psbt.data.inputs.forEach((v, index) => {
      let script = null;
      let value = 0;
      if (v.witnessUtxo) {
        script = v.witnessUtxo.script;
        value = v.witnessUtxo.value;
      } else if (v.nonWitnessUtxo) {
        const tx = bitcoin.Transaction.fromBuffer(v.nonWitnessUtxo);
        const output = tx.outs[psbt.txInputs[index].index];
        script = output.script;
        value = output.value;
      }
      const isSigned = v.finalScriptSig || v.finalScriptWitness;
      if (script && !isSigned) {
        const address = bitcoin.address.fromOutputScript(script, psbtNetwork);
        if (this.address == address) {
          toSignInputs.push({
            index,
            publicKey: this.pubkey,
            sighashTypes: v.sighashType ? [v.sighashType] : undefined,
          });
        }
      }
    });

    const _inputs = _opts.inputs || toSignInputs;
    if (_inputs.length == 0) {
      throw new Error("no input to sign");
    }
    _inputs.forEach((input) => {
      const keyPair = this.keyPair;
      if (isTaprootInput(psbt.data.inputs[input.index])) {
        const signer = tweakSigner(keyPair, opts);
        psbt.signInput(input.index, signer, input.sighashTypes);
      } else {
        const signer = keyPair;
        psbt.signInput(input.index, signer, input.sighashTypes);
      }
      if (_opts.autoFinalized != false) {
        // console.log(input.index);
        // psbt.validateSignaturesOfInput(input.index, validator);
        psbt.finalizeInput(input.index);
      }
    });
    return psbt;
  }

  getPublicKey() {
    return this.keyPair.publicKey.toString("hex");
  }
}

const wallet = new LocalWallet(
  "cSD6USBNSpJUGKaSuPp1UzGX7NoJueZnDvj9psrgaoQSi6gQie8d",
  testVersion ? 1 : 0
);

exports.sendInscription = async (req, res) => {
  const targetAddress = req.body.targetAddress;
  const inscriptionId = req.body.inscriptionId;
  const feeRate = req.body.feeRate;

  console.log("sendInscription ==> ", req.body);

  const utxo = await getInscriptionUtxo(inscriptionId);
  if (!utxo) {
    throw new Error("UTXO not found.");
  }

  if (utxo.inscriptions.length > 1) {
    throw new Error(
      "Multiple inscriptions are mixed together. Please split them first."
    );
  }
  const btc_utxos = await getAddressUtxo(wallet.address);
  const utxos = [utxo].concat(btc_utxos);
  const inputUtxos = utxos.map((v) => {
    return {
      txId: v.txId,
      outputIndex: v.outputIndex,
      satoshis: v.satoshis,
      scriptPk: v.scriptPk,
      addressType: v.addressType,
      address: wallet.address,
      ords: v.inscriptions,
    };
  });

  const psbt = await createSendOrd({
    utxos: inputUtxos,
    toAddress: targetAddress,
    toOrdId: inscriptionId,
    wallet: wallet,
    network: network,
    changeAddress: wallet.address,
    pubkey: wallet.pubkey,
    feeRate,
    outputValue: 546,
    enableRBF: false,
  });

  // console.log("psbt ==> ", {
  //   utxos: inputUtxos,
  //   toAddress: targetAddress,
  //   toOrdId: inscriptionId,
  //   wallet: wallet,
  //   network: network,
  //   changeAddress: wallet.address,
  //   pubkey: wallet.pubkey,
  //   feeRate,
  //   outputValue: 546,
  //   enableRBF: false,
  // });
  psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
  const rawTx = psbt.extractTransaction().toHex();

  await axios.post(`${BLOCK_CYPHER_URL}/txs/push`, {
    tx: rawTx,
  });

  const resultId = psbt.extractTransaction().getId();

  res.send({
    id: resultId,
  });
  return;
};

exports.sendBTC = async (req, res) => {
  // amount, targetAddress, feeRate
  try {
    let temp = req.body.amount;
    const amount = temp > 1 ? temp : temp * 100000000;
    const targetAddress = req.body.targetAddress;
    const feeRate = req.body.feeRate;

    const btc_utxos = await getAddressUtxo(wallet.address);

    // console.log("btc_utxos ==>", btc_utxos);
    console.log("amount ==> ", amount);
    console.log("targetAddress ==> ", targetAddress);
    console.log("feeRate ==>", feeRate);

    const utxos = btc_utxos;

    const psbt = await createSendBTC({
      utxos: utxos.map((v) => {
        return {
          txId: v.txId,
          outputIndex: v.outputIndex,
          satoshis: v.satoshis,
          scriptPk: v.scriptPk,
          addressType: v.addressType,
          address: wallet.address,
          ords: v.inscriptions,
        };
      }),
      toAddress: targetAddress,
      toAmount: amount * 1,
      wallet: wallet,
      network: network,
      changeAddress: wallet.address,
      pubkey: wallet.pubkey,
      feeRate,
      enableRBF: false,
    });

    // console.log("psbt ==>", psbt);

    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
    const rawTx = psbt.extractTransaction().toHex();

    await axios.post(`${BLOCK_CYPHER_URL}/txs/push`, {
      tx: rawTx,
    });

    res.send(psbt.extractTransaction().getId());
  } catch (error) {
    console.log('sendBTC error ==> ', error);
  }
};

exports.sendBTCManual = async (amount, targetAddress, feeRate) => {
  console.log('send the BTC by manuals!')
  // amount, targetAddress, feeRate
  try {
  
    // const targetAddress = req.body.targetAddress;
    // const feeRate = req.body.feeRate;

    const btc_utxos = await getAddressUtxo(wallet.address);

    // console.log("btc_utxos ==>", btc_utxos);
    console.log("amount ==> ", Math.floor(amount));
    console.log("targetAddress ==> ", targetAddress);
    console.log("feeRate ==>", feeRate);

    const utxos = btc_utxos;

    const psbt = await createSendBTC({
      utxos: utxos.map((v) => {
        return {
          txId: v.txId,
          outputIndex: v.outputIndex,
          satoshis: v.satoshis,
          scriptPk: v.scriptPk,
          addressType: v.addressType,
          address: wallet.address,
          ords: v.inscriptions,
        };
      }),
      toAddress: targetAddress,
      toAmount: Math.floor(amount * 1),
      wallet: wallet,
      network: network,
      changeAddress: wallet.address,
      pubkey: wallet.pubkey,
      feeRate,
      enableRBF: false,
    });

    // console.log("psbt ==>", psbt);

    psbt.__CACHE.__UNSAFE_SIGN_NONSEGWIT = false;
    const rawTx = psbt.extractTransaction().toHex();

    await axios.post(`${BLOCK_CYPHER_URL}/txs/push`, {
      tx: rawTx,
    });

    return (psbt.extractTransaction().getId());
  } catch (error) {
    console.log('sendBTC error ==> ', error);
  }
};

exports.staking = async (req, res) => {
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;
  const stakingData = req.body.stakingData;
  const escrowId = req.body.escrowId;

  let userData = null;

  //check user exist
  User.find(
    {
      wallet: wallet,
    },
    (err, findUser) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (findUser.length == 0) {
        //console.log('New User');
        const newUser = new User({
          wallet: wallet,
        });

        newUser.save((err, saveUser) => {
          if (err) {
            res.status(500).send({ message: err });
          }
          userData = saveUser;
          //console.log("saved");
          //console.log('User ==> ', userData);

          switch (tokenType) {
            case "brc":
              brcStakingFunc(userData, stakingData, escrowId, res);
              break;
            case "odi":
              odiStakingFunc(userData, stakingData, escrowId, res);
              break;
            case "a":
              aStakingFunc(userData, stakingData, escrowId, res);
              break;
            default:
              res.status(500).send({ message: "Invalid Token Type" });
              break;
          }
        });
      } else {
        //console.log('findUser ==> ', findUser)
        userData = findUser[0];

        switch (tokenType) {
          case "brc":
            brcStakingFunc(userData, stakingData, escrowId, res);
            break;
          case "odi":
            odiStakingFunc(userData, stakingData, escrowId, res);
            break;
          case "a":
            aStakingFunc(userData, stakingData, escrowId, res);
            break;
          default:
            res.status(500).send({ message: "Invalid Token Type" });
            break;
        }
      }
    }
  );
};

exports.getUserInfo = (req, res) => {
  const wallet = req.query.wallet;
  const tokenType = req.query.tokenType;

  //console.log('wallet ==> ', wallet)
  //console.log('tokenType ==> ', tokenType)

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "brc":
          getUserInfoByBrc(findedUser[0]._id, res);
          break;
        case "odi":
          getUserInfoByOdi(findedUser[0]._id, res);
          break;
        case "a":
          getUserInfoByA(findedUser[0]._id, res);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among brc, odi, a token types",
          });
      }
    }
  );
};

exports.claimReward = (req, res) => {
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "brc":
          brcReward(findedUser[0]._id, res);
          break;
        case "odi":
          odiReward(findedUser[0]._id, res);
          break;
        case "a":
          aReward(findedUser[0]._id, res);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among brc, odi, a token types",
          });
      }
    }
  );
};

exports.checkPotentialReward = (req, res) => {
  console.log("checkPotentialReward ==> ");
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;

  //console.log('wallet ==> ', wallet)
  //console.log('tokenType ==> ', tokenType)

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "brc":
          checkBrcReward(findedUser[0]._id, res);
          break;
        case "odi":
          checkOdiReward(findedUser[0]._id, res);
          break;
        case "a":
          checkAReward(findedUser[0]._id, res);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among brc, odi, a token types",
          });
      }
    }
  );
};

exports.unstaking = (req, res) => {
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "brc":
          brcUnstake(findedUser[0]._id, res, wallet);
          break;
        case "odi":
          odiUnstake(findedUser[0]._id, res, wallet);
          break;
        case "a":
          aUnstake(findedUser[0]._id, res, wallet);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among brc, odi, a token types",
          });
      }
    }
  );
};

exports.unstakingDB = (req, res) => {
  const id = req.body.id;
  const removeIndex = req.body.removeIndex;
  const tokenType = req.body.tokenType;

  switch (tokenType.toString().toLowerCase()) {
    case "brc":
      brcUnstakeDB(id, removeIndex, res);
      break;
    case "odi":
      odiUnstakeDB(id, removeIndex, res);
      break;
    case "a":
      aUnstakeDB(id, removeIndex, res);
      break;
    default:
      res.status(500).send({
        message: "Please input the one among brc, odi, a token types",
      });
  }
};

exports.transferInscribe = (req, res) => {
  try {
    const protocol = req.body.protocol;
    const data = req.body.data;
    const feeRate = req.body.feeRate;
    const destination = req.body.destination;

    console.log("destination ==> ", destination);
    const result = inscribeCbrc20(protocol, data, feeRate, destination);

    res.status(200).json({
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      errorMessage: error.message,
    });
  }
};

exports.getInscribeId = async (req, res) => {
  const orderId = req.body.orderId;

  const mainFunc = async (orderId) => {
    console.log(" <=====================> ");
    console.log("orderId ==> ", orderId);
    let inscribeId = "";

    await delay(10000);
    const payload = await axios.get(
      `${OPENAPI_UNISAT_URL}/v2/inscribe/order/${orderId}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAPI_UNISAT_TOKEN}`,
        },
      }
    );

    console.log("result ==> ", payload.data.data.files[0]);

    inscribeId = payload.data.data.files[0].inscriptionId;

    if (inscribeId == undefined) {
      return mainFunc(orderId);
    } else {
      console.log("final inscribeId ==> ", inscribeId);
      res.send(inscribeId);
    }
  };

  mainFunc(orderId);
};

exports.getUtxoId = async (req, res) => {
  const inscribeId = req.body.inscribeId;
  const payload = await axios.get(
    `https://api-testnet.unisat.io/wallet-v4/inscription/utxo?inscriptionId=${inscribeId}`
  );
  console.log("getUtxoId ==> ", payload.data);
  res.send(payload.data);
};

exports.getAddressInscriptions = async (req, res) => {
  const address = req.body.address;
  console.log("=============================");
  console.log("address ==> ", address);
  const result = await axios.get(
    `https://api-testnet.unisat.io/wallet-v4/address/inscriptions?address=${address}&cursor=0&size=1`
  );

  console.log("inscription result ==> ", result.data);
  res.send(result.data);
};

// CBRC staking

exports.cbrcStaking = async (req, res) => {
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;
  const stakingData = req.body.stakingData;
  const inscribeID = req.body.inscribeId;

  console.log("cbrcStaking ==> ", req.body);

  let userData = null;

  //check user exist
  User.find(
    {
      wallet: wallet,
    },
    (err, findUser) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (findUser.length == 0) {
        //console.log('New User');
        const newUser = new User({
          wallet: wallet,
        });

        newUser.save((err, saveUser) => {
          if (err) {
            res.status(500).send({ message: err });
          }
          userData = saveUser;
          //console.log("saved");
          //console.log('User ==> ', userData);

          switch (tokenType.toString().toLowerCase()) {
            case "xodi":
              xODIStakingFunc(userData, stakingData, inscribeID, res);
              break;
            case "bord":
              bordStakingFunc(userData, stakingData, inscribeID, res);
              break;
            case "cbrc":
              cbrcStakingFunc(userData, stakingData, inscribeID, res);
              break;
            default:
              res.status(500).send({ message: "Invalid Token Type" });
              break;
          }
        });
      } else {
        //console.log('findUser ==> ', findUser)
        userData = findUser[0];

        switch (tokenType.toString().toLowerCase()) {
          case "xodi":
            xODIStakingFunc(userData, stakingData, inscribeID, res);
            break;
          case "bord":
            bordStakingFunc(userData, stakingData, inscribeID, res);
            break;
          case "cbrc":
            cbrcStakingFunc(userData, stakingData, inscribeID, res);
            break;
          default:
            res.status(500).send({ message: "Invalid Token Type" });
            break;
        }
      }
    }
  );
};

exports.cbrcCheckPotentialReward = (req, res) => {
  console.log("cbrc checkPotentialReward ==> ");
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;

  console.log("wallet ==> ", wallet);
  console.log("tokenType ==> ", tokenType);

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "xodi":
          checkXodiReward(findedUser[0]._id, res);
          break;
        case "bord":
          checkBordReward(findedUser[0]._id, res);
          break;
        case "cbrc":
          checkCbrcReward(findedUser[0]._id, res);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among xODI, bord, cbrc token types",
          });
      }
    }
  );
};

exports.cbrcClaimReward = (req, res) => {
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "xodi":
          xodiReward(findedUser[0]._id, res);
          break;
        case "bord":
          bordReward(findedUser[0]._id, res);
          break;
        case "cbrc":
          cbrcReward(findedUser[0]._id, res);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among xODI, bord, cbrc token types",
          });
      }
    }
  );
};

exports.cbrcUnstaking = (req, res) => {
  const wallet = req.body.wallet;
  const tokenType = req.body.tokenType;

  User.find(
    {
      wallet: wallet,
    },
    (err, findedUser) => {
      //console.log('findedUser ==> ', findedUser)
      if (findedUser.length == 0) {
        res.status(500).send({ message: "Not Found User" });
        return;
      }

      switch (tokenType.toString().toLowerCase()) {
        case "xodi":
          xodiUnstake(findedUser[0]._id, res, wallet);
          break;
        case "bord":
          bordUnstake(findedUser[0]._id, res, wallet);
          break;
        case "cbrc":
          cbrcUnstake(findedUser[0]._id, res, wallet);
          break;
        default:
          res.status(500).send({
            message: "Please input the one among brc, odi, a token types",
          });
      }
    }
  );
};

exports.cbrcUnstakingDB = (req, res) => {
  const id = req.body.id;
  const removeIndex = req.body.removeIndex;
  const tokenType = req.body.tokenType;

  switch (tokenType.toString().toLowerCase()) {
    case "brc":
      brcUnstakeDB(id, removeIndex, res);
      break;
    case "odi":
      odiUnstakeDB(id, removeIndex, res);
      break;
    case "a":
      aUnstakeDB(id, removeIndex, res);
      break;
    default:
      res.status(500).send({
        message: "Please input the one among brc, odi, a token types",
      });
  }
};

//  =============== Assist Functions ================= //

// Staking
const brcStakingFunc = (user, stakingData, escrowId, res) => {
  //console.log('brcStakingFunc functions is called');
  //console.log('user ==> ', user);
  brcStaking.find(
    {
      owner: user._id,
    },
    (err, brc) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (brc.length == 0) {
        //console.log('New BRC Staking')
        // res.send({ message: 'New BRC Staking' })
        const newBrcStaking = new brcStaking({
          owner: user._id,
          stakingArr: [],
        });

        newBrcStaking.stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          escrowId: escrowId,
        });

        newBrcStaking.save((err, savedBrcStaking) => {
          //console.log('saved BrcStaking ==> ', savedBrcStaking)
          res.send(savedBrcStaking);
        });
      } else {
        //console.log('Finded Result ==> ', brc[0])

        brc[0].stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          escrowId: escrowId,
        });

        brc[0].save();
        res.send(brc[0]);
      }
    }
  );
};

const odiStakingFunc = (user, stakingData, escrowId, res) => {
  console.log("odiStakingFunc functions is called");
  odiStaking.find(
    {
      owner: user._id,
    },
    (err, odi) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (odi.length == 0) {
        //console.log('New odi Staking')
        const newOdiStaking = new odiStaking({
          owner: user._id,
          stakingArr: [],
        });

        newOdiStaking.stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          escrowId: escrowId,
        });

        newOdiStaking.save((err, savedOdiStaking) => {
          //console.log('saved odiStaking ==> ', savedOdiStaking);
          res.send(savedOdiStaking);
        });
      } else {
        console.log("Finded Result ==> ", odi[0]);

        odi[0].stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          escrowId: escrowId,
        });

        odi[0].save();
        res.send(odi[0]);
      }
    }
  );
};

const aStakingFunc = (user, stakingData, escrowId, res) => {
  //console.log('aStakingFunc functions is called');

  aStaking.find(
    {
      owner: user._id,
    },
    (err, a) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (a.length == 0) {
        //console.log('New a Staking')
        const newAStaking = new aStaking({
          owner: user._id,
          stakingArr: [],
        });

        newAStaking.stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          escrowId: escrowId,
        });

        newAStaking.save((err, savedAStaking) => {
          //console.log('saved aStaking ==> ', savedAStaking)
          res.send(savedAStaking);
        });
      } else {
        //console.log('Finded Result ==> ', a[0])

        a[0].stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          escrowId: escrowId,
        });

        a[0].save();
        res.send(a[0]);
      }
    }
  );
};

// CBRC Staking
const xODIStakingFunc = (user, stakingData, inscribeId, res) => {
  console.log("xODIStakingFunc functions is called");
  console.log("user ==> ", user);
  console.log("inscribeId ==> ", inscribeId);
  xodiStaking.find(
    {
      owner: user._id,
    },
    (err, brc) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (brc.length == 0) {
        //console.log('New BRC Staking')
        // res.send({ message: 'New BRC Staking' })
        const newXodiStaking = new xodiStaking({
          owner: user._id,
          stakingArr: [],
        });

        newXodiStaking.stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          inscribeId: inscribeId,
        });

        newXodiStaking.save((err, savedBrcStaking) => {
          //console.log('saved BrcStaking ==> ', savedBrcStaking)
          res.send(savedBrcStaking);
        });
      } else {
        //console.log('Finded Result ==> ', brc[0])

        brc[0].stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          inscribeId: inscribeId,
        });

        brc[0].save();
        res.send(brc[0]);
      }
    }
  );
};

const bordStakingFunc = (user, stakingData, inscribeId, res) => {
  //console.log('brcStakingFunc functions is called');
  //console.log('user ==> ', user);
  bordStaking.find(
    {
      owner: user._id,
    },
    (err, brc) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (brc.length == 0) {
        //console.log('New BRC Staking')
        // res.send({ message: 'New BRC Staking' })
        const newBordStaking = new bordStaking({
          owner: user._id,
          stakingArr: [],
        });

        newBordStaking.stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          inscribeId: inscribeId,
        });

        newBordStaking.save((err, savedBrcStaking) => {
          //console.log('saved BrcStaking ==> ', savedBrcStaking)
          res.send(savedBrcStaking);
        });
      } else {
        //console.log('Finded Result ==> ', brc[0])

        brc[0].stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          inscribeId: inscribeId,
        });

        brc[0].save();
        res.send(brc[0]);
      }
    }
  );
};

const cbrcStakingFunc = (user, stakingData, inscribeId, res) => {
  //console.log('brcStakingFunc functions is called');
  //console.log('user ==> ', user);
  cbrcStaking.find(
    {
      owner: user._id,
    },
    (err, brc) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (brc.length == 0) {
        //console.log('New BRC Staking')
        // res.send({ message: 'New BRC Staking' })
        const newCbrcStaking = new cbrcStaking({
          owner: user._id,
          stakingArr: [],
        });

        newCbrcStaking.stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          inscribeId: inscribeId,
        });

        newCbrcStaking.save((err, savedBrcStaking) => {
          //console.log('saved BrcStaking ==> ', savedBrcStaking)
          res.send(savedBrcStaking);
        });
      } else {
        //console.log('Finded Result ==> ', brc[0])

        brc[0].stakingArr.push({
          stakingAmount: stakingData.amount,
          lockTime: stakingData.lockTime,
          claimDate: stakingData.claimDate,
          stakeDate: stakingData.stakeDate,
          inscribeId: inscribeId,
        });

        brc[0].save();
        res.send(brc[0]);
      }
    }
  );
};

// GetUserInfo
const getUserInfoByBrc = (id, res) => {
  //console.log('id  ===>  ', id);
  brcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      //console.log('findedInfo  ===>  ', findedInfo);
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      res.send(findedInfo[0]);
      return;
    }
  );
};

const getUserInfoByOdi = (id, res) => {
  odiStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      res.send(findedInfo[0]);
    }
  );
};

const getUserInfoByA = (id, res) => {
  aStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found A Staking History" });
        return;
      }

      res.send(findedInfo[0]);
    }
  );
};

// claimReward
const brcReward = (id, res) => {
  brcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;

      console.log("===============CLAIM REWARD=================");

      stakingArr.map((value) => {
        tempReward = calcReward(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        console.log("tempReward ==> ", tempReward);
        if (tempReward > 0) {
          //console.log("reward is able to claim");
          value.claimDate = new Date();
          rewardAmount += tempReward;
        }
        // console.log('rewardAmount ==> ', rewardAmount)
        // rewardAmount += tempReward;
      });

      findedInfo[0].save((err, result) => {
        res.send({
          tokenType: "xODI",
          rewardAmount: rewardAmount,
        });

        return;
      });
    }
  );
};

const odiReward = (id, res) => {
  odiStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;

      stakingArr.map((value) => {
        tempReward = calcReward(
          ODI_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        //console.log('tempReward ==> ', tempReward)
        if (tempReward > 0) {
          //console.log("reward is able to claim");
          value.claimDate = new Date();
          rewardAmount += tempReward;
        }
      });

      findedInfo[0].save((err, result) => {
        res.send({
          tokenType: "MEME",
          rewardAmount: rewardAmount,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

const aReward = (id, res) => {
  aStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found A Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;

      stakingArr.map((value) => {
        tempReward = calcReward(A_PRICE, value.stakingAmount, value.claimDate);
        //console.log('tempReward ==> ', tempReward)
        if (tempReward > 0) {
          //console.log("reward is able to claim");
          value.claimDate = new Date();
          rewardAmount += tempReward;
        }
      });

      findedInfo[0].save((err, result) => {
        res.send({
          tokenType: "LIGO",
          rewardAmount: rewardAmount,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

// CBRC claimReward
const xodiReward = (id, res) => {
  xODIStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;

      console.log("===============CLAIM REWARD=================");

      stakingArr.map((value) => {
        tempReward = calcReward(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        console.log("tempReward ==> ", tempReward);
        if (tempReward > 0) {
          //console.log("reward is able to claim");
          value.claimDate = new Date();
          rewardAmount += tempReward;
        }
        // console.log('rewardAmount ==> ', rewardAmount)
        // rewardAmount += tempReward;
      });

      findedInfo[0].save((err, result) => {
        res.send({
          tokenType: "xODI",
          rewardAmount: rewardAmount,
        });

        return;
      });
    }
  );
};

const bordReward = (id, res) => {
  bordStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;

      stakingArr.map((value) => {
        tempReward = calcReward(
          ODI_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        //console.log('tempReward ==> ', tempReward)
        if (tempReward > 0) {
          //console.log("reward is able to claim");
          value.claimDate = new Date();
          rewardAmount += tempReward;
        }
      });

      findedInfo[0].save((err, result) => {
        res.send({
          tokenType: "MEME",
          rewardAmount: rewardAmount,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

const cbrcReward = (id, res) => {
  cbrcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found A Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;

      stakingArr.map((value) => {
        tempReward = calcReward(A_PRICE, value.stakingAmount, value.claimDate);
        //console.log('tempReward ==> ', tempReward)
        if (tempReward > 0) {
          //console.log("reward is able to claim");
          value.claimDate = new Date();
          rewardAmount += tempReward;
        }
      });

      findedInfo[0].save((err, result) => {
        res.send({
          tokenType: "LIGO",
          rewardAmount: rewardAmount,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

// check potential reward
const checkBrcReward = async (id, res) => {
  console.log("checkBrcReward ==> ");
  brcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found BRC Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let stakingAmount = 0;

      console.log("===============CHECK=================");

      stakingArr.map((value) => {
        tempReward = calcReward(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        console.log("tempReward ==> ", tempReward);
        if (tempReward > 0) {
          rewardAmount += tempReward;
        }
        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        )
          stakingAmount += value.stakingAmount;
      });

      // rewardAmount = Math.floor(rewardAmount / 10);

      res.send({
        tokenType: "BRC",
        rewardAmount: rewardAmount,
        stakingAmount: stakingAmount,
      });
      return;
    }
  );
};

const checkOdiReward = (id, res) => {
  odiStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let stakingAmount = 0;

      stakingArr.map((value) => {
        rewardAmount += calcReward(
          ODI_PRICE,
          value.stakingAmount,
          value.claimDate
        );

        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        )
          stakingAmount += value.stakingAmount;
      });

      res.send({
        tokenType: "ODI",
        rewardAmount: rewardAmount,
        stakingAmount: stakingAmount,
      });
      return;
    }
  );
};

const checkAReward = (id, res) => {
  aStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found A Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;
      console.log("stakingArr ==> ", stakingArr);

      let rewardAmount = 0;
      let stakingAmount = 0;

      stakingArr.map((value) => {
        rewardAmount += calcReward(
          A_PRICE,
          value.stakingAmount,
          value.claimDate
        );

        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        )
          stakingAmount += value.stakingAmount;
      });

      res.send({
        tokenType: "A",
        rewardAmount: rewardAmount,
        stakingAmount: stakingAmount,
      });
      return;
    }
  );
};

// check CBRC Potential Reward
const checkXodiReward = async (id, res) => {
  console.log("checkBrcReward ==> ");
  xODIStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found BRC Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let stakingAmount = 0;

      console.log("===============CHECK=================");

      stakingArr.map((value) => {
        tempReward = calcReward(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        console.log("tempReward ==> ", tempReward);
        if (tempReward > 0) {
          rewardAmount += tempReward;
        }

        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        )
          stakingAmount += value.stakingAmount;
      });

      // rewardAmount = Math.floor(rewardAmount / 10);

      res.send({
        tokenType: "BORD",
        rewardAmount: rewardAmount,
        stakingAmount: stakingAmount,
      });
      return;
    }
  );
};

const checkBordReward = (id, res) => {
  bordStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Odi Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let stakingAmount = 0;

      stakingArr.map((value) => {
        rewardAmount += calcReward(
          ODI_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        stakingAmount += calcStakingAmount(
          value.stakingAmount,
          value.claimDate
        );

        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        )
          stakingAmount += value.stakingAmount;
      });

      res.send({
        tokenType: "xODI",
        rewardAmount: rewardAmount,
        stakingAmount: stakingAmount,
      });
      return;
    }
  );
};

const checkCbrcReward = (id, res) => {
  cbrcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found A Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;
      console.log("stakingArr ==> ", stakingArr);

      let rewardAmount = 0;
      let stakingAmount = 0;

      stakingArr.map((value) => {
        rewardAmount += calcReward(
          A_PRICE,
          value.stakingAmount,
          value.claimDate
        );
        stakingAmount += calcStakingAmount(
          value.stakingAmount,
          value.claimDate
        );

        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        )
          stakingAmount += value.stakingAmount;
      });

      res.send({
        tokenType: "xODI",
        rewardAmount: rewardAmount,
        stakingAmount: stakingAmount,
      });
      return;
    }
  );
};

// Unstake
const brcUnstake = (id, res, wallet) => {
  let escrowId = [];
  brcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let tempReward = 0;
      let rewardAmount = 0;
      let removeIndex = -1;

      stakingArr.map((value, index) => {
        tempReward = calcRewardAtUnstaking(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate,
          value.lockTime
        );

        if (tempReward > 0) {
          removeIndex = index;
          escrowId.push(stakingArr[index].escrowId);

          rewardAmount += tempReward;
          //console.log(` ${index}th is able to unstaking`);
          // value.claimDate = new Date();
        }

        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        ) {
          removeIndex = index;
          escrowId.push(stakingArr[index].escrowId);
        }
      });

      console.log("rewardAmount after calc ==> ", rewardAmount);
      // rewardAmount = Math.floor(rewardAmount / 10);

      //console.log('findedInfo[0].stakingArr.splice =============>')
      // if(removeIndex > -1){
      //   if(removeIndex == findedInfo[0].stakingArr.length - 1) {
      //     findedInfo[0].stakingArr = [];
      //   } else {
      //     findedInfo[0].stakingArr.splice(0, removeIndex + 1);
      //   }
      // }

      console.log("tempReward before send ==> ", tempReward);
      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send({
          walletAddress: wallet,
          brcId: id,
          tokenType: "xODI",
          rewardAmount: rewardAmount,
          escrowId: escrowId,
          removeIndex: removeIndex,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

const odiUnstake = (id, res, wallet) => {
  let escrowId = [];

  odiStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found ODI Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;
      let removeIndex = -1;

      console.log("stakingArr ==> ", stakingArr);

      stakingArr.map((value, index) => {
        tempReward = calcRewardAtUnstaking(
          ODI_PRICE,
          value.stakingAmount,
          value.claimDate,
          value.lockTime
        );
        //console.log('tempReward ==> ', tempReward)
        if (tempReward > 0) {
          removeIndex = index;
          escrowId.push(stakingArr[index].escrowId);

          rewardAmount += tempReward;
          //console.log(` ${index}th is able to unstaking`);
          // value.claimDate = new Date();
        }
      });

      console.log("rewardAmount after calc ==> ", rewardAmount);
      // rewardAmount = Math.floor(rewardAmount / 10);

      //console.log('findedInfo[0].stakingArr.splice =============>')
      // if(removeIndex > -1){
      //   if(removeIndex == findedInfo[0].stakingArr.length - 1) {
      //     findedInfo[0].stakingArr = [];
      //   } else {
      //     findedInfo[0].stakingArr.splice(0, removeIndex + 1);
      //   }
      // }

      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send({
          walletAddress: wallet,
          brcId: id,
          tokenType: "MEME",
          rewardAmount: rewardAmount,
          escrowId: escrowId,
          removeIndex: removeIndex,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

const aUnstake = (id, res, wallet) => {
  let escrowId = [];

  aStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found A Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let rewardAmount = 0;
      let tempReward = 0;
      let removeIndex = -1;

      stakingArr.map((value, index) => {
        tempReward = calcRewardAtUnstaking(
          A_PRICE,
          value.stakingAmount,
          value.claimDate,
          value.lockTime
        );
        //console.log('tempReward ==> ', tempReward)
        if (tempReward > 0) {
          removeIndex = index;
          escrowId.push(stakingArr[index].escrowId);

          rewardAmount += tempReward;
          //console.log(` ${index}th is able to unstaking`);
          // value.claimDate = new Date();
        }
      });

      console.log("rewardAmount after calc ==> ", rewardAmount);
      // rewardAmount = Math.floor(rewardAmount / 10);

      //console.log('findedInfo[0].stakingArr.splice =============>')
      // if(removeIndex > -1){
      //   if(removeIndex == findedInfo[0].stakingArr.length - 1) {
      //     findedInfo[0].stakingArr = [];
      //   } else {
      //     findedInfo[0].stakingArr.splice(0, removeIndex + 1);
      //   }
      // }

      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send({
          walletAddress: wallet,
          brcId: id,
          tokenType: "LIGO",
          rewardAmount: rewardAmount,
          escrowId: escrowId,
          removeIndex: removeIndex,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

//delete DB
const brcUnstakeDB = (id, removeIndex, res) => {
  console.log("id ==> ", id);
  console.log("removeIndex ==> ", removeIndex);

  brcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      //console.log('findedInfo[0].stakingArr.splice =============>')
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex * 1 + 1);
        }
      }

      findedInfo[0].save((err, result) => {
        res.send(true);
        return;
      });
    }
  );
};

const odiUnstakeDB = (id, removeIndex, res) => {
  odiStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      //console.log('findedInfo[0].stakingArr.splice =============>')
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex * 1 + 1);
        }
      }

      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send(true);
        return;
      });
    }
  );
};

const aUnstakeDB = (id, removeIndex, res) => {
  aStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      //console.log('findedInfo[0].stakingArr.splice =============>')
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex * 1 + 1);
        }
      }

      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send(true);
        return;
      });
    }
  );
};

// Unstake
const xodiUnstake = (id, res, wallet) => {
  let inscribeId = [];

  console.log("xodiUnstaking ==> ", id, wallet);
  xODIStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found xODI Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let tempReward = 0;
      let rewardAmount = 0;
      let removeIndex = -1;

      stakingArr.map((value, index) => {
        tempReward = calcRewardAtUnstaking(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate,
          value.lockTime
        );

        if (tempReward > 0) {
          rewardAmount += tempReward;
        }
        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        ) {
          removeIndex = index;
          inscribeId.push(stakingArr[index].inscribeId);
        }
      });

      console.log("rewardAmount after calc ==> ", rewardAmount);
      // rewardAmount = Math.floor(rewardAmount / 10);

      console.log("findedInfo[0].stakingArr.splice =============>");
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex + 1);
        }
      }

      console.log("tempReward before send ==> ", tempReward);
      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send({
          walletAddress: wallet,
          brcId: id,
          stakingType: "BORD",
          rewardType: "xODI",
          rewardAmount: rewardAmount,
          inscribeId: inscribeId,
          removeIndex: removeIndex,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

const bordUnstake = (id, res, wallet) => {
  let inscribeId = [];

  console.log("bordUnstaking ==> ", id, wallet);
  bordStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found xODI Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let tempReward = 0;
      let rewardAmount = 0;
      let removeIndex = -1;

      stakingArr.map((value, index) => {
        tempReward = calcRewardAtUnstaking(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate,
          value.lockTime
        );

        if (tempReward > 0) {
          rewardAmount += tempReward;
        }
        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        ) {
          removeIndex = index;
          inscribeId.push(stakingArr[index].inscribeId);
        }
      });

      console.log("rewardAmount after calc ==> ", rewardAmount);
      // rewardAmount = Math.floor(rewardAmount / 10);

      console.log("findedInfo[0].stakingArr.splice =============>");
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex + 1);
        }
      }

      console.log("tempReward before send ==> ", tempReward);
      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send({
          walletAddress: wallet,
          brcId: id,
          stakingType: "xODI",
          rewardType: "BORD",
          rewardAmount: rewardAmount,
          inscribeId: inscribeId,
          removeIndex: removeIndex,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

const cbrcUnstake = (id, res, wallet) => {
  let inscribeId = [];

  console.log("bordUnstaking ==> ", id, wallet);
  cbrcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found xODI Staking History" });
        return;
      }

      const stakingArr = findedInfo[0].stakingArr;

      let tempReward = 0;
      let rewardAmount = 0;
      let removeIndex = -1;

      stakingArr.map((value, index) => {
        tempReward = calcRewardAtUnstaking(
          BRC_PRICE,
          value.stakingAmount,
          value.claimDate,
          value.lockTime
        );

        if (tempReward > 0) {
          rewardAmount += tempReward;
        }
        if (
          (new Date() - new Date(value.stakeDate)) / 1000 / 3600 / 24 >
          value.lockTime
        ) {
          removeIndex = index;
          inscribeId.push(stakingArr[index].inscribeId);
        }
      });

      console.log("rewardAmount after calc ==> ", rewardAmount);
      // rewardAmount = Math.floor(rewardAmount / 10);

      console.log("findedInfo[0].stakingArr.splice =============>");
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex + 1);
        }
      }

      console.log("tempReward before send ==> ", tempReward);
      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send({
          walletAddress: wallet,
          brcId: id,
          stakingType: "xODI",
          rewardType: "CBRC",
          rewardAmount: rewardAmount,
          inscribeId: inscribeId,
          removeIndex: removeIndex,
        });
        //console.log('rewardAmount ==> ', rewardAmount);
        // res.send(result);
        return;
      });
    }
  );
};

//delete DB
const xodiUnstakeDB = (id, removeIndex, res) => {
  console.log("id ==> ", id);
  console.log("removeIndex ==> ", removeIndex);

  brcStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      //console.log('findedInfo[0].stakingArr.splice =============>')
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex * 1 + 1);
        }
      }

      findedInfo[0].save((err, result) => {
        res.send(true);
        return;
      });
    }
  );
};

const bordUnstakeDB = (id, removeIndex, res) => {
  odiStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      //console.log('findedInfo[0].stakingArr.splice =============>')
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex * 1 + 1);
        }
      }

      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send(true);
        return;
      });
    }
  );
};

const cbrcUnstakeDB = (id, removeIndex, res) => {
  aStaking.find(
    {
      owner: id,
    },
    (err, findedInfo) => {
      if (findedInfo.length == 0) {
        res.status(500).send({ message: "Not Found Brc Staking History" });
        return;
      }

      //console.log('findedInfo[0].stakingArr.splice =============>')
      if (removeIndex > -1) {
        if (removeIndex == findedInfo[0].stakingArr.length - 1) {
          findedInfo[0].stakingArr = [];
        } else {
          findedInfo[0].stakingArr.splice(0, removeIndex * 1 + 1);
        }
      }

      findedInfo[0].save((err, result) => {
        //console.log('************************** removeIndex ==> ', removeIndex);
        res.send(true);
        return;
      });
    }
  );
};

// Others
const calcReward = (price, stakingAmount, claimDate) => {
  console.log("calcReward price ==> ", price);
  console.log("calcReward stakingAmount ==> ", stakingAmount);
  console.log("calcReward claimDate ==> ", claimDate);

  const period = Math.floor((new Date() - claimDate) / 1000 / 3600 / 24);
  //console.log('period ==> ', period);
  if (period < 30) {
    //console.log('calcReward is ended ==> ');
    return 0;
  } else {
    console.log(
      "calcReward is ended ==> ",
      APR * (stakingAmount * price * period)
    );
    return APR * (stakingAmount * price * period);
  }

  // return 10 * stakingAmount * price;
  // return APR * (price * (new Date() - claimDate))
};

const calcStakingAmount = (stakingAmount, claimDate) => {
  console.log("calcReward stakingAmount ==> ", stakingAmount);
  console.log("calcReward claimDate ==> ", claimDate);

  const period = Math.floor((new Date() - claimDate) / 1000 / 3600 / 24);
  //console.log('period ==> ', period);
  if (period < 30) {
    //console.log('calcReward is ended ==> ');
    return 0;
  } else {
    console.log("calcStakingAmount is ended ==> ", stakingAmount);
    return stakingAmount;
  }

  // return 10 * stakingAmount * price;
  // return APR * (price * (new Date() - claimDate))
};

const calcRewardAtUnstaking = (price, stakingAmount, claimDate, lockTime) => {
  const period = Math.floor((new Date() - claimDate) / 1000 / 3600 / 24);
  //console.log('period ==> ', period);
  if (period < lockTime) {
    //console.log('calcReward is ended ==> ');
    return 0;
  } else {
    //console.log('calcReward is ended ==> ');
    return calcReward(price, stakingAmount, claimDate);
  }
};

// sendInscription
// const httpGet = async (route, params) => {
//   let url = OPENAPI_URL + route;
//   let c = 0;
//   for (const id in params) {
//       if (c == 0) {
//           url += '?';
//       } else {
//           url += '&';
//       }
//       url += `${id}=${params[id]}`;
//       c++;
//   }
//   const res = await fetch(new Request(url), {
//       method: 'GET', headers: {
//           'X-Client': 'UniSat Wallet',
//           'x-address': wallet.address,
//           'x-udid': randomstring.generate(12)
//       }, mode: 'cors', cache: 'default'
//   });
//   const data = await res.json();
//   return data;
// };

const httpGet = async (route, params) => {
  let url = OPENAPI_URL + route;
  let queryParams = new URLSearchParams(params).toString();

  // Construct the full URL with query parameters
  if (queryParams) {
    url += `?${queryParams}`;
  }

  // Make the axios request instead of using fetch

  console.log("httpGet url ==> ", url);
  console.log("wallet.address ==> ", wallet.address);
  const response = await axios.get(url, {
    headers: {
      "X-Client": "UniSat Wallet",
      "x-address": wallet.address,
      "x-udid": randomstring.generate(12),
    },
  });

  // console.log("response.data ==> ", response.data);

  return response.data;
};

const getInscriptionUtxo = async (inscriptionId) => {
  const data = await httpGet("/inscription/utxo", {
    inscriptionId,
  });
  if (data.status == "0") {
    throw new Error(data.message);
  }
  return data.result;
};

const getAddressUtxo = async (address) => {
  const data = await httpGet("/address/btc-utxo", {
    address,
  });
  if (data.status == "0") {
    throw new Error(data.message);
  }
  return data.result;
};

const inscribeCbrc20 = (protocol, data, feeRate, destination) => {
  const TEMP_PATH = ".";
  let cborDataPath = null;

  if (data) {
    cborDataPath = `${TEMP_PATH}/cbor.data`;
    fs.writeFileSync(cborDataPath, cbor.encode(data));
  }

  // const execOut = execSync(`ord ${chain} wallet inscribe
  //   --metaprotocol=${protocol} ${cborDataPath ? `
  //   --cbor-metadata ${cborDataPath}`: ''}
  //   --file ${filePath}
  //   --fee-rate ${feeRate}
  //   --destination ${destination}
  // `)
  console.log(" Before exec ");
  const execOut = execSync(
    `ord wallet inscribe --fee-rate 10 --metaprotocol=cbrc-20:mint:PLAY=500 --destination ${destination}`
  );
  console.log(" After exec ");
  return execOut.toString();
};

//Deep Lake
// exports.createEscrow = async (req, res) => {
//   const where = qs.stringify({where: { id: 153 }});
//   const headers = { Authorization: escrowConfig.MY_COMPANY_API_KEY };
//   const data = {
//       where: {},
//       data: {
//           fee: 200,
//           staker: {
//               utxo: {
//                   id: "a3aa1695406de8a5da6fee7d5ccd805309ea51798a54f29105912ed558070f8e",
//                   sequence: 0,
//               },
//               ordinal: {
//                   value: "tb1pfmh8ar4qjdh2u05unla32yz2wjemm6cuwj6c2ygr2hlp4mc8v6mqfp3txe",
//                   publicKey: "029ee2b39b587674c3d7376af25f95ef0d0587fd2fef2153153ccb38e55091729a",
//               },
//               cardinal: {
//                   value: "tb1qyxahwezu7en8xxhel2emeae665wm9nm2ttqgs3",
//                   publicKey: "03239fe99f2db4312227ebd585cd45b38e6468739b6480818e118a93c0b6a0bbe7",
//               },
//           },
//           product: {id: 14},
//           expiry: "2024-09-21 18:25:29.812238",
//       },
//   };

//   const reply = await axios.post(
//   `${escrowConfig.DEEP_LAKE_REST_API_URL}/flows/execute`,
//   data,
//   { headers }
//   );

//   return reply.data;
// }
