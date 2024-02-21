const mongoose = require("mongoose");

const User = mongoose.model(
  "User",
  new mongoose.Schema({
    wallet: {
      type: String,
      require: true
    }
  })
);

module.exports = User;
