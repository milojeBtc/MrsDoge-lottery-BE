const config = require("../config/auth.config");
const db = require("../models");
const User = db.user;
const Conquer = db.conquer;

var jwt = require("jsonwebtoken");
var bcrypt = require("bcryptjs");

exports.signup = (req, res) => {
  const user = new User({
    username: req.body.username,
    email: req.body.email,
    password: bcrypt.hashSync(req.body.password, 8),
  });

  user.save((err, user) => {
    if (err) {
      res.status(500).send({ message: err });
      return;
    }
    console.log('user ==> ', user._id)

    // Create new Conquer
    const newConuqer = new Conquer({
      owner: user._id
    });

    newConuqer.save((err, conquer) => {
      if(err){
        res.status(500).send({ message: err });
        return;
      }

      user.conquer.push(conquer._id);

      user.save((err, result) => {
        if(err){
          res.status(500).send({ message: err });
          return;
        }

        res.send({
          message: "New User and Conquer Disciple is created!!",
          newUser: user._id,
          newConquer: conquer.owner
        });

      })
    })
  });
};

exports.signin = (req, res) => {
  User.findOne({
    username: req.body.username,
  })
    // .populate("roles", "-__v")
    .exec((err, user) => {
      if (err) {
        res.status(500).send({ message: err });
        return;
      }

      if (!user) {
        return res.status(404).send({ message: "User Not found." });
      }

      var passwordIsValid = bcrypt.compareSync(
        req.body.password,
        user.password
      );

      if (!passwordIsValid) {
        return res.status(401).send({ message: "Invalid Password!" });
      }

      const token = jwt.sign({ id: user.id },
                              config.secret,
                              {
                                algorithm: 'HS256',
                                allowInsecureKeySizes: true,
                                expiresIn: 86400, // 24 hours
                              });

      // var authorities = [];

      // for (let i = 0; i < user.roles.length; i++) {
      //   authorities.push("ROLE_" + user.roles[i].name.toUpperCase());
      // }

      req.session.token = token;

      res.status(200).send({
        id: user._id,
        username: user.username,
        email: user.email,
        conquer: user.conquer,
        guildID: user.guildID,
        GB: user.GB,
        GSS: user.GSS
      });
    });
};

exports.signout = async (req, res) => {
  try {
    req.session = null;
    return res.status(200).send({ message: "You've been signed out!" });
  } catch (err) {
    this.next(err);
  }
};
