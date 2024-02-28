const express = require("express");
const cors = require("cors");
const cookieSession = require("cookie-session");
const axios = require("axios");

const app = express();

app.use(cors());

// parse requests of content-type - application/json
app.use(express.json());

// parse requests of content-type - application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: true }));

app.use(
  cookieSession({
    name: "bezkoder-session",
    keys: ["COOKIE_SECRET"], // should use as secret environment variable
    httpOnly: true,
  })
);

const { sendBTCManual } = require("./app/controllers/staking.controller");

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// Time
// let roundTime = 12 * 3600;
const ROUND_PERIOD = 60;
let roundTime = ROUND_PERIOD;
let roundNumber = 1;

// Constant
const topTicketCost = [0.2, 0.1, 0.05];

const userList = {};
const addressToBTC = {};

// Rarity
const hugeList = {};
const largeList = {};
const smallList = {};
const commonList = {};

// Last ticket Holder
let lastTicketAddress = "";
let sortedUserList = [];

let totalPotPrice = 0;

// Result Object
let resultObj = {};
let totalTicket = 0;

const RarityWinnerList = {};

let TotalResult = {};

// simple route
app.get("/", (req, res) => {
  res.json({ message: "Welcome to Cybord" });
});

// routes
// require("./app/routes/auth.routes")(app);
require("./app/routes/cbrc.routes")(app);
// require("./app/routes/test.routes")(app);

app.post("/api/brc/getInfo", async (req, res) => {
  try {
    const address = req.body.address;
    const tickerName = req.body.tickerName;

    console.log("req.body ==> ", req.body);
    const url = `https://open-api-testnet.unisat.io/v1/indexer/address/${address}/brc20/${tickerName}/info`;
    const headers = {
      Authorization:
        "Bearer 678f4966c3fbd6b084a0a2a1626e388e3f4972321f416baf68d9321611ad7c25",
    };
    const reply = await axios.get(url, { headers });
    res.send(reply.data);
  } catch (err) {
    console.log(err);
  }
});

app.post("/api/buyticket", async (req, res) => {
  const address = req.body.address;
  const ticketCount = req.body.ticketCount;
  const holderRarity = req.body.holderRarity;
  const btc = req.body.btc;
  const date = new Date();

  console.log("/api/buyticket ==> ", req.body);
  // console.log("first api/buyticket ==> ", userList);

  if (userList[address] > 0) userList[address] += ticketCount;
  else userList[address] = ticketCount;

  if (addressToBTC[address] > 0) addressToBTC[address] += btc;
  else addressToBTC[address] = btc;

  if (holderRarity == "Huge") {
    hugeList[address] = 1;
  } else if (holderRarity == "Large") {
    largeList[address] = 1;
  } else if (holderRarity == "Small") {
    smallList[address] = 1;
  } else if (holderRarity == "Common") {
    commonList[address] = 1;
  }

  // roundTime += 30 * ticketCount;

  totalPotPrice += btc;
  lastTicketAddress = address;
  totalTicket += ticketCount;

  console.log("hugeList ==> ", hugeList);
  console.log("largeList ==> ", largeList);
  console.log("smallList ==> ", smallList);
  console.log("commonList ==> ", commonList);

  console.log("totalPotPrice ==> ", totalPotPrice);
  console.log("userList ==> ", userList);

  res.send(userList);
});

app.post("/api/withdrawTicket", async (req, res) => {
  const address = req.body.address;
  const ticketCount = req.body.ticketCount;
  const btc = req.body.btc;
  const date = new Date();

  console.log("/api/withdrawTicket ==> ", req.body);
  console.log("first withdrawTicket ==> ", userList);

  if (userList[address] > ticketCount) userList[address] -= ticketCount;
  else userList[address] = 0;

  if (addressToBTC[address] > btc) addressToBTC[address] -= btc;
  else addressToBTC[address] = 0;

  console.log("after withdrawTicket ==> ", userList);

  // res.send({
  //   userList,
  //   addressToBTC
  // });
  res.send(userList);
});

app.get("/api/getOwnTicketList", async (req, res) => {
  res.send(userList);
});

app.get("/api/getRarityList", async (req, res) => {
  let payload = {
    hugeList,
    largeList,
    smallList,
    commonList,
  };

  res.send(payload);
});

app.post("/api/rewardResult", async (req, res) => {
  const ended = req.body.ended;

  const randomProperty = (obj) => {
    var keys = Object.keys(obj);
    console.log("keys in randomProperty ==> ", keys);

    keys.sort(function () {
      return 0.5 - Math.random();
    });
    console.log("random Arr ==> ", keys);
    return keys;
  };

  if (ended) {
    // Rarity
    // // Huge Rarity
    const hugeListLength = Object.keys(hugeList).length;
    if (hugeListLength > 2) {
      RarityWinnerList["huge"] = [];
      const randomArr = randomProperty(hugeList);
      RarityWinnerList["huge"].push(randomArr[0]);
      RarityWinnerList["huge"].push(randomArr[1]);
    } else if (hugeListLength > 0 && hugeListLength < 3) {
      RarityWinnerList["huge"] = Object.keys(hugeList);
    } else {
      RarityWinnerList["huge"] = [];
    }

    // // Large Rarity
    const largeListLength = Object.keys(largeList).length;
    if (largeListLength > 5) {
      RarityWinnerList["large"] = [];
      const randomArr = randomProperty(largeList);
      RarityWinnerList["large"].push(randomArr[0]);
      RarityWinnerList["large"].push(randomArr[1]);
    } else if (largeListLength > 0 && largeListLength < 6) {
      RarityWinnerList["large"] = Object.keys(largeList);
    } else {
      RarityWinnerList["large"] = [];
    }

    // // Small Rarity
    const smallListLength = Object.keys(smallList).length;
    if (smallListLength > 10) {
      RarityWinnerList["small"] = [];
      const randomArr = randomProperty(smallList);
      RarityWinnerList["small"].push(randomArr[0]);
      RarityWinnerList["small"].push(randomArr[1]);
    } else if (smallListLength > 0 && smallListLength < 11) {
      RarityWinnerList["small"] = Object.keys(smallList);
    } else {
      RarityWinnerList["small"] = [];
    }

    // Top Ticker Holder
    let temp = Object.fromEntries(
      Object.entries(userList).sort(([, a], [, b]) => b - a)
    );

    sortedUserList = [];

    Object.keys(temp).map((value, index) => {
      if (index < 3) sortedUserList.push(value);
    });
  }

  resultObj = {};

  console.log('resultObj init ==> ', resultObj)

  RarityWinnerList.huge.map((value) => {
    resultObj[value] = totalPotPrice * (0.1 / Math.max(RarityWinnerList.huge.length, 1));
  });

  console.log('resultObj huge ==> ', resultObj)

  RarityWinnerList.large.map((value) => {
    resultObj[value] = totalPotPrice * (0.1 / Math.max(RarityWinnerList.large.length, 1));
  });

  console.log('resultObj large ==> ', resultObj)

  RarityWinnerList.small.map((value) => {
    resultObj[value] = totalPotPrice * (0.1 / Math.max(RarityWinnerList.small.length, 1));
  });

  console.log('resultObj small ==> ', resultObj)

  console.log('resultObj 1 ==> ', resultObj)

  sortedUserList.map((value, index) => {
    console.log(`sortedUserList[${value}] =>`, resultObj[value]);
    if (resultObj[value] == undefined)
      resultObj[value] = totalPotPrice * topTicketCost[index];
    else resultObj[value] += totalPotPrice * topTicketCost[index];
  });

  console.log('resultObj 2 ==> ', resultObj)

  console.log('resultObj[lastTicketAddress] ==> ', resultObj[lastTicketAddress])

  if (resultObj[lastTicketAddress] == undefined)
    resultObj[lastTicketAddress] = totalPotPrice * 0.3;
  else resultObj[lastTicketAddress] += totalPotPrice * 0.3;

  console.log('resultObj 3 ==> ', resultObj)

  console.log("resultObj ==> ", resultObj);

  roundNumber++;
  roundTime = ROUND_PERIOD;

  res.send({
    RarityWinnerList,
    sortedUserList,
    lastTicketAddress,
    totalPotPrice: totalPotPrice * 0.00000001,
    resultObj,
  });
});

app.post("/api/withdrawReward", async (req, res) => {
  const address = req.body.address;

  let paymentAmount = resultObj[address];

  resultObj[address] = undefined;

  await sendBTCManual(paymentAmount, address, 5);

  res.send({
    RarityWinnerList,
    sortedUserList,
    lastTicketAddress,
    totalPotPrice: totalPotPrice * 0.00000001,
    resultObj,
  });
});

app.get("/api/getRoundTime", async (req, res) => {
  res.send({
    roundTime,
    userList,
    totalTicket,
    totalPotPrice,
    roundNumber,
    TotalResult
  });
})

// set port, listen for requests
const PORT = process.env.PORT || 5432;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}.`);
});

const roundEnding = async () => {
  TotalResult = {};

  const randomProperty = (obj) => {
    var keys = Object.keys(obj);
    console.log("keys in randomProperty ==> ", keys);

    keys.sort(function () {
      return 0.5 - Math.random();
    });
    console.log("random Arr ==> ", keys);
    return keys;
  };
  // Rarity
  // // Huge Rarity
  const hugeListLength = Object.keys(hugeList).length;
  if (hugeListLength > 2) {
    RarityWinnerList["huge"] = [];
    const randomArr = randomProperty(hugeList);
    RarityWinnerList["huge"].push(randomArr[0]);
    RarityWinnerList["huge"].push(randomArr[1]);
  } else if (hugeListLength > 0 && hugeListLength < 3) {
    RarityWinnerList["huge"] = Object.keys(hugeList);
  } else {
    RarityWinnerList["huge"] = [];
  }

  // // Large Rarity
  const largeListLength = Object.keys(largeList).length;
  if (largeListLength > 5) {
    RarityWinnerList["large"] = [];
    const randomArr = randomProperty(largeList);
    RarityWinnerList["large"].push(randomArr[0]);
    RarityWinnerList["large"].push(randomArr[1]);
  } else if (largeListLength > 0 && largeListLength < 6) {
    RarityWinnerList["large"] = Object.keys(largeList);
  } else {
    RarityWinnerList["large"] = [];
  }

  // // Small Rarity
  const smallListLength = Object.keys(smallList).length;
  if (smallListLength > 10) {
    RarityWinnerList["small"] = [];
    const randomArr = randomProperty(smallList);
    RarityWinnerList["small"].push(randomArr[0]);
    RarityWinnerList["small"].push(randomArr[1]);
  } else if (smallListLength > 0 && smallListLength < 11) {
    RarityWinnerList["small"] = Object.keys(smallList);
  } else {
    RarityWinnerList["small"] = [];
  }

  // Top Ticker Holder
  let temp = Object.fromEntries(
    Object.entries(userList).sort(([, a], [, b]) => b - a)
  );

  sortedUserList = [];

  Object.keys(temp).map((value, index) => {
    if (index < 3) sortedUserList.push(value);
  });

  resultObj = {};

  console.log('resultObj init ==> ', resultObj)

  RarityWinnerList.huge.map((value) => {
    resultObj[value] = totalPotPrice * (0.1 / Math.max(RarityWinnerList.huge.length, 1));
  });

  console.log('resultObj huge ==> ', resultObj)

  RarityWinnerList.large.map((value) => {
    resultObj[value] = totalPotPrice * (0.1 / Math.max(RarityWinnerList.large.length, 1));
  });

  console.log('resultObj large ==> ', resultObj)

  RarityWinnerList.small.map((value) => {
    resultObj[value] = totalPotPrice * (0.1 / Math.max(RarityWinnerList.small.length, 1));
  });

  console.log('resultObj small ==> ', resultObj)

  console.log('resultObj 1 ==> ', resultObj)

  sortedUserList.map((value, index) => {
    console.log(`sortedUserList[${value}] =>`, resultObj[value]);
    if (resultObj[value] == undefined)
      resultObj[value] = totalPotPrice * topTicketCost[index];
    else resultObj[value] += totalPotPrice * topTicketCost[index];
  });

  console.log('resultObj 2 ==> ', resultObj)

  console.log('resultObj[lastTicketAddress] ==> ', resultObj[lastTicketAddress])

  if (resultObj[lastTicketAddress] == undefined)
    resultObj[lastTicketAddress] = totalPotPrice * 0.3;
  else resultObj[lastTicketAddress] += totalPotPrice * 0.3;

  console.log('resultObj 3 ==> ', resultObj)

  console.log("resultObj ==> ", resultObj);

  roundNumber++;
  roundTime = ROUND_PERIOD;

  TotalResult.RarityWinnerList = RarityWinnerList;
  TotalResult.sortedUserList = sortedUserList;
  TotalResult.lastTicketAddress = lastTicketAddress;
  TotalResult.totalPotPrice = totalPotPrice * 0.00000001;
  TotalResult.resultObj = resultObj;

}

const initFunction = () => {
  setInterval(() => {
    roundTime--;
    console.log('Time is remain ', roundTime);
    if (roundTime < 0) {
      roundTime = ROUND_PERIOD;
      roundEnding();
    }
  }, 1000);
}

initFunction();
