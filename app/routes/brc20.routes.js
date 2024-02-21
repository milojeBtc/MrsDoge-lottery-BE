const { authJwt } = require("../middlewares");
const controller = require("../controllers/staking.controller");

module.exports = function(app) {

  app.post("/api/brc/mint", controller.staking);

};
