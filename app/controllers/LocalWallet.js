// import * as bitcoin from "bitcoinjs-lib";
// import { validator } from "@unisat/ord-utils/lib/OrdTransaction.js";
// import { isTaprootInput } from "bitcoinjs-lib/src/psbt/bip371.js";
// import ecc from "@bitcoinerlab/secp256k1";
// import { ECPairFactory } from "ecpair";

const bitcoin = require("bitcoinjs-lib");
const validator = require("@unisat/ord-utils/lib/OrdTransaction.js").validator;
const isTaprootInput = require("bitcoinjs-lib/src/psbt/bip371.js").isTaprootInput;
const ecc = require("@bitcoinerlab/secp256k1");
const ECPairFactory = require("ecpair").ECPairFactory;

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

function publicKeyToPayment(
    publicKey,
    type,
    networkType
) {
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

function publicKeyToAddress(
    publicKey,
    type,
    networkType
) {
    const payment = publicKeyToPayment(publicKey, type, networkType);
    if (payment && payment.address) {
        return payment.address;
    } else {
        return "";
    }
}

function publicKeyToScriptPk(
    publicKey,
    type,
    networkType
) {
    const payment = publicKeyToPayment(publicKey, type, networkType);
    return payment.output.toString("hex");
}

function randomWIF(networkType = 1) {
    const network = toPsbtNetwork(networkType);
    const keyPair = ECPair.makeRandom({ network });
    return keyPair.toWIF();
}

export class LocalWallet {
    keyPair;
    address;
    pubkey;
    network;
    constructor(
        wif,
        networkType = 1,
        addressType = 2
    ) {
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