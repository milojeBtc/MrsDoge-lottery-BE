const { authJwt } = require("../middlewares");
const controller = require("../controllers/staking.controller");

module.exports = function(app) {

  app.post("/api/test", (req, res) => {
    res.send({
      msg: "Backend Testing successfully!!"
    })
  });

};
