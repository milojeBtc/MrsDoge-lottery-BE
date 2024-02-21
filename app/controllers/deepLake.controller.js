const axios = require("axios");
const escrowConfig = require("../config/escrow.config");
const qs = require("qs");


//Deep Lake

/**
 * @description: Create Escrow for staking.
 * @param {utxo, ordValue, ordAddress, carValue, carPublicKey} req 
 * @param {*} res 
 */
exports.createEscrow = async (req, res) => {
  try {
    const headers = { Authorization: escrowConfig.MY_COMPANY_API_KEY };

    let tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const data = {
        where: {},
        data: {
            fee: 200,
            staker: {
                utxo: {
                    // id: "a3aa1695406de8a5da6fee7d5ccd805309ea51798a54f29105912ed558070f8e",
                    id: req.body.utxo,
                    sequence: 0,
                },
                ordinal: {
                    // value: "tb1pfmh8ar4qjdh2u05unla32yz2wjemm6cuwj6c2ygr2hlp4mc8v6mqfp3txe",
                    // publicKey: "029ee2b39b587674c3d7376af25f95ef0d0587fd2fef2153153ccb38e55091729a",
                    value: req.body.ordValue,
                    publicKey: req.body.ordPublicKey,
                },
                cardinal: {
                    value: req.body.carValue,
                    publicKey: req.body.carPublicKey,
                },
            },
            product: {id: 14},
            // expiry: (new Date()) + 1000 * 3600 * 1,
            expiry: tomorrow
        },
    };

    const url = `${escrowConfig.DEEP_LAKE_REST_API_URL}/flows/execute`;

    console.log("url ==> ", url);
    console.log("headers ==> ", headers);

    const reply = await axios.post(
      url,
      data,
      { headers }
    );

    res.send(reply.data);
  } catch (error) {
    res.status(401).send(error);
  }
  
}

/**
 * @description: Broadcast the sign to the network.
 * @param {folwId, transHex} req 
 * @param {*} res 
 */
exports.signAndBroadcast = async (req, res) => {
  const qs = require("qs");
  const headers = { Authorization: MY_COMPANY_API_KEY };
  const data = {
    state: "broadcast-stake",
    transactions: [{
      hex:req.body.transHex
    }],
    product: {
      id: 14,
    },
  };
  const where = qs.stringify({ where: { id: req.body.flowId } });
  const response = await axios.post(
    `${DEEP_LAKE_REST_API_URL}/flows/execute?${where}`,
    data,
    { headers }
  );

  const resJson = response.json();

  res.send(resJson);
}

/**
 * @description: Get the UtxoId by InscriptionId
 * @param {inscribeId} req 
 * @param {*} res 
 */

exports.getUtxoByInscriptionId = async (req, res) => {
  console.log('getUtxoByInscriptionId is called!! ====>>>');
  console.log('req.params.inscribeId!! ====>>>', req.body.inscriptionId);
  const response = await axios.get(
    `https://api-testnet.unisat.io/wallet-v4/inscription/utxo?inscriptionId=${req.body.inscriptionId}`,
  );

  res.send(response.data);
}

/**
 * @description: Unlock the escrow.
 * @param {flowId} req 
 * @param {*} res 
 */
exports.unlock = async (req, res) => {
  const headers = { Authorization: escrowConfig.MY_COMPANY_API_KEY };
  const data = {
    state: "unstake",
    fee: 200,
    index: 0,
    product: {id: 14},
  };

  const where = qs.stringify({ where: { id: req.body.flowId } });

  const reply = await axios.post(
    `${escrowConfig.DEEP_LAKE_REST_API_URL}/flows/execute?${where}`,
    data,
    { headers }
  );

  console.log("Unlock Result ===>", reply.data);

  res.send(reply.data);
}

/**
 * @description: Broadcast the sign to the network.
 * @param {transHex, folwId} req 
 * @param {*} res 
 */
exports.unlockBroadcasting = async (req, res) => {
  const headers = { Authorization: MY_COMPANY_API_KEY };
  const data = {
    state: "broadcast-unstake",
    transactions: [{
      hex:req.body.transHex
    }],
    product: {
      id: 14,
    },
  };
  const where = qs.stringify({ where: { id: req.body.flowId } });

  const response = await axios.post(
    `${DEEP_LAKE_REST_API_URL}/flows/execute?${where}`,
    data,
    { headers }
  );

  console.log("UnlockSignBroadcasting ==> ", response);
}