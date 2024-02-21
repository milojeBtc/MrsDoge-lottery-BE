const mongoose = require('mongoose');
mongoose.Promise = global.Promise;

const db = {};

db.mongoose = mongoose;

db.user = require("./user.model");
db.brcStaking = require("./brcStaking.model");
db.odiStaking = require("./odiStaking.model");
db.xodiStaking = require("./xodiStaking.model");
db.aStaking = require("./aStaking.model");
db.bordStaking = require("./bordStaking.model");
db.cbrcStaking = require("./cbrcStaking.model");

module.exports = db;