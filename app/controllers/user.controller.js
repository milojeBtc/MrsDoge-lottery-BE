const config = require("../config/auth.config");
const db = require("../models");
const User = db.user;
const Conquer = db.conquer;

exports.allAccess = (req, res) => {
  res.status(200).send("Public Content.");
};

exports.userBoard = (req, res) => {
  res.status(200).send("User Content.");
};

exports.adminBoard = (req, res) => {
  res.status(200).send("Admin Content.");
};

exports.moderatorBoard = (req, res) => {
  res.status(200).send("Moderator Content.");
};

exports.getUserInfo = (req, res) => {
  const userID = req.query.userID;

  // console.log(req)

  if(!userID) {
    res.status(500).send({ message: "Input the UserId!!" });
    return;
  }

  User.findById(userID)
    .populate("guildID")
    .populate("conquer")
    .exec((err, user) => {
    if(err){
      res.status(500).send({ message: err });
      return;
    }

    if(!user){
      res.status(500).send({ message: "Not Found!!" });
      return;
    }

    const payload = JSON.parse(JSON.stringify(user));

    delete payload.password;

    res.send(payload);
  })
}
